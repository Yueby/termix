import { Button } from "@/components/ui/button";
import { PanelModal } from "./PanelModal";

interface DeleteConfirmDialogProps {
  open: boolean;
  onClose: () => void;
  name: string;
  isDir: boolean;
  onConfirm: () => void;
}

export function DeleteConfirmDialog({ open, onClose, name, isDir, onConfirm }: DeleteConfirmDialogProps) {
  return (
    <PanelModal open={open} onClose={onClose}>
      <h3 className="text-lg font-semibold mb-4">
        Do you want to delete this {isDir ? "folder" : "file"}?
      </h3>
      <p className="text-sm text-foreground mb-4">{name}</p>
      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={onClose}>
          Cancel
        </Button>
        <Button variant="destructive" onClick={() => { onConfirm(); onClose(); }}>
          Delete
        </Button>
      </div>
    </PanelModal>
  );
}
