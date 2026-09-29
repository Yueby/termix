use std::collections::HashMap;
use std::io::{Read, Write};
use std::path::Path;
use std::sync::Arc;

use anyhow::{anyhow, Result};
use portable_pty::{native_pty_system, CommandBuilder, MasterPty, PtySize};
use serde::Serialize;
use tauri::ipc::{Channel, InvokeResponseBody};
use tauri::{AppHandle, Emitter};
use tokio::sync::Mutex;

#[derive(Clone, Serialize)]
pub struct LocalDisconnectEvent {
    pub session_id: String,
    pub reason: String,
}

#[derive(Clone, Serialize, Debug)]
pub struct ShellProfile {
    pub id: String,
    pub name: String,
    pub path: String,
    pub args: Vec<String>,
}

struct LocalSession {
    /// Input is handed to a dedicated thread rather than written here. A shell that stops
    /// reading its input fills the PTY pipe, and a blocking write would then hold the
    /// session map's lock for as long as that lasts — freezing every other local terminal,
    /// including the close that would have killed the process at fault.
    writer_tx: std::sync::mpsc::Sender<Vec<u8>>,
    master: Box<dyn MasterPty + Send>,
    child: Box<dyn portable_pty::Child + Send + Sync>,
}

pub struct LocalTerminalManager {
    sessions: Arc<Mutex<HashMap<String, LocalSession>>>,
}

impl LocalTerminalManager {
    pub fn new() -> Self {
        Self {
            sessions: Arc::new(Mutex::new(HashMap::new())),
        }
    }

    #[allow(clippy::too_many_arguments)]
    pub async fn spawn(
        &self,
        app: AppHandle,
        session_id: String,
        cols: u16,
        rows: u16,
        shell: Option<String>,
        shell_args: Option<Vec<String>>,
        on_data: Channel<InvokeResponseBody>,
    ) -> Result<String> {
        let pty_system = native_pty_system();
        let pair = pty_system.openpty(PtySize {
            rows,
            cols,
            pixel_width: 0,
            pixel_height: 0,
        })?;

        let shell_path = shell.unwrap_or_else(auto_detect_best_shell);
        let mut cmd = CommandBuilder::new(&shell_path);
        if let Some(args) = shell_args {
            for arg in &args {
                cmd.arg(arg);
            }
        }

        let child = pair.slave.spawn_command(cmd)?;
        drop(pair.slave);

        let reader = pair.master.try_clone_reader()?;
        let writer = pair.master.take_writer()?;

        // One writer thread per session, fed by a queue. Writing from the command handler
        // would block on a full PTY pipe while holding the session map's lock; queueing
        // keeps the handler responsive and confines the block to this thread.
        let (writer_tx, writer_rx) = std::sync::mpsc::channel::<Vec<u8>>();
        std::thread::spawn(move || {
            let mut writer = writer;
            for chunk in writer_rx {
                if let Err(error) = writer.write_all(&chunk).and_then(|()| writer.flush()) {
                    log::warn!("Local terminal writer stopped: {error}");
                    break;
                }
            }
        });

        let session = LocalSession {
            writer_tx,
            master: pair.master,
            child,
        };

        self.sessions
            .lock()
            .await
            .insert(session_id.clone(), session);

        log::info!(
            "Local terminal spawned: session={}, shell={}",
            session_id,
            shell_path
        );

        let sid = session_id.clone();
        let sessions = self.sessions.clone();
        std::thread::spawn(move || {
            std::thread::sleep(std::time::Duration::from_millis(200));
            let mut reader = reader;
            let mut buf = [0u8; 8192];
            let mut delivery_failures: u64 = 0;
            let reason = loop {
                match reader.read(&mut buf) {
                    Ok(0) => break "the shell exited".to_string(),
                    Ok(n) => {
                        // Raw bytes over the channel: the webview gets an ArrayBuffer.
                        if let Err(error) = on_data.send(InvokeResponseBody::Raw(buf[..n].to_vec()))
                        {
                            // A missed delivery is not the process exiting: keep reading.
                            delivery_failures += 1;
                            if delivery_failures == 1 {
                                log::warn!(
                                    "Session {sid}: could not deliver output to the frontend: {error}"
                                );
                            }
                        }
                    }
                    Err(error) => break format!("could not read from the terminal: {error}"),
                }
            };
            log::info!(
                "Local session {sid} ended: {reason} (undelivered output chunks: {delivery_failures})"
            );

            // Take the entry out. Without this the map keeps a live-looking session for
            // every shell that has exited, and everything behind it — the PTY, the writer
            // thread, the process handle — stays around for the life of the app.
            let ended = {
                let mut map = sessions.blocking_lock();
                map.remove(&sid)
            };
            // Reap the child. `kill` terminates a process but does not collect it, and a
            // shell the user exited with `exit` was never reaped at all, so on Unix each
            // one left a zombie until the app closed.
            if let Some(mut ended) = ended {
                if let Err(error) = ended.child.wait() {
                    log::warn!("Session {sid}: could not reap the child process: {error}");
                }
            }

            let _ = app.emit(
                "local_disconnect",
                &LocalDisconnectEvent {
                    session_id: sid,
                    reason,
                },
            );
        });

        Ok(session_id)
    }

