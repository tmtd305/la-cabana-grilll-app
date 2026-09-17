// Sends a push notification. Used by admin.html, La Cabana Grill's
// private sending page. Two modes:
//
//   1. Category broadcast — { secret, title, body, category }
//      Sends to every subscriber who has that category turned on.
//      category is one of: order_ready, specials, membership, new_items,
//      winback  (or "all" to ignore the category filter entirely).
//
//   2. Single order — { secret, title, body, orderNo }
//      Sends only to the one customer who placed that order number
//      (see api/push-tag-order.js), regardless of their category
//      settings, since this is a direct reply to their own order.
//
// Protected by a shared secret (ADMIN_SECRET env var) so only Diego's
// admin page can trigger a send.

const webpush = require("web-push");
const { kv } = require("@vercel/kv");

webpush.setVapidDetails(
  "mailto:tmtd305@gmail.com",
  process.env.VAPID_PUBLIC_KEY,
  process.env.VAPID_PRIVATE_KEY
);

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).send("Method not allowed");
    return;
  }

  try {
    const { secret, title, body, category, orderNo, url } = req.body || {};

    if (!process.env.ADMIN_SECRET || secret !== process.env.ADMIN_SECRET) {
      res.status(401).json({ error: "Not authorized." });
      return;
    }
    if (!title || !body) {
      res.status(400).json({ error: "Missing title or body." });
      return;
    }
    if (!process.env.VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY) {
      res.status(500).json({ error: "Push isn't configured yet (missing VAPID keys)." });
      return;
    }

    const payload = JSON.stringify({
      title: title,
      body: body,
      url: url || "/",
      tag: orderNo ? "order-" + orderNo : "cabana-" + (category || "all")
    });

    var targets = []; // [{endpoint, keys}]

    if (orderNo) {
      const endpoint = await kv.get("order:" + String(orderNo));
      if (!endpoint) {
        res.status(404).json({ error: "No active subscriber found for that order number (it may have expired)." });
        return;
      }
      const raw = await kv.hget("subs", endpoint);
      if (raw) {
        const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
        targets.push({ endpoint: endpoint, keys: parsed.keys });
      }
    } else {
      const all = (await kv.hgetall("subs")) || {};
      Object.keys(all).forEach(function (endpoint) {
        const raw = all[endpoint];
        const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
        const cats = parsed.categories || {};
        if (category === "all" || !category || cats[category]) {
          targets.push({ endpoint: endpoint, keys: parsed.keys });
        }
      });
    }

    if (targets.length === 0) {
      res.status(200).json({ ok: true, sent: 0, message: "No matching subscribers." });
      return;
    }

    let sent = 0;
    let failed = 0;
    const deadEndpoints = [];

    await Promise.all(
      targets.map(async function (t) {
        try {
          await webpush.sendNotification(
            { endpoint: t.endpoint, keys: t.keys },
            payload
          );
          sent++;
        } catch (err) {
          failed++;
          // 404/410 = the browser unsubscribed on its own; clean it up.
          if (err && (err.statusCode === 404 || err.statusCode === 410)) {
            deadEndpoints.push(t.endpoint);
          } else {
            console.error("push send error:", err && err.message);
          }
        }
      })
    );

    if (deadEndpoints.length) {
      await kv.hdel("subs", ...deadEndpoints);
    }

    res.status(200).json({ ok: true, sent: sent, failed: failed, removedStale: deadEndpoints.length });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Something went wrong sending the notification." });
  }
};
