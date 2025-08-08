// Service Worker for "A simple todo list app" PWA
// Caches app shell, handles runtime caching for API, and provides basic offline queue + background sync for creating todos.

const CACHE_NAME = 'todo-pwa-v1';
const urlsToCache = [
  '/',
  '/index.html',
  '/style.css',
  '/script.js',
  '/manifest.json',
  '/offline.html',
  '/icons/icon-192.png',
  '/icons/icon-512.png'
];

// --------- IndexedDB helpers (simple outbox for failed POSTs) ----------
const IDB_DB_NAME = 'todo-pwa-db';
const IDB_STORE_NAME = 'outbox';

function openIDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(IDB_STORE_NAME)) {
        db.createObjectStore(IDB_STORE_NAME, { keyPath: 'id', autoIncrement: true });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function saveToOutbox(item) {
  const db = await openIDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE_NAME, 'readwrite');
    const store = tx.objectStore(IDB_STORE_NAME);
    store.add({
      payload: item,
      timestamp: Date.now()
    }).onsuccess = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function getOutboxAll() {
  const db = await openIDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE_NAME, 'readonly');
    const store = tx.objectStore(IDB_STORE_NAME);
    const req = store.getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}

async function deleteOutboxItem(key) {
  const db = await openIDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE_NAME, 'readwrite');
    const store = tx.objectStore(IDB_STORE_NAME);
    const req = store.delete(key);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

// ------------------ Install: cache app shell ------------------
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('Todo PWA: Caching app shell');
        return cache.addAll(urlsToCache);
      })
      .then(() => self.skipWaiting())
  );
});

// ------------------ Activate: cleanup and take control ------------------
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cn => {
          if (cn !== CACHE_NAME) {
            console.log('Todo PWA: Removing old cache', cn);
            return caches.delete(cn);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// ------------------ Fetch: caching strategies & offline handling ------------------
self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);

  // Handle navigation requests (HTML pages) with network-first, fallback to cache/offline page
  if (request.mode === 'navigate' || (request.method === 'GET' && request.headers.get('accept') && request.headers.get('accept').includes('text/html'))) {
    event.respondWith(
      (async () => {
        try {
          const networkResponse = await fetch(request);
          // Update cache with latest HTML (optional)
          const cache = await caches.open(CACHE_NAME);
          cache.put(request, networkResponse.clone());
          return networkResponse;
        } catch (err) {
          const cached = await caches.match(request);
          return cached || (await caches.match('/offline.html'));
        }
      })()
    );
    return;
  }

  // API requests: /api/todos -> special handling for GET and POST
  if (url.pathname.startsWith('/api/todos')) {
    // POST: try network, on failure queue in IDB outbox and return accepted response
    if (request.method === 'POST') {
      event.respondWith(
        (async () => {
          try {
            const fetchResponse = await fetch(request.clone());
            // Optionally update runtime cache of GET /api/todos if required by server
            return fetchResponse;
          } catch (err) {
            // Read body and save to outbox for later sync
            try {
              const body = await request.clone().json();
              await saveToOutbox({
                url: request.url,
                method: request.method,
                body
              });
              // Register for background sync if available
              if ('sync' in self.registration) {
                try {
                  await self.registration.sync.register('sync-todos');
                } catch (e) {
                  // Registration failed, we'll sync when online via other means
                }
              }
              return new Response(JSON.stringify({ success: false, offline: true, queued: true }), {
                status: 202,
                headers: { 'Content-Type': 'application/json' }
              });
            } catch (readErr) {
              return new Response(JSON.stringify({ success: false, offline: true, queued: false }), {
                status: 500,
                headers: { 'Content-Type': 'application/json' }
              });
            }
          }
        })()
      );
      return;
    }

    // GET: network-first (keep cache fallback)
    if (request.method === 'GET') {
      event.respondWith(
        (async () => {
          try {
            const response = await fetch(request);
            // Cache a clone for offline fallback
            const cache = await caches.open(CACHE_NAME);
            cache.put(request, response.clone());
            return response;
          } catch (err) {
            const cached = await caches.match(request);
            if (cached) return cached;
            return new Response(JSON.stringify({ todos: [], offline: true }), {
              status: 200,
              headers: { 'Content-Type': 'application/json' }
            });
          }
        })()
      );
      return;
    }
  }

  // Static resources: cache-first strategy (images, css, js)
  if (request.method === 'GET' && (url.origin === location.origin)) {
    event.respondWith(
      caches.match(request).then(cached => {
        return cached || fetch(request).then(networkResp => {
          // Save for future
          return caches.open(CACHE_NAME).then(cache => {
            cache.put(request, networkResp.clone());
            return networkResp;
          });
        }).catch(() => {
          // If image fails, optionally return a generic placeholder (not included by default)
          if (request.destination === 'image') {
            return caches.match('/icons/icon-192.png');
          }
          // Fall back to offline page for navigations handled above; here just reject
          return new Response('', { status: 404 });
        });
      })
    );
    return;
  }

  // Default network fallback
  event.respondWith(fetch(request).catch(() => caches.match(request)));
});

// ------------------ Background Sync: attempt to send queued todos ------------------
self.addEventListener('sync', event => {
  if (event.tag === 'sync-todos') {
    event.waitUntil(
      (async () => {
        const queued = await getOutboxAll();
        for (const item of queued) {
          try {
            const res = await fetch(item.payload && item.payload.url ? item.payload.url : '/api/todos', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(item.payload.body || item.payload)
            });
            if (res && (res.status === 200 || res.status === 201 || res.status === 202)) {
              await deleteOutboxItem(item.id);
              console.log('Todo PWA: Synced queued todo id', item.id);
            } else {
              // If server responded with error, keep it in outbox to retry later
              console.warn('Todo PWA: Server rejected queued todo id', item.id, res && res.status);
            }
          } catch (err) {
            // Network still unavailable; keep queued item
            console.warn('Todo PWA: Sync failed for id', item.id);
          }
        }
      })()
    );
  }
});

// ------------------ Message: allow skipWaiting from the page ------------------
self.addEventListener('message', event => {
  if (!event.data) return;
  if (event.data === 'skipWaiting') {
    self.skipWaiting();
  }
  // Could support other messages, e.g. flush outbox on demand:
  if (event.data === 'flushOutbox') {
    event.waitUntil(
      (async () => {
        const queued = await getOutboxAll();
        for (const item of queued) {
          try {
            const res = await fetch(item.payload && item.payload.url ? item.payload.url : '/api/todos', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(item.payload.body || item.payload)
            });
            if (res && (res.status === 200 || res.status === 201 || res.status === 202)) {
              await deleteOutboxItem(item.id);
            }
          } catch (e) {
            // ignore for now
          }
        }
      })()
    );
  }
});