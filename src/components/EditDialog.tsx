import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

interface EditDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialContent: string;
  itemId: number;
  onSave: (newContent: string) => void;
}

export function EditDialog({ open, onOpenChange, initialContent, itemId, onSave }: EditDialogProps) {
  const [content, setContent] = useState(initialContent);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    setContent(initialContent);
    
    if (open && itemId) {
      // Fetch full content to ensure we're not editing truncated text
      setIsLoading(true);
      invoke<string>('get_item_content', { id: itemId })
        .then(fullContent => {
          setContent(fullContent);
        })
        .catch(err => {
          console.error("Failed to fetch full content for editing:", err);
        })
        .finally(() => {
          setIsLoading(false);
        });
    }
  }, [initialContent, open, itemId]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    e.stopPropagation(); // Stop propagation to prevent global window hide
    
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      handleSave();
    } else if (e.key === "Escape") {
      e.preventDefault();
      onOpenChange(false);
    }
  };

  const handleSave = () => {
    onSave(content);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent 
        className="sm:max-w-[600px] h-[500px] flex flex-col gap-4" 
        onOpenAutoFocus={(e) => e.preventDefault()}
        onEscapeKeyDown={() => {
           // Prevent default Radix behavior if needed, but more importantly stop propagation
           // Actually Radix handles escape, we just need to ensure it doesn't bubble to window
           // But Radix portals might bubble?
           // The safest way is to ensure App.tsx ignores it.
           // e.preventDefault(); // If we want to handle it manually
        }}
        onKeyDown={(e) => {
            // Catch escape bubbling from DialogContent if not caught by textarea
            if (e.key === "Escape") {
                e.stopPropagation();
            }
        }}
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            编辑内容
            {isLoading && <span className="text-xs text-muted-foreground font-normal">(正在加载完整内容...)</span>}
          </DialogTitle>
        </DialogHeader>
        <div className="flex-1 flex flex-col gap-2">
          <textarea
            className="flex-1 min-h-[300px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 resize-none font-mono"
            value={content}
            onChange={(e) => setContent(e.target.value)}
            onKeyDown={handleKeyDown}
            autoFocus
            disabled={isLoading}
          />
        </div>
        <DialogFooter className="flex justify-between items-center sm:justify-between">
            <div className="text-xs text-muted-foreground flex gap-3">
                <span><kbd className="font-mono bg-muted px-1 rounded">Esc</kbd> 取消</span>
                <span><kbd className="font-mono bg-muted px-1 rounded">⌘/Ctrl + Enter</kbd> 保存</span>
            </div>
            <div className="flex gap-2">
                <Button variant="outline" onClick={() => onOpenChange(false)}>取消</Button>
                <Button onClick={handleSave}>保存修改</Button>
            </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
