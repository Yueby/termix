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

fn sync_encrypt(plaintext: &str, sync_pw: &str) -> Result<String, String> {
    if sync_pw.is_empty() {
        Ok(plaintext.to_string())
    } else {
        crypto::encrypt_with_password(plaintext, sync_pw).map_err(|e| e.to_string())
    }
}

fn sync_decrypt(encoded: &str, sync_pw: &str) -> Result<String, String> {
    if encoded.is_empty() {
        return Ok(String::new());
    }
    if sync_pw.is_empty() {
        Ok(encoded.to_string())
    } else {
        crypto::decrypt_with_password(encoded, sync_pw).map_err(|e| {
            format!("Sync decryption failed (wrong password?): {}", e)
        })
    }
}

#[tauri::command]
pub async fn sync_push(db: State<'_, Database>) -> Result<String, String> {
    log::info!("sync_push: starting");
    let settings = db.get_settings().await.map_err(|e| e.to_string())?;
    if settings.webdav_url.is_empty() {
        return Err("WebDAV URL not configured".into());
    }
    let webdav_pw = crypto::decrypt(&settings.webdav_password).unwrap_or_else(|e| {
        log::warn!("sync_push: failed to decrypt webdav_password: {}", e);
        String::new()
    });
    let sync_pw = crypto::decrypt(&settings.sync_encryption_password).unwrap_or_else(|e| {
        log::warn!("sync_push: failed to decrypt sync_encryption_password: {}", e);
        String::new()
    });

    let client = WebDavClient::new(
        &settings.webdav_url,
        &settings.webdav_username,
        &webdav_pw,
    );

    let remote_dir = normalize_remote_dir(&settings.webdav_remote_dir);

    client.mkcol(&remote_dir).await.ok();

    let mut connections = db.get_connections().await.map_err(|e| e.to_string())?;
    for conn in connections.iter_mut() {
        conn.password = sync_encrypt(&conn.password, &sync_pw)?;
        conn.key_path = sync_encrypt(&conn.key_path, &sync_pw)?;
        conn.key_passphrase = sync_encrypt(&conn.key_passphrase, &sync_pw)?;
    }
    let conn_json = serde_json::to_string_pretty(&connections).map_err(|e| e.to_string())?;
    client
        .put(&format!("{}/connections.json", remote_dir), &conn_json)
        .await
        .map_err(|e| {
            log::error!("sync_push: failed to upload connections: {}", e);
            e.to_string()
        })?;
    log::info!("sync_push: uploaded {} connections", connections.len());

    let snippets = db.get_snippets().await.map_err(|e| e.to_string())?;
    let snip_json = serde_json::to_string_pretty(&snippets).map_err(|e| e.to_string())?;
    client
        .put(&format!("{}/snippets.json", remote_dir), &snip_json)
        .await
        .map_err(|e| {
            log::error!("sync_push: failed to upload snippets: {}", e);
            e.to_string()
        })?;
    log::info!("sync_push: uploaded {} snippets", snippets.len());

    let mut keychain_items = db.get_keychain_items().await.map_err(|e| e.to_string())?;
    for item in keychain_items.iter_mut() {
        item.private_key = sync_encrypt(&item.private_key, &sync_pw)?;
        item.public_key = sync_encrypt(&item.public_key, &sync_pw)?;
        item.certificate = sync_encrypt(&item.certificate, &sync_pw)?;
        item.passphrase = sync_encrypt(&item.passphrase, &sync_pw)?;
    }
    let keychain_json = serde_json::to_string_pretty(&keychain_items).map_err(|e| e.to_string())?;
    client
        .put(&format!("{}/keychain.json", remote_dir), &keychain_json)
        .await
        .map_err(|e| {
            log::error!("sync_push: failed to upload keychain: {}", e);
            e.to_string()
        })?;
    log::info!("sync_push: uploaded {} keychain items", keychain_items.len());

    let mut sync_settings = settings.clone();
    sync_settings.webdav_url = String::new();
    sync_settings.webdav_username = String::new();
    sync_settings.webdav_password = String::new();
    sync_settings.webdav_remote_dir = String::new();
    sync_settings.sync_encryption_password = String::new();
    let settings_json = serde_json::to_string_pretty(&sync_settings).map_err(|e| e.to_string())?;
    client
        .put(&format!("{}/settings.json", remote_dir), &settings_json)
        .await
        .map_err(|e| {
            log::error!("sync_push: failed to upload settings: {}", e);
            e.to_string()
        })?;

    log::info!("sync_push: completed successfully");
    Ok("Push completed".into())
}

