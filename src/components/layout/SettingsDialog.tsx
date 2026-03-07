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
import { CheckCircle2, Cloud, Loader2, RefreshCw, Settings, Terminal, XCircle } from "lucide-react";
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
    <div className="flex items-center justify-between gap-4">
      <Label className="text-sm shrink-0">{label}</Label>
      {children}
    </div>
  );
}

export function SettingsDialog({ open, onOpenChange }: SettingsDialogProps) {
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
    if (open) {
      detectShells().then(setShells).catch((e) => logger.warn("detectShells failed:", e));
      setSyncMessage(null);
    }
  }, [open]);

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

  const isBusy = syncStatus !== "idle";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[640px] p-0 gap-0 overflow-hidden" onOpenAutoFocus={(e) => e.preventDefault()}>
        <div className="flex h-[420px]">
          {/* Left nav */}
          <nav className="w-[160px] shrink-0 border-r bg-muted/30 p-3 flex flex-col gap-0.5">
            <DialogHeader className="px-2 pb-3">
              <DialogTitle className="text-sm">Settings</DialogTitle>
            </DialogHeader>
            {NAV_ITEMS.map((item) => (
              <button
                key={item.id}
                onClick={() => setActiveNav(item.id)}
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
          </nav>

          {/* Right content */}
          <div className="flex-1 min-w-0 p-6 overflow-y-auto">
            {activeNav === "general" && (
              <div className="space-y-4">
                <h3 className="text-sm font-medium mb-4">General</h3>
                <SettingRow label="Theme">
                  <Select value={theme} onValueChange={(v) => setTheme(v as "dark" | "light")}>
                    <SelectTrigger className="w-[180px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="dark">Dark</SelectItem>
                      <SelectItem value="light">Light</SelectItem>
                    </SelectContent>
                  </Select>
                </SettingRow>
              </div>
            )}

            {activeNav === "terminal" && (
              <div className="space-y-4">
                <h3 className="text-sm font-medium mb-4">Terminal</h3>
                <SettingRow label="Default Shell">
                  <Select value={defaultShell} onValueChange={setDefaultShell}>
                    <SelectTrigger className="w-[220px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="auto">Auto (Recommended)</SelectItem>
                      {shells.map((s) => (
                        <SelectItem key={s.id} value={s.id}>
                          {s.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </SettingRow>

                <SettingRow label="Terminal Theme">
                  <Select value={terminalThemeId} onValueChange={setTerminalThemeId}>
                    <SelectTrigger className="w-[220px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {terminalThemes.map((t) => (
                        <SelectItem key={t.id} value={t.id}>
                          <div className="flex items-center gap-2">
                            <div
                              className="h-3 w-3 rounded-full border"
                              style={{ backgroundColor: t.colors.background }}
                            />
                            {t.name}
                            <span className="text-xs text-muted-foreground">
                              {t.variant === "light" ? "Light" : "Dark"}
                            </span>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </SettingRow>

                <SettingRow label="Font Family">
                  <Input
                    className="w-[220px]"
                    value={fontFamily}
                    onChange={(e) => setFontFamily(e.target.value)}
                  />
                </SettingRow>

                <SettingRow label="Font Size">
                  <Input
                    className="w-[100px]"
                    type="number"
                    min={8}
                    max={32}
                    value={fontSize}
                    onChange={(e) => {
                  const v = Number(e.target.value);
                  if (!Number.isNaN(v) && v >= 8 && v <= 32) setFontSize(v);
                }}
                  />
                </SettingRow>

                <SettingRow label="Cursor Style">
                  <Select
                    value={cursorStyle}
                    onValueChange={(v) => setCursorStyle(v as "block" | "underline" | "bar")}
                  >
                    <SelectTrigger className="w-[180px]">
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

            {activeNav === "sync" && (
              <div className="space-y-4">
                <h3 className="text-sm font-medium mb-4">Cloud Sync</h3>
                <div className="space-y-3">
                  <SettingRow label="WebDAV URL">
                    <Input
                      className="w-[260px]"
                      placeholder="https://dav.example.com"
                      value={webdavUrl}
                      onChange={(e) => setWebdavUrl(e.target.value)}
                    />
                  </SettingRow>

                  <SettingRow label="Username">
                    <Input
                      className="w-[200px]"
                      value={webdavUsername}
                      onChange={(e) => setWebdavUsername(e.target.value)}
                    />
                  </SettingRow>

                  <SettingRow label="Password">
                    <Input
                      className="w-[200px]"
                      type="password"
                      value={webdavPassword}
                      onChange={(e) => setWebdavPassword(e.target.value)}
                    />
                  </SettingRow>

                  <SettingRow label="Remote Dir">
                    <Input
                      className="w-[200px]"
                      placeholder="/termix"
                      value={webdavRemoteDir}
                      onChange={(e) => setWebdavRemoteDir(e.target.value)}
                    />
                  </SettingRow>

                  <SettingRow label="Encryption Key">
                    <Input
                      className="w-[200px]"
                      type="password"
                      placeholder="For cross-device sync"
                      value={syncEncryptionPassword}
                      onChange={(e) => setSyncEncryptionPassword(e.target.value)}
                    />
                  </SettingRow>
                </div>

                <div className="flex items-center gap-2 pt-2">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={isBusy || !webdavUrl}
                    onClick={handleTest}
                  >
                    {syncStatus === "testing" && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
                    Test
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={isBusy || !webdavUrl}
                    onClick={handlePush}
                  >
                    {syncStatus === "pushing" && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
                    <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
                    Push
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={isBusy || !webdavUrl}
                    onClick={handlePull}
                  >
                    {syncStatus === "pulling" && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
                    <RefreshCw className="mr-1.5 h-3.5 w-3.5 scale-x-[-1]" />
                    Pull
                  </Button>
                </div>

                {syncMessage && (
                  <div className={cn(
                    "flex items-center gap-2 text-sm",
                    syncMessage.type === "success" ? "text-green-600" : "text-destructive"
                  )}>
                    {syncMessage.type === "success" ? (
                      <CheckCircle2 className="h-4 w-4 shrink-0" />
                    ) : (
                      <XCircle className="h-4 w-4 shrink-0" />
                    )}
                    <span className="break-all">{syncMessage.text}</span>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
