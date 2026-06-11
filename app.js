const money = new Intl.NumberFormat("en-GH", {
  style: "currency",
  currency: "GHS",
  maximumFractionDigits: 0,
});

const cartKey = "osco.cart";
const config = window.OSCO_CONFIG || {};
const hasSupabaseConfig = Boolean(window.supabase && config.supabaseUrl && config.supabaseAnonKey);
const supabaseClient = hasSupabaseConfig
  ? window.supabase.createClient(config.supabaseUrl, config.supabaseAnonKey)
  : null;

let state = {
  session: null,
  profile: null,
  products: [],
  banners: [],
  orders: [],
  cart: loadCart(),
  adminOpen: false,
  logoTapCount: 0,
  logoTapTimer: null,
};

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
  bindEvents();
  if (!hasSupabaseConfig) {
    showSetupState();
    renderCart();
    return;
  }

  const { data } = await supabaseClient.auth.getSession();
  state.session = data.session;
  await refreshSessionState();
  await Promise.all([loadProducts(), loadBanners(), loadOrders()]);
  renderAll();

  supabaseClient.auth.onAuthStateChange(async (_event, session) => {
    state.session = session;
    await refreshSessionState();
    await loadOrders();
    renderAll();
  });
}

async function refreshSessionState() {
  if (!state.session) {
    state.profile = null;
    return;
  }

  const { data, error } = await supabaseClient
    .from("profiles")
    .select("id, full_name, phone, role")
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
    setStatus("Unable to load products right now.");
    console.warn(error.message);
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

function renderAll() {
  renderAuth();
  renderBanners();
  renderProducts();
  renderCart();
  renderAdmin();
}

function showSetupState() {
  setStatus("");
  document.querySelectorAll(".product-grid").forEach((grid) => {
    grid.innerHTML = `<div class="empty-state">The shop is being prepared.</div>`;
  });
  document.querySelector("#admin").classList.add("hidden");
  document.querySelector("#adminGate").classList.remove("hidden");
  document.querySelector("#adminConsole").classList.add("hidden");
  document.querySelector("#adminGateMessage").textContent = "Sign in to continue.";
}

function setStatus(message) {
  const status = document.querySelector("#siteStatus");
  status.textContent = message || "";
  status.classList.toggle("active", Boolean(message));
}

function renderAuth() {
  const signedOut = document.querySelector("#signedOut");
  const signedIn = document.querySelector("#signedIn");
  const accountName = document.querySelector("#accountName");
  const checkoutIdentity = document.querySelector("#checkoutIdentity");

  signedOut.classList.toggle("hidden", Boolean(state.session));
  signedIn.classList.toggle("hidden", !state.session);

  if (state.session) {
    const name = state.profile?.full_name || state.session.user.email;
    accountName.textContent = name;
    checkoutIdentity.textContent = `Signed in as ${state.session.user.email}`;
    document.querySelector("#customerEmail").value = state.session.user.email || "";
    document.querySelector("#customerName").value = state.profile?.full_name || "";
    document.querySelector("#customerPhone").value = state.profile?.phone || "";
  } else {
    accountName.textContent = "";
    checkoutIdentity.textContent = "Create an account or sign in before checkout.";
  }
}

function renderBanners() {
  const noticeBar = document.querySelector("#noticeBar");
  const promoStrip = document.querySelector("#promoStrip");
  const notification = state.banners.find((banner) => banner.placement === "notification");
  const promos = state.banners.filter((banner) => banner.placement === "promo");

  noticeBar.textContent = notification?.body || "";
  noticeBar.classList.toggle("active", Boolean(notification?.body));
  promoStrip.innerHTML = "";

  if (!promos.length) {
    promoStrip.style.display = "none";
    return;
  }

  promoStrip.style.display = "grid";
  promos.slice(0, 3).forEach((banner) => {
    const item = document.createElement("div");
    item.className = "promo-card";
    item.textContent = banner.body;
    promoStrip.append(item);
  });
}

function renderProducts() {
  document.querySelectorAll(".product-grid").forEach((grid) => {
    const section = grid.dataset.section;
    const products = state.products.filter((product) => product.section === section);
    grid.innerHTML = products.length
      ? products.map(productTemplate).join("")
      : `<div class="empty-state">No products have been added here yet.</div>`;
  });
}

function productTemplate(product) {
  return `
    <article class="product-card">
      <div class="product-image">
        ${
          product.image_url
            ? `<img src="${escapeAttr(product.image_url)}" alt="${escapeAttr(product.name)}" loading="lazy" />`
            : `<img src="assets/osco-logo-mark.png" alt="" loading="lazy" />`
        }
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

function renderCart() {
  const count = state.cart.reduce((sum, item) => sum + item.quantity, 0);
  document.querySelector("#cartCount").textContent = count;
  const container = document.querySelector("#cartItems");

  if (!state.cart.length) {
    container.innerHTML = `<div class="empty-state">Your cart is ready when you are.</div>`;
    return;
  }

  container.innerHTML = `
    ${state.cart.map(cartLineTemplate).join("")}
    <div class="cart-line">
      <strong>Total</strong>
      <strong>${money.format(cartTotal())}</strong>
    </div>
  `;
}

function cartLineTemplate(item) {
  const product = state.products.find((entry) => entry.id === item.product_id);
  if (!product) return "";

  return `
    <div class="cart-line">
      <div>
        <strong>${escapeHtml(product.name)}</strong>
        <div class="product-meta">${money.format(Number(product.price_ghs))} x ${item.quantity}</div>
      </div>
      <div class="cart-line-controls">
        <button type="button" data-cart-minus="${item.product_id}" aria-label="Reduce quantity">-</button>
        <span>${item.quantity}</span>
        <button type="button" data-cart-plus="${item.product_id}" aria-label="Increase quantity">+</button>
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
  const panel = document.querySelector("#cartPanel");
  panel.classList.add("open");
  panel.setAttribute("aria-hidden", "false");
}

function closeCart() {
  const panel = document.querySelector("#cartPanel");
  panel.classList.remove("open");
  panel.setAttribute("aria-hidden", "true");
}

async function signUp(event) {
  event.preventDefault();
  if (!hasSupabaseConfig) return;

  const fullName = document.querySelector("#authName").value.trim();
  const phone = document.querySelector("#authPhone").value.trim();
  const email = document.querySelector("#authEmail").value.trim();
  const password = document.querySelector("#authPassword").value;

  const { error } = await supabaseClient.auth.signUp({
    email,
    password,
    options: { data: { full_name: fullName, phone } },
  });

  setAuthMessage(error ? error.message : "Account created. Check your email if confirmation is enabled.");
}

async function signIn(event) {
  event.preventDefault();
  if (!hasSupabaseConfig) return;

  const email = document.querySelector("#authEmail").value.trim();
  const password = document.querySelector("#authPassword").value;
  const { error } = await supabaseClient.auth.signInWithPassword({ email, password });
  setAuthMessage(error ? error.message : "Signed in.");
}

async function signOut() {
  if (!hasSupabaseConfig) return;
  await supabaseClient.auth.signOut();
}

function setAuthMessage(message) {
  document.querySelector("#authMessage").textContent = message;
}

async function checkout(event) {
  event.preventDefault();
  const message = document.querySelector("#checkoutMessage");

  if (!hasSupabaseConfig) {
    message.textContent = "Checkout is not available yet.";
    return;
  }

  if (!state.session) {
    message.textContent = "Please create an account or sign in before checkout.";
    document.querySelector("#account").scrollIntoView({ behavior: "smooth", block: "start" });
    return;
  }

  if (!state.cart.length) {
    message.textContent = "Add at least one item before checkout.";
    return;
  }

  const payload = {
    customer: {
      name: document.querySelector("#customerName").value.trim(),
      email: state.session.user.email,
      phone: document.querySelector("#customerPhone").value.trim(),
      address: document.querySelector("#customerAddress").value.trim(),
    },
    items: state.cart,
  };

  message.textContent = "Preparing secure checkout...";
  const response = await fetch("/api/paystack-initialize", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${state.session.access_token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
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

function renderAdmin() {
  const isAdmin = ["admin", "staff"].includes(state.profile?.role);
  const adminShell = document.querySelector("#admin");
  adminShell.classList.toggle("hidden", !state.adminOpen);
  document.querySelector("#adminGate").classList.toggle("hidden", isAdmin);
  document.querySelector("#adminConsole").classList.toggle("hidden", !isAdmin);

  if (!state.session) {
    document.querySelector("#adminGateMessage").textContent = "Sign in to continue.";
  } else if (!isAdmin) {
    document.querySelector("#adminGateMessage").textContent = "This account does not have access.";
  }

  if (!isAdmin) return;
  renderAdminProducts();
  renderAdminBanners();
  renderAdminOrders();
}

function renderAdminProducts() {
  const list = document.querySelector("#adminProductList");
  list.innerHTML = state.products.length
    ? state.products
        .map(
          (product) => `
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
      `
        )
        .join("")
    : `<div class="empty-state">No products yet. Add the first real item from the form.</div>`;
}

function renderAdminBanners() {
  const list = document.querySelector("#adminBannerList");
  list.innerHTML = state.banners.length
    ? state.banners
        .map(
          (banner) => `
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
    `
        )
        .join("")
    : `<div class="empty-state">No banners yet.</div>`;
}

function renderAdminOrders() {
  const list = document.querySelector("#adminOrderList");
  if (!state.orders.length) {
    list.innerHTML = `<div class="empty-state">No orders yet.</div>`;
    return;
  }

  list.innerHTML = state.orders
    .map(
      (order) => `
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
    `
    )
    .join("");
}

async function saveProduct(event) {
  event.preventDefault();
  const id = document.querySelector("#productId").value;
  setAdminMessage("Saving product...");
  try {
    const imageUrl = await resolveProductImageUrl(id);
    const product = {
      name: document.querySelector("#productName").value.trim(),
      price_ghs: Number(document.querySelector("#productPrice").value),
      section: document.querySelector("#productSection").value,
      sizes: parseSizes(document.querySelector("#productSizes").value),
      image_url: imageUrl,
      description: document.querySelector("#productDescription").value.trim(),
      active: document.querySelector("#productActive").checked,
      sort_order: Number(document.querySelector("#productSort").value || 0),
    };

    const query = id
      ? supabaseClient.from("products").update(product).eq("id", id)
      : supabaseClient.from("products").insert(product);
    const { error } = await query;

    if (error) {
      setAdminMessage(error.message);
      return;
    }

    setAdminMessage("Product saved.");
    resetProductForm();
    await loadProducts();
    renderAll();
  } catch (error) {
    setAdminMessage(error.message || "Unable to save product.");
  }
}

async function resolveProductImageUrl(productId) {
  const fileInput = document.querySelector("#productImageFile");
  const pastedUrl = document.querySelector("#productImage").value.trim();
  const file = fileInput.files?.[0];
  if (!file) return pastedUrl || null;

  if (!file.type.startsWith("image/")) {
    throw new Error("Choose a valid image file.");
  }

  const extension = file.name.split(".").pop()?.toLowerCase() || "jpg";
  const safeExtension = extension.replace(/[^a-z0-9]/g, "") || "jpg";
  const fileName = `${productId || crypto.randomUUID()}-${Date.now()}.${safeExtension}`;
  const filePath = `products/${fileName}`;
  const { error } = await supabaseClient.storage.from("product-images").upload(filePath, file, {
    cacheControl: "3600",
    upsert: false,
  });

  if (error) throw error;

  const { data } = supabaseClient.storage.from("product-images").getPublicUrl(filePath);
  return data.publicUrl;
}

function editProduct(id) {
  const product = state.products.find((entry) => entry.id === id);
  if (!product) return;
  document.querySelector("#productId").value = product.id;
  document.querySelector("#productName").value = product.name;
  document.querySelector("#productPrice").value = product.price_ghs;
  document.querySelector("#productSection").value = product.section;
  document.querySelector("#productSizes").value = formatSizes(product.sizes);
  document.querySelector("#productImage").value = product.image_url || "";
  renderProductImagePreview(product.image_url);
  document.querySelector("#productDescription").value = product.description || "";
  document.querySelector("#productActive").checked = product.active;
  document.querySelector("#productSort").value = product.sort_order || 0;
  document.querySelector("#productName").focus();
}

async function archiveProduct(id) {
  const { error } = await supabaseClient.from("products").update({ active: false }).eq("id", id);
  if (error) {
    setAdminMessage(error.message);
    return;
  }
  state.cart = state.cart.filter((item) => item.product_id !== id);
  saveCart();
  await loadProducts();
  renderAll();
}

function resetProductForm() {
  document.querySelector("#productForm").reset();
  document.querySelector("#productId").value = "";
  document.querySelector("#productActive").checked = true;
  renderProductImagePreview("");
}

function renderProductImagePreview(url) {
  const preview = document.querySelector("#productImagePreview");
  const image = preview.querySelector("img");
  image.src = url || "";
  preview.classList.toggle("hidden", !url);
}

function previewSelectedProductImage() {
  const file = document.querySelector("#productImageFile").files?.[0];
  if (!file) {
    renderProductImagePreview(document.querySelector("#productImage").value.trim());
    return;
  }
  renderProductImagePreview(URL.createObjectURL(file));
}

async function saveBanner(event) {
  event.preventDefault();
  const id = document.querySelector("#bannerId").value;
  const banner = {
    placement: document.querySelector("#bannerPlacement").value,
    body: document.querySelector("#bannerText").value.trim(),
    active: document.querySelector("#bannerActive").checked,
  };

  const query = id
    ? supabaseClient.from("banners").update(banner).eq("id", id)
    : supabaseClient.from("banners").insert(banner);
  const { error } = await query;

  if (error) {
    setAdminMessage(error.message);
    return;
  }

  setAdminMessage("Banner saved.");
  resetBannerForm();
  await loadBanners();
  renderAll();
}

function editBanner(id) {
  const banner = state.banners.find((entry) => entry.id === id);
  if (!banner) return;
  document.querySelector("#bannerId").value = banner.id;
  document.querySelector("#bannerPlacement").value = banner.placement;
  document.querySelector("#bannerText").value = banner.body;
  document.querySelector("#bannerActive").checked = banner.active;
}

async function deleteBanner(id) {
  const { error } = await supabaseClient.from("banners").delete().eq("id", id);
  if (error) {
    setAdminMessage(error.message);
    return;
  }
  await loadBanners();
  renderAll();
}

function resetBannerForm() {
  document.querySelector("#bannerForm").reset();
  document.querySelector("#bannerId").value = "";
  document.querySelector("#bannerActive").checked = true;
}

async function updateOrderStatus(orderId, status) {
  const { error } = await supabaseClient.from("orders").update({ status }).eq("id", orderId);
  if (error) {
    setAdminMessage(error.message);
    return;
  }

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

function setAdminMessage(message) {
  document.querySelector("#adminMessage").textContent = message;
}

function bindEvents() {
  document.querySelector(".brand").addEventListener("click", handleLogoTap);
  document.querySelector("#adminAccessClose").addEventListener("click", closeAdminAccess);
  document.querySelector("#adminAuthForm").addEventListener("submit", adminSignIn);
  document.querySelector("#cartToggle").addEventListener("click", openCart);
  document.querySelector("#cartClose").addEventListener("click", closeCart);
  document.querySelector("#checkoutForm").addEventListener("submit", checkout);
  document.querySelector("#authForm").addEventListener("submit", signIn);
  document.querySelector("#authSignUp").addEventListener("click", signUp);
  document.querySelector("#signOut").addEventListener("click", signOut);
  document.querySelector("#productForm").addEventListener("submit", saveProduct);
  document.querySelector("#productReset").addEventListener("click", resetProductForm);
  document.querySelector("#productImageFile").addEventListener("change", previewSelectedProductImage);
  document.querySelector("#productImage").addEventListener("input", () => {
    if (!document.querySelector("#productImageFile").files?.length) {
      renderProductImagePreview(document.querySelector("#productImage").value.trim());
    }
  });
  document.querySelector("#bannerForm").addEventListener("submit", saveBanner);
  document.querySelector("#bannerReset").addEventListener("click", resetBannerForm);
  document.querySelector("#adminLock").addEventListener("click", lockAdmin);

  document.addEventListener("click", async (event) => {
    const addId = event.target.closest("[data-add-to-cart]")?.dataset.addToCart;
    if (addId) addToCart(addId);

    const minusId = event.target.closest("[data-cart-minus]")?.dataset.cartMinus;
    if (minusId) updateCart(minusId, -1);

    const plusId = event.target.closest("[data-cart-plus]")?.dataset.cartPlus;
    if (plusId) updateCart(plusId, 1);

    const tab = event.target.closest("[data-admin-tab]")?.dataset.adminTab;
    if (tab) {
      document.querySelectorAll("[data-admin-tab]").forEach((button) => button.classList.toggle("active", button.dataset.adminTab === tab));
      document.querySelectorAll("[data-panel]").forEach((panel) => panel.classList.toggle("hidden", panel.dataset.panel !== tab));
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

function handleLogoTap(event) {
  event.preventDefault();
  state.logoTapCount += 1;
  window.clearTimeout(state.logoTapTimer);
  state.logoTapTimer = window.setTimeout(() => {
    state.logoTapCount = 0;
  }, 900);

  if (state.logoTapCount >= 3) {
    state.logoTapCount = 0;
    openAdminAccess();
  }
}

function openAdminAccess() {
  if (["admin", "staff"].includes(state.profile?.role)) {
    state.adminOpen = true;
    renderAdmin();
    document.querySelector("#admin").scrollIntoView({ behavior: "smooth", block: "start" });
    return;
  }

  const modal = document.querySelector("#adminAccessModal");
  modal.classList.remove("hidden");
  modal.setAttribute("aria-hidden", "false");
  document.querySelector("#adminEmail").focus();
}

function closeAdminAccess() {
  const modal = document.querySelector("#adminAccessModal");
  modal.classList.add("hidden");
  modal.setAttribute("aria-hidden", "true");
  document.querySelector("#adminAccessMessage").textContent = "";
}

async function adminSignIn(event) {
  event.preventDefault();
  if (!hasSupabaseConfig) {
    document.querySelector("#adminAccessMessage").textContent = "Access is not available yet.";
    return;
  }

  const email = document.querySelector("#adminEmail").value.trim();
  const password = document.querySelector("#adminPassword").value;
  const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });
  if (error) {
    document.querySelector("#adminAccessMessage").textContent = "Unable to sign in.";
    return;
  }

  state.session = data.session;
  await refreshSessionState();
  if (!["admin", "staff"].includes(state.profile?.role)) {
    document.querySelector("#adminAccessMessage").textContent = "This account does not have access.";
    return;
  }

  closeAdminAccess();
  state.adminOpen = true;
  await Promise.all([loadProducts(), loadBanners(), loadOrders()]);
  renderAll();
  document.querySelector("#admin").scrollIntoView({ behavior: "smooth", block: "start" });
}

function lockAdmin() {
  state.adminOpen = false;
  document.querySelector("#admin").classList.add("hidden");
  closeAdminAccess();
}

function parseSizes(value) {
  return value
    .split(",")
    .map((size) => size.trim())
    .filter(Boolean);
}

function formatSizes(value) {
  return Array.isArray(value) && value.length ? value.join(", ") : "Sizes added soon";
}

function labelForSection(section) {
  return {
    "new-arrivals": "New Arrivals",
    "flash-sale": "Flashsale",
    trending: "Trending",
  }[section] || section;
}

function labelForPlacement(placement) {
  return placement === "notification" ? "Notification" : "Promo banner";
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
