import { LayoutList, LayoutGrid } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useUiStore } from "@/stores/ui-store";

export function LayoutToggle() {
  const { listLayout, setListLayout } = useUiStore();
  const isGrid = listLayout === "grid";

  return (
    <div className="flex items-center border rounded-md">
      <Button
        size="icon"
        variant="ghost"
        className={cn("h-6 w-6 rounded-r-none", !isGrid && "bg-accent")}
        onClick={() => setListLayout("list")}
      >
        <LayoutList className="h-3 w-3" />
      </Button>
      <Button
        size="icon"
        variant="ghost"
        className={cn("h-6 w-6 rounded-l-none", isGrid && "bg-accent")}
        onClick={() => setListLayout("grid")}
      >
        <LayoutGrid className="h-3 w-3" />
      </Button>
    </div>
  );
}
