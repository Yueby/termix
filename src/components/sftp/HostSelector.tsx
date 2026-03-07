import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { useConnectionStore } from "@/stores/connection-store";
import { useSftpStore, type PanelSide } from "@/stores/sftp-store";
import { Server } from "lucide-react";

interface HostSelectorProps {
  side: PanelSide;
}

export function HostSelector({ side }: HostSelectorProps) {
  const startConnect = useSftpStore((s) => s.startConnect);
  const { connections } = useConnectionStore();

  const handleSelectHost = (id: string) => {
    const conn = connections.find((c) => c.id === id);
    if (!conn) return;
    startConnect(side, conn);
  };

  if (connections.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-3 text-muted-foreground">
        <Server className="h-10 w-10 opacity-30" />
        <p className="text-sm font-medium">No hosts configured</p>
        <p className="text-xs">Add hosts in the Hosts tab first.</p>
      </div>
    );
  }

  return (
    <ScrollArea className="flex-1">
      <div className="p-2 space-y-0.5">
        {connections.map((conn) => (
          <button
            key={conn.id}
            className={cn(
              "w-full flex items-center gap-2.5 rounded-md px-3 py-2.5 text-sm transition-colors text-left",
              "hover:bg-accent/50 outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
            )}
            onDoubleClick={() => handleSelectHost(conn.id)}
          >
            <Server className="h-4 w-4 shrink-0 text-muted-foreground" />
            <div className="min-w-0">
              <p className="truncate font-medium text-xs">
                {conn.name || conn.host}
              </p>
              <p className="truncate text-[10px] text-muted-foreground">
                {conn.username}@{conn.host}:{conn.port}
              </p>
            </div>
          </button>
        ))}
      </div>
    </ScrollArea>
  );
}
