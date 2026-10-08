import { analyticsPage } from "@/lib/telemetry";
import { initializeClientErrors } from "@/components/sentry-client";

void initializeClientErrors();

// Stop GA before programmatic navigation can render private content.
export function onRouterTransitionStart(url: string) {
  const path = new URL(url, window.location.origin).pathname;
  if (analyticsPage(path, window.location.origin)) return;
  for (const key of Object.keys(window)) {
    if (/^ga-disable-G-[A-Z0-9]+$/u.test(key)) window[key as `ga-disable-${string}`] = true;
  }
}
