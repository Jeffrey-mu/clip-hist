import { useState, useEffect, useRef } from "react";
import { invoke, convertFileSrc } from "@tauri-apps/api/core";
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
import { cn } from "@/lib/utils";
import { SettingsDialog } from "@/components/SettingsDialog";
import { ActionsDialog } from "@/components/ActionsDialog";
import { EditDialog } from "@/components/EditDialog";
import { 
  Clipboard, 
  Search,
  FileText,
  Image as ImageIcon,
  Link as LinkIcon,
  Palette,
  File as FileIcon,
  Settings,
  Code as CodeIcon,
  Terminal,
} from "lucide-react";

import { type } from "@tauri-apps/plugin-os";

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
  const [isActionsOpen, setIsActionsOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [previewContent, setPreviewContent] = useState<string | null>(null);
  const [isPreviewLoading, setIsPreviewLoading] = useState(false);
  const [imageError, setImageError] = useState(false);
  
  const itemRefs = useRef<(HTMLDivElement | null)[]>([]);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const observer = useRef<IntersectionObserver | null>(null);

  const [osType, setOsType] = useState<string>("");

  const currentItem = history[selectedIndex];
  useEffect(() => {
    setImageError(false);
  }, [currentItem?.id, currentItem?.content]);

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
        filter_type: filterType 
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
      const primaryAction = localStorage.getItem("primaryAction") || "paste";
      const shouldPaste = primaryAction === "paste";

      await invoke("copy_history_item", { id: item.id, shouldPaste });
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
      setHistory(prev => prev.map(i => i.id === selectedItem.id ? { ...i, content: newContent } : i));
    } catch (error) {
      console.error("Failed to update item:", error);
    }
  };

  const selectedItem = history[selectedIndex];

  useEffect(() => {
    if (!selectedItem) {
      setPreviewContent(null);
      return;
    }

    const fetchContent = async () => {
      // If it's an image (content empty) or long text (truncated), fetch full content
      // Note: db.rs truncates text to 300 chars.
      if (selectedItem.item_type === 'image' || selectedItem.content.length >= 300) {
        setIsPreviewLoading(true);
        try {
          const content = await invoke<string>('get_item_content', { id: selectedItem.id });
          setPreviewContent(content);
        } catch (e) {
          console.error("Failed to fetch item content", e);
          setPreviewContent(null);
        } finally {
          setIsPreviewLoading(false);
        }
      } else {
        setPreviewContent(selectedItem.content);
        setIsPreviewLoading(false);
      }
    };

    fetchContent();
  }, [selectedItem]);

  // Keyboard navigation
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

  const getTypeIcon = (type: string, content?: string) => {
    switch (type) {
      case 'image': return ImageIcon;
      case 'link': return LinkIcon;
      case 'color': return Palette;
      case 'file': return FileIcon;
      default: 
        if (content) {
          const trimmed = content.trim();
          if (trimmed.startsWith('http')) return LinkIcon;
          if (trimmed.match(/^(import|export|const|let|var|function|class|def|if|for|while|return|package|public|private|protected|use)/)) return CodeIcon;
          if (trimmed.startsWith('$') || trimmed.startsWith('npm') || trimmed.startsWith('git') || trimmed.startsWith('pnpm') || trimmed.startsWith('yarn')) return Terminal;
        }
        return FileText;
    }
  };

  const getRelativeTime = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);

    if (diffInSeconds < 60) return 'Just now';
    if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)}m ago`;
    if (diffInSeconds < 86400) {
      const hours = Math.floor(diffInSeconds / 3600);
      return `${hours}h ago`;
    }
    
    // Check if it was yesterday
    const yesterday = new Date(now);
    yesterday.setDate(now.getDate() - 1);
    if (date.toDateString() === yesterday.toDateString()) {
      return 'Yesterday';
    }

    if (diffInSeconds < 604800) return `${Math.floor(diffInSeconds / 86400)}d ago`;
    
    return date.toLocaleDateString();
  };

  const HighlightedText = ({ text, highlight }: { text: string, highlight: string }) => {
    if (!highlight.trim()) {
      return <span>{text}</span>;
    }
    const regex = new RegExp(`(${highlight.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
    const parts = text.split(regex);
    return (
      <span>
        {parts.map((part, i) => 
          part.toLowerCase() === highlight.toLowerCase() ? (
            <span key={i} className="bg-primary/20 text-primary px-[2px] py-0 rounded-[2px] font-medium">{part}</span>
          ) : (
            <span key={i}>{part}</span>
          )
        )}
      </span>
    );
  };

  const renderPreview = (item: HistoryItem) => {
    if (isPreviewLoading) {
      return (
        <div className="flex flex-col h-full bg-background items-center justify-center text-muted-foreground">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        </div>
      );
    }

    const contentToDisplay = previewContent || item.content;

    // Detect if the file is an image
    const isImageFile = item.item_type === 'file' && /\.(png|jpg|jpeg|gif|bmp|webp|svg|ico)$/i.test(item.content.trim());
    const displayImageSrc = item.item_type === 'image' 
        ? contentToDisplay 
        : isImageFile 
            ? convertFileSrc(item.content.trim(), 'asset') 
            : null;

    // Unified Preview Layout
    return (
      <div className="flex flex-col h-full bg-card overflow-hidden border-l border-border font-sans text-foreground">
        
        <div className="flex-grow p-6 overflow-hidden flex flex-col bg-secondary/50">
          <div className="flex items-center gap-2 mb-3 shrink-0">
             <span className="text-[11px] font-bold text-muted-foreground tracking-wider uppercase">Content Preview</span>
             <div className="h-px flex-grow bg-border"></div>
             <span className="text-[10px] text-muted-foreground font-medium opacity-70">Read Only</span>
          </div>
          
          {item.item_type === 'color' ? (
            <div className="flex flex-col items-center justify-center h-full gap-4 bg-card rounded-xl border border-border shadow-[0_2px_8px_rgba(0,0,0,0.04)]">
              <div 
                className="w-32 h-32 rounded-xl shadow-inner border border-border/50"
                style={{ backgroundColor: item.content }}
              />
              <div className="text-center">
                <p className="font-mono text-xl font-bold text-foreground">{item.content}</p>
                <p className="text-sm text-muted-foreground mt-1">Color Preview</p>
              </div>
            </div>
          ) : (item.item_type === 'image' || isImageFile) ? (
             <div className="flex-col flex h-full bg-card rounded-xl border border-border shadow-[0_2px_8px_rgba(0,0,0,0.04)] overflow-hidden">
                {displayImageSrc && !imageError ? (
                  <div className="flex-1 flex items-center justify-center bg-secondary/30 relative w-full h-full overflow-hidden">
                     <img 
                        src={displayImageSrc} 
                        alt="Preview" 
                        className="w-full h-full object-contain"
                        onError={() => setImageError(true)}
                      />
                  </div>
                ) : (
                   <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground gap-2">
                      <ImageIcon className="w-8 h-8 opacity-20" />
                      <span className="text-sm opacity-50">{imageError ? "Image load failed" : "Image not available"}</span>
                   </div>
                )}
             </div>
          ) : (
            <div className="flex-grow bg-card rounded-xl border border-border shadow-[0_2px_8px_rgba(0,0,0,0.04)] p-4 overflow-y-auto">
              <pre className="font-mono text-[13px] leading-relaxed whitespace-pre-wrap break-words text-foreground/90 select-text font-medium">
                <HighlightedText text={contentToDisplay} highlight={search} />
              </pre>
            </div>
          )}
        </div>
        
        <div className="px-8 py-6 bg-card border-t border-border shrink-0">
          <div className="grid grid-cols-[100px_1fr] gap-y-4 items-center text-[13px]">
            <div className="text-[12px] text-muted-foreground font-medium">Content type</div>
            <div>
              <span className="px-2 py-0.5 bg-secondary text-foreground text-[11px] font-bold rounded border border-border inline-block">
                {item.item_type === 'text' ? 'TEXT' : item.item_type.toUpperCase()}
              </span>
            </div>

            {item.item_type === 'image' ? (
               <>
                 <div className="text-[12px] text-muted-foreground font-medium">Source</div>
                 <div className="text-[13px] font-mono font-bold text-foreground tabular-nums">Clipboard</div>
               </>
            ) : isImageFile ? (
               <>
                 <div className="text-[12px] text-muted-foreground font-medium">Source</div>
                 <div className="text-[13px] font-mono font-bold text-foreground tabular-nums">Local File</div>
               </>
            ) : (
               <>
                <div className="text-[12px] text-muted-foreground font-medium">Characters</div>
                <div className="text-[13px] font-mono font-bold text-foreground tabular-nums">{contentToDisplay.length.toLocaleString()}</div>

                <div className="text-[12px] text-muted-foreground font-medium">Words</div>
                <div className="text-[13px] font-mono font-bold text-foreground tabular-nums">{getWordCount(contentToDisplay).toLocaleString()}</div>
               </>
            )}

            <div className="text-[12px] text-muted-foreground font-medium">Created</div>
            <div className="text-[12px] text-foreground font-medium italic">
              {getRelativeTime(item.created_at)}
            </div>
          </div>
        </div>

        <div className="h-10 px-6 flex items-center justify-between text-[11px] border-t border-border bg-muted/30 shrink-0">
          <div className="flex items-center gap-2">
             <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 shadow-[0_0_4px_rgba(16,185,129,0.4)]"></div>
             <span className="font-bold text-muted-foreground tracking-wide text-[10px]">SYNCING ENABLED</span>
          </div>
          <div className="flex gap-4 font-semibold text-foreground">
             <div 
               className="flex items-center gap-1 cursor-pointer hover:text-primary transition-colors group"
               onClick={() => handleCopy(item)}
             >
               <span>Copy</span> 
               <kbd className="ml-1 px-1 py-0.5 rounded bg-foreground/5 border border-border/50 text-[9px] font-sans opacity-70 group-hover:border-primary/30 group-hover:text-primary/70 transition-all">↵</kbd>
             </div>
             <div 
               className="flex items-center gap-1 cursor-pointer hover:text-primary transition-colors group"
               onClick={() => setIsActionsOpen(true)}
             >
               <span>Actions</span> 
               <kbd className="ml-1 px-1 py-0.5 rounded bg-foreground/5 border border-border/50 text-[9px] font-sans opacity-70 group-hover:border-primary/30 group-hover:text-primary/70 transition-all">{cmdKey}K</kbd>
             </div>
          </div>
        </div>
      </div>
    );
  };

  // Component for lazy loading images in the list
  const HistoryListItem = ({ 
    item, 
    index, 
    isSelected, 
    search,
    onClick, 
    onDoubleClick, 
    setRef 
  }: { 
    item: HistoryItem, 
    index: number, 
    isSelected: boolean, 
    search: string,
    onClick: () => void, 
    onDoubleClick: () => void, 
    setRef: (el: HTMLDivElement | null) => void 
  }) => {
    const [imageContent, setImageContent] = useState<string | null>(null);
    const [isLoadingImage, setIsLoadingImage] = useState(false);
    const itemRef = useRef<HTMLDivElement | null>(null);
    const observerRef = useRef<IntersectionObserver | null>(null);

    useEffect(() => {
      if (item.item_type !== 'image' || imageContent) return;

      // Create observer to lazy load image
      observerRef.current = new IntersectionObserver((entries) => {
        if (entries[0].isIntersecting) {
          setIsLoadingImage(true);
          invoke<string>('get_item_content', { id: item.id })
            .then(content => {
              setImageContent(content);
            })
            .catch(err => {
              console.error("Failed to load list thumbnail", err);
            })
            .finally(() => {
              setIsLoadingImage(false);
              // Disconnect after loading
              if (observerRef.current) observerRef.current.disconnect();
            });
        }
      });

      if (itemRef.current) {
        observerRef.current.observe(itemRef.current);
      }

      return () => {
        if (observerRef.current) observerRef.current.disconnect();
      };
    }, [item.id, item.item_type]);

    const Icon = getTypeIcon(item.item_type, item.content);
    
    return (
      <div
        ref={(el) => {
          itemRef.current = el;
          setRef(el);
        }}
        className={cn(
          "mx-2 px-3 py-3 cursor-pointer text-sm transition-all flex items-center gap-3 mb-1.5 rounded-md border-l-[3px] relative",
          isSelected
            ? "bg-accent border-primary shadow-sm"
            : "border-transparent hover:bg-muted/50"
        )}
        onClick={onClick}
        onDoubleClick={onDoubleClick}
      >
        {/* Icon or Thumbnail */}
        <div className="shrink-0 w-10 h-10 flex items-center justify-center">
          {item.item_type === 'image' ? (
            <div className="w-full h-full overflow-hidden border border-border/20 bg-background/50 rounded-md flex items-center justify-center relative shadow-sm">
              {imageContent ? (
                <img 
                  src={imageContent} 
                  alt="thumbnail" 
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="flex items-center justify-center w-full h-full">
                  {isLoadingImage ? (
                    <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-primary/50"></div>
                  ) : (
                    <ImageIcon className="w-4 h-4 text-muted-foreground/50" />
                  )}
                </div>
              )}
            </div>
          ) : (
             <div className={cn(
               "w-10 h-10 flex items-center justify-center shrink-0 rounded-md shadow-sm transition-colors",
               isSelected ? "bg-background border border-border" : "bg-background/50 border border-border/10"
             )}>
              <Icon className={cn(
                "w-5 h-5 transition-colors", 
                isSelected ? "text-primary" : "text-muted-foreground/70",
                item.item_type === 'text' && !isSelected && "text-blue-500/70",
                item.item_type === 'link' && "text-sky-500",
                item.item_type === 'file' && "text-orange-500",
                item.item_type === 'color' && "text-pink-500"
              )} />
            </div>
          )}
        </div>

        {/* Content Info */}
        <div className="flex flex-col min-w-0 flex-1 gap-1.5">
          <div className="flex items-center justify-between">
            <div className={cn(
              "truncate text-sm w-full",
              isSelected ? "font-bold text-foreground" : "font-medium text-foreground/90"
            )}>
              {item.item_type === 'image' 
                ? "Image Capture" 
                : <HighlightedText text={item.content.trim().split('\n')[0] || "Empty content"} highlight={search} />
              }
            </div>
          </div>
          <div className={cn(
            "text-[11px] flex items-center justify-between font-medium",
            isSelected ? "text-muted-foreground" : "text-muted-foreground/70"
          )}>
             <span>{item.item_type === 'text' ? 'Text' : item.item_type.charAt(0).toUpperCase() + item.item_type.slice(1)}</span>
             <span>{getRelativeTime(item.created_at)}</span>
          </div>
        </div>
      </div>
    );
  };

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
      <div className="flex items-center gap-4 p-4 border-b border-border bg-background shrink-0 z-10">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/60" />
          <input
            ref={searchInputRef}
            placeholder="Type to filter..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            autoFocus
            className="flex h-9 w-full rounded-md border-0 bg-secondary/50 px-3 pl-9 py-1 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
          />
        </div>
        <Select value={filterType} onValueChange={setFilterType}>
          <SelectTrigger className="w-[140px] h-9 bg-secondary/50 border-0 shadow-sm focus:ring-1 focus:ring-ring text-sm font-medium text-muted-foreground">
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

        <Button variant="ghost" size="icon" className="h-9 w-9 text-muted-foreground/70 hover:text-foreground hover:bg-secondary/80 rounded-md transition-all" onClick={() => setIsSettingsOpen(true)}>
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
        <div className="w-[30%] min-w-[260px] max-w-[400px] border-r border-border flex flex-col bg-background">
          <div className="px-4 py-3 text-[11px] font-bold text-muted-foreground/50 uppercase tracking-wider sticky top-0 bg-background/95 backdrop-blur z-10">History</div>
          <ScrollArea className="flex-1">
            <div className="px-2 pb-2 space-y-1">
            {history.length === 0 ? (
              <div className="text-center text-muted-foreground py-12 text-sm">
                {search ? "No matching items" : "Clipboard is empty"}
              </div>
            ) : (
               <>
                {history.map((item, index) => {
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
                     >
                       <HistoryListItem
                         item={item}
                         index={index}
                         isSelected={isSelected}
                         search={search}
                         onClick={() => setSelectedIndex(index)}
                         onDoubleClick={() => handleCopy(item)}
                         setRef={() => {}} 
                       />
                     </div>
                   );
                 })}
               </>
            )}
            </div>
          </ScrollArea>
        </div>

        {/* Right Content: Preview & Details */}
        <div className="flex-1 flex flex-col bg-card h-full overflow-hidden">
          {selectedItem ? (
            renderPreview(selectedItem)
          ) : (
            <div className="flex items-center justify-center h-full text-muted-foreground/40 bg-card">
              <div className="flex flex-col items-center gap-3">
                <div className="p-4 rounded-full bg-muted/30">
                  <Clipboard className="w-8 h-8 opacity-50" />
                </div>
                <p className="text-sm font-medium">Select an item to view details</p>
              </div>
            </div>
          )}
        </div>
      </div>
      
      {/* Footer Status Bar (Original Footer - Removing since we moved it to Preview Pane) */}
      
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
