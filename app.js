const money = new Intl.NumberFormat("en-GH", {
  style: "currency",
  currency: "GHS",
  maximumFractionDigits: 0,
});

const page = document.body.dataset.page;
const cartKey = "osco.cart";
const config = window.OSCO_CONFIG || {};
const supabaseClient = window.supabase && config.supabaseUrl && config.supabaseAnonKey
  ? window.supabase.createClient(config.supabaseUrl, config.supabaseAnonKey)
  : null;

let state = {
  session: null,
  profile: null,
  products: [],
  banners: [],
  gallery: [],
  promoCodes: [],
  orders: [],
  staff: [],
  cart: loadCart(),
  appliedPromo: null,
  logoTapCount: 0,
  logoTapTimer: null,
  shuttleIndex: 0,
  shuttleTimer: null,
};

const qs = (selector) => document.querySelector(selector);
const qsa = (selector) => [...document.querySelectorAll(selector)];

function loadCart() {
  try {
    return JSON.parse(localStorage.getItem(cartKey)) || [];
  } catch {
    return [];
  }
}

function saveCart() {
  localStorage.setItem(cartKey, JSON.stringify(state.cart));
}

async function init() {
  if (!supabaseClient) {
    renderUnavailable();
    return;
  }

  const { data } = await supabaseClient.auth.getSession();
  state.session = data.session;
  await refreshProfile();

  if (page === "admin") {
    bindAdminEvents();
    await loadAdminData();
    renderAdminGate();
    return;
  }

  bindShopEvents();
  await Promise.all([loadProducts(), loadBanners(), loadGallery(), loadPromoCodes()]);
  renderShop();
  startHeroShuttle();

  supabaseClient.auth.onAuthStateChange(async (_event, session) => {
    state.session = session;
    await refreshProfile();
    renderAuth();
    renderCart();
  });
}

function renderUnavailable() {
  qsa(".product-grid").forEach((grid) => {
    grid.innerHTML = `<div class="empty-state">The shop is being prepared.</div>`;
  });
}

async function refreshProfile() {
  if (!state.session) {
    state.profile = null;
    return;
  }

  const { data, error } = await supabaseClient
    .from("profiles")
    .select("id, email, full_name, phone, role")
    .eq("id", state.session.user.id)
    .maybeSingle();

  if (error) console.warn(error.message);
  state.profile = data || null;
}

async function loadProducts() {
  let query = supabaseClient
    .from("products")
    .select("id, name, price_ghs, section, sizes, description, image_url, active, sort_order, discount_active, discount_percent")
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: false });

  if (page !== "admin") query = query.eq("active", true);
  const { data, error } = await query;

  if (error) {
    console.warn(error.message);
    state.products = [];
    return;
  }
  state.products = data || [];
}

async function loadBanners() {
  let query = supabaseClient
    .from("banners")
    .select("id, placement, body, active")
    .order("updated_at", { ascending: false });

  if (page !== "admin") query = query.eq("active", true);
  const { data, error } = await query;

  if (error) {
    console.warn(error.message);
    state.banners = [];
    return;
  }
  state.banners = data || [];
}

async function loadGallery() {
  let query = supabaseClient
    .from("gallery_images")
    .select("id, title, caption, image_url, active, sort_order")
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: false });

  if (page !== "admin") query = query.eq("active", true);
  const { data, error } = await query;

  if (error) {
    console.warn(error.message);
    state.gallery = [];
    return;
  }
  state.gallery = data || [];
}

async function loadPromoCodes() {
  let query = supabaseClient
    .from("promo_codes")
    .select("id, code, discount_type, discount_value, min_order_ghs, active")
    .order("created_at", { ascending: false });

  if (page !== "admin") query = query.eq("active", true);
  const { data, error } = await query;

  if (error) {
    console.warn(error.message);
    state.promoCodes = [];
    return;
  }
  state.promoCodes = data || [];
}

async function loadOrders() {
  if (!state.session) {
    state.orders = [];
    return;
  }

  const { data, error } = await supabaseClient
    .from("orders")
    .select("id, reference, status, total_ghs, discount_ghs, promo_code, customer_name, customer_email, customer_phone, delivery_address, created_at, order_items(name, price_ghs, quantity)")
    .order("created_at", { ascending: false });

  if (error) {
    console.warn(error.message);
    state.orders = [];
    return;
  }
  state.orders = data || [];
}

async function loadStaff() {
  if (!state.session) {
    state.staff = [];
    return;
  }

  const { data, error } = await supabaseClient
    .from("profiles")
    .select("id, email, full_name, phone, role")
    .in("role", ["admin", "staff"])
    .order("created_at", { ascending: false });

  if (error) {
    console.warn(error.message);
    state.staff = [];
    return;
  }
  state.staff = data || [];
}

