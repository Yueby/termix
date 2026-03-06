use serde::Serialize;
use tauri::{AppHandle, State};

use crate::services::local_terminal::{LocalTerminalManager, ShellProfile};

#[derive(Debug, Serialize)]
pub struct LocalOpenResult {
    pub session_id: String,
}

#[tauri::command]
pub async fn local_open(
    app: AppHandle,
    cols: u16,
    rows: u16,
    shell: Option<String>,
    shell_args: Option<Vec<String>>,
    local_manager: State<'_, LocalTerminalManager>,
) -> Result<LocalOpenResult, String> {
    let session_id = local_manager
        .spawn(app, cols, rows, shell, shell_args)
        .await
        .map_err(|e| e.to_string())?;
    Ok(LocalOpenResult { session_id })
}

#[tauri::command]
pub fn detect_shells() -> Vec<ShellProfile> {
    crate::services::local_terminal::detect_available_shells()
}

#[tauri::command]
pub async fn local_write(
    session_id: String,
    data: Vec<u8>,
    local_manager: State<'_, LocalTerminalManager>,
) -> Result<(), String> {
    local_manager
        .write(&session_id, &data)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn local_resize(
    session_id: String,
    cols: u16,
    rows: u16,
    local_manager: State<'_, LocalTerminalManager>,
) -> Result<(), String> {
    local_manager
        .resize(&session_id, cols, rows)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn local_close(
    session_id: String,
    local_manager: State<'_, LocalTerminalManager>,
) -> Result<(), String> {
    local_manager
        .close(&session_id)
        .await
        .map_err(|e| e.to_string())
}
