mod clipboard;
mod db;

#[cfg(target_os = "macos")]
use cocoa::appkit::{NSWindow, NSWindowButton};
#[cfg(target_os = "macos")]
use cocoa::base::{id, YES};
#[cfg(target_os = "macos")]
use cocoa::foundation::NSPoint;
use db::{Database, HistoryItem};
#[cfg(target_os = "macos")]
use objc::{class, msg_send, sel, sel_impl};
use std::collections::HashMap;
use std::fs::File;
use std::io::{Read, Write};
use std::sync::Mutex;
use std::time::{Duration, Instant};
use tauri::menu::{Menu, MenuItem};
use tauri::tray::{TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Emitter, Manager, PhysicalPosition, State, WebviewWindow};
use tauri_plugin_autostart::MacosLauncher;
use tauri_plugin_global_shortcut::{GlobalShortcutExt, ShortcutState};

struct GlobalShortcutState(Mutex<Option<String>>);
struct WindowPositionState(Mutex<HashMap<String, PhysicalPosition<i32>>>);
struct HideSuppressState(Mutex<Option<Instant>>);

fn move_window_to_mouse_monitor(_window: &WebviewWindow) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        // 1. Get mouse location from Tauri directly instead of Cocoa
        // This avoids coordinate system confusion.
        // use tauri::cursor::CursorIcon;
        // Actually Tauri doesn't expose global cursor position easily in v2 without window?
        // Wait, we can use `cocoa` but we need to be careful about coordinates.
        // The issue is likely how we calculate `mouse_y`.
        // Cocoa (0,0) is bottom-left of PRIMARY screen.
        // Tauri (0,0) is top-left of PRIMARY screen.
        // But secondary screens can be anywhere.

        // Let's debug by printing coordinates if we could, but we can't easily.
        // The previous logic assumed `primary_height - mouse_loc.y` converts correctly.
        // This is only true if the primary monitor is at (0,0) in both systems (which it is)
        // AND if the Y-axis simply flips.

        // However, for secondary monitors, `mouse_loc.y` can be negative or larger than primary height
        // depending on arrangement.
        // Correct conversion from Cocoa Global to Tauri Global:
        // Tauri_Y = Primary_Monitor_Height - Cocoa_Y
        // This formula IS correct for the global space assuming standard macOS arrangement.

        // BUT, there is a catch: `primary_monitor.size().height` returns PHYSICAL pixels.
        // `mouse_loc.y` is in LOGICAL points.
        // We were dividing physical height by scale factor, which gives logical height.
        // That seems correct.

        // Let's re-verify the "monitor detection" logic.
        // `monitor.position()` returns PHYSICAL coordinates in Tauri.
        // We convert them to logical: `m_pos.x as f64 / m_scale`.

        // The issue might be that `mouse_loc` from `NSEvent mouseLocation` is in global screen coordinates.
        // And `monitor.position()` from Tauri is also in global screen coordinates (top-left origin).

        // Let's try a different approach:
        // Instead of manual calculation, let's use the fact that we just need to find which monitor bounds the point.

        // Let's double check `monitor.position()` coordinate system.
        // Tauri docs: "Returns the position of the top-left hand corner of the monitor relative to the top-left corner of the primary monitor."

        // So:
        // Tauri Global X = Cocoa Global X
        // Tauri Global Y = Primary Screen Height (Logical) - Cocoa Global Y

        // Example: Primary 1080p. Mouse at top-left. Cocoa: (0, 1080). Tauri: (0, 0).
        // 1080 - 1080 = 0. Correct.
        // Mouse at bottom-left. Cocoa: (0, 0). Tauri: (0, 1080).
        // 1080 - 0 = 1080. Correct.

        // Example: Secondary 1080p to the RIGHT of Primary. Top-aligned.
        // Mouse at top-left of Secondary.
        // Cocoa: (1920, 1080). Tauri: (1920, 0).
        // 1080 - 1080 = 0. Correct.

        // Example: Secondary 1080p ABOVE Primary.
        // Mouse at bottom-left of Secondary (which touches top-left of Primary).
        // Cocoa: (0, 1080). Tauri: (0, 0).
        // Mouse at top-left of Secondary.
        // Cocoa: (0, 2160). Tauri: (0, -1080).
        // 1080 - 2160 = -1080. Correct.

        // So the formula seems correct.
        // Why did it fail? "Mouse on screen 1, appears on screen 2".
        // Maybe `monitors` order or `scale_factor` is messing up.
        // `monitor.scale_factor()` might be different for each monitor.

        // Let's try to be more robust.
        // Instead of using `primary_monitor` to flip, let's just search all monitors using Cocoa coordinates directly if possible?
        // No, Tauri `monitor` structs give us Top-Left coordinates.

        // Maybe the issue is mixed DPI?
        // If Primary is Retina (2.0) and Secondary is Standard (1.0).
        // `primary_height` (Logical) = Physical / 2.0.

        // Let's check `mouse_loc` again. `NSEvent mouseLocation` returns points (Logical).

        // CRITICAL FIX:
        // `monitor.position()` returns PhysicalPosition.
        // `monitor.size()` returns PhysicalSize.
        // We must convert EVERYTHING to Logical relative to THAT SPECIFIC MONITOR's scale factor?
        // NO. The global coordinate space is continuous in Logical pixels (usually).
        // Wait, in Tauri/Winit, `PhysicalPosition` is in physical pixels.
        // But the "Global" space is tricky with mixed DPI.

        // Winit docs say: "The position is in physical pixels."
        // This means (1920, 0) on a 1x monitor starts at 1920 px.
        // But if the first monitor was 2x (size 3840 physical, 1920 logical), does the second start at 3840 or 1920?
        // On macOS, the OS handles layout in Logical points.
        // Tauri's `monitor.position()` returning Physical pixels is a conversion from OS Logical points * Scale Factor.

        // If we have mixed DPI, simple division might be wrong for the "Start" position.
        // Actually, on macOS, `monitor.position()` (Physical) might be misleading if we just divide by its own scale factor.

        // Let's use `cocoa` to iterate screens directly! This avoids Tauri's coordinate conversion confusion.
        // We can find which `NSScreen` contains the `mouseLocation`.

        let mouse_loc: NSPoint = unsafe {
            let ns_event = class!(NSEvent);
            msg_send![ns_event, mouseLocation]
        };

        let screens: id = unsafe {
            let ns_screen = class!(NSScreen);
            msg_send![ns_screen, screens]
        };

        let count: usize = unsafe { msg_send![screens, count] };

        for i in 0..count {
            let screen: id = unsafe { msg_send![screens, objectAtIndex: i] };
            let frame: cocoa::foundation::NSRect = unsafe { msg_send![screen, frame] };

            // Check if mouse is inside this screen's frame
            // NSRect origin is bottom-left.
            if mouse_loc.x >= frame.origin.x
                && mouse_loc.x < frame.origin.x + frame.size.width
                && mouse_loc.y >= frame.origin.y
                && mouse_loc.y < frame.origin.y + frame.size.height
            {
                // Found the screen (monitor) where the mouse is!
                // Now we need to map this `NSScreen` to a Tauri `Monitor`.
                // We can try to match by position or name.
                // Or just calculate the center of this `NSScreen` and convert it to Tauri coordinates.

                // Calculate center in Cocoa Global coordinates
                let center_x_cocoa = frame.origin.x + frame.size.width / 2.0;
                let center_y_cocoa = frame.origin.y + frame.size.height / 2.0;

                // Convert to Tauri Global coordinates
                // Tauri Y = Primary_Height_Logical - Cocoa Y
                // We need Primary Screen Height in Logical points.
                let primary_screen: id = unsafe {
                    let ns_screen = class!(NSScreen);
                    let screens: id = msg_send![ns_screen, screens];
                    msg_send![screens, objectAtIndex: 0] // Index 0 is always primary in Cocoa
                };
                let p_frame: cocoa::foundation::NSRect =
                    unsafe { msg_send![primary_screen, frame] };
                let p_height = p_frame.size.height; // Logical height

                let tauri_center_x = center_x_cocoa;
                let tauri_center_y = p_height - center_y_cocoa;

                // Identify monitor name for memory
                // We'll use the index 'i' as ID or try to find name.
                // Using index is risky if setup changes, but fast.
                // Let's try to match with Tauri monitors to get the name for consistency.
                let monitors = window.available_monitors().map_err(|e| e.to_string())?;

                // Find Tauri monitor that matches this screen
                // We can match by checking which Tauri monitor contains this center point.
                let mut target_monitor_name = String::new();
                let mut target_scale_factor = 1.0;

                for tm in &monitors {
                    let scale = tm.scale_factor();
                    let pos = tm.position();
                    let size = tm.size();

                    let tm_x = pos.x as f64 / scale;
                    let tm_y = pos.y as f64 / scale;
                    let tm_w = size.width as f64 / scale;
                    let tm_h = size.height as f64 / scale;

                    if tauri_center_x >= tm_x
                        && tauri_center_x < tm_x + tm_w
                        && tauri_center_y >= tm_y
                        && tauri_center_y < tm_y + tm_h
                    {
                        target_monitor_name = tm.name().map(|n| n.to_string()).unwrap_or_default();
                        target_scale_factor = scale;
                        break;
                    }
                }

                if target_monitor_name.is_empty() {
                    // Fallback if not found (rare)
                    target_monitor_name = format!("screen_{}", i);
                }

                // --- LOGIC FOR MEMORY AND POSITIONING ---

                // Check if we are already on this monitor
                if let Some(current_monitor) =
                    window.current_monitor().map_err(|e| e.to_string())?
                {
                    let c_pos = current_monitor.position();
                    let c_scale = current_monitor.scale_factor();
                    let c_size = current_monitor.size();

                    let c_x = c_pos.x as f64 / c_scale;
                    let c_y = c_pos.y as f64 / c_scale;
                    let c_w = c_size.width as f64 / c_scale;
                    let c_h = c_size.height as f64 / c_scale;

                    // Check if center of target screen is inside current monitor rect
                    // (Rough check if it's the same monitor)
                    if tauri_center_x >= c_x
                        && tauri_center_x < c_x + c_w
                        && tauri_center_y >= c_y
                        && tauri_center_y < c_y + c_h
                    {
                        return Ok(());
                    }

                    // Saving old position logic
                    let current_win_pos = window.outer_position().map_err(|e| e.to_string())?;
                    let current_monitor_name = current_monitor
                        .name()
                        .map(|n| n.to_string())
                        .unwrap_or_default();

                    let state = window.state::<WindowPositionState>();
                    if let Ok(mut positions) = state.0.lock() {
                        positions.insert(current_monitor_name, current_win_pos);
                    };
                }

                // Restore or Center
                let state = window.state::<WindowPositionState>();
                let saved_pos = {
                    let positions = state.0.lock().map_err(|_| "Failed to lock state")?;
                    positions.get(&target_monitor_name).cloned()
                };

                if let Some(pos) = saved_pos {
                    window
                        .set_position(tauri::Position::Physical(pos))
                        .map_err(|e| e.to_string())?;
                } else {
                    // Center on the found screen
                    // We have tauri_center_x, tauri_center_y (Logical center of screen)
                    // Window size (Physical)
                    let window_size = window.outer_size().map_err(|e| e.to_string())?;
                    let w_w = window_size.width as f64 / target_scale_factor;
                    let w_h = window_size.height as f64 / target_scale_factor;

                    let final_x = tauri_center_x - w_w / 2.0;
                    let final_y = tauri_center_y - w_h / 2.0;

                    window
                        .set_position(tauri::Position::Logical(tauri::LogicalPosition {
                            x: final_x,
                            y: final_y,
                        }))
                        .map_err(|e| e.to_string())?;
                }

                return Ok(());
            }
        }
    }

    // Fallback
    Ok(())
}

