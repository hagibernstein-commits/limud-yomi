/* הלימוד היומי שלי - Service Worker: מטמון מלא של מעטפת האפליקציה לעבודה אופליין */
const CACHE_NAME = 'limud-yomi-v1';
const APP_SHELL = [
  './',
  './app.html',
  './manifest.webmanifest',
  './icon-192.png',
  './icon-512.png',
  './vendor/tailwind.js',
  './vendor/tailwindcss.min.js'
];

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
        .catch(() => caches.match(req).then((hit) => hit || caches.match('./app.html')).then((hit) => hit || caches.match('./')))
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
