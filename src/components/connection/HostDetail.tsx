import { useEffect, useState } from "react";
import { Server, Eye, EyeOff, PanelRightClose } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  useConnectionStore,
  type ConnectionInfo,
} from "@/stores/connection-store";
import { useUiStore } from "@/stores/ui-store";

interface HostDetailProps {
  onConnect: (conn: ConnectionInfo) => void;
  onClose: () => void;
}

export function HostDetail({ onConnect, onClose }: HostDetailProps) {
  const { editingHostId } = useUiStore();
  const { connections, groups, updateConnection } = useConnectionStore();

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
  const [showPassword, setShowPassword] = useState(false);

  useEffect(() => {
    if (conn) {
      setName(conn.name);
      setHost(conn.host);
      setPort(conn.port);
      setUsername(conn.username);
      setAuthType(conn.authType as "password" | "key");
      setGroup(conn.group);
      setPassword(conn.password ?? "");
      setKeyPath(conn.keyPath ?? "");
      setKeyPassphrase(conn.keyPassphrase ?? "");
      setShowPassword(false);
    }
  }, [editingHostId]);

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

  const handleConnect = () => {
    save({
      name, host, port, username, authType, group,
      password: authType === "password" ? password : undefined,
      keyPath: authType === "key" ? keyPath : undefined,
      keyPassphrase: authType === "key" ? keyPassphrase : undefined,
    });
    onConnect({ ...conn, name, host, port, username, authType, group, password, keyPath, keyPassphrase });
  };

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b">
        <h2 className="text-sm font-semibold">Host Details</h2>
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6"
          onClick={onClose}
        >
          <PanelRightClose className="h-3.5 w-3.5" />
        </Button>
      </div>

      <ScrollArea className="flex-1 overflow-hidden">
        <div className="p-4 space-y-5">
          {/* Address */}
          <section>
            <Label className="text-xs text-muted-foreground uppercase tracking-wider">
              Address
            </Label>
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

          {/* General */}
          <section className="space-y-3">
            <Label className="text-xs text-muted-foreground uppercase tracking-wider">
              General
            </Label>
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
            <Select value={group} onValueChange={(v) => { setGroup(v); save({ group: v }); }}>
              <SelectTrigger><SelectValue placeholder="Group" /></SelectTrigger>
              <SelectContent>
                {groups.map((g) => (<SelectItem key={g} value={g}>{g}</SelectItem>))}
              </SelectContent>
            </Select>
          </section>

          <Separator />

          {/* SSH Port */}
          <section>
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">SSH on</span>
              <Input
                className="w-20 text-center"
                type="number"
                value={port}
                onChange={(e) => { const v = Number(e.target.value); setPort(v); save({ port: v }); }}
              />
              <span className="text-sm text-muted-foreground">port</span>
            </div>
          </section>

          <Separator />

          {/* Credentials */}
          <section className="space-y-3">
            <Label className="text-xs text-muted-foreground uppercase tracking-wider">
              Credentials
            </Label>
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
              <>
                <Input
                  placeholder="Path to private key"
                  value={keyPath}
                  onChange={(e) => { setKeyPath(e.target.value); save({ keyPath: e.target.value }); }}
                />
                <Input
                  type="password"
                  placeholder="Key passphrase (optional)"
                  value={keyPassphrase}
                  onChange={(e) => { setKeyPassphrase(e.target.value); save({ keyPassphrase: e.target.value }); }}
                />
              </>
            )}
          </section>
        </div>
      </ScrollArea>

      {/* Footer */}
      <div className="p-4 border-t">
        <Button className="w-full" size="lg" onClick={handleConnect} disabled={!host}>
          Connect
        </Button>
      </div>
    </div>
  );
}
