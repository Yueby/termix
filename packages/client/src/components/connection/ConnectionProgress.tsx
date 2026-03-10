import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import type { ConnectionStatus, SessionTab } from "@/stores/session-store";
import {
    Cable,
    Check,
    KeyRound,
    Loader2,
    Pencil,
    RotateCcw,
    Server,
    TerminalSquare,
    X,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";

interface ConnectionProgressProps {
  tab: SessionTab;
  onSubmitAuth: (tabId: string, password: string) => void;
  onClose: (tabId: string) => void;
  onRetry: (tabId: string) => void;
  onEdit?: (connectionId: string) => void;
  protocol?: string;
}

const STEPS = [
  { key: "connecting", label: "Connect", icon: Cable },
  { key: "authenticating", label: "Authenticate", icon: KeyRound },
  { key: "connected", label: "Session", icon: TerminalSquare },
] as const;

type StepKey = (typeof STEPS)[number]["key"];

function getStepState(
  stepKey: StepKey,
  status: ConnectionStatus
): "done" | "active" | "pending" {
  const order: ConnectionStatus[] = [
    "connecting", "authenticating", "connected",
  ];
  const stepIdx = order.indexOf(stepKey);
  const currentIdx = order.indexOf(status);
  if (currentIdx < 0) return "pending";
  if (stepIdx < currentIdx) return "done";
  if (stepIdx === currentIdx) return "active";
  return "pending";
}

function getStatusText(status: ConnectionStatus, error: string | null): string {
  switch (status) {
    case "waiting_auth": return "Enter credentials to connect";
    case "connecting": return "Establishing connection...";
    case "authenticating": return "Authenticating...";
    case "connected": return "Connected";
    case "disconnected": return "Connection closed";
    case "error": return error || "Connection failed";
  }
}

export function ConnectionProgress({ tab, onSubmitAuth, onClose, onRetry, onEdit, protocol = "SSH" }: ConnectionProgressProps) {
  const [password, setPassword] = useState("");
  const [allDone, setAllDone] = useState(false);
  const isProgressing = ["connecting", "authenticating"].includes(tab.status);
  const logsEndRef = useRef<HTMLDivElement>(null);
  const logs = tab.logs ?? [];

  useEffect(() => {
    if (tab.status === "connected") {
      const timer = setTimeout(() => setAllDone(true), 150);
      return () => clearTimeout(timer);
    }
    setAllDone(false);
  }, [tab.status]);

  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs.length]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmitAuth(tab.id, password);
  };

  return (
    <div className="flex h-full items-center justify-center bg-content">
      <div className="w-full max-w-lg px-8">
        {/* Server info */}
        <div className="flex items-center gap-4 mb-8">
          <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Server className="h-6 w-6" />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-lg font-semibold truncate">{tab.title}</h2>
            <p className="text-sm text-muted-foreground">{protocol} {tab.host}:{tab.port}</p>
          </div>
        </div>

        {/* Step indicator */}
        {tab.status !== "waiting_auth" && (
          <div className="mb-8">
            <div className="flex items-start">
              {STEPS.map((step, i) => {
                const state = allDone && step.key === "connected" ? "done" : getStepState(step.key, tab.status);
                const Icon = step.icon;
                const lineActive = i < STEPS.length - 1 && getStepState(STEPS[i + 1].key, tab.status) !== "pending";
                return (
                  <div key={step.key} className="contents">
                    <div className="flex flex-col items-center w-16">
                      <div
                        className={cn(
                          "flex h-10 w-10 items-center justify-center rounded-full border-2 transition-all duration-500",
                          state === "done" && "border-success bg-success text-success-foreground scale-100",
                          state === "active" && "border-success bg-success/20 text-success scale-110",
                          state === "pending" && "border-muted-foreground/30 text-muted-foreground/30 scale-100"
                        )}
                      >
                        {state === "done" ? <Check className="h-4 w-4" /> : state === "active" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Icon className="h-4 w-4" />}
                      </div>
                      <span className={cn(
                        "text-[10px] font-medium mt-2 transition-colors duration-500",
                        state === "pending" ? "text-muted-foreground/40" : "text-muted-foreground"
                      )}>
                        {step.label}
                      </span>
                    </div>
                    {i < STEPS.length - 1 && (
                      <div className="flex-1 flex items-center h-10">
                        <div className="relative h-0.5 w-full bg-muted rounded-full overflow-hidden">
                          <div className={cn(
                            "absolute inset-y-0 left-0 bg-success rounded-full transition-all duration-500",
                            lineActive ? "w-full" : "w-0"
                          )} />
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <p className={cn("text-sm text-center mb-6", tab.status === "error" ? "text-destructive" : "text-muted-foreground")}>
          {getStatusText(tab.status, tab.error)}
        </p>

        {logs.length > 0 && (
          <ScrollArea className="mb-6 h-32 rounded-md border bg-muted/30">
            <div className="p-3 font-mono text-xs text-muted-foreground space-y-0.5">
              {logs.map((log, i) => (
                <div key={i}>{log}</div>
              ))}
              <div ref={logsEndRef} />
            </div>
          </ScrollArea>
        )}

        <div className="min-h-[40px]">
          {tab.status === "waiting_auth" && (
            <form onSubmit={handleSubmit} className="space-y-4 mb-6">
              <Input
                type="password"
                placeholder={tab.authType === "password" ? "Enter password..." : "Key passphrase (optional)..."}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoFocus
              />
              <div className="flex justify-center gap-3">
                <Button type="button" variant="outline" onClick={() => onClose(tab.id)}>Close</Button>
                <Button type="submit">Connect</Button>
              </div>
            </form>
          )}

          {(tab.status === "error" || tab.status === "disconnected") && (
            <div className="flex justify-center gap-3">
              <Button variant="outline" onClick={() => onClose(tab.id)}>
                <X className="mr-1.5 h-3.5 w-3.5" />Close
              </Button>
              {onEdit && tab.connectionId && (
                <Button variant="outline" onClick={() => onEdit(tab.connectionId)}>
                  <Pencil className="mr-1.5 h-3.5 w-3.5" />Edit
                </Button>
              )}
              <Button onClick={() => onRetry(tab.id)}>
                <RotateCcw className="mr-1.5 h-3.5 w-3.5" />Reconnect
              </Button>
            </div>
          )}

          {isProgressing && (
            <div className="flex justify-center">
              <Button variant="outline" onClick={() => onClose(tab.id)}>Close</Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
