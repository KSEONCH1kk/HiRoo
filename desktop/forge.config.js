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
  rebuildConfig: {},
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
