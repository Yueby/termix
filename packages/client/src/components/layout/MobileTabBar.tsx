import { cn } from "@/lib/utils";
import { useSessionStore } from "@/stores/session-store";
import { useUiStore } from "@/stores/ui-store";
import { Home, Settings, Terminal } from "lucide-react";

type MobileTab = "home" | "connection" | "settings";

const TAB_ITEMS: { id: MobileTab; label: string; icon: typeof Home }[] = [
  { id: "home", label: "Home", icon: Home },
  { id: "connection", label: "Connection", icon: Terminal },
  { id: "settings", label: "Settings", icon: Settings },
];

export function MobileTabBar() {
  const { activeView, setActiveView, setSelectedHostId, setEditingHostId, mobileShowSessions, setMobileShowSessions } = useUiStore();
  const { activeTabId, setActiveTab } = useSessionStore();

  const isHome = activeTabId === null;

  function getActiveTab(): MobileTab {
    if (mobileShowSessions) return "connection";
    if (!isHome) return "connection";
    if (activeView === "settings") return "settings";
    return "home";
  }

  const currentTab = getActiveTab();

  const handleTabClick = (tabId: MobileTab) => {
    switch (tabId) {
      case "home":
        setActiveTab(null);
        setActiveView("home");
        setSelectedHostId(null);
        setEditingHostId(null);
        setMobileShowSessions(false);
        break;
      case "connection":
        setActiveTab(null);
        setActiveView("home");
        setMobileShowSessions(true);
        break;
      case "settings":
        setActiveTab(null);
        setActiveView("settings");
        setMobileShowSessions(false);
        break;
    }
  };

  return (
    <div className="flex shrink-0 border-t bg-card safe-area-bottom px-2 pt-1 pb-1">
      {TAB_ITEMS.map((item) => {
        const Icon = item.icon;
        const isActive = currentTab === item.id;
        return (
          <button
            key={item.id}
            className="flex flex-1 flex-col items-center gap-0.5 py-1.5 transition-all active:scale-95 active:opacity-70"
            onClick={() => handleTabClick(item.id)}
          >
            <Icon
              className={cn("h-5 w-5", isActive ? "text-foreground" : "text-muted-foreground")}
              strokeWidth={isActive ? 2.5 : 1.5}
            />
            <span className={cn(
              "text-[10px] leading-tight",
              isActive ? "text-foreground font-medium" : "text-muted-foreground"
            )}>
              {item.label}
            </span>
          </button>
        );
      })}
    </div>
  );
}
