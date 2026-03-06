import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { useSettingsStore } from "@/stores/settings-store";
import { terminalThemes } from "@/lib/terminal-themes";
import { detectShells, type ShellProfile } from "@/lib/tauri";

interface SettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function SettingsDialog({ open, onOpenChange }: SettingsDialogProps) {
  const {
    theme, fontFamily, fontSize, cursorStyle, terminalThemeId, defaultShell,
    setTheme, setFontFamily, setFontSize, setCursorStyle, setTerminalThemeId, setDefaultShell,
  } = useSettingsStore();

  const [shells, setShells] = useState<ShellProfile[]>([]);

  useEffect(() => {
    if (open) {
      detectShells().then(setShells).catch(console.error);
    }
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle>Settings</DialogTitle>
        </DialogHeader>
        <div className="space-y-6 py-4">
          <div>
            <h3 className="mb-3 text-sm font-medium">Appearance</h3>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label>Theme</Label>
                <Select value={theme} onValueChange={(v) => setTheme(v as "dark" | "light")}>
                  <SelectTrigger className="w-[180px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="dark">Dark</SelectItem>
                    <SelectItem value="light">Light</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
          <Separator />
          <div>
            <h3 className="mb-3 text-sm font-medium">Terminal</h3>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label>Default Shell</Label>
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
              </div>
              <div className="flex items-center justify-between">
                <Label>Terminal Theme</Label>
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
              </div>
              <div className="flex items-center justify-between">
                <Label>Font Family</Label>
                <Input
                  className="w-[280px]"
                  value={fontFamily}
                  onChange={(e) => setFontFamily(e.target.value)}
                />
              </div>
              <div className="flex items-center justify-between">
                <Label>Font Size</Label>
                <Input
                  className="w-[100px]"
                  type="number"
                  min={8}
                  max={32}
                  value={fontSize}
                  onChange={(e) => setFontSize(Number(e.target.value))}
                />
              </div>
              <div className="flex items-center justify-between">
                <Label>Cursor Style</Label>
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
              </div>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