#[tauri::command]
fn get_history(
    db: State<'_, Database>,
    limit: usize,
    offset: usize,
    search: Option<String>,
    filter_type: Option<String>,
) -> Result<Vec<HistoryItem>, String> {
    match db.get_history(limit, offset, search, filter_type) {
        Ok(items) => Ok(items),
        Err(e) => {
            eprintln!("Error getting history: {}", e);
            Err(e.to_string())
        }
    }
}

#[tauri::command]
fn copy_item(app: AppHandle, content: String) -> Result<(), String> {
    clipboard::copy_to_clipboard(&content)?;

    if let Some(window) = app.get_webview_window("main") {
        let _ = window.hide();
    }

    #[cfg(target_os = "macos")]
    {
        let _ = app.hide();
    }

    Ok(())
}

#[tauri::command]
fn clear_history(app: AppHandle, db: State<'_, Database>) -> Result<(), String> {
    db.delete_all().map_err(|e| e.to_string())?;
    // Emit event to update UI
    let _ = app.emit("clipboard-changed", ());
    Ok(())
}

#[tauri::command]
fn delete_item(state: State<'_, Database>, id: i64) -> Result<(), String> {
    state.delete_item(id).map_err(|e| e.to_string())
}

#[tauri::command]
fn update_item(state: State<'_, Database>, id: i64, content: String) -> Result<(), String> {
    state.update_item(id, &content).map_err(|e| e.to_string())
}

