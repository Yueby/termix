import { invoke } from "@tauri-apps/api/core";

export interface ConnectPayload {
  host: string;
  port: number;
  username: string;
  auth_method:
    | { type: "password"; password: string }
    | { type: "key"; key_path: string; passphrase?: string };
}

export interface ConnectResult {
  session_id: string;
}

export interface FileEntry {
  name: string;
  is_dir: boolean;
  size: number;
  modified?: number;
}

// SSH commands
export const sshConnect = (payload: ConnectPayload) =>
  invoke<ConnectResult>("ssh_connect", { payload });

export const sshDisconnect = (sessionId: string) =>
  invoke<void>("ssh_disconnect", { sessionId });

export const sshWrite = (sessionId: string, data: number[]) =>
  invoke<void>("ssh_write", { sessionId, data });

export const sshResize = (sessionId: string, cols: number, rows: number) =>
  invoke<void>("ssh_resize", { sessionId, cols, rows });

export const sshListSessions = () =>
  invoke<string[]>("ssh_list_sessions");

// SFTP commands
export const sftpListDir = (sessionId: string, path: string) =>
  invoke<FileEntry[]>("sftp_list_dir", { sessionId, path });

export const sftpReadFile = (sessionId: string, remotePath: string, localPath: string) =>
  invoke<void>("sftp_read_file", { sessionId, remotePath, localPath });

export const sftpWriteFile = (sessionId: string, localPath: string, remotePath: string) =>
  invoke<void>("sftp_write_file", { sessionId, localPath, remotePath });

export const sftpMkdir = (sessionId: string, path: string) =>
  invoke<void>("sftp_mkdir", { payload: { session_id: sessionId, path } });

export const sftpRemove = (sessionId: string, path: string) =>
  invoke<void>("sftp_remove", { sessionId, path });

// Local terminal commands
export interface LocalOpenResult {
  session_id: string;
}

export interface ShellProfile {
  id: string;
  name: string;
  path: string;
  args: string[];
}

export const localOpen = (
  cols: number,
  rows: number,
  shell?: string,
  shellArgs?: string[]
) =>
  invoke<LocalOpenResult>("local_open", { cols, rows, shell: shell ?? null, shellArgs: shellArgs ?? null });

export const detectShells = () =>
  invoke<ShellProfile[]>("detect_shells");

export const localWrite = (sessionId: string, data: number[]) =>
  invoke<void>("local_write", { sessionId, data });

export const localResize = (sessionId: string, cols: number, rows: number) =>
  invoke<void>("local_resize", { sessionId, cols, rows });

export const localClose = (sessionId: string) =>
  invoke<void>("local_close", { sessionId });

// Connection CRUD
export interface ConnectionInfo {
  id: string;
  name: string;
  host: string;
  port: number;
  username: string;
  authType: string;
  group: string;
  password: string;
  keyPath: string;
  keyPassphrase: string;
}

export const getConnections = () =>
  invoke<ConnectionInfo[]>("get_connections");

export const saveConnection = (conn: ConnectionInfo) =>
  invoke<void>("save_connection", { conn });

export const deleteConnection = (id: string) =>
  invoke<void>("delete_connection", { id });

// Settings CRUD
export interface AppSettings {
  theme: string;
  fontFamily: string;
  fontSize: number;
  cursorStyle: string;
  scrollBack: number;
  terminalThemeId: string;
  defaultShell: string;
  webdavUrl: string;
  webdavUsername: string;
  webdavPassword: string;
  webdavRemoteDir: string;
}

export const getSettings = () =>
  invoke<AppSettings>("get_settings");

export const saveSettings = (settings: AppSettings) =>
  invoke<void>("save_settings", { settings });

// Snippet CRUD
export interface Snippet {
  id: string;
  name: string;
  content: string;
  tags: string[];
}

export const getSnippets = () =>
  invoke<Snippet[]>("get_snippets");

export const saveSnippet = (snippet: Snippet) =>
  invoke<void>("save_snippet", { snippet });

export const deleteSnippet = (id: string) =>
  invoke<void>("delete_snippet", { id });

// Sync
export const syncPush = () =>
  invoke<string>("sync_push");

export const syncPull = () =>
  invoke<string>("sync_pull");

export const syncTestConnection = () =>
  invoke<string>("sync_test_connection");
