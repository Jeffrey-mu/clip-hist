import { useState, useEffect, useRef, memo, forwardRef } from "react";
import { invoke, convertFileSrc } from "@tauri-apps/api/core";
import { cn } from "@/lib/utils";
import { 
  FileText,
  Image as ImageIcon,
  Link as LinkIcon,
  Palette,
  File as FileIcon,
  Code as CodeIcon,
  Terminal,
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
  
  return (
    <div
      ref={(el) => {
        internalRef.current = el;
        if (typeof ref === 'function') ref(el);
        else if (ref) (ref as any).current = el;
      }}
      className={cn(
        "mx-2 px-3 py-2 cursor-pointer text-sm transition-all flex items-center gap-3 mb-0.5 rounded-md relative overflow-hidden max-w-full",
        isSelected
          ? "bg-accent shadow-sm"
          : "hover:bg-accent/50"
      )}
      onClick={() => onSelect(index)}
      onDoubleClick={() => onDoubleClick(index)}
    >
      {/* Icon or Thumbnail */}
      <div className="shrink-0 w-10 h-10 flex items-center justify-center">
        {(item.item_type === 'image' || isImageFile) ? (
          <div className="w-full h-full overflow-hidden border border-border bg-secondary/30 rounded-md flex items-center justify-center relative shadow-sm">
            {((item.item_type === 'image' && imageContent) || isImageFile) ? (
              <img 
                src={item.item_type === 'image' ? imageContent! : convertFileSrc(firstFilePath, 'asset')} 
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
              item.item_type === 'link' && !isSelected && "text-sky-500",
              item.item_type === 'file' && !isSelected && "text-orange-500",
              item.item_type === 'color' && !isSelected && "text-pink-500"
            )} />
          </div>
        )}
      </div>

      {/* Content Info */}
      <div className="flex-1 min-w-0 overflow-hidden h-10 flex flex-col justify-center">
        <div className="line-clamp-1 break-all text-sm leading-tight w-full font-medium text-foreground">
          {item.item_type === 'image' 
            ? "Image Capture" 
            : <HighlightedText text={item.content.trim().split('\n')[0] || "Empty content"} highlight={search} />
          }
        </div>
      </div>
    </div>
  );
}));

export default HistoryListItem;
