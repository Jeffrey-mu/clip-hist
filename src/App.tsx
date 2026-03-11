import { useState, useEffect, useRef, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SettingsDialog } from "@/components/SettingsDialog";
import { ActionsDialog } from "@/components/ActionsDialog";
import { EditDialog } from "@/components/EditDialog";
import { 
  Clipboard, 
  Search,
  Settings,
  LayoutGrid,
  List,
} from "lucide-react";
import HistoryListItem from "@/components/HistoryListItem";
import { HistoryItem } from "@/types";

import { type } from "@tauri-apps/plugin-os";

import { PreviewPane } from "@/components/PreviewPane";
import HistoryGridItem from "@/components/HistoryGridItem";
import { cn } from "@/lib/utils";

function App() {
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [viewMode, setViewMode] = useState<'list' | 'grid'>('list');
  const [search, setSearch] = useState("");
  const [filterType, setFilterType] = useState("all");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isActionsOpen, setIsActionsOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [previewData, setPreviewData] = useState<{ id: number, content: string } | null>(null);
  const [isPreviewLoading, setIsPreviewLoading] = useState(false);
  
  const previewCache = useRef<Map<number, string>>(new Map());
  const itemRefs = useRef<(HTMLDivElement | null)[]>([]);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const contentRef = useRef<HTMLPreElement>(null);
  const observer = useRef<IntersectionObserver | null>(null);

  const [osType, setOsType] = useState<string>("");

  // Refs for current state to use in callbacks/effects
  const historyRef = useRef(history);
  const selectedIndexRef = useRef(selectedIndex);
  const isActionsOpenRef = useRef(isActionsOpen);
  const isEditOpenRef = useRef(isEditOpen);
  const isSettingsOpenRef = useRef(isSettingsOpen);
  
  useEffect(() => {
    historyRef.current = history;
  }, [history]);

  useEffect(() => {
    selectedIndexRef.current = selectedIndex;
  }, [selectedIndex]);

  useEffect(() => {
    isActionsOpenRef.current = isActionsOpen;
  }, [isActionsOpen]);

  useEffect(() => {
    isEditOpenRef.current = isEditOpen;
  }, [isEditOpen]);

  useEffect(() => {
    isSettingsOpenRef.current = isSettingsOpen;
  }, [isSettingsOpen]);

  // Stable reference to history length for fetchHistory
  const historyLengthRef = useRef(0);
  useEffect(() => {
    historyLengthRef.current = history.length;
  }, [history]);

  // Disable right-click context menu
  useEffect(() => {
    const handleContextMenu = (e: MouseEvent) => {
      e.preventDefault();
    };
    document.addEventListener('contextmenu', handleContextMenu);
    return () => {
      document.removeEventListener('contextmenu', handleContextMenu);
    };
  }, []);

  useEffect(() => {
    // Get OS type
    setOsType(type());
  }, []);

  // Handle Select All (Ctrl+A / Cmd+A)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Check for Ctrl+A (Windows/Linux) or Cmd+A (Mac)
      if ((e.ctrlKey || e.metaKey) && e.key === 'a') {
        const target = e.target as HTMLElement;
        // Allow default behavior if user is in an input or textarea or contentEditable
        if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
          return;
        }

        e.preventDefault();
        
        // Select content in preview if available
        if (contentRef.current) {
          const range = document.createRange();
          range.selectNodeContents(contentRef.current);
          const selection = window.getSelection();
          if (selection) {
            selection.removeAllRanges();
            selection.addRange(range);
          }
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const isMac = osType === "macos";
  const cmdKey = isMac ? "⌘" : "Ctrl";

  const fetchHistory = async (isReset = false, preserveSelection = false) => {
    if (isLoading && !isReset) return;
    setIsLoading(true);

    // Capture current selection state before async call
    const currentHistory = historyRef.current;
    const currentIndex = selectedIndexRef.current;
    const currentSelectedId = currentHistory[currentIndex]?.id;

    try {
      const offset = isReset ? 0 : historyLengthRef.current;
      // console.log('Fetching history with filter:', filterType);
      const items = await invoke<HistoryItem[]>("get_history", { 
        limit: 15, 
        offset,
        search,
        filterType: filterType 
      });

      if (items.length < 15) {
        setHasMore(false);
      } else {
        setHasMore(true);
      }

      if (isReset) {
        setHistory(items);
        
        if (preserveSelection && currentSelectedId) {
          // Try to find the previously selected item by ID
          const newIndex = items.findIndex(item => item.id === currentSelectedId);
          if (newIndex !== -1) {
            setSelectedIndex(newIndex);
          } else {
            // If item moved out of view or deleted, try to keep index roughly same but clamped
            // Or just reset to 0 if totally lost?
            // Usually keeping index is better UX than jumping to 0 if item is gone.
            setSelectedIndex(Math.min(currentIndex, Math.max(0, items.length - 1)));
          }
        } else {
          // Reset selection to top
          setSelectedIndex(0);
        }
      } else {
        setHistory((prev) => [...prev, ...items]);
      }
    } catch (error) {
      console.error("Failed to fetch history:", error);
    } finally {
      setIsLoading(false);
    }
  };

  // Initial load, Search, and Filter change
  useEffect(() => {
    fetchHistory(true, false);
  }, [search, filterType]);

  // Run history cleanup on app start and set defaults
  useEffect(() => {
    // 1. History Cleanup
    const savedDuration = localStorage.getItem("app-history-duration") || "3months";
    
    if (savedDuration && savedDuration !== "forever") {
      const now = new Date();
      const cutoff = new Date(now);
      
      let shouldCleanup = true;
      switch (savedDuration) {
        case "1day": cutoff.setDate(now.getDate() - 1); break;
        case "7days": cutoff.setDate(now.getDate() - 7); break;
        case "30days": cutoff.setDate(now.getDate() - 30); break;
        case "3months": cutoff.setMonth(now.getMonth() - 3); break;
        case "1year": cutoff.setFullYear(now.getFullYear() - 1); break;
        default: shouldCleanup = false; break;
      }
      
      if (shouldCleanup) {
         // SQLite format: YYYY-MM-DD HH:MM:SS
         const cutoffStr = cutoff.toISOString().replace('T', ' ').split('.')[0];
         invoke("delete_before", { cutoffDate: cutoffStr }).catch(console.error);
      }
    }
  }, []);

  // Listen for clipboard changes
  useEffect(() => {
    const unlistenPromise = listen("clipboard-changed", (_) => {
      // Pass true to preserve selection on clipboard update
      fetchHistory(true, true);
    });
    
    // Auto-focus input when window gains focus
    const appWindow = getCurrentWindow();
    const unlistenFocusPromise = appWindow.onFocusChanged(({ payload: focused }) => {
      if (focused) {
        setTimeout(() => {
          searchInputRef.current?.focus();
        }, 50);
      } else {
        setIsSettingsOpen(false);
      }
    });

    return () => {
      unlistenPromise.then((unlisten) => unlisten());
      unlistenFocusPromise.then((unlisten) => unlisten());
    };
  }, [search]); // Re-bind listener if search changes? No, search is read from closure? 
  // Wait, if search changes, fetchHistory closure in listener is stale?
  // Yes. I should use a ref for search too if I want to respect current search on update?
  // Or just reset search on clipboard update?
  // Usually if I copy something new, I want to see it. So clearing search is reasonable.
  // But let's just let it reload with current search.
  // Ideally use `search` from state.
  // Since `useEffect` has `[search]`, it recreates listener when search changes.
  // This is fine.

  const lastItemRef = (node: HTMLDivElement) => {
    if (isLoading) return;
    if (observer.current) observer.current.disconnect();
    
    observer.current = new IntersectionObserver(entries => {
      if (entries[0].isIntersecting && hasMore) {
        fetchHistory(false);
      }
    });
    
    if (node) observer.current.observe(node);
  };

  const handleCopy = useCallback(async (item: HistoryItem) => {
    try {
      const primaryAction = localStorage.getItem("primaryAction") || "paste";
      const shouldPaste = primaryAction === "paste";

      await invoke("copy_history_item", { id: item.id, shouldPaste });
      // Window is hidden by the backend command
    } catch (error) {
      console.error("Failed to copy:", error);
    }
  }, []);

  const handleClearHistory = async () => {
    try {
      await invoke("clear_history");
      setHistory([]);
      setIsSettingsOpen(false);
    } catch (error) {
      console.error("Failed to clear history:", error);
    }
  };

  const handleAction = (action: string) => {
    if (!selectedItem) return;

    if (action === "copy") {
      handleCopy(selectedItem);
    } else if (action === "edit") {
      setIsEditOpen(true);
    } else if (action === "delete") {
      handleDelete(selectedItem);
    }
  };

  const handleDelete = async (item: HistoryItem) => {
    try {
      await invoke("delete_item", { id: item.id });
      setHistory(prev => prev.filter(i => i.id !== item.id));
      if (selectedIndex >= history.length - 1) {
          setSelectedIndex(Math.max(0, history.length - 2));
      }
    } catch (error) {
      console.error("Failed to delete item:", error);
    }
  };

  const handleUpdate = async (newContent: string) => {
    if (!selectedItem) return;
    try {
      await invoke("update_item", { id: selectedItem.id, content: newContent });
      // Update cache immediately
      previewCache.current.set(selectedItem.id, newContent);
      setHistory(prev => prev.map(i => i.id === selectedItem.id ? { ...i, content: newContent } : i));
    } catch (error) {
      console.error("Failed to update item:", error);
    }
  };

  const selectedItem = history[selectedIndex];

  useEffect(() => {
    if (!selectedItem) {
      setPreviewData(null);
      return;
    }

    let active = true;
    const currentId = selectedItem.id;

    const fetchContent = async () => {
      // If it's an image (content empty) or long text (truncated), fetch full content
      // Note: db.rs truncates text to 300 chars.
      const needsFetch = selectedItem.item_type === 'image' || selectedItem.content.length >= 300;
      
      if (needsFetch) {
        // Check cache first
        const cached = previewCache.current.get(currentId);
        if (cached) {
          if (active) {
            setPreviewData({ id: currentId, content: cached });
            setIsPreviewLoading(false);
          }
          return;
        }

        if (active) setIsPreviewLoading(true);
        
        try {
          const content = await invoke<string>('get_item_content', { id: currentId });
          if (active) {
            previewCache.current.set(currentId, content);
            setPreviewData({ id: currentId, content });
          }
        } catch (e) {
          console.error("Failed to fetch item content", e);
          if (active) setPreviewData(null);
        } finally {
          if (active) setIsPreviewLoading(false);
        }
      } else {
        if (active) {
          setPreviewData({ id: currentId, content: selectedItem.content });
          setIsPreviewLoading(false);
        }
      }
    };

    fetchContent();

    return () => {
      active = false;
    };
  }, [selectedItem]);

  // Keyboard navigation
  const isAutoScrollingRef = useRef(false);
  const scrollTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const lastKeyTimeRef = useRef<number>(0);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Use refs to check if dialogs are open
      if (isActionsOpenRef.current || isEditOpenRef.current || isSettingsOpenRef.current) return;

      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setIsActionsOpen(true);
        return;
      }

      if (e.key === "Escape") {
        e.preventDefault();
        invoke("hide_window").catch(console.error);
        return;
      }
      
      if (history.length === 0) return;

      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        
        // Throttle key events to prevent too rapid scrolling (max 1 event every 60ms = ~16fps)
        const now = Date.now();
        if (now - lastKeyTimeRef.current < 60) {
          return;
        }
        lastKeyTimeRef.current = now;

        isAutoScrollingRef.current = true;
        
        // Clear existing timeout to keep "auto" scrolling active during rapid key presses
        if (scrollTimeoutRef.current) clearTimeout(scrollTimeoutRef.current);
        
        // Reset to smooth scrolling after key release/pause
        scrollTimeoutRef.current = setTimeout(() => {
          isAutoScrollingRef.current = false;
        }, 150);

        if (e.key === "ArrowDown") {
          setSelectedIndex((prev) => 
            prev < history.length - 1 ? prev + 1 : prev
          );
        } else {
          setSelectedIndex((prev) => (prev > 0 ? prev - 1 : 0));
        }
      } else if (e.key === "Enter") {
        e.preventDefault();
        // Use ref for current selection
        const currentHistory = historyRef.current;
        const currentIndex = selectedIndexRef.current;
        const item = currentHistory[currentIndex];
        if (item) {
          handleCopy(item);
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [history.length]); // Only re-bind if history length changes significantly? Actually refs handle most state.

  // Auto-scroll to selected item
  useEffect(() => {
    if (itemRefs.current[selectedIndex]) {
      itemRefs.current[selectedIndex]?.scrollIntoView({
        behavior: isAutoScrollingRef.current ? "auto" : "smooth",
        block: "nearest",
      });
    }
  }, [selectedIndex]);

  // Reset selection when search changes
  useEffect(() => {
    setSelectedIndex(0);
  }, [search, filterType]);


  const handleSelect = useCallback((index: number) => {
    setSelectedIndex(index);
  }, []);


  const handleItemDoubleClick = useCallback((index: number) => {
    const item = historyRef.current[index];
    if (item) {
      handleCopy(item);
    }
  }, [handleCopy]);


  return (
    <div className="h-screen w-screen bg-background text-foreground flex flex-col overflow-hidden font-sans">
      {/* Draggable Top Bar */}
      <div 
        data-tauri-drag-region 
        className="h-6 w-full bg-background flex items-center justify-center cursor-move z-50 hover:bg-accent/10 transition-colors shrink-0"
      >
        <div className="w-12 h-1 rounded-full bg-muted-foreground/20 pointer-events-none" />
      </div>

      {/* Top Search Bar Area */}
      <div className="flex items-center gap-3 p-3 border-b border-border bg-background/95 backdrop-blur shrink-0 z-10 transition-all duration-200">
        <div className="relative flex-1 group">
          <div className="absolute inset-0 bg-secondary/40 rounded-lg transition-all duration-200 group-focus-within:bg-secondary/60 group-focus-within:ring-2 group-focus-within:ring-primary/20" />
          <div className="relative flex items-center px-3 h-10">
            <Search className="w-4 h-4 text-muted-foreground/50 mr-2 transition-colors group-focus-within:text-primary/70" />
            <input
              ref={searchInputRef}
              placeholder="搜索历史记录..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              autoFocus
              className="flex-1 bg-transparent border-0 text-sm placeholder:text-muted-foreground/50 focus:outline-none focus:ring-0 h-full text-foreground"
            />
            
            <Select value={filterType} onValueChange={setFilterType}>
              <SelectTrigger className="h-7 border-0 bg-background/50 hover:bg-background/80 shadow-sm text-xs font-medium text-muted-foreground w-auto px-2 gap-1.5 rounded ml-2 transition-colors focus:ring-0 focus:ring-offset-0">
                <span className="opacity-70">类型:</span>
                <SelectValue placeholder="全部" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部类型</SelectItem>
                <SelectItem value="text">仅文本</SelectItem>
                <SelectItem value="image">仅图片</SelectItem>
                <SelectItem value="file">仅文件</SelectItem>
                <SelectItem value="link">仅链接</SelectItem>
                <SelectItem value="color">仅颜色</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="flex items-center bg-secondary/40 p-1 rounded-lg border border-border/10 shrink-0">
          <button 
             onClick={() => setViewMode('list')}
             className={cn("p-1.5 rounded-md transition-all text-muted-foreground hover:text-foreground", viewMode === 'list' && "bg-background text-primary shadow-sm ring-1 ring-border/10")}
             title="列表视图"
          >
             <List className="w-4 h-4" />
          </button>
          <button 
             onClick={() => setViewMode('grid')}
             className={cn("p-1.5 rounded-md transition-all text-muted-foreground hover:text-foreground", viewMode === 'grid' && "bg-background text-primary shadow-sm ring-1 ring-border/10")}
             title="网格视图"
          >
             <LayoutGrid className="w-4 h-4" />
          </button>
        </div>

        <Button variant="ghost" size="icon" className="h-9 w-9 text-muted-foreground/70 hover:text-foreground hover:bg-secondary/80 rounded-lg transition-all" onClick={() => setIsSettingsOpen(true)}>
          <Settings className="w-5 h-5" />
        </Button>
        <SettingsDialog 
          open={isSettingsOpen} 
          onOpenChange={setIsSettingsOpen} 
          onClearHistory={handleClearHistory}
        />
      </div>
      
      {/* Main Split Layout */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left Sidebar: List */}
        <div className="w-[30%] min-w-[260px] max-w-[400px] border-r border-border flex flex-col bg-background">

          <ScrollArea className="flex-1">
            <div className="px-2 pb-2 space-y-1 pt-2">
            {history.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-muted-foreground/50 animate-in fade-in zoom-in duration-300">
                <div className="w-16 h-16 rounded-full bg-secondary/50 flex items-center justify-center mb-4 ring-1 ring-border/30">
                  <Search className="w-8 h-8 opacity-40" />
                </div>
                <h3 className="font-medium text-foreground/70 mb-1">
                  {search ? "未找到匹配项" : "剪切板历史为空"}
                </h3>
                <p className="text-xs max-w-[200px] text-center opacity-70">
                  {search 
                    ? "尝试调整搜索关键词或筛选条件。" 
                    : "复制一些内容，它们将出现在这里。"}
                </p>
              </div>
            ) : viewMode === 'list' ? (
               <>
                {history.map((item, index) => (
                  <HistoryListItem
                    key={item.id}
                    item={item}
                    index={index}
                    isSelected={index === selectedIndex}
                    search={search}
                    onSelect={handleSelect}
                    onDoubleClick={handleItemDoubleClick}
                    ref={(el) => { if (el) itemRefs.current[index] = el; }}
                  />
                ))}
               </>
            ) : (
               <div className="grid grid-cols-2 gap-2 p-1">
                  {history.map((item, index) => (
                    <HistoryGridItem
                      key={item.id}
                      item={item}
                      index={index}
                      isSelected={index === selectedIndex}
                      onSelect={handleSelect}
                      onDoubleClick={handleItemDoubleClick}
                      ref={(el) => { if (el) itemRefs.current[index] = el; }}
                    />
                  ))}
               </div>
            )}
            <div ref={lastItemRef} className="h-4" />
            </div>
          </ScrollArea>
          

        </div>

        {/* Right Content: Preview & Details */}
        <div className="flex-1 flex flex-col bg-card h-full overflow-hidden relative border-l border-border/50">
          {selectedItem ? (
             <PreviewPane 
                item={selectedItem}
                content={(previewData?.id === selectedItem.id ? previewData.content : null) || selectedItem.content}
                isLoading={isPreviewLoading}
                search={search}
                onCopy={() => handleCopy(selectedItem)}
                onDelete={() => handleDelete(selectedItem)}
             />
          ) : (
            <div className="flex items-center justify-center h-full text-muted-foreground/40 bg-card">
              <div className="flex flex-col items-center gap-4 text-center p-8">
                <div className="w-24 h-24 bg-secondary/50 rounded-full flex items-center justify-center mb-2 animate-pulse">
                  <Clipboard className="w-10 h-10 opacity-20" />
                </div>
                <div className="space-y-1">
                  <h3 className="font-medium text-foreground/70">未选择项目</h3>
                  <p className="text-sm text-muted-foreground/60">从列表中选择一项以查看详情</p>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
      
      {/* Global Status Bar */}
      <div className="h-9 border-t border-border bg-background/95 backdrop-blur flex items-center justify-between px-4 text-[11px] text-muted-foreground select-none shrink-0 z-20">
        <div className="flex items-center gap-2">
           <span className="flex items-center gap-2 opacity-70 hover:opacity-100 transition-opacity">
              <div className="w-1.5 h-1.5 rounded-full bg-primary/80 shadow-[0_0_4px_rgba(0,122,255,0.4)]" />
              <span className="font-medium">{history.length} 个项目</span>
           </span>
           <div className="h-3 w-px bg-border/80 mx-2" />
           <span className="opacity-50">按 ↵ 复制</span>
        </div>
        <div className="flex items-center gap-4">
           <div 
             className="flex items-center gap-1.5 hover:text-foreground transition-colors cursor-pointer group" 
             onClick={() => setIsActionsOpen(true)}
           >
              <span className="group-hover:text-primary transition-colors">操作</span>
              <kbd className="px-1.5 py-0.5 rounded-[4px] bg-secondary border border-border/50 text-[9px] font-sans min-w-[20px] text-center shadow-sm">{cmdKey}K</kbd>
           </div>
        </div>
      </div> 
      
      <ActionsDialog
        open={isActionsOpen} 
        onOpenChange={setIsActionsOpen} 
        onAction={handleAction} 
      />
      
      <EditDialog 
        open={isEditOpen} 
        onOpenChange={setIsEditOpen} 
        initialContent={selectedItem?.content || ""} 
        itemId={selectedItem?.id || 0}
        onSave={handleUpdate} 
      />
    </div>
  );
}

export default App;
