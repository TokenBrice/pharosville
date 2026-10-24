declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
  }
}

let installed = false;

/** Called only after world reveal, or after a denied viewport's useful welcome has painted. */
export function installGoogleAnalytics(): void {
  if (installed || typeof window === "undefined") return;
  const gaId = import.meta.env.VITE_GA_ID as string | undefined;
  if (!gaId) return;
  installed = true;

  const install = (): void => {
    const script = document.createElement("script");
    script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(gaId)}`;
    script.async = true;
    document.head.appendChild(script);

    window.dataLayer = window.dataLayer ?? [];
    function gtag(...args: unknown[]): void {
      window.dataLayer!.push(args);
    }
    window.gtag = gtag;
    gtag("js", new Date());
    gtag("config", gaId);
  };

  // The admission/reveal owner supplies the visibility boundary; idle alone is NOT a reveal signal.
  if (typeof window.requestIdleCallback === "function") {
    window.requestIdleCallback(install, { timeout: 5_000 });
  } else {
    setTimeout(install, 1_000);
  }
}
