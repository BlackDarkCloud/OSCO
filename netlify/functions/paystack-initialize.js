exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return json(405, { error: "Method not allowed" });
  }

  const envError = requireEnv(["SUPABASE_SERVICE_ROLE_KEY", "PAYSTACK_SECRET_KEY"]);
  if (envError) return json(500, { error: envError });

  const accessToken = readBearerToken(event.headers.authorization || event.headers.Authorization);
  if (!accessToken) return json(401, { error: "Sign in before checkout." });

  try {
    const user = await getSupabaseUser(accessToken);
    const { customer, items, promo_code } = JSON.parse(event.body || "{}");

    if (!customer?.name || !customer?.phone || !customer?.address) {
      return json(400, { error: "Name, phone and delivery address are required." });
    }

    if (!Array.isArray(items) || !items.length) {
      return json(400, { error: "Cart is empty." });
    }

    const productIds = [...new Set(items.map((item) => item.product_id).filter(Boolean))];
    const products = await fetchProducts(productIds);
    const productMap = new Map(products.map((product) => [product.id, product]));

    const orderItems = items.map((item) => {
      const product = productMap.get(item.product_id);
      const quantity = Number(item.quantity);
      if (!product || !product.active || !Number.isInteger(quantity) || quantity < 1) {
        throw new CheckoutError("Cart contains an unavailable product.");
      }
      return {
        product_id: product.id,
        name: product.name,
        price_ghs: productPrice(product),
        quantity,
      };
    });

    const subtotal = orderItems.reduce((sum, item) => sum + item.price_ghs * item.quantity, 0);
    const promo = promo_code ? await fetchPromoCode(promo_code) : null;
    const discount = promo ? promoDiscount(promo, subtotal) : 0;
    const total = Math.max(0, subtotal - discount);
    const reference = `OSCO-${Date.now()}-${user.id.slice(0, 8)}`;
    const order = await createOrder({
      user,
      customer,
      reference,
      total,
      discount,
      promoCode: promo?.code || null,
    });
    await createOrderItems(order.id, orderItems);

    const paystack = await initializePaystack({
      email: user.email,
      amount: total,
      reference,
      orderId: order.id,
      customer,
      orderItems,
    });

    await updateOrder(order.id, {
      payment_access_code: paystack.access_code,
      payment_authorization_url: paystack.authorization_url,
    });

    return json(200, {
      order_id: order.id,
      reference,
      authorization_url: paystack.authorization_url,
      access_code: paystack.access_code,
    });
  } catch (error) {
    const status = error instanceof CheckoutError ? 400 : 500;
    return json(status, { error: error.message || "Unable to initialize checkout." });
  }
};

class CheckoutError extends Error {}

function requireEnv(keys) {
  const missing = keys.filter((key) => !process.env[key]);
  return missing.length ? `Missing environment variables: ${missing.join(", ")}` : "";
}

function readBearerToken(value = "") {
  const match = value.match(/^Bearer\s+(.+)$/i);
  return match?.[1] || "";
}

async function getSupabaseUser(accessToken) {
  const response = await fetch(`${supabaseUrl()}/auth/v1/user`, {
    headers: {
      apikey: process.env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) throw new CheckoutError("Sign in before checkout.");
  return response.json();
}

async function fetchProducts(productIds) {
  const params = productIds.map(encodeURIComponent).join(",");
  const response = await supabaseRest(`/products?select=id,name,price_ghs,active,discount_active,discount_percent&id=in.(${params})`);
  return response.json();
}

async function fetchPromoCode(code) {
  const response = await supabaseRest(`/promo_codes?select=code,discount_type,discount_value,min_order_ghs,active&code=eq.${encodeURIComponent(String(code).toUpperCase())}&active=eq.true`);
  const rows = await response.json();
  return rows[0] || null;
}

function productPrice(product) {
  const base = Number(product.price_ghs || 0);
  if (!product.discount_active || Number(product.discount_percent || 0) <= 0) return base;
  return Math.max(0, base - base * (Math.min(Number(product.discount_percent), 95) / 100));
}

function promoDiscount(promo, subtotal) {
  if (Number(promo.min_order_ghs || 0) > subtotal) return 0;
  const value = Number(promo.discount_value || 0);
  if (promo.discount_type === "fixed") return Math.min(subtotal, value);
  return Math.min(subtotal, subtotal * (Math.min(value, 95) / 100));
}

async function createOrder({ user, customer, reference, total, discount, promoCode }) {
  const response = await supabaseRest("/orders", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({
      user_id: user.id,
      reference,
      status: "pending_payment",
      total_ghs: total,
      discount_ghs: discount,
      promo_code: promoCode,
      customer_name: customer.name,
      customer_email: user.email,
      customer_phone: customer.phone,
      delivery_address: customer.address,
    }),
  });
  const rows = await response.json();
  return rows[0];
}

async function createOrderItems(orderId, items) {
  await supabaseRest("/order_items", {
    method: "POST",
    body: JSON.stringify(items.map((item) => ({ ...item, order_id: orderId }))),
  });
}

async function updateOrder(orderId, patch) {
  await supabaseRest(`/orders?id=eq.${orderId}`, {
    method: "PATCH",
    body: JSON.stringify(patch),
  });
}

async function initializePaystack({ email, amount, reference, orderId, customer, orderItems }) {
  const response = await fetch("https://api.paystack.co/transaction/initialize", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      email,
      amount: Math.round(Number(amount) * 100),
      currency: "GHS",
      reference,
      callback_url: process.env.PAYSTACK_CALLBACK_URL || undefined,
      metadata: {
        order_id: orderId,
        delivery_address: customer.address,
        phone: customer.phone,
        items: orderItems,
      },
    }),
  });
  const data = await response.json();
  if (!response.ok || !data.status) {
    throw new Error(data.message || "Paystack request failed.");
  }
  return data.data;
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
