use rusqlite::{params, Connection, Result};
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use tauri::AppHandle;

#[derive(Debug, Serialize, Deserialize)]
pub struct HistoryItem {
    pub id: i64,
    pub content: String,
    pub item_type: String,
    pub created_at: String,
}

pub struct Database {
    path: PathBuf,
}

impl Database {
    pub fn new(_app: &AppHandle) -> Self {
        // Use target directory for dev to avoid triggering watch and permission issues
        // let path = std::env::current_dir().unwrap().join("target/history.db");
        // Better: use a temp directory or specific dev path that is ignored
        let mut path = std::env::current_dir().unwrap();
        path.push("target");
        std::fs::create_dir_all(&path).expect("failed to create target dir");
        path.push("history-dev.db");
        println!("Database path: {:?}", path);
        Self { path }
    }

    pub fn init(&self) -> Result<()> {
        let conn = Connection::open(&self.path)?;
        conn.execute(
            "CREATE TABLE IF NOT EXISTS clipboard_history (
                id INTEGER PRIMARY KEY,
                content TEXT NOT NULL UNIQUE,
                item_type TEXT NOT NULL DEFAULT 'text',
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )",
            [],
        )?;
        
        // Attempt to add 'item_type' column if it doesn't exist (migration)
        // We use catch_unwind or simply ignore the error if column exists
        // But better to check if column exists first? No, just try adding and ignore specific error.
        // However, here we just log the error if it fails, which might be useful for debugging.
        let result = conn.execute("ALTER TABLE clipboard_history ADD COLUMN item_type TEXT DEFAULT 'text'", []);
        if let Err(e) = result {
            // Only ignore "duplicate column name" error
            // SQLite error code for this is usually generic operational error, so checking string is common
            if !e.to_string().contains("duplicate column name") {
                eprintln!("Migration warning (adding item_type): {}", e);
            }
        }
        
        // Also try to migrate old 'type' column to 'item_type' if needed? 
        // For now, let's just stick to 'item_type'. 
        // If user already has 'type' column from my previous failed attempt, it's fine, we just ignore it.
        
        Ok(())
    }

    pub fn insert(&self, content: &str, item_type: &str) -> Result<()> {
        let conn = Connection::open(&self.path)?;
        // If exists, update timestamp to bring to top
        conn.execute(
            "INSERT INTO clipboard_history (content, item_type, created_at) VALUES (?1, ?2, datetime('now'))
             ON CONFLICT(content) DO UPDATE SET created_at = datetime('now'), item_type = ?2",
            params![content, item_type],
        )?;
        Ok(())
    }

    pub fn get_history(&self, limit: usize, offset: usize, search: Option<String>, filter_type: Option<String>) -> Result<Vec<HistoryItem>> {
        let conn = Connection::open(&self.path)?;
        
        let mut query = "SELECT id, content, item_type, created_at FROM clipboard_history".to_string();
        let mut where_clauses = Vec::new();
        let mut args: Vec<Box<dyn rusqlite::ToSql>> = Vec::new();

        if let Some(s) = search {
             if !s.is_empty() {
                where_clauses.push("content LIKE ?");
                args.push(Box::new(format!("%{}%", s)));
             }
        }
        
        if let Some(f) = filter_type {
            if f != "all" {
                where_clauses.push("item_type = ?");
                args.push(Box::new(f));
            }
        }

        if !where_clauses.is_empty() {
            query.push_str(" WHERE ");
            query.push_str(&where_clauses.join(" AND "));
        }

        query.push_str(" ORDER BY created_at DESC LIMIT ? OFFSET ?");
        args.push(Box::new(limit));
        args.push(Box::new(offset));

        let mut stmt = conn.prepare(&query)?;
        
        let rows = stmt.query_map(rusqlite::params_from_iter(args.iter()), |row| {
             Ok(HistoryItem {
                id: row.get(0)?,
                content: row.get(1)?,
                item_type: row.get(2)?,
                created_at: row.get(3)?,
            })
        })?;

        rows.collect()
    }

    pub fn delete_all(&self) -> Result<()> {
        let conn = Connection::open(&self.path)?;
        conn.execute("DELETE FROM clipboard_history", [])?;
        Ok(())
    }

    pub fn get_all_for_export(&self) -> Result<Vec<HistoryItem>> {
        let conn = Connection::open(&self.path)?;
        let mut stmt = conn.prepare("SELECT id, content, item_type, created_at FROM clipboard_history ORDER BY created_at DESC")?;
        let rows = stmt.query_map([], |row| {
             Ok(HistoryItem {
                id: row.get(0)?,
                content: row.get(1)?,
                item_type: row.get(2)?,
                created_at: row.get(3)?,
            })
        })?;
        rows.collect()
    }

    pub fn import_item(&self, item: &HistoryItem) -> Result<()> {
        let conn = Connection::open(&self.path)?;
        conn.execute(
            "INSERT INTO clipboard_history (content, item_type, created_at) VALUES (?1, ?2, ?3)
             ON CONFLICT(content) DO UPDATE SET created_at = ?3, item_type = ?2",
            params![item.content, item.item_type, item.created_at],
        )?;
        Ok(())
    }
}