async function loadAdminData() {
  if (!isStaff()) return;
  await Promise.all([loadProducts(), loadBanners(), loadGallery(), loadPromoCodes(), loadOrders(), loadStaff()]);
}

function renderShop() {
  renderBanners();
  renderProducts();
  renderGallery();
  renderHeroShuttle();
  renderAuth();
  renderCart();
}

function renderBanners() {
  const noticeBar = qs("#noticeBar");
  const promoStrip = qs("#promoStrip");
  if (!noticeBar || !promoStrip) return;

  const notification = state.banners.find((banner) => banner.placement === "notification");
  const promos = state.banners.filter((banner) => banner.placement === "promo");
  noticeBar.textContent = notification?.body || "";
  noticeBar.classList.toggle("active", Boolean(notification?.body));

  promoStrip.innerHTML = "";
  promoStrip.style.display = promos.length ? "grid" : "none";
  promos.slice(0, 3).forEach((banner) => {
    const item = document.createElement("div");
    item.className = "promo-card";
    item.textContent = banner.body;
    promoStrip.append(item);
  });
}

function renderProducts() {
  qsa(".product-grid").forEach((grid) => {
    const products = state.products.filter((product) => product.section === grid.dataset.section);
    grid.innerHTML = products.length
      ? products.map(productCard).join("")
      : `<div class="empty-state">No pieces have been added here yet.</div>`;
  });
}

function productCard(product) {
  const sale = isProductDiscounted(product);
  return `
    <article class="product-card">
      <div class="product-image">
        ${sale ? `<span class="sale-badge">${Number(product.discount_percent)}% off</span>` : ""}
        <img src="${escapeAttr(product.image_url || "assets/osco-logo-mark.png")}" alt="${escapeAttr(product.name)}" loading="lazy" />
      </div>
      <div class="product-info">
        <div class="product-row">
          <h3>${escapeHtml(product.name)}</h3>
          <span class="price">
            ${sale ? `<s>${money.format(Number(product.price_ghs))}</s>` : ""}
            ${money.format(productPrice(product))}
          </span>
        </div>
        <div class="product-meta">${escapeHtml(formatSizes(product.sizes))}</div>
        <p class="product-description">${escapeHtml(product.description || "")}</p>
      </div>
      <button type="button" data-add-to-cart="${product.id}">Add to cart</button>
    </article>
  `;
}

function renderGallery() {
  const grid = qs("#lookbookGrid");
  if (!grid) return;

  const productGallery = state.products
    .filter((product) => product.image_url)
    .slice(0, 8)
    .map((product) => ({
      title: product.name,
      caption: "Available piece",
      image_url: product.image_url,
    }));
  const images = [...state.gallery, ...productGallery].filter((item) => item.image_url);

  grid.innerHTML = images.length
    ? images.slice(0, 12).map((item, index) => `
      <article class="lookbook-card ${index % 5 === 0 ? "wide" : ""}">
        <img src="${escapeAttr(item.image_url)}" alt="${escapeAttr(item.title || "OSCO gallery image")}" loading="lazy" />
        <div>
          <h3>${escapeHtml(item.title || "OSCO")}</h3>
          <p>${escapeHtml(item.caption || "Power From Beyond")}</p>
        </div>
      </article>
    `).join("")
    : `<div class="empty-state">Gallery images will appear here after the first upload.</div>`;
}

function shuttleItems() {
  const gallery = state.gallery
    .filter((item) => item.image_url)
    .map((item) => ({ label: item.title || "Lookbook", image: item.image_url }));
  const products = state.products
    .filter((item) => item.image_url)
    .map((item) => ({ label: item.name, image: item.image_url }));
  return [...products, ...gallery];
}

function renderHeroShuttle() {
  const image = qs("#heroShuttleImage");
  const label = qs("#heroShuttleLabel");
  const count = qs("#heroShuttleCount");
  if (!image || !label || !count) return;

  const items = shuttleItems();
  if (!items.length) {
    image.src = "assets/osco-logo-full.jpeg";
    label.textContent = "OSCO archive";
    count.textContent = "01";
    return;
  }

  const current = items[state.shuttleIndex % items.length];
  image.src = current.image;
  label.textContent = current.label;
  count.textContent = String((state.shuttleIndex % items.length) + 1).padStart(2, "0");
}

function startHeroShuttle() {
  window.clearInterval(state.shuttleTimer);
  state.shuttleTimer = window.setInterval(() => {
    const items = shuttleItems();
    if (!items.length) return;
    state.shuttleIndex = (state.shuttleIndex + 1) % items.length;
    renderHeroShuttle();
  }, 4200);
}

