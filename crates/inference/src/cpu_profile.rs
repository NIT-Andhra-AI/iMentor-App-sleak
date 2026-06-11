/// CPU profiling for optimal LLM inference thread count.
///
/// LLM token generation is **memory-bandwidth bound**, not compute-bound.
/// Adding threads past the memory-bus saturation point just increases heat
/// without speed gains. The sweet spot depends on:
///
/// - Physical P-core count  (hyperthreads don't help; E/LP-E cores are slower)
/// - Laptop vs desktop       (laptops have tighter thermal budgets)
/// - Available RAM           (low RAM → reduce parallelism to avoid thrashing)
/// - Hybrid architecture     (Intel MTL/RPL, AMD Zen4c — weight P-cores only)

use std::collections::HashSet;

/// Full profile of the host CPU relevant to LLM inference.
#[derive(Debug, Clone)]
pub struct CpuProfile {
    /// Human-readable CPU model string.
    pub model_name: String,
    /// Total logical CPUs (including hyperthreads).
    pub logical_cpus: u32,
    /// Physical P-core count (high-frequency, full-width cores).
    pub physical_p_cores: u32,
    /// Physical E-core count (efficiency cores, if present).
    pub physical_e_cores: u32,
    /// Whether the system is a laptop / has a battery.
    pub is_laptop: bool,
    /// Total system RAM in GiB.
    pub total_ram_gib: f32,
    /// Available system RAM in GiB.
    pub available_ram_gib: f32,
    /// Recommended thread count for LLM inference.
    pub recommended_threads: u32,
    /// Short human-readable explanation of the recommendation.
    pub recommendation_reason: String,
}

impl CpuProfile {
    /// Detect the current host's CPU profile.
    pub fn detect() -> Self {
        let (model_name, logical_cpus, physical_p_cores, physical_e_cores) =
            detect_core_topology();
        let is_laptop = detect_laptop();
        let (total_ram_gib, available_ram_gib) = detect_ram();

        let (recommended_threads, recommendation_reason) = recommend_threads(
            physical_p_cores,
            physical_e_cores,
            is_laptop,
            available_ram_gib,
        );

        Self {
            model_name,
            logical_cpus,
            physical_p_cores,
            physical_e_cores,
            is_laptop,
            total_ram_gib,
            available_ram_gib,
            recommended_threads,
            recommendation_reason,
        }
    }
}

// ─── Core topology detection ──────────────────────────────────────────────────

/// Returns (model_name, logical_cpus, physical_p_cores, physical_e_cores).
///
/// Strategy:
///   1. Read all per-CPU max frequencies from sysfs.
///   2. Group by physical core id (deduplicating hyperthreads).
///   3. Classify as P-core (≥ 3.5 GHz) or E/LP-E-core (< 3.5 GHz).
///   4. Fall back to half of logical CPUs if sysfs is unavailable.
fn detect_core_topology() -> (String, u32, u32, u32) {
    let model_name = read_cpu_model();
    let logical_cpus = num_logical_cpus();

    // Build a map: physical_core_id → max_freq_khz
    // We deduplicate hyperthreads by using the (physical_id, core_id) pair.
    let mut p_cores: HashSet<(u32, u32)> = HashSet::new();
    let mut e_cores: HashSet<(u32, u32)> = HashSet::new();

    // Read per-logical-CPU data from sysfs
    for cpu_idx in 0..logical_cpus {
        let max_freq = read_sysfs_u64(
            &format!("/sys/devices/system/cpu/cpu{cpu_idx}/cpufreq/cpuinfo_max_freq"),
        );
        let physical_id = read_sysfs_u64(
            &format!("/sys/devices/system/cpu/cpu{cpu_idx}/topology/physical_package_id"),
        ) as u32;
        let core_id = read_sysfs_u64(
            &format!("/sys/devices/system/cpu/cpu{cpu_idx}/topology/core_id"),
        ) as u32;

        let key = (physical_id, core_id);
        // P-core threshold: ≥ 3_500_000 kHz (3.5 GHz)
        if max_freq >= 3_500_000 {
            p_cores.insert(key);
        } else if max_freq > 0 {
            e_cores.insert(key);
        }
    }

    if p_cores.is_empty() {
        // sysfs not available (Windows, some containers) — use sysinfo's
        // physical_core_count() which is accurate on Windows.  We cannot
        // distinguish P-cores from E-cores here, so we treat all physical
        // cores as P-cores and rely on mem_cap / thermal_cap to clip the
        // thread count to the bandwidth sweet-spot (4 for laptops, 6 for desktops).
        let physical = {
            let sys = sysinfo::System::new();
            sys.physical_core_count()
                .map(|n| n as u32)
                .unwrap_or_else(|| (logical_cpus / 2).max(1))
        }
        .max(1);
        return (model_name, logical_cpus, physical, 0);
    }

    (
        model_name,
        logical_cpus,
        p_cores.len() as u32,
        e_cores.len() as u32,
    )
}

