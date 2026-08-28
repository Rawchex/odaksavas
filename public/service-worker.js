self.addEventListener('push', function(event) {
  if (event.data) {
    let data;
    try {
      data = event.data.json();
    } catch(e) {
      data = { title: 'BLUNK', body: event.data.text() };
    }

    const options = {
      body: data.body || '',
      icon: data.icon || '/favicon.svg',
      badge: data.badge || '/favicon.svg',
      image: data.image || undefined,
      vibrate: data.vibrate || [100, 50, 100],
      tag: data.tag || `blunk-notification-${Date.now()}`,
      renotify: data.renotify !== false,
      actions: data.actions || [],
      data: data.data || { url: data.url || '/' }
    };
    
    event.waitUntil(
      self.registration.showNotification(data.title || 'BLUNK', options)
    );
  }
});

self.addEventListener('notificationclick', function(event) {
  event.notification.close();

  const notifData = event.notification.data || {};
  let targetUrl = notifData.url || '/';

  // Handle action buttons if clicked
  if (event.action === 'join_party' && notifData.partyId) {
    targetUrl = `/?party=${notifData.partyId}`;
  } else if (event.action === 'open_chat' && notifData.senderUsername) {
    targetUrl = `/mesajlar/${encodeURIComponent(notifData.senderUsername)}`;
  } else if (event.action === 'accept_friend') {
    targetUrl = '/bildirimler';
  }

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(windowClients => {
      for (let i = 0; i < windowClients.length; i++) {
        const client = windowClients[i];
        if (client.url.indexOf(self.registration.scope) !== -1 && 'focus' in client) {
          if ('navigate' in client) {
            client.navigate(targetUrl);
          }
          return client.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow(targetUrl);
      }
    })
  );
});
