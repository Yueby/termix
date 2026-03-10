import { cn } from "@/lib/utils";
import { X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

interface PanelModalProps {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
  className?: string;
}

export function PanelModal({ open, onClose, children, className }: PanelModalProps) {
  const [mounted, setMounted] = useState(false);
  const [show, setShow] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);

    if (open) {
      setMounted(true);
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          setShow(true);
        });
      });
    } else {
      setShow(false);
      timerRef.current = setTimeout(() => setMounted(false), 200);
    }

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [open]);

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === "Escape") onClose();
  }, [onClose]);

  useEffect(() => {
    if (!mounted) return;
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [mounted, handleKeyDown]);

  if (!mounted) return null;

  return (
    <div
      className="absolute inset-0 z-20 flex items-center justify-center transition-opacity duration-200"
      style={{
        backgroundColor: show ? "rgba(0,0,0,0.5)" : "rgba(0,0,0,0)",
        opacity: show ? 1 : 0,
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className={cn(
          "relative w-full max-w-sm mx-6 rounded-lg border bg-background p-6 shadow-lg transition-all duration-200",
          className
        )}
        style={{
          opacity: show ? 1 : 0,
          transform: show ? "scale(1)" : "scale(0.95)",
        }}
      >
        <button
          onClick={onClose}
          className="absolute top-4 right-4 rounded-xs opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:outline-hidden"
        >
          <X className="h-4 w-4" />
          <span className="sr-only">Close</span>
        </button>
        {children}
      </div>
    </div>
  );
}
