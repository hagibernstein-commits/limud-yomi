/* הלימוד היומי שלי - Service Worker: מטמון מלא של מעטפת האפליקציה לעבודה אופליין */
const CACHE_NAME = 'limud-yomi-v2';
const APP_SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './icon-192.png',
  './icon-512.png'
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
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
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
  if (url.origin !== self.location.origin) return;

  // ניווטים: קודם רשת (כדי לקבל עדכונים), ואם אין חיבור - מעטפת מהמטמון
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((resp) => {
          const copy = resp.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(req, copy));
          return resp;
        })
        .catch(() => caches.match(req).then((hit) => hit || caches.match('./index.html')).then((hit) => hit || caches.match('./')))
    );
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
