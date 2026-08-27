import { mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDir, '..');
const outDir = path.join(projectRoot, 'docs', 'distribution', 'store-assets');
const readmeAssetDir = path.join(projectRoot, '.github', 'assets', 'readme');
await mkdir(outDir, { recursive: true });

const asDataUrl = async (filePath, mimeType) => {
  const contents = await readFile(filePath);
  return `data:${mimeType};base64,${contents.toString('base64')}`;
};

const [iconSrc, wordmarkFontUrl, heroSrc] = await Promise.all([
  asDataUrl(path.join(projectRoot, 'src-tauri', 'icons', 'icon.png'), 'image/png'),
  asDataUrl(path.join(projectRoot, 'public', 'fonts', 'righteous-latin-400.woff2'), 'font/woff2'),
  asDataUrl(path.join(readmeAssetDir, 'hero.webp'), 'image/webp').catch(() => ''),
]);

const browser = await chromium.launch({ headless: true });

async function renderHtmlToImage(fileName, width, height, html) {
  const page = await browser.newPage({
    viewport: { width, height },
    deviceScaleFactor: 1,
    colorScheme: 'dark',
  });

  await page.setContent(html, { waitUntil: 'load' });
  await page.evaluate(() => document.fonts.ready);
  const target = path.join(outDir, fileName);
  await page.screenshot({ path: target, type: 'png', animations: 'disabled' });
  console.log(`Generated: ${fileName} (${width}x${height})`);
  await page.close();
}

const baseFontCss = `
  @font-face {
    font-family: "Righteous";
    src: url("${wordmarkFontUrl}") format("woff2");
    font-weight: 400;
  }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    font-family: Inter, ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    color: #f7fbff;
    overflow: hidden;
  }
`;

// 1. Box Art (1080x1080) - Square Card Asset
const boxArtHtml = `<!doctype html>
<html>
<head>
  <style>
    ${baseFontCss}
    body {
      width: 1080px;
      height: 1080px;
      background:
        radial-gradient(circle at 50% 40%, rgba(0, 139, 255, 0.18), transparent 55%),
        #05080d;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      position: relative;
    }
    .top-rule {
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 8px;
      background: linear-gradient(90deg, #0588ff 0%, #48b8ff 33%, #0588ff 67%, #0063bd 100%);
    }
    .icon-glow {
      position: absolute;
      top: 260px;
      width: 380px;
      height: 380px;
      background: #007bff;
      filter: blur(100px);
      opacity: 0.25;
      border-radius: 50%;
    }
    .icon-wrapper {
      position: relative;
      z-index: 2;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .app-icon {
      width: 340px;
      height: 340px;
      object-fit: contain;
      filter: drop-shadow(0 20px 40px rgba(0, 0, 0, 0.7));
    }
    .brand-content {
      position: relative;
      z-index: 2;
      display: flex;
      flex-direction: column;
      align-items: center;
      margin-top: 40px;
    }
    .wordmark {
      font-family: "Righteous", sans-serif;
      font-size: 72px;
      letter-spacing: 12px;
      line-height: 1;
      text-transform: uppercase;
      color: #f7fbff;
    }
    .tagline {
      margin-top: 14px;
      font-size: 18px;
      font-weight: 700;
      letter-spacing: 3px;
      text-transform: uppercase;
      color: #65b9ff;
    }
  </style>
</head>
<body>
  <div class="top-rule"></div>
  <div class="icon-glow"></div>
  <div class="icon-wrapper">
    <img src="${iconSrc}" class="app-icon" alt="Movena Icon" />
  </div>
  <div class="brand-content">
    <div class="wordmark">MOVENA</div>
    <div class="tagline">IPTV &amp; VOD Player</div>
  </div>
</body>
</html>`;

