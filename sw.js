/* הלימוד היומי שלי - Service Worker: מטמון מלא של מעטפת האפליקציה לעבודה אופליין */
const CACHE_NAME = 'limud-yomi-v7';

function patchOnboardingHtml(html) {
  const marker = "<!-- limud-yomi-scroll-guard-v1 -->";
  if (html.includes(marker)) return html;
  if (html.split("    let ob = null;\n").length !== 2) throw new Error("Unexpected index.html source: patch anchor count");
  html = html.replace("    let ob = null;\n", "    let ob = null;\n    let lastRenderedOnboardingStep = null;\n");
  if (html.split("    function openOnboarding(source) {\n").length !== 2) throw new Error("Unexpected index.html source: patch anchor count");
  html = html.replace("    function openOnboarding(source) {\n", "    function openOnboarding(source) {\n      lastRenderedOnboardingStep = null;\n");
  if (html.split("      ob = null;\n      renderCurrentPage();\n").length !== 2) throw new Error("Unexpected index.html source: patch anchor count");
  html = html.replace("      ob = null;\n      renderCurrentPage();\n", "      ob = null;\n      lastRenderedOnboardingStep = null;\n      renderCurrentPage();\n");
  if (html.split("      }\n\n      el.innerHTML = `\n        <div class=\"max-w-md mx-auto min-h-screen px-4 py-5 space-y-4 pb-28\">").length !== 2) throw new Error("Unexpected index.html source: patch anchor count");
  html = html.replace("      }\n\n      el.innerHTML = `\n        <div class=\"max-w-md mx-auto min-h-screen px-4 py-5 space-y-4 pb-28\">", "      }\n\n      const stepChanged = lastRenderedOnboardingStep !== ob.step;\n      el.innerHTML = `\n        <div class=\"max-w-md mx-auto min-h-screen px-4 py-5 space-y-4 pb-28\">");
  if (html.split("      el.scrollTop = 0;\n    }\n\n    function finishOnboarding() {").length !== 2) throw new Error("Unexpected index.html source: patch anchor count");
  html = html.replace("      el.scrollTop = 0;\n    }\n\n    function finishOnboarding() {", "      if (stepChanged) el.scrollTop = 0;\n      lastRenderedOnboardingStep = ob.step;\n    }\n\n    function finishOnboarding() {");
  return html.replace("</head>", marker + "\n</head>");
}
const APP_SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './icon-192.png',
  './icon-512.png',
  './kosher-zmanim.min.js'
];

const RUNTIME_CACHE_HOSTS = ['cdn.tailwindcss.com', 'www.gstatic.com'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('limud-yomi-') && k !== CACHE_NAME).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // CDN סקריפטים (Tailwind) - מטמון לאחר הטעינה הראשונה כדי שהאפליקציה תעבוד אופליין
  if (RUNTIME_CACHE_HOSTS.includes(url.hostname)) {
    event.respondWith(
      caches.open(CACHE_NAME).then(async (cache) => {
        const hit = await cache.match(req);
        if (hit) return hit;
        const resp = await fetch(req);
        if (resp.ok || resp.type === 'opaque') cache.put(req, resp.clone());
        return resp;
      })
    );
    return;
  }

  // קריאות חיצוניות (למשל Sefaria) - רשת בלבד; האפליקציה כבר יודעת להתמודד עם כשל אופליין
  if (url.origin !== self.location.origin || !url.href.startsWith(self.registration.scope)) return;

  // Serve patched onboarding HTML for app navigations and direct index.html requests.
  const isAppHtml = req.mode === 'navigate' || url.pathname.endsWith('/index.html');
  if (isAppHtml) {
    event.respondWith((async () => {
      const patchedResponse = async (resp) => {
        if (!resp) return null;
        const body = patchOnboardingHtml(await resp.text());
        const headers = new Headers(resp.headers);
        headers.delete('content-length');
        headers.set('content-type', 'text/html; charset=utf-8');
        headers.set('X-Limud-Yomi-Patch', 'scroll-guard-v1');
        return new Response(body, { status: resp.status, statusText: resp.statusText, headers });
      };
      try {
        const network = await fetch(req);
        if (!network.ok) throw new Error('Network response not OK');
        const patched = await patchedResponse(network);
        const cache = await caches.open(CACHE_NAME);
        await cache.put(req, patched.clone());
        return patched;
      } catch (_) {
        const cached = await caches.match(req) || await caches.match('./index.html') || await caches.match('./');
        return await patchedResponse(cached) || new Response('Offline and no cached app shell', { status: 503 });
      }
    })());
    return;
  }

  // נכסים מקומיים: קודם מטמון, אחרת רשת ושמירה במטמון
  event.respondWith(
    caches.match(req).then((hit) => {
      if (hit) return hit;
      return fetch(req).then((resp) => {
        if (resp && resp.ok) {
          const copy = resp.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(req, copy));
        }
        return resp;
      });
    })
  );
});
