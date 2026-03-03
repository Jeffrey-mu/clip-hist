use tauri::{AppHandle, Emitter, Manager, State};
use std::thread;
use std::time::Duration;
use arboard::Clipboard;
use crate::db::Database;
use base64::{Engine as _, engine::general_purpose};
use image::{ImageBuffer, Rgba, DynamicImage};
use std::io::Cursor;
use std::collections::hash_map::DefaultHasher;
use std::hash::{Hash, Hasher};

pub fn start_listener(app: AppHandle) {
    // Get database state (thread-safe handle)
    // We need to clone the State wrapper, which is cheap (Arc)
    // But State<T> is not directly clonable in older Tauri versions? 
    // In Tauri v1, State<T> implements Clone. In v2 it should too.
    // However, State<T> lifetime is bound to the request scope usually.
    // But here we get it from AppHandle.
    // Actually, it's better to just move app handle and get state inside loop or just get state here.
    // Let's try getting state here.
    
    // Wait, State<'r, T> has a lifetime. We can't move it into 'static thread easily if it has lifetime.
    // But AppHandle is 'static (clonable).
    // So we can use AppHandle inside the thread to get State.
    
    thread::spawn(move || {
        let mut clipboard = match Clipboard::new() {
            Ok(c) => c,
            Err(e) => {
                eprintln!("Failed to initialize clipboard: {}", e);
                return;
            }
        };

        // We can get the state from the app handle
        // Note: The state must be managed before this runs.
        // Since we spawn this in setup() AFTER app.manage(db), it should be fine.
        let db_state: State<Database> = app.state::<Database>();
        let db = &*db_state; // Deref to Database

        let mut last_content = String::new();
        let mut last_image_hash: Option<u64> = None;

        loop {
            thread::sleep(Duration::from_millis(500));
            
            let mut new_content: Option<(String, String)> = None;
            let mut image_found = false;

            // 1. Try to get Image first
            if let Ok(img_data) = clipboard.get_image() {
                if img_data.width > 0 && img_data.height > 0 {
                    // Calculate hash of image data to avoid expensive processing if unchanged
                    let mut hasher = DefaultHasher::new();
                    img_data.bytes.hash(&mut hasher);
                    img_data.width.hash(&mut hasher);
                    img_data.height.hash(&mut hasher);
                    let current_hash = hasher.finish();

                    if last_image_hash != Some(current_hash) {
                        // Convert raw bytes (RGBA8) to PNG base64
                        let width = img_data.width as u32;
                        let height = img_data.height as u32;
                        let bytes = img_data.bytes.into_owned();

                        if let Some(img_buffer) = ImageBuffer::<Rgba<u8>, _>::from_raw(width, height, bytes) {
                            let dynamic_image = DynamicImage::ImageRgba8(img_buffer);
                            let mut png_bytes: Vec<u8> = Vec::new();
                            
                            if let Ok(_) = dynamic_image.write_to(&mut Cursor::new(&mut png_bytes), image::ImageOutputFormat::Png) {
                                let base64_str = general_purpose::STANDARD.encode(&png_bytes);
                                let content_str = format!("data:image/png;base64,{}", base64_str);
                                
                                // Check against last_content
                                if content_str != last_content {
                                    new_content = Some((content_str, "image".to_string()));
                                    last_image_hash = Some(current_hash);
                                    image_found = true;
                                } else {
                                    // Content string is same (should match hash logic, but just in case)
                                    last_image_hash = Some(current_hash);
                                    image_found = true;
                                }
                            }
                        }
                    } else {
                        // Image hasn't changed based on hash
                        image_found = true; 
                    }
                }
            }

            // 2. If no image detected, check text
            if !image_found {
                if let Ok(text) = clipboard.get_text() {
                    if text != last_content && !text.trim().is_empty() {
                        let type_ = detect_type(&text);
                        new_content = Some((text, type_));
                    }
                }
            }

            if let Some((content, type_)) = new_content {
                // Use the shared database connection
                if let Err(e) = db.insert(&content, &type_) {
                    eprintln!("Failed to insert history: {}", e);
                } else {
                    println!("Clipboard changed: type={}, len={}", type_, content.len());
                    // Emit full object
                    // We need to fetch the ID or just emit what we have.
                    // Ideally we should query the DB to get the full item including ID and created_at
                    // But for now, we just emit content/type and let frontend refresh or use this data.
                    
                    // Actually, db.insert updates created_at.
                    
                    let payload = serde_json::json!({
                        "content": content,
                        "item_type": type_,
                        "created_at": chrono::Local::now().to_rfc3339()
                    });
                     
                    if let Err(e) = app.emit("clipboard-changed", payload) {
                         eprintln!("Failed to emit event: {}", e);
                    }
                    last_content = content;
                }
            }
        }
    });
}

fn detect_type(content: &str) -> String {
    if content.starts_with("http://") || content.starts_with("https://") {
        return "link".to_string();
    }
    if content.starts_with("#") && (content.len() == 4 || content.len() == 7) {
         return "color".to_string();
    }
    if content.starts_with("/") || (content.len() > 2 && content.chars().nth(1) == Some(':')) {
        return "file".to_string();
    }
    "text".to_string()
}

pub fn copy_to_clipboard(content: &str) -> Result<(), String> {
    let mut clipboard = Clipboard::new().map_err(|e| e.to_string())?;
    clipboard.set_text(content.to_string()).map_err(|e| e.to_string())?;
    Ok(())
}
