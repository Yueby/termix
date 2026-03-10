import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useState } from "react";
import { PanelModal } from "./PanelModal";

const INVALID_CHARS = /[/\\:*?"<>|]/;

interface NewFolderDialogProps {
  open: boolean;
  onClose: () => void;
  onConfirm: (name: string) => void;
}

export function NewFolderDialog({ open, onClose, onConfirm }: NewFolderDialogProps) {
  const [name, setName] = useState("");

  const trimmed = name.trim();
  const hasInvalidChars = INVALID_CHARS.test(trimmed);
  const isValid = trimmed.length > 0 && !hasInvalidChars;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!isValid) return;
    onConfirm(trimmed);
    setName("");
    onClose();
  };

  const handleClose = () => {
    setName("");
    onClose();
  };

  return (
    <PanelModal open={open} onClose={handleClose}>
      <h3 className="text-lg font-semibold mb-4">New folder</h3>
      <form onSubmit={handleSubmit}>
        <div className="space-y-2">
          <Label htmlFor="folder-name">Foldername *</Label>
          <Input
            id="folder-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus
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
