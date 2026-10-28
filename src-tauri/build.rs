fn main() {
    let manifest_dir = std::env::var("CARGO_MANIFEST_DIR").unwrap();
    let lib_path = std::path::Path::new(&manifest_dir).join("lib");
    // Git doesn't track empty directories, and lib/ has nothing else
    // permanently in it now that the committed libmpv symlink is gone — on a
    // fresh checkout this directory plain doesn't exist yet.
    let mpv_dev_path = lib_path.join("mpv-dev");
    if let Err(e) = std::fs::create_dir_all(&mpv_dev_path) {
        println!(
            "cargo:warning=Failed to create {}: {}",
            mpv_dev_path.display(),
            e
        );
    }
    println!("cargo:rustc-link-search=native={}", lib_path.display());

    #[cfg(target_os = "macos")]
    {
        // tauri.bundle.macos.conf.json declares this as a `bundle.resources`
        // entry, and `tauri_build::build()` below validates that every
        // declared resource path already exists — at *this* point in the
        // build, before scripts/bundle-macos-mpv.mjs (which populates it via
        // Tauri's `beforeBundleCommand`, running later, after this compile
        // step) has had any chance to create it. An empty directory here is
        // enough to satisfy that check; the bundler reads whatever is
        // actually in it at the later bundling stage, by which point the
        // hook has filled it with libmpv and its dependencies for real.
        let macos_frameworks_path = std::path::Path::new(&manifest_dir).join("macos-frameworks");
        if let Err(e) = std::fs::create_dir_all(&macos_frameworks_path) {
            println!(
                "cargo:warning=Failed to create {}: {}",
                macos_frameworks_path.display(),
                e
            );
        }

        // libmpv-sys's own build script only emits `cargo:rustc-link-lib=mpv`
        // — no `-L` of its own — so the `cargo:rustc-link-search` above is
        // the *only* thing telling the linker where to find it, and that
        // directory needs an actual `libmpv.dylib` in it. Homebrew installs
        // to a different prefix on Apple Silicon vs Intel, so the symlink is
        // created here, at build time, picking whichever prefix is actually
        // present — a symlink committed to the repo would only resolve on
        // whichever one Mac happened to create it.
        let brew_mpv = std::path::Path::new("/opt/homebrew/lib/libmpv.dylib");
        let intel_mpv = std::path::Path::new("/usr/local/lib/libmpv.dylib");
        let system_mpv = if brew_mpv.exists() {
            Some(brew_mpv)
        } else if intel_mpv.exists() {
            Some(intel_mpv)
        } else {
            None
        };

        match system_mpv {
            Some(target) => {
                let link_time_symlink = lib_path.join("libmpv.dylib");
                if !link_time_symlink.exists() {
                    if let Err(e) = std::os::unix::fs::symlink(target, &link_time_symlink) {
                        println!(
                            "cargo:warning=Failed to symlink libmpv.dylib for linking: {}",
                            e
                        );
                    }
                }
            }
            None => {
                println!(
                    "cargo:warning=libmpv.dylib not found in /opt/homebrew/lib or /usr/local/lib — run `brew install mpv`."
                );
            }
        }

        // The built binary also needs libmpv.dylib to load at launch,
        // findable next to itself in target/<profile>/ — a separate
        // location and a separate need from the link-time symlink above.
        if let Ok(out_dir) = std::env::var("OUT_DIR") {
            let out_path = std::path::Path::new(&out_dir);
            let mut current = out_path;
            let mut target_dir = None;
            while let Some(parent) = current.parent() {
                if parent.file_name().and_then(|s| s.to_str()) == Some("build") {
                    target_dir = current.parent().map(|p| p.to_path_buf());
                    break;
                }
                current = parent;
            }

            if let (Some(target_dir), Some(target)) = (target_dir, system_mpv) {
                let dest_link = target_dir.join("libmpv.dylib");
                if !dest_link.exists() {
                    let _ = std::os::unix::fs::symlink(target, &dest_link);
                }
            }
        }
    }

    #[cfg(target_os = "windows")]
    {
        if let Ok(out_dir) = std::env::var("OUT_DIR") {
            let out_path = std::path::Path::new(&out_dir);
            let local_dll = lib_path.join("mpv-dev").join("libmpv-2.dll");
            let local_ytdlp = lib_path.join("yt-dlp").join("yt-dlp.exe");

            let mut dll_source: Option<std::path::PathBuf> = if local_dll.exists() {
                Some(local_dll)
            } else {
                None
            };

            if dll_source.is_none() {
                let candidate_paths = [
                    "C:\\Program Files\\mpv\\libmpv-2.dll",
                    "C:\\Program Files\\mpv\\mpv-2.dll",
                    "C:\\Program Files (x86)\\mpv\\libmpv-2.dll",
                ];
                for path_str in candidate_paths {
                    let p = std::path::Path::new(path_str);
                    if p.exists() {
                        dll_source = Some(p.to_path_buf());
                        break;
                    }
                }
            }

            if dll_source.is_none() {
                if let Ok(path_var) = std::env::var("PATH") {
                    for dir in std::env::split_paths(&path_var) {
                        let candidate1 = dir.join("libmpv-2.dll");
                        let candidate2 = dir.join("mpv-2.dll");
                        if candidate1.exists() {
                            dll_source = Some(candidate1);
                            break;
                        } else if candidate2.exists() {
                            dll_source = Some(candidate2);
                            break;
                        }
                    }
                }
            }

            if let Some(src) = dll_source {
                let out_dest = out_path.join("libmpv-2.dll");
                if !out_dest.exists() {
                    if let Err(e) = std::fs::copy(&src, &out_dest) {
                        println!(
                            "cargo:warning=Failed to copy libmpv-2.dll to OUT_DIR: {}",
                            e
                        );
                    }
                }

                let mut current = out_path;
                let mut target_dir = None;
                while let Some(parent) = current.parent() {
                    if parent.file_name().and_then(|s| s.to_str()) == Some("build") {
                        target_dir = current.parent().map(|p| p.to_path_buf());
                        break;
                    }
                    current = parent;
                }

                if let Some(target_dir) = target_dir {
                    let dest = target_dir.join("libmpv-2.dll");
                    if !dest.exists() {
                        if let Err(e) = std::fs::copy(&src, &dest) {
                            println!(
                                "cargo:warning=Failed to copy libmpv-2.dll to target_dir: {}",
                                e
                            );
                        }
                    }
                    if local_ytdlp.exists() {
                        let ytdlp_dest = target_dir.join("yt-dlp.exe");
                        if !ytdlp_dest.exists() {
                            if let Err(e) = std::fs::copy(&local_ytdlp, &ytdlp_dest) {
                                println!(
                                    "cargo:warning=Failed to copy yt-dlp.exe to target_dir: {}",
                                    e
                                );
                            }
                        }
                    }
                }
            }
        }
    }

    tauri_build::build()
}
