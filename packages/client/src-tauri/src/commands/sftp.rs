use serde::{Deserialize, Serialize};
use tauri::State;

use crate::commands::ssh::AuthMethod;
use crate::services::sftp_manager::{FileEntry, SftpManager};

#[derive(Debug, Serialize)]
pub struct SftpConnectResult {
    pub session_id: String,
}

#[derive(Debug, Deserialize)]
pub struct SftpConnectPayload {
    pub host: String,
    pub port: u16,
    pub username: String,
    pub auth_method: AuthMethod,
}

#[tauri::command]
pub async fn sftp_connect(
    payload: SftpConnectPayload,
    sftp_manager: State<'_, SftpManager>,
) -> Result<SftpConnectResult, String> {
    let session_id = sftp_manager
        .connect(
            &payload.host,
            payload.port,
            &payload.username,
            payload.auth_method,
        )
        .await
        .map_err(|e| {
            log::error!("sftp_connect failed for {}:{}: {}", payload.host, payload.port, e);
            e.to_string()
        })?;

    Ok(SftpConnectResult { session_id })
}

#[tauri::command]
pub async fn sftp_disconnect(
    session_id: String,
    sftp_manager: State<'_, SftpManager>,
) -> Result<(), String> {
    sftp_manager
        .disconnect(&session_id)
        .await
        .map_err(|e| {
            log::warn!("sftp_disconnect failed for session {}: {}", session_id, e);
            e.to_string()
        })
}

#[tauri::command]
pub async fn sftp_home_dir(
    session_id: String,
    sftp_manager: State<'_, SftpManager>,
) -> Result<String, String> {
    sftp_manager
        .home_dir(&session_id)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn sftp_list_dir(
    session_id: String,
    path: String,
    sftp_manager: State<'_, SftpManager>,
) -> Result<Vec<FileEntry>, String> {
    sftp_manager
        .list_dir(&session_id, &path)
        .await
        .map_err(|e| {
            log::warn!("sftp_list_dir failed: session={}, path={}: {}", session_id, path, e);
            e.to_string()
        })
}

#[tauri::command]
pub async fn sftp_read_file(
    session_id: String,
    remote_path: String,
    local_path: String,
    sftp_manager: State<'_, SftpManager>,
) -> Result<(), String> {
    sftp_manager
        .download(&session_id, &remote_path, &local_path)
        .await
        .map_err(|e| {
            log::error!("sftp_read_file failed: session={}, remote={}: {}", session_id, remote_path, e);
            e.to_string()
        })
}

#[tauri::command]
pub async fn sftp_write_file(
    session_id: String,
    local_path: String,
    remote_path: String,
    sftp_manager: State<'_, SftpManager>,
) -> Result<(), String> {
    sftp_manager
        .upload(&session_id, &local_path, &remote_path)
        .await
        .map_err(|e| {
            log::error!("sftp_write_file failed: session={}, local={}: {}", session_id, local_path, e);
            e.to_string()
        })
}

#[tauri::command]
pub async fn sftp_mkdir(
    session_id: String,
    path: String,
    sftp_manager: State<'_, SftpManager>,
) -> Result<(), String> {
    sftp_manager
        .mkdir(&session_id, &path)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn sftp_remove(
    session_id: String,
    path: String,
    is_dir: bool,
    sftp_manager: State<'_, SftpManager>,
) -> Result<(), String> {
    sftp_manager
        .remove(&session_id, &path, is_dir)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn sftp_rename(
    session_id: String,
    old_path: String,
    new_path: String,
    sftp_manager: State<'_, SftpManager>,
) -> Result<(), String> {
    sftp_manager
        .rename(&session_id, &old_path, &new_path)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn sftp_chmod(
    session_id: String,
    path: String,
    mode: u32,
    sftp_manager: State<'_, SftpManager>,
) -> Result<(), String> {
    sftp_manager
        .chmod(&session_id, &path, mode)
        .await
        .map_err(|e| e.to_string())
}