// 2. Poster Art (720x1080) - Vertical Featured Card
const posterArtHtml = `<!doctype html>
<html>
<head>
  <style>
    ${baseFontCss}
    body {
      width: 720px;
      height: 1080px;
      background:
        radial-gradient(circle at 50% 25%, rgba(0, 139, 255, 0.2), transparent 50%),
        #05080d;
      display: flex;
      flex-direction: column;
      align-items: center;
      padding: 60px 48px;
      position: relative;
    }
    .top-rule {
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 8px;
      background: linear-gradient(90deg, #0588ff 0%, #48b8ff 33%, #0588ff 67%, #0063bd 100%);
    }
    .header {
      display: flex;
      align-items: center;
      gap: 16px;
      margin-top: 20px;
    }
    .header-icon {
      width: 64px;
      height: 64px;
      object-fit: contain;
      filter: drop-shadow(0 6px 12px rgba(0, 0, 0, 0.4));
    }
    .header-text {
      display: flex;
      flex-direction: column;
    }
    .header-wordmark {
      font-family: "Righteous", sans-serif;
      font-size: 38px;
      letter-spacing: 6px;
      line-height: 1;
    }
    .header-sub {
      font-size: 12px;
      font-weight: 800;
      letter-spacing: 2px;
      text-transform: uppercase;
      color: #65b9ff;
      margin-top: 4px;
    }
    .headline {
      margin-top: 48px;
      font-size: 32px;
      font-weight: 850;
      text-align: center;
      line-height: 1.15;
      letter-spacing: -1px;
    }
    .headline span {
      color: #2da4ff;
    }
    .preview-container {
      position: relative;
      width: 624px;
      height: 390px;
      margin-top: 40px;
      border-radius: 12px;
      overflow: hidden;
      border: 1px solid rgba(129, 199, 255, 0.35);
      box-shadow: 0 20px 48px rgba(0, 0, 0, 0.7);
      background: #080c12;
    }
    .preview-img {
      width: 100%;
      height: 100%;
      display: block;
      object-fit: contain;
    }
    .footer-text {
      margin-top: auto;
      font-size: 13px;
      font-weight: 700;
      color: #718299;
      letter-spacing: 0.6px;
    }
  </style>
</head>
<body>
  <div class="top-rule"></div>
  <div class="header">
    <img src="${iconSrc}" class="header-icon" alt="" />
    <div class="header-text">
      <div class="header-wordmark">MOVENA</div>
      <div class="header-sub">IPTV &amp; VOD Player</div>
    </div>
  </div>
  <h1 class="headline">A proper home for<br /><span>your IPTV library.</span></h1>
  <div class="preview-container">
    ${heroSrc ? `<img src="${heroSrc}" class="preview-img" alt="" />` : ''}
  </div>
  <div class="footer-text">movena.frtx.cc · Windows · macOS · Linux</div>
</body>
</html>`;

// 3. App Tile Icon (300x300)
const appTileHtml = `<!doctype html>
<html>
<head>
  <style>
    ${baseFontCss}
    body {
      width: 300px;
      height: 300px;
      background: #05080d;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    img {
      width: 230px;
      height: 230px;
      object-fit: contain;
      filter: drop-shadow(0 8px 16px rgba(0, 0, 0, 0.5));
    }
  </style>
</head>
<body>
  <img src="${iconSrc}" alt="" />
</body>
</html>`;

// 4. Logo 150x150
const logo150Html = `<!doctype html>
<html>
<head>
  <style>
    ${baseFontCss}
    body {
      width: 150px;
      height: 150px;
      background: #05080d;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    img {
      width: 120px;
      height: 120px;
      object-fit: contain;
    }
  </style>
</head>
<body>
  <img src="${iconSrc}" alt="" />
</body>
</html>`;

// 5. Logo 71x71
const logo71Html = `<!doctype html>
<html>
<head>
  <style>
    ${baseFontCss}
    body {
      width: 71px;
      height: 71px;
      background: #05080d;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    img {
      width: 58px;
      height: 58px;
      object-fit: contain;
    }
  </style>
</head>
<body>
  <img src="${iconSrc}" alt="" />
</body>
</html>`;

