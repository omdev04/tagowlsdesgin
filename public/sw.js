self.addEventListener("push", (event) => {
  let payload = {
    title: "Meeting invite",
    body: "A meeting has started. Tap to open app.",
    url: "/documents",
    tag: "meet-invite",
  };

  try {
    const data = event.data ? event.data.json() : null;
    if (data && typeof data === "object") {
      payload = {
        ...payload,
        ...data,
      };
    }
  } catch {
    // Ignore malformed payload and use safe defaults.
  }

  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      icon: "/logo.svg",
      badge: "/logo.svg",
      tag: payload.tag,
      renotify: true,
      data: {
        url: payload.url || "/documents",
      },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const rawUrl = event.notification?.data?.url;
  const targetUrl = typeof rawUrl === "string" && rawUrl.trim() ? rawUrl : "/documents";

  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((windowClients) => {
      for (const client of windowClients) {
        if ("focus" in client) {
          client.focus();
          if ("navigate" in client) {
            return client.navigate(targetUrl);
          }
          return undefined;
        }
      }

      if (clients.openWindow) {
        return clients.openWindow(targetUrl);
      }

      return undefined;
    }),
  );
});