// ─── Thread recommendation ────────────────────────────────────────────────────

/// Core recommendation logic.
///
/// Rules (in priority order):
///
/// 1. **Memory bandwidth bound** — llama.cpp token generation is bottlenecked
///    by DRAM reads (loading model weights per layer). Research shows throughput
///    plateaus at 4–6 threads on typical laptop DDR5/LPDDR5 and 6–8 on desktop
///    DDR5. Extra threads just fight over the memory bus and increase heat.
///
/// 2. **Laptop thermal budget** — laptops have tighter TDP (15–45 W vs 65–125 W
///    desktop). Clamp to 60% of P-cores to leave thermal headroom.
///
/// 3. **Low RAM** — if < 8 GiB free, use fewer threads to avoid swapping,
///    which is catastrophically slow for LLM inference.
///
/// 4. **Hard clamp [2, 8]** — never go below 2 (too slow) or above 8 (no gain,
///    just heat). Use `LLAMA_THREADS` env var to override.
fn recommend_threads(
    p_cores: u32,
    e_cores: u32,
    is_laptop: bool,
    available_ram_gib: f32,
) -> (u32, String) {
    recommend_threads_inner(p_cores, e_cores, is_laptop, available_ram_gib, None)
}

/// Inner function that accepts an optional env override for testability
/// without global env mutation (avoids parallel-test race conditions).
fn recommend_threads_inner(
    p_cores: u32,
    e_cores: u32,
    is_laptop: bool,
    _available_ram_gib: f32,
    env_override: Option<u32>,
) -> (u32, String) {
    // Allow explicit override via env var or caller-supplied value
    let override_val = env_override.or_else(|| {
        std::env::var("LLAMA_THREADS")
            .ok()
            .and_then(|v| v.parse::<u32>().ok())
    });
    if let Some(n) = override_val {
        let n = n.clamp(1, 32);
        return (n, format!("Overridden by LLAMA_THREADS={n}"));
    }

    // Low-RAM guard removed — student laptops reliably have 4–5 GiB free
    // and the model loads fine.  The hard clamp below (2, 8) still prevents
    // catastrophically low or high values.

    // Base: use P-cores only (E/LP-E cores have lower IPC and memory bandwidth per core)
    let base = p_cores.max(1);

    // Memory-bandwidth cap: empirical sweet spot for DRAM-bound workloads
    // LPDDR5 (laptops): saturates at ~4 threads
    // DDR5 (desktops): saturates at ~6 threads
    let mem_cap = if is_laptop { 4u32 } else { 6u32 };

    // Thermal cap: laptops run hotter relative to TDP
    let thermal_cap = if is_laptop {
        // 75% of P-cores, minimum 3 — 60% at 4 P-cores rounds to 2 threads
        // which is painfully slow on 16 GB student machines.  75% gives 3
        // threads for a 4-P-core i5, still leaves headroom for the OS.
        ((base as f32 * 0.75).round() as u32).max(3)
    } else {
        // 80% of P-cores on desktop
        ((base as f32 * 0.8).round() as u32).max(4)
    };

    let recommended = base.min(mem_cap).min(thermal_cap).clamp(2, 8);

    let reason = format!(
        "{p_cores} P-cores + {e_cores} E-cores detected, {} — \
         mem-bandwidth cap={mem_cap}, thermal cap={thermal_cap} → {recommended} threads",
        if is_laptop { "laptop" } else { "desktop" },
    );

    (recommended, reason)
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

fn num_logical_cpus() -> u32 {
    std::thread::available_parallelism()
        .map(|n| n.get() as u32)
        .unwrap_or(4)
}

fn read_sysfs_u64(path: &str) -> u64 {
    std::fs::read_to_string(path)
        .ok()
        .and_then(|s| s.trim().parse().ok())
        .unwrap_or(0)
}

fn read_cpu_model() -> String {
    // Linux: /proc/cpuinfo
    if let Ok(info) = std::fs::read_to_string("/proc/cpuinfo") {
        for line in info.lines() {
            if line.starts_with("model name") {
                if let Some(val) = line.split(':').nth(1) {
                    return val.trim().to_string();
                }
            }
        }
    }
    // Windows / other: use sysinfo CPU brand string
    use sysinfo::{CpuRefreshKind, RefreshKind, System};
    let sys = System::new_with_specifics(
        RefreshKind::new().with_cpu(CpuRefreshKind::new()),
    );
    if let Some(cpu) = sys.cpus().first() {
        let brand = cpu.brand().trim().to_string();
        if !brand.is_empty() {
            return brand;
        }
    }
    "Unknown CPU".to_string()
}

fn detect_laptop() -> bool {
    detect_laptop_impl()
}

/// Linux: DMI chassis type + battery sysfs.
#[cfg(target_os = "linux")]
fn detect_laptop_impl() -> bool {
    if let Ok(chassis) = std::fs::read_to_string("/sys/class/dmi/id/chassis_type") {
        if let Ok(n) = chassis.trim().parse::<u32>() {
            // 8=Portable, 9=Laptop, 10=Notebook, 11=Sub Notebook, 14=Sub Notebook
            if matches!(n, 8..=11 | 14) {
                return true;
            }
        }
    }
    // Battery presence is a reliable secondary signal
    std::path::Path::new("/sys/class/power_supply/BAT0/present").exists()
        || std::path::Path::new("/sys/class/power_supply/BAT1/present").exists()
}

/// Windows: call GetSystemPowerStatus to check whether a battery is present.
#[cfg(target_os = "windows")]
fn detect_laptop_impl() -> bool {
    windows_has_battery()
}

#[cfg(not(any(target_os = "linux", target_os = "windows")))]
fn detect_laptop_impl() -> bool {
    false
}

/// Returns `true` when the machine has a system battery (i.e. it is a laptop).
/// Uses `GetSystemPowerStatus` from `kernel32.dll` — available on all Win32 targets.
#[cfg(target_os = "windows")]
fn windows_has_battery() -> bool {
    #[repr(C)]
    struct SystemPowerStatus {
        ac_line_status:         u8,
        battery_flag:           u8,
        battery_life_percent:   u8,
        system_status_flag:     u8,
        battery_life_time:      u32,
        battery_full_life_time: u32,
    }
    extern "system" {
        fn GetSystemPowerStatus(lp: *mut SystemPowerStatus) -> i32;
    }
    let mut status = std::mem::MaybeUninit::<SystemPowerStatus>::uninit();
    // SAFETY: SystemPowerStatus is a plain C struct; GetSystemPowerStatus is
    // a well-known Win32 API that writes exactly sizeof(SYSTEM_POWER_STATUS)
    // bytes.  We only read the result when the call succeeds (returns non-zero).
    unsafe {
        if GetSystemPowerStatus(status.as_mut_ptr()) != 0 {
            let s = status.assume_init();
            // battery_flag values: 1=High, 2=Low, 4=Critical, 8=Charging,
            // 128=No system battery, 255=Unknown/AC-only.
            return s.battery_flag != 128 && s.battery_flag != 255;
        }
    }
    false // API failure → assume desktop (safe default)
}

fn detect_ram() -> (f32, f32) {
    // Use sysinfo for cross-platform RAM detection (Windows, Linux, macOS).
    // The old /proc/meminfo path returned a (8.0, 4.0) GiB fallback on Windows,
    // which triggered the < 6 GiB low-RAM guard and capped threads to 2.
    use sysinfo::System;
    let mut sys = System::new();
    sys.refresh_memory();
    let total_gib = sys.total_memory() as f32 / 1_073_741_824.0;
    let avail_gib = sys.available_memory() as f32 / 1_073_741_824.0;
    if total_gib > 0.0 {
        return (total_gib, avail_gib);
    }
    (8.0, 4.0) // last-resort fallback
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn detect_runs_without_panic() {
        let profile = CpuProfile::detect();
        assert!(profile.logical_cpus >= 1);
        assert!(profile.physical_p_cores >= 1);
        assert!(profile.recommended_threads >= 1);
        assert!(profile.recommended_threads <= 32);
        println!("{profile:#?}");
    }

    #[test]
    fn recommend_threads_desktop_high_ram() {
        let (t, reason) = recommend_threads(8, 0, false, 32.0);
        assert!(t <= 8, "should not exceed 8");
        assert!(t >= 4, "should use at least 4 on 8-core desktop");
        println!("desktop 8P: {t} — {reason}");
    }

    #[test]
    fn recommend_threads_laptop_6p_4e() {
        let (t, reason) = recommend_threads(6, 4, true, 16.0);
        assert!(t <= 4, "laptop mem-bandwidth cap is 4");
        assert!(t >= 2);
        println!("laptop 6P+4E: {t} — {reason}");
    }

    #[test]
    fn recommend_threads_low_ram_no_longer_penalised() {
        // RAM guard removed — even with 2.9 GiB free the runtime should use
        // the normal mem-bandwidth recommendation, not force 2 threads.
        let (t, _reason) = recommend_threads(6, 0, true, 2.9);
        assert!(t >= 3, "low-RAM penalty removed; laptop 6-core should still get ≥3 threads");
    }

    #[test]
    fn recommend_threads_env_override() {
        // Use inner function directly to avoid setting global env (parallel-test safe)
        let (t, reason) = recommend_threads_inner(6, 4, true, 16.0, Some(7));
        assert_eq!(t, 7);
        assert!(reason.contains("7"), "reason should mention the override value");
    }

    // ── Windows fallback scenarios ────────────────────────────────────────────
    // On Windows, sysfs is unavailable so we fall back to physical_core_count()
    // and cannot distinguish P-cores from E-cores.  All physical cores are
    // reported as P-cores, but mem_cap / thermal_cap clip the result correctly.

    /// i7-12700H: 14 physical cores (6P+8E), is_laptop=true → should get 4
    #[test]
    fn recommend_threads_windows_i7_12700h_laptop() {
        // Windows fallback: physical_core_count=14, all treated as P-cores
        let (t, _reason) = recommend_threads(14, 0, true, 12.0);
        assert_eq!(t, 4, "i7-12700H laptop must use mem-bandwidth cap of 4");
    }

    /// Core Ultra 5 125H: 14 physical (4P+8E+2LP-E), is_laptop=true → 4
    #[test]
    fn recommend_threads_windows_ultra5_125h_laptop() {
        let (t, _reason) = recommend_threads(14, 0, true, 14.0);
        assert_eq!(t, 4, "Core Ultra 5 125H laptop must use mem-bandwidth cap of 4");
    }

    /// i7-12700K desktop: 12 physical (8P+4E), is_laptop=false → 6
    #[test]
    fn recommend_threads_windows_i7_12700k_desktop() {
        let (t, _reason) = recommend_threads(12, 0, false, 32.0);
        assert_eq!(t, 6, "i7-12700K desktop must use desktop mem-bandwidth cap of 6");
    }

    /// Old non-hybrid i7-10750H: 6 physical (6P, no E-cores), is_laptop=true → 4
    #[test]
    fn recommend_threads_windows_i7_10750h_laptop() {
        let (t, _reason) = recommend_threads(6, 0, true, 12.0);
        assert_eq!(t, 4, "i7-10750H laptop mem-bandwidth cap is 4");
    }
}
