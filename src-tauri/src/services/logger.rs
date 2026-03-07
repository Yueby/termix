use tauri_plugin_log::{Target, TargetKind, TimezoneStrategy};

/// Builds the tauri-plugin-log plugin with unified format and targets.
///
/// Log format: `[YYYY-MM-DD][HH:MM:SS][target][LEVEL] message`
/// - Backend modules appear as their Rust module path (e.g. `termix::services::sftp_manager`)
/// - Frontend logs from `logger.ts` appear with target `webview` and `[module]` prefix in message
///
/// Targets: Stdout, LogDir (persistent file), Webview (DevTools console)
pub fn build_log_plugin() -> tauri::plugin::TauriPlugin<tauri::Wry> {
    tauri_plugin_log::Builder::new()
        .timezone_strategy(TimezoneStrategy::UseLocal)
        .level(log::LevelFilter::Info)
        .targets([
            Target::new(TargetKind::Stdout),
            Target::new(TargetKind::LogDir { file_name: None }),
            Target::new(TargetKind::Webview),
        ])
        .max_file_size(50_000)
        .build()
}
