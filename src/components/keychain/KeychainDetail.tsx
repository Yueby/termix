import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { createLogger } from "@/lib/logger";
import { generateSshKey, importKeyFile } from "@/lib/tauri";
import { cn } from "@/lib/utils";
import { isKeychainItemEmpty, useKeychainStore, type KeychainItem } from "@/stores/keychain-store";
import { useUiStore } from "@/stores/ui-store";
import { open } from "@tauri-apps/plugin-dialog";
import { Eye, EyeOff, Import, KeyRound, Loader2, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

const logger = createLogger("keychain-detail");

export function KeychainDetail() {
  const { editingKeychainId, keychainGenerateMode, setKeychainGenerateMode } = useUiStore();
  const { items, updateItem } = useKeychainStore();

  const item = items.find((i) => i.id === editingKeychainId);

  const [name, setName] = useState("");
  const [privateKey, setPrivateKey] = useState("");
  const [publicKey, setPublicKey] = useState("");
  const [certificate, setCertificate] = useState("");
  const [passphrase, setPassphrase] = useState("");
  const [showPassphrase, setShowPassphrase] = useState(false);

  const [genKeyType, setGenKeyType] = useState<string>("ed25519");
  const [genBits, setGenBits] = useState<number>(0);
  const [genLoading, setGenLoading] = useState(false);

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
    setKeychainGenerateMode(false);
  }, [setKeychainGenerateMode]);

  const handleGenerate = useCallback(async () => {
    if (!item) return;
    setGenLoading(true);
    try {
      const keyTypeParam = genKeyType;
      const bits = genKeyType === "rsa" && genBits > 0 ? genBits : undefined;
      const result = await generateSshKey(keyTypeParam, bits);
      const generatedName = name || `Generated ${genKeyType.toUpperCase()}`;
      setPrivateKey(result.privateKey);
      setPublicKey(result.publicKey);
      if (!name) setName(generatedName);
      updateItem(item.id, {
        name: generatedName,
        keyType: result.keyType,
        privateKey: result.privateKey,
        publicKey: result.publicKey,
        passphrase,
      });
      setKeychainGenerateMode(false);
    } catch (e) {
      logger.error("Failed to generate SSH key:", e);
    } finally {
      setGenLoading(false);
    }
  }, [item, genKeyType, genBits, name, passphrase, updateItem, setKeychainGenerateMode]);

  useEffect(() => {
    if (item) {
      setName(item.name);
      setPrivateKey(item.privateKey);
      setPublicKey(item.publicKey ?? "");
      setCertificate(item.certificate ?? "");
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

  if (keychainGenerateMode) {
    const ecdsaCurves = [
      { value: "ecdsa-521", label: "521" },
      { value: "ecdsa-384", label: "384" },
      { value: "ecdsa-256", label: "256" },
    ];
    const rsaSizes = [
      { value: 4096, label: "4096" },
      { value: 2048, label: "2048" },
    ];

    return (
      <div className="flex h-full flex-col">
        <div className="flex items-center justify-between px-4 py-3 border-b">
          <h2 className="text-sm font-semibold">Generate Key</h2>
          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={handleClose}>
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
        <ScrollArea className="flex-1 overflow-hidden">
          <div className="p-4 space-y-5 min-w-0">
            <section className="space-y-2">
              <Label className="text-xs text-muted-foreground uppercase tracking-wider">Label</Label>
              <Input
                placeholder="Key name"
                value={name}
                onChange={(e) => { setName(e.target.value); save({ name: e.target.value }); }}
              />
            </section>

            <Separator />

            <section className="space-y-2">
              <Label className="text-xs text-muted-foreground uppercase tracking-wider">Key type</Label>
              <div className="flex rounded-lg border overflow-hidden">
                {(["ed25519", "ecdsa", "rsa"] as const).map((t) => (
                  <button
                    key={t}
                    className={cn(
                      "flex-1 px-3 py-1.5 text-xs font-medium transition-colors",
                      (genKeyType === t || genKeyType.startsWith(t))
                        ? "bg-primary text-primary-foreground"
                        : "hover:bg-muted"
                    )}
                    onClick={() => {
                      if (t === "ecdsa") { setGenKeyType("ecdsa-521"); setGenBits(0); }
                      else if (t === "rsa") { setGenKeyType("rsa"); setGenBits(4096); }
                      else { setGenKeyType(t); setGenBits(0); }
                    }}
                  >
                    {t.toUpperCase()}
                  </button>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">
                {genKeyType === "ed25519" && "OpenSSH 6.5+"}
                {genKeyType.startsWith("ecdsa") && "OpenSSH 5.7+"}
                {genKeyType === "rsa" && "Legacy devices"}
              </p>
            </section>

            {genKeyType.startsWith("ecdsa") && (
              <section className="space-y-2">
                <Label className="text-xs text-muted-foreground uppercase tracking-wider">Elliptic curve size (bits)</Label>
                <div className="flex rounded-lg border overflow-hidden">
                  {ecdsaCurves.map((c) => (
                    <button
                      key={c.value}
                      className={cn(
                        "flex-1 px-3 py-1.5 text-xs font-medium transition-colors",
                        genKeyType === c.value ? "bg-primary text-primary-foreground" : "hover:bg-muted"
                      )}
                      onClick={() => setGenKeyType(c.value)}
                    >
                      {c.label}
                    </button>
                  ))}
                </div>
              </section>
            )}

            {genKeyType === "rsa" && (
              <section className="space-y-2">
                <Label className="text-xs text-muted-foreground uppercase tracking-wider">Key size (bits)</Label>
                <div className="flex rounded-lg border overflow-hidden">
                  {rsaSizes.map((s) => (
                    <button
                      key={s.value}
                      className={cn(
                        "flex-1 px-3 py-1.5 text-xs font-medium transition-colors",
                        genBits === s.value ? "bg-primary text-primary-foreground" : "hover:bg-muted"
                      )}
                      onClick={() => setGenBits(s.value)}
                    >
                      {s.label}
                    </button>
                  ))}
                </div>
              </section>
            )}

            <Separator />

            <section className="space-y-2">
              <Label className="text-xs text-muted-foreground uppercase tracking-wider">Passphrase</Label>
              <div className="relative">
                <Input
                  type={showPassphrase ? "text" : "password"}
                  placeholder="Passphrase (optional)"
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
        <div className="p-4 border-t">
          <Button className="w-full" size="lg" onClick={handleGenerate} disabled={genLoading}>
            {genLoading ? (
              <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Generating...</>
            ) : (
              "Generate & save"
            )}
          </Button>
        </div>
      </div>
    );
  }

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
              className="min-h-[80px] max-h-[200px] font-mono text-xs resize-none break-all overflow-x-hidden overflow-y-auto"
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
            <Label className="text-xs text-muted-foreground uppercase tracking-wider">Public Key</Label>
            <Textarea
              className="min-h-[60px] max-h-[150px] font-mono text-xs resize-none break-all overflow-x-hidden overflow-y-auto"
              placeholder="Paste public key content here (optional)"
              value={publicKey}
              onChange={(e) => { setPublicKey(e.target.value); save({ publicKey: e.target.value }); }}
            />
          </section>

          <Separator />

          <section className="space-y-2">
            <Label className="text-xs text-muted-foreground uppercase tracking-wider">Certificate</Label>
            <Textarea
              className="min-h-[60px] max-h-[150px] font-mono text-xs resize-none break-all overflow-x-hidden overflow-y-auto"
              placeholder="Paste certificate content here (optional)"
              value={certificate}
              onChange={(e) => { setCertificate(e.target.value); save({ certificate: e.target.value }); }}
            />
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
