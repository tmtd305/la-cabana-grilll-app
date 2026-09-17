// Saves (or updates, or removes) one customer's push subscription and
// their chosen notification categories. Called from the app whenever
// someone turns notifications on, or flips a category toggle.
//
// Storage: a single Redis hash called "subs" in Vercel KV, keyed by the
// push subscription's unique endpoint URL. Each value is a small JSON
// blob: { keys: {p256dh, auth}, categories: {...}, updatedAt }.

const { kv } = require("@vercel/kv");

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).send("Method not allowed");
    return;
  }

  try {
    const body = req.body || {};
    const subscription = body.subscription;
    const categories = body.categories || {};
    const unsubscribe = !!body.unsubscribe;

    if (!subscription || !subscription.endpoint) {
      res.status(400).json({ error: "Missing subscription." });
      return;
    }

    if (unsubscribe) {
      await kv.hdel("subs", subscription.endpoint);
      res.status(200).json({ ok: true, removed: true });
      return;
    }

    await kv.hset("subs", {
      [subscription.endpoint]: JSON.stringify({
        keys: subscription.keys,
        categories: categories,
        updatedAt: Date.now()
      })
    });

    res.status(200).json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not save subscription." });
  }
};
