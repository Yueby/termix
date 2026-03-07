use std::time::UNIX_EPOCH;

use crate::services::sftp_manager::{extension_to_kind, FileEntry};

fn default_root() -> String {
    #[cfg(target_os = "windows")]
    {
        dirs::home_dir()
            .map(|p| p.to_string_lossy().to_string())
            .unwrap_or_else(|| "C:\\".to_string())
    }
    #[cfg(not(target_os = "windows"))]
    {
        dirs::home_dir()
            .map(|p| p.to_string_lossy().to_string())
            .unwrap_or_else(|| "/".to_string())
    }
}

/// Canonicalize a user-supplied path to prevent traversal attacks.
fn safe_canonical(path: &str) -> Result<std::path::PathBuf, String> {
    let p = std::path::Path::new(path);
    p.canonicalize()
        .map_err(|e| format!("Invalid path '{}': {}", path, e))
}

#[tauri::command]
pub async fn local_list_dir(path: String) -> Result<Vec<FileEntry>, String> {
    let path = if path.is_empty() || path == "/" {
        default_root()
    } else {
        path
    };

    let canonical = safe_canonical(&path)?;

    let mut entries = Vec::new();
    let mut read_dir = tokio::fs::read_dir(&canonical)
        .await
        .map_err(|e| format!("Failed to read directory {}: {}", path, e))?;

    while let Some(entry) = read_dir
        .next_entry()
        .await
        .map_err(|e| e.to_string())?
    {
        let name = entry.file_name().to_string_lossy().to_string();
        let meta = match entry.metadata().await {
            Ok(m) => m,
            Err(e) => {
                log::warn!("Failed to read metadata for {}: {}", name, e);
                continue;
            }
        };

        let is_dir = meta.is_dir();
        let size = if is_dir { 0 } else { meta.len() };
        let modified = meta
            .modified()
            .ok()
            .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
            .map(|d| d.as_secs());

        let kind = if is_dir {
            "folder".to_string()
        } else {
            extension_to_kind(&name)
        };

        entries.push(FileEntry {
            name,
            is_dir,
            size,
            modified,
            permissions: None,
            kind,
        });
    }

    entries.sort_by(|a, b| b.is_dir.cmp(&a.is_dir).then(a.name.to_lowercase().cmp(&b.name.to_lowercase())));
    Ok(entries)
}

#[tauri::command]
pub async fn local_get_home_dir() -> Result<String, String> {
    dirs::home_dir()
        .map(|p| p.to_string_lossy().to_string())
        .ok_or_else(|| "Could not determine home directory".to_string())
}

#[tauri::command]
pub async fn local_get_drives() -> Result<Vec<String>, String> {
    #[cfg(target_os = "windows")]
    {
        let mut drives = Vec::new();
        for letter in b'A'..=b'Z' {
            let path = format!("{}:\\", letter as char);
            if tokio::fs::metadata(&path).await.is_ok() {
                drives.push(path);
            }
        }
        Ok(drives)
    }

    #[cfg(not(target_os = "windows"))]
    {
        Ok(vec!["/".to_string()])
    }
}

#[tauri::command]
pub async fn local_create_dir(path: String) -> Result<(), String> {
    log::info!("local_create_dir: {}", path);
    let target = std::path::Path::new(&path);
    if let Some(parent) = target.parent() {
        if parent.exists() {
            let canonical_parent = safe_canonical(&parent.to_string_lossy())?;
            let final_path = canonical_parent.join(target.file_name().unwrap_or_default());
            return tokio::fs::create_dir_all(&final_path)
                .await
                .map_err(|e| {
                    log::warn!("local_create_dir failed: {}: {}", path, e);
                    format!("Failed to create directory {}: {}", path, e)
                });
        }
    }
    tokio::fs::create_dir_all(&path)
        .await
        .map_err(|e| {
            log::warn!("local_create_dir failed: {}: {}", path, e);
            format!("Failed to create directory {}: {}", path, e)
        })
}

#[tauri::command]
pub async fn local_remove(path: String, is_dir: bool) -> Result<(), String> {
    log::info!("local_remove: path={}, is_dir={}", path, is_dir);
    let canonical = safe_canonical(&path)?;
    if is_dir {
        tokio::fs::remove_dir_all(&canonical)
            .await
            .map_err(|e| {
                log::warn!("local_remove failed: {}: {}", path, e);
                format!("Failed to remove directory {}: {}", path, e)
            })
    } else {
        tokio::fs::remove_file(&canonical)
            .await
            .map_err(|e| {
                log::warn!("local_remove failed: {}: {}", path, e);
                format!("Failed to remove file {}: {}", path, e)
            })
    }
}

