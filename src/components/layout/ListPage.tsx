import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { LayoutToggle } from "@/components/ui/layout-toggle";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn, GRID_COLUMNS } from "@/lib/utils";
import { useUiStore } from "@/stores/ui-store";
import type { LucideIcon } from "lucide-react";
import { Search } from "lucide-react";
import type { ReactNode } from "react";

interface ListPageProps<T> {
  items: T[];
  totalCount: number;
  search: string;
  onSearchChange: (value: string) => void;
  searchPlaceholder: string;
  searchExtra?: ReactNode;
  onSearchKeyDown?: (e: React.KeyboardEvent) => void;
  actionButtons: ReactNode;
  sectionTitle: string;
  EmptyIcon: LucideIcon;
  emptyText: string;
  noItemsText: string;
  renderItem: (item: T) => ReactNode;
  renderContent?: (items: T[]) => ReactNode;
  deleteOpen: boolean;
  onDeleteOpenChange: (open: boolean) => void;
  deleteTitle: string;
  deleteDescription: string;
  onDeleteConfirm: () => void;
}

export function ListPage<T>({
  items,
  totalCount,
  search,
  onSearchChange,
  searchPlaceholder,
  searchExtra,
  onSearchKeyDown,
  actionButtons,
  sectionTitle,
  EmptyIcon,
  emptyText,
  noItemsText,
  renderItem,
  renderContent,
  deleteOpen,
  onDeleteOpenChange,
  deleteTitle,
  deleteDescription,
  onDeleteConfirm,
}: ListPageProps<T>) {
  const { listLayout } = useUiStore();
  const isGrid = listLayout === "grid";

  return (
    <div className="flex h-full flex-col">
      <div className="border-b p-3 bg-card overflow-x-auto scrollbar-none">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            className={cn("h-10 pl-8 text-sm", searchExtra && "pr-24")}
            placeholder={searchPlaceholder}
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            onKeyDown={onSearchKeyDown}
          />
          {searchExtra}
        </div>
      </div>

      <div className="flex items-center gap-2 border-b px-3 py-2 bg-card overflow-x-auto scrollbar-none flex-nowrap">
        {actionButtons}
        <div className="flex-1" />
        <LayoutToggle />
      </div>

      <div className="px-4 pt-3 pb-1">
        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          {sectionTitle}
        </h3>
      </div>

      <ScrollArea className="flex-1">
        {renderContent ? renderContent(items) : (
          <div
            className={cn("px-3 pt-1 pb-2 gap-2", isGrid ? "grid" : "flex flex-col")}
            style={isGrid ? { gridTemplateColumns: GRID_COLUMNS } : undefined}
          >
            {items.map(renderItem)}

            {items.length === 0 && (
              <div className={cn(
                "flex flex-col items-center justify-center py-12 text-muted-foreground",
                isGrid && "col-span-full"
              )}>
                <EmptyIcon className="mb-2 h-8 w-8 opacity-30" />
                <p className="text-sm">
                  {totalCount === 0 ? noItemsText : emptyText}
                </p>
              </div>
            )}
          </div>
        )}
      </ScrollArea>

      <AlertDialog open={deleteOpen} onOpenChange={onDeleteOpenChange}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{deleteTitle}</AlertDialogTitle>
            <AlertDialogDescription>{deleteDescription}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={onDeleteConfirm}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
