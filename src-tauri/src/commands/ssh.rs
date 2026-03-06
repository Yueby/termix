use serde::{Deserialize, Serialize};
use tauri::{AppHandle, State};

use crate::services::ssh_manager::SshManager;

#[derive(Debug, Deserialize)]
pub struct ConnectPayload {
    pub host: String,
    pub port: u16,
    pub username: String,
    pub auth_method: AuthMethod,
}

#[derive(Debug, Deserialize)]
#[serde(tag = "type")]
pub enum AuthMethod {
    #[serde(rename = "password")]
    Password { password: String },
    #[serde(rename = "key")]
    PrivateKey {
        key_path: String,
        passphrase: Option<String>,
    },
}

#[derive(Debug, Serialize)]
pub struct ConnectResult {
    pub session_id: String,
}

#[tauri::command]
pub async fn ssh_connect(
    app: AppHandle,
    payload: ConnectPayload,
    ssh_manager: State<'_, SshManager>,
) -> Result<ConnectResult, String> {
    let session_id = ssh_manager
        .connect(
            app,
            &payload.host,
            payload.port,
            &payload.username,
            payload.auth_method,
        )
        .await
        .map_err(|e| e.to_string())?;

    Ok(ConnectResult { session_id })
}

#[tauri::command]
pub async fn ssh_disconnect(
    session_id: String,
    ssh_manager: State<'_, SshManager>,
) -> Result<(), String> {
    ssh_manager
        .disconnect(&session_id)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn ssh_write(
    session_id: String,
    data: Vec<u8>,
    ssh_manager: State<'_, SshManager>,
) -> Result<(), String> {
    ssh_manager
        .write(&session_id, &data)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn ssh_resize(
    session_id: String,
    cols: u32,
    rows: u32,
    ssh_manager: State<'_, SshManager>,
) -> Result<(), String> {
    ssh_manager
        .resize(&session_id, cols, rows)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn ssh_list_sessions(
    ssh_manager: State<'_, SshManager>,
) -> Result<Vec<String>, String> {
    Ok(ssh_manager.list_sessions().await)
}
