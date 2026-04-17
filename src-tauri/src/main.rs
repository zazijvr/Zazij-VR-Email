// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    // Oprava pádu WebKitGTK jádra na moderním Waylandu (KDE Plasma / Gnome)
    #[cfg(target_os = "linux")]
    std::env::set_var("WEBKIT_DISABLE_DMABUF_RENDERER", "1");

    // Klíčový fix pro spolehlivý resize bez dekorací:
    // Vynutit X11 backend (přes XWayland) – tím okno dostane nativní X11
    // resize hrany a rohy jako každá další linuxová aplikace.
    // startResizeDragging() pak funguje přesně a spolehlivě na 100%.
    #[cfg(target_os = "linux")]
    std::env::set_var("GDK_BACKEND", "x11");

    app_lib::run();
}