function renderAuth() {
  const signedIn = qs("#signedIn");
  const authForm = qs("#authForm");
  const accountName = qs("#accountName");
  const checkoutIdentity = qs("#checkoutIdentity");
  if (!signedIn || !authForm) return;

  signedIn.classList.toggle("hidden", !state.session);
  authForm.classList.toggle("hidden", Boolean(state.session));
  if (state.session) {
    const name = state.profile?.full_name || state.session.user.email;
    accountName.textContent = name;
    if (checkoutIdentity) checkoutIdentity.textContent = `Signed in as ${state.session.user.email}`;
    setValue("#customerEmail", state.session.user.email || "");
    setValue("#customerName", state.profile?.full_name || "");
    setValue("#customerPhone", state.profile?.phone || "");
  } else if (checkoutIdentity) {
    checkoutIdentity.textContent = "Sign in before checkout.";
  }
}

function renderCart() {
  const count = state.cart.reduce((sum, item) => sum + item.quantity, 0);
  const countEl = qs("#cartCount");
  const container = qs("#cartItems");
  if (countEl) countEl.textContent = count;
  if (!container) return;

  if (!state.cart.length) {
    container.innerHTML = `<div class="empty-state">Your cart is ready when you are.</div>`;
    renderPromoMessage();
    return;
  }

  const subtotal = cartSubtotal();
  const discount = promoDiscount(subtotal);
  container.innerHTML = `
    ${state.cart.map(cartLine).join("")}
    <div class="cart-line"><strong>Subtotal</strong><strong>${money.format(subtotal)}</strong></div>
    ${discount > 0 ? `<div class="cart-line"><strong>${escapeHtml(state.appliedPromo.code)}</strong><strong>-${money.format(discount)}</strong></div>` : ""}
    <div class="cart-line"><strong>Total</strong><strong>${money.format(Math.max(0, subtotal - discount))}</strong></div>
  `;
  renderPromoMessage();
}

function cartLine(item) {
  const product = state.products.find((entry) => entry.id === item.product_id);
  if (!product) return "";
  return `
    <div class="cart-line">
      <div>
        <strong>${escapeHtml(product.name)}</strong>
        <div class="product-meta">${money.format(productPrice(product))} x ${item.quantity}</div>
      </div>
      <div class="cart-line-controls">
        <button type="button" data-cart-minus="${item.product_id}">-</button>
        <span>${item.quantity}</span>
        <button type="button" data-cart-plus="${item.product_id}">+</button>
      </div>
    </div>
  `;
}

function addToCart(productId) {
  const product = state.products.find((entry) => entry.id === productId);
  if (!product) return;
  const existing = state.cart.find((item) => item.product_id === productId);
  if (existing) existing.quantity += 1;
  else state.cart.push({ product_id: productId, quantity: 1 });
  saveCart();
  renderCart();
  openCart();
}

function updateCart(productId, delta) {
  state.cart = state.cart
    .map((item) => (item.product_id === productId ? { ...item, quantity: item.quantity + delta } : item))
    .filter((item) => item.quantity > 0);
  saveCart();
  renderCart();
}

function cartSubtotal() {
  return state.cart.reduce((sum, item) => {
    const product = state.products.find((entry) => entry.id === item.product_id);
    return sum + (product ? productPrice(product) * item.quantity : 0);
  }, 0);
}

function applyPromoCode() {
  const code = value("#promoCodeInput").toUpperCase();
  const promo = state.promoCodes.find((item) => item.code.toUpperCase() === code && item.active);
  if (!promo) {
    state.appliedPromo = null;
    setText("#promoMessage", "Promo code not found.");
    renderCart();
    return;
  }

  const subtotal = cartSubtotal();
  if (Number(promo.min_order_ghs || 0) > subtotal) {
    state.appliedPromo = null;
    setText("#promoMessage", `Minimum order is ${money.format(Number(promo.min_order_ghs))}.`);
    renderCart();
    return;
  }

  state.appliedPromo = promo;
  renderCart();
}

function promoDiscount(subtotal) {
  if (!state.appliedPromo) return 0;
  if (Number(state.appliedPromo.min_order_ghs || 0) > subtotal) return 0;
  const value = Number(state.appliedPromo.discount_value || 0);
  if (state.appliedPromo.discount_type === "fixed") return Math.min(subtotal, value);
  return Math.min(subtotal, subtotal * (Math.min(value, 95) / 100));
}

function renderPromoMessage() {
  if (!qs("#promoMessage") || !state.appliedPromo) return;
  setText("#promoMessage", `${state.appliedPromo.code} applied.`);
}

function isProductDiscounted(product) {
  return Boolean(product.discount_active && Number(product.discount_percent) > 0);
}

function productPrice(product) {
  const base = Number(product.price_ghs || 0);
  if (!isProductDiscounted(product)) return base;
  return Math.max(0, base - base * (Math.min(Number(product.discount_percent), 95) / 100));
}

function openCart() {
  qs("#cartPanel")?.classList.add("open");
  qs("#cartPanel")?.setAttribute("aria-hidden", "false");
}

function closeCart() {
  qs("#cartPanel")?.classList.remove("open");
  qs("#cartPanel")?.setAttribute("aria-hidden", "true");
}