#[tauri::command]
pub async fn local_rename(old_path: String, new_path: String) -> Result<(), String> {
    log::info!("local_rename: {} -> {}", old_path, new_path);
    let canonical_old = safe_canonical(&old_path)?;
    if let Some(new_parent) = std::path::Path::new(&new_path).parent() {
        if new_parent.exists() {
            let _ = safe_canonical(&new_parent.to_string_lossy())?;
        }
    }
    tokio::fs::rename(&canonical_old, &new_path)
        .await
        .map_err(|e| {
            log::warn!("local_rename failed: {} -> {}: {}", old_path, new_path, e);
            format!("Failed to rename {} to {}: {}", old_path, new_path, e)
        })
}

#[tauri::command]
pub async fn local_copy(src: String, dest: String, is_dir: bool) -> Result<(), String> {
    let _ = safe_canonical(&src)?;
    if let Some(dest_parent) = std::path::Path::new(&dest).parent() {
        if dest_parent.exists() {
            let _ = safe_canonical(&dest_parent.to_string_lossy())?;
        }
    }
    if is_dir {
        copy_dir_iterative(&src, &dest)
            .await
            .map_err(|e| format!("Failed to copy directory {} to {}: {}", src, dest, e))
    } else {
        if let Some(parent) = std::path::Path::new(&dest).parent() {
            tokio::fs::create_dir_all(parent).await.ok();
        }
        tokio::fs::copy(&src, &dest)
            .await
            .map(|_| ())
            .map_err(|e| format!("Failed to copy {} to {}: {}", src, dest, e))
    }
}

/// Iterative directory copy to avoid stack overflow on deep hierarchies.
async fn copy_dir_iterative(src: &str, dest: &str) -> Result<(), std::io::Error> {
    let mut stack: Vec<(std::path::PathBuf, std::path::PathBuf)> = vec![
        (std::path::PathBuf::from(src), std::path::PathBuf::from(dest)),
    ];

    while let Some((src_dir, dest_dir)) = stack.pop() {
        tokio::fs::create_dir_all(&dest_dir).await?;
        let mut read_dir = tokio::fs::read_dir(&src_dir).await?;
        while let Some(entry) = read_dir.next_entry().await? {
            let src_child = entry.path();
            let dest_child = dest_dir.join(entry.file_name());
            if entry.metadata().await?.is_dir() {
                stack.push((src_child, dest_child));
            } else {
                tokio::fs::copy(&src_child, &dest_child).await?;
            }
        }
    }
    Ok(())
}

#[tauri::command]
pub async fn local_stat(path: String) -> Result<FileEntry, String> {
    let _ = safe_canonical(&path)?;
    let p = std::path::Path::new(&path);
    let meta = tokio::fs::metadata(&p)
        .await
        .map_err(|e| format!("Failed to stat {}: {}", path, e))?;

    let name = p
        .file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_default();
    let is_dir = meta.is_dir();
    let size = if is_dir { 0 } else { meta.len() };
    let modified = meta
        .modified()
        .ok()
        .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
        .map(|d| d.as_secs());
    let kind = if is_dir {
        "folder".to_string()
    } else {
        extension_to_kind(&name)
    };

    Ok(FileEntry {
        name,
        is_dir,
        size,
        modified,
        permissions: None,
        kind,
    })
}

#[tauri::command]
pub async fn local_open_with(program: String, file_path: String) -> Result<(), String> {
    log::info!("local_open_with: program={}, file={}", program, file_path);
    let canonical_prog = safe_canonical(&program)?;
    if !canonical_prog.is_file() {
        return Err(format!("Program not found: {}", program));
    }
    let canonical_file = safe_canonical(&file_path)?;
    if !canonical_file.exists() {
        return Err(format!("File not found: {}", file_path));
    }

    tokio::process::Command::new(&canonical_prog)
        .arg(&canonical_file)
        .spawn()
        .map(|_| ())
        .map_err(|e| {
            log::warn!("local_open_with failed: {} with {}: {}", file_path, program, e);
            format!("Failed to open {} with {}: {}", file_path, program, e)
        })
}
