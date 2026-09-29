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

    while let Some(entry) = read_dir.next_entry().await.map_err(|e| e.to_string())? {
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

    entries.sort_by(|a, b| {
        b.is_dir
            .cmp(&a.is_dir)
            .then(a.name.to_lowercase().cmp(&b.name.to_lowercase()))
    });
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
            return tokio::fs::create_dir_all(&final_path).await.map_err(|e| {
                log::warn!("local_create_dir failed: {}: {}", path, e);
                format!("Failed to create directory {}: {}", path, e)
            });
        }
    }
    tokio::fs::create_dir_all(&path).await.map_err(|e| {
        log::warn!("local_create_dir failed: {}: {}", path, e);
        format!("Failed to create directory {}: {}", path, e)
    })
}

#[tauri::command]
pub async fn local_remove(path: String, is_dir: bool) -> Result<(), String> {
    log::info!("local_remove: path={}, is_dir={}", path, is_dir);
    // Deliberately not canonicalised. Canonicalising resolves a symlink, so removing
    // "link" removed the file it pointed at and left the link dangling; a directory link
    // reached recursive deletion of the target. `symlink_metadata` describes the entry
    // itself, which is what has to be removed, and the filesystem decides the type — the
    // caller's `is_dir` is only logged.
    let meta = tokio::fs::symlink_metadata(&path)
        .await
        .map_err(|e| format!("Invalid path '{}': {}", path, e))?;

    let result = if meta.file_type().is_symlink() {
        // Remove the link and only the link. On Windows a directory symlink has to go
        // through remove_dir; on Unix a link is always remove_file-able.
        if meta.is_dir() {
            tokio::fs::remove_dir(&path).await
        } else {
            tokio::fs::remove_file(&path).await
        }
    } else if meta.is_dir() {
        tokio::fs::remove_dir_all(&path).await
    } else {
        tokio::fs::remove_file(&path).await
    };

    result.map_err(|e| {
        log::warn!("local_remove failed: {}: {}", path, e);
        format!("Failed to remove {}: {}", path, e)
    })
}

#[tauri::command]
pub async fn local_rename(old_path: String, new_path: String) -> Result<(), String> {
    log::info!("local_rename: {} -> {}", old_path, new_path);
    // Not canonicalised, for the same reason as local_remove: renaming a symlink has to
    // move the link rather than the thing it points at.
    let _ = tokio::fs::symlink_metadata(&old_path)
        .await
        .map_err(|e| format!("Invalid path '{}': {}", old_path, e))?;
    if let Some(new_parent) = std::path::Path::new(&new_path).parent() {
        if new_parent.exists() {
            let _ = safe_canonical(&new_parent.to_string_lossy())?;
        }
    }
    tokio::fs::rename(&old_path, &new_path).await.map_err(|e| {
        log::warn!("local_rename failed: {} -> {}: {}", old_path, new_path, e);
        format!("Failed to rename {} to {}: {}", old_path, new_path, e)
    })
}

#[tauri::command]
pub async fn local_copy(src: String, dest: String, is_dir: bool) -> Result<(), String> {
    let src_resolved = safe_canonical(&src)?;
    let dest_resolved = resolve_for_comparison(&dest).await?;

    if is_dir && dest_resolved.starts_with(&src_resolved) {
        // A directory copy creates its destination before it enumerates the source, so a
        // destination inside the source turns up in its own listing and gets copied into
        // itself, over and over, until something runs out. Refuse instead.
        return Err(format!(
            "Cannot copy {} into itself: {} is inside it",
            src, dest
        ));
    }

    if is_dir {
        copy_dir_iterative(&src_resolved, &dest_resolved)
            .await
            .map_err(|e| format!("Failed to copy directory {} to {}: {}", src, dest, e))
    } else {
        if let Some(parent) = dest_resolved.parent() {
            tokio::fs::create_dir_all(parent).await.ok();
        }
        tokio::fs::copy(&src_resolved, &dest_resolved)
            .await
            .map(|_| ())
            .map_err(|e| format!("Failed to copy {} to {}: {}", src, dest, e))
    }
}

/// Canonicalises the deepest ancestor of `path` that exists and appends the rest.
///
/// A copy destination usually does not exist yet, so it cannot be canonicalised directly
/// — but comparing it against the resolved source is exactly what stops a directory copy
/// from recursing into its own output. Climbing to the nearest existing ancestor gives a
/// real path without requiring the destination to be there.
async fn resolve_for_comparison(path: &str) -> Result<std::path::PathBuf, String> {
    let mut current = std::path::PathBuf::from(path);
    let mut tail: Vec<std::ffi::OsString> = Vec::new();

    loop {
        if let Ok(resolved) = tokio::fs::canonicalize(&current).await {
            let mut full = resolved;
            for part in tail.iter().rev() {
                full.push(part);
            }
            return Ok(full);
        }

        match current.file_name().map(|name| name.to_os_string()) {
            Some(name) if current.pop() => tail.push(name),
            _ => return Err(format!("Invalid path '{}'", path)),
        }
    }
}

