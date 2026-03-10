import { createLogger } from "@/lib/logger";
import {
    localCopy,
    localCreateDir,
    localListDir,
    localStat,
    sftpListDir,
    sftpMkdir,
    sftpReadFile,
    sftpWriteFile,
    type FileEntry,
} from "@/lib/tauri";
import { useTransferStore, type TransferDirection } from "@/stores/transfer-store";

const logger = createLogger("transfer");

interface TransferParams {
  sourceFile: FileEntry;
  sourcePath: string;
  destPath: string;
  sourceSessionId: string | null;
  destSessionId: string | null;
  sourceMode: "local" | "remote";
  destMode: "local" | "remote";
}

function isWindowsPath(path: string): boolean {
  return /^[A-Z]:/i.test(path);
}

function joinPath(base: string, name: string, isWin: boolean): string {
  const sep = isWin ? "\\" : "/";
  return base.replace(/[\\/]+$/, "") + sep + name;
}

export async function executeTransfer(params: TransferParams) {
  const {
    sourceFile,
    sourcePath,
    destPath,
    sourceSessionId,
    destSessionId,
    sourceMode,
    destMode,
  } = params;

  const direction: TransferDirection =
    sourceMode === "local" && destMode === "remote"
      ? "upload"
      : sourceMode === "remote" && destMode === "local"
        ? "download"
        : "copy";

  const srcFull = joinPath(sourcePath, sourceFile.name, sourceMode === "local" && isWindowsPath(sourcePath));
  const destFull = joinPath(destPath, sourceFile.name, destMode === "local" && isWindowsPath(destPath));

  const taskId = useTransferStore.getState().addTask({
    direction,
    sourcePath: srcFull,
    destPath: destFull,
    fileName: sourceFile.name,
    totalBytes: sourceFile.is_dir ? 0 : sourceFile.size,
    isDir: sourceFile.is_dir,
    sourceSessionId,
    destSessionId,
  });

  const update = useTransferStore.getState().updateTask;

  try {
    update(taskId, { status: "in_progress" });

    if (sourceMode === "local" && destMode === "local") {
      await localCopy(srcFull, destFull, sourceFile.is_dir);
    } else if (sourceMode === "local" && destMode === "remote" && destSessionId) {
      if (sourceFile.is_dir) {
        await uploadDirRecursive(srcFull, destFull, destSessionId, taskId);
      } else {
        await sftpWriteFile(destSessionId, srcFull, destFull);
      }
    } else if (sourceMode === "remote" && destMode === "local" && sourceSessionId) {
      if (sourceFile.is_dir) {
        await downloadDirRecursive(srcFull, destFull, sourceSessionId, taskId);
      } else {
        await sftpReadFile(sourceSessionId, srcFull, destFull);
      }
    } else if (sourceMode === "remote" && destMode === "remote") {
      throw new Error("Remote-to-remote copy is not yet supported");
    }

    update(taskId, { status: "completed", transferredBytes: sourceFile.size });
  } catch (err) {
    logger.error(`Transfer failed [${direction}]: ${srcFull} -> ${destFull}`, err);
    update(taskId, { status: "failed", error: String(err) });
  }
}

async function uploadDirRecursive(localDir: string, remoteDir: string, sessionId: string, taskId?: string) {
  await sftpMkdir(sessionId, remoteDir);
  const entries = await localListDir(localDir);
  let filesProcessed = 0;
  for (const entry of entries) {
    const localChild = joinPath(localDir, entry.name, isWindowsPath(localDir));
    const remoteChild = remoteDir + "/" + entry.name;
    if (entry.is_dir) {
      await uploadDirRecursive(localChild, remoteChild, sessionId, taskId);
    } else {
      await sftpWriteFile(sessionId, localChild, remoteChild);
      filesProcessed++;
      if (taskId) {
        useTransferStore.getState().updateTask(taskId, {
          fileName: entry.name,
          transferredBytes: filesProcessed,
        });
      }
    }
  }
}

async function downloadDirRecursive(remoteDir: string, localDir: string, sessionId: string, taskId?: string) {
  await localCreateDir(localDir);
  const entries = await sftpListDir(sessionId, remoteDir);
  let filesProcessed = 0;
  for (const entry of entries) {
    const remoteChild = remoteDir + "/" + entry.name;
    const localChild = joinPath(localDir, entry.name, isWindowsPath(localDir));
    if (entry.is_dir) {
      await downloadDirRecursive(remoteChild, localChild, sessionId, taskId);
    } else {
      await sftpReadFile(sessionId, remoteChild, localChild);
      filesProcessed++;
      if (taskId) {
        useTransferStore.getState().updateTask(taskId, {
          fileName: entry.name,
          transferredBytes: filesProcessed,
        });
      }
    }
  }
}

export interface DropTransferParams {
  localPaths: string[];
  destPath: string;
  destMode: "local" | "remote";
  destSessionId: string | null;
}

export async function retryTransferTask(task: import("@/stores/transfer-store").TransferTask) {
  const update = useTransferStore.getState().updateTask;
  try {
    update(task.id, { status: "in_progress" });

    if (task.direction === "upload" && task.destSessionId) {
      if (task.isDir) {
        await uploadDirRecursive(task.sourcePath, task.destPath, task.destSessionId, task.id);
      } else {
        await sftpWriteFile(task.destSessionId, task.sourcePath, task.destPath);
      }
    } else if (task.direction === "download" && task.sourceSessionId) {
      if (task.isDir) {
        await downloadDirRecursive(task.sourcePath, task.destPath, task.sourceSessionId, task.id);
      } else {
        await sftpReadFile(task.sourceSessionId, task.sourcePath, task.destPath);
      }
    } else if (task.direction === "copy") {
      await localCopy(task.sourcePath, task.destPath, task.isDir ?? false);
    }

    update(task.id, { status: "completed", transferredBytes: task.totalBytes });
  } catch (err) {
    logger.error(`Retry failed [${task.direction}]: ${task.sourcePath} -> ${task.destPath}`, err);
    update(task.id, { status: "failed", error: String(err) });
  }
}

export async function executeDropTransfer(params: DropTransferParams) {
  const { localPaths, destPath, destMode, destSessionId } = params;

  for (const srcPath of localPaths) {
    try {
      const fileInfo = await localStat(srcPath);

      const destFull = joinPath(destPath, fileInfo.name, destMode === "local" && isWindowsPath(destPath));
      const direction: TransferDirection = destMode === "remote" ? "upload" : "copy";

      const taskId = useTransferStore.getState().addTask({
        direction,
        sourcePath: srcPath,
        destPath: destFull,
        fileName: fileInfo.name,
        totalBytes: fileInfo.is_dir ? 0 : fileInfo.size,
        isDir: fileInfo.is_dir,
        sourceSessionId: null,
        destSessionId,
      });

      const update = useTransferStore.getState().updateTask;

      try {
        update(taskId, { status: "in_progress" });

        if (destMode === "local") {
          await localCopy(srcPath, destFull, fileInfo.is_dir);
        } else if (destSessionId) {
          if (fileInfo.is_dir) {
            await uploadDirRecursive(srcPath, destFull, destSessionId, taskId);
          } else {
            await sftpWriteFile(destSessionId, srcPath, destFull);
          }
        }

        update(taskId, { status: "completed", transferredBytes: fileInfo.size });
      } catch (err) {
        logger.error(`Drop transfer failed [${direction}]: ${srcPath} -> ${destFull}`, err);
        update(taskId, { status: "failed", error: String(err) });
      }
    } catch (err) {
      logger.error("Failed to stat dropped file:", srcPath, err);
    }
  }
}
