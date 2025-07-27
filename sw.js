// SpotifyClone Service Worker
const CACHE_NAME = 'spotifyclone-v1.0.0';
const urlsToCache = [
    '/',
    '/index.html',
    '/style.css',
    '/script.js',
    'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css',
    'https://fonts.googleapis.com/css2?family=Poppins:wght@300;400;500;600;700&display=swap'
];

// Install event - cache resources
self.addEventListener('install', event => {
    console.log('SpotifyClone Service Worker: Installing...');
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => {
                console.log('SpotifyClone Service Worker: Caching app shell');
                return cache.addAll(urlsToCache);
            })
            .catch(error => {
                console.error('SpotifyClone Service Worker: Failed to cache resources', error);
            })
    );
});

// Activate event - clean up old caches
self.addEventListener('activate', event => {
    console.log('SpotifyClone Service Worker: Activating...');
    event.waitUntil(
        caches.keys().then(cacheNames => {
            return Promise.all(
                cacheNames.map(cacheName => {
                    if (cacheName !== CACHE_NAME) {
                        console.log('SpotifyClone Service Worker: Deleting old cache', cacheName);
                        return caches.delete(cacheName);
                    }
                })
            );
        })
    );
});

// Fetch event - serve from cache when offline
self.addEventListener('fetch', event => {
    // Skip non-GET requests and external resources that might cause CORS issues
    if (event.request.method !== 'GET' || 
        event.request.url.includes('youtube') ||
        event.request.url.includes('localhost:8000')) {
        return;
    }

    event.respondWith(
        caches.match(event.request)
            .then(response => {
                // Return cached version if available
                if (response) {
                    return response;
                }

                // Otherwise fetch from network
                return fetch(event.request).then(response => {
                    // Don't cache if not a valid response
                    if (!response || response.status !== 200 || response.type !== 'basic') {
                        return response;
                    }

                    // Clone the response
                    const responseToCache = response.clone();

                    // Add to cache for future use
                    caches.open(CACHE_NAME)
                        .then(cache => {
                            cache.put(event.request, responseToCache);
                        });

                    return response;
                });
            })
            .catch(() => {
                // Return offline page for navigation requests when network fails
                if (event.request.destination === 'document') {
                    return caches.match('/index.html');
                }
            })
    );
});

// Background sync for uploading music when connection is restored
self.addEventListener('sync', event => {
    if (event.tag === 'background-sync-upload') {
        console.log('SpotifyClone Service Worker: Background sync triggered');
        event.waitUntil(handleBackgroundSync());
    }
});

async function handleBackgroundSync() {
    // Handle any pending uploads that failed due to network issues
    try {
        const pendingUploads = await getStoredUploads();
        
        for (const upload of pendingUploads) {
            try {
                await retryUpload(upload);
                await removeStoredUpload(upload.id);
            } catch (error) {
                console.error('SpotifyClone Service Worker: Failed to upload during background sync', error);
            }
        }
    } catch (error) {
        console.error('SpotifyClone Service Worker: Background sync failed', error);
    }
}

// Helper functions for background sync
async function getStoredUploads() {
    // In a real implementation, you'd retrieve from IndexedDB
    return [];
}

async function retryUpload(upload) {
    // In a real implementation, you'd retry the upload
    return fetch('/upload', {
        method: 'POST',
        body: upload.formData
    });
}

async function removeStoredUpload(uploadId) {
    // In a real implementation, you'd remove from IndexedDB
    console.log('Removed upload:', uploadId);
}

// Push notifications (for future features like new song recommendations)
self.addEventListener('push', event => {
    if (!event.data) return;

    const options = {
        body: event.data.text(),
        icon: '/favicon.ico',
        badge: '/favicon.ico',
        vibrate: [100, 50, 100],
        data: {
            dateOfArrival: Date.now(),
            primaryKey: 1
        },
        actions: [
            {
                action: 'play',
                title: 'Play Now',
                icon: '/images/play-icon.png'
            },
            {
                action: 'close',
                title: 'Close',
                icon: '/images/close-icon.png'
            }
        ]
    };

    event.waitUntil(
        self.registration.showNotification('SpotifyClone', options)
    );
});

// Handle notification clicks
self.addEventListener('notificationclick', event => {
    event.notification.close();

    if (event.action === 'play') {
        // Handle play action
        event.waitUntil(
            clients.openWindow('/')
        );
    } else if (event.action === 'close') {
        // Just close the notification
        return;
    } else {
        // Default action - open the app
        event.waitUntil(
            clients.openWindow('/')
        );
    }
});

// Message handling for communication with main thread
self.addEventListener('message', event => {
    if (event.data && event.data.type === 'SKIP_WAITING') {
        self.skipWaiting();
    }
});

console.log('SpotifyClone Service Worker: Loaded successfully');