use tauri::State;

use crate::services::db::Database;
use crate::services::crypto;
use crate::services::webdav::WebDavClient;

fn normalize_remote_dir(dir: &str) -> String {
    let dir = dir.trim();
    if dir.is_empty() {
        return "/termix".to_string();
    }
    if dir.starts_with('/') {
        dir.to_string()
    } else {
        format!("/{}", dir)
    }
}

#[tauri::command]
pub async fn sync_push(db: State<'_, Database>) -> Result<String, String> {
    let settings = db.get_settings().await.map_err(|e| e.to_string())?;
    if settings.webdav_url.is_empty() {
        return Err("WebDAV URL not configured".into());
    }
    let webdav_pw = crypto::decrypt(&settings.webdav_password).unwrap_or_default();

    let client = WebDavClient::new(
        &settings.webdav_url,
        &settings.webdav_username,
        &webdav_pw,
    );

    let remote_dir = normalize_remote_dir(&settings.webdav_remote_dir);

    client.mkcol(&remote_dir).await.ok();

    let mut connections = db.get_connections().await.map_err(|e| e.to_string())?;
    for conn in connections.iter_mut() {
        conn.password = crypto::encrypt(&conn.password).map_err(|e| e.to_string())?;
        conn.key_path = crypto::encrypt(&conn.key_path).map_err(|e| e.to_string())?;
        conn.key_passphrase = crypto::encrypt(&conn.key_passphrase).map_err(|e| e.to_string())?;
    }
    let conn_json = serde_json::to_string_pretty(&connections).map_err(|e| e.to_string())?;
    client
        .put(&format!("{}/connections.json", remote_dir), &conn_json)
        .await
        .map_err(|e| e.to_string())?;

    let snippets = db.get_snippets().await.map_err(|e| e.to_string())?;
    let snip_json = serde_json::to_string_pretty(&snippets).map_err(|e| e.to_string())?;
    client
        .put(&format!("{}/snippets.json", remote_dir), &snip_json)
        .await
        .map_err(|e| e.to_string())?;

    let mut sync_settings = settings.clone();
    sync_settings.webdav_url = String::new();
    sync_settings.webdav_username = String::new();
    sync_settings.webdav_password = String::new();
    sync_settings.webdav_remote_dir = String::new();
    let settings_json = serde_json::to_string_pretty(&sync_settings).map_err(|e| e.to_string())?;
    client
        .put(&format!("{}/settings.json", remote_dir), &settings_json)
        .await
        .map_err(|e| e.to_string())?;

    Ok("Push completed".into())
}

#[tauri::command]
pub async fn sync_pull(db: State<'_, Database>) -> Result<String, String> {
    let settings = db.get_settings().await.map_err(|e| e.to_string())?;
    if settings.webdav_url.is_empty() {
        return Err("WebDAV URL not configured".into());
    }
    let webdav_pw = crypto::decrypt(&settings.webdav_password).unwrap_or_default();

    let client = WebDavClient::new(
        &settings.webdav_url,
        &settings.webdav_username,
        &webdav_pw,
    );

    let remote_dir = normalize_remote_dir(&settings.webdav_remote_dir);

    if let Ok(conn_json) = client.get(&format!("{}/connections.json", remote_dir)).await {
        if let Ok(mut remote_conns) =
            serde_json::from_str::<Vec<crate::commands::connection::ConnectionInfo>>(&conn_json)
        {
            for conn in remote_conns.iter_mut() {
                conn.password = crypto::decrypt(&conn.password).unwrap_or_default();
                conn.key_path = crypto::decrypt(&conn.key_path).unwrap_or_default();
                conn.key_passphrase = crypto::decrypt(&conn.key_passphrase).unwrap_or_default();
            }
            for conn in remote_conns {
                db.save_connection(&conn).await.map_err(|e| e.to_string())?;
            }
        }
    }

    if let Ok(snip_json) = client.get(&format!("{}/snippets.json", remote_dir)).await {
        if let Ok(remote_snips) =
            serde_json::from_str::<Vec<crate::commands::snippet::Snippet>>(&snip_json)
        {
            for snip in remote_snips {
                db.save_snippet(&snip).await.map_err(|e| e.to_string())?;
            }
        }
    }

    if let Ok(settings_json) = client.get(&format!("{}/settings.json", remote_dir)).await {
        if let Ok(mut remote_settings) =
            serde_json::from_str::<crate::commands::settings::AppSettings>(&settings_json)
        {
            // Keep local WebDAV credentials — never overwrite from remote
            remote_settings.webdav_url = settings.webdav_url.clone();
            remote_settings.webdav_username = settings.webdav_username.clone();
            remote_settings.webdav_password = settings.webdav_password.clone();
            remote_settings.webdav_remote_dir = settings.webdav_remote_dir.clone();
            db.save_settings(&remote_settings).await.map_err(|e| e.to_string())?;
        }
    }

    Ok("Pull completed".into())
}

#[tauri::command]
pub async fn sync_test_connection(db: State<'_, Database>) -> Result<String, String> {
    let settings = db.get_settings().await.map_err(|e| e.to_string())?;
    if settings.webdav_url.is_empty() {
        return Err("WebDAV URL not configured".into());
    }
    let webdav_pw = crypto::decrypt(&settings.webdav_password).unwrap_or_default();

    let client = WebDavClient::new(
        &settings.webdav_url,
        &settings.webdav_username,
        &webdav_pw,
    );

    client
        .propfind("/")
        .await
        .map_err(|e| format!("Connection failed: {}", e))?;

    Ok("Connection successful".into())
}
