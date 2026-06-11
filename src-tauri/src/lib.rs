mod build_config;
mod commands;
mod license;
mod runtime_tuning;
mod setup;
mod state;

use std::sync::atomic::Ordering;
use tauri::Manager;
use state::AppState;

/// Interval between background telemetry flush attempts.
const FLUSH_INTERVAL_SECS: u64 = 120;

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .setup(|app| {
            let app_data_dir = app
                .path()
                .app_data_dir()
                .expect("failed to get app data dir");
            std::fs::create_dir_all(&app_data_dir).ok();

            // ── Expiry / self-delete check ────────────────────────────────
            if build_config::should_self_delete() {
                tracing::warn!("Deployment expired and grace period over — wiping user data");
                setup::wipe_user_data(&app_data_dir);
                std::process::exit(0);
            }

            let state = setup::initialize(app_data_dir)
                .expect("failed to initialize app state");

            // ── Activity-based license check (after state is ready) ───────
            {
                let lm = state.license_manager.blocking_lock();
                if lm.is_expired() {
                    let reason = lm.expiry_reason().unwrap_or_default();
                    drop(lm);
                    license::trigger_uninstall_and_exit(&reason);
                }
            }

            app.manage(state);

            // ── Background telemetry flush task ───────────────────────────
            // Runs every FLUSH_INTERVAL_SECS. Only sends when:
            //   1. User has consented (telemetry_enabled == true on sender)
            //   2. App is not actively running inference
            //   3. Internet is reachable (checked inside queue.flush())
            let app_handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                let mut interval = tokio::time::interval(
                    std::time::Duration::from_secs(FLUSH_INTERVAL_SECS)
                );
                interval.tick().await; // skip the immediate first tick

                loop {
                    interval.tick().await;

                    let state = app_handle.state::<AppState>();

                    // Guard: only flush when enabled and not inferring.
                    if !state.telemetry.is_enabled() {
                        continue;
                    }
                    if state.is_inferring.load(Ordering::SeqCst) {
                        tracing::debug!("Telemetry flush skipped — inference in progress");
                        continue;
                    }

                    let pending = state.telemetry_queue.pending_count().await;
                    if pending == 0 {
                        continue;
                    }

                    // Resolve best reachable endpoint (LAN IP on campus,
                    // public IP off-campus).  Invalidate cache on send failure
                    // so the next tick re-probes.
                    let base_url = match state.endpoint_resolver.resolve().await {
                        Some(url) => url,
                        None => {
                            tracing::debug!("Telemetry flush skipped — no reachable endpoint");
                            continue;
                        }
                    };

                    // Point the sender at the winning URL before flushing.
                    state.telemetry.set_endpoint(&format!("{}/v1/sessions", base_url));

                    tracing::info!("Flushing {} pending telemetry session(s) via {}", pending, base_url);
                    state.telemetry_queue.flush(&state.telemetry).await;

                    // If queue drained → record a successful poll (resets inactivity clock).
                    if state.telemetry_queue.pending_count().await == 0 {
                        state.license_manager.lock().await.record_poll();
                    } else {
                        // Send failed — invalidate resolver cache so we re-probe next tick.
                        state.endpoint_resolver.invalidate();
                    }
                }
            });

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::agents::agent_message,
            commands::agents::list_agents,
            commands::agents::remove_agent,
            commands::agents::spawn_agent,
            commands::chat::cancel_generation,
            commands::chat::chat_stream,
            commands::chat::create_chat_session,
            commands::chat::delete_chat_session,
            commands::chat::get_session_messages,
            commands::chat::list_chat_sessions,
            commands::chat::rename_chat_session,
            commands::consent::accept_consent,
            commands::consent::decline_consent,
            commands::consent::get_consent_status,
            commands::consent::set_telemetry_enabled,
            commands::courses::get_course_manifest,
            commands::courses::get_wiki_page,
            commands::courses::list_wiki_pages,
            commands::courses::list_courses,
            commands::courses::remove_course,
            commands::courses::restore_course,
            commands::courses::fetch_image_cached,
            commands::course_updates::check_course_updates,
            commands::course_updates::download_course,
            commands::debug::open_devtools,
            commands::documents::delete_document,
            commands::documents::list_documents,
            commands::documents::toggle_doc_selection,
            commands::documents::upload_document,
            commands::settings::get_model_status,
            commands::settings::get_setting,
            commands::settings::set_setting,
            commands::settings::get_system_stats,
            commands::model_download::download_model,
            commands::system::open_url,
            commands::system::install_windows_prerequisites,
            commands::deployment::deployment_status,
            commands::deployment::get_license_status,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
