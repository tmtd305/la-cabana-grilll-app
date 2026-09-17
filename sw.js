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

  var title = data.title || "La Cabaña Grill";
  var options = {
    body: data.body || "",
    icon: "icon.png",
    badge: "icon.png",
    tag: data.tag || "la-cabana-general",
    data: { url: data.url || "/" }
  };

  // Tell any open app window a real push arrived, so the Notificaciones
  // tab and the order-status screen can reflect it immediately instead of
  // only finding out the next time the OS-level notification is tapped.
  // tag looks like "order-1042" for an order-ready push, or
  // "cabana-<category>" for a category broadcast (see api/push-send.js).
  function notifyClients() {
    return self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(function (clientList) {
      var tag = data.tag || "";
      var msg;
      if (tag.indexOf("order-") === 0) {
        msg = { type: "orderReady", orderNo: tag.slice(6), title: title, body: data.body || "" };
      } else {
        msg = { type: "push", title: title, body: data.body || "", category: tag.replace(/^cabana-/, "") };
      }
      clientList.forEach(function (client) { client.postMessage(msg); });
    });
  }

  event.waitUntil(
    Promise.all([self.registration.showNotification(title, options), notifyClients()])
  );
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