function openAuth() {
  qs("#authModal")?.classList.remove("hidden");
  qs("#authModal")?.setAttribute("aria-hidden", "false");
}

function closeAuth() {
  qs("#authModal")?.classList.add("hidden");
  qs("#authModal")?.setAttribute("aria-hidden", "true");
}

async function signUp(event) {
  event.preventDefault();
  const { error } = await supabaseClient.auth.signUp({
    email: value("#authEmail"),
    password: value("#authPassword"),
    options: {
      emailRedirectTo: `${window.location.origin}/`,
      data: {
        full_name: value("#authName"),
        phone: value("#authPhone"),
      },
    },
  });
  setText("#authMessage", error ? error.message : "Account created. Check your email to confirm it.");
}

async function signIn(event) {
  event.preventDefault();
  const { error } = await supabaseClient.auth.signInWithPassword({
    email: value("#authEmail"),
    password: value("#authPassword"),
  });
  setText("#authMessage", error ? error.message : "Signed in.");
}

async function signOut() {
  await supabaseClient.auth.signOut();
  state.session = null;
  state.profile = null;
  renderAuth();
}

async function checkout(event) {
  event.preventDefault();
  const message = qs("#checkoutMessage");
  if (!state.session) {
    message.textContent = "Sign in before checkout.";
    openAuth();
    return;
  }
  if (!state.cart.length) {
    message.textContent = "Add at least one item before checkout.";
    return;
  }

  message.textContent = "Preparing secure checkout...";
  const response = await fetch("/api/paystack-initialize", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${state.session.access_token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      customer: {
        name: value("#customerName"),
        email: state.session.user.email,
        phone: value("#customerPhone"),
        address: value("#customerAddress"),
      },
      items: state.cart,
      promo_code: state.appliedPromo?.code || null,
    }),
  });
  const result = await response.json();
  if (!response.ok || !result.authorization_url) {
    message.textContent = result.error || "Unable to start checkout.";
    return;
  }
  state.cart = [];
  state.appliedPromo = null;
  saveCart();
  window.location.href = result.authorization_url;
}

function bindShopEvents() {
  qs(".brand")?.addEventListener("click", handleLogoTap);
  qs("#accountOpen")?.addEventListener("click", openAuth);
  qs("#authClose")?.addEventListener("click", closeAuth);
  qs("#cartToggle")?.addEventListener("click", openCart);
  qs("#cartClose")?.addEventListener("click", closeCart);
  qs("#authForm")?.addEventListener("submit", signIn);
  qs("#authSignUp")?.addEventListener("click", signUp);
  qs("#signOut")?.addEventListener("click", signOut);
  qs("#checkoutForm")?.addEventListener("submit", checkout);
  qs("#promoApply")?.addEventListener("click", applyPromoCode);

  document.addEventListener("click", (event) => {
    const addId = event.target.closest("[data-add-to-cart]")?.dataset.addToCart;
    if (addId) addToCart(addId);
    const minusId = event.target.closest("[data-cart-minus]")?.dataset.cartMinus;
    if (minusId) updateCart(minusId, -1);
    const plusId = event.target.closest("[data-cart-plus]")?.dataset.cartPlus;
    if (plusId) updateCart(plusId, 1);
  });
}

function handleLogoTap(event) {
  event.preventDefault();
  state.logoTapCount += 1;
  window.clearTimeout(state.logoTapTimer);
  state.logoTapTimer = window.setTimeout(() => {
    state.logoTapCount = 0;
  }, 900);
  if (state.logoTapCount >= 3) window.location.href = "/admin.html";
}

function isStaff() {
  return ["admin", "staff"].includes(state.profile?.role);
}

function isOwner() {
  return state.profile?.role === "admin";
}

function renderAdminGate() {
  const login = qs("#adminLogin");
  const consoleEl = qs("#adminConsole");
  if (!login || !consoleEl) return;
  const allowed = isStaff();
  login.classList.toggle("hidden", allowed);
  consoleEl.classList.toggle("hidden", !allowed);
  if (allowed) renderAdmin();
}

function renderAdmin() {
  renderAdminProducts();
  renderAdminGallery();
  renderAdminPromos();
  renderAdminBanners();
  renderAdminOrders();
  renderAdminStaff();
}

async function adminSignIn(event) {
  event.preventDefault();
  const { data, error } = await supabaseClient.auth.signInWithPassword({
    email: value("#adminEmail"),
    password: value("#adminPassword"),
  });
  if (error) {
    setText("#adminAccessMessage", "Unable to sign in.");
    return;
  }
  state.session = data.session;
  await refreshProfile();
  if (!isStaff()) {
    setText("#adminAccessMessage", "This account does not have access.");
    return;
  }
  await loadAdminData();
  renderAdminGate();
}

