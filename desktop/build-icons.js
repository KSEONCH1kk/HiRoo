/**
 * Offscreen icon renderer.
 *
 *   node-free:  npm run icons
 *
 * Opens a hidden Electron BrowserWindow, loads an HTML template with the
 * same Instrument Serif "Hr" lockup as the web UI, waits for the font to
 * load, and saves three PNGs. Windows .ico is then assembled from them
 * without needing ImageMagick on the host.
 */
const { app, BrowserWindow } = require("electron");
const path = require("node:path");
const fs = require("node:fs");

const OUT = path.join(__dirname, "src", "assets");

// Sizes we need for the various OS integrations:
//   - .ico multi-resolution:  16, 32, 48, 64, 128, 256
//   - PNG for window / Linux: 512
//   - PNG for tray:           32
const ICO_SIZES = [16, 32, 48, 64, 128, 256];
const EXTRA = [512];

function template(size) {
  // Keep this visually identical to the login-page logo.
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
        color: #fff;
        line-height: 1;
      }
      .r { font-style: italic; opacity: 0.85; margin-left: -${Math.max(1, Math.round(size * 2 / 44))}px; }
    </style>
  </head><body>
    <div class="tile">H<span class="r">r</span></div>
    <script>
      // Flag the page as ready once webfonts have downloaded.
      document.fonts.ready.then(() => { document.title = "ready:" + ${size}; });
    </script>
  </body></html>`;
}

async function renderSize(size) {
  const win = new BrowserWindow({
    width: size, height: size,
    show: false, frame: false, transparent: true,
    backgroundColor: "#00000000",
    webPreferences: { offscreen: false, backgroundThrottling: false },
  });
  const html = "data:text/html;charset=utf-8," + encodeURIComponent(template(size));
  await win.loadURL(html);

  // Wait until the page signals fonts.ready via a title change.
  await new Promise((resolve) => {
    const check = async () => {
      const t = await win.webContents.getTitle();
      if (t.startsWith("ready:")) resolve();
      else setTimeout(check, 60);
    };
    check();
  });

  const img = await win.webContents.capturePage({ x: 0, y: 0, width: size, height: size });
  const out = path.join(OUT, `icon-${size}.png`);
  fs.writeFileSync(out, img.toPNG());
  win.close();
  console.log("wrote", out);
  return out;
}

async function buildIco(files) {
  // Minimal ICO writer — spec is simple enough to avoid a dependency.
  const entries = files.map((f) => ({ size: f.size, buf: fs.readFileSync(f.path) }));
  const dirSize = 6 + entries.length * 16;
  let offset = dirSize;
  const dir = Buffer.alloc(dirSize);
  dir.writeUInt16LE(0, 0);           // reserved
  dir.writeUInt16LE(1, 2);           // type: icon
  dir.writeUInt16LE(entries.length, 4);
  entries.forEach((e, i) => {
    const p = 6 + i * 16;
    dir.writeUInt8(e.size >= 256 ? 0 : e.size, p);       // width
    dir.writeUInt8(e.size >= 256 ? 0 : e.size, p + 1);   // height
    dir.writeUInt8(0, p + 2);                             // colors in palette
    dir.writeUInt8(0, p + 3);                             // reserved
    dir.writeUInt16LE(1, p + 4);                          // color planes
    dir.writeUInt16LE(32, p + 6);                         // bpp
    dir.writeUInt32LE(e.buf.length, p + 8);               // data size
    dir.writeUInt32LE(offset, p + 12);                    // offset
    offset += e.buf.length;
  });
  const out = Buffer.concat([dir, ...entries.map((e) => e.buf)]);
  const outPath = path.join(OUT, "icon.ico");
  fs.writeFileSync(outPath, out);
  console.log("wrote", outPath);
}

app.whenReady().then(async () => {
  fs.mkdirSync(OUT, { recursive: true });

  const files = [];
  for (const s of [...new Set([...ICO_SIZES, ...EXTRA, 32])]) {
    const p = await renderSize(s);
    files.push({ size: s, path: p });
  }

  // Aliases used by the main process & Squirrel installer.
  const by = Object.fromEntries(files.map((f) => [f.size, f.path]));
  fs.copyFileSync(by[512], path.join(OUT, "icon.png"));
  fs.copyFileSync(by[32],  path.join(OUT, "tray.png"));
  console.log("wrote", path.join(OUT, "icon.png"));
  console.log("wrote", path.join(OUT, "tray.png"));

  // Build the multi-resolution .ico from the small sizes.
  await buildIco(ICO_SIZES.map((s) => ({ size: s, path: by[s] })));

  app.quit();
});
