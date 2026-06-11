/// Dual-endpoint resolver for split-campus networks.
///
/// Problem: Campus routers commonly block NAT hairpin — a request from inside
/// the LAN that leaves via the public IP and tries to re-enter the same
/// router.  The result: off-campus students reach the server fine via the
/// public IP, but on-campus students cannot.
///
/// Solution: compile *two* candidate base-URLs into the app:
///   - `server_url`     → public IP / domain  (works off-campus)
///   - `server_url_lan` → private LAN IP      (works on-campus)
///
/// On every flush attempt (every ~120 s) `EndpointResolver::resolve()` races a
/// `/health` check against all non-empty candidates and returns the first
/// URL that responds.  The winner is cached for `CACHE_TTL` so normal usage
/// doesn't hammer the health endpoint.  The cache is invalidated automatically
/// after TTL expires, so a student who goes home re-discovers the public URL
/// within a couple of minutes.

use std::sync::Mutex;
use std::time::{Duration, Instant};

const PROBE_TIMEOUT: Duration = Duration::from_secs(3);
const CACHE_TTL:     Duration = Duration::from_secs(300); // 5 minutes

struct Cached {
    url:        String,
    fetched_at: Instant,
}

pub struct EndpointResolver {
    /// Ordered list of base-URLs to try.  LAN URL first so on-campus students
    /// get the lower-latency path.
    candidates: Vec<String>,
    cache:      Mutex<Option<Cached>>,
}

impl EndpointResolver {
    /// Build a resolver from an ordered list of base-URLs.
    /// Empty strings and duplicates are silently dropped.
    pub fn new(candidates: Vec<String>) -> Self {
        let candidates: Vec<String> = {
            let mut seen = std::collections::HashSet::new();
            candidates
                .into_iter()
                .filter(|s| !s.is_empty() && seen.insert(s.clone()))
                .collect()
        };
        Self {
            candidates,
            cache: Mutex::new(None),
        }
    }

    /// Return the best reachable base-URL, or `None` if all candidates are
    /// unreachable (device is fully offline).
    ///
    /// Results are cached for `CACHE_TTL`.  A cached result is returned
    /// immediately without any network I/O until the TTL expires.
    pub async fn resolve(&self) -> Option<String> {
        // Fast path: return cached result if still fresh.
        {
            let guard = self.cache.lock().unwrap();
            if let Some(ref c) = *guard {
                if c.fetched_at.elapsed() < CACHE_TTL {
                    return Some(c.url.clone());
                }
            }
        }

        // Slow path: race all candidates.
        let winner = self.race_candidates().await;

        // Update cache (even on None — avoids hammering when fully offline,
        // but we only cache a successful result so we keep retrying on failure).
        if let Some(ref url) = winner {
            let mut guard = self.cache.lock().unwrap();
            *guard = Some(Cached {
                url:        url.clone(),
                fetched_at: Instant::now(),
            });
        }

        winner
    }

    /// Invalidate the cache (e.g. when a flush fails, force re-probe next time).
    pub fn invalidate(&self) {
        let mut guard = self.cache.lock().unwrap();
        *guard = None;
    }

    // ── Private ───────────────────────────────────────────────────────────────

    async fn race_candidates(&self) -> Option<String> {
        if self.candidates.is_empty() {
            return None;
        }

        // Build one future per candidate.  Each does a GET /health with a
        // short timeout and resolves to Some(base_url) or None.
        let client = match reqwest::Client::builder()
            .timeout(PROBE_TIMEOUT)
            // Don't verify self-signed certs on the LAN IP.
            .danger_accept_invalid_certs(true)
            .build()
        {
            Ok(c) => c,
            Err(_) => return None,
        };

        let futures: Vec<_> = self
            .candidates
            .iter()
            .map(|base| {
                let c   = client.clone();
                let url = format!("{}/health", base);
                let base = base.clone();
                async move {
                    match c.get(&url).send().await {
                        Ok(r) if r.status().as_u16() < 500 => Some(base),
                        _ => None,
                    }
                }
            })
            .collect();

        // `select_ok` returns the first future that resolves to `Ok`.
        // We map None→Err so unreachable candidates are skipped.
        use futures::future::select_ok;
        let mapped: Vec<_> = futures
            .into_iter()
            .map(|f| Box::pin(async move {
                f.await.ok_or(())
            }))
            .collect();

        select_ok(mapped).await.ok().map(|(url, _)| url)
    }
}