async function adminSignOut() {
  await supabaseClient.auth.signOut();
  state.session = null;
  state.profile = null;
  renderAdminGate();
}

function renderAdminProducts() {
  const list = qs("#adminProductList");
  if (!list) return;
  list.innerHTML = state.products.length
    ? state.products.map((product) => `
      <article class="admin-item">
        <div class="product-row">
          <div>
            <h3>${escapeHtml(product.name)}</h3>
            <div class="product-meta">
              ${escapeHtml(labelForSection(product.section))} |
              ${product.active ? "Active" : "Hidden"} |
              ${isProductDiscounted(product) ? `${Number(product.discount_percent)}% off` : "No discount"}
            </div>
          </div>
          <strong>${money.format(productPrice(product))}</strong>
        </div>
        <p class="product-description">${escapeHtml(product.description || "")}</p>
        <div class="admin-item-actions">
          <button type="button" data-edit-product="${product.id}">Edit</button>
          <button class="danger-button" type="button" data-delete-product="${product.id}">Archive</button>
        </div>
      </article>
    `).join("")
    : `<div class="empty-state">No products yet.</div>`;
}

function renderAdminGallery() {
  const list = qs("#adminGalleryList");
  if (!list) return;
  list.innerHTML = state.gallery.length
    ? state.gallery.map((item) => `
      <article class="admin-item media-admin-item">
        <img src="${escapeAttr(item.image_url || "assets/osco-logo-mark.png")}" alt="" />
        <div>
          <h3>${escapeHtml(item.title || "Untitled image")}</h3>
          <div class="product-meta">${item.active ? "Active" : "Hidden"} | Sort ${Number(item.sort_order || 0)}</div>
          <p class="product-description">${escapeHtml(item.caption || "")}</p>
          <div class="admin-item-actions">
            <button type="button" data-edit-gallery="${item.id}">Edit</button>
            <button class="danger-button" type="button" data-delete-gallery="${item.id}">Remove</button>
          </div>
        </div>
      </article>
    `).join("")
    : `<div class="empty-state">No gallery images yet.</div>`;
}

function renderAdminPromos() {
  const list = qs("#adminPromoList");
  if (!list) return;
  list.innerHTML = state.promoCodes.length
    ? state.promoCodes.map((promo) => `
      <article class="admin-item">
        <div class="product-row">
          <div>
            <h3>${escapeHtml(promo.code)}</h3>
            <div class="product-meta">${promo.active ? "Active" : "Hidden"} | ${escapeHtml(labelForPromo(promo))}</div>
          </div>
        </div>
        <div class="admin-item-actions">
          <button type="button" data-edit-promo="${promo.id}">Edit</button>
          <button class="danger-button" type="button" data-delete-promo="${promo.id}">Remove</button>
        </div>
      </article>
    `).join("")
    : `<div class="empty-state">No promo codes yet.</div>`;
}

function renderAdminBanners() {
  const list = qs("#adminBannerList");
  if (!list) return;
  list.innerHTML = state.banners.length
    ? state.banners.map((banner) => `
      <article class="admin-item">
        <div class="product-row">
          <h3>${escapeHtml(labelForPlacement(banner.placement))}</h3>
          <span class="product-meta">${banner.active ? "Active" : "Hidden"}</span>
        </div>
        <p>${escapeHtml(banner.body)}</p>
        <div class="admin-item-actions">
          <button type="button" data-edit-banner="${banner.id}">Edit</button>
          <button class="danger-button" type="button" data-delete-banner="${banner.id}">Remove</button>
        </div>
      </article>
    `).join("")
    : `<div class="empty-state">No banners yet.</div>`;
}

function renderAdminOrders() {
  const list = qs("#adminOrderList");
  if (!list) return;
  list.innerHTML = state.orders.length
    ? state.orders.map((order) => `
      <article class="admin-item">
        <div class="product-row">
          <div>
            <h3>${escapeHtml(order.reference)}</h3>
            <div class="product-meta">${new Date(order.created_at).toLocaleString()} | ${escapeHtml(order.status)}</div>
          </div>
          <strong>${money.format(Number(order.total_ghs))}</strong>
        </div>
        <p class="product-description">${escapeHtml(order.customer_name)} | ${escapeHtml(order.customer_email)} | ${escapeHtml(order.customer_phone || "")}</p>
        <p class="product-description">${escapeHtml(order.delivery_address || "")}</p>
        ${order.promo_code ? `<p class="product-description">Promo: ${escapeHtml(order.promo_code)} / Discount: ${money.format(Number(order.discount_ghs || 0))}</p>` : ""}
        <div>${(order.order_items || []).map((item) => `<span>${escapeHtml(item.name)} x ${item.quantity}</span>`).join("<br />")}</div>
        <div class="admin-item-actions">
          <button type="button" data-order-status="${order.id}" data-status="paid">Paid</button>
          <button type="button" data-order-status="${order.id}" data-status="processing">Processing</button>
          <button type="button" data-order-status="${order.id}" data-status="shipped">Shipped</button>
          <button type="button" data-order-status="${order.id}" data-status="fulfilled">Fulfilled</button>
          <button class="danger-button" type="button" data-order-status="${order.id}" data-status="cancelled">Cancel</button>
        </div>
      </article>
    `).join("")
    : `<div class="empty-state">No orders yet.</div>`;
}

