// QA-only build: electron-vite resets NODE_ENV to production when resolving config.
// Override just renderer's compile-time React mode; main/preload/security config stays intact.
import { build } from "electron-vite";

if (process.env.SASU_DESKTOP_REACT_MODE !== "development") throw new Error("development_react_test_only");
await build({ plugins: [{
  name: "qa-development-react",
  config(config) {
    if (config.root?.replaceAll("\\", "/").endsWith("/src/renderer")) {
      return { define: { "process.env.NODE_ENV": JSON.stringify("development") } };
    }
  },
}] });
