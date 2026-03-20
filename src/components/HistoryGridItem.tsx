import { useState, useEffect, useRef, memo, forwardRef } from "react";
import { invoke, convertFileSrc } from "@tauri-apps/api/core";
import { cn } from "@/lib/utils";
import { 
  Image as ImageIcon, 
  FileText, 
  Link as LinkIcon, 
  File as FileIcon, 
  Terminal 
} from "lucide-react";
import { HistoryItem } from "@/types";

interface HistoryGridItemProps {
  item: HistoryItem;
  index: number;
  isSelected: boolean;
  onSelect: (index: number) => void;
  onDoubleClick: (index: number) => void;
}

const imageExtensionRegex = /\.(png|jpg|jpeg|gif|bmp|webp|svg|ico)$/i;

const HistoryGridItem = memo(forwardRef<HTMLDivElement, HistoryGridItemProps>(({ item, index, isSelected, onSelect, onDoubleClick }, ref) => {
  const [imageContent, setImageContent] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const localRef = useRef<HTMLDivElement | null>(null);
  const observerRef = useRef<IntersectionObserver | null>(null);

  const firstFilePath = item.item_type === 'file' ? item.content.trim().split('\n')[0].trim() : "";
  const isImageFile = item.item_type === 'file' && imageExtensionRegex.test(firstFilePath);
  const isImage = item.item_type === 'image' || isImageFile;

  // Combine refs
  const setRefs = (node: HTMLDivElement | null) => {
    localRef.current = node;
    if (typeof ref === 'function') {
      ref(node);
    } else if (ref) {
      ref.current = node;
    }
  };

  useEffect(() => {
    if (item.item_type !== 'image' || imageContent) return;

    observerRef.current = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting) {
        setIsLoading(true);
        invoke<string>('get_item_content', { id: item.id })
          .then(content => setImageContent(content))
          .catch(err => console.error("Failed to load thumbnail", err))
          .finally(() => {
            setIsLoading(false);
            if (observerRef.current) observerRef.current.disconnect();
          });
      }
    });

    if (localRef.current) {
      observerRef.current.observe(localRef.current);
    }

    return () => {
      if (observerRef.current) observerRef.current.disconnect();
    };
  }, [item.id, item.item_type, imageContent]);

  const displaySrc = item.item_type === 'image' ? imageContent : (isImageFile ? convertFileSrc(firstFilePath, 'asset') : null);

  return (
    <div 
      ref={setRefs}
      className={cn(
        "aspect-square rounded-xl border overflow-hidden cursor-pointer relative group transition-all bg-card shadow-sm hover:shadow-md",
        isSelected ? "ring-2 ring-primary border-primary/50" : "border-border/50 hover:border-primary/30"
      )}
      onClick={() => onSelect(index)}
      onDoubleClick={() => onDoubleClick(index)}
    >
       {/* Content */}
       {isImage ? (
          <div className="w-full h-full bg-secondary/30 relative flex items-center justify-center overflow-hidden">
             {(displaySrc) ? (
                <img 
                  src={displaySrc!} 
                  alt="thumbnail" 
                  className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
                />
             ) : (
                <div className="flex flex-col items-center gap-2 text-muted-foreground/40">
                   {isLoading ? <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary/50" /> : <ImageIcon className="w-6 h-6" />}
                </div>
             )}
          </div>
       ) : item.item_type === 'color' ? (
          <div className="w-full h-full relative group-hover:scale-110 transition-transform duration-300" style={{ backgroundColor: item.content }} />
       ) : (
          <div className="w-full h-full p-3 flex flex-col justify-between relative overflow-hidden">
             <div className="flex justify-end opacity-50">
                {item.item_type === 'link' ? <LinkIcon className="w-3 h-3 text-blue-500" /> :
                 item.item_type === 'file' ? <FileIcon className="w-3 h-3 text-orange-500" /> :
                 item.item_type === 'code' ? <Terminal className="w-3 h-3 text-green-500" /> :
                 <FileText className="w-3 h-3" />
                }
             </div>
             <p className="text-[10px] text-muted-foreground/80 leading-tight line-clamp-4 break-all font-mono">
                {item.content}
             </p>
             <div className="h-2" />
          </div>
       )}
       
       {/* Overlay Label on Hover */}
       <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent p-2 opacity-0 group-hover:opacity-100 transition-opacity flex justify-between items-end">
          <span className="text-white text-[9px] font-bold uppercase tracking-wider truncate max-w-[80%]">
             {{
                'image': '图片',
                'link': '链接',
                'color': '颜色',
                'file': '文件',
                'text': '文本'
             }[item.item_type] || item.item_type}
          </span>
       </div>
       
       {/* Selected Checkmark */}
       {isSelected && (
          <div className="absolute top-2 right-2 w-4 h-4 rounded-full bg-primary flex items-center justify-center shadow-sm">
             <div className="w-1.5 h-1.5 rounded-full bg-white" />
          </div>
       )}
    </div>
  );
}));

export default HistoryGridItem;