function renderAdminStaff() {
  const list = qs("#adminStaffList");
  if (!list) return;
  list.innerHTML = state.staff.length
    ? state.staff.map((person) => `
      <article class="admin-item">
        <h3>${escapeHtml(person.full_name || "Unnamed account")}</h3>
        <div class="product-meta">${escapeHtml(person.email || "No email")} | ${escapeHtml(person.phone || "No phone")} | ${escapeHtml(labelForRole(person.role))}</div>
      </article>
    `).join("")
    : `<div class="empty-state">No staff accounts yet.</div>`;
}

async function saveProduct(event) {
  event.preventDefault();
  setAdminMessage("Saving product...");
  try {
    const id = value("#productId");
    const imageUrl = await resolveImageUrl("product-images", "products", "#productImageFile", "#productImage", id);
    const product = {
      name: value("#productName"),
      price_ghs: Number(value("#productPrice")),
      section: value("#productSection"),
      sizes: parseSizes(value("#productSizes")),
      image_url: imageUrl,
      description: value("#productDescription"),
      active: qs("#productActive").checked,
      sort_order: Number(value("#productSort") || 0),
      discount_active: qs("#productDiscountActive").checked,
      discount_percent: Number(value("#productDiscountPercent") || 0),
    };
    const query = id
      ? supabaseClient.from("products").update(product).eq("id", id)
      : supabaseClient.from("products").insert(product);
    const { error } = await query;
    if (error) throw error;
    setAdminMessage("Product saved.");
    resetProductForm();
    await loadProducts();
    renderAdminProducts();
  } catch (error) {
    setAdminMessage(error.message || "Unable to save product.");
  }
}

async function resolveImageUrl(bucket, folder, fileSelector, urlSelector, recordId) {
  const file = qs(fileSelector).files?.[0];
  const pastedUrl = value(urlSelector);
  if (!file) return pastedUrl || null;
  const extension = file.name.split(".").pop()?.toLowerCase().replace(/[^a-z0-9]/g, "") || "jpg";
  const filePath = `${folder}/${recordId || crypto.randomUUID()}-${Date.now()}.${extension}`;
  const { error } = await supabaseClient.storage.from(bucket).upload(filePath, file, {
    cacheControl: "3600",
    upsert: false,
  });
  if (error) throw error;
  return supabaseClient.storage.from(bucket).getPublicUrl(filePath).data.publicUrl;
}

function editProduct(id) {
  const product = state.products.find((entry) => entry.id === id);
  if (!product) return;
  setValue("#productId", product.id);
  setValue("#productName", product.name);
  setValue("#productPrice", product.price_ghs);
  setValue("#productSection", product.section);
  setValue("#productSizes", formatSizes(product.sizes));
  setValue("#productImage", product.image_url || "");
  setValue("#productDescription", product.description || "");
  setValue("#productSort", product.sort_order || 0);
  setValue("#productDiscountPercent", product.discount_percent || 0);
  qs("#productActive").checked = product.active;
  qs("#productDiscountActive").checked = Boolean(product.discount_active);
  renderImagePreview("#productImagePreview", product.image_url);
}

async function archiveProduct(id) {
  const { error } = await supabaseClient.from("products").update({ active: false }).eq("id", id);
  if (error) return setAdminMessage(error.message);
  await loadProducts();
  renderAdminProducts();
}

function resetProductForm() {
  qs("#productForm").reset();
  setValue("#productId", "");
  qs("#productActive").checked = true;
  qs("#productDiscountActive").checked = false;
  renderImagePreview("#productImagePreview", "");
}

async function saveGalleryImage(event) {
  event.preventDefault();
  setAdminMessage("Saving gallery image...");
  try {
    const id = value("#galleryId");
    const imageUrl = await resolveImageUrl("gallery-images", "lookbook", "#galleryImageFile", "#galleryImage", id);
    const gallery = {
      title: value("#galleryTitle"),
      caption: value("#galleryCaption"),
      image_url: imageUrl,
      active: qs("#galleryActive").checked,
      sort_order: Number(value("#gallerySort") || 0),
    };
    const query = id
      ? supabaseClient.from("gallery_images").update(gallery).eq("id", id)
      : supabaseClient.from("gallery_images").insert(gallery);
    const { error } = await query;
    if (error) throw error;
    setAdminMessage("Gallery image saved.");
    resetGalleryForm();
    await loadGallery();
    renderAdminGallery();
  } catch (error) {
    setAdminMessage(error.message || "Unable to save gallery image.");
  }
}

