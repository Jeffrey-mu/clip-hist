use rusqlite::{params, Connection, Result};
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::sync::Mutex;

#[derive(Debug, Serialize, Deserialize)]
pub struct HistoryItem {
    pub id: i64,
    pub content: String,
    pub item_type: String,
    pub created_at: String,
}

pub struct Database {
    conn: Mutex<Connection>,
}

impl Database {
    pub fn new(path: PathBuf) -> Result<Self> {
        let conn = Connection::open(path)?;
        Ok(Self {
            conn: Mutex::new(conn),
        })
    }

    pub fn default_path() -> PathBuf {
        match std::env::current_dir() {
            Ok(mut path) => {
                path.push("target");
                if let Err(e) = std::fs::create_dir_all(&path) {
                    eprintln!("Warning: Failed to create target dir: {}", e);
                    // Fallback to raw filename in current dir
                    return PathBuf::from("history-dev.db");
                }
                path.push("history-dev.db");
                path
            },
            Err(e) => {
                eprintln!("Warning: Failed to get current dir: {}", e);
                PathBuf::from("history-dev.db")
            }
        }
    }

    pub fn init(&self) -> Result<()> {
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "CREATE TABLE IF NOT EXISTS clipboard_history (
                id INTEGER PRIMARY KEY,
                content TEXT NOT NULL UNIQUE,
                item_type TEXT NOT NULL DEFAULT 'text',
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )",
            [],
        )?;

        let _ = conn.execute(
            "ALTER TABLE clipboard_history ADD COLUMN item_type TEXT DEFAULT 'text'",
            [],
        );
        Ok(())
    }

    pub fn insert(&self, content: &str, item_type: &str) -> Result<()> {
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "INSERT INTO clipboard_history (content, item_type, created_at) VALUES (?1, ?2, datetime('now'))
             ON CONFLICT(content) DO UPDATE SET created_at = datetime('now'), item_type = ?2",
            params![content, item_type],
        )?;
        Ok(())
    }

    pub fn get_history(
        &self,
        limit: usize,
        offset: usize,
        search: Option<String>,
        filter_type: Option<String>,
    ) -> Result<Vec<HistoryItem>> {
        let conn = self.conn.lock().unwrap();

        // Optimized query:
        // 1. For images, return empty string for content to save memory/bandwidth
        // 2. For text, truncate to 200 chars for preview
        let mut query = "SELECT id, 
            CASE 
                WHEN item_type = 'image' THEN '' 
                ELSE substr(content, 1, 300) 
            END as content, 
            item_type, 
            datetime(created_at, 'localtime') as created_at 
            FROM clipboard_history".to_string();
            
        let mut where_clauses = Vec::new();
        let mut args: Vec<Box<dyn rusqlite::ToSql>> = Vec::new();

        if let Some(s) = search {
            if !s.is_empty() {
                // Only search content if item is NOT an image
                // Searching base64 image data is useless and confusing
                where_clauses.push("(item_type != 'image' AND content LIKE ?)");
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

    pub fn get_item(&self, id: i64) -> Result<Option<HistoryItem>> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare("SELECT id, content, item_type, datetime(created_at, 'localtime') FROM clipboard_history WHERE id = ?")?;
        
        let mut rows = stmt.query_map(params![id], |row| {
            Ok(HistoryItem {
                id: row.get(0)?,
                content: row.get(1)?,
                item_type: row.get(2)?,
                created_at: row.get(3)?,
            })
        })?;

        if let Some(row) = rows.next() {
            Ok(Some(row?))
        } else {
            Ok(None)
        }
    }

    pub fn delete_all(&self) -> Result<()> {
        let conn = self.conn.lock().unwrap();
        conn.execute("DELETE FROM clipboard_history", [])?;
        Ok(())
    }

    pub fn get_all_for_export(&self) -> Result<Vec<HistoryItem>> {
        let conn = self.conn.lock().unwrap();
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
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "INSERT INTO clipboard_history (content, item_type, created_at) VALUES (?1, ?2, ?3)
             ON CONFLICT(content) DO UPDATE SET created_at = ?3, item_type = ?2",
            params![item.content, item.item_type, item.created_at],
        )?;
        Ok(())
    }

    pub fn delete_before(&self, cutoff_date: &str) -> Result<()> {
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "DELETE FROM clipboard_history WHERE created_at < ?",
            params![cutoff_date],
        )?;
        Ok(())
    }

    pub fn delete_item(&self, id: i64) -> Result<()> {
        let conn = self.conn.lock().unwrap();
        conn.execute("DELETE FROM clipboard_history WHERE id = ?", params![id])?;
        Ok(())
    }

    pub fn update_item(&self, id: i64, content: &str) -> Result<()> {
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "UPDATE clipboard_history SET content = ? WHERE id = ?",
            params![content, id],
        )?;
        Ok(())
    }
}
