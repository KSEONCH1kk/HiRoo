// electron-forge build configuration.
//
//  Build for current OS:  npm run make
//  Package without installer:  npm run package
module.exports = {
  packagerConfig: {
    asar: true,
    name: "HiRoo",
    executableName: "HiRoo",
    icon: "src/assets/icon",        // .ico on Win, .icns on macOS, .png on Linux
    appBundleId: "tech.intave.hiroo",
    appCategoryType: "public.app-category.social-networking",
    extraResource: ["src/assets"],
  },
  // uiohook-napi ships prebuilt .node binaries, but @electron/rebuild still
  // tries to run node-gyp on it and fails. Skipping the rebuild preserves
  // the prebuilt binary and lets the app find it at runtime.
  rebuildConfig: { onlyModules: [] },
  makers: [
    // Windows
    { name: "@electron-forge/maker-squirrel", config: {
        name: "HiRoo",
        authors: "HiRoo",
        description: "HiRoo desktop client",
        setupIcon: "src/assets/icon.ico",
        iconUrl: "https://hiroo.intave.tech/favicon.ico",
    }},
    // macOS
    { name: "@electron-forge/maker-zip", platforms: ["darwin"] },
    { name: "@electron-forge/maker-dmg", config: { name: "HiRoo" } },
    // Linux
    { name: "@electron-forge/maker-deb", config: { options: { icon: "src/assets/icon.png" } } },
  ],
  plugins: [],
};
