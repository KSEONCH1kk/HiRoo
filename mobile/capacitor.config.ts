import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "tech.intave.hiroo",
  appName: "HiRoo",
  webDir: "www",

  // Load the production web app directly. If you want to bundle the static
  // Next.js export inside the APK instead (fully offline-capable UI), drop
  // the `url` entry and run `next build && next export` into `www/`.
  server: {
    url: "https://hiroo.intave.tech",
    cleartext: false,
    androidScheme: "https",
  },

  android: {
    // Allow the embedded WebView to hit mic/camera/screen-capture APIs,
    // navigate history, and present file pickers.
    allowMixedContent: false,
    captureInput: true,
    webContentsDebuggingEnabled: false,
    backgroundColor: "#0e0e13",
  },

  plugins: {
    SplashScreen: {
      launchShowDuration: 1200,
      launchAutoHide: true,
      backgroundColor: "#0e0e13",
      androidSplashResourceName: "splash",
      showSpinner: false,
    },
    StatusBar: {
      style: "DARK",
      backgroundColor: "#0e0e13",
    },
    LocalNotifications: {
      smallIcon: "ic_stat_hiroo",
      iconColor: "#7c5cff",
    },
    PushNotifications: {
      presentationOptions: ["badge", "sound", "alert"],
    },
  },
};

export default config;
