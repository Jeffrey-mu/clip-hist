mod db;
mod clipboard;

use tauri::{AppHandle, Manager, Emitter, State};
use tauri::menu::{Menu, MenuItem};
use tauri::tray::{TrayIconBuilder, TrayIconEvent};
use db::{Database, HistoryItem};
use tauri_plugin_global_shortcut::{ShortcutState, GlobalShortcutExt};
use std::sync::Mutex;
use std::fs::File;
use std::io::{Read, Write};
use tauri_plugin_autostart::MacosLauncher;
#[cfg(target_os = "macos")]
use cocoa::appkit::{NSWindow, NSWindowButton};
#[cfg(target_os = "macos")]
use cocoa::base::{id, YES};
#[cfg(target_os = "macos")]
use objc::{msg_send, sel, sel_impl};

struct GlobalShortcutState(Mutex<Option<String>>);

#[tauri::command]
fn get_history(app: AppHandle, limit: usize, offset: usize, search: Option<String>, filter_type: Option<String>) -> Result<Vec<HistoryItem>, String> {
    let db = Database::new(&app);
    match db.get_history(limit, offset, search, filter_type) {
        Ok(items) => Ok(items),
        Err(e) => {
            eprintln!("Error getting history: {}", e);
            Err(e.to_string())
        }
    }
}

#[cfg(target_os = "macos")]
// use tauri::Manager;

#[tauri::command]
fn copy_item(app: AppHandle, content: String) -> Result<(), String> {
    clipboard::copy_to_clipboard(&content)?;
    
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.hide();
    }
    
    #[cfg(target_os = "macos")]
    {
        // On macOS, hiding the window of an accessory app might not return focus to the previous app
        // automatically if the app is still "active".
        // We can use NSApplication::hide to properly hide the app and return focus.
        // Since we can't easily add objc crate right now without potential conflicts, 
        // we will try to use a trick: show and hide the dock icon or just rely on activation policy.
        
        // Actually, if we are an Accessory app, window.hide() SHOULD return focus.
        // But the user reports it doesn't.
        // Let's try to explicitly hide the application using tauri's `hide` method if available on AppHandle.
        // In Tauri v2, app.hide() seems to be available on AppHandle via the `tauri::Manager` or similar?
        // Let's try to use the `macos-private-api` feature but it failed config validation.
        
        // Alternative: Use `open` command to run AppleScript to hide the app? Too slow.
        // Best way: use `objc` crate. But let's try to minimize dependency changes.
        // Let's assume the user has issues because the window is not hidden "enough".
        
        // Re-reading docs: app.hide() IS available on macOS in Tauri v1. In v2 it might be different.
        // Let's try to use `app.hide()` again but without `macos-private-api` feature, maybe it IS public but just needs `Manager` trait?
        // Wait, I tried that and `cargo check` failed? No, `cargo check` failed because of `macos-private-api` feature mismatch in config.
        // I will try to call `app.hide()` again, assuming it is available.
        
        let _ = app.hide();
    }
    
    Ok(())
}

#[tauri::command]
fn clear_history(app: AppHandle) -> Result<(), String> {
    let db = Database::new(&app);
    db.delete_all().map_err(|e| e.to_string())?;
    // Emit event to update UI
    let _ = app.emit("clipboard-changed", ()); 
    Ok(())
}

#[tauri::command]
fn update_shortcut(app: AppHandle, state: State<'_, GlobalShortcutState>, shortcut: String) -> Result<(), String> {
    let mut current_shortcut = state.0.lock().map_err(|_| "Failed to lock state")?;
    
    // Unregister old shortcut if exists
    if let Some(old) = &*current_shortcut {
        // Best effort unregister
        let _ = app.global_shortcut().unregister(old.as_str());
    }
    
    // Register new shortcut
    app.global_shortcut().register(shortcut.as_str())
        .map_err(|e| format!("Failed to register shortcut: {}", e))?;
        
    *current_shortcut = Some(shortcut);
    
    Ok(())
}

