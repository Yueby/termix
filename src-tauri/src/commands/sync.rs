use tauri::State;

use crate::services::db::Database;

#[tauri::command]
pub async fn sync_push(_db: State<'_, Database>) -> Result<(), String> {
    log::info!("Cloud sync push requested");
    Ok(())
}

#[tauri::command]
pub async fn sync_pull(_db: State<'_, Database>) -> Result<(), String> {
    log::info!("Cloud sync pull requested");
    Ok(())
}
