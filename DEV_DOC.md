# 剪切板历史工具 (ClipHist) 开发文档

## 1. 项目概述

**ClipHist** 是一个轻量级、跨平台的剪切板历史记录管理工具，旨在帮助用户高效地检索和使用过往复制的内容。该项目基于 [Tauri](https://tauri.app/) 框架开发，利用 Rust 的高性能和安全性处理系统级交互，结合 React 前端提供流畅的用户界面。

### 核心特性
- **实时监听**：自动捕获系统剪切板的文本和图片内容。
- **历史记录**：本地持久化存储剪切板历史，支持无限滚动或分页。
- **智能检索**：支持对历史文本内容进行全文搜索。
- **快捷操作**：全局快捷键唤起/隐藏窗口，点击列表项即可复制并粘贴。
- **数据隐私**：所有数据仅存储在本地，不上传云端。

## 2. 技术栈选型

| 模块 | 技术方案 | 说明 |
| :--- | :--- | :--- |
| **框架核心** | **Tauri (v1/v2)** | 构建跨平台桌面应用，资源占用极低。 |
| **后端逻辑** | **Rust** | 处理系统剪切板监听、数据库操作、全局快捷键等。 |
| **前端框架** | **React + TypeScript** | 构建用户界面，使用 Vite 作为构建工具。 |
| **UI 组件库** | **Tailwind CSS + shadcn/ui** | 快速构建美观、响应式的界面。 |
| **状态管理** | **Zustand / TanStack Query** | 管理前端应用状态和异步数据缓存。 |
| **数据库** | **SQLite** | 使用 `tauri-plugin-sql` 进行本地数据持久化。 |
| **剪切板管理** | **arboard / tauri-plugin-clipboard** | Rust 生态中成熟的跨平台剪切板库。 |

## 3. 架构设计

### 3.1 模块划分

1.  **Clipboard Monitor (Rust)**
    -   后台线程轮询或事件驱动监听系统剪切板。
    -   检测到变化时，读取内容（Text/Image）。
    -   计算内容哈希（Hash）用于去重。
    -   将新内容存入 SQLite 数据库。
    -   通过 Tauri Event (`clipboard://change`) 通知前端刷新。

2.  **Data Persistence (Rust + SQLite)**
    -   负责数据的增删改查。
    -   定期清理过期数据（可选配置）。

3.  **System Tray & Global Shortcut (Rust)**
    -   管理系统托盘图标和菜单（显示/退出）。
    -   注册全局快捷键（如 `Cmd/Ctrl + Shift + V`）切换窗口显隐。

4.  **Frontend UI (React)**
    -   **History List**: 虚拟列表展示历史记录，支持图片预览。
    -   **Search Bar**: 实时过滤列表内容。
    -   **Settings**: 配置快捷键、历史记录保留条数等。

### 3.2 数据模型 (SQLite Schema)

主要数据表：`clipboard_history`

```sql
CREATE TABLE IF NOT EXISTS clipboard_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    type TEXT NOT NULL,          -- 'text', 'image', 'file' 等
    content TEXT,                -- 文本内容
    preview_image BLOB,          -- 图片缩略图或原始数据 (考虑性能，可能只存路径或缩略图)
    hash TEXT UNIQUE,            -- 内容哈希，用于去重
    is_pinned BOOLEAN DEFAULT 0, -- 是否收藏/置顶
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```
*注：对于大图片，建议存储在文件系统，数据库仅存路径；或者存储压缩后的 Base64 字符串。本方案初期可尝试直接存 Text，图片暂存 Base64 或文件路径。*

### 3.3 关键 API (Tauri Commands)

前端调用的 Rust 函数：

-   `get_history(limit: u32, offset: u32, search: String) -> Vec<HistoryItem>`: 分页获取历史记录。
-   `copy_to_clipboard(id: i32) -> Result<(), String>`: 将指定历史记录重新写入系统剪切板（并更新其 `created_at` 使其置顶）。
-   `delete_item(id: i32)`: 删除单条记录。
-   `clear_history()`: 清空所有历史。
-   `set_window_visibility(visible: bool)`: 控制窗口显示/隐藏。

## 4. 交互流程

1.  **应用启动**：
    -   初始化 SQLite 数据库。
    -   启动剪切板监听线程。
    -   注册全局快捷键。
    -   创建系统托盘。

2.  **捕获剪切板**：
    -   用户在其他应用复制 -> Rust 监听到变化 -> 读取内容 -> 存入 DB -> 发送事件 -> 前端更新列表。

3.  **用户使用**：
    -   用户按下快捷键 -> 窗口显示并聚焦输入框。
    -   用户浏览或搜索 -> 选中某项 -> Rust 将内容写入剪切板 -> (可选) 模拟粘贴动作 -> 窗口隐藏。

## 5. 开发计划

1.  **Phase 1: 基础框架搭建**
    -   初始化 Tauri + React 项目。
    -   配置 Tailwind CSS 和 shadcn/ui。
    -   实现 SQLite 数据库连接和表创建。

2.  **Phase 2: 剪切板核心功能**
    -   实现 Rust 端剪切板监听 (Text 类型优先)。
    -   实现数据入库和去重逻辑。
    -   实现前端列表展示和搜索。

3.  **Phase 3: 交互优化**
    -   实现回写剪切板功能。
    -   添加全局快捷键和托盘支持。
    -   支持图片类型剪切板记录。

4.  **Phase 4: 完善与发布**
    -   UI 美化。
    -   设置页面（清除历史、快捷键配置）。
    -   构建与打包。
