import { useState, useEffect } from "react";
import { HistoryItem } from "@/types";
import { getRelativeTime } from "@/lib/utils";
import { HighlightedText } from "./HistoryListItem";
import { convertFileSrc } from "@tauri-apps/api/core";
import { 
  Copy, 
  Trash2, 
  Share2, 
  Image as ImageIcon,
  FileText,
  Palette,
  Check,
  File
} from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";

// Simple Code Block component
const CodeBlock = ({ code, search }: { code: string, search: string }) => {
  if (search) {
    return (
      <pre className="font-mono text-[13px] leading-relaxed whitespace-pre-wrap break-words text-foreground/90 select-text font-medium">
        <HighlightedText text={code} highlight={search} />
      </pre>
    );
  }

  // Simple syntax highlighting when no search
  const keywords = ["const", "let", "var", "function", "return", "if", "else", "for", "while", "import", "export", "from", "class", "interface", "type", "async", "await", "new", "try", "catch", "switch", "case", "break", "continue", "default", "extends", "implements", "public", "private", "protected", "static", "readonly", "void", "any", "string", "number", "boolean", "null", "undefined", "true", "false", "def", "class", "print", "import", "from", "return", "if", "else", "elif", "for", "in", "while", "try", "except", "finally", "with", "as", "pass", "lambda"];
  
  const renderHighlighted = (text: string) => {
     // Let's use a simpler tokenization for "Simple Syntax Highlighting"
     // We will just highlight keywords.
     const tokenParts = text.split(new RegExp(`\\b(${keywords.join("|")})\\b`, "g"));
     
     return tokenParts.map((part, i) => {
        if (keywords.includes(part)) {
           return <span key={i} className="text-primary font-semibold">{part}</span>;
        } else if (part.match(/^\d+$/)) {
           return <span key={i} className="text-orange-500">{part}</span>;
        } else {
           return part;
        }
     });
  };

  return (
    <pre className="font-mono text-[13px] leading-relaxed whitespace-pre-wrap break-words text-foreground/90 select-text font-medium">
      {renderHighlighted(code)}
    </pre>
  );
};

interface PreviewPaneProps {
  item: HistoryItem;
  content: string; // The full content to display (loaded from cache/db)
  isLoading: boolean;
  search: string;
  onCopy: () => void;
  onDelete: () => void;
}

