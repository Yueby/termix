import { Button } from "@/components/ui/button";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { createLogger } from "@/lib/logger";
import {
    detectShells,
    syncPull,
    syncPush,
    syncTestConnection,
    type ShellProfile,
} from "@/lib/tauri";
import { terminalThemes } from "@/lib/terminal-themes";
import { cn } from "@/lib/utils";
import { useConnectionStore } from "@/stores/connection-store";
import { useKeychainStore } from "@/stores/keychain-store";
import { useSettingsStore } from "@/stores/settings-store";
import { useSnippetStore } from "@/stores/snippet-store";
import { useUpdateStore } from "@/hooks/use-updater";
import { ArrowLeft, CheckCircle2, ChevronRight, Cloud, ExternalLink, Info, Loader2, RefreshCw, Settings, Terminal, XCircle } from "lucide-react";
import { useEffect, useState } from "react";

const logger = createLogger("settings");

interface SettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const NAV_ITEMS = [
  { id: "general", label: "General", icon: Settings },
  { id: "terminal", label: "Terminal", icon: Terminal },
  { id: "sync", label: "Sync", icon: Cloud },
] as const;

type NavId = (typeof NAV_ITEMS)[number]["id"];

function SettingRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
      <Label className="text-sm shrink-0">{label}</Label>
      <div className="w-full sm:w-auto">{children}</div>
    </div>
  );
}

