use tauri::{AppHandle, Emitter};
use std::thread;
use std::time::Duration;
use arboard::{Clipboard, ImageData};
use crate::db::Database;
use base64::{Engine as _, engine::general_purpose};
use image::{ImageBuffer, Rgba, DynamicImage};
use std::borrow::Cow;
use std::io::Cursor;

pub fn start_listener(app: AppHandle) {
    thread::spawn(move || {
        let mut clipboard = match Clipboard::new() {
            Ok(c) => c,
            Err(e) => {
                eprintln!("Failed to initialize clipboard: {}", e);
                return;
            }
        };

        let db = Database::new(&app);
        
        // Ensure DB is ready
        // if let Err(e) = db.init() {
        //    eprintln!("Failed to init db in listener: {}", e);
        // }

        let mut last_content = String::new();

        loop {
            let mut new_content: Option<(String, String)> = None;
            let mut image_found = false;

            // 1. Try to get Image first
            if let Ok(img_data) = clipboard.get_image() {
                if img_data.width > 0 && img_data.height > 0 {
                    image_found = true;
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
                            }
                        }
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
                if let Err(e) = db.insert(&content, &type_) {
                    eprintln!("Failed to insert history: {}", e);
                } else {
                    println!("Clipboard changed: type={}, len={}", type_, content.len());
                    // Emit full object
                    let payload = serde_json::json!({
                        "content": content,
                        "item_type": type_,
                        "created_at": chrono::Local::now().to_rfc3339()
                    });
                    let _ = app.emit("clipboard-changed", payload);
                    last_content = content;
                }
            }
            
            thread::sleep(Duration::from_millis(1000));
        }
    });
}

fn detect_type(text: &str) -> String {
    if text.starts_with("http://") || text.starts_with("https://") {
        return "link".to_string();
    }
    // Hex color: #RRGGBB or #RGB
    if text.starts_with("#") {
        let hex = &text[1..];
        if (hex.len() == 6 || hex.len() == 3) && hex.chars().all(|c| c.is_ascii_hexdigit()) {
            return "color".to_string();
        }
    }
    // RGB/RGBA
    if text.starts_with("rgb(") || text.starts_with("rgba(") {
        return "color".to_string();
    }
    // File URL
    if text.starts_with("file://") {
        return "file".to_string();
    }
    // File path (simple check)
    // Check for absolute path on Unix (/) or Windows (C:\)
    if text.starts_with("/") || (text.len() > 2 && text.chars().nth(1) == Some(':')) {
        let path = std::path::Path::new(text);
        if path.exists() {
            return "file".to_string();
        }
    }
    "text".to_string()
}

pub fn copy_to_clipboard(content: &str) -> Result<(), String> {
    let mut clipboard = Clipboard::new().map_err(|e| e.to_string())?;
    
    if content.starts_with("data:image/png;base64,") {
         let b64 = content.trim_start_matches("data:image/png;base64,");
         let decoded = general_purpose::STANDARD.decode(b64).map_err(|e| e.to_string())?;
         let img = image::load_from_memory(&decoded).map_err(|e| e.to_string())?;
         let rgba = img.to_rgba8();
         let img_data = ImageData {
             width: rgba.width() as usize,
             height: rgba.height() as usize,
             bytes: Cow::Owned(rgba.into_raw()),
         };
         clipboard.set_image(img_data).map_err(|e| e.to_string())
    } else {
        clipboard.set_text(content).map_err(|e| e.to_string())
    }
}