    pub async fn write(&self, session_id: &str, data: &[u8]) -> Result<()> {
        // The lock is released before the send, and the send queues the bytes rather than
        // handing them to the PTY, so neither the map nor this task can be held up by a
        // shell that has stopped reading.
        let writer = {
            let sessions = self.sessions.lock().await;
            sessions
                .get(session_id)
                .map(|session| session.writer_tx.clone())
                .ok_or_else(|| anyhow!("Local session not found: {}", session_id))?
        };
        writer
            .send(data.to_vec())
            .map_err(|_| anyhow!("Local session {} is no longer accepting input", session_id))
    }

    pub async fn resize(&self, session_id: &str, cols: u16, rows: u16) -> Result<()> {
        let sessions = self.sessions.lock().await;
        let session = sessions
            .get(session_id)
            .ok_or_else(|| anyhow!("Local session not found: {}", session_id))?;
        session
            .master
            .resize(PtySize {
                rows,
                cols,
                pixel_width: 0,
                pixel_height: 0,
            })
            .map_err(|e| anyhow!("Resize failed: {}", e))?;
        Ok(())
    }

    pub async fn close(&self, session_id: &str) -> Result<()> {
        let session = self.sessions.lock().await.remove(session_id);
        if let Some(mut session) = session {
            if let Err(e) = session.child.kill() {
                log::warn!(
                    "Failed to kill local terminal process {}: {}",
                    session_id,
                    e
                );
            }
            // Reap it. `kill` terminates the process but does not collect it, so without
            // this every closed terminal leaves a zombie behind.
            if let Err(e) = session.child.wait() {
                log::warn!(
                    "Failed to reap local terminal process {}: {}",
                    session_id,
                    e
                );
            }
        }
        Ok(())
    }
}

fn auto_detect_best_shell() -> String {
    #[cfg(target_os = "windows")]
    {
        if which_exists("pwsh") {
            return "pwsh.exe".to_string();
        }
        "powershell.exe".to_string()
    }
    #[cfg(not(target_os = "windows"))]
    {
        std::env::var("SHELL").unwrap_or_else(|_| "/bin/bash".to_string())
    }
}

fn which_exists(name: &str) -> bool {
    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("where")
            .arg(name)
            .stdout(std::process::Stdio::null())
            .stderr(std::process::Stdio::null())
            .status()
            .map(|s| s.success())
            .unwrap_or(false)
    }
    #[cfg(not(target_os = "windows"))]
    {
        std::process::Command::new("which")
            .arg(name)
            .stdout(std::process::Stdio::null())
            .stderr(std::process::Stdio::null())
            .status()
            .map(|s| s.success())
            .unwrap_or(false)
    }
}