#[tauri::command]
fn export_data(app: AppHandle, path: String) -> Result<(), String> {
    let db = Database::new(&app);
    let items = db.get_all_for_export().map_err(|e| e.to_string())?;
    let json = serde_json::to_string_pretty(&items).map_err(|e| e.to_string())?;
    
    let mut file = File::create(path).map_err(|e| e.to_string())?;
    file.write_all(json.as_bytes()).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn import_data(app: AppHandle, path: String) -> Result<(), String> {
    let mut file = File::open(path).map_err(|e| e.to_string())?;
    let mut json = String::new();
    file.read_to_string(&mut json).map_err(|e| e.to_string())?;
    
    let items: Vec<HistoryItem> = serde_json::from_str(&json).map_err(|e| e.to_string())?;
    let db = Database::new(&app);
    
    for item in items {
        db.import_item(&item).map_err(|e| e.to_string())?;
    }
    
    let _ = app.emit("clipboard-changed", ());
    Ok(())
}

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(tauri_plugin_autostart::init(MacosLauncher::LaunchAgent, Some(vec![])))
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .manage(GlobalShortcutState(Mutex::new(Some("CommandOrControl+Shift+V".into()))))
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_shortcut("CommandOrControl+Shift+V")
                .expect("Failed to register global shortcut")
                .with_handler(|app, _shortcut, event| {
                    if event.state() == ShortcutState::Pressed {
                        if let Some(window) = app.get_webview_window("main") {
                            if window.is_visible().unwrap_or(false) {
                                let _ = window.hide();
                            } else {
                                let _ = window.show();
                                let _ = window.set_focus();
                            }
                        }
                    }
                })
                .build(),
        )
        .setup(|app| {
            #[cfg(target_os = "macos")]
            {
                app.set_activation_policy(tauri::ActivationPolicy::Accessory);
                
                if let Some(window) = app.get_webview_window("main") {
                    // Hide traffic lights (standard window buttons)
                    use tauri::Url;
                    let ns_window = window.ns_window().unwrap() as id;
                    unsafe {
                        let close_button = ns_window.standardWindowButton_(NSWindowButton::NSWindowCloseButton);
                        let min_button = ns_window.standardWindowButton_(NSWindowButton::NSWindowMiniaturizeButton);
                        let zoom_button = ns_window.standardWindowButton_(NSWindowButton::NSWindowZoomButton);
                        
                        let _: () = msg_send![close_button, setHidden: YES];
                        let _: () = msg_send![min_button, setHidden: YES];
                        let _: () = msg_send![zoom_button, setHidden: YES];
                    }
                }
            }

            let handle = app.handle();
            
            // Initialize DB
            let db = Database::new(&handle);
            if let Err(e) = db.init() {
                eprintln!("Failed to init DB: {}", e);
            } else {
                println!("DB Initialized successfully");
            }

            // Start listener
            clipboard::start_listener(handle.clone());
            
            // Setup Tray
            let quit_i = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
            let show_i = MenuItem::with_id(app, "show", "Show History", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&show_i, &quit_i])?;
            
            if let Some(icon) = app.default_window_icon().cloned() {
                let _tray = TrayIconBuilder::with_id("tray")
                    .menu(&menu)
                    .icon(icon)
                    .show_menu_on_left_click(false)
                    .on_menu_event(|app, event| {
                        match event.id.as_ref() {
                            "quit" => {
                                app.exit(0);
                            }
                            "show" => {
                                if let Some(window) = app.get_webview_window("main") {
                                    let _ = window.show();
                                    let _ = window.set_focus();
                                }
                            }
                            _ => {}
                        }
                    })
                    .on_tray_icon_event(|tray, event| {
                        if let TrayIconEvent::Click { .. } = event {
                            let app = tray.app_handle();
                            if let Some(window) = app.get_webview_window("main") {
                                if window.is_visible().unwrap_or(false) {
                                    let _ = window.hide();
                                } else {
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
        .invoke_handler(tauri::generate_handler![get_history, copy_item, clear_history, update_shortcut, export_data, import_data])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
