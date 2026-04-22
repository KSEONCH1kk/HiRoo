/**
 * Renders resources/icon.png (1024×1024) and resources/splash.png (2732×2732)
 * using an offscreen Electron window — same trick as desktop/build-icons.js.
 * This gives us Instrument Serif exactly as Google Fonts renders it, without
 * asking the user to take a screenshot.
 *
 * Run:   npm run icons:render     (just the source PNGs)
 *        npm run icons            (render + capacitor-assets generate)
 */
const { app, BrowserWindow } = require("electron");
const path = require("node:path");
const fs = require("node:fs");

const OUT = path.join(__dirname, "resources");

function iconHtml(size) {
  return `<!doctype html><html><head><meta charset="utf-8">
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&display=swap" rel="stylesheet">
    <style>
      html, body { margin: 0; padding: 0; width: ${size}px; height: ${size}px; background: transparent; }
      .tile {
        width: ${size}px; height: ${size}px;
        background: #7c5cff;
        border-radius: ${Math.round(size * 14 / 44)}px;
        display: flex; align-items: center; justify-content: center;
        font-family: "Instrument Serif", Georgia, serif;
        font-size: ${Math.round(size * 22 / 44)}px;
        font-weight: 600;
        letter-spacing: -${Math.max(1, Math.round(size / 44))}px;
        color: #fff; line-height: 1;
      }
      .r { font-style: italic; opacity: 0.85; margin-left: -${Math.max(1, Math.round(size * 2 / 44))}px; }
    </style>
  </head><body>
    <div class="tile">H<span class="r">r</span></div>
    <script>document.fonts.ready.then(() => { document.title = "ready"; });</script>
  </body></html>`;
}

function splashHtml(size) {
  // Centered logo on a dark background — same palette as the web app.
  const logoSize = Math.round(size / 4);
  return `<!doctype html><html><head><meta charset="utf-8">
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&display=swap" rel="stylesheet">
    <style>
      html, body { margin: 0; padding: 0; width: ${size}px; height: ${size}px;
        background: #0e0e13; display: flex; align-items: center; justify-content: center; }
      .tile {
        width: ${logoSize}px; height: ${logoSize}px;
        background: #7c5cff;
        border-radius: ${Math.round(logoSize * 14 / 44)}px;
        display: flex; align-items: center; justify-content: center;
        font-family: "Instrument Serif", Georgia, serif;
        font-size: ${Math.round(logoSize * 22 / 44)}px;
        font-weight: 600;
        letter-spacing: -${Math.max(1, Math.round(logoSize / 44))}px;
        color: #fff; line-height: 1;
        box-shadow: 0 20px 60px rgba(124,92,255,0.45);
      }
      .r { font-style: italic; opacity: 0.85; margin-left: -${Math.max(1, Math.round(logoSize * 2 / 44))}px; }
    </style>
  </head><body>
    <div class="tile">H<span class="r">r</span></div>
    <script>document.fonts.ready.then(() => { document.title = "ready"; });</script>
  </body></html>`;
}

async function render(html, width, height, outPath) {
  const win = new BrowserWindow({
    width, height,
    show: false, frame: false, transparent: true,
    backgroundColor: "#00000000",
    webPreferences: { offscreen: false, backgroundThrottling: false },
  });
  await win.loadURL("data:text/html;charset=utf-8," + encodeURIComponent(html));
  await new Promise((resolve) => {
    const check = async () => {
      const t = await win.webContents.getTitle();
      if (t === "ready") resolve();
      else setTimeout(check, 60);
    };
    check();
  });
  const img = await win.webContents.capturePage({ x: 0, y: 0, width, height });
  fs.writeFileSync(outPath, img.toPNG());
  win.close();
  console.log("wrote", outPath);
}

app.whenReady().then(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  await render(iconHtml(1024),   1024, 1024, path.join(OUT, "icon.png"));
  await render(splashHtml(2732), 2732, 2732, path.join(OUT, "splash.png"));
  app.quit();
});