export function PreviewPane({ item, content, isLoading, search, onCopy, onDelete }: PreviewPaneProps) {
  const [imageDims, setImageDims] = useState<{w: number, h: number} | null>(null);
  const [imageError, setImageError] = useState(false);
  const [copied, setCopied] = useState(false);

  // Reset state on item change
  useEffect(() => {
    setImageDims(null);
    setImageError(false);
    setCopied(false);
  }, [item.id]);

  const handleCopy = () => {
    onCopy();
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (isLoading) {
    return (
      <div className="flex flex-col h-full items-center justify-center text-muted-foreground/50">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary/50"></div>
      </div>
    );
  }

  const isImageFile = item.item_type === 'file' && /\.(png|jpg|jpeg|gif|bmp|webp|svg|ico)$/i.test(content.trim().split('\n')[0]);
  const displayImageSrc = item.item_type === 'image' 
      ? content 
      : isImageFile 
          ? convertFileSrc(content.trim().split('\n')[0], 'asset') 
          : null;

  const handleImageLoad = (e: React.SyntheticEvent<HTMLImageElement>) => {
    const img = e.currentTarget;
    setImageDims({ w: img.naturalWidth, h: img.naturalHeight });
  };

  // Header Info
  const getHeaderInfo = () => {
    if (item.item_type === 'image' || isImageFile) {
        if (imageDims) return `${imageDims.w} × ${imageDims.h}`;
        return "Image";
    }
    if (item.item_type === 'color') return item.content.toUpperCase();
    if (item.item_type === 'text') {
        const lines = content.split('\n').length;
        const chars = content.length;
        return `${lines} Lines | ${chars} Chars`;
    }
    return item.item_type.toUpperCase();
  };

  const Icon = item.item_type === 'image' ? ImageIcon :
               item.item_type === 'link' ? Share2 :
               item.item_type === 'color' ? Palette :
               item.item_type === 'file' ? File :
               FileText;

  return (
    <div className="flex flex-col h-full bg-card overflow-hidden font-sans text-foreground relative group/preview">
       {/* Floating Actions (Top Right) */}
       <div className="absolute top-4 right-4 z-20 flex gap-2 opacity-0 group-hover/preview:opacity-100 transition-all duration-200 translate-y-2 group-hover/preview:translate-y-0">
          <button 
            onClick={handleCopy}
            className="p-2 rounded-lg bg-background/80 backdrop-blur border border-border/50 shadow-sm hover:bg-primary/10 hover:text-primary transition-colors text-muted-foreground"
            title="Copy to Clipboard"
          >
            {copied ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
          </button>
          <button 
            onClick={() => {
              // Simple share mock or implementation
              if (navigator.share) {
                navigator.share({
                  title: 'Shared from ClipHist',
                  text: content
                }).catch(console.error);
              } else {
                onCopy(); // Fallback to copy
              }
            }}
            className="p-2 rounded-lg bg-background/80 backdrop-blur border border-border/50 shadow-sm hover:bg-primary/10 hover:text-primary transition-colors text-muted-foreground"
            title="Share"
          >
            <Share2 className="w-4 h-4" />
          </button>
          <button 
            onClick={onDelete}
            className="p-2 rounded-lg bg-background/80 backdrop-blur border border-border/50 shadow-sm hover:bg-destructive/10 hover:text-destructive transition-colors text-muted-foreground"
             title="Delete Item"
          >
            <Trash2 className="w-4 h-4" />
          </button>
       </div>

       {/* Header */}
       <div className="px-6 py-4 border-b border-border/50 flex items-center justify-between bg-card/50 backdrop-blur-sm shrink-0 z-10">
          <div className="flex items-center gap-3">
             <div className="p-2 rounded-lg bg-secondary text-primary/80">
                <Icon className="w-5 h-5" />
             </div>
             <div className="flex flex-col gap-0.5">
                <span className="text-[13px] font-bold tracking-tight text-foreground">{getHeaderInfo()}</span>
                <span className="text-[11px] text-muted-foreground font-medium">{getRelativeTime(item.created_at)}</span>
             </div>
          </div>
       </div>

       {/* Content Area */}
       <div className="flex-grow overflow-hidden relative bg-secondary/20">
          {item.item_type === 'color' ? (
             <div className="flex items-center justify-center h-full p-8">
                <div className="flex flex-col items-center gap-4">
                   <div 
                      className="w-40 h-40 rounded-2xl shadow-lg border-4 border-card ring-1 ring-border/10"
                      style={{ backgroundColor: item.content }}
                   />
                   <span className="font-mono text-2xl font-bold tracking-wider select-all">{item.content}</span>
                </div>
             </div>
          ) : (displayImageSrc && !imageError) ? (
             <div className="flex items-center justify-center h-full p-8 overflow-hidden bg-[url('data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIyMCIgaGVpZ2h0PSIyMCIgZmlsbD0ib3BhY2l0eSI+PHJlY3QgeD0iMCIgeT0iMCIgd2lkdGg9IjEwIiBoZWlnaHQ9IjEwIiBmaWxsPSIjODg4IiBvcGFjaXR5PSIwLjA1Ii8+PHJlY3QgeD0iMTAiIHk9IjEwIiB3aWR0aD0iMTAiIGhlaWdodD0iMTAiIGZpbGw9IiM4ODgiIG9wYWNpdHk9IjAuMDUiLz48L3N2Zz4=')]">
                <img 
                  src={displayImageSrc} 
                  alt="Preview" 
                  className="max-w-full max-h-full object-contain shadow-2xl rounded-lg"
                  onLoad={handleImageLoad}
                  onError={() => setImageError(true)}
                />
             </div>
          ) : (
             <ScrollArea className="h-full">
                <div className="p-8">
                   <CodeBlock code={content} search={search} />
                </div>
             </ScrollArea>
          )}
       </div>
    </div>
  );
}
