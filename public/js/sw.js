self.addEventListener('push', function(event) {
    console.log('[Service Worker] Push Received.');
    console.log(`[Service Worker] Push had this data: "${event.data.text()}"`);
  
    const title = 'sweet.sh';
    const parsedData = JSON.parse(event.data.text());
    const options = {
      body: parsedData.body,
      icon: parsedData.imageURL,
      badge: parsedData.imageURL,
      tag: parsedData.link
    };
    event.waitUntil(self.registration.showNotification(title, options));
  });

  self.addEventListener('notificationclick', function(event) {
    console.log('[Service Worker] Notification click Received.');
  
    event.notification.close();
  
    event.waitUntil(
      clients.openWindow(event.notification.tag)
    );
  });