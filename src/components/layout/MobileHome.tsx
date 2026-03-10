import { cn } from "@/lib/utils";
import { useConnectionStore } from "@/stores/connection-store";
import { useKeychainStore } from "@/stores/keychain-store";
import { useSnippetStore } from "@/stores/snippet-store";
import { useUiStore, type NavPage } from "@/stores/ui-store";
import {
    ArrowLeftRight,
    ChevronRight,
    Code2,
    Globe,
    KeyRound,
    ScrollText,
    Server,
} from "lucide-react";

interface NavItem {
  key: NavPage;
  label: string;
  icon: typeof Server;
  countSelector?: () => number;
}

const NAV_ITEMS: NavItem[] = [
  {
    key: "hosts",
    label: "Hosts",
    icon: Server,
    countSelector: () => useConnectionStore.getState().connections.length,
  },
  {
    key: "keychain",
    label: "Keychain",
    icon: KeyRound,
    countSelector: () => useKeychainStore.getState().items.length,
  },
  {
    key: "port-forwarding",
    label: "Port Forwarding",
    icon: ArrowLeftRight,
  },
  {
    key: "snippets",
    label: "Snippets",
    icon: Code2,
    countSelector: () => useSnippetStore.getState().snippets.length,
  },
  {
    key: "known-hosts",
    label: "Known Hosts",
    icon: Globe,
  },
  {
    key: "logs",
    label: "Logs",
    icon: ScrollText,
  },
];

export function MobileHome() {
  const { setNavPage, setMobileHomeOverview } = useUiStore();
  const connectionCount = useConnectionStore((s) => s.connections.length);
  const keychainCount = useKeychainStore((s) => s.items.length);
  const snippetCount = useSnippetStore((s) => s.snippets.length);

  const counts: Record<string, number> = {
    hosts: connectionCount,
    keychain: keychainCount,
    snippets: snippetCount,
  };

  const handleItemClick = (key: NavPage) => {
    setNavPage(key);
    setMobileHomeOverview(false);
  };

  return (
    <div className="flex flex-col h-full bg-content">
      <div className="px-5 pt-5 pb-3">
        <h1 className="text-xl font-bold">Home</h1>
      </div>

      <div className="flex-1 overflow-y-auto px-4">
        <div className="rounded-xl bg-card border overflow-hidden">
          {NAV_ITEMS.map((item, index) => {
            const Icon = item.icon;
            const count = counts[item.key];
            return (
              <button
                key={item.key}
                className={cn(
                  "flex items-center gap-3 w-full px-4 py-3.5 text-left transition-colors active:bg-accent/50",
                  index < NAV_ITEMS.length - 1 && "border-b"
                )}
                onClick={() => handleItemClick(item.key)}
              >
                <div className="flex items-center justify-center h-8 w-8 rounded-md bg-muted text-muted-foreground">
                  <Icon className="h-4 w-4" />
                </div>
                <span className="flex-1 text-sm font-medium">{item.label}</span>
                {count !== undefined && (
                  <span className="text-sm text-muted-foreground tabular-nums">{count}</span>
                )}
                <ChevronRight className="h-4 w-4 text-muted-foreground/50" />
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
