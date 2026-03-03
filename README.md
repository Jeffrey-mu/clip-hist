# ClipHist (剪贴板历史记录工具)

ClipHist 是一个基于 Tauri v2 构建的轻量级、高性能剪贴板历史记录管理工具。它旨在提供类似 Raycast 的流畅体验，帮助开发者和高效用户更好地管理和检索剪贴板内容。

## ✨ 核心特性

*   **多类型支持**：完美支持文本、图片、颜色代码、文件路径和链接。
*   **智能预览**：
    *   **图片**：清晰的缩略图和详情预览。
    *   **颜色**：直观的色块展示和 Hex 值。
    *   **文本**：支持代码高亮和长文本滚动。
*   **多屏优化**：窗口智能跟随鼠标位置，在当前光标所在的屏幕中央呼出，无缝切换。
*   **极致性能**：基于 Rust 后端，占用资源极低，响应速度极快。
*   **完全本地化**：所有数据存储在本地，安全无忧。
*   **高效交互**：
    *   **全局快捷键**：一键呼出/隐藏（默认 `Cmd+Shift+V`）。
    *   **搜索过滤**：支持实时搜索和类型过滤（文本/图片/文件等）。
    *   **键盘操作**：全键盘支持，无需鼠标即可完成选择和粘贴。
*   **贴心细节**：
    *   **相对时间**：直观显示“5分钟前”、“刚刚”。
    *   **OCR 识别**：(实验性) 支持从图片中提取文字。
    *   **数据管理**：支持导入/导出备份，以及带二次确认的安全清除功能。
    *   **深色模式**：完美适配系统外观，支持深色/浅色主题切换。

## 🛠️ 技术栈

*   **Core**: [Tauri v2](https://v2.tauri.app/) (Rust)
*   **Frontend**: React 19 + TypeScript
*   **UI Framework**: [Shadcn UI](https://ui.shadcn.com/)
*   **Styling**: Tailwind CSS
*   **Build Tool**: Vite

## 🚀 快速开始

### 环境要求

*   Node.js (建议 v20+)
*   Rust (最新稳定版)
*   包管理器 (pnpm/npm/yarn)

### 安装依赖

```bash
# 安装前端依赖
npm install

# 确保 Rust 环境就绪
# 参考: https://www.rust-lang.org/tools/install
```

### 开发模式

```bash
# 启动开发服务器
npm run tauri dev
```

### 构建发布

```bash
# 构建生产版本
npm run tauri build
```

## 📂 项目结构

```
clip-hist/
├── src/                # 前端源代码 (React)
│   ├── components/     # UI 组件
│   ├── App.tsx         # 主应用逻辑
│   └── index.css       # 全局样式
├── src-tauri/          # 后端源代码 (Rust)
│   ├── src/
│   │   ├── lib.rs      # 核心逻辑与命令
│   │   ├── main.rs     # 入口文件
│   │   └── ...
│   ├── tauri.conf.json # Tauri 配置文件
│   └── capabilities/   # 权限配置
└── ...
```

## 📝 许可证

[MIT License](LICENSE)