// 6. 16:9 Super Hero Art (1920x1080) - Partner Center requires no product title text
const superHeroArtHtml = `<!doctype html>
<html>
<head>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      width: 1920px;
      height: 1080px;
      background:
        radial-gradient(circle at 65% 50%, rgba(0, 139, 255, 0.22), transparent 50%),
        radial-gradient(circle at 20% 80%, rgba(14, 165, 233, 0.12), transparent 45%),
        #05080d;
      display: flex;
      align-items: center;
      justify-content: center;
      position: relative;
      overflow: hidden;
    }
    .top-rule {
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 10px;
      background: linear-gradient(90deg, #0588ff 0%, #48b8ff 33%, #0588ff 67%, #0063bd 100%);
      z-index: 10;
    }
    .preview-wrapper {
      position: relative;
      width: 1408px;
      height: 880px;
      border-radius: 14px;
      overflow: hidden;
      border: 1px solid rgba(129, 199, 255, 0.35);
      box-shadow: 0 30px 80px rgba(0, 0, 0, 0.8), 0 0 100px rgba(0, 123, 255, 0.15);
      background: #080c12;
    }
    .preview-img {
      width: 100%;
      height: 100%;
      display: block;
      object-fit: contain;
    }
  </style>
</head>
<body>
  <div class="top-rule"></div>
  <div class="preview-wrapper">
    ${heroSrc ? `<img src="${heroSrc}" class="preview-img" alt="" />` : ''}
  </div>
</body>
</html>`;

try {
  await renderHtmlToImage('BoxArt_1080x1080.png', 1080, 1080, boxArtHtml);
  await renderHtmlToImage('PosterArt_720x1080.png', 720, 1080, posterArtHtml);
  await renderHtmlToImage('AppTile_300x300.png', 300, 300, appTileHtml);
  await renderHtmlToImage('Logo_150x150.png', 150, 150, logo150Html);
  await renderHtmlToImage('Logo_71x71.png', 71, 71, logo71Html);
  await renderHtmlToImage('SuperHeroArt_1920x1080.png', 1920, 1080, superHeroArtHtml);

  // Generate MSIX unplated & targetsize icons for Windows taskbar and start menu
  const iconsDir = path.join(projectRoot, 'src-tauri', 'icons');
  const targetSizes = [16, 20, 24, 30, 32, 36, 40, 44, 48, 64, 72, 80, 96, 256];

  for (const size of targetSizes) {
    const unplatedHtml = `<!doctype html>
<html>
<head>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      width: ${size}px;
      height: ${size}px;
      background: transparent;
      display: flex;
      align-items: center;
      justify-content: center;
      overflow: hidden;
    }
    img {
      width: 100%;
      height: 100%;
      object-fit: contain;
    }
  </style>
</head>
<body>
  <img src="${iconSrc}" alt="" />
</body>
</html>`;

    const page = await browser.newPage({
      viewport: { width: size, height: size },
      deviceScaleFactor: 1,
    });
    await page.setContent(unplatedHtml, { waitUntil: 'load' });

    // Unplated (Taskbar transparent icon - fixes the boxed tile artifact)
    await page.screenshot({
      path: path.join(iconsDir, `Square44x44Logo.altform-unplated_targetsize-${size}.png`),
      type: 'png',
      omitBackground: true,
    });
    await page.screenshot({
      path: path.join(iconsDir, `Square44x44Logo.altform-lightunplated_targetsize-${size}.png`),
      type: 'png',
      omitBackground: true,
    });
    // Targetsize
    await page.screenshot({
      path: path.join(iconsDir, `Square44x44Logo.targetsize-${size}.png`),
      type: 'png',
      omitBackground: true,
    });
    await page.close();
  }
} finally {
  await browser.close();
}

console.log('All store assets and Windows MSIX taskbar icons generated successfully.');