#[tauri::command]
pub async fn sync_pull(db: State<'_, Database>) -> Result<String, String> {
    log::info!("sync_pull: starting");
    let settings = db.get_settings().await.map_err(|e| e.to_string())?;
    if settings.webdav_url.is_empty() {
        return Err("WebDAV URL not configured".into());
    }
    let webdav_pw = crypto::decrypt(&settings.webdav_password).unwrap_or_else(|e| {
        log::warn!("sync_pull: failed to decrypt webdav_password: {}", e);
        String::new()
    });
    let sync_pw = crypto::decrypt(&settings.sync_encryption_password).unwrap_or_else(|e| {
        log::warn!("sync_pull: failed to decrypt sync_encryption_password: {}", e);
        String::new()
    });

    let client = WebDavClient::new(
        &settings.webdav_url,
        &settings.webdav_username,
        &webdav_pw,
    );

    let remote_dir = normalize_remote_dir(&settings.webdav_remote_dir);

    match client.get(&format!("{}/connections.json", remote_dir)).await {
        Ok(conn_json) => match serde_json::from_str::<Vec<crate::commands::connection::ConnectionInfo>>(&conn_json) {
            Ok(mut remote_conns) => {
                for conn in remote_conns.iter_mut() {
                    conn.password = sync_decrypt(&conn.password, &sync_pw)?;
                    conn.key_path = sync_decrypt(&conn.key_path, &sync_pw)?;
                    conn.key_passphrase = sync_decrypt(&conn.key_passphrase, &sync_pw)?;
                }
                let count = remote_conns.len();
                for conn in remote_conns {
                    db.save_connection(&conn).await.map_err(|e| e.to_string())?;
                }
                log::info!("sync_pull: imported {} connections", count);
            }
            Err(e) => log::warn!("sync_pull: failed to parse connections.json: {}", e),
        },
        Err(e) => log::warn!("sync_pull: failed to fetch connections.json: {}", e),
    }

    match client.get(&format!("{}/snippets.json", remote_dir)).await {
        Ok(snip_json) => match serde_json::from_str::<Vec<crate::commands::snippet::Snippet>>(&snip_json) {
            Ok(remote_snips) => {
                let count = remote_snips.len();
                for snip in remote_snips {
                    db.save_snippet(&snip).await.map_err(|e| e.to_string())?;
                }
                log::info!("sync_pull: imported {} snippets", count);
            }
            Err(e) => log::warn!("sync_pull: failed to parse snippets.json: {}", e),
        },
        Err(e) => log::warn!("sync_pull: failed to fetch snippets.json: {}", e),
    }

    match client.get(&format!("{}/keychain.json", remote_dir)).await {
        Ok(keychain_json) => match serde_json::from_str::<Vec<crate::commands::keychain::KeychainItem>>(&keychain_json) {
            Ok(mut remote_items) => {
                for item in remote_items.iter_mut() {
                    item.private_key = sync_decrypt(&item.private_key, &sync_pw)?;
                    item.public_key = sync_decrypt(&item.public_key, &sync_pw)?;
                    item.certificate = sync_decrypt(&item.certificate, &sync_pw)?;
                    item.passphrase = sync_decrypt(&item.passphrase, &sync_pw)?;
                }
                let count = remote_items.len();
                for item in remote_items {
                    db.save_keychain_item(&item).await.map_err(|e| e.to_string())?;
                }
                log::info!("sync_pull: imported {} keychain items", count);
            }
            Err(e) => log::warn!("sync_pull: failed to parse keychain.json: {}", e),
        },
        Err(e) => log::warn!("sync_pull: failed to fetch keychain.json: {}", e),
    }

    match client.get(&format!("{}/settings.json", remote_dir)).await {
        Ok(settings_json) => match serde_json::from_str::<crate::commands::settings::AppSettings>(&settings_json) {
            Ok(mut remote_settings) => {
                remote_settings.webdav_url = settings.webdav_url.clone();
                remote_settings.webdav_username = settings.webdav_username.clone();
                remote_settings.webdav_password = settings.webdav_password.clone();
                remote_settings.webdav_remote_dir = settings.webdav_remote_dir.clone();
                remote_settings.sync_encryption_password = settings.sync_encryption_password.clone();
                db.save_settings(&remote_settings).await.map_err(|e| e.to_string())?;
                log::info!("sync_pull: imported settings");
            }
            Err(e) => log::warn!("sync_pull: failed to parse settings.json: {}", e),
        },
        Err(e) => log::warn!("sync_pull: failed to fetch settings.json: {}", e),
    }

    log::info!("sync_pull: completed successfully");
    Ok("Pull completed".into())
}

#[tauri::command]
pub async fn sync_test_connection(db: State<'_, Database>) -> Result<String, String> {
    log::info!("sync_test_connection: testing WebDAV connectivity");
    let settings = db.get_settings().await.map_err(|e| e.to_string())?;
    if settings.webdav_url.is_empty() {
        return Err("WebDAV URL not configured".into());
    }
    let webdav_pw = crypto::decrypt(&settings.webdav_password).unwrap_or_else(|e| {
        log::warn!("sync_test_connection: failed to decrypt webdav_password: {}", e);
        String::new()
    });

    let client = WebDavClient::new(
        &settings.webdav_url,
        &settings.webdav_username,
        &webdav_pw,
    );

    client
        .propfind("/")
        .await
        .map_err(|e| {
            log::warn!("sync_test_connection: failed: {}", e);
            format!("Connection failed: {}", e)
        })?;

    log::info!("sync_test_connection: success");
    Ok("Connection successful".into())
}
