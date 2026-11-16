import { existsSync } from "node:fs";

export const MACOS_KAMIBROWSER_CLI =
  "/Applications/KamiBrowser.app/Contents/Frameworks/KamiBrowser Framework.framework/Versions/Current/Helpers/kami-browser";

export function resolveKamiBrowserCli({
  configured = process.env.KAMI_BROWSER_REAL_E2E_CLI,
  platform = process.platform,
  pathExists = existsSync,
} = {}) {
  if (typeof configured === "string" && configured.trim()) {
    return configured.trim();
  }
  if (platform === "darwin" && pathExists(MACOS_KAMIBROWSER_CLI)) {
    return MACOS_KAMIBROWSER_CLI;
  }
  return "kami-browser";
}
