use serde::{Deserialize, Serialize};
use tauri::State;

use crate::services::ssh_manager::SshManager;

#[derive(Debug, Serialize)]
pub struct FileEntry {
    pub name: String,
    pub is_dir: bool,
    pub size: u64,
    pub modified: Option<u64>,
}

#[tauri::command]
pub async fn sftp_list_dir(
    session_id: String,
    path: String,
    ssh_manager: State<'_, SshManager>,
) -> Result<Vec<FileEntry>, String> {
    ssh_manager
        .sftp_list_dir(&session_id, &path)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn sftp_read_file(
    session_id: String,
    remote_path: String,
    local_path: String,
    ssh_manager: State<'_, SshManager>,
) -> Result<(), String> {
    ssh_manager
        .sftp_download(&session_id, &remote_path, &local_path)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn sftp_write_file(
    session_id: String,
    local_path: String,
    remote_path: String,
    ssh_manager: State<'_, SshManager>,
) -> Result<(), String> {
    ssh_manager
        .sftp_upload(&session_id, &local_path, &remote_path)
        .await
        .map_err(|e| e.to_string())
}

#[derive(Debug, Deserialize)]
pub struct MkdirPayload {
    pub session_id: String,
    pub path: String,
}

#[tauri::command]
pub async fn sftp_mkdir(
    payload: MkdirPayload,
    ssh_manager: State<'_, SshManager>,
) -> Result<(), String> {
    ssh_manager
        .sftp_mkdir(&payload.session_id, &payload.path)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn sftp_remove(
    session_id: String,
    path: String,
    ssh_manager: State<'_, SshManager>,
) -> Result<(), String> {
    ssh_manager
        .sftp_remove(&session_id, &path)
        .await
        .map_err(|e| e.to_string())
}
