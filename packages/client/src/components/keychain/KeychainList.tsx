import { ListPage } from "@/components/layout/ListPage";
import { Button } from "@/components/ui/button";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useContextMenu } from "@/hooks/use-context-menu";
import { importKeyFile, type KeychainItem } from "@/lib/tauri";
import { cn } from "@/lib/utils";
import { isKeychainItemEmpty, useKeychainStore } from "@/stores/keychain-store";
import { useUiStore } from "@/stores/ui-store";
import { open } from "@tauri-apps/plugin-dialog";
import { ChevronDown, Import, KeyRound, Pencil, Plus, Sparkles, Trash2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

export function KeychainList() {
  const { items } = useKeychainStore();
  const { selectedKeychainId, setSelectedKeychainId, setEditingKeychainId } = useUiStore();
  const [search, setSearch] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [menuTarget, setMenuTarget] = useState<KeychainItem | null>(null);
  const { menu, menuRef, open: openMenu, close } = useContextMenu();

  useEffect(() => {
    if (!menu) setMenuTarget(null);
  }, [menu]);

  const filtered = useMemo(() => {
    if (!search) return items;
    const q = search.toLowerCase();
    return items.filter(
      (i) =>
        i.name.toLowerCase().includes(q) ||
        i.keyType.toLowerCase().includes(q)
    );
  }, [items, search]);

  const handleGenerateKey = () => {
    const id = crypto.randomUUID();
    useKeychainStore.getState().addItem({
      id, name: "", keyType: "ssh-key", privateKey: "", publicKey: "", certificate: "", passphrase: "",
    });
    setSelectedKeychainId(id);
    setEditingKeychainId(id);
    useUiStore.getState().setKeychainGenerateMode(true);
  };

  const handleNewKey = () => {
    const id = crypto.randomUUID();
    useKeychainStore.getState().addItem({
      id, name: "", keyType: "ssh-key", privateKey: "", publicKey: "", certificate: "", passphrase: "",
    });
    setSelectedKeychainId(id);
    setEditingKeychainId(id);
    useUiStore.getState().setKeychainGenerateMode(false);
  };

  const handleImport = async () => {
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
      const item: KeychainItem = {
        id,
        name: fileName,
        keyType: detectKeyType(content),
        privateKey: content,
        publicKey: "",
        certificate: "",
        passphrase: "",
      };
      useKeychainStore.getState().addItem(item);
      setSelectedKeychainId(id);
      setEditingKeychainId(id);
    } catch {
      // import_key_file returns error string on failure
    }
  };

  const handleDelete = (itemId: string) => {
    useKeychainStore.getState().removeItem(itemId);
    if (selectedKeychainId === itemId) setSelectedKeychainId(null);
    if (useUiStore.getState().editingKeychainId === itemId) setEditingKeychainId(null);
  };

  const switchEditingKeychain = useCallback((targetId: string) => {
    const { editingKeychainId } = useUiStore.getState();
    if (editingKeychainId && editingKeychainId !== targetId) {
      const curr = useKeychainStore.getState().items.find((i) => i.id === editingKeychainId);
      if (curr && isKeychainItemEmpty(curr)) {
        useKeychainStore.getState().removeItem(editingKeychainId);
      }
    }
    setSelectedKeychainId(targetId);
    setEditingKeychainId(targetId);
    useUiStore.getState().setKeychainGenerateMode(false);
  }, [setSelectedKeychainId, setEditingKeychainId]);

  const deleteItem = items.find((i) => i.id === deleteTarget);

  return (
    <>
      <ListPage
        items={filtered}
        totalCount={items.length}
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search keys..."
        actionButtons={
          <>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="sm" variant="outline" className="h-7 gap-1 text-xs">
                  <KeyRound className="h-3 w-3" /> KEY <ChevronDown className="h-3 w-3 ml-0.5 opacity-50" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                <DropdownMenuItem onClick={handleNewKey}>
                  <Plus className="h-3.5 w-3.5 mr-2" /> New Key
                </DropdownMenuItem>
                <DropdownMenuItem onClick={handleGenerateKey}>
                  <Sparkles className="h-3.5 w-3.5 mr-2" /> Generate Key
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <Button size="sm" variant="outline" className="h-7 gap-1.5 text-xs" onClick={handleImport}>
              <Import className="h-3 w-3" /> IMPORT
            </Button>
          </>
        }
        sectionTitle="Keys"
        EmptyIcon={KeyRound}
        emptyText="No matching keys"
        noItemsText="No keys yet"
        renderItem={(item: KeychainItem) => (
          <button
            key={item.id}
            className={cn(
              "group flex w-full items-center gap-3 rounded-lg border-2 px-3 py-2.5 text-left transition-colors outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
              selectedKeychainId === item.id
                ? "border-primary/40 bg-muted/30 hover:bg-accent/50 active:bg-accent/40"
                : "border-transparent bg-muted/30 hover:bg-accent/50 active:bg-accent/40"
            )}
            onClick={() => setSelectedKeychainId(selectedKeychainId === item.id ? null : item.id)}
            onDoubleClick={() => switchEditingKeychain(item.id)}
            onContextMenu={(e) => {
              setMenuTarget(item);
              openMenu(e);
            }}
          >
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary shrink-0">
              <KeyRound className="h-4 w-4" />
            </div>
            <div className="flex flex-col min-w-0 flex-1">
              <span className="text-sm font-medium truncate">
                {item.name || "Unnamed Key"}
              </span>
              <span className="text-xs text-muted-foreground truncate">
                Type {formatKeyType(item.privateKey)}
              </span>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
              onClick={(e) => {
                e.stopPropagation();
                switchEditingKeychain(item.id);
              }}
            >
              <Pencil className="h-3.5 w-3.5" />
            </Button>
          </button>
        )}
        deleteOpen={!!deleteTarget}
        onDeleteOpenChange={(open) => !open && setDeleteTarget(null)}
        deleteTitle="Delete Key"
        deleteDescription={`Are you sure you want to delete "${deleteItem?.name || "this key"}"? This action cannot be undone.`}
        onDeleteConfirm={() => {
          if (deleteTarget) handleDelete(deleteTarget);
          setDeleteTarget(null);
        }}
      />
      {menu && menuTarget && (
        <div
          className="fixed inset-0 z-50"
          onContextMenu={(e) => e.preventDefault()}
          onMouseDown={close}
        >
          <div
            ref={menuRef}
            className="fixed min-w-[160px] rounded-md border bg-popover p-1 text-popover-foreground shadow-md"
            style={{ left: menu.x, top: menu.y, visibility: "hidden", opacity: 0 }}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <button
              className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-accent hover:text-accent-foreground active:bg-accent/80 transition-colors"
              onClick={() => { switchEditingKeychain(menuTarget.id); close(); }}
            >
              <Pencil className="h-4 w-4 text-muted-foreground" /> Edit
            </button>
            <button
              className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm text-destructive hover:bg-destructive/10 hover:text-destructive active:bg-destructive/20 transition-colors"
              onClick={() => { setDeleteTarget(menuTarget.id); close(); }}
            >
              <Trash2 className="h-4 w-4" /> Delete
            </button>
          </div>
        </div>
      )}
    </>
  );
}

function detectKeyType(content: string): string {
  if (content.includes("RSA")) return "ssh-key";
  if (content.includes("ED25519") || content.includes("ed25519")) return "ssh-key";
  if (content.includes("EC") || content.includes("ECDSA")) return "ssh-key";
  return "ssh-key";
}

function formatKeyType(content: string): string {
  if (!content) return "SSH Key";
  if (content.includes("RSA")) return "RSA";
  if (content.includes("ED25519") || content.includes("ed25519")) return "Ed25519";
  if (content.includes("EC") || content.includes("ECDSA")) return "ECDSA";
  if (content.includes("OPENSSH")) return "OpenSSH";
  return "SSH Key";
}
