mod commands;
mod services;

use tauri::Manager;

use services::db::Database;
use services::local_terminal::LocalTerminalManager;
use services::sftp_manager::SftpManager;
use services::ssh_manager::SshManager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let result = tauri::Builder::default()
        .plugin(services::logger::build_log_plugin())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .setup(|app| {
            let app_dir = app
                .path()
                .app_data_dir()
                .map_err(|e| format!("Failed to get app data directory: {}", e))?;
            std::fs::create_dir_all(&app_dir)?;
            let app_dir_str = app_dir.to_string_lossy().to_string();

            let db = tauri::async_runtime::block_on(Database::new(&app_dir_str))
                .map_err(|e| {
                    log::error!("Failed to initialize database: {}", e);
                    e.to_string()
                })?;
            app.manage(db);
            log::info!("Database initialized at {}", app_dir_str);

            app.manage(SshManager::new());
            app.manage(SftpManager::new());
            app.manage(LocalTerminalManager::new());
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::ssh::ssh_connect,
            commands::ssh::ssh_disconnect,
            commands::ssh::ssh_write,
            commands::ssh::ssh_resize,
            commands::ssh::ssh_list_sessions,
            commands::sftp::sftp_connect,
            commands::sftp::sftp_disconnect,
            commands::sftp::sftp_home_dir,
            commands::sftp::sftp_list_dir,
            commands::sftp::sftp_read_file,
            commands::sftp::sftp_write_file,
            commands::sftp::sftp_mkdir,
            commands::sftp::sftp_remove,
            commands::sftp::sftp_rename,
            commands::sftp::sftp_chmod,
            commands::connection::get_connections,
            commands::connection::save_connection,
            commands::connection::delete_connection,
            commands::keychain::get_keychain_items,
            commands::keychain::save_keychain_item,
            commands::keychain::delete_keychain_item,
            commands::keychain::import_key_file,
            commands::settings::get_settings,
            commands::settings::save_settings,
            commands::snippet::get_snippets,
            commands::snippet::save_snippet,
            commands::snippet::delete_snippet,
            commands::sync::sync_push,
            commands::sync::sync_pull,
            commands::sync::sync_test_connection,
            commands::local_fs::local_list_dir,
            commands::local_fs::local_get_home_dir,
            commands::local_fs::local_get_drives,
            commands::local_fs::local_create_dir,
            commands::local_fs::local_remove,
            commands::local_fs::local_rename,
            commands::local_fs::local_copy,
            commands::local_fs::local_stat,
            commands::local_fs::local_open_with,
            commands::local_terminal::local_open,
            commands::local_terminal::local_write,
            commands::local_terminal::local_resize,
            commands::local_terminal::local_close,
            commands::local_terminal::detect_shells,
        ])
        .run(tauri::generate_context!());

    if let Err(e) = result {
        log::error!("Application error: {}", e);
        eprintln!("Fatal: {}", e);
        std::process::exit(1);
    }
}