#[tauri::command]
fn suppress_hide(state: State<'_, HideSuppressState>, ms: u64) -> Result<(), String> {
    let until = if ms == 0 {
        None
    } else {
        Some(Instant::now() + Duration::from_millis(ms))
    };
    if let Ok(mut guard) = state.0.lock() {
        *guard = until;
    }
    Ok(())
}

#[tauri::command]
fn update_shortcut(
    app: AppHandle,
    state: State<'_, GlobalShortcutState>,
    shortcut: String,
) -> Result<(), String> {
    let mut current_shortcut = state.0.lock().map_err(|_| "Failed to lock state")?;

    // Unregister old shortcut if exists
    if let Some(old) = &*current_shortcut {
        // Best effort unregister
        let _ = app.global_shortcut().unregister(old.as_str());
    }

    // Register new shortcut
    app.global_shortcut()
        .register(shortcut.as_str())
        .map_err(|e| format!("Failed to register shortcut: {}", e))?;

    *current_shortcut = Some(shortcut);

    Ok(())
}

#[tauri::command]
fn export_data(db: State<'_, Database>, path: String) -> Result<(), String> {
    let items = db.get_all_for_export().map_err(|e| e.to_string())?;
    let json = serde_json::to_string_pretty(&items).map_err(|e| e.to_string())?;

    let mut file = File::create(path).map_err(|e| e.to_string())?;
    file.write_all(json.as_bytes()).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn import_data(app: AppHandle, db: State<'_, Database>, path: String) -> Result<(), String> {
    let mut file = File::open(path).map_err(|e| e.to_string())?;
    let mut json = String::new();
    file.read_to_string(&mut json).map_err(|e| e.to_string())?;

    let items: Vec<HistoryItem> = serde_json::from_str(&json).map_err(|e| e.to_string())?;

    for item in items {
        db.import_item(&item).map_err(|e| e.to_string())?;
    }

    let _ = app.emit("clipboard-changed", ());
    Ok(())
}

#[tauri::command]
fn hide_window(app: AppHandle) -> Result<(), String> {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.hide();
    }
    
    #[cfg(target_os = "macos")]
    {
        let _ = app.hide();
    }
    Ok(())
}

