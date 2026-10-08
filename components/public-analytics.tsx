"use client";

import Script from "next/script";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { analyticsPage } from "@/lib/telemetry";

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
    [key: `ga-disable-${string}`]: boolean | undefined;
  }
}
type AnalyticsWindow = Window;
const storageKey = "sasu-analytics-consent";
const consentEvent = "sasu-analytics-consent-changed";
function readConsent() {
  try { const value = localStorage.getItem(storageKey); return value === "granted" || value === "denied" ? value : "unknown"; } catch { return "unknown"; }
}
function subscribe(callback: () => void) {
  window.addEventListener("storage", callback);
  window.addEventListener(consentEvent, callback);
  return () => { window.removeEventListener("storage", callback); window.removeEventListener(consentEvent, callback); };
}

export function PublicAnalytics({ measurementId, nonce, baseUrl }: { measurementId: string; nonce?: string; baseUrl: string }) {
  const pathname = usePathname();
  const consent = useSyncExternalStore(subscribe, readConsent, () => "unknown");
  const [editing, setEditing] = useState(false);
  const page = analyticsPage(pathname, baseUrl);
  const isPublic = page !== null;
  const lastPage = useRef<string | null>(null);
  const ready = useRef(false);
  const sendPage = useCallback(() => {
    const analytics = window as AnalyticsWindow;
    const data = analyticsPage(pathname, baseUrl);
    analytics[`ga-disable-${measurementId}`] = consent !== "granted" || !data;
    if (!ready.current || !data || consent !== "granted" || lastPage.current === pathname) return;
    analytics.gtag?.("set", data);
    analytics.gtag?.("event", "page_view", { ...data, send_to: measurementId });
    lastPage.current = pathname;
  }, [baseUrl, consent, measurementId, pathname]);

  useEffect(() => { sendPage(); }, [sendPage]);
  useEffect(() => {
    if (!isPublic || consent !== "granted") return;
    // A full document navigation removes gtag before any private screen is rendered.
    const clicked = (event: MouseEvent) => {
      if (!(event.target instanceof Element)) return;
      const link = event.target.closest<HTMLAnchorElement>("a[href]");
      if (!link) return;
      const url = new URL(link.href, window.location.origin);
      const cta = link.dataset.analyticsId;
      if (cta && ["demo", "pilot_contact", "guide", "demo_video", "vote"].includes(cta)) (window as AnalyticsWindow).gtag?.("event", "public_cta_click", { cta, ...analyticsPage(pathname, baseUrl), send_to: measurementId });
      if (url.origin === window.location.origin && !analyticsPage(url.pathname, baseUrl) && link.target !== "_blank" && event.button === 0 && !event.ctrlKey && !event.metaKey && !event.shiftKey && !event.altKey) {
        event.preventDefault();
        event.stopPropagation();
        (window as AnalyticsWindow)[`ga-disable-${measurementId}`] = true;
        window.location.assign(url.href);
      }
    };
    document.addEventListener("click", clicked, true);
    return () => document.removeEventListener("click", clicked, true);
  }, [baseUrl, consent, measurementId, pathname, isPublic]);

  function choose(value: "granted" | "denied") {
    try { localStorage.setItem(storageKey, value); } catch { return; }
    if (value === "denied") {
      (window as AnalyticsWindow)[`ga-disable-${measurementId}`] = true;
      for (const cookie of document.cookie.split(";")) {
        const name = cookie.trim().split("=")[0];
        if (!/^_ga(?:_|$)/u.test(name)) continue;
        document.cookie = `${name}=; Max-Age=0; Path=/; SameSite=Lax`;
        for (const domain of [window.location.hostname, `.${window.location.hostname}`]) document.cookie = `${name}=; Max-Age=0; Path=/; Domain=${domain}; SameSite=Lax`;
      }
    }
    window.dispatchEvent(new Event(consentEvent));
    setEditing(false);
    if (value === "denied" && ready.current) window.location.reload();
  }

  if (!page) return null;
  return <>
    {consent === "granted" ? <Script id="sasu-ga4" nonce={nonce} src={`https://www.googletagmanager.com/gtag/js?id=${measurementId}`} strategy="afterInteractive" onReady={() => {
      const analytics = window as AnalyticsWindow;
      if (!analyticsPage(window.location.pathname, baseUrl) || readConsent() !== "granted") return;
      analytics.dataLayer = analytics.dataLayer ?? [];
      // Google tag command entries use the Arguments object, as in its official bootstrap.
      // eslint-disable-next-line prefer-rest-params -- Preserve Google's command queue format.
      analytics.gtag = function () { analytics.dataLayer!.push(arguments); };
      analytics[`ga-disable-${measurementId}`] = false;
      analytics.gtag("consent", "default", { analytics_storage: "granted", ad_storage: "denied", ad_user_data: "denied", ad_personalization: "denied" });
      analytics.gtag("js", new Date());
      analytics.gtag("config", measurementId, { ...analyticsPage(window.location.pathname, baseUrl), send_page_view: false, allow_google_signals: false, allow_ad_personalization_signals: false, cookie_flags: "SameSite=Lax;Secure" });
      ready.current = true;
      sendPage();
    }} /> : null}
    {consent === "unknown" || editing ? <aside aria-label="방문 분석 선택" className="fixed inset-x-4 bottom-4 z-50 mx-auto flex max-w-3xl flex-wrap items-center gap-3 rounded-2xl border border-black/10 bg-white p-5 shadow-lg">
      <p className="m-0 flex-1 text-sm leading-6">공개 페이지의 방문과 버튼 이용을 분석해 사수를 개선합니다. 허용하면 구글 애널리틱스 쿠키를 사용합니다. 업무 내용과 로그인 정보는 보내지 않습니다. <a href="/privacy" className="underline">개인정보 처리 안내</a></p>
      <button className="button button-primary button-small" type="button" onClick={() => choose("granted")}>방문 분석 허용</button>
      <button className="button button-secondary button-small" type="button" onClick={() => choose("denied")}>허용 안 함</button>
    </aside> : <button className="fixed bottom-3 right-3 z-40 rounded-lg border border-black/10 bg-white px-3 py-2 text-xs text-muted shadow-sm" type="button" onClick={() => setEditing(true)}>방문 분석 설정</button>}
  </>;
}
