mod commands;
mod services;

use tauri::Manager;

use services::db::Database;
use services::local_terminal::LocalTerminalManager;
use services::ssh_manager::SshManager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    env_logger::init();

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            let app_dir = app
                .path()
                .app_data_dir()
                .expect("Failed to get app data dir");
            std::fs::create_dir_all(&app_dir)?;
            let app_dir_str = app_dir.to_string_lossy().to_string();

            let handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                match Database::new(&app_dir_str).await {
                    Ok(db) => {
                        handle.manage(db);
                        log::info!("Database initialized at {}", app_dir_str);
                    }
                    Err(e) => {
                        log::error!("Failed to initialize database: {}", e);
                    }
                }
            });

            app.manage(SshManager::new());
            app.manage(LocalTerminalManager::new());
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::ssh::ssh_connect,
            commands::ssh::ssh_disconnect,
            commands::ssh::ssh_write,
            commands::ssh::ssh_resize,
            commands::ssh::ssh_list_sessions,
            commands::sftp::sftp_list_dir,
            commands::sftp::sftp_read_file,
            commands::sftp::sftp_write_file,
            commands::sftp::sftp_mkdir,
            commands::sftp::sftp_remove,
            commands::connection::get_connections,
            commands::connection::save_connection,
            commands::connection::delete_connection,
            commands::settings::get_settings,
            commands::settings::save_settings,
            commands::snippet::get_snippets,
            commands::snippet::save_snippet,
            commands::snippet::delete_snippet,
            commands::sync::sync_push,
            commands::sync::sync_pull,
            commands::sync::sync_test_connection,
            commands::local_terminal::local_open,
            commands::local_terminal::local_write,
            commands::local_terminal::local_resize,
            commands::local_terminal::local_close,
            commands::local_terminal::detect_shells,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