/// Iterative directory copy to avoid stack overflow on deep hierarchies.
///
/// Symlinks are recreated rather than followed. Following them would let a link point
/// back up the tree and make the walk unbounded, and copying a link's target would move
/// data the user did not ask to move.
async fn copy_dir_iterative(
    src: &std::path::Path,
    dest: &std::path::Path,
) -> Result<(), std::io::Error> {
    let mut stack: Vec<(std::path::PathBuf, std::path::PathBuf)> =
        vec![(src.to_path_buf(), dest.to_path_buf())];

    while let Some((src_dir, dest_dir)) = stack.pop() {
        tokio::fs::create_dir_all(&dest_dir).await?;
        let mut read_dir = tokio::fs::read_dir(&src_dir).await?;
        while let Some(entry) = read_dir.next_entry().await? {
            let src_child = entry.path();
            let dest_child = dest_dir.join(entry.file_name());
            // `file_type` does not follow the link; `metadata` does.
            let file_type = entry.file_type().await?;
            if file_type.is_symlink() {
                let target = tokio::fs::read_link(&src_child).await?;
                copy_symlink(&target, &src_child, &dest_child).await?;
            } else if file_type.is_dir() {
                stack.push((src_child, dest_child));
            } else {
                tokio::fs::copy(&src_child, &dest_child).await?;
            }
        }
    }
    Ok(())
}

#[cfg(unix)]
async fn copy_symlink(
    target: &std::path::Path,
    _source: &std::path::Path,
    dest: &std::path::Path,
) -> Result<(), std::io::Error> {
    let _ = tokio::fs::remove_file(dest).await;
    tokio::fs::symlink(target, dest).await
}

#[cfg(windows)]
async fn copy_symlink(
    target: &std::path::Path,
    source: &std::path::Path,
    dest: &std::path::Path,
) -> Result<(), std::io::Error> {
    // Windows keeps file and directory links apart, so the link has to be asked what it
    // points at — the link itself is neither.
    let _ = tokio::fs::remove_file(dest).await;
    let _ = tokio::fs::remove_dir(dest).await;
    let is_dir = tokio::fs::metadata(source)
        .await
        .map(|m| m.is_dir())
        .unwrap_or(false);
    if is_dir {
        tokio::fs::symlink_dir(target, dest).await
    } else {
        tokio::fs::symlink_file(target, dest).await
    }
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
            log::warn!(
                "local_open_with failed: {} with {}: {}",
                file_path,
                program,
                e
            );
            format!("Failed to open {} with {}: {}", file_path, program, e)
        })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn scratch(name: &str) -> std::path::PathBuf {
        let dir = std::env::temp_dir().join(format!("termix-local-fs-{name}"));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).expect("scratch directory");
        dir
    }

    #[tokio::test]
    async fn refuses_to_copy_a_directory_into_itself() {
        let root = scratch("self-copy");
        let source = root.join("source");
        std::fs::create_dir_all(source.join("nested")).expect("source tree");
        std::fs::write(source.join("nested").join("file.txt"), b"hello").expect("file");

        // A directory copy creates its destination before it enumerates the source, so
        // without the guard the destination appears in its own listing and the walk keeps
        // copying its own output until something runs out.
        let into_child = local_copy(
            source.to_string_lossy().into_owned(),
            source.join("inner").to_string_lossy().into_owned(),
            true,
        )
        .await
        .expect_err("a directory copied into itself has to be refused");
        assert!(into_child.contains("into itself"), "{into_child}");

        let onto_self = local_copy(
            source.to_string_lossy().into_owned(),
            source.to_string_lossy().into_owned(),
            true,
        )
        .await
        .expect_err("a directory copied onto itself has to be refused");
        assert!(onto_self.contains("into itself"), "{onto_self}");

        assert!(
            !source.join("inner").exists(),
            "the refused copy must not have created anything first"
        );

        let _ = std::fs::remove_dir_all(&root);
    }

    #[tokio::test]
    async fn still_copies_a_directory_next_to_itself() {
        // The other half of the guard: it has to refuse recursion without refusing the
        // ordinary case, or it just breaks copying.
        let root = scratch("sibling-copy");
        let source = root.join("source");
        std::fs::create_dir_all(source.join("nested")).expect("source tree");
        std::fs::write(source.join("nested").join("file.txt"), b"hello").expect("file");

        local_copy(
            source.to_string_lossy().into_owned(),
            root.join("target").to_string_lossy().into_owned(),
            true,
        )
        .await
        .expect("a sibling copy is ordinary and must succeed");

        assert_eq!(
            std::fs::read_to_string(root.join("target").join("nested").join("file.txt"))
                .expect("copied file"),
            "hello"
        );

        let _ = std::fs::remove_dir_all(&root);
    }
}
