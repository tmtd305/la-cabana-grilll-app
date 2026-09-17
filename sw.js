// La Cabana Grill — service worker.
// Handles two things: (1) receiving push notifications and showing them,
// and (2) letting the browser install this page as a home-screen app.
// No offline caching is done here on purpose — the app always loads the
// latest menu/prices from the network.

self.addEventListener("install", function (event) {
  self.skipWaiting();
});

self.addEventListener("activate", function (event) {
  event.waitUntil(self.clients.claim());
});

// A push message arrives as JSON: { title, body, url, tag }
self.addEventListener("push", function (event) {
  var data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (e) {
    data = { title: "La Cabana Grill", body: event.data ? event.data.text() : "" };
  }

  var title = data.title || "La Cabana Grill";
  var options = {
    body: data.body || "",
    icon: "icon.png",
    badge: "icon.png",
    tag: data.tag || "la-cabana-general",
    data: { url: data.url || "/" }
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

// Tapping a notification focuses an already-open app tab if there is one,
// otherwise opens a new one.
self.addEventListener("notificationclick", function (event) {
  event.notification.close();
  var targetUrl = (event.notification.data && event.notification.data.url) || "/";

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(function (clientList) {
      for (var i = 0; i < clientList.length; i++) {
        var client = clientList[i];
        if ("focus" in client) {
          client.focus();
          if ("navigate" in client) client.navigate(targetUrl);
          return;
        }
      }
      if (self.clients.openWindow) return self.clients.openWindow(targetUrl);
    })
  );
});
