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
  orders: [],
  staff: [],
  cart: loadCart(),
  logoTapCount: 0,
  logoTapTimer: null,
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
  await Promise.all([loadProducts(), loadBanners()]);
  renderShop();

  supabaseClient.auth.onAuthStateChange(async (_event, session) => {
    state.session = session;
    await refreshProfile();
    if (page === "admin") {
      await loadAdminData();
      renderAdminGate();
    } else {
      renderAuth();
      renderCart();
    }
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
  const { data, error } = await supabaseClient
    .from("products")
    .select("id, name, price_ghs, section, sizes, description, image_url, active, sort_order")
    .eq("active", true)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: false });

  if (error) {
    console.warn(error.message);
    state.products = [];
    return;
  }
  state.products = data || [];
}

async function loadBanners() {
  const { data, error } = await supabaseClient
    .from("banners")
    .select("id, placement, body, active")
    .eq("active", true)
    .order("updated_at", { ascending: false });

  if (error) {
    console.warn(error.message);
    state.banners = [];
    return;
  }
  state.banners = data || [];
}

async function loadOrders() {
  if (!state.session) {
    state.orders = [];
    return;
  }

  const { data, error } = await supabaseClient
    .from("orders")
    .select("id, reference, status, total_ghs, customer_name, customer_email, customer_phone, delivery_address, created_at, order_items(name, price_ghs, quantity)")
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
  await Promise.all([loadProducts(), loadBanners(), loadOrders(), loadStaff()]);
}

function renderShop() {
  renderBanners();
  renderProducts();
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
  return `
    <article class="product-card">
      <div class="product-image">
        <img src="${escapeAttr(product.image_url || "assets/osco-logo-mark.png")}" alt="${escapeAttr(product.name)}" loading="lazy" />
      </div>
      <div class="product-info">
        <div class="product-row">
          <h3>${escapeHtml(product.name)}</h3>
          <span class="price">${money.format(Number(product.price_ghs))}</span>
        </div>
        <div class="product-meta">${escapeHtml(formatSizes(product.sizes))}</div>
        <p class="product-description">${escapeHtml(product.description || "")}</p>
      </div>
      <button type="button" data-add-to-cart="${product.id}">Add to cart</button>
    </article>
  `;
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
    return;
  }

  container.innerHTML = `
    ${state.cart.map(cartLine).join("")}
    <div class="cart-line">
      <strong>Total</strong>
      <strong>${money.format(cartTotal())}</strong>
    </div>
  `;
}

function cartLine(item) {
  const product = state.products.find((entry) => entry.id === item.product_id);
  if (!product) return "";
  return `
    <div class="cart-line">
      <div>
        <strong>${escapeHtml(product.name)}</strong>
        <div class="product-meta">${money.format(Number(product.price_ghs))} x ${item.quantity}</div>
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

function cartTotal() {
  return state.cart.reduce((sum, item) => {
    const product = state.products.find((entry) => entry.id === item.product_id);
    return sum + (product ? Number(product.price_ghs) * item.quantity : 0);
  }, 0);
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
    }),
  });
  const result = await response.json();
  if (!response.ok || !result.authorization_url) {
    message.textContent = result.error || "Unable to start checkout.";
    return;
  }
  state.cart = [];
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
            <div class="product-meta">${escapeHtml(labelForSection(product.section))} | ${escapeHtml(formatSizes(product.sizes))}</div>
          </div>
          <strong>${money.format(Number(product.price_ghs))}</strong>
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
        <div>${(order.order_items || []).map((item) => `<span>${escapeHtml(item.name)} x ${item.quantity}</span>`).join("<br />")}</div>
        <div class="admin-item-actions">
          <button type="button" data-order-status="${order.id}" data-status="processing">Processing</button>
          <button type="button" data-order-status="${order.id}" data-status="shipped">Shipped</button>
          <button type="button" data-order-status="${order.id}" data-status="delivered">Delivered</button>
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
    const imageUrl = await resolveProductImageUrl(id);
    const product = {
      name: value("#productName"),
      price_ghs: Number(value("#productPrice")),
      section: value("#productSection"),
      sizes: parseSizes(value("#productSizes")),
      image_url: imageUrl,
      description: value("#productDescription"),
      active: qs("#productActive").checked,
      sort_order: Number(value("#productSort") || 0),
    };
    const query = id
      ? supabaseClient.from("products").update(product).eq("id", id)
      : supabaseClient.from("products").insert(product);
    const { error } = await query;
    if (error) throw error;
    setAdminMessage("Product saved.");
    qs("#productForm").reset();
    setValue("#productId", "");
    renderProductImagePreview("");
    await loadProducts();
    renderAdminProducts();
  } catch (error) {
    setAdminMessage(error.message || "Unable to save product.");
  }
}

async function resolveProductImageUrl(productId) {
  const file = qs("#productImageFile").files?.[0];
  const pastedUrl = value("#productImage");
  if (!file) return pastedUrl || null;
  const extension = file.name.split(".").pop()?.toLowerCase().replace(/[^a-z0-9]/g, "") || "jpg";
  const filePath = `products/${productId || crypto.randomUUID()}-${Date.now()}.${extension}`;
  const { error } = await supabaseClient.storage.from("product-images").upload(filePath, file, {
    cacheControl: "3600",
    upsert: false,
  });
  if (error) throw error;
  return supabaseClient.storage.from("product-images").getPublicUrl(filePath).data.publicUrl;
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
  qs("#productActive").checked = product.active;
  renderProductImagePreview(product.image_url);
}

async function archiveProduct(id) {
  const { error } = await supabaseClient.from("products").update({ active: false }).eq("id", id);
  if (error) return setAdminMessage(error.message);
  await loadProducts();
  renderAdminProducts();
}

function renderProductImagePreview(url) {
  const preview = qs("#productImagePreview");
  if (!preview) return;
  preview.querySelector("img").src = url || "";
  preview.classList.toggle("hidden", !url);
}

function previewSelectedProductImage() {
  const file = qs("#productImageFile").files?.[0];
  renderProductImagePreview(file ? URL.createObjectURL(file) : value("#productImage"));
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
  await loadOrders();
  renderAdminOrders();
}

function bindAdminEvents() {
  qs("#adminAuthForm")?.addEventListener("submit", adminSignIn);
  qs("#adminLock")?.addEventListener("click", adminSignOut);
  qs("#productForm")?.addEventListener("submit", saveProduct);
  qs("#productReset")?.addEventListener("click", () => {
    qs("#productForm").reset();
    setValue("#productId", "");
    renderProductImagePreview("");
  });
  qs("#productImageFile")?.addEventListener("change", previewSelectedProductImage);
  qs("#productImage")?.addEventListener("input", previewSelectedProductImage);
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
  return { "new-arrivals": "New Arrivals", "flash-sale": "Flashsale", trending: "Trending" }[section] || section;
}

function labelForPlacement(placement) {
  return placement === "notification" ? "Notification" : "Promo banner";
}

function labelForRole(role) {
  return role === "admin" ? "Owner" : "Staff";
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
