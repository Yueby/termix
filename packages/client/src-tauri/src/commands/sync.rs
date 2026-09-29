use tauri::State;

use crate::services::crypto;
use crate::services::db::Database;
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
        crypto::decrypt_with_password(encoded, sync_pw)
            .map_err(|e| format!("Sync decryption failed (wrong password?): {}", e))
    }
}

/// Fetches one synced file and parses it.
///
/// `Ok(None)` is the ordinary first-pull case: the file has never been pushed. That is
/// not a failure and must not be counted as one, which the previous shape could not
/// express — it logged every outcome and answered "Pull completed" regardless.
async fn fetch_json<T: serde::de::DeserializeOwned>(
    client: &WebDavClient,
    remote_dir: &str,
    file: &str,
) -> Result<Option<T>, String> {
    match client.get(&format!("{remote_dir}/{file}")).await {
        Ok(Some(body)) => serde_json::from_str(&body)
            .map(Some)
            .map_err(|e| format!("{file} could not be parsed: {e}")),
        Ok(None) => Ok(None),
        Err(e) => Err(format!("{file} could not be read: {e}")),
    }
}

#[tauri::command]
pub async fn sync_push(db: State<'_, Database>) -> Result<String, String> {
    log::info!("sync_push: starting");
    let settings = db.get_settings().await.map_err(|e| e.to_string())?;
    if settings.webdav_url.is_empty() {
        return Err("WebDAV URL not configured".into());
    }
    // Fails closed. Degrading an unreadable stored password to "no password" meant an
    // app that could not read its own configuration would upload everything else in
    // plaintext instead of refusing — the one case where refusing is the whole point.
    let webdav_pw = crypto::decrypt_secret(&settings.webdav_password, "the WebDAV password")
        .map_err(|e| e.to_string())?;
    let sync_pw = crypto::decrypt_secret(
        &settings.sync_encryption_password,
        "the sync encryption password",
    )
    .map_err(|e| e.to_string())?;

    let client = WebDavClient::new(&settings.webdav_url, &settings.webdav_username, &webdav_pw);

    let remote_dir = normalize_remote_dir(&settings.webdav_remote_dir);

    client.mkcol(&remote_dir).await.ok();

    let mut connections = db.get_connections().await.map_err(|e| e.to_string())?;
    for conn in connections.iter_mut() {
        conn.password = sync_encrypt(&conn.password, &sync_pw)?;
        conn.key_path = sync_encrypt(&conn.key_path, &sync_pw)?;
        conn.key_passphrase = sync_encrypt(&conn.key_passphrase, &sync_pw)?;
        // `get_connections` has already decrypted this one, so without encrypting it here
        // an authenticated custom proxy password was written into connections.json in
        // the clear even with a sync password configured.
        if let Some(crate::services::proxy::ProxyMode::Custom(config)) = conn.proxy.as_mut() {
            config.password = sync_encrypt(&config.password, &sync_pw)?;
        }
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
    log::info!(
        "sync_push: uploaded {} keychain items",
        keychain_items.len()
    );

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
    let webdav_pw = crypto::decrypt_secret(&settings.webdav_password, "the WebDAV password")
        .map_err(|e| e.to_string())?;
    let sync_pw = crypto::decrypt_secret(
        &settings.sync_encryption_password,
        "the sync encryption password",
    )
    .map_err(|e| e.to_string())?;

    let client = WebDavClient::new(&settings.webdav_url, &settings.webdav_username, &webdav_pw);

    let remote_dir = normalize_remote_dir(&settings.webdav_remote_dir);

    // What actually arrived. The old tail answered "Pull completed" after logging every
    // failure, so a pull that read nothing at all still reported success.
    let mut imported = 0usize;
    let mut problems: Vec<String> = Vec::new();

    match fetch_json::<Vec<crate::commands::connection::ConnectionInfo>>(
        &client,
        &remote_dir,
        "connections.json",
    )
    .await
    {
        Ok(Some(mut remote_conns)) => {
            for conn in remote_conns.iter_mut() {
                conn.password = sync_decrypt(&conn.password, &sync_pw)?;
                conn.key_path = sync_decrypt(&conn.key_path, &sync_pw)?;
                conn.key_passphrase = sync_decrypt(&conn.key_passphrase, &sync_pw)?;
                if let Some(crate::services::proxy::ProxyMode::Custom(config)) = conn.proxy.as_mut()
                {
                    config.password = sync_decrypt(&config.password, &sync_pw)?;
                }
            }
            let count = remote_conns.len();
            for conn in remote_conns {
                db.save_connection(&conn).await.map_err(|e| e.to_string())?;
            }
            log::info!("sync_pull: imported {} connections", count);
            imported += 1;
        }
        Ok(None) => log::info!("sync_pull: no connections.json on the remote yet"),
        Err(e) => {
            log::warn!("sync_pull: {e}");
            problems.push(e);
        }
    }

    match fetch_json::<Vec<crate::commands::snippet::Snippet>>(
        &client,
        &remote_dir,
        "snippets.json",
    )
    .await
    {
        Ok(Some(remote_snips)) => {
            let count = remote_snips.len();
            for snip in remote_snips {
                db.save_snippet(&snip).await.map_err(|e| e.to_string())?;
            }
            log::info!("sync_pull: imported {} snippets", count);
            imported += 1;
        }
        Ok(None) => log::info!("sync_pull: no snippets.json on the remote yet"),
        Err(e) => {
            log::warn!("sync_pull: {e}");
            problems.push(e);
        }
    }

    match fetch_json::<Vec<crate::commands::keychain::KeychainItem>>(
        &client,
        &remote_dir,
        "keychain.json",
    )
    .await
    {
        Ok(Some(mut remote_items)) => {
            for item in remote_items.iter_mut() {
                item.private_key = sync_decrypt(&item.private_key, &sync_pw)?;
                item.public_key = sync_decrypt(&item.public_key, &sync_pw)?;
                item.certificate = sync_decrypt(&item.certificate, &sync_pw)?;
                item.passphrase = sync_decrypt(&item.passphrase, &sync_pw)?;
            }
            let count = remote_items.len();
            for item in remote_items {
                db.save_keychain_item(&item)
                    .await
                    .map_err(|e| e.to_string())?;
            }
            log::info!("sync_pull: imported {} keychain items", count);
            imported += 1;
        }
        Ok(None) => log::info!("sync_pull: no keychain.json on the remote yet"),
        Err(e) => {
            log::warn!("sync_pull: {e}");
            problems.push(e);
        }
    }

    match fetch_json::<crate::commands::settings::AppSettings>(
        &client,
        &remote_dir,
        "settings.json",
    )
    .await
    {
        Ok(Some(mut remote_settings)) => {
            // These are per-installation: the address this machine reaches the remote
            // through, and the credentials it uses to get there. Importing the remote's
            // copies would point this installation at somebody else's server.
            remote_settings.webdav_url = settings.webdav_url.clone();
            remote_settings.webdav_username = settings.webdav_username.clone();
            remote_settings.webdav_password = settings.webdav_password.clone();
            remote_settings.webdav_remote_dir = settings.webdav_remote_dir.clone();
            remote_settings.sync_encryption_password = settings.sync_encryption_password.clone();

            // The global proxy password travels encrypted under the exporting machine's
            // key, so it cannot be read here. Storing it anyway would leave this machine
            // holding a value it can never decrypt and writing it back as though it were
            // valid. The mode is portable; the password stays local.
            if let (
                crate::services::proxy::ProxyMode::Custom(remote),
                crate::services::proxy::ProxyMode::Custom(local),
            ) = (&mut remote_settings.proxy, &settings.proxy)
            {
                remote.password = local.password.clone();
            }

            db.save_settings(&remote_settings)
                .await
                .map_err(|e| e.to_string())?;
            log::info!("sync_pull: imported settings");
            imported += 1;
        }
        Ok(None) => log::info!("sync_pull: no settings.json on the remote yet"),
        Err(e) => {
            log::warn!("sync_pull: {e}");
            problems.push(e);
        }
    }

    match (imported, problems.is_empty()) {
        (0, true) => {
            log::info!("sync_pull: the remote has nothing to import yet");
            Ok("Nothing to pull: the remote has no synced files yet".into())
        }
        (0, false) => Err(format!("Pull failed: {}", problems.join("; "))),
        (_, true) => {
            log::info!("sync_pull: completed");
            Ok("Pull completed".into())
        }
        (_, false) => Ok(format!(
            "Pull completed with problems: {}",
            problems.join("; ")
        )),
    }
}

#[tauri::command]
pub async fn sync_test_connection(db: State<'_, Database>) -> Result<String, String> {
    log::info!("sync_test_connection: testing WebDAV connectivity");
    let settings = db.get_settings().await.map_err(|e| e.to_string())?;
    if settings.webdav_url.is_empty() {
        return Err("WebDAV URL not configured".into());
    }
    let webdav_pw = crypto::decrypt_secret(&settings.webdav_password, "the WebDAV password")
        .map_err(|e| e.to_string())?;

    let client = WebDavClient::new(&settings.webdav_url, &settings.webdav_username, &webdav_pw);

    client.propfind("/").await.map_err(|e| {
        log::warn!("sync_test_connection: failed: {}", e);
        format!("Connection failed: {}", e)
    })?;

    log::info!("sync_test_connection: success");
    Ok("Connection successful".into())
}
