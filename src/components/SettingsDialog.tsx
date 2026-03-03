
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { 
  Sun, 
  Moon, 
  Monitor, 
  Trash2, 
  Keyboard,
  Download,
  Upload
} from "lucide-react";
import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { enable, disable, isEnabled } from "@tauri-apps/plugin-autostart";
import { save, open as openDialog, ask } from "@tauri-apps/plugin-dialog";

const ShortcutRecorder = ({ value, onChange }: { value: string, onChange: (v: string) => void }) => {
  const [recording, setRecording] = useState(false);
  
  useEffect(() => {
    if (!recording) return;
    
    const handleKeyDown = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      
      if (e.key === 'Escape') {
        setRecording(false);
        return;
      }
      
      const modifiers: string[] = [];
      // On macOS, metaKey is Command. On Windows, it's Windows key (Super).
      // We map metaKey to CommandOrControl for macOS compatibility.
      if (e.metaKey) modifiers.push('CommandOrControl');
      if (e.ctrlKey) modifiers.push('Control');
      if (e.altKey) modifiers.push('Alt');
      if (e.shiftKey) modifiers.push('Shift');
      
      let key = e.key;
      if (['Meta', 'Control', 'Alt', 'Shift'].includes(key)) return;
      
      if (key.length === 1) {
        key = key.toUpperCase();
      }
      
      let finalKey = key;
      if (e.code === 'Space') finalKey = 'Space';
      
      if (modifiers.length > 0 && finalKey) {
        // Unique modifiers and sort order convention if needed
        const uniqueModifiers = Array.from(new Set(modifiers));
        const shortcut = [...uniqueModifiers, finalKey].join('+');
        onChange(shortcut);
        setRecording(false);
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [recording, onChange]);

  return (
    <Button 
      variant={recording ? "destructive" : "outline"} 
      onClick={() => setRecording(true)}
      className="font-mono h-8 text-sm px-3 min-w-[140px]"
    >
      {recording ? "按下快捷键..." : value.replace("CommandOrControl", "Cmd").replace("Control", "Ctrl")}
    </Button>
  );
};

interface SettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onClearHistory: () => void;
}

export function SettingsDialog({ open, onOpenChange, onClearHistory }: SettingsDialogProps) {
  // Local state for settings (in a real app, these would be persisted)
  const [theme, setTheme] = useState("system");
  const [primaryAction, setPrimaryAction] = useState("copy");
  const [historyDuration, setHistoryDuration] = useState("3months");
  const [showLinkPreview, setShowLinkPreview] = useState(true);
  const [updateHistoryOnAction, setUpdateHistoryOnAction] = useState(true);
  const [shortcut, setShortcut] = useState("CommandOrControl+D");
  const [autoStart, setAutoStart] = useState(false);

  // Load shortcut and settings from storage on mount
  useEffect(() => {
    // Autostart status
    isEnabled().then(setAutoStart).catch(console.error);

    const saved = localStorage.getItem("app-shortcut");
    if (saved) {
      setShortcut(saved);
      invoke("update_shortcut", { shortcut: saved }).catch(console.error);
    }
    
    // Load other preferences
    const savedTheme = localStorage.getItem("app-theme");
    if (savedTheme) setTheme(savedTheme);

    const savedHistoryDuration = localStorage.getItem("app-history-duration");
    if (savedHistoryDuration) setHistoryDuration(savedHistoryDuration);
  }, []);

  // Save preferences when they change
  useEffect(() => {
    localStorage.setItem("app-theme", theme);
  }, [theme]);

  useEffect(() => {
    localStorage.setItem("app-history-duration", historyDuration);
    
    // Auto-cleanup based on duration
    if (historyDuration !== "forever") {
      const cleanup = async () => {
        const now = new Date();
        let cutoff = new Date();
        
        switch (historyDuration) {
          case "1day": cutoff.setDate(now.getDate() - 1); break;
          case "7days": cutoff.setDate(now.getDate() - 7); break;
          case "30days": cutoff.setDate(now.getDate() - 30); break;
          case "3months": cutoff.setMonth(now.getMonth() - 3); break;
          case "1year": cutoff.setFullYear(now.getFullYear() - 1); break;
        }
        
        // SQLite expects 'YYYY-MM-DD HH:MM:SS' or ISO8601
        // created_at is stored via datetime('now') in SQLite which is UTC 'YYYY-MM-DD HH:MM:SS'
        const cutoffStr = cutoff.toISOString().replace('T', ' ').split('.')[0];
        try {
          await invoke("delete_before", { cutoffDate: cutoffStr });
        } catch (e) {
          console.error("Auto cleanup failed:", e);
        }
      };
      cleanup();
    }
  }, [historyDuration]);

  const handleShortcutChange = async (newShortcut: string) => {
    try {
      await invoke("update_shortcut", { shortcut: newShortcut });
      setShortcut(newShortcut);
      localStorage.setItem("app-shortcut", newShortcut);
    } catch (e) {
      console.error("Failed to update shortcut:", e);
      // For now, simple alert. In a real app, use a Toast.
      alert(`无法注册快捷键 "${newShortcut}": ${e}`);
    }
  };
  
  const handleAutoStartChange = async (checked: boolean) => {
    try {
      if (checked) {
        await enable();
      } else {
        await disable();
      }
      setAutoStart(checked);
    } catch (e) {
      console.error("Failed to toggle autostart:", e);
    }
  };
  
  const handleExport = async () => {
    try {
      const path = await save({
        filters: [{ name: 'JSON', extensions: ['json'] }],
        defaultPath: 'clipboard-history.json'
      });
      
      if (path) {
        await invoke("export_data", { path });
        // Optional: Show success toast
      }
    } catch (e) {
      console.error("Export failed:", e);
    }
  };
  
  const handleImport = async () => {
    try {
      const path = await openDialog({
        filters: [{ name: 'JSON', extensions: ['json'] }],
        multiple: false
      });
      
      if (path) {
        await invoke("import_data", { path });
        onOpenChange(false); // Close settings to see updated list
      }
    } catch (e) {
      console.error("Import failed:", e);
    }
  };

  const handleClearHistoryClick = async () => {
    try {
      const confirmed = await ask(
        "此操作将永久删除所有剪切板历史记录，无法撤销。\n\n建议您在清除前先导出数据进行备份。",
        {
          title: "确定要清空历史记录吗？",
          kind: "warning",
          okLabel: "确认清除",
          cancelLabel: "取消",
        }
      );

      if (confirmed) {
        onClearHistory();
      }
    } catch (e) {
      console.error("Failed to show confirmation dialog:", e);
    }
  };

  // Effect to apply theme (mock implementation)
  useEffect(() => {
    const root = window.document.documentElement;
    root.classList.remove("light", "dark");
    
    if (theme === "system") {
      const systemTheme = window.matchMedia("(prefers-color-scheme: dark)").matches
        ? "dark"
        : "light";
      root.classList.add(systemTheme);
    } else {
      root.classList.add(theme);
    }
  }, [theme]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl h-[80vh] p-0 overflow-hidden">
        <DialogHeader className="px-6 py-4 border-b">
          <DialogTitle className="text-xl font-semibold">设置</DialogTitle>
        </DialogHeader>
        
        <ScrollArea className="h-full px-6 py-4">
          <div className="space-y-8 pb-8">
            {/* Theme Section */}
            <section className="space-y-4">
              <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">外观</h3>
              <RadioGroup 
                defaultValue="system" 
                value={theme}
                onValueChange={setTheme}
                className="grid grid-cols-3 gap-4"
              >
                <div>
                  <RadioGroupItem value="light" id="light" className="peer sr-only" />
                  <Label
                    htmlFor="light"
                    className="flex flex-col items-center justify-between rounded-md border-2 border-muted bg-popover p-4 hover:bg-accent hover:text-accent-foreground peer-data-[state=checked]:border-primary [&:has([data-state=checked])]:border-primary cursor-pointer transition-all"
                  >
                    <Sun className="mb-3 h-6 w-6" />
                    <span className="font-medium">浅色</span>
                  </Label>
                </div>
                <div>
                  <RadioGroupItem value="dark" id="dark" className="peer sr-only" />
                  <Label
                    htmlFor="dark"
                    className="flex flex-col items-center justify-between rounded-md border-2 border-muted bg-popover p-4 hover:bg-accent hover:text-accent-foreground peer-data-[state=checked]:border-primary [&:has([data-state=checked])]:border-primary cursor-pointer transition-all"
                  >
                    <Moon className="mb-3 h-6 w-6" />
                    <span className="font-medium">深色</span>
                  </Label>
                </div>
                <div>
                  <RadioGroupItem value="system" id="system" className="peer sr-only" />
                  <Label
                    htmlFor="system"
                    className="flex flex-col items-center justify-between rounded-md border-2 border-muted bg-popover p-4 hover:bg-accent hover:text-accent-foreground peer-data-[state=checked]:border-primary [&:has([data-state=checked])]:border-primary cursor-pointer transition-all"
                  >
                    <Monitor className="mb-3 h-6 w-6" />
                    <span className="font-medium">跟随系统</span>
                  </Label>
                </div>
              </RadioGroup>
            </section>

            <Separator />

            {/* General Section */}
            <section className="space-y-6">
              <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">通用</h3>
              
              <div className="grid gap-2">
                <Label className="text-base">主要操作</Label>
                <p className="text-sm text-muted-foreground mb-2">按下回车键或双击条目时执行的操作。</p>
                <Select value={primaryAction} onValueChange={setPrimaryAction}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="选择操作" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="copy">复制到剪切板</SelectItem>
                    <SelectItem value="paste">粘贴到活动应用</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="grid gap-2">
                <Label className="text-base">历史保留时间</Label>
                <p className="text-sm text-muted-foreground mb-2">超过此时间的剪切板记录将被自动删除。</p>
                <Select value={historyDuration} onValueChange={setHistoryDuration}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="选择时间" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1day">1 天</SelectItem>
                    <SelectItem value="7days">7 天</SelectItem>
                    <SelectItem value="30days">30 天</SelectItem>
                    <SelectItem value="3months">3 个月</SelectItem>
                    <SelectItem value="1year">1 年</SelectItem>
                    <SelectItem value="forever">永久</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </section>

            <Separator />

            {/* Advanced Section */}
            <section className="space-y-6">
              <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">高级</h3>
              
  

              <div className="flex items-center justify-between space-x-4">
                <div className="flex flex-col space-y-1">
                  <Label className="text-base">显示链接预览</Label>
                  <p className="text-sm text-muted-foreground">
                    启用后，将获取并显示链接的社交卡片图片。
                  </p>
                </div>
                <Switch checked={showLinkPreview} onCheckedChange={setShowLinkPreview} />
              </div>

              <div className="flex items-center justify-between space-x-4">
                <div className="flex flex-col space-y-1">
                  <Label className="text-base">操作后更新历史位置</Label>
                  <p className="text-sm text-muted-foreground">
                    启用后，复制或粘贴条目时将其移动到历史记录顶部。
                  </p>
                </div>
                <Switch checked={updateHistoryOnAction} onCheckedChange={setUpdateHistoryOnAction} />
              </div>
            </section>
            
            <Separator />
            
            {/* System Section */}
             <section className="space-y-6">
              <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">系统</h3>
              
              <div className="flex items-center justify-between space-x-4">
                <div className="flex flex-col space-y-1">
                  <Label className="text-base">开机自动启动</Label>
                  <p className="text-sm text-muted-foreground">
                    登录系统时自动启动应用。
                  </p>
                </div>
                <Switch checked={autoStart} onCheckedChange={handleAutoStartChange} />
              </div>

               <div className="flex items-center justify-between">
                <div className="flex flex-col gap-1">
                  <span className="font-medium flex items-center gap-2"><Trash2 className="w-4 h-4"/> 清除历史记录</span>
                  <span className="text-sm text-muted-foreground">永久删除所有剪切板历史记录。</span>
                </div>
                <Button variant="destructive" size="sm" onClick={handleClearHistoryClick}>全部清除</Button>
              </div>
              
              <div className="flex items-center justify-between">
                <div className="flex flex-col gap-1">
                  <span className="font-medium flex items-center gap-2"><Keyboard className="w-4 h-4"/> 全局快捷键</span>
                  <span className="text-sm text-muted-foreground">显示/隐藏窗口</span>
                </div>
                <ShortcutRecorder value={shortcut} onChange={handleShortcutChange} />
              </div>
            </section>

            <Separator />

            {/* Data Management Section */}
            <section className="space-y-6">
                <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">数据管理</h3>
                <div className="flex gap-4">
                    <Button variant="outline" className="flex-1 gap-2" onClick={handleExport}>
                        <Download className="w-4 h-4" /> 导出数据
                    </Button>
                    <Button variant="outline" className="flex-1 gap-2" onClick={handleImport}>
                        <Upload className="w-4 h-4" /> 导入数据
                    </Button>
                </div>
            </section>
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
