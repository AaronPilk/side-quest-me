import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.aaronpilk.sidequest",
  appName: "Sidequest",
  webDir: "dist-ios",
  backgroundColor: "#F5F6FC",
  server: {
    hostname: "localhost",
    iosScheme: "capacitor",
  },
  ios: {
    contentInset: "never",
    preferredContentMode: "mobile",
    allowsLinkPreview: false,
    backgroundColor: "#F5F6FC",
  },
};

export default config;
