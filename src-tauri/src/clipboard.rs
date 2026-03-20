use crate::db::Database;
use arboard::Clipboard;
use base64::{engine::general_purpose, Engine as _};
use image::{DynamicImage, ImageBuffer, Rgba};
#[cfg(target_os = "macos")]
use objc::{class, msg_send, sel, sel_impl};
use std::collections::hash_map::DefaultHasher;
use std::hash::{Hash, Hasher};
use std::io::Cursor;
use std::thread;
use std::time::Duration;
use tauri::{AppHandle, Emitter, Manager, State};
#[cfg(target_os = "macos")]
use cocoa::appkit::NSPasteboard;
#[cfg(target_os = "macos")]
use cocoa::base::{id, nil};
#[cfg(target_os = "macos")]
use cocoa::foundation::{NSArray, NSInteger, NSString};

#[cfg(target_os = "windows")]
use clipboard_win::{formats as win_formats, get_clipboard, Format};

fn get_clipboard_change_count() -> Option<i64> {
    #[cfg(target_os = "macos")]
    unsafe {
        let pasteboard = NSPasteboard::generalPasteboard(nil);
        Some(pasteboard.changeCount() as i64)
    }
    #[cfg(target_os = "windows")]
    {
        clipboard_win::raw::seq_num().map(|n| n.get() as i64)
    }
    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    {
        None
    }
}

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
        let mut last_clipboard_text = String::new();
        let mut last_image_hash: Option<u64> = None;
        let mut last_change_count: Option<i64> = None;

        loop {
            thread::sleep(Duration::from_millis(500));

            // Check for clipboard updates (macOS optimization)
            let current_change_count = get_clipboard_change_count();
            if let Some(count) = current_change_count {
                if Some(count) == last_change_count {
                    continue;
                }
                last_change_count = Some(count);
            }

            let mut new_content: Option<(String, String)> = None;
            let mut image_found = false;
            #[allow(unused_mut)]
            let mut files_found = false;

            // 0. Windows: Try to get file list (CF_HDROP)
            #[cfg(target_os = "windows")]
            {
                if win_formats::FileList.is_format_avail() {
                    let mut files: Vec<String> = Vec::new();
                    // Attempt to read files using get_clipboard which handles opening/closing
                    if let Ok(f) = get_clipboard(win_formats::FileList) {
                        files = f;
                    }
                    
                    if !files.is_empty() {
                        files_found = true;
                        let joined = files.join("\n");
                        if joined != last_content {
                            new_content = Some((joined, "file".to_string()));
                            last_image_hash = None;
                            last_clipboard_text.clear();
                        }
                    }
                }
            }

            // 0. macOS: Try to get file list (NSFilenamesPboardType)
            #[cfg(target_os = "macos")]
            {
                unsafe {
                     let pasteboard = NSPasteboard::generalPasteboard(nil);
                     let ns_type = NSString::alloc(nil).init_str("NSFilenamesPboardType");
                     let files: id = pasteboard.propertyListForType(ns_type);
                     
                     if files != nil {
                         let count = NSArray::count(files);
                         if count > 0 {
                             let mut file_paths: Vec<String> = Vec::new();
                             for i in 0..count {
                                 let path_ns = NSArray::objectAtIndex(files, i);
                                 let path_str = NSString::UTF8String(path_ns);
                                 let path = std::ffi::CStr::from_ptr(path_str as *const i8).to_string_lossy().into_owned();
                                 file_paths.push(path);
                             }
                             
                             if !file_paths.is_empty() {
                                 files_found = true;
                                 let joined = file_paths.join("\n");
                                 // Check against last_content to avoid duplicates
                                 // Note: last_content stores the joined string
                                 if joined != last_content {
                                     new_content = Some((joined, "file".to_string()));
                                     last_image_hash = None;
                                     last_clipboard_text.clear();
                                 } else {
                                     // Same content, mark as found so we don't process as text/image
                                     files_found = true;
                                 }
                             }
                         }
                     }
                }
            }

            // 1. Try to get Image first
            if new_content.is_none() && !files_found {
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

                        if let Some(img_buffer) =
                            ImageBuffer::<Rgba<u8>, _>::from_raw(width, height, bytes)
                        {
                            let dynamic_image = DynamicImage::ImageRgba8(img_buffer);
                            let mut png_bytes: Vec<u8> = Vec::new();

                            if let Ok(_) = dynamic_image.write_to(
                                &mut Cursor::new(&mut png_bytes),
                                image::ImageOutputFormat::Png,
                            ) {
                                let base64_str = general_purpose::STANDARD.encode(&png_bytes);
                                let content_str = format!("data:image/png;base64,{}", base64_str);

                                // Check against last_content
                                if content_str != last_content {
                                    new_content = Some((content_str, "image".to_string()));
                                    last_image_hash = Some(current_hash);
                                    image_found = true;
                                    last_clipboard_text.clear();
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
            }

            // 2. If no image detected, check text
            if new_content.is_none() && !image_found && !files_found {
                if let Ok(text) = clipboard.get_text() {
                    if text != last_clipboard_text && !text.trim().is_empty() {
                        let type_ = detect_type(&text);
                        if type_ == "color" {
                            new_content = Some((text.clone(), type_));
                        } else {
                            new_content = Some((text.clone(), type_));
                        }
                        last_image_hash = None;
                        last_clipboard_text = text;
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
    if parse_color(content).is_some() {
        return "color".to_string();
    }
    if content.starts_with("/") || (content.len() > 2 && content.chars().nth(1) == Some(':')) {
        return "file".to_string();
    }
    "text".to_string()
}

#[derive(Clone, Copy)]
pub struct Rgb {
    pub r: u8,
    pub g: u8,
    pub b: u8,
}

fn clamp_f64(v: f64, min: f64, max: f64) -> f64 {
    if v < min {
        min
    } else if v > max {
        max
    } else {
        v
    }
}

fn parse_hex_nibble(c: char) -> Option<u8> {
    c.to_digit(16).map(|v| v as u8)
}

fn parse_hex_color(raw: &str) -> Option<Rgb> {
    let s = raw.trim();
    let s = s.strip_prefix('#').unwrap_or(s);
    if s.len() == 3 {
        let mut chars = s.chars();
        let r = parse_hex_nibble(chars.next()?)?;
        let g = parse_hex_nibble(chars.next()?)?;
        let b = parse_hex_nibble(chars.next()?)?;
        return Some(Rgb {
            r: r * 17,
            g: g * 17,
            b: b * 17,
        });
    }
    if s.len() == 6 {
        let bytes: Vec<char> = s.chars().collect();
        let r = parse_hex_nibble(bytes.get(0).copied()?)? * 16 + parse_hex_nibble(bytes.get(1).copied()?)?;
        let g = parse_hex_nibble(bytes.get(2).copied()?)? * 16 + parse_hex_nibble(bytes.get(3).copied()?)?;
        let b = parse_hex_nibble(bytes.get(4).copied()?)? * 16 + parse_hex_nibble(bytes.get(5).copied()?)?;
        return Some(Rgb { r, g, b });
    }
    None
}

fn parse_color_component(s: &str) -> Option<u8> {
    if let Some(pct_str) = s.strip_suffix('%') {
        let pct: f64 = pct_str.parse().ok()?;
        let v = (pct / 100.0 * 255.0).round();
        Some(clamp_f64(v, 0.0, 255.0) as u8)
    } else {
        let v: f64 = s.parse().ok()?;
        Some(clamp_f64(v, 0.0, 255.0) as u8)
    }
}

fn parse_rgb_color(raw: &str) -> Option<Rgb> {
    let s = raw.trim();
    let s = if let Some(stripped) = s.strip_prefix("rgba(") {
        stripped
    } else if let Some(stripped) = s.strip_prefix("rgb(") {
        stripped
    } else {
        return None;
    };
    let s = s.strip_suffix(')')?;

    let parts: Vec<&str> = s.split(|c| c == ',' || c == '/').map(|p| p.trim()).filter(|p| !p.is_empty()).collect();
    if parts.len() < 3 {
        // Space separated
        let parts_space: Vec<&str> = s.split_whitespace().collect();
        if parts_space.len() >= 3 {
            let r = parse_color_component(parts_space[0])?;
            let g = parse_color_component(parts_space[1])?;
            let b = parse_color_component(parts_space[2])?;
            return Some(Rgb { r, g, b });
        }
        return None;
    }
    
    let r = parse_color_component(parts[0])?;
    let g = parse_color_component(parts[1])?;
    let b = parse_color_component(parts[2])?;
    Some(Rgb { r, g, b })
}

fn hsl_to_rgb(h: f64, s: f64, l: f64) -> Rgb {
    let h = ((h % 360.0) + 360.0) % 360.0;
    let s = clamp_f64(s, 0.0, 1.0);
    let l = clamp_f64(l, 0.0, 1.0);

    if s == 0.0 {
        let v = (l * 255.0).round() as u8;
        return Rgb { r: v, g: v, b: v };
    }

    let c = (1.0 - (2.0 * l - 1.0).abs()) * s;
    let hp = h / 60.0;
    let x = c * (1.0 - ((hp % 2.0) - 1.0).abs());

    let (r1, g1, b1) = if (0.0..1.0).contains(&hp) {
        (c, x, 0.0)
    } else if (1.0..2.0).contains(&hp) {
        (x, c, 0.0)
    } else if (2.0..3.0).contains(&hp) {
        (0.0, c, x)
    } else if (3.0..4.0).contains(&hp) {
        (0.0, x, c)
    } else if (4.0..5.0).contains(&hp) {
        (x, 0.0, c)
    } else {
        (c, 0.0, x)
    };

    let m = l - c / 2.0;
    Rgb {
        r: ((r1 + m) * 255.0).round() as u8,
        g: ((g1 + m) * 255.0).round() as u8,
        b: ((b1 + m) * 255.0).round() as u8,
    }
}

fn parse_hsl_color(raw: &str) -> Option<Rgb> {
    let s = raw.trim();
    let s = if let Some(stripped) = s.strip_prefix("hsla(") {
        stripped
    } else if let Some(stripped) = s.strip_prefix("hsl(") {
        stripped
    } else {
        return None;
    };
    let s = s.strip_suffix(')')?;
    
    let parts: Vec<&str> = s.split(|c| c == ',' || c == '/').map(|p| p.trim()).filter(|p| !p.is_empty()).collect();
    if parts.len() < 3 {
        let parts_space: Vec<&str> = s.split_whitespace().collect();
        if parts_space.len() >= 3 {
            let h: f64 = parts_space[0].strip_suffix("deg").unwrap_or(parts_space[0]).parse().ok()?;
            let s_val: f64 = parts_space[1].strip_suffix('%').unwrap_or(parts_space[1]).parse().ok()?;
            let l_val: f64 = parts_space[2].strip_suffix('%').unwrap_or(parts_space[2]).parse().ok()?;
            
            let s_val = if parts_space[1].ends_with('%') || s_val > 1.0 { s_val / 100.0 } else { s_val };
            let l_val = if parts_space[2].ends_with('%') || l_val > 1.0 { l_val / 100.0 } else { l_val };
            
            return Some(hsl_to_rgb(h, s_val, l_val));
        }
        return None;
    }

    let h: f64 = parts[0].strip_suffix("deg").unwrap_or(parts[0]).parse().ok()?;
    let s_val: f64 = parts[1].strip_suffix('%').unwrap_or(parts[1]).parse().ok()?;
    let l_val: f64 = parts[2].strip_suffix('%').unwrap_or(parts[2]).parse().ok()?;
    
    let s_val = if parts[1].ends_with('%') || s_val > 1.0 { s_val / 100.0 } else { s_val };
    let l_val = if parts[2].ends_with('%') || l_val > 1.0 { l_val / 100.0 } else { l_val };

    Some(hsl_to_rgb(h, s_val, l_val))
}

pub fn parse_color(raw: &str) -> Option<Rgb> {
    let mut s = raw.trim();
    if s.ends_with(';') {
        s = &s[..s.len() - 1].trim();
    }
    if let Some(rgb) = parse_hex_color(s) {
        return Some(rgb);
    }
    if s.len() == 6 && s.chars().all(|c| c.is_ascii_hexdigit()) {
        return parse_hex_color(s);
    }
    let lower = s.to_ascii_lowercase();
    if lower.starts_with("rgb(") || lower.starts_with("rgba(") {
        return parse_rgb_color(&lower);
    }
    if lower.starts_with("hsl(") || lower.starts_with("hsla(") {
        return parse_hsl_color(&lower);
    }
    None
}

pub fn copy_to_clipboard(content: &str) -> Result<(), String> {
    let mut clipboard = Clipboard::new().map_err(|e| e.to_string())?;

    if content.starts_with("data:image/") {
        if let Some(comma_idx) = content.find(',') {
            let b64 = &content[(comma_idx + 1)..];
            let bytes = general_purpose::STANDARD
                .decode(b64)
                .map_err(|e| format!("Failed to decode base64 image: {}", e))?;

            let dyn_img =
                image::load_from_memory(&bytes).map_err(|e| format!("Decode image failed: {}", e))?;
            let rgba = dyn_img.to_rgba8();
            let (w, h) = rgba.dimensions();
            let raw = rgba.into_raw();

            let img_data = arboard::ImageData {
                width: w as usize,
                height: h as usize,
                bytes: std::borrow::Cow::Owned(raw),
            };
            clipboard
                .set_image(img_data)
                .map_err(|e| format!("Set image to clipboard failed: {}", e))?;
            return Ok(());
        }
    }

    clipboard
        .set_text(content.to_string())
        .map_err(|e| e.to_string())
}