#[tauri::command]
fn delete_before(
    app: AppHandle,
    db: State<'_, Database>,
    cutoff_date: String,
) -> Result<(), String> {
    db.delete_before(&cutoff_date).map_err(|e| e.to_string())?;
    let _ = app.emit("clipboard-changed", ());
    Ok(())
}

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(tauri_plugin_os::init())
        .plugin(tauri_plugin_autostart::init(
            MacosLauncher::LaunchAgent,
            Some(vec!["--hidden"]),
        ))
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .manage(GlobalShortcutState(Mutex::new(Some(
            "CommandOrControl+D".into(),
        ))))
        .manage(WindowPositionState(Mutex::new(HashMap::new())))
        .manage(HideSuppressState(Mutex::new(None)))
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_shortcut("CommandOrControl+D")
                .expect("Failed to register global shortcut")
                .with_handler(|app, _shortcut, event| {
                    if event.state() == ShortcutState::Pressed {
                        if let Some(window) = app.get_webview_window("main") {
                            if window.is_visible().unwrap_or(false) {
                                let _ = window.hide();
                            } else {
                                let _ = move_window_to_mouse_monitor(&window);
                                let _ = window.show();
                                let _ = window.set_focus();
                            }
                        }
                    }
                })
                .build(),
        )
        .setup(|app| {
            // Initialize Database
            let db_path = Database::default_path();
            let db = Database::new(db_path).expect("Failed to initialize database");
            if let Err(e) = db.init() {
                eprintln!("Failed to init db: {}", e);
            }
            app.manage(db);

            clipboard::start_listener(app.handle().clone());

            #[cfg(target_os = "windows")]
            {
                if let Some(window) = app.get_webview_window("main") {
                    // Hide native Windows title bar和窗口按钮，改为无框窗口
                    let _ = window.set_decorations(false);
                }
            }

            #[cfg(target_os = "macos")]
            {
                app.set_activation_policy(tauri::ActivationPolicy::Accessory);

                if let Some(window) = app.get_webview_window("main") {
                    // Hide traffic lights (standard window buttons)
                    use tauri::Url;
                    let ns_window = window.ns_window().unwrap() as id;
                    unsafe {
                        // Hide standard buttons
                        let close_button =
                            ns_window.standardWindowButton_(NSWindowButton::NSWindowCloseButton);
                        let min_button = ns_window
                            .standardWindowButton_(NSWindowButton::NSWindowMiniaturizeButton);
                        let zoom_button =
                            ns_window.standardWindowButton_(NSWindowButton::NSWindowZoomButton);

                        let _: () = msg_send![close_button, setHidden: YES];
                        let _: () = msg_send![min_button, setHidden: YES];
                        let _: () = msg_send![zoom_button, setHidden: YES];

                        // Disable window animation (NSWindowAnimationBehaviorNone = 2)
                        let _: () = msg_send![ns_window, setAnimationBehavior: 2];
                    }
                }
            }

            let _handle = app.handle();

            // Setup Tray
            let quit_i = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
            let show_i = MenuItem::with_id(app, "show", "Show History", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&show_i, &quit_i])?;

            if let Some(icon) = app.default_window_icon().cloned() {
                let _tray = TrayIconBuilder::with_id("tray")
                    .menu(&menu)
                    .icon(icon)
                    .show_menu_on_left_click(false)
                    .on_menu_event(|app, event| match event.id.as_ref() {
                        "quit" => {
                            app.exit(0);
                        }
                        "show" => {
                            if let Some(window) = app.get_webview_window("main") {
                                let _ = move_window_to_mouse_monitor(&window);
                                let _ = window.show();
                                let _ = window.set_focus();
                            }
                        }
                        _ => {}
                    })
                    .on_tray_icon_event(|tray, event| {
                        if let TrayIconEvent::Click { .. } = event {
                            let app = tray.app_handle();
                            if let Some(window) = app.get_webview_window("main") {
                                if window.is_visible().unwrap_or(false) {
                                    let _ = window.hide();
                                } else {
                                    let _ = move_window_to_mouse_monitor(&window);
                                    let _ = window.show();
                                    let _ = window.set_focus();
                                }
                            }
                        }
                    })
                    .build(app)?;
            } else {
                eprintln!("Warning: No default window icon found, tray icon not created.");
            }

            Ok(())
        })
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::Focused(is_focused) = event {
                if !*is_focused {
                    // Debounce hiding to avoid immediate hide on click/drag edge cases
                    let app = window.app_handle().clone();
                    let label = window.label().to_string();
                    std::thread::spawn(move || {
                        std::thread::sleep(Duration::from_millis(150));
                        if let Some(w) = app.get_webview_window(label.as_str()) {
                            let still_unfocused = !w.is_focused().unwrap_or(true);
                            if !still_unfocused {
                                return;
                            }

                            // Check if mouse is within window bounds
                            // This prevents hiding when clicking inside the window (e.g. drag region)
                            // even if focus is temporarily lost or not reported correctly.
                            if let Ok(pos) = w.cursor_position() {
                                if let Ok(size) = w.inner_size() {
                                    if pos.x >= 0.0
                                        && pos.x < size.width as f64
                                        && pos.y >= 0.0
                                        && pos.y < size.height as f64
                                    {
                                        return;
                                    }
                                }
                            }

                            let suppress = w.state::<HideSuppressState>();
                            let now = Instant::now();
                            let mut should_hide = true;
                            if let Ok(guard) = suppress.0.lock() {
                                if let Some(until) = *guard {
                                    if until > now {
                                        should_hide = false;
                                    }
                                }
                            }
                            if should_hide {
                                let _ = w.hide();
                            }
                        }
                    });
                }
            }
        })
        .invoke_handler(tauri::generate_handler![
            get_history,
            copy_item,
            clear_history,
            update_shortcut,
            export_data,
            import_data,
            delete_before,
            suppress_hide,
            delete_item,
            update_item,
            hide_window
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