function useSettingsLogic(active: boolean) {
  const {
    theme, fontFamily, fontSize, cursorStyle, terminalThemeId, defaultShell,
    webdavUrl, webdavUsername, webdavPassword, webdavRemoteDir, syncEncryptionPassword,
    setTheme, setFontFamily, setFontSize, setCursorStyle, setTerminalThemeId, setDefaultShell,
    setWebdavUrl, setWebdavUsername, setWebdavPassword, setWebdavRemoteDir, setSyncEncryptionPassword,
  } = useSettingsStore();

  const [activeNav, setActiveNav] = useState<NavId>("general");
  const [shells, setShells] = useState<ShellProfile[]>([]);
  const [syncStatus, setSyncStatus] = useState<"idle" | "testing" | "pushing" | "pulling">("idle");
  const [syncMessage, setSyncMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  useEffect(() => {
    if (active) {
      detectShells().then(setShells).catch((e) => logger.warn("detectShells failed:", e));
      setSyncMessage(null);
    }
  }, [active]);

  const handleTest = async () => {
    setSyncStatus("testing");
    setSyncMessage(null);
    try {
      const msg = await syncTestConnection();
      setSyncMessage({ type: "success", text: msg });
    } catch (e) {
      setSyncMessage({ type: "error", text: String(e) });
    } finally {
      setSyncStatus("idle");
    }
  };

  const handlePush = async () => {
    setSyncStatus("pushing");
    setSyncMessage(null);
    try {
      const msg = await syncPush();
      setSyncMessage({ type: "success", text: msg });
    } catch (e) {
      setSyncMessage({ type: "error", text: String(e) });
    } finally {
      setSyncStatus("idle");
    }
  };

  const handlePull = async () => {
    setSyncStatus("pulling");
    setSyncMessage(null);
    try {
      const msg = await syncPull();
      await Promise.all([
        useConnectionStore.getState().loadConnections(),
        useSnippetStore.getState().loadSnippets(),
        useKeychainStore.getState().loadItems(),
        useSettingsStore.getState().loadSettings(),
      ]);
      setSyncMessage({ type: "success", text: msg });
    } catch (e) {
      setSyncMessage({ type: "error", text: String(e) });
    } finally {
      setSyncStatus("idle");
    }
  };

  return {
    theme, fontFamily, fontSize, cursorStyle, terminalThemeId, defaultShell,
    webdavUrl, webdavUsername, webdavPassword, webdavRemoteDir, syncEncryptionPassword,
    setTheme, setFontFamily, setFontSize, setCursorStyle, setTerminalThemeId, setDefaultShell,
    setWebdavUrl, setWebdavUsername, setWebdavPassword, setWebdavRemoteDir, setSyncEncryptionPassword,
    activeNav, setActiveNav, shells, syncStatus, syncMessage,
    handleTest, handlePush, handlePull,
    isBusy: syncStatus !== "idle",
  };
}

function SettingsNav({ activeNav, onNavChange }: { activeNav: NavId; onNavChange: (id: NavId) => void }) {
  return (
    <div className="flex flex-col gap-0.5">
      {NAV_ITEMS.map((item) => (
        <button
          key={item.id}
          onClick={() => onNavChange(item.id)}
          className={cn(
            "flex items-center gap-2 rounded-md px-2.5 py-1.5 text-sm transition-colors text-left outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
            activeNav === item.id
              ? "bg-accent text-accent-foreground font-medium"
              : "text-muted-foreground hover:text-foreground hover:bg-accent/50"
          )}
        >
          <item.icon className="h-4 w-4" />
          {item.label}
        </button>
      ))}
    </div>
  );
}

function SettingsBody({ s }: { s: ReturnType<typeof useSettingsLogic> }) {
  return (
    <>
      {s.activeNav === "general" && (
        <div className="space-y-4">
          <h3 className="text-sm font-medium mb-4">General</h3>
          <SettingRow label="Theme">
            <Select value={s.theme} onValueChange={(v) => s.setTheme(v as "dark" | "light" | "system")}>
              <SelectTrigger className="w-full sm:w-[180px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="system">System</SelectItem>
                <SelectItem value="dark">Dark</SelectItem>
                <SelectItem value="light">Light</SelectItem>
              </SelectContent>
            </Select>
          </SettingRow>
        </div>
      )}

      {s.activeNav === "terminal" && (
        <div className="space-y-4">
          <h3 className="text-sm font-medium mb-4">Terminal</h3>
          <SettingRow label="Default Shell">
            <Select value={s.defaultShell} onValueChange={s.setDefaultShell}>
              <SelectTrigger className="w-full sm:w-[220px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="auto">Auto (Recommended)</SelectItem>
                {s.shells.map((sh) => (
                  <SelectItem key={sh.id} value={sh.id}>{sh.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </SettingRow>

          <SettingRow label="Terminal Theme">
            <Select value={s.terminalThemeId} onValueChange={s.setTerminalThemeId}>
              <SelectTrigger className="w-full sm:w-[220px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {terminalThemes.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    <div className="flex items-center gap-2">
                      <div className="h-3 w-3 rounded-full border" style={{ backgroundColor: t.colors.background }} />
                      {t.name}
                      <span className="text-xs text-muted-foreground">{t.variant === "light" ? "Light" : "Dark"}</span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </SettingRow>

          <SettingRow label="Font Family">
            <Input className="w-full sm:w-[220px]" value={s.fontFamily} onChange={(e) => s.setFontFamily(e.target.value)} />
          </SettingRow>

          <SettingRow label="Font Size">
            <Input
              className="w-full sm:w-[100px]"
              type="number"
              min={8}
              max={32}
              value={s.fontSize}
              onChange={(e) => {
                const v = Number(e.target.value);
                if (!Number.isNaN(v) && v >= 8 && v <= 32) s.setFontSize(v);
              }}
            />
          </SettingRow>

          <SettingRow label="Cursor Style">
            <Select value={s.cursorStyle} onValueChange={(v) => s.setCursorStyle(v as "block" | "underline" | "bar")}>
              <SelectTrigger className="w-full sm:w-[180px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="block">Block</SelectItem>
                <SelectItem value="underline">Underline</SelectItem>
                <SelectItem value="bar">Bar</SelectItem>
              </SelectContent>
            </Select>
          </SettingRow>
        </div>
      )}

      {s.activeNav === "sync" && (
        <div className="space-y-4">
          <h3 className="text-sm font-medium mb-4">Cloud Sync</h3>
          <div className="space-y-3">
            <SettingRow label="WebDAV URL">
              <Input className="w-full sm:w-[260px]" placeholder="https://dav.example.com" value={s.webdavUrl} onChange={(e) => s.setWebdavUrl(e.target.value)} />
            </SettingRow>
            <SettingRow label="Username">
              <Input className="w-full sm:w-[200px]" value={s.webdavUsername} onChange={(e) => s.setWebdavUsername(e.target.value)} />
            </SettingRow>
            <SettingRow label="Password">
              <Input className="w-full sm:w-[200px]" type="password" value={s.webdavPassword} onChange={(e) => s.setWebdavPassword(e.target.value)} />
            </SettingRow>
            <SettingRow label="Remote Dir">
              <Input className="w-full sm:w-[200px]" placeholder="/termix" value={s.webdavRemoteDir} onChange={(e) => s.setWebdavRemoteDir(e.target.value)} />
            </SettingRow>
            <SettingRow label="Encryption Key">
              <Input className="w-full sm:w-[200px]" type="password" placeholder="For cross-device sync" value={s.syncEncryptionPassword} onChange={(e) => s.setSyncEncryptionPassword(e.target.value)} />
            </SettingRow>
          </div>

          <div className="flex items-center gap-2 pt-2">
            <Button variant="outline" size="sm" disabled={s.isBusy || !s.webdavUrl} onClick={s.handleTest}>
              {s.syncStatus === "testing" && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
              Test
            </Button>
            <Button variant="outline" size="sm" disabled={s.isBusy || !s.webdavUrl} onClick={s.handlePush}>
              {s.syncStatus === "pushing" && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
              <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
              Push
            </Button>
            <Button variant="outline" size="sm" disabled={s.isBusy || !s.webdavUrl} onClick={s.handlePull}>
              {s.syncStatus === "pulling" && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
              <RefreshCw className="mr-1.5 h-3.5 w-3.5 scale-x-[-1]" />
              Pull
            </Button>
          </div>

          {s.syncMessage && (
            <div className={cn("flex items-center gap-2 text-sm", s.syncMessage.type === "success" ? "text-success" : "text-destructive")}>
              {s.syncMessage.type === "success" ? <CheckCircle2 className="h-4 w-4 shrink-0" /> : <XCircle className="h-4 w-4 shrink-0" />}
              <span className="break-all">{s.syncMessage.text}</span>
            </div>
          )}
        </div>
      )}
    </>
  );
}

export function SettingsDialog({ open, onOpenChange }: SettingsDialogProps) {
  const s = useSettingsLogic(open);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="p-0 gap-0 overflow-hidden sm:max-w-[640px]" onOpenAutoFocus={(e) => e.preventDefault()}>
        <div className="flex h-[420px]">
          <nav className="w-[160px] shrink-0 border-r bg-muted/30 p-3 flex flex-col gap-0.5">
            <DialogHeader className="px-2 pb-3">
              <DialogTitle className="text-sm">Settings</DialogTitle>
            </DialogHeader>
            <SettingsNav activeNav={s.activeNav} onNavChange={s.setActiveNav} />
          </nav>
          <div className="flex-1 min-w-0 overflow-y-auto p-6">
            <SettingsBody s={s} />
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function MobileSettingsPage() {
  const s = useSettingsLogic(true);
  const [activeSection, setActiveSection] = useState<NavId | "about" | null>(null);
  const [direction, setDirection] = useState<"forward" | "back">("forward");
  const [appVersion, setAppVersion] = useState("");

  useEffect(() => {
    import("@tauri-apps/api/app").then((m) => m.getVersion()).then(setAppVersion).catch(() => setAppVersion("0.1.0"));
  }, []);

  const goTo = (section: NavId | "about") => {
    if (section !== "about") s.setActiveNav(section);
    setDirection("forward");
    setActiveSection(section);
  };

  const goBack = () => {
    setDirection("back");
    setActiveSection(null);
  };

  const animClass = direction === "forward" ? "animate-slide-in-right" : "animate-slide-in-left";

  if (activeSection === "about") {
    return (
      <div key="about" className={cn("flex flex-col h-full", animClass)}>
        <div className="flex items-center gap-1.5 px-1.5 py-1.5 border-b shrink-0">
          <button
            className="flex items-center justify-center h-7 w-7 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent/50 active:bg-accent/50 transition-colors"
            onClick={goBack}
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <h2 className="text-sm font-medium">About</h2>
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          <div className="flex flex-col items-center gap-2 py-4">
            <span className="text-lg font-bold">Termix</span>
            <span className="text-xs text-muted-foreground">v{appVersion}</span>
          </div>
          <p className="text-sm text-muted-foreground">A modern, cross-platform SSH terminal client built with Tauri.</p>
          <div className="space-y-1.5 text-sm">
            <div className="flex items-center justify-between rounded-md bg-muted/30 px-3 py-2">
              <span className="text-muted-foreground">Version</span>
              <span className="font-mono text-xs">{appVersion}</span>
            </div>
            <div className="flex items-center justify-between rounded-md bg-muted/30 px-3 py-2">
              <span className="text-muted-foreground">Stack</span>
              <span className="text-xs">Tauri v2 + React + Rust</span>
            </div>
            <button
              className="flex w-full items-center justify-between rounded-md bg-muted/30 px-3 py-2 transition-colors active:bg-accent/50 hover:bg-muted/50"
              onClick={() => import("@tauri-apps/plugin-opener").then((m) => m.openUrl("https://github.com/Yueby/termix"))}
            >
              <span className="text-muted-foreground">GitHub</span>
              <span className="flex items-center gap-1 text-xs text-primary">
                Yueby/termix
                <ExternalLink className="h-3 w-3" />
              </span>
            </button>
            <MobileCheckUpdateButton />
          </div>
        </div>
      </div>
    );
  }

  if (activeSection) {
    return (
      <div key={activeSection} className={cn("flex flex-col h-full", animClass)}>
        <div className="flex items-center gap-1.5 px-1.5 py-1.5 border-b shrink-0">
          <button
            className="flex items-center justify-center h-7 w-7 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent/50 active:bg-accent/50 transition-colors"
            onClick={goBack}
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <h2 className="text-sm font-medium">
            {NAV_ITEMS.find((i) => i.id === activeSection)?.label}
          </h2>
        </div>
        <div className="flex-1 min-w-0 overflow-y-auto p-4">
          <SettingsBody s={s} />
        </div>
      </div>
    );
  }

  return (
    <div key="root" className={cn("flex flex-col h-full", activeSection === null && direction === "back" ? animClass : "")}>
      <div className="flex-1 overflow-y-auto">
        <div className="flex flex-col gap-0.5 p-2">
          {NAV_ITEMS.map((item) => (
            <button
              key={item.id}
              className="flex items-center gap-2.5 w-full rounded-md px-2.5 py-2.5 text-sm text-left transition-colors text-foreground active:bg-accent/50 hover:bg-accent/50"
              onClick={() => goTo(item.id)}
            >
              <item.icon className="h-4 w-4 shrink-0 text-muted-foreground" />
              <span className="flex-1">{item.label}</span>
              <ChevronRight className="h-4 w-4 opacity-40" />
            </button>
          ))}
          <button
            className="flex items-center gap-2.5 w-full rounded-md px-2.5 py-2.5 text-sm text-left transition-colors text-foreground active:bg-accent/50 hover:bg-accent/50"
            onClick={() => goTo("about")}
          >
            <Info className="h-4 w-4 shrink-0 text-muted-foreground" />
            <span className="flex-1">About</span>
            <ChevronRight className="h-4 w-4 opacity-40" />
          </button>
        </div>
      </div>
    </div>
  );
}

function MobileCheckUpdateButton() {
  const { status, checkForUpdate } = useUpdateStore();
  const isChecking = status === "checking";

  return (
    <button
      className="flex w-full items-center justify-between rounded-md bg-muted/30 px-3 py-2 transition-colors active:bg-accent/50 hover:bg-muted/50 disabled:opacity-50"
      onClick={checkForUpdate}
      disabled={isChecking}
    >
      <span className="text-muted-foreground">Update</span>
      <span className="flex items-center gap-1 text-xs">
        {isChecking && <Loader2 className="h-3 w-3 animate-spin" />}
        {status === "error" ? "Check failed" : status === "up-to-date" ? "Up to date" : isChecking ? "Checking..." : "Check for updates"}
      </span>
    </button>
  );
}
