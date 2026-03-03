import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { Copy, Trash2, Edit } from "lucide-react";
import { type } from "@tauri-apps/plugin-os";

interface ActionsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAction: (action: string) => void;
}

export function ActionsDialog({ open, onOpenChange, onAction }: ActionsDialogProps) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [osType, setOsType] = useState<string>("");

  useEffect(() => {
    // Get OS type (macos, windows, linux)
    // Note: plugin-os returns specific strings
    const platform = type();
    setOsType(platform);
  }, []);

  const isMac = osType === "macos";
  const cmdKey = isMac ? "⌘" : "Ctrl";
  const delKey = isMac ? "⌫" : "Del";

  const actions = [
    { id: "copy", label: "Copy to Clipboard", icon: Copy, shortcut: "↵" },
    { id: "edit", label: "Edit Content", icon: Edit, shortcut: `${cmdKey}+E` },
    { id: "delete", label: "Delete", icon: Trash2, shortcut: `${cmdKey}+${delKey}`, variant: "destructive" },
  ];

  useEffect(() => {
    if (open) {
      setSelectedIndex(0);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Stop propagation to prevent global listeners (like main window hide)
      e.stopPropagation();

      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIndex((prev) => (prev + 1) % actions.length);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIndex((prev) => (prev - 1 + actions.length) % actions.length);
      } else if (e.key === "Enter") {
        e.preventDefault();
        onAction(actions[selectedIndex].id);
        onOpenChange(false);
      } else if (e.key === "e" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        onAction("edit");
        onOpenChange(false);
      } else if ((e.key === "Backspace" || e.key === "Delete") && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        onAction("delete");
        onOpenChange(false);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, selectedIndex, onAction, onOpenChange, actions]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[400px] gap-0 p-0 overflow-hidden bg-popover text-popover-foreground border-border shadow-lg">
        <DialogHeader className="px-4 py-3 border-b border-border/50 bg-muted/20">
          <DialogTitle className="text-sm font-medium text-muted-foreground">Actions</DialogTitle>
        </DialogHeader>
        <div className="p-2 flex flex-col gap-1">
          {actions.map((action, index) => {
            const isSelected = index === selectedIndex;
            const Icon = action.icon;
            return (
              <div
                key={action.id}
                className={cn(
                  "flex items-center justify-between px-3 py-2.5 rounded-md text-sm cursor-pointer transition-colors",
                  isSelected ? "bg-accent text-accent-foreground" : "hover:bg-muted/50 text-foreground/80",
                  action.variant === "destructive" && isSelected && "text-destructive-foreground bg-destructive/10",
                  action.variant === "destructive" && !isSelected && "text-destructive hover:bg-destructive/5"
                )}
                onClick={() => {
                  onAction(action.id);
                  onOpenChange(false);
                }}
                onMouseEnter={() => setSelectedIndex(index)}
              >
                <div className="flex items-center gap-3">
                  <Icon className="w-4 h-4 opacity-70" />
                  <span>{action.label}</span>
                </div>
                {action.shortcut && (
                  <kbd className="pointer-events-none inline-flex h-5 select-none items-center gap-1 rounded border bg-muted/50 px-1.5 font-mono text-[10px] font-medium text-muted-foreground opacity-100">
                    {action.shortcut}
                  </kbd>
                )}
              </div>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
}
