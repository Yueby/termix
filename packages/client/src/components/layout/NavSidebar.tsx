import { Sheet, SheetContent } from "@/components/ui/sheet";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";
import { useSessionStore } from "@/stores/session-store";
import { useUiStore, type NavPage } from "@/stores/ui-store";
import {
    ArrowLeftRight,
    Code2,
    Globe,
    KeyRound,
    ScrollText,
    Server,
} from "lucide-react";

const NAV_ITEMS: { key: NavPage; label: string; icon: typeof Server }[] = [
  { key: "hosts", label: "Hosts", icon: Server },
  { key: "keychain", label: "Keychain", icon: KeyRound },
  { key: "snippets", label: "Snippets", icon: Code2 },
  { key: "port-forwarding", label: "Port Forwarding", icon: ArrowLeftRight },
  { key: "known-hosts", label: "Known Hosts", icon: Globe },
  { key: "logs", label: "Logs", icon: ScrollText },
];

function DesktopNavContent() {
  const { navPage, setNavPage } = useUiStore();

  return (
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
  );
}

function MobileNavContent() {
  const { navPage, setNavPage, setMobileNavOpen, setActiveView, setMobileShowSessions } = useUiStore();
  const { setActiveTab } = useSessionStore();

  const handleItemClick = (key: NavPage) => {
    setNavPage(key);
    setActiveView("home");
    setMobileShowSessions(false);
    setActiveTab(null);
    setMobileNavOpen(false);
  };

  return (
    <div className="flex flex-col h-full bg-card">
      <nav className="flex flex-col gap-0.5 p-1.5 mt-4">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const isActive = navPage === item.key;
          return (
            <button
              key={item.key}
              aria-current={isActive ? "page" : undefined}
              className={cn(
                "flex items-center gap-2.5 rounded-md px-2.5 py-2.5 text-sm transition-colors outline-none",
                isActive
                  ? "bg-accent text-accent-foreground font-medium"
                  : "text-muted-foreground active:bg-accent/50"
              )}
              onClick={() => handleItemClick(item.key)}
            >
              <Icon className="h-4 w-4 shrink-0" />
              <span className="truncate">{item.label}</span>
            </button>
          );
        })}
      </nav>
    </div>
  );
}

export function NavSidebar() {
  const isMobile = useIsMobile();
  const { mobileNavOpen, setMobileNavOpen } = useUiStore();

  if (isMobile) {
    return (
      <Sheet open={mobileNavOpen} onOpenChange={setMobileNavOpen}>
        <SheetContent side="left" showCloseButton={false} className="w-56 p-0">
          <MobileNavContent />
        </SheetContent>
      </Sheet>
    );
  }

  return (
    <aside className="flex w-44 flex-col shrink-0 border-r bg-card overflow-hidden">
      <DesktopNavContent />
    </aside>
  );
}
