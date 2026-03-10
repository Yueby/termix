import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { ArrowLeft } from "lucide-react";
import React, { useEffect, useState } from "react";
import { PanelModal } from "./PanelModal";

interface EditPermissionsDialogProps {
  open: boolean;
  onClose: () => void;
  path: string;
  permissions?: string;
  onSave: (mode: number) => void;
}

function parsePermissions(perm?: string): boolean[][] {
  const matrix = [
    [false, false, false],
    [false, false, false],
    [false, false, false],
  ];
  if (!perm || perm.length < 9) return matrix;

  const chars = perm.slice(-9);
  for (let row = 0; row < 3; row++) {
    matrix[row][0] = chars[row * 3] === "r";
    matrix[row][1] = chars[row * 3 + 1] === "w";
    matrix[row][2] = chars[row * 3 + 2] === "x";
  }
  return matrix;
}

function matrixToMode(m: boolean[][]): number {
  let mode = 0;
  for (let row = 0; row < 3; row++) {
    if (m[row][0]) mode |= 4 << ((2 - row) * 3);
    if (m[row][1]) mode |= 2 << ((2 - row) * 3);
    if (m[row][2]) mode |= 1 << ((2 - row) * 3);
  }
  return mode;
}

const ROLES = ["Owner", "Groups", "Others"] as const;
const PERMS = ["Read", "Write", "Execute"] as const;

export function EditPermissionsDialog({ open, onClose, path, permissions, onSave }: EditPermissionsDialogProps) {
  const [matrix, setMatrix] = useState<boolean[][]>(() => parsePermissions(permissions));

  useEffect(() => {
    if (open) setMatrix(parsePermissions(permissions));
  }, [open, permissions]);

  const toggle = (row: number, col: number) => {
    setMatrix((prev) => {
      const next = prev.map((r) => [...r]);
      next[row][col] = !next[row][col];
      return next;
    });
  };

  return (
    <PanelModal open={open} onClose={onClose} className="max-w-md">
      <div className="flex items-center gap-2 mb-4">
        <button
          onClick={onClose}
          className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors -ml-1"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
        <h3 className="text-lg font-semibold">Edit permissions</h3>
      </div>

      <p className="text-sm text-muted-foreground break-all mb-4">{path}</p>

      <div className="space-y-4">
        <div>
          <h4 className="text-sm font-medium mb-3">File Access</h4>
          <div className="grid grid-cols-4 gap-y-3 items-center">
            <span />
            {PERMS.map((p) => (
              <span key={p} className="text-xs text-center text-muted-foreground font-medium">{p}</span>
            ))}
            {ROLES.map((role, ri) => (
              <React.Fragment key={role}>
                <span className="text-sm">{role}</span>
                {PERMS.map((_, ci) => (
                  <div key={`${role}-${ci}`} className="flex justify-center">
                    <Switch
                      checked={matrix[ri][ci]}
                      onCheckedChange={() => toggle(ri, ci)}
                    />
                  </div>
                ))}
              </React.Fragment>
            ))}
          </div>
        </div>
      </div>

      <div className="flex justify-end mt-4">
        <Button onClick={() => { onSave(matrixToMode(matrix)); onClose(); }}>
          Save
        </Button>
      </div>
    </PanelModal>
  );
}
