import { useState, useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { SettingsDialog } from "@/components/SettingsDialog";
import { 
  Clipboard, 
  Search,
  FileText,
  Image as ImageIcon,
  Link as LinkIcon,
  Palette,
  File as FileIcon,
  Settings,
} from "lucide-react";

interface HistoryItem {
  id: number;
  content: string;
  item_type: string;
  created_at: string;
}

function App() {
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [search, setSearch] = useState("");
  const [filterType, setFilterType] = useState("all");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  
  const scrollRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<(HTMLDivElement | null)[]>([]);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const observer = useRef<IntersectionObserver | null>(null);

  // Stable reference to history length for fetchHistory
  const historyLengthRef = useRef(0);
  useEffect(() => {
    historyLengthRef.current = history.length;
  }, [history]);

  const fetchHistory = async (isReset = false) => {
    if (isLoading && !isReset) return;
    setIsLoading(true);

    try {
      const offset = isReset ? 0 : historyLengthRef.current;
      const items = await invoke<HistoryItem[]>("get_history", { 
        limit: 15, 
        offset,
        search,
        filter_type: filterType 
      });

      if (items.length < 15) {
        setHasMore(false);
      } else {
        setHasMore(true);
      }

      if (isReset) {
        setHistory(items);
        // Reset selection to top
        setSelectedIndex(0);
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
    fetchHistory(true);
  }, [search, filterType]);

  // Listen for clipboard changes
  useEffect(() => {
    const unlistenPromise = listen("clipboard-changed", (_) => {
      fetchHistory(true);
    });
    
    // Auto-focus input when window gains focus
    const appWindow = getCurrentWindow();
    const unlistenFocusPromise = appWindow.onFocusChanged(({ payload: focused }) => {
      if (focused) {
        setTimeout(() => {
          searchInputRef.current?.focus();
        }, 50);
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

  const handleCopy = async (item: HistoryItem) => {
    try {
      await invoke("copy_item", { content: item.content });
      // Window is hidden by the backend command
    } catch (error) {
      console.error("Failed to copy:", error);
    }
  };

  const handleClearHistory = async () => {
    try {
      await invoke("clear_history");
      setHistory([]);
      setIsSettingsOpen(false);
    } catch (error) {
      console.error("Failed to clear history:", error);
    }
  };

  const selectedItem = history[selectedIndex];

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (history.length === 0) return;

      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIndex((prev) => 
          prev < history.length - 1 ? prev + 1 : prev
        );
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIndex((prev) => (prev > 0 ? prev - 1 : 0));
      } else if (e.key === "Enter") {
        e.preventDefault();
        if (selectedItem) {
          handleCopy(selectedItem);
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [history, selectedIndex, selectedItem]);

  // Auto-scroll to selected item
  useEffect(() => {
    if (itemRefs.current[selectedIndex]) {
      itemRefs.current[selectedIndex]?.scrollIntoView({
        behavior: "smooth",
        block: "nearest",
      });
    }
  }, [selectedIndex]);

  // Reset selection when search changes
  useEffect(() => {
    setSelectedIndex(0);
  }, [search, filterType]);

  const getWordCount = (text: string) => {
    return text.trim().split(/\s+/).filter(w => w.length > 0).length;
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'image': return ImageIcon;
      case 'link': return LinkIcon;
      case 'color': return Palette;
      case 'file': return FileIcon;
      default: return FileText;
    }
  };

  const renderPreview = (item: HistoryItem) => {
    if (item.item_type === 'image') {
      return (
        <div className="flex flex-col h-full">
          <div className="flex-1 flex items-center justify-center bg-muted/5 p-4 overflow-hidden">
            <img 
              src={item.content} 
              alt="Clipboard Image" 
              className="max-w-full max-h-full object-contain shadow-sm rounded-md" 
            />
          </div>
          <Separator />
          <div className="p-4 bg-muted/10 text-xs text-muted-foreground">
             <div className="grid grid-cols-2 gap-2">
                <span className="font-medium">Type</span>
                <span className="text-right">Image</span>
                <span className="font-medium">Size</span>
                <span className="text-right">Unknown</span>
             </div>
          </div>
        </div>
      );
    }
    
    // Text based preview
    return (
      <div className="flex flex-col h-full">
         <ScrollArea className="flex-1 p-6">
          {item.item_type === 'color' ? (
             <div className="flex flex-col items-center justify-center h-full gap-4 pt-10">
              <div 
                className="w-32 h-32 rounded-xl shadow-lg border border-border/50"
                style={{ backgroundColor: item.content }}
              />
              <span className="font-mono text-xl font-medium">{item.content}</span>
            </div>
          ) : (
            <div className="whitespace-pre-wrap font-mono text-sm leading-relaxed break-words text-foreground/90">
              {item.content}
            </div>
          )}
        </ScrollArea>
        
        <Separator />
        
        <div className="p-4 bg-background/50">
           <h3 className="text-xs font-medium text-muted-foreground mb-3">Information</h3>
           <div className="grid grid-cols-[1fr_auto] gap-y-2 text-xs">
              <span className="text-muted-foreground">Content type</span>
              <span className="font-medium">{item.item_type === 'text' ? 'Text' : item.item_type.charAt(0).toUpperCase() + item.item_type.slice(1)}</span>
              <Separator className="col-span-2 my-1 opacity-50"/>
              
              <span className="text-muted-foreground">Characters</span>
              <span className="font-medium">{item.content.length}</span>
              <Separator className="col-span-2 my-1 opacity-50"/>
              
              <span className="text-muted-foreground">Words</span>
              <span className="font-medium">{getWordCount(item.content)}</span>
              <Separator className="col-span-2 my-1 opacity-50"/>
              
              <span className="text-muted-foreground">Created</span>
              <span className="font-medium">
                {new Date(item.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </span>
           </div>
        </div>
      </div>
    );
  };

  const startDrag = async () => {
    try {
      await getCurrentWindow().startDragging();
    } catch (err) {
      console.error("Failed to start dragging", err);
    }
  };

  return (
    <div className="h-screen w-screen bg-background/60 dark:bg-background/60 text-foreground flex flex-col border border-border/50 overflow-hidden shadow-2xl font-sans">
      {/* Draggable Top Bar */}
      <div 
        data-tauri-drag-region 
        className="h-6 w-full bg-background/20 flex items-center justify-center cursor-move z-50 hover:bg-background/40 transition-colors shrink-0"
        onMouseDown={startDrag}
      >
        <div className="w-12 h-1 rounded-full bg-muted-foreground/20 pointer-events-none" />
      </div>

      {/* Top Search Bar Area */}
      <div className="flex items-center gap-3 p-3 border-b border-border/40 bg-background/40 backdrop-blur-md supports-[backdrop-filter]:bg-background/40">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/50" />
          <Input
            ref={searchInputRef}
            placeholder="Type to filter entries..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            autoFocus
            className="h-10 pl-9 border-none shadow-none focus-visible:ring-0 bg-muted/40 dark:bg-muted/60 placeholder:text-muted-foreground/50 rounded-md text-sm"
          />
        </div>
        <Select value={filterType} onValueChange={setFilterType}>
          <SelectTrigger className="w-[130px] h-10 bg-muted/40 dark:bg-muted/60 border-none shadow-none focus:ring-0 text-sm">
            <SelectValue placeholder="All Types" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            <SelectItem value="text">Text Only</SelectItem>
            <SelectItem value="image">Images Only</SelectItem>
            <SelectItem value="file">Files Only</SelectItem>
            <SelectItem value="link">Links Only</SelectItem>
            <SelectItem value="color">Colors Only</SelectItem>
          </SelectContent>
        </Select>

        <Button variant="ghost" size="icon" className="h-10 w-10 text-muted-foreground hover:text-foreground" onClick={() => setIsSettingsOpen(true)}>
          <Settings className="w-4 h-4" />
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
        <div className="w-[35%] min-w-[250px] border-r border-border/40 flex flex-col bg-muted/30 dark:bg-muted/30 backdrop-blur-sm">
          <div className="px-4 py-2 text-xs font-medium text-muted-foreground/70">Today</div>
          <ScrollArea className="flex-1" ref={scrollRef}>
        <div className="space-y-2">
          {history.length === 0 ? (
            <div className="text-center text-muted-foreground py-8">
              {search ? "No matching items found" : "No history items"}
            </div>
          ) : (
             <div className="flex flex-col pb-2">
               {history.map((item, index) => {
                 const Icon = getTypeIcon(item.item_type);
                 const isSelected = index === selectedIndex;
                 return (
                   <div
                     key={item.id}
                     ref={(el) => {
                       itemRefs.current[index] = el;
                       if (index === history.length - 1 && el) {
                         lastItemRef(el);
                       }
                     }}
                     className={cn(
                       "mx-2 px-3 py-2 cursor-pointer text-sm transition-all flex items-center gap-3 mb-0.5 rounded-md",
                       isSelected
                         ? "bg-accent text-accent-foreground shadow-sm"
                         : "text-muted-foreground hover:bg-accent/50 hover:text-foreground"
                     )}
                     onClick={() => {
                       setSelectedIndex(index);
                     }}
                     onDoubleClick={() => {
                       handleCopy(item);
                     }}
                   >
                     {/* Icon or Thumbnail */}
                     <div className="shrink-0">
                       {item.item_type === 'image' ? (
                         <div className="w-8 h-8 overflow-hidden border border-border/20 bg-background">
                           <img 
                             src={item.content} 
                             alt="Thumb" 
                             className="w-full h-full object-cover opacity-90"
                           />
                         </div>
                       ) : (
                          <div className="w-8 h-8 flex items-center justify-center bg-background border border-border/10 shrink-0">
                           <Icon className="w-4 h-4 opacity-50" />
                         </div>
                       )}
                     </div>
 
                     {/* Content Info */}
                     <div className="flex flex-col min-w-0 flex-1 gap-0.5">
                       <div className="flex items-center justify-between">
                         <span className={cn(
                           "truncate font-medium",
                           index === selectedIndex ? "text-foreground" : "text-foreground/80"
                         )}>
                           {item.item_type === 'image' 
                             ? "Image" 
                             : (item.content.trim().split('\n')[0] || "Empty content")}
                         </span>
                       </div>
                       {item.item_type === 'image' && (
                          <div className="text-[10px] opacity-60 truncate">Image Capture</div>
                       )}
                     </div>
                     
                     {/* Time */}
                     {index === selectedIndex && (
                        <span className="text-[10px] opacity-50 shrink-0">
                           {new Date(item.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                     )}
                   </div>
                 );
               })}
             </div>
          )}
        </div>
          </ScrollArea>
        </div>

        {/* Right Content: Preview & Details */}
        <div className="flex-1 flex flex-col bg-background h-full overflow-hidden">
          {selectedItem ? (
            renderPreview(selectedItem)
          ) : (
            <div className="flex items-center justify-center h-full text-muted-foreground">
              <div className="flex flex-col items-center gap-2">
                <Clipboard className="w-12 h-12 opacity-20" />
                <p>Select an item to view details</p>
              </div>
            </div>
          )}
        </div>
      </div>
      
      {/* Footer Status Bar */}
      <div className="h-9 border-t border-border/40 bg-muted/40 dark:bg-muted/60 flex items-center justify-between px-3 text-xs shrink-0 select-none">
        <div className="flex items-center gap-2">
           <div className="bg-primary/10 p-1 rounded">
             <Clipboard className="w-3 h-3 text-primary" />
           </div>
           <span className="font-medium text-muted-foreground">Clipboard History</span>
        </div>
        
        <div className="flex items-center gap-4">
           <div className="flex items-center gap-1.5">
              <span className="text-muted-foreground">Copy to Clipboard</span>
              <kbd className="pointer-events-none inline-flex h-5 select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium text-muted-foreground opacity-100">
                <span className="text-xs">↵</span>
              </kbd>
           </div>
           
           <div className="w-px h-3 bg-border" />
           
           <div className="flex items-center gap-1.5">
              <span className="text-muted-foreground">Actions</span>
              <kbd className="pointer-events-none inline-flex h-5 select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium text-muted-foreground opacity-100">
                <span className="text-xs">⌘</span>K
              </kbd>
           </div>
        </div>
      </div>
    </div>
  );
}

export default App;
