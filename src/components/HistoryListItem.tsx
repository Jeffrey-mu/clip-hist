import { useState, useEffect, useRef, memo, forwardRef } from "react";
import { invoke, convertFileSrc } from "@tauri-apps/api/core";
import { cn, getRelativeTime } from "@/lib/utils";
import { 
  FileText,
  Image as ImageIcon,
  Link as LinkIcon,
  Palette,
  File as FileIcon,
  Code as CodeIcon,
  Terminal,
  CornerDownLeft
} from "lucide-react";
import { HistoryItem } from "@/types";

export const getTypeIcon = (type: string, content?: string) => {
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

export const HighlightedText = memo(({ text, highlight }: { text: string, highlight: string }) => {
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
});

interface HistoryListItemProps {
  item: HistoryItem;
  index: number;
  isSelected: boolean;
  search: string;
  onSelect: (index: number) => void;
  onDoubleClick: (index: number) => void;
}

const HistoryListItem = memo(forwardRef<HTMLDivElement, HistoryListItemProps>(({ 
  item, 
  index, 
  isSelected, 
  search,
  onSelect, 
  onDoubleClick, 
}, ref) => {
  const [imageContent, setImageContent] = useState<string | null>(null);
  const [isLoadingImage, setIsLoadingImage] = useState(false);
  const internalRef = useRef<HTMLDivElement | null>(null);
  const observerRef = useRef<IntersectionObserver | null>(null);

  const firstFilePath = item.item_type === 'file' ? item.content.trim().split('\n')[0].trim() : "";
  const isImageFile = item.item_type === 'file' && /\.(png|jpg|jpeg|gif|bmp|webp|svg|ico)$/i.test(firstFilePath);

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

    if (internalRef.current) {
      observerRef.current.observe(internalRef.current);
    }

    return () => {
        if (observerRef.current) observerRef.current.disconnect();
      };
    }, [item.id, item.item_type, imageContent]);

  const Icon = getTypeIcon(item.item_type, item.content);
  
  // Format subtitle text
  const getSubtitle = () => {
    const timeAgo = getRelativeTime(item.created_at);
    let typeText = item.item_type.charAt(0).toUpperCase() + item.item_type.slice(1);
    
    if (item.item_type === 'text') {
      if (item.content.trim().startsWith('http')) typeText = 'Link';
      else if (item.content.length > 500) typeText = 'Long Text';
    }
    
    return `${typeText} • ${timeAgo}`;
  };

  return (
    <div
      ref={(el) => {
        internalRef.current = el;
        if (typeof ref === 'function') ref(el);
        else if (ref) (ref as any).current = el;
      }}
      className={cn(
        "group mx-2 mb-1 px-3 py-2 cursor-pointer transition-all flex items-center gap-3 rounded-xl relative overflow-hidden h-14 border border-transparent",
        isSelected
          ? "bg-primary/15 shadow-sm border-primary/10"
          : "hover:bg-secondary/80 hover:border-border/40"
      )}
      onClick={() => onSelect(index)}
      onDoubleClick={() => onDoubleClick(index)}
    >
      {/* Active Indicator Strip */}
      {isSelected && (
        <div className="absolute left-0 top-3 bottom-3 w-[2px] bg-primary rounded-r-full shadow-[0_0_8px_rgba(0,122,255,0.4)]" />
      )}

      {/* Icon or Thumbnail */}
      <div className="shrink-0 w-10 h-10 flex items-center justify-center">
        {(item.item_type === 'image' || isImageFile) ? (
          <div className="w-full h-full overflow-hidden border border-border/60 bg-secondary/30 rounded-lg flex items-center justify-center relative shadow-sm group-hover:shadow transition-all">
            {((item.item_type === 'image' && imageContent) || isImageFile) ? (
              <img 
                src={item.item_type === 'image' ? imageContent! : convertFileSrc(firstFilePath, 'asset')} 
                alt="thumbnail" 
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="flex items-center justify-center w-full h-full bg-secondary/50">
                {isLoadingImage ? (
                  <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-primary/50"></div>
                ) : (
                  <ImageIcon className="w-4 h-4 text-muted-foreground/40" />
                )}
              </div>
            )}
          </div>
        ) : (
           <div className={cn(
             "w-10 h-10 flex items-center justify-center shrink-0 rounded-lg shadow-sm transition-all border",
             isSelected 
               ? "bg-background border-border shadow-inner" 
               : "bg-background/60 border-border/40 group-hover:bg-background group-hover:border-border/60"
           )}>
            <Icon className={cn(
              "w-5 h-5 transition-colors", 
              isSelected ? "text-primary" : "text-muted-foreground/60 group-hover:text-muted-foreground/80",
              item.item_type === 'color' && "text-pink-500/80"
            )} />
          </div>
        )}
      </div>

      {/* Content Info (Double Line) */}
      <div className="flex-1 min-w-0 overflow-hidden flex flex-col justify-center gap-0.5">
        {/* Main Title */}
        <div className={cn(
          "line-clamp-1 break-all text-[13px] leading-tight w-full font-semibold transition-colors",
          isSelected ? "text-foreground" : "text-foreground/90 group-hover:text-foreground"
        )}>
          {item.item_type === 'image' 
            ? "Image Capture" 
            : <HighlightedText text={item.content.trim().split('\n')[0] || "Empty content"} highlight={search} />
          }
        </div>
        
        {/* Subtitle */}
        <div className={cn(
          "text-[11px] leading-tight truncate font-medium flex items-center gap-2 transition-colors",
          isSelected ? "text-primary/80" : "text-muted-foreground/60 group-hover:text-muted-foreground/80"
        )}>
          {getSubtitle()}
        </div>
      </div>
      
      {/* Right Action Hint (Enter) */}
      <div className={cn(
        "absolute right-3 top-1/2 -translate-y-1/2 transition-all duration-200",
        "opacity-0 group-hover:opacity-100",
        isSelected && "opacity-0" // Hide on selected since it's already focused? Or maybe show? User said "when hover".
      )}>
         <div className="flex items-center justify-center w-6 h-6 rounded bg-background/80 border border-border/50 shadow-sm backdrop-blur-sm">
            <CornerDownLeft className="w-3 h-3 text-muted-foreground" />
         </div>
      </div>
    </div>
  );
}));

export default HistoryListItem;
