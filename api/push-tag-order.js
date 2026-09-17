// Remembers which push subscription belongs to which order number, for a
// short window, so the "Order ready" button in the admin page can notify
// exactly the customer who placed that order (not a broadcast).
//
// Called automatically right when a customer taps "Send order" / "Pay
// Now", if they have notifications turned on.

const { kv } = require("@vercel/kv");

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).send("Method not allowed");
    return;
  }

  try {
    const { endpoint, orderNo } = req.body || {};
    if (!endpoint || !orderNo) {
      res.status(400).json({ error: "Missing endpoint or orderNo." });
      return;
    }

    // Expires after 12 hours — an order number is only useful same-day.
    await kv.set("order:" + String(orderNo), endpoint, { ex: 60 * 60 * 12 });

    res.status(200).json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not tag order." });
  }
};
