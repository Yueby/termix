import { cn } from "@/lib/utils";
import { useToastStore } from "@/stores/toast-store";
import { X } from "lucide-react";

/** Renders transient messages pushed via `useToastStore`. Mount once, at the app root. */
export function Toaster() {
  const toasts = useToastStore((state) => state.toasts);
  const dismiss = useToastStore((state) => state.dismiss);

  if (toasts.length === 0) return null;

  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-[100] flex flex-col items-end gap-2">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          role="alert"
          className={cn(
            "pointer-events-auto flex max-w-sm items-start gap-2 rounded-md border px-3 py-2 text-xs shadow-md animate-in fade-in-0 slide-in-from-bottom-2 duration-150",
            toast.variant === "error"
              ? "border-destructive/40 bg-destructive/10 text-destructive"
              : "bg-popover text-popover-foreground"
          )}
        >
          <span className="break-all">{toast.message}</span>
          <button
            type="button"
            aria-label="Dismiss"
            className="mt-0.5 shrink-0 opacity-60 transition-opacity hover:opacity-100"
            onClick={() => dismiss(toast.id)}
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      ))}
    </div>
  );
}