function editGallery(id) {
  const item = state.gallery.find((entry) => entry.id === id);
  if (!item) return;
  setValue("#galleryId", item.id);
  setValue("#galleryTitle", item.title || "");
  setValue("#galleryCaption", item.caption || "");
  setValue("#galleryImage", item.image_url || "");
  setValue("#gallerySort", item.sort_order || 0);
  qs("#galleryActive").checked = item.active;
  renderImagePreview("#galleryImagePreview", item.image_url);
}

async function deleteGallery(id) {
  const { error } = await supabaseClient.from("gallery_images").update({ active: false }).eq("id", id);
  if (error) return setAdminMessage(error.message);
  await loadGallery();
  renderAdminGallery();
}

function resetGalleryForm() {
  qs("#galleryForm").reset();
  setValue("#galleryId", "");
  qs("#galleryActive").checked = true;
  renderImagePreview("#galleryImagePreview", "");
}

function renderImagePreview(selector, url) {
  const preview = qs(selector);
  if (!preview) return;
  preview.querySelector("img").src = url || "";
  preview.classList.toggle("hidden", !url);
}

function previewSelectedImage(fileSelector, urlSelector, previewSelector) {
  const file = qs(fileSelector).files?.[0];
  renderImagePreview(previewSelector, file ? URL.createObjectURL(file) : value(urlSelector));
}

async function savePromoCode(event) {
  event.preventDefault();
  const id = value("#promoId");
  const promo = {
    code: value("#promoCode").toUpperCase(),
    discount_type: value("#promoType"),
    discount_value: Number(value("#promoValue")),
    min_order_ghs: Number(value("#promoMinOrder") || 0),
    active: qs("#promoActive").checked,
  };
  const query = id
    ? supabaseClient.from("promo_codes").update(promo).eq("id", id)
    : supabaseClient.from("promo_codes").insert(promo);
  const { error } = await query;
  if (error) return setAdminMessage(error.message);
  setAdminMessage("Promo code saved.");
  resetPromoForm();
  await loadPromoCodes();
  renderAdminPromos();
}

function editPromo(id) {
  const promo = state.promoCodes.find((entry) => entry.id === id);
  if (!promo) return;
  setValue("#promoId", promo.id);
  setValue("#promoCode", promo.code);
  setValue("#promoType", promo.discount_type);
  setValue("#promoValue", promo.discount_value);
  setValue("#promoMinOrder", promo.min_order_ghs || 0);
  qs("#promoActive").checked = promo.active;
}

async function deletePromo(id) {
  const { error } = await supabaseClient.from("promo_codes").update({ active: false }).eq("id", id);
  if (error) return setAdminMessage(error.message);
  await loadPromoCodes();
  renderAdminPromos();
}

function resetPromoForm() {
  qs("#promoForm").reset();
  setValue("#promoId", "");
  qs("#promoActive").checked = true;
}

async function saveBanner(event) {
  event.preventDefault();
  const id = value("#bannerId");
  const banner = {
    placement: value("#bannerPlacement"),
    body: value("#bannerText"),
    active: qs("#bannerActive").checked,
  };
  const query = id
    ? supabaseClient.from("banners").update(banner).eq("id", id)
    : supabaseClient.from("banners").insert(banner);
  const { error } = await query;
  if (error) return setAdminMessage(error.message);
  setAdminMessage("Banner saved.");
  qs("#bannerForm").reset();
  setValue("#bannerId", "");
  await loadBanners();
  renderAdminBanners();
}

function editBanner(id) {
  const banner = state.banners.find((entry) => entry.id === id);
  if (!banner) return;
  setValue("#bannerId", banner.id);
  setValue("#bannerPlacement", banner.placement);
  setValue("#bannerText", banner.body);
  qs("#bannerActive").checked = banner.active;
}

async function deleteBanner(id) {
  const { error } = await supabaseClient.from("banners").delete().eq("id", id);
  if (error) return setAdminMessage(error.message);
  await loadBanners();
  renderAdminBanners();
}

async function saveStaffAccount(event) {
  event.preventDefault();
  if (!isOwner()) return setAdminMessage("Only an owner can add accounts.");
  setAdminMessage("Adding account...");
  const response = await fetch("/api/create-staff-user", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${state.session.access_token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      full_name: value("#staffName"),
      phone: value("#staffPhone"),
      email: value("#staffEmail"),
      password: value("#staffPassword"),
      role: value("#staffRole"),
    }),
  });
  const result = await response.json();
  if (!response.ok) return setAdminMessage(result.error || "Unable to add account.");
  qs("#staffForm").reset();
  setAdminMessage("Account added.");
  await loadStaff();
  renderAdminStaff();
}

