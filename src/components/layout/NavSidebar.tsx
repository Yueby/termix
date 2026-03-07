import {
  Server,
  ArrowLeftRight,
  Code2,
  Globe,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useUiStore, type NavPage } from "@/stores/ui-store";

const NAV_ITEMS: { key: NavPage; label: string; icon: typeof Server }[] = [
  { key: "hosts", label: "Hosts", icon: Server },
  { key: "snippets", label: "Snippets", icon: Code2 },
  { key: "port-forwarding", label: "Port Forwarding", icon: ArrowLeftRight },
  { key: "known-hosts", label: "Known Hosts", icon: Globe },
];

export function NavSidebar() {
  const { navPage, setNavPage } = useUiStore();

  return (
    <aside className="flex w-44 flex-col shrink-0 border-r bg-card overflow-hidden">
      <nav className="flex flex-col gap-0.5 p-1.5 mt-1">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const isActive = navPage === item.key;
          return (
            <button
              key={item.key}
              aria-current={isActive ? "page" : undefined}
              className={cn(
                "flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm transition-colors outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
                isActive
                  ? "bg-accent text-accent-foreground font-medium"
                  : "text-muted-foreground hover:text-foreground hover:bg-accent/50"
              )}
              onClick={() => setNavPage(item.key)}
            >
              <Icon className="h-4 w-4 shrink-0" />
              <span className="truncate">{item.label}</span>
            </button>
          );
        })}
      </nav>
    </aside>
  );
}
