// La Cabana Grill — Square checkout redirector.
//
// The customer's browser is sent HERE (a normal link/redirect, not a
// fetch call) with the order total in the URL. This function then talks
// to Square's server-to-server API using your SECRET access token
// (kept safely as an environment variable here, never in the app itself)
// to create a real, Square-hosted payment page, and bounces the
// customer straight to it. Square handles the actual card entry /
// Apple Pay / Google Pay — this code never touches card details.
//
// After paying, Square sends the customer back to the app with
// ?paid=1&order=<order number> in the URL so the app can show a
// confirmation.

module.exports = async function handler(req, res) {
  try {
    const { amount, order, name } = req.query;

    const cents = Math.round(parseFloat(amount) * 100);
    if (!cents || cents <= 0) {
      res.status(400).send("Invalid order amount.");
      return;
    }

    const accessToken = process.env.SQUARE_ACCESS_TOKEN;
    const locationId = process.env.SQUARE_LOCATION_ID;
    const appReturnUrl =
      process.env.APP_RETURN_URL ||
      "https://la-cabana-app-q18v.vercel.app";

    if (!accessToken || !locationId) {
      res.status(500).send(
        "Payment setup is incomplete (missing SQUARE_ACCESS_TOKEN or SQUARE_LOCATION_ID)."
      );
      return;
    }

    const orderLabel = order ? String(order).slice(0, 40) : "order";
    const idempotencyKey = "cabana-" + orderLabel + "-" + Date.now();

    const body = {
      idempotency_key: idempotencyKey,
      quick_pay: {
        name: "La Cabana Grill " + orderLabel + (name ? " — " + name : ""),
        price_money: {
          amount: cents,
          currency: "USD"
        },
        location_id: locationId
      },
      checkout_options: {
        redirect_url:
          appReturnUrl + "?paid=1&order=" + encodeURIComponent(order || "")
      }
    };

    const squareRes = await fetch(
      "https://connect.squareup.com/v2/online-checkout/payment-links",
      {
        method: "POST",
        headers: {
          "Square-Version": "2024-01-18",
          Authorization: "Bearer " + accessToken,
          "Content-Type": "application/json"
        },
        body: JSON.stringify(body)
      }
    );

    const data = await squareRes.json();

    if (!squareRes.ok) {
      console.error("Square error:", JSON.stringify(data));
      res
        .status(502)
        .send(
          "Could not start checkout with Square. Please try again, or contact the restaurant directly."
        );
      return;
    }

    const checkoutUrl = data.payment_link && data.payment_link.url;
    if (!checkoutUrl) {
      res.status(502).send("Could not start checkout.");
      return;
    }

    res.writeHead(302, { Location: checkoutUrl });
    res.end();
  } catch (err) {
    console.error(err);
    res.status(500).send("Something went wrong starting checkout.");
  }
};
