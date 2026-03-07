import { useEffect, useState, useCallback } from "react";
import { KeyRound, X, Import, Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useKeychainStore, isKeychainItemEmpty, type KeychainItem } from "@/stores/keychain-store";
import { useUiStore } from "@/stores/ui-store";
import { importKeyFile } from "@/lib/tauri";
import { open } from "@tauri-apps/plugin-dialog";

export function KeychainDetail() {
  const { editingKeychainId } = useUiStore();
  const { items, updateItem } = useKeychainStore();

  const item = items.find((i) => i.id === editingKeychainId);

  const [name, setName] = useState("");
  const [privateKey, setPrivateKey] = useState("");
  const [passphrase, setPassphrase] = useState("");
  const [showPassphrase, setShowPassphrase] = useState(false);

  const handleClose = useCallback(() => {
    const { editingKeychainId: eid, setEditingKeychainId: setEid, selectedKeychainId, setSelectedKeychainId } = useUiStore.getState();
    if (eid) {
      const i = useKeychainStore.getState().items.find((k) => k.id === eid);
      if (i && isKeychainItemEmpty(i)) {
        useKeychainStore.getState().removeItem(eid);
        if (selectedKeychainId === eid) setSelectedKeychainId(null);
      }
    }
    setEid(null);
  }, []);

  useEffect(() => {
    if (item) {
      setName(item.name);
      setPrivateKey(item.privateKey);
      setPassphrase(item.passphrase);
      setShowPassphrase(false);
    }
  }, [editingKeychainId, item?.id]);

  if (!item) {
    return (
      <div className="flex h-full items-center justify-center text-muted-foreground">
        <p className="text-sm">Select a key to view details</p>
      </div>
    );
  }

  const save = (patch: Partial<KeychainItem>) => {
    updateItem(item.id, patch);
  };

  const handleImportFile = async () => {
    const result = await open({
      title: "Import SSH Key",
      filters: [{ name: "SSH Key Files", extensions: ["pem", "key", "pub", "ppk", "id_rsa", "id_ed25519", "id_ecdsa", "*"] }],
      multiple: false,
    });
    if (!result) return;
    try {
      const content = await importKeyFile(String(result));
      setPrivateKey(content);
      if (!name) {
        const fileName = String(result).split(/[\\/]/).pop() ?? "";
        setName(fileName);
        save({ privateKey: content, name: fileName });
      } else {
        save({ privateKey: content });
      }
    } catch {
      // Error handled by Tauri
    }
  };

  const keyTypeLabel = detectKeyTypeLabel(privateKey);

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between px-4 py-3 border-b">
        <h2 className="text-sm font-semibold">Key Details</h2>
        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={handleClose}>
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>

      <ScrollArea className="flex-1 overflow-hidden">
        <div className="p-4 space-y-5 min-w-0">
          <section>
            <Label className="text-xs text-muted-foreground uppercase tracking-wider">Name</Label>
            <div className="flex items-center gap-3 mt-2">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <KeyRound className="h-5 w-5" />
              </div>
              <Input
                placeholder="Key name"
                value={name}
                onChange={(e) => { setName(e.target.value); save({ name: e.target.value }); }}
              />
            </div>
          </section>

          <Separator />

          <section className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs text-muted-foreground uppercase tracking-wider">Private Key</Label>
              {keyTypeLabel && (
                <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded">{keyTypeLabel}</span>
              )}
            </div>
            <Textarea
              className="min-h-[200px] font-mono text-xs resize-none break-all overflow-x-hidden"
              placeholder="Paste private key content here or import from file..."
              value={privateKey}
              onChange={(e) => { setPrivateKey(e.target.value); save({ privateKey: e.target.value }); }}
            />
            <Button variant="outline" size="sm" className="gap-1.5" onClick={handleImportFile}>
              <Import className="h-3.5 w-3.5" /> Import from File
            </Button>
          </section>

          <Separator />

          <section className="space-y-2">
            <Label className="text-xs text-muted-foreground uppercase tracking-wider">
              Passphrase
            </Label>
            <div className="relative">
              <Input
                type={showPassphrase ? "text" : "password"}
                placeholder="Key passphrase (optional)"
                className="pr-9"
                value={passphrase}
                onChange={(e) => { setPassphrase(e.target.value); save({ passphrase: e.target.value }); }}
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7"
                onClick={() => setShowPassphrase(!showPassphrase)}
              >
                {showPassphrase ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
              </Button>
            </div>
          </section>
        </div>
      </ScrollArea>
    </div>
  );
}

function detectKeyTypeLabel(content: string): string {
  if (!content) return "";
  if (content.includes("RSA")) return "RSA";
  if (content.includes("ED25519") || content.includes("ed25519")) return "Ed25519";
  if (content.includes("EC") || content.includes("ECDSA")) return "ECDSA";
  if (content.includes("OPENSSH")) return "OpenSSH";
  if (content.includes("BEGIN")) return "PEM";
  return "";
}
