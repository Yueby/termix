import { useEffect } from "react";
import { Terminal, Settings } from "lucide-react";
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

  const handleSelect = (action: () => void) => {
    action();
    setCommandPaletteOpen(false);
  };

  return (
    <CommandDialog open={commandPaletteOpen} onOpenChange={setCommandPaletteOpen}>
      <CommandInput placeholder="Type a command or search..." />
      <CommandList>
        <CommandEmpty>No results found.</CommandEmpty>
        {connections.length > 0 && (
          <CommandGroup heading="Connections">
            {connections.map((conn) => (
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
        )}
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
