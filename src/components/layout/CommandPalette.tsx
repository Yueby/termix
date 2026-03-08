import {
    CommandDialog,
    CommandEmpty,
    CommandGroup,
    CommandInput,
    CommandItem,
    CommandList,
    CommandSeparator,
} from "@/components/ui/command";
import { useConnectionStore, type ConnectionInfo } from "@/stores/connection-store";
import { useUiStore } from "@/stores/ui-store";
import { Settings, Terminal } from "lucide-react";
import { useEffect, useMemo } from "react";

interface CommandPaletteProps {
  onConnect: (connection: ConnectionInfo) => void;
}

export function CommandPalette({ onConnect }: CommandPaletteProps) {
  const { commandPaletteOpen, setCommandPaletteOpen, setSettingsOpen } = useUiStore();
  const { connections } = useConnectionStore();

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        const current = useUiStore.getState().commandPaletteOpen;
        setCommandPaletteOpen(!current);
      }
    };
    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
  }, [setCommandPaletteOpen]);

  const grouped = useMemo(() => {
    const map = new Map<string, ConnectionInfo[]>();
    for (const conn of connections) {
      const g = conn.group || "Default";
      if (!map.has(g)) map.set(g, []);
      map.get(g)!.push(conn);
    }
    const entries = [...map.entries()];
    entries.sort(([a], [b]) => {
      if (a === "Default") return -1;
      if (b === "Default") return 1;
      return a.localeCompare(b);
    });
    return entries;
  }, [connections]);

  const handleSelect = (action: () => void) => {
    action();
    setCommandPaletteOpen(false);
  };

  return (
    <CommandDialog open={commandPaletteOpen} onOpenChange={setCommandPaletteOpen}>
      <CommandInput placeholder="Type a command or search..." />
      <CommandList>
        <CommandEmpty>No results found.</CommandEmpty>
        {grouped.map(([groupName, conns]) => (
          <CommandGroup key={groupName} heading={groupName}>
            {conns.map((conn) => (
              <CommandItem
                key={conn.id}
                onSelect={() => handleSelect(() => onConnect(conn))}
              >
                <Terminal className="mr-2 h-4 w-4" />
                <span>{conn.name || conn.host}</span>
                <span className="ml-auto text-xs text-muted-foreground">
                  {conn.username}@{conn.host}
                </span>
              </CommandItem>
            ))}
          </CommandGroup>
        ))}
        <CommandSeparator />
        <CommandGroup heading="Actions">
          <CommandItem onSelect={() => handleSelect(() => setSettingsOpen(true))}>
            <Settings className="mr-2 h-4 w-4" />
            <span>Settings</span>
          </CommandItem>
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}
