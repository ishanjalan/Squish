// Squish Service Worker
// Enables offline functionality by caching static assets

const CACHE_VERSION = '2';
const CACHE_NAME = `squish-v${CACHE_VERSION}`;
const BASE_PATH = '/Squish';

// Assets to cache on install
const STATIC_ASSETS = [
	`${BASE_PATH}/`,
	`${BASE_PATH}/index.html`
];

// Install event - cache static assets
self.addEventListener('install', (event) => {
	event.waitUntil(
		caches.open(CACHE_NAME).then((cache) => {
			console.log('[SW] Caching static assets');
			return cache.addAll(STATIC_ASSETS);
		})
	);
	// Activate immediately
	self.skipWaiting();
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
	event.waitUntil(
		caches.keys().then((cacheNames) => {
			return Promise.all(
				cacheNames
					.filter((name) => name !== CACHE_NAME)
					.map((name) => {
						console.log('[SW] Deleting old cache:', name);
						return caches.delete(name);
					})
			);
		})
	);
	// Claim all clients
	self.clients.claim();
});

// Fetch event - Cache-First strategy for static assets, Network-First for API
self.addEventListener('fetch', (event) => {
	const url = new URL(event.request.url);

	// Skip non-GET requests
	if (event.request.method !== 'GET') return;

	// Skip external requests
	if (!url.origin.includes(self.location.origin)) return;

	// Skip browser extension requests
	if (url.protocol === 'chrome-extension:') return;

	// Cache-First for static assets (JS, CSS, images, WASM)
	if (
		url.pathname.includes('/_app/') ||
		url.pathname.endsWith('.js') ||
		url.pathname.endsWith('.css') ||
		url.pathname.endsWith('.wasm') ||
		url.pathname.endsWith('.svg') ||
		url.pathname.endsWith('.png') ||
		url.pathname.endsWith('.jpg') ||
		url.pathname.endsWith('.webp')
	) {
		event.respondWith(
			caches.open(CACHE_NAME).then((cache) => {
				return cache.match(event.request).then((cachedResponse) => {
					if (cachedResponse) {
						// Return cached, but also update cache in background
						fetch(event.request).then((networkResponse) => {
							if (networkResponse.ok) {
								cache.put(event.request, networkResponse);
							}
						}).catch(() => {});
						return cachedResponse;
					}

					// Not in cache, fetch and cache
					return fetch(event.request).then((networkResponse) => {
						if (networkResponse.ok) {
							cache.put(event.request, networkResponse.clone());
						}
						return networkResponse;
					});
				});
			})
		);
		return;
	}

	// Network-First for HTML (app shell)
	if (event.request.mode === 'navigate' || url.pathname.endsWith('.html') || url.pathname === `${BASE_PATH}/`) {
		event.respondWith(
			fetch(event.request)
				.then((networkResponse) => {
					// Cache the latest version
					if (networkResponse.ok) {
						caches.open(CACHE_NAME).then((cache) => {
							cache.put(event.request, networkResponse.clone());
						});
					}
					return networkResponse;
				})
				.catch(() => {
					// Offline - return cached version
					return caches.match(event.request).then((cachedResponse) => {
						return cachedResponse || caches.match(`${BASE_PATH}/`);
					});
				})
		);
		return;
	}
});

// Handle messages from the main thread
self.addEventListener('message', (event) => {
	if (event.data === 'skipWaiting') {
		self.skipWaiting();
	}
});
