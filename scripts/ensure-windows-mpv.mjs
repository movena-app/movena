import { existsSync, mkdirSync, copyFileSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';
import { createHash } from 'node:crypto';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const libDir = join(root, 'src-tauri', 'lib');
const mpvDevDir = join(libDir, 'mpv-dev');
const targetDllInMpvDev = join(mpvDevDir, 'libmpv-2.dll');
const targetDllInLib = join(libDir, 'libmpv-2.dll');
const ytdlpDir = join(libDir, 'yt-dlp');
const targetYtdlp = join(ytdlpDir, 'yt-dlp.exe');

// Keep native development reproducible. Update these values deliberately when
// upgrading mpv; do not silently move every developer to a new engine build.
const MPV_RELEASE_TAG = '20260811';
const MPV_ASSET_NAME = 'mpv-dev-x86_64-20260811-git-f4d13e1c2c.7z';
const MPV_ARCHIVE_SHA256 = 'd849de71d4e57ac7f92cedbda50564af4431d84bd1898e9ee6f9a9fc21d42427';
const YTDLP_RELEASE_TAG = '2026.08.19';
const YTDLP_ASSET_NAME = 'yt-dlp.exe';
const YTDLP_ASSET_SHA256 = '66674953fe251b89f4d08c5f0e35e0728679bd67ab3d7d05c0562af101dd3e7a';

function sha256(buffer) {
  return createHash('sha256').update(buffer).digest('hex');
}

async function ensureWindowsMpv() {
  if (process.platform !== 'win32') {
    console.log(
      '[ensure-windows-mpv] Non-Windows OS detected; skipping Windows mpv DLL auto-fetch.',
    );
    return;
  }

  mkdirSync(mpvDevDir, { recursive: true });
  mkdirSync(ytdlpDir, { recursive: true });

  if (!existsSync(targetDllInMpvDev) || !existsSync(targetDllInLib)) {
    console.log(
      `[ensure-windows-mpv] Windows libmpv-2.dll missing. Fetching pinned mpv-dev build ${MPV_RELEASE_TAG}...`,
    );

    try {
      const archivePath = join(root, 'src-tauri', 'mpv-dev.7z');
      const extractDir = join(root, 'src-tauri', 'tmp_mpv');
      const assetUrl = `https://github.com/shinchiro/mpv-winbuild-cmake/releases/download/${MPV_RELEASE_TAG}/${MPV_ASSET_NAME}`;

      console.log(`[ensure-windows-mpv] Downloading asset ${MPV_ASSET_NAME}...`);
      const downloadRes = await fetch(assetUrl);
      if (!downloadRes.ok) {
        throw new Error(`Failed to download ${assetUrl}: HTTP ${downloadRes.status}`);
      }

      const archiveBuffer = Buffer.from(await downloadRes.arrayBuffer());
      const archiveSha256 = sha256(archiveBuffer);
      if (archiveSha256 !== MPV_ARCHIVE_SHA256) {
        throw new Error(
          `mpv archive checksum mismatch: expected ${MPV_ARCHIVE_SHA256}, received ${archiveSha256}`,
        );
      }

      writeFileSync(archivePath, archiveBuffer);

      if (existsSync(extractDir)) {
        rmSync(extractDir, { recursive: true, force: true });
      }
      mkdirSync(extractDir, { recursive: true });

      console.log('[ensure-windows-mpv] Extracting archive...');
      execSync(`tar -xf "${archivePath}" -C "${extractDir}"`, { stdio: 'inherit' });

      const extractedDll = join(extractDir, 'libmpv-2.dll');
      const extractedLib = join(extractDir, 'libmpv.dll.a');

      if (!existsSync(extractedDll)) {
        throw new Error('libmpv-2.dll was not found inside the downloaded archive.');
      }

      console.log(
        '[ensure-windows-mpv] Copying libmpv-2.dll and import libraries to src-tauri/lib...',
      );
      copyFileSync(extractedDll, targetDllInMpvDev);
      copyFileSync(extractedDll, targetDllInLib);

      if (existsSync(extractedLib)) {
        copyFileSync(extractedLib, join(libDir, 'libmpv.dll.a'));
        copyFileSync(extractedLib, join(libDir, 'mpv.dll.a'));
        copyFileSync(extractedLib, join(libDir, 'mpv.lib'));
        copyFileSync(extractedLib, join(libDir, 'libmpv.lib'));
        copyFileSync(extractedLib, join(libDir, 'libmpv-2.lib'));
      }

      rmSync(archivePath, { force: true });
      rmSync(extractDir, { recursive: true, force: true });

      console.log('[ensure-windows-mpv] Successfully configured Windows libmpv engine binaries!');
    } catch (error) {
      console.error(
        '[ensure-windows-mpv] Error auto-provisioning Windows libmpv:',
        error.message || error,
      );
      console.error(
        '[ensure-windows-mpv] Run npm run setup:mpv after fixing the download or provide the pinned files manually.',
      );
      process.exitCode = 1;
      return;
    }
  } else {
    console.log('[ensure-windows-mpv] Windows libmpv engine dependencies are present.');
  }

  // Ensure libmpv-2.dll is available to cargo test runners. `--no-bundle`
  // builds (e.g. the desktop-e2e debug binary) skip Tauri's bundler
  // resource-copy step entirely, so this is the only thing that ever puts
  // the DLL next to the exe for those — the target dirs won't exist yet on
  // a fresh checkout (cargo hasn't run), so they must be created rather
  // than skipped, or the exe silently fails to start (STATUS_DLL_NOT_FOUND).
  const cargoTargetDirs = [
    join(root, 'src-tauri', 'target', 'debug'),
    join(root, 'src-tauri', 'target', 'debug', 'deps'),
    join(root, 'src-tauri', 'target', 'release'),
  ];
  if (existsSync(targetDllInLib)) {
    for (const dir of cargoTargetDirs) {
      try {
        mkdirSync(dir, { recursive: true });
        copyFileSync(targetDllInLib, join(dir, 'libmpv-2.dll'));
      } catch {}
    }
  }

  if (existsSync(targetYtdlp)) {
    const existingSha256 = sha256(readFileSync(targetYtdlp));
    if (existingSha256 === YTDLP_ASSET_SHA256) {
      console.log(`[ensure-windows-mpv] yt-dlp ${YTDLP_RELEASE_TAG} is present.`);
      return;
    }
    console.log(
      '[ensure-windows-mpv] Existing yt-dlp checksum does not match the pinned release; replacing it.',
    );
  }

  try {
    const assetUrl = `https://github.com/yt-dlp/yt-dlp/releases/download/${YTDLP_RELEASE_TAG}/${YTDLP_ASSET_NAME}`;
    console.log(`[ensure-windows-mpv] Downloading pinned yt-dlp ${YTDLP_RELEASE_TAG}...`);
    const downloadRes = await fetch(assetUrl);
    if (!downloadRes.ok) {
      throw new Error(`Failed to download ${assetUrl}: HTTP ${downloadRes.status}`);
    }
    const binary = Buffer.from(await downloadRes.arrayBuffer());
    const binarySha256 = sha256(binary);
    if (binarySha256 !== YTDLP_ASSET_SHA256) {
      throw new Error(
        `yt-dlp checksum mismatch: expected ${YTDLP_ASSET_SHA256}, received ${binarySha256}`,
      );
    }
    writeFileSync(targetYtdlp, binary);
    console.log('[ensure-windows-mpv] Successfully configured the YouTube stream resolver!');
  } catch (error) {
    console.error('[ensure-windows-mpv] Error auto-provisioning yt-dlp:', error.message || error);
    console.error(
      '[ensure-windows-mpv] Run npm run setup:mpv after fixing the download or provide the pinned file manually.',
    );
    process.exitCode = 1;
  }
}

ensureWindowsMpv();
