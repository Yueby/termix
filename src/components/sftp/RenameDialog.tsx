import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useEffect, useState } from "react";
import { PanelModal } from "./PanelModal";

const INVALID_CHARS = /[/\\:*?"<>|]/;

interface RenameDialogProps {
  open: boolean;
  onClose: () => void;
  currentName: string;
  onConfirm: (newName: string) => void;
}

export function RenameDialog({ open, onClose, currentName, onConfirm }: RenameDialogProps) {
  const [name, setName] = useState(currentName);

  useEffect(() => {
    if (open) setName(currentName);
  }, [open, currentName]);

  const trimmed = name.trim();
  const hasInvalidChars = INVALID_CHARS.test(trimmed);
  const isValid = trimmed.length > 0 && trimmed !== currentName && !hasInvalidChars;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!isValid) return;
    onConfirm(trimmed);
    onClose();
  };

  return (
    <PanelModal open={open} onClose={onClose}>
      <h3 className="text-lg font-semibold mb-4">Rename</h3>
      <form onSubmit={handleSubmit}>
        <div className="space-y-2">
          <Label htmlFor="new-name">New name</Label>
          <Input
            id="new-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus
            onFocus={(e) => {
              const dotIdx = currentName.lastIndexOf(".");
              if (dotIdx > 0) {
                e.target.setSelectionRange(0, dotIdx);
              } else {
                e.target.select();
              }
            }}
          />
          {hasInvalidChars && (
            <p className="text-xs text-destructive">
              Name cannot contain / \ : * ? " &lt; &gt; |
            </p>
          )}
        </div>
        <div className="flex justify-end mt-4">
          <Button type="submit" disabled={!isValid}>
            Confirm
          </Button>
        </div>
      </form>
    </PanelModal>
  );
}
