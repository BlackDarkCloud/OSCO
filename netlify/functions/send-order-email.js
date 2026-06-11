exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return response(405, { error: "Method not allowed" });
  }

  try {
    const { order } = JSON.parse(event.body || "{}");
    if (!order?.customer?.email || !order?.reference) {
      return response(400, { error: "Order customer email and reference are required." });
    }

    const payload = {
      to: order.customer.email,
      subject: `OSCO order update: ${order.reference}`,
      text: buildEmailText(order),
      order,
    };

    if (process.env.EMAIL_WEBHOOK_URL) {
      const emailResponse = await fetch(process.env.EMAIL_WEBHOOK_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(process.env.EMAIL_WEBHOOK_TOKEN
            ? { Authorization: `Bearer ${process.env.EMAIL_WEBHOOK_TOKEN}` }
            : {}),
        },
        body: JSON.stringify(payload),
      });

      if (!emailResponse.ok) {
        return response(emailResponse.status, { error: "Email webhook rejected the order update." });
      }
    }

    return response(200, { ok: true });
  } catch (error) {
    return response(500, { error: error.message || "Unable to send order update." });
  }
};

function buildEmailText(order) {
  const total = order.total_ghs ?? order.total;
  const items = order.order_items || order.items || [];
  const lines = [
    `Hi ${order.customer_name || order.customer?.name || "there"},`,
    "",
    `Your OSCO order ${order.reference} is now ${order.status}.`,
    `Total: GHS ${total}`,
    "",
    "Items:",
    ...items.map((item) => `- ${item.name} x ${item.quantity || item.qty}`),
    "",
    "Power From Beyond.",
    "OSCO",
  ];
  return lines.join("\n");
}

function response(statusCode, body) {
  return {
    statusCode,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  };
}
