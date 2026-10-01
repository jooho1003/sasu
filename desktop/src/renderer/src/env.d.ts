import type { SasuBridge } from "../../preload";

declare global {
  interface Window {
    sasu: SasuBridge;
  }
}

export {};