pub fn detect_available_shells() -> Vec<ShellProfile> {
    let mut shells = Vec::new();

    #[cfg(target_os = "windows")]
    {
        detect_windows_shells(&mut shells);
    }

    #[cfg(not(target_os = "windows"))]
    {
        detect_unix_shells(&mut shells);
    }

    shells
}

#[cfg(target_os = "windows")]
fn detect_windows_shells(shells: &mut Vec<ShellProfile>) {
    if which_exists("pwsh") {
        shells.push(ShellProfile {
            id: "pwsh".to_string(),
            name: "PowerShell 7+".to_string(),
            path: "pwsh.exe".to_string(),
            args: vec![],
        });
    }

    let ps_path = r"C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe";
    if Path::new(ps_path).exists() {
        shells.push(ShellProfile {
            id: "powershell".to_string(),
            name: "Windows PowerShell".to_string(),
            path: ps_path.to_string(),
            args: vec![],
        });
    }

    let cmd_path = r"C:\Windows\System32\cmd.exe";
    if Path::new(cmd_path).exists() {
        shells.push(ShellProfile {
            id: "cmd".to_string(),
            name: "Command Prompt".to_string(),
            path: cmd_path.to_string(),
            args: vec![],
        });
    }

    for git_bash in &[
        r"C:\Program Files\Git\bin\bash.exe",
        r"C:\Program Files (x86)\Git\bin\bash.exe",
    ] {
        if Path::new(git_bash).exists() {
            shells.push(ShellProfile {
                id: "git-bash".to_string(),
                name: "Git Bash".to_string(),
                path: git_bash.to_string(),
                args: vec!["--login".to_string(), "-i".to_string()],
            });
            break;
        }
    }

    detect_wsl_distros(shells);
}

#[cfg(target_os = "windows")]
fn detect_wsl_distros(shells: &mut Vec<ShellProfile>) {
    let output = std::process::Command::new("wsl")
        .args(["--list", "--quiet"])
        .output();

    if let Ok(out) = output {
        if out.status.success() {
            let raw_bytes = &out.stdout;
            let u16s: Vec<u16> = raw_bytes
                .chunks_exact(2)
                .map(|c| u16::from_le_bytes([c[0], c[1]]))
                .collect();
            let raw = String::from_utf16_lossy(&u16s);
            for line in raw.lines() {
                let distro = line.trim().trim_start_matches('\u{feff}');
                if distro.is_empty() {
                    continue;
                }
                let id = format!("wsl-{}", distro.to_lowercase().replace(' ', "-"));
                shells.push(ShellProfile {
                    id,
                    name: format!("{} (WSL)", distro),
                    path: "wsl.exe".to_string(),
                    args: vec!["-d".to_string(), distro.to_string()],
                });
            }
        }
    }
}

#[cfg(not(target_os = "windows"))]
fn detect_unix_shells(shells: &mut Vec<ShellProfile>) {
    if let Ok(content) = std::fs::read_to_string("/etc/shells") {
        for line in content.lines() {
            let line = line.trim();
            if line.is_empty() || line.starts_with('#') {
                continue;
            }
            if !Path::new(line).exists() {
                continue;
            }
            let name = Path::new(line)
                .file_name()
                .and_then(|n| n.to_str())
                .unwrap_or(line);
            let id = name.to_string();
            let display = match name {
                "zsh" => "Zsh",
                "bash" => "Bash",
                "fish" => "Fish",
                "sh" => "Shell (sh)",
                "dash" => "Dash",
                "ksh" => "Korn Shell",
                "tcsh" => "Tcsh",
                "csh" => "C Shell",
                other => other,
            };
            if shells.iter().any(|s| s.id == id) {
                continue;
            }
            shells.push(ShellProfile {
                id,
                name: display.to_string(),
                path: line.to_string(),
                args: vec![],
            });
        }
    }

    if shells.is_empty() {
        let fallback = std::env::var("SHELL").unwrap_or_else(|_| "/bin/bash".to_string());
        let name = Path::new(&fallback)
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("bash");
        shells.push(ShellProfile {
            id: name.to_string(),
            name: name.to_string(),
            path: fallback,
            args: vec![],
        });
    }
}
