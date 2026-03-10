import { useIsMobile } from "@/hooks/use-mobile";
import { createLogger } from "@/lib/logger";
import { cn } from "@/lib/utils";
import { executeDropTransfer } from "@/lib/transfer";
import { useSftpStore, type PanelSide } from "@/stores/sftp-store";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { useCallback, useEffect, useRef, useState } from "react";
import { FilePanel } from "./FilePanel";
import { TransferBar } from "./TransferBar";

const logger = createLogger("sftp-page");

export function SftpPage() {
  const init = useSftpStore((s) => s.init);
  const isMobile = useIsMobile();
  const [dragTarget, setDragTarget] = useState<PanelSide | null>(null);
  const [activeSide, setActiveSide] = useState<PanelSide>("left");
  const leftRef = useRef<HTMLDivElement>(null);
  const rightRef = useRef<HTMLDivElement>(null);

  const resolveSide = useCallback((physX: number, physY: number): PanelSide | null => {
    const ratio = window.devicePixelRatio || 1;
    const x = physX / ratio;
    const y = physY / ratio;

    const leftRect = leftRef.current?.getBoundingClientRect();
    const rightRect = rightRef.current?.getBoundingClientRect();

    if (leftRect && x >= leftRect.left && x <= leftRect.right && y >= leftRect.top && y <= leftRect.bottom) {
      return "left";
    }
    if (rightRect && x >= rightRect.left && x <= rightRect.right && y >= rightRect.top && y <= rightRect.bottom) {
      return "right";
    }
    return null;
  }, []);

  useEffect(() => {
    init();
  }, [init]);

  useEffect(() => {
    const unlisten = getCurrentWindow().onDragDropEvent((event) => {
      const payload = event.payload;

      if (payload.type === "enter" || payload.type === "over") {
        const pos = payload.position;
        const side = resolveSide(pos.x, pos.y);
        if (side) {
          const panel = useSftpStore.getState()[side === "left" ? "leftPanel" : "rightPanel"];
          setDragTarget(panel.view === "files" ? side : null);
        } else {
          setDragTarget(null);
        }
      } else if (payload.type === "drop") {
        const pos = payload.position;
        const side = resolveSide(pos.x, pos.y);
        setDragTarget(null);

        if (side && payload.paths.length > 0) {
          const panel = useSftpStore.getState()[side === "left" ? "leftPanel" : "rightPanel"];
          if (panel.view === "files") {
            void executeDropTransfer({
              localPaths: payload.paths,
              destPath: panel.currentPath,
              destMode: panel.mode,
              destSessionId: panel.sftpSessionId,
            }).then(() => {
              useSftpStore.getState().refresh(side);
            }).catch((e) => logger.error("Drop transfer failed:", e));
          }
        }
      } else if (payload.type === "leave") {
        setDragTarget(null);
      }
    });

    return () => {
      unlisten.then((fn) => fn());
    };
  }, [resolveSide]);

  if (isMobile) {
    return (
      <div className="flex flex-col h-full">
        <div className="flex shrink-0 border-b bg-card">
          <button
            className={cn(
              "flex-1 py-2 text-xs font-medium transition-colors",
              activeSide === "left"
                ? "border-b-2 border-primary text-primary"
                : "text-muted-foreground"
            )}
            onClick={() => setActiveSide("left")}
          >
            Left Panel
          </button>
          <button
            className={cn(
              "flex-1 py-2 text-xs font-medium transition-colors",
              activeSide === "right"
                ? "border-b-2 border-primary text-primary"
                : "text-muted-foreground"
            )}
            onClick={() => setActiveSide("right")}
          >
            Right Panel
          </button>
        </div>
        <div className="flex-1 min-h-0 overflow-hidden">
          <div ref={activeSide === "left" ? leftRef : rightRef} className="h-full">
            <FilePanel side={activeSide} isDragOver={dragTarget === activeSide} />
          </div>
        </div>
        <TransferBar />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex flex-1 min-h-0">
        <div ref={leftRef} className="flex-1 min-w-0 border-r overflow-hidden">
          <FilePanel side="left" isDragOver={dragTarget === "left"} />
        </div>
        <div ref={rightRef} className="flex-1 min-w-0 overflow-hidden">
          <FilePanel side="right" isDragOver={dragTarget === "right"} />
        </div>
      </div>
      <TransferBar />
    </div>
  );
}
