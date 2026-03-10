import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { importKeyFile } from "@/lib/tauri";
import { cn } from "@/lib/utils";
import {
    useConnectionStore,
    type ConnectionInfo,
} from "@/stores/connection-store";
import { useKeychainStore } from "@/stores/keychain-store";
import { useUiStore } from "@/stores/ui-store";
import { open } from "@tauri-apps/plugin-dialog";
import { Check, Eye, EyeOff, FolderOpen, Import, KeyRound, PanelRightClose, Plus, Server, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

interface HostDetailProps {
  onConnect: (conn: ConnectionInfo) => void;
  onClose: () => void;
}

export function HostDetail({ onConnect, onClose }: HostDetailProps) {
  const { editingHostId } = useUiStore();
  const { connections, groups, updateConnection } = useConnectionStore();
  const { items: keychainItems } = useKeychainStore();

  const conn = connections.find((c) => c.id === editingHostId);

  const [name, setName] = useState("");
  const [host, setHost] = useState("");
  const [port, setPort] = useState(22);
  const [username, setUsername] = useState("root");
  const [authType, setAuthType] = useState<"password" | "key">("password");
  const [group, setGroup] = useState("Default");
  const [password, setPassword] = useState("");
  const [keyPath, setKeyPath] = useState("");
  const [keyPassphrase, setKeyPassphrase] = useState("");
  const [keychainId, setKeychainId] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [keyPickerOpen, setKeyPickerOpen] = useState(false);
  const [groupPickerOpen, setGroupPickerOpen] = useState(false);
  const [newGroupName, setNewGroupName] = useState("");
  const newGroupInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (conn) {
      setName(conn.name);
      setHost(conn.host);
      setPort(conn.port);
      setUsername(conn.username);
      setAuthType(conn.authType as "password" | "key");
      setGroup(conn.group || "Default");
      setPassword(conn.password ?? "");
      setKeyPath(conn.keyPath ?? "");
      setKeyPassphrase(conn.keyPassphrase ?? "");
      setKeychainId(conn.keychainId ?? "");
      setShowPassword(false);
      setKeyPickerOpen(false);
    }
  }, [editingHostId, conn?.id]);

  if (!conn) {
    return (
      <div className="flex h-full items-center justify-center text-muted-foreground">
        <p className="text-sm">Select a host to view details</p>
      </div>
    );
  }

  const save = (patch: Partial<ConnectionInfo>) => {
    updateConnection(conn.id, patch);
  };

  const selectedKey = keychainItems.find((k) => k.id === keychainId);

  useEffect(() => {
    if (keychainId && !selectedKey && keychainItems.length > 0) {
      setKeychainId("");
      updateConnection(conn.id, { keychainId: "" });
    }
  }, [keychainId, selectedKey, keychainItems, conn.id, updateConnection]);

  const handleSelectKey = (keyId: string) => {
    setKeychainId(keyId);
    setKeyPath("");
    setKeyPassphrase("");
    save({ keychainId: keyId, keyPath: "", keyPassphrase: "" });
    setKeyPickerOpen(false);
  };

  const handleUnlinkKey = () => {
    setKeychainId("");
    save({ keychainId: "" });
  };

  const handleImportNewKey = async () => {
    const result = await open({
      title: "Import SSH Key",
      filters: [{ name: "SSH Key Files", extensions: ["pem", "key", "pub", "ppk", "id_rsa", "id_ed25519", "id_ecdsa", "*"] }],
      multiple: false,
    });
    if (!result) return;
    const filePath = String(result);
    if (!filePath) return;
    try {
      const content = await importKeyFile(filePath);
      const fileName = filePath.split(/[\\/]/).pop() ?? "Imported Key";
      const id = crypto.randomUUID();
      const keyType = content.includes("RSA") ? "ssh-key" : "ssh-key";
      await useKeychainStore.getState().addItem({
        id, name: fileName, keyType, privateKey: content, publicKey: "", certificate: "", passphrase: "",
      });
      setKeychainId(id);
      setKeyPath("");
      setKeyPassphrase("");
      save({ keychainId: id, keyPath: "", keyPassphrase: "" });
      setKeyPickerOpen(false);
    } catch {
      // Error handled by Tauri
    }
  };

  const handleConnectAction = () => {
    save({
      name, host, port, username, authType, group,
      password: authType === "password" ? password : undefined,
      keyPath: authType === "key" ? keyPath : undefined,
      keyPassphrase: authType === "key" ? keyPassphrase : undefined,
      keychainId: authType === "key" ? keychainId : "",
    });

    const ui = useUiStore.getState();
    const panel = ui.detailPanel;
    const source = panel?.type === "host" ? panel.source : undefined;
    ui.setDetailPanel(null);

    if (source === "sftp-left" || source === "sftp-right") {
      const side = (source === "sftp-left" ? "left" : "right") as "left" | "right";
      const updatedConn = useConnectionStore.getState().connections.find((c) => c.id === conn.id);
      import("@/stores/sftp-store").then(({ useSftpStore }) => {
        if (updatedConn) {
          useSftpStore.getState().startConnect(side, updatedConn);
        } else {
          useSftpStore.getState().retryConnect(side);
        }
      });
    } else {
      onConnect({ ...conn, name, host, port, username, authType, group, password, keyPath, keyPassphrase, keychainId });
    }
  };

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between px-4 py-3 border-b">
        <h2 className="text-sm font-semibold">Host Details</h2>
        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={onClose}>
          <PanelRightClose className="h-3.5 w-3.5" />
        </Button>
      </div>

      <ScrollArea className="flex-1 overflow-hidden">
        <div className="p-4 space-y-5">
          <section>
            <Label className="text-xs text-muted-foreground uppercase tracking-wider">Address</Label>
            <div className="flex items-center gap-3 mt-2">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Server className="h-5 w-5" />
              </div>
              <Input
                placeholder="hostname or IP"
                value={host}
                onChange={(e) => { setHost(e.target.value); save({ host: e.target.value }); }}
              />
            </div>
          </section>

          <Separator />

          <section className="space-y-3">
            <Label className="text-xs text-muted-foreground uppercase tracking-wider">General</Label>
            <Input
              placeholder="Display name"
              value={name}
              onChange={(e) => { setName(e.target.value); save({ name: e.target.value }); }}
            />
            <Input
              placeholder="Username"
              value={username}
              onChange={(e) => { setUsername(e.target.value); save({ username: e.target.value }); }}
            />
            <Popover open={groupPickerOpen} onOpenChange={(open) => { setGroupPickerOpen(open); if (open) setNewGroupName(""); }}>
              <PopoverTrigger asChild>
                <Button variant="outline" className="w-full justify-between text-sm font-normal">
                  <span className="flex items-center gap-2">
                    <FolderOpen className="h-3.5 w-3.5 text-muted-foreground" />
                    {group}
                  </span>
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-64 p-1" align="start">
                <div className="max-h-48 overflow-y-auto">
                  {groups.map((g) => (
                    <button
                      key={g}
                      className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-accent hover:text-accent-foreground transition-colors"
                      onClick={() => { setGroup(g); save({ group: g }); setGroupPickerOpen(false); }}
                    >
                      <Check className={cn("h-3.5 w-3.5 shrink-0", group === g ? "opacity-100" : "opacity-0")} />
                      <span className="truncate">{g}</span>
                    </button>
                  ))}
                </div>
                <div className="border-t mt-1 pt-1">
                  <form
                    className="flex items-center gap-1 px-1"
                    onSubmit={(e) => {
                      e.preventDefault();
                      const trimmed = newGroupName.trim();
                      if (trimmed && !groups.includes(trimmed)) {
                        setGroup(trimmed);
                        save({ group: trimmed });
                        setGroupPickerOpen(false);
                      } else if (trimmed) {
                        setGroup(trimmed);
                        save({ group: trimmed });
                        setGroupPickerOpen(false);
                      }
                    }}
                  >
                    <Input
                      ref={newGroupInputRef}
                      className="h-7 text-xs flex-1"
                      placeholder="New group..."
                      value={newGroupName}
                      onChange={(e) => setNewGroupName(e.target.value)}
                    />
                    <Button type="submit" size="icon" variant="ghost" className="h-7 w-7 shrink-0" disabled={!newGroupName.trim()}>
                      <Plus className="h-3.5 w-3.5" />
                    </Button>
                  </form>
                </div>
              </PopoverContent>
            </Popover>
          </section>

          <Separator />

          <section>
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">SSH on</span>
              <Input
                className="w-20 text-center"
                type="number"
                value={port}
                onChange={(e) => {
                  const v = parseInt(e.target.value, 10);
                  if (!Number.isNaN(v) && v >= 1 && v <= 65535) {
                    setPort(v);
                    save({ port: v });
                  }
                }}
              />
              <span className="text-sm text-muted-foreground">port</span>
            </div>
          </section>

          <Separator />

          <section className="space-y-3">
            <Label className="text-xs text-muted-foreground uppercase tracking-wider">Credentials</Label>
            <Select value={authType} onValueChange={(v) => { const val = v as "password" | "key"; setAuthType(val); save({ authType: val }); }}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="password">Password</SelectItem>
                <SelectItem value="key">SSH Key</SelectItem>
              </SelectContent>
            </Select>

            {authType === "password" ? (
              <div className="relative">
                <Input
                  type={showPassword ? "text" : "password"}
                  placeholder="Password"
                  className="pr-9"
                  value={password}
                  onChange={(e) => { setPassword(e.target.value); save({ password: e.target.value }); }}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7"
                  onClick={() => setShowPassword(!showPassword)}
                >
                  {showPassword ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                </Button>
              </div>
            ) : (
              <div className="space-y-3">
                {selectedKey ? (
                  <div className="flex items-center gap-2 rounded-lg border px-3 py-2">
                    <KeyRound className="h-4 w-4 text-primary shrink-0" />
                    <span className="text-sm truncate flex-1">{selectedKey.name || "Unnamed Key"}</span>
                    <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0" onClick={handleUnlinkKey}>
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ) : (
                  <Popover open={keyPickerOpen} onOpenChange={setKeyPickerOpen}>
                    <PopoverTrigger asChild>
                      <Button variant="outline" className="w-full justify-start gap-2 text-muted-foreground">
                        <Plus className="h-3.5 w-3.5" /> Key
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-64 p-1" align="start">
                      <div className="max-h-48 overflow-y-auto">
                        {keychainItems.length > 0 ? (
                          keychainItems.map((k) => (
                            <button
                              key={k.id}
                              className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-accent hover:text-accent-foreground transition-colors"
                              onClick={() => handleSelectKey(k.id)}
                            >
                              <KeyRound className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                              <span className="truncate">{k.name || "Unnamed Key"}</span>
                            </button>
                          ))
                        ) : (
                          <p className="px-2 py-1.5 text-xs text-muted-foreground">No keys in keychain</p>
                        )}
                      </div>
                      <div className="border-t mt-1 pt-1">
                        <button
                          className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-accent hover:text-accent-foreground transition-colors"
                          onClick={handleImportNewKey}
                        >
                          <Import className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                          <span>Import new key...</span>
                        </button>
                      </div>
                    </PopoverContent>
                  </Popover>
                )}

                {!selectedKey && (
                  <>
                    <div className="flex items-center gap-2">
                      <div className="h-px flex-1 bg-border" />
                      <span className="text-xs text-muted-foreground">or path</span>
                      <div className="h-px flex-1 bg-border" />
                    </div>
                    <Input
                      placeholder="Path to private key"
                      value={keyPath}
                      onChange={(e) => { setKeyPath(e.target.value); save({ keyPath: e.target.value }); }}
                    />
                  </>
                )}

                <Input
                  type="password"
                  placeholder="Key passphrase (optional)"
                  value={keyPassphrase}
                  onChange={(e) => { setKeyPassphrase(e.target.value); save({ keyPassphrase: e.target.value }); }}
                />
              </div>
            )}
          </section>
        </div>
      </ScrollArea>

      <div className="p-4 border-t">
        <Button variant="outline" className="w-full" size="lg" onClick={handleConnectAction} disabled={!host}>
          Connect
        </Button>
      </div>
    </div>
  );
}
