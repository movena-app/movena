fn files_equal(left: &std::path::Path, right: &std::path::Path) -> std::io::Result<bool> {
    use std::io::Read;

    if !right.is_file() || std::fs::metadata(left)?.len() != std::fs::metadata(right)?.len() {
        return Ok(false);
    }
    let mut left = std::io::BufReader::new(std::fs::File::open(left)?);
    let mut right = std::io::BufReader::new(std::fs::File::open(right)?);
    let mut left_buffer = [0_u8; 64 * 1024];
    let mut right_buffer = [0_u8; 64 * 1024];
    loop {
        let left_read = left.read(&mut left_buffer)?;
        let right_read = right.read(&mut right_buffer)?;
        if left_read != right_read || left_buffer[..left_read] != right_buffer[..right_read] {
            return Ok(false);
        }
        if left_read == 0 {
            return Ok(true);
        }
    }
}

fn copy_directory(source: &std::path::Path, destination: &std::path::Path) -> std::io::Result<()> {
    std::fs::create_dir_all(destination)?;
    for entry in std::fs::read_dir(source)? {
        let entry = entry?;
        let target = destination.join(entry.file_name());
        if entry.file_type()?.is_dir() {
            copy_directory(&entry.path(), &target)?;
        } else if !files_equal(&entry.path(), &target)? {
            std::fs::copy(entry.path(), target)?;
        }
    }
    Ok(())
}

fn target_profile_directory(out_path: &std::path::Path) -> Option<std::path::PathBuf> {
    let mut current = out_path;
    while let Some(parent) = current.parent() {
        if parent.file_name().and_then(|value| value.to_str()) == Some("build") {
            return parent.parent().map(std::path::Path::to_path_buf);
        }
        current = parent;
    }
    None
}

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
    println!("cargo:rerun-if-changed=lib/twitch-resolver");

    if let Ok(out_dir) = std::env::var("OUT_DIR") {
        let source = lib_path.join("twitch-resolver");
        if source.is_dir() {
            if let Some(target_dir) = target_profile_directory(std::path::Path::new(&out_dir)) {
                let destination = target_dir.join("twitch-resolver");
                if let Err(error) = copy_directory(&source, &destination) {
                    println!(
                        "cargo:warning=Failed to copy Twitch resolver to {}: {}",
                        destination.display(),
                        error
                    );
                }
            }
        }
    }

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
