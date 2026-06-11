const crypto = require("crypto");

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return json(405, { error: "Method not allowed" });
  }

  const envError = requireEnv(["SUPABASE_SERVICE_ROLE_KEY", "PAYSTACK_SECRET_KEY"]);
  if (envError) return json(500, { error: envError });

  const signature = event.headers["x-paystack-signature"] || event.headers["X-Paystack-Signature"];
  const hash = crypto.createHmac("sha512", process.env.PAYSTACK_SECRET_KEY).update(event.body || "").digest("hex");
  if (hash !== signature) return json(401, { error: "Invalid signature." });

  const payload = JSON.parse(event.body || "{}");
  if (payload.event !== "charge.success") return json(200, { ok: true });

  const reference = payload.data?.reference;
  if (!reference) return json(400, { error: "Missing payment reference." });

  await supabaseRest(`/orders?reference=eq.${encodeURIComponent(reference)}`, {
    method: "PATCH",
    body: JSON.stringify({
      status: "paid",
      payment_reference: payload.data.reference,
    }),
  });

  return json(200, { ok: true });
};

function requireEnv(keys) {
  const missing = keys.filter((key) => !process.env[key]);
  return missing.length ? `Missing environment variables: ${missing.join(", ")}` : "";
}

async function supabaseRest(path, options = {}) {
  const response = await fetch(`${supabaseUrl()}/rest/v1${path}`, {
    method: options.method || "GET",
    headers: {
      apikey: process.env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
    body: options.body,
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(body || "Supabase request failed.");
  }

  return response;
}

function supabaseUrl() {
  return "https://rwyvfknkafidiowkgath.supabase.co";
}

function json(statusCode, body) {
  return {
    statusCode,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  };
}