async function updateOrderStatus(orderId, status) {
  const { error } = await supabaseClient.from("orders").update({ status }).eq("id", orderId);
  if (error) return setAdminMessage(error.message);
  const order = state.orders.find((entry) => entry.id === orderId);
  if (order) {
    await fetch("/api/send-order-email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ order: { ...order, status } }),
    });
  }
  await loadOrders();
  renderAdminOrders();
}

function bindAdminEvents() {
  qs("#adminAuthForm")?.addEventListener("submit", adminSignIn);
  qs("#adminLock")?.addEventListener("click", adminSignOut);
  qs("#productForm")?.addEventListener("submit", saveProduct);
  qs("#productReset")?.addEventListener("click", resetProductForm);
  qs("#productImageFile")?.addEventListener("change", () => previewSelectedImage("#productImageFile", "#productImage", "#productImagePreview"));
  qs("#productImage")?.addEventListener("input", () => previewSelectedImage("#productImageFile", "#productImage", "#productImagePreview"));
  qs("#galleryForm")?.addEventListener("submit", saveGalleryImage);
  qs("#galleryReset")?.addEventListener("click", resetGalleryForm);
  qs("#galleryImageFile")?.addEventListener("change", () => previewSelectedImage("#galleryImageFile", "#galleryImage", "#galleryImagePreview"));
  qs("#galleryImage")?.addEventListener("input", () => previewSelectedImage("#galleryImageFile", "#galleryImage", "#galleryImagePreview"));
  qs("#promoForm")?.addEventListener("submit", savePromoCode);
  qs("#promoReset")?.addEventListener("click", resetPromoForm);
  qs("#bannerForm")?.addEventListener("submit", saveBanner);
  qs("#bannerReset")?.addEventListener("click", () => qs("#bannerForm").reset());
  qs("#staffForm")?.addEventListener("submit", saveStaffAccount);

  document.addEventListener("click", async (event) => {
    const tab = event.target.closest("[data-admin-tab]")?.dataset.adminTab;
    if (tab) {
      qsa("[data-admin-tab]").forEach((button) => button.classList.toggle("active", button.dataset.adminTab === tab));
      qsa("[data-panel]").forEach((panel) => panel.classList.toggle("hidden", panel.dataset.panel !== tab));
    }
    const editId = event.target.closest("[data-edit-product]")?.dataset.editProduct;
    if (editId) editProduct(editId);
    const deleteId = event.target.closest("[data-delete-product]")?.dataset.deleteProduct;
    if (deleteId) await archiveProduct(deleteId);
    const editGalleryId = event.target.closest("[data-edit-gallery]")?.dataset.editGallery;
    if (editGalleryId) editGallery(editGalleryId);
    const deleteGalleryId = event.target.closest("[data-delete-gallery]")?.dataset.deleteGallery;
    if (deleteGalleryId) await deleteGallery(deleteGalleryId);
    const editPromoId = event.target.closest("[data-edit-promo]")?.dataset.editPromo;
    if (editPromoId) editPromo(editPromoId);
    const deletePromoId = event.target.closest("[data-delete-promo]")?.dataset.deletePromo;
    if (deletePromoId) await deletePromo(deletePromoId);
    const editBannerId = event.target.closest("[data-edit-banner]")?.dataset.editBanner;
    if (editBannerId) editBanner(editBannerId);
    const deleteBannerId = event.target.closest("[data-delete-banner]")?.dataset.deleteBanner;
    if (deleteBannerId) await deleteBanner(deleteBannerId);
    const statusButton = event.target.closest("[data-order-status]");
    if (statusButton) await updateOrderStatus(statusButton.dataset.orderStatus, statusButton.dataset.status);
  });
}

function setAdminMessage(message) {
  setText("#adminMessage", message);
}

function value(selector) {
  return qs(selector)?.value?.trim() || "";
}

function setValue(selector, newValue) {
  const element = qs(selector);
  if (element) element.value = newValue;
}

function setText(selector, text) {
  const element = qs(selector);
  if (element) element.textContent = text;
}

function parseSizes(value) {
  return value.split(",").map((size) => size.trim()).filter(Boolean);
}

function formatSizes(value) {
  return Array.isArray(value) && value.length ? value.join(", ") : "Sizes added soon";
}

function labelForSection(section) {
  return { "new-arrivals": "Current Drops", "flash-sale": "Flashsale", trending: "Trending" }[section] || section;
}

function labelForPlacement(placement) {
  return placement === "notification" ? "Notification" : "Promo banner";
}

function labelForRole(role) {
  return role === "admin" ? "Owner" : "Staff";
}

function labelForPromo(promo) {
  const discount = promo.discount_type === "fixed"
    ? money.format(Number(promo.discount_value))
    : `${Number(promo.discount_value)}%`;
  return `${discount} off / minimum ${money.format(Number(promo.min_order_ghs || 0))}`;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function escapeAttr(value) {
  return escapeHtml(value).replaceAll("`", "&#096;");
}

init();
