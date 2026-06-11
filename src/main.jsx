import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { createClient } from "@supabase/supabase-js";
import "./styles.css";

const config = window.OSCO_CONFIG || {};
const supabase = config.supabaseUrl && config.supabaseAnonKey
  ? createClient(config.supabaseUrl, config.supabaseAnonKey)
  : null;

const money = new Intl.NumberFormat("en-GH", {
  style: "currency",
  currency: "GHS",
  maximumFractionDigits: 0,
});

const cartKey = "osco.cart";
const isAdminRoute = ["/admin", "/admin.html"].includes(window.location.pathname);
const sections = [
  ["new-arrivals", "Current Drops"],
  ["flash-sale", "Flashsale"],
  ["trending", "Trending"],
];

function App() {
  if (!supabase) return <SetupMissing />;
  return isAdminRoute ? <AdminApp /> : <PublicApp />;
}

function SetupMissing() {
  return (
    <main className="setup-screen">
      <img src="/assets/osco-logo-full.jpeg" alt="OSCO Power From Beyond" />
      <h1>Setup required</h1>
      <p>Add your Supabase URL and anon key to <code>public/config.js</code>, then rebuild the site.</p>
    </main>
  );
}

function PublicApp() {
  const [route, setRoute] = useState(cleanRoute(window.location.pathname));
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [products, setProducts] = useState([]);
  const [banners, setBanners] = useState([]);
  const [gallery, setGallery] = useState([]);
  const [events, setEvents] = useState([]);
  const [eventImages, setEventImages] = useState([]);
  const [reviews, setReviews] = useState([]);
  const [promos, setPromos] = useState([]);
  const [cart, setCart] = useState(loadCart());
  const [appliedPromo, setAppliedPromo] = useState(null);
  const [authOpen, setAuthOpen] = useState(false);
  const [cartOpen, setCartOpen] = useState(false);
  const [authMessage, setAuthMessage] = useState("");
  const [checkoutMessage, setCheckoutMessage] = useState("");
  const [promoMessage, setPromoMessage] = useState("");
  const [logoTaps, setLogoTaps] = useState(0);
  const [shuttleIndex, setShuttleIndex] = useState(0);

  useEffect(() => {
    const onPop = () => setRoute(cleanRoute(window.location.pathname));
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  useEffect(() => {
    let active = true;
    supabase.auth.getSession().then(async ({ data }) => {
      if (!active) return;
      setSession(data.session);
      setProfile(await getProfile(data.session));
    });
    const { data: listener } = supabase.auth.onAuthStateChange(async (_event, nextSession) => {
      setSession(nextSession);
      setProfile(await getProfile(nextSession));
    });
    return () => {
      active = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    loadPublicData().then((data) => {
      setProducts(data.products);
      setBanners(data.banners);
      setGallery(data.gallery);
      setEvents(data.events);
      setEventImages(data.eventImages);
      setReviews(data.reviews);
      setPromos(data.promos);
    });
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setShuttleIndex((value) => value + 1);
    }, 4200);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    localStorage.setItem(cartKey, JSON.stringify(cart));
  }, [cart]);

  const shuttleItems = useMemo(() => {
    const productItems = products
      .filter((product) => product.image_url)
      .map((product) => ({ image: product.image_url, label: product.name }));
    const galleryItems = [...gallery, ...eventImages]
      .filter((item) => item.image_url)
      .map((item) => ({ image: item.image_url, label: item.title || "OSCO image" }));
    return [...productItems, ...galleryItems];
  }, [products, gallery, eventImages]);

  const visibleBanners = banners.filter((banner) => banner.active);
  const notice = visibleBanners.find((banner) => banner.placement === "notification");
  const promoBanners = visibleBanners.filter((banner) => banner.placement === "promo");

  function navigate(event, nextRoute) {
    event.preventDefault();
    window.history.pushState({}, "", nextRoute);
    setRoute(cleanRoute(nextRoute));
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function handleLogoTap(event) {
    event.preventDefault();
    const next = logoTaps + 1;
    setLogoTaps(next);
    window.setTimeout(() => setLogoTaps(0), 900);
    if (next >= 3) window.location.href = "/admin.html";
  }

  function addToCart(product) {
    setCart((items) => {
      const existing = items.find((item) => item.product_id === product.id);
      if (existing) {
        return items.map((item) => item.product_id === product.id ? { ...item, quantity: item.quantity + 1 } : item);
      }
      return [...items, { product_id: product.id, quantity: 1 }];
    });
    setCartOpen(true);
  }

  function updateCart(productId, delta) {
    setCart((items) => items
      .map((item) => item.product_id === productId ? { ...item, quantity: item.quantity + delta } : item)
      .filter((item) => item.quantity > 0));
  }

  async function signIn(form) {
    setAuthMessage("Signing in...");
    const data = Object.fromEntries(new FormData(form).entries());
    const { error } = await supabase.auth.signInWithPassword({
      email: data.email,
      password: data.password,
    });
    setAuthMessage(error ? error.message : "Signed in.");
  }

  async function signUp(form) {
    setAuthMessage("Creating account...");
    const data = Object.fromEntries(new FormData(form).entries());
    const { error } = await supabase.auth.signUp({
      email: data.email,
      password: data.password,
      options: {
        emailRedirectTo: `${window.location.origin}/`,
        data: {
          full_name: data.full_name,
          phone: data.phone,
        },
      },
    });
    setAuthMessage(error ? error.message : "Account created. Check your email to confirm it.");
  }

  async function signOut() {
    await supabase.auth.signOut();
    setSession(null);
    setProfile(null);
  }

  function applyPromo(code) {
    const promo = promos.find((item) => item.active && item.code.toUpperCase() === code.trim().toUpperCase());
    if (!promo) {
      setAppliedPromo(null);
      setPromoMessage("Promo code not found.");
      return;
    }
    const subtotal = cartSubtotal(cart, products);
    if (Number(promo.min_order_ghs || 0) > subtotal) {
      setAppliedPromo(null);
      setPromoMessage(`Minimum order is ${money.format(Number(promo.min_order_ghs))}.`);
      return;
    }
    setAppliedPromo(promo);
    setPromoMessage(`${promo.code} applied.`);
  }

  async function checkout(form) {
    if (!session) {
      setCheckoutMessage("Sign in before checkout.");
      setAuthOpen(true);
      return;
    }
    if (!cart.length) {
      setCheckoutMessage("Add at least one item before checkout.");
      return;
    }
    setCheckoutMessage("Preparing secure Paystack checkout...");
    const data = Object.fromEntries(new FormData(form).entries());
    const response = await fetch("/api/paystack-initialize", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${session.access_token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        customer: {
          name: data.name,
          email: session.user.email,
          phone: data.phone,
          address: data.address,
        },
        items: cart,
        promo_code: appliedPromo?.code || null,
      }),
    });
    const result = await response.json();
    if (!response.ok || !result.authorization_url) {
      setCheckoutMessage(result.error || "Unable to start checkout.");
      return;
    }
    setCart([]);
    setAppliedPromo(null);
    window.location.href = result.authorization_url;
  }

  const commonProps = {
    products,
    gallery,
    events,
    eventImages,
    reviews,
    promoBanners,
    shuttleItems,
    shuttleIndex,
    addToCart,
    navigate,
  };

  return (
    <>
      {notice?.body ? <div className="notice-bar">{notice.body}</div> : null}
      <SiteHeader
        route={route}
        cartCount={cart.reduce((sum, item) => sum + item.quantity, 0)}
        navigate={navigate}
        onLogoTap={handleLogoTap}
        onAccount={() => setAuthOpen(true)}
        onCart={() => setCartOpen(true)}
      />
      <main>
        {route === "/" && <HomePage {...commonProps} />}
        {route === "/shop" && <ShopPage {...commonProps} />}
        {route === "/gallery" && <GalleryPage {...commonProps} />}
        {route === "/contact" && <ContactPage />}
      </main>
      <SiteFooter navigate={navigate} />
      <AuthModal
        open={authOpen}
        session={session}
        profile={profile}
        message={authMessage}
        onClose={() => setAuthOpen(false)}
        onSignIn={signIn}
        onSignUp={signUp}
        onSignOut={signOut}
      />
      <CartDrawer
        open={cartOpen}
        cart={cart}
        products={products}
        session={session}
        profile={profile}
        appliedPromo={appliedPromo}
        promoMessage={promoMessage}
        checkoutMessage={checkoutMessage}
        onClose={() => setCartOpen(false)}
        onUpdate={updateCart}
        onApplyPromo={applyPromo}
        onCheckout={checkout}
      />
    </>
  );
}

function SiteHeader({ route, cartCount, navigate, onLogoTap, onAccount, onCart }) {
  return (
    <header className="site-header">
      <a className="brand" href="/" onClick={onLogoTap} aria-label="OSCO home">
        <img src="/assets/osco-logo-mark.png" alt="" />
      </a>
      <nav className="main-nav" aria-label="Main navigation">
        <NavLink href="/" route={route} navigate={navigate}>Home</NavLink>
        <NavLink href="/shop" route={route} navigate={navigate}>Shop</NavLink>
        <NavLink href="/gallery" route={route} navigate={navigate}>Gallery</NavLink>
        <NavLink href="/contact" route={route} navigate={navigate}>Contact</NavLink>
      </nav>
      <div className="header-actions">
        <button className="ghost-button" type="button" onClick={onAccount}>Account</button>
        <button className="cart-toggle" type="button" onClick={onCart}>Cart <span>{cartCount}</span></button>
      </div>
    </header>
  );
}

function NavLink({ href, route, navigate, children }) {
  return (
    <a className={route === href ? "active" : ""} href={href} onClick={(event) => navigate(event, href)}>
      {children}
    </a>
  );
}

function HomePage({ products, events, reviews, promoBanners, shuttleItems, shuttleIndex, addToCart, navigate }) {
  const featured = products.slice(0, 4);
  const heroItem = shuttleItems.length ? shuttleItems[shuttleIndex % shuttleItems.length] : null;
  return (
    <>
      <section className="hero-section">
        <div className="hero-copy">
          <p className="eyebrow">Ghana-born clothing brand</p>
          <img className="hero-logo" src="/assets/osco-logo-full.jpeg" alt="OSCO Power From Beyond" />
          <h1>Power From Beyond.</h1>
          <p className="hero-text">
            OSCO creates clothing, visual moments, and experiences for people who carry confidence before they say a word.
          </p>
          <div className="hero-actions">
            <a className="primary-link" href="/shop" onClick={(event) => navigate(event, "/shop")}>Shop collection</a>
            <a className="secondary-link" href="/gallery" onClick={(event) => navigate(event, "/gallery")}>View gallery</a>
          </div>
        </div>
        <div className="hero-shuttle">
          <div className="shuttle-image-wrap">
            <img src={heroItem?.image || "/assets/osco-logo-full.jpeg"} alt={heroItem?.label || "OSCO"} />
          </div>
          <div className="shuttle-footer">
            <span>{heroItem?.label || "Upload product images"}</span>
            <span>{String((shuttleIndex % Math.max(shuttleItems.length, 1)) + 1).padStart(2, "0")}</span>
          </div>
        </div>
      </section>

      <PromoStrip banners={promoBanners} />

      <section className="brand-story-block">
        <p className="eyebrow">Brand description</p>
        <div>
          <h2>More than a shop. A living brand archive.</h2>
          <p>
            The website presents OSCO as a commercial store, a visual portfolio, and a record of campaigns,
            community moments, launches, and future announcements.
          </p>
        </div>
      </section>

      <section className="content-section">
        <SectionHeader eyebrow="Shop" title="Featured pieces" action="Open shop" href="/shop" navigate={navigate} />
        <ProductGrid products={featured} addToCart={addToCart} empty="Products added by the owner will appear here." />
      </section>

      <section className="split-feature">
        <div>
          <p className="eyebrow">Upcoming events</p>
          <h2>Announcements and drops</h2>
          <p>Use the staff console to announce pop-ups, shoots, releases, collaborations, and collection events.</p>
        </div>
        <EventAnnouncementList events={events.slice(0, 3)} />
      </section>

      <section className="content-section color-wash">
        <SectionHeader eyebrow="Customer reviews" title="What people are saying" />
        <ReviewGrid reviews={reviews} />
      </section>
    </>
  );
}

function ShopPage({ products, addToCart }) {
  return (
    <section className="page-shell">
      <PageIntro eyebrow="Shop" title="Products on sale" body="Browse available pieces, flashsale items, and trending selections. Customers must sign in before checkout." />
      {sections.map(([key, title]) => (
        <div className="shop-block" key={key}>
          <SectionHeader eyebrow={key === "new-arrivals" ? "Available now" : key === "flash-sale" ? "Limited offer" : "Selected by demand"} title={title} />
          <ProductGrid products={products.filter((product) => product.section === key)} addToCart={addToCart} empty="No products published in this section yet." />
        </div>
      ))}
    </section>
  );
}

function GalleryPage({ gallery, events, eventImages }) {
  const productLikeGallery = gallery.filter((item) => item.image_url);
  return (
    <section className="page-shell">
      <PageIntro eyebrow="Gallery" title="Campaigns, products and events" body="A visual archive for shoots, client moments, product imagery, launches, and event coverage." />
      <div className="gallery-grid">
        {productLikeGallery.length ? productLikeGallery.map((item, index) => (
          <GalleryCard item={item} key={item.id || item.image_url} wide={index % 5 === 0} />
        )) : <EmptyState>Gallery images added by the owner will appear here.</EmptyState>}
      </div>

      <div className="events-heading">
        <p className="eyebrow">Events</p>
        <h2>Announcements and event galleries</h2>
      </div>
      <EventAnnouncementList events={events} />
      <EventGalleryGroups events={events} eventImages={eventImages} />
    </section>
  );
}

function ContactPage() {
  const contact = config.contact || {};
  return (
    <section className="page-shell contact-page">
      <PageIntro eyebrow="Contact" title="Connect with OSCO" body="Reach the team for orders, collaborations, styling requests, event partnerships, and product questions." />
      <div className="contact-grid">
        <article className="contact-card">
          <h3>WhatsApp</h3>
          <p>Fastest contact for order questions and client communication.</p>
          <a className="primary-link" href={contact.whatsapp || "https://wa.me/233000000000"} target="_blank" rel="noreferrer">Open WhatsApp</a>
        </article>
        <article className="contact-card">
          <h3>Socials</h3>
          <p>Connect the live brand handles in <code>public/config.js</code>.</p>
          <div className="social-links">
            <a href={contact.instagram || "https://instagram.com/"} target="_blank" rel="noreferrer">Instagram</a>
            <a href={contact.tiktok || "https://tiktok.com/"} target="_blank" rel="noreferrer">TikTok</a>
            <a href={contact.snapchat || "https://snapchat.com/"} target="_blank" rel="noreferrer">Snapchat</a>
          </div>
        </article>
      </div>
    </section>
  );
}

function SiteFooter({ navigate }) {
  return (
    <footer className="site-footer">
      <div>
        <img src="/assets/osco-logo-mark.png" alt="" />
        <p>Power From Beyond.</p>
      </div>
      <nav aria-label="Footer navigation">
        <a href="/shop" onClick={(event) => navigate(event, "/shop")}>Shop</a>
        <a href="/gallery" onClick={(event) => navigate(event, "/gallery")}>Gallery</a>
        <a href="/contact" onClick={(event) => navigate(event, "/contact")}>Contact</a>
      </nav>
    </footer>
  );
}

function PromoStrip({ banners }) {
  if (!banners.length) return null;
  return (
    <section className="promo-strip">
      {banners.slice(0, 3).map((banner) => <div className="promo-card" key={banner.id}>{banner.body}</div>)}
    </section>
  );
}

function SectionHeader({ eyebrow, title, action, href, navigate }) {
  return (
    <div className="section-heading">
      <div>
        <p className="eyebrow">{eyebrow}</p>
        <h2>{title}</h2>
      </div>
      {action && href ? <a className="secondary-link" href={href} onClick={(event) => navigate(event, href)}>{action}</a> : null}
    </div>
  );
}

function PageIntro({ eyebrow, title, body }) {
  return (
    <header className="page-intro">
      <p className="eyebrow">{eyebrow}</p>
      <h1>{title}</h1>
      <p>{body}</p>
    </header>
  );
}

function ProductGrid({ products, addToCart, empty }) {
  if (!products.length) return <EmptyState>{empty}</EmptyState>;
  return (
    <div className="product-grid">
      {products.map((product) => <ProductCard product={product} addToCart={addToCart} key={product.id} />)}
    </div>
  );
}

function ProductCard({ product, addToCart }) {
  const discounted = isProductDiscounted(product);
  return (
    <article className="product-card">
      <div className="product-image">
        {discounted ? <span className="sale-badge">{Number(product.discount_percent)}% off</span> : null}
        <img src={product.image_url || "/assets/osco-logo-mark.png"} alt={product.name} loading="lazy" />
      </div>
      <div className="product-info">
        <div className="product-row">
          <h3>{product.name}</h3>
          <span className="price">
            {discounted ? <s>{money.format(Number(product.price_ghs))}</s> : null}
            {money.format(productPrice(product))}
          </span>
        </div>
        <p className="product-meta">{formatSizes(product.sizes)}</p>
        {product.description ? <p className="product-description">{product.description}</p> : null}
      </div>
      <button type="button" onClick={() => addToCart(product)}>Add to cart</button>
    </article>
  );
}

function GalleryCard({ item, wide }) {
  return (
    <article className={`gallery-card ${wide ? "wide" : ""}`}>
      <img src={item.image_url} alt={item.title || "OSCO gallery"} loading="lazy" />
      <div>
        <h3>{item.title || "OSCO"}</h3>
        {item.caption ? <p>{item.caption}</p> : null}
      </div>
    </article>
  );
}

function EventAnnouncementList({ events }) {
  if (!events.length) return <EmptyState>Event announcements will appear here.</EmptyState>;
  return (
    <div className="event-list">
      {events.map((event) => (
        <article className="event-card" key={event.id}>
          {event.image_url ? <img src={event.image_url} alt="" /> : null}
          <div>
            <p className="event-date">{event.event_date ? new Date(event.event_date).toLocaleDateString() : "Date to be announced"}</p>
            <h3>{event.title}</h3>
            {event.location ? <p className="product-meta">{event.location}</p> : null}
            {event.description ? <p>{event.description}</p> : null}
          </div>
        </article>
      ))}
    </div>
  );
}

function EventGalleryGroups({ events, eventImages }) {
  const groups = events
    .map((event) => ({ event, images: eventImages.filter((image) => image.event_id === event.id) }))
    .filter((group) => group.images.length);
  if (!groups.length) return <EmptyState>Event images will be grouped here after upload.</EmptyState>;
  return groups.map(({ event, images }) => (
    <section className="event-gallery-group" key={event.id}>
      <h3>{event.title}</h3>
      <div className="gallery-grid compact">
        {images.map((image) => <GalleryCard item={image} key={image.id} />)}
      </div>
    </section>
  ));
}

function ReviewGrid({ reviews }) {
  if (!reviews.length) return <EmptyState>Customer reviews can be added from the staff console.</EmptyState>;
  return (
    <div className="review-grid">
      {reviews.slice(0, 6).map((review) => (
        <article className="review-card" key={review.id}>
          <div className="rating">{"★".repeat(Math.max(1, Math.min(5, Number(review.rating || 5))))}</div>
          <p>{review.review}</p>
          <strong>{review.customer_name}</strong>
          {review.role_or_location ? <span>{review.role_or_location}</span> : null}
        </article>
      ))}
    </div>
  );
}

function AuthModal({ open, session, profile, message, onClose, onSignIn, onSignUp, onSignOut }) {
  const [mode, setMode] = useState("signin");
  if (!open) return null;
  return (
    <div className="modal" role="dialog" aria-modal="true">
      <div className="modal-card">
        <div className="modal-topline">
          <div>
            <p className="eyebrow">Customer account</p>
            <h2>{session ? "Account" : mode === "signin" ? "Sign in" : "Create account"}</h2>
          </div>
          <button className="ghost-button" type="button" onClick={onClose}>Close</button>
        </div>
        {session ? (
          <div className="account-card">
            <p className="eyebrow">Signed in</p>
            <h3>{profile?.full_name || session.user.email}</h3>
            <p>{session.user.email}</p>
            <button className="ghost-button" type="button" onClick={onSignOut}>Sign out</button>
          </div>
        ) : (
          <form className="stack-form" onSubmit={(event) => {
            event.preventDefault();
            mode === "signin" ? onSignIn(event.currentTarget) : onSignUp(event.currentTarget);
          }}>
            {mode === "signup" ? (
              <>
                <label>Full name <input name="full_name" autoComplete="name" required /></label>
                <label>Phone <input name="phone" autoComplete="tel" /></label>
              </>
            ) : null}
            <label>Email <input name="email" type="email" autoComplete="email" required /></label>
            <label>Password <input name="password" type="password" autoComplete={mode === "signin" ? "current-password" : "new-password"} required /></label>
            <div className="form-actions">
              <button type="submit">{mode === "signin" ? "Sign in" : "Create account"}</button>
              <button className="ghost-button" type="button" onClick={() => setMode(mode === "signin" ? "signup" : "signin")}>
                {mode === "signin" ? "New account" : "I have an account"}
              </button>
            </div>
            <p className="helper">{message}</p>
          </form>
        )}
      </div>
    </div>
  );
}

function CartDrawer({ open, cart, products, session, profile, appliedPromo, promoMessage, checkoutMessage, onClose, onUpdate, onApplyPromo, onCheckout }) {
  const subtotal = cartSubtotal(cart, products);
  const discount = promoDiscount(appliedPromo, subtotal);
  return (
    <aside className={`cart-panel ${open ? "open" : ""}`} aria-hidden={!open}>
      <div className="cart-header">
        <h2>Your cart</h2>
        <button className="ghost-button" type="button" onClick={onClose}>Close</button>
      </div>
      <div className="cart-items">
        {cart.length ? cart.map((item) => {
          const product = products.find((entry) => entry.id === item.product_id);
          if (!product) return null;
          return (
            <div className="cart-line" key={item.product_id}>
              <div>
                <strong>{product.name}</strong>
                <p>{money.format(productPrice(product))} x {item.quantity}</p>
              </div>
              <div className="cart-line-controls">
                <button type="button" onClick={() => onUpdate(item.product_id, -1)}>-</button>
                <span>{item.quantity}</span>
                <button type="button" onClick={() => onUpdate(item.product_id, 1)}>+</button>
              </div>
            </div>
          );
        }) : <EmptyState>Your cart is ready when you are.</EmptyState>}
        <div className="cart-total"><span>Subtotal</span><strong>{money.format(subtotal)}</strong></div>
        {discount > 0 ? <div className="cart-total"><span>{appliedPromo.code}</span><strong>-{money.format(discount)}</strong></div> : null}
        <div className="cart-total grand"><span>Total</span><strong>{money.format(Math.max(0, subtotal - discount))}</strong></div>
      </div>
      <form className="checkout-form" onSubmit={(event) => {
        event.preventDefault();
        onCheckout(event.currentTarget);
      }}>
        <p className="helper">{session ? `Signed in as ${session.user.email}` : "Sign in before checkout."}</p>
        <label>Email <input value={session?.user?.email || ""} disabled /></label>
        <label>Full name <input name="name" defaultValue={profile?.full_name || ""} required /></label>
        <label>Phone <input name="phone" defaultValue={profile?.phone || ""} required /></label>
        <label>Delivery address <textarea name="address" rows="3" required /></label>
        <div className="promo-apply">
          <label>Promo code <input name="promo" placeholder="Enter code" /></label>
          <button className="ghost-button" type="button" onClick={(event) => onApplyPromo(event.currentTarget.form.elements.promo.value)}>Apply</button>
        </div>
        <button type="submit">Checkout with Paystack</button>
        <p className="helper">{promoMessage}</p>
        <p className="helper">{checkoutMessage}</p>
      </form>
    </aside>
  );
}

function AdminApp() {
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [message, setMessage] = useState("");
  const [tab, setTab] = useState("products");
  const [data, setData] = useState(emptyAdminData());
  const [editing, setEditing] = useState({});

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: sessionData }) => {
      setSession(sessionData.session);
      setProfile(await getProfile(sessionData.session));
    });
  }, []);

  useEffect(() => {
    if (isStaff(profile)) refreshAdminData();
  }, [profile]);

  async function refreshAdminData() {
    const next = await loadAdminData();
    setData(next);
  }

  async function signIn(form) {
    setMessage("Opening staff console...");
    const formData = Object.fromEntries(new FormData(form).entries());
    const { data: authData, error } = await supabase.auth.signInWithPassword({
      email: formData.email,
      password: formData.password,
    });
    if (error) {
      setMessage("Unable to sign in.");
      return;
    }
    const nextProfile = await getProfile(authData.session);
    setSession(authData.session);
    setProfile(nextProfile);
    setMessage(isStaff(nextProfile) ? "" : "This account does not have owner or staff access.");
  }

  async function signOut() {
    await supabase.auth.signOut();
    setSession(null);
    setProfile(null);
    setData(emptyAdminData());
  }

  if (!isStaff(profile)) {
    return (
      <main className="admin-login-page">
        <section className="admin-login-card">
          <img src="/assets/osco-logo-full.jpeg" alt="OSCO Power From Beyond" />
          <p className="eyebrow">Private staff console</p>
          <h1>Owner access</h1>
          <form className="stack-form" onSubmit={(event) => {
            event.preventDefault();
            signIn(event.currentTarget);
          }}>
            <label>Email <input name="email" type="email" autoComplete="email" required /></label>
            <label>Password <input name="password" type="password" autoComplete="current-password" required /></label>
            <button type="submit">Open console</button>
            <p className="helper">{message}</p>
          </form>
          <a className="secondary-link" href="/">Back to site</a>
        </section>
      </main>
    );
  }

  return (
    <main className="admin-console-page">
      <section className="admin-console">
        <div className="admin-topline">
          <div>
            <p className="eyebrow">OSCO staff</p>
            <h1>Content, shop and orders</h1>
          </div>
          <div className="form-actions">
            <a className="secondary-link" href="/">Public site</a>
            <button type="button" onClick={signOut}>Sign out</button>
          </div>
        </div>
        <div className="admin-tabs">
          {["products", "gallery", "events", "reviews", "promos", "banners", "orders", "staff"].map((item) => (
            <button className={tab === item ? "active" : ""} type="button" key={item} onClick={() => setTab(item)}>{adminTabLabel(item)}</button>
          ))}
        </div>

        {tab === "products" && <ProductsAdmin data={data} setEditing={setEditing} editing={editing.product} setMessage={setMessage} refresh={refreshAdminData} />}
        {tab === "gallery" && <GalleryAdmin data={data} setEditing={setEditing} editing={editing.gallery} setMessage={setMessage} refresh={refreshAdminData} />}
        {tab === "events" && <EventsAdmin data={data} setEditing={setEditing} editing={editing} setMessage={setMessage} refresh={refreshAdminData} />}
        {tab === "reviews" && <ReviewsAdmin data={data} setEditing={setEditing} editing={editing.review} setMessage={setMessage} refresh={refreshAdminData} />}
        {tab === "promos" && <PromosAdmin data={data} setEditing={setEditing} editing={editing.promo} setMessage={setMessage} refresh={refreshAdminData} />}
        {tab === "banners" && <BannersAdmin data={data} setEditing={setEditing} editing={editing.banner} setMessage={setMessage} refresh={refreshAdminData} />}
        {tab === "orders" && <OrdersAdmin data={data} setMessage={setMessage} refresh={refreshAdminData} />}
        {tab === "staff" && <StaffAdmin data={data} session={session} profile={profile} setMessage={setMessage} refresh={refreshAdminData} />}
        <p className="admin-message">{message}</p>
      </section>
    </main>
  );
}

function ProductsAdmin({ data, editing, setEditing, setMessage, refresh }) {
  return (
    <AdminPanel>
      <form className="stack-form admin-form" onSubmit={(event) => handleProductSave(event, editing, setMessage, refresh, setEditing)}>
        <input name="id" type="hidden" value={editing?.id || ""} readOnly />
        <label>Product name <input name="name" defaultValue={editing?.name || ""} required /></label>
        <label>Price (GHS) <input name="price_ghs" type="number" min="1" defaultValue={editing?.price_ghs || ""} required /></label>
        <label>Section
          <select name="section" defaultValue={editing?.section || "new-arrivals"}>
            {sections.map(([value, label]) => <option value={value} key={value}>{label}</option>)}
          </select>
        </label>
        <label>Sizes <input name="sizes" placeholder="S, M, L, XL" defaultValue={formatSizes(editing?.sizes)} /></label>
        <label>Product image upload <input name="file" type="file" accept="image/png,image/jpeg,image/webp" /></label>
        <label>Image URL <input name="image_url" defaultValue={editing?.image_url || ""} placeholder="Optional hosted image URL" /></label>
        <div className="form-grid">
          <label>Discount % <input name="discount_percent" type="number" min="0" max="95" defaultValue={editing?.discount_percent || 0} /></label>
          <label>Sort order <input name="sort_order" type="number" defaultValue={editing?.sort_order || 0} /></label>
        </div>
        <label>Description <textarea name="description" rows="3" defaultValue={editing?.description || ""} /></label>
        <label className="check-row"><input name="active" type="checkbox" defaultChecked={editing ? editing.active : true} /> Active</label>
        <label className="check-row"><input name="discount_active" type="checkbox" defaultChecked={Boolean(editing?.discount_active)} /> Activate discount</label>
        <div className="form-actions">
          <button type="submit">{editing ? "Update product" : "Save product"}</button>
          <button className="ghost-button" type="button" onClick={() => setEditing((all) => ({ ...all, product: null }))}>Clear</button>
        </div>
      </form>
      <div className="admin-list">
        {data.products.length ? data.products.map((product) => (
          <article className="admin-item media-admin-item" key={product.id}>
            <img src={product.image_url || "/assets/osco-logo-mark.png"} alt="" />
            <div>
              <h3>{product.name}</h3>
              <p className="product-meta">{labelForSection(product.section)} | {product.active ? "Active" : "Hidden"} | {isProductDiscounted(product) ? `${Number(product.discount_percent)}% off` : "No discount"}</p>
              <p>{money.format(productPrice(product))}</p>
              <div className="admin-item-actions">
                <button type="button" onClick={() => setEditing((all) => ({ ...all, product }))}>Edit</button>
                <button className="danger-button" type="button" onClick={() => archiveRecord("products", product.id, setMessage, refresh)}>Archive</button>
              </div>
            </div>
          </article>
        )) : <EmptyState>No products yet.</EmptyState>}
      </div>
    </AdminPanel>
  );
}

function GalleryAdmin({ data, editing, setEditing, setMessage, refresh }) {
  return (
    <AdminPanel>
      <form className="stack-form admin-form" onSubmit={(event) => handleGallerySave(event, editing, setMessage, refresh, setEditing)}>
        <input name="id" type="hidden" value={editing?.id || ""} readOnly />
        <label>Title <input name="title" defaultValue={editing?.title || ""} required /></label>
        <label>Caption <textarea name="caption" rows="3" defaultValue={editing?.caption || ""} /></label>
        <label>Gallery image upload <input name="file" type="file" accept="image/png,image/jpeg,image/webp" /></label>
        <label>Image URL <input name="image_url" defaultValue={editing?.image_url || ""} /></label>
        <label>Sort order <input name="sort_order" type="number" defaultValue={editing?.sort_order || 0} /></label>
        <label className="check-row"><input name="active" type="checkbox" defaultChecked={editing ? editing.active : true} /> Active</label>
        <div className="form-actions">
          <button type="submit">{editing ? "Update image" : "Save image"}</button>
          <button className="ghost-button" type="button" onClick={() => setEditing((all) => ({ ...all, gallery: null }))}>Clear</button>
        </div>
      </form>
      <MediaList items={data.gallery} empty="No gallery images yet." onEdit={(gallery) => setEditing((all) => ({ ...all, gallery }))} onArchive={(id) => archiveRecord("gallery_images", id, setMessage, refresh)} />
    </AdminPanel>
  );
}

function EventsAdmin({ data, editing, setEditing, setMessage, refresh }) {
  return (
    <div className="double-admin">
      <AdminPanel>
        <form className="stack-form admin-form" onSubmit={(event) => handleEventSave(event, editing.event, setMessage, refresh, setEditing)}>
          <input name="id" type="hidden" value={editing.event?.id || ""} readOnly />
          <label>Event title <input name="title" defaultValue={editing.event?.title || ""} required /></label>
          <label>Date <input name="event_date" type="date" defaultValue={editing.event?.event_date || ""} /></label>
          <label>Location <input name="location" defaultValue={editing.event?.location || ""} /></label>
          <label>Cover image upload <input name="file" type="file" accept="image/png,image/jpeg,image/webp" /></label>
          <label>Cover image URL <input name="image_url" defaultValue={editing.event?.image_url || ""} /></label>
          <label>Description <textarea name="description" rows="3" defaultValue={editing.event?.description || ""} /></label>
          <label>Sort order <input name="sort_order" type="number" defaultValue={editing.event?.sort_order || 0} /></label>
          <label className="check-row"><input name="active" type="checkbox" defaultChecked={editing.event ? editing.event.active : true} /> Active</label>
          <div className="form-actions">
            <button type="submit">{editing.event ? "Update event" : "Save event"}</button>
            <button className="ghost-button" type="button" onClick={() => setEditing((all) => ({ ...all, event: null }))}>Clear</button>
          </div>
        </form>
        <div className="admin-list">
          {data.events.length ? data.events.map((event) => (
            <article className="admin-item media-admin-item" key={event.id}>
              <img src={event.image_url || "/assets/osco-logo-mark.png"} alt="" />
              <div>
                <h3>{event.title}</h3>
                <p className="product-meta">{event.event_date || "No date"} | {event.active ? "Active" : "Hidden"}</p>
                <p>{event.description}</p>
                <div className="admin-item-actions">
                  <button type="button" onClick={() => setEditing((all) => ({ ...all, event }))}>Edit</button>
                  <button className="danger-button" type="button" onClick={() => archiveRecord("events", event.id, setMessage, refresh)}>Archive</button>
                </div>
              </div>
            </article>
          )) : <EmptyState>No events yet.</EmptyState>}
        </div>
      </AdminPanel>

      <AdminPanel>
        <form className="stack-form admin-form" onSubmit={(event) => handleEventImageSave(event, editing.eventImage, setMessage, refresh, setEditing)}>
          <input name="id" type="hidden" value={editing.eventImage?.id || ""} readOnly />
          <label>Event
            <select name="event_id" defaultValue={editing.eventImage?.event_id || ""} required>
              <option value="">Choose event</option>
              {data.events.map((event) => <option value={event.id} key={event.id}>{event.title}</option>)}
            </select>
          </label>
          <label>Image title <input name="title" defaultValue={editing.eventImage?.title || ""} required /></label>
          <label>Caption <textarea name="caption" rows="3" defaultValue={editing.eventImage?.caption || ""} /></label>
          <label>Image upload <input name="file" type="file" accept="image/png,image/jpeg,image/webp" /></label>
          <label>Image URL <input name="image_url" defaultValue={editing.eventImage?.image_url || ""} /></label>
          <label>Sort order <input name="sort_order" type="number" defaultValue={editing.eventImage?.sort_order || 0} /></label>
          <label className="check-row"><input name="active" type="checkbox" defaultChecked={editing.eventImage ? editing.eventImage.active : true} /> Active</label>
          <div className="form-actions">
            <button type="submit">{editing.eventImage ? "Update event image" : "Save event image"}</button>
            <button className="ghost-button" type="button" onClick={() => setEditing((all) => ({ ...all, eventImage: null }))}>Clear</button>
          </div>
        </form>
        <MediaList items={data.eventImages} empty="No event images yet." onEdit={(eventImage) => setEditing((all) => ({ ...all, eventImage }))} onArchive={(id) => archiveRecord("event_gallery_images", id, setMessage, refresh)} />
      </AdminPanel>
    </div>
  );
}

function ReviewsAdmin({ data, editing, setEditing, setMessage, refresh }) {
  return (
    <AdminPanel>
      <form className="stack-form admin-form" onSubmit={(event) => handleReviewSave(event, editing, setMessage, refresh, setEditing)}>
        <input name="id" type="hidden" value={editing?.id || ""} readOnly />
        <label>Customer name <input name="customer_name" defaultValue={editing?.customer_name || ""} required /></label>
        <label>Role/location <input name="role_or_location" defaultValue={editing?.role_or_location || ""} /></label>
        <label>Rating <input name="rating" type="number" min="1" max="5" defaultValue={editing?.rating || 5} /></label>
        <label>Review <textarea name="review" rows="4" defaultValue={editing?.review || ""} required /></label>
        <label>Sort order <input name="sort_order" type="number" defaultValue={editing?.sort_order || 0} /></label>
        <label className="check-row"><input name="active" type="checkbox" defaultChecked={editing ? editing.active : true} /> Active</label>
        <div className="form-actions">
          <button type="submit">{editing ? "Update review" : "Save review"}</button>
          <button className="ghost-button" type="button" onClick={() => setEditing((all) => ({ ...all, review: null }))}>Clear</button>
        </div>
      </form>
      <div className="admin-list">
        {data.reviews.length ? data.reviews.map((review) => (
          <article className="admin-item" key={review.id}>
            <h3>{review.customer_name}</h3>
            <p>{review.review}</p>
            <p className="product-meta">{review.rating} stars | {review.active ? "Active" : "Hidden"}</p>
            <div className="admin-item-actions">
              <button type="button" onClick={() => setEditing((all) => ({ ...all, review }))}>Edit</button>
              <button className="danger-button" type="button" onClick={() => archiveRecord("customer_reviews", review.id, setMessage, refresh)}>Archive</button>
            </div>
          </article>
        )) : <EmptyState>No reviews yet.</EmptyState>}
      </div>
    </AdminPanel>
  );
}

function PromosAdmin({ data, editing, setEditing, setMessage, refresh }) {
  return (
    <AdminPanel>
      <form className="stack-form admin-form" onSubmit={(event) => handlePromoSave(event, editing, setMessage, refresh, setEditing)}>
        <input name="id" type="hidden" value={editing?.id || ""} readOnly />
        <label>Code <input name="code" defaultValue={editing?.code || ""} placeholder="OSCO10" required /></label>
        <label>Discount type
          <select name="discount_type" defaultValue={editing?.discount_type || "percent"}>
            <option value="percent">Percent</option>
            <option value="fixed">Fixed amount</option>
          </select>
        </label>
        <label>Value <input name="discount_value" type="number" min="1" defaultValue={editing?.discount_value || ""} required /></label>
        <label>Minimum order (GHS) <input name="min_order_ghs" type="number" min="0" defaultValue={editing?.min_order_ghs || 0} /></label>
        <label className="check-row"><input name="active" type="checkbox" defaultChecked={editing ? editing.active : true} /> Active</label>
        <div className="form-actions">
          <button type="submit">{editing ? "Update promo" : "Save promo"}</button>
          <button className="ghost-button" type="button" onClick={() => setEditing((all) => ({ ...all, promo: null }))}>Clear</button>
        </div>
      </form>
      <div className="admin-list">
        {data.promos.length ? data.promos.map((promo) => (
          <article className="admin-item" key={promo.id}>
            <h3>{promo.code}</h3>
            <p className="product-meta">{promo.active ? "Active" : "Hidden"} | {labelForPromo(promo)}</p>
            <div className="admin-item-actions">
              <button type="button" onClick={() => setEditing((all) => ({ ...all, promo }))}>Edit</button>
              <button className="danger-button" type="button" onClick={() => archiveRecord("promo_codes", promo.id, setMessage, refresh)}>Archive</button>
            </div>
          </article>
        )) : <EmptyState>No promo codes yet.</EmptyState>}
      </div>
    </AdminPanel>
  );
}

function BannersAdmin({ data, editing, setEditing, setMessage, refresh }) {
  return (
    <AdminPanel>
      <form className="stack-form admin-form" onSubmit={(event) => handleBannerSave(event, editing, setMessage, refresh, setEditing)}>
        <input name="id" type="hidden" value={editing?.id || ""} readOnly />
        <label>Placement
          <select name="placement" defaultValue={editing?.placement || "promo"}>
            <option value="promo">Promo banner</option>
            <option value="notification">Top notification</option>
          </select>
        </label>
        <label>Message <input name="body" defaultValue={editing?.body || ""} required /></label>
        <label className="check-row"><input name="active" type="checkbox" defaultChecked={editing ? editing.active : true} /> Active</label>
        <div className="form-actions">
          <button type="submit">{editing ? "Update banner" : "Save banner"}</button>
          <button className="ghost-button" type="button" onClick={() => setEditing((all) => ({ ...all, banner: null }))}>Clear</button>
        </div>
      </form>
      <div className="admin-list">
        {data.banners.length ? data.banners.map((banner) => (
          <article className="admin-item" key={banner.id}>
            <h3>{banner.placement === "notification" ? "Top notification" : "Promo banner"}</h3>
            <p>{banner.body}</p>
            <p className="product-meta">{banner.active ? "Active" : "Hidden"}</p>
            <div className="admin-item-actions">
              <button type="button" onClick={() => setEditing((all) => ({ ...all, banner }))}>Edit</button>
              <button className="danger-button" type="button" onClick={() => deleteRecord("banners", banner.id, setMessage, refresh)}>Delete</button>
            </div>
          </article>
        )) : <EmptyState>No banners yet.</EmptyState>}
      </div>
    </AdminPanel>
  );
}

function OrdersAdmin({ data, setMessage, refresh }) {
  return (
    <div className="admin-list">
      {data.orders.length ? data.orders.map((order) => (
        <article className="admin-item" key={order.id}>
          <div className="product-row">
            <div>
              <h3>{order.reference}</h3>
              <p className="product-meta">{new Date(order.created_at).toLocaleString()} | {order.status}</p>
            </div>
            <strong>{money.format(Number(order.total_ghs))}</strong>
          </div>
          <p>{order.customer_name} | {order.customer_email} | {order.customer_phone}</p>
          <p>{order.delivery_address}</p>
          {order.promo_code ? <p className="product-meta">Promo: {order.promo_code} / Discount: {money.format(Number(order.discount_ghs || 0))}</p> : null}
          <div>{(order.order_items || []).map((item) => <span key={`${order.id}-${item.name}`}>{item.name} x {item.quantity}<br /></span>)}</div>
          <div className="admin-item-actions">
            {["paid", "processing", "shipped", "fulfilled", "cancelled"].map((status) => (
              <button className={status === "cancelled" ? "danger-button" : ""} type="button" key={status} onClick={() => updateOrder(order, status, setMessage, refresh)}>{status}</button>
            ))}
          </div>
        </article>
      )) : <EmptyState>No orders yet.</EmptyState>}
    </div>
  );
}

function StaffAdmin({ data, session, profile, setMessage, refresh }) {
  return (
    <AdminPanel>
      <form className="stack-form admin-form" onSubmit={(event) => handleStaffSave(event, session, profile, setMessage, refresh)}>
        <label>Full name <input name="full_name" autoComplete="name" required /></label>
        <label>Phone <input name="phone" autoComplete="tel" /></label>
        <label>Email <input name="email" type="email" autoComplete="email" required /></label>
        <label>Temporary password <input name="password" type="password" autoComplete="new-password" minLength="8" required /></label>
        <label>Access level
          <select name="role">
            <option value="admin">Owner</option>
            <option value="staff">Staff</option>
          </select>
        </label>
        <button type="submit">Add account</button>
      </form>
      <div className="admin-list">
        {data.staff.length ? data.staff.map((person) => (
          <article className="admin-item" key={person.id}>
            <h3>{person.full_name || "Unnamed account"}</h3>
            <p className="product-meta">{person.email} | {person.phone || "No phone"} | {person.role === "admin" ? "Owner" : "Staff"}</p>
          </article>
        )) : <EmptyState>No staff accounts yet.</EmptyState>}
      </div>
    </AdminPanel>
  );
}

function AdminPanel({ children }) {
  return <div className="admin-panel">{children}</div>;
}

function MediaList({ items, empty, onEdit, onArchive }) {
  return (
    <div className="admin-list">
      {items.length ? items.map((item) => (
        <article className="admin-item media-admin-item" key={item.id}>
          <img src={item.image_url || "/assets/osco-logo-mark.png"} alt="" />
          <div>
            <h3>{item.title || "Untitled"}</h3>
            <p className="product-meta">{item.active ? "Active" : "Hidden"} | Sort {Number(item.sort_order || 0)}</p>
            <p>{item.caption}</p>
            <div className="admin-item-actions">
              <button type="button" onClick={() => onEdit(item)}>Edit</button>
              <button className="danger-button" type="button" onClick={() => onArchive(item.id)}>Archive</button>
            </div>
          </div>
        </article>
      )) : <EmptyState>{empty}</EmptyState>}
    </div>
  );
}

function EmptyState({ children }) {
  return <div className="empty-state">{children}</div>;
}

async function loadPublicData() {
  const [products, banners, gallery, events, eventImages, reviews, promos] = await Promise.all([
    loadProducts(false),
    safeSelect("banners", "id, placement, body, active", false),
    safeSelect("gallery_images", "id, title, caption, image_url, active, sort_order", false),
    safeSelect("events", "id, title, description, event_date, location, image_url, active, sort_order", false),
    safeSelect("event_gallery_images", "id, event_id, title, caption, image_url, active, sort_order", false),
    safeSelect("customer_reviews", "id, customer_name, role_or_location, review, rating, active, sort_order", false),
    safeSelect("promo_codes", "id, code, discount_type, discount_value, min_order_ghs, active", false),
  ]);
  return { products, banners, gallery, events, eventImages, reviews, promos };
}

async function loadAdminData() {
  const [products, banners, gallery, events, eventImages, reviews, promos, orders, staff] = await Promise.all([
    loadProducts(true),
    safeSelect("banners", "id, placement, body, active", true),
    safeSelect("gallery_images", "id, title, caption, image_url, active, sort_order", true),
    safeSelect("events", "id, title, description, event_date, location, image_url, active, sort_order", true),
    safeSelect("event_gallery_images", "id, event_id, title, caption, image_url, active, sort_order", true),
    safeSelect("customer_reviews", "id, customer_name, role_or_location, review, rating, active, sort_order", true),
    safeSelect("promo_codes", "id, code, discount_type, discount_value, min_order_ghs, active", true),
    safeSelect("orders", "id, reference, status, total_ghs, discount_ghs, promo_code, customer_name, customer_email, customer_phone, delivery_address, created_at, order_items(name, price_ghs, quantity)", true, "created_at", false),
    safeSelect("profiles", "id, email, full_name, phone, role", true),
  ]);
  return { products, banners, gallery, events, eventImages, reviews, promos, orders, staff: staff.filter((person) => ["admin", "staff"].includes(person.role)) };
}

async function loadProducts(includeInactive) {
  const fullSelect = "id, name, price_ghs, section, sizes, description, image_url, active, sort_order, discount_active, discount_percent";
  const fallbackSelect = "id, name, price_ghs, section, sizes, description, image_url, active, sort_order";
  let result = await productQuery(fullSelect, includeInactive);
  if (result.error) {
    result = await productQuery(fallbackSelect, includeInactive);
  }
  return (result.data || []).map((product) => ({
    ...product,
    discount_active: Boolean(product.discount_active),
    discount_percent: Number(product.discount_percent || 0),
  }));
}

function productQuery(select, includeInactive) {
  let query = supabase.from("products").select(select).order("sort_order", { ascending: true }).order("created_at", { ascending: false });
  if (!includeInactive) query = query.eq("active", true);
  return query;
}

async function safeSelect(table, select, includeInactive, orderColumn = "sort_order", ascending = true) {
  let query = supabase.from(table).select(select).order(orderColumn, { ascending });
  if (!includeInactive && select.includes("active")) query = query.eq("active", true);
  const { data, error } = await query;
  if (error) {
    console.warn(`${table}: ${error.message}`);
    return [];
  }
  return data || [];
}

async function getProfile(session) {
  if (!session) return null;
  const { data, error } = await supabase
    .from("profiles")
    .select("id, email, full_name, phone, role")
    .eq("id", session.user.id)
    .maybeSingle();
  if (error) console.warn(error.message);
  return data || null;
}

async function resolveImageUrl(bucket, folder, file, pastedUrl, recordId) {
  if (!file || !file.name) return pastedUrl || null;
  const extension = file.name.split(".").pop()?.toLowerCase().replace(/[^a-z0-9]/g, "") || "jpg";
  const path = `${folder}/${recordId || crypto.randomUUID()}-${Date.now()}.${extension}`;
  const { error } = await supabase.storage.from(bucket).upload(path, file, {
    cacheControl: "3600",
    upsert: false,
  });
  if (error) {
    if (error.message?.toLowerCase().includes("bucket not found")) {
      throw new Error(`Storage bucket "${bucket}" was not found. Run the latest supabase-schema.sql in Supabase SQL Editor, then refresh this page.`);
    }
    throw error;
  }
  return supabase.storage.from(bucket).getPublicUrl(path).data.publicUrl;
}

async function handleProductSave(event, editing, setMessage, refresh, setEditing) {
  event.preventDefault();
  setMessage("Saving product...");
  try {
    const form = event.currentTarget;
    const data = Object.fromEntries(new FormData(form).entries());
    const imageUrl = await resolveImageUrl("product-images", "products", form.elements.file.files[0], data.image_url, data.id);
    const product = {
      name: data.name,
      price_ghs: Number(data.price_ghs),
      section: data.section,
      sizes: parseSizes(data.sizes),
      image_url: imageUrl,
      description: data.description,
      active: Boolean(data.active),
      sort_order: Number(data.sort_order || 0),
      discount_active: Boolean(data.discount_active),
      discount_percent: Number(data.discount_percent || 0),
    };
    await upsertRecord("products", data.id, product);
    form.reset();
    setEditing((all) => ({ ...all, product: null }));
    setMessage("Product saved.");
    await refresh();
  } catch (error) {
    setMessage(error.message || "Unable to save product.");
  }
}

async function handleGallerySave(event, editing, setMessage, refresh, setEditing) {
  event.preventDefault();
  setMessage("Saving gallery image...");
  try {
    const form = event.currentTarget;
    const data = Object.fromEntries(new FormData(form).entries());
    const imageUrl = await resolveImageUrl("gallery-images", "gallery", form.elements.file.files[0], data.image_url, data.id);
    await upsertRecord("gallery_images", data.id, {
      title: data.title,
      caption: data.caption,
      image_url: imageUrl,
      active: Boolean(data.active),
      sort_order: Number(data.sort_order || 0),
    });
    form.reset();
    setEditing((all) => ({ ...all, gallery: null }));
    setMessage("Gallery image saved.");
    await refresh();
  } catch (error) {
    setMessage(error.message || "Unable to save gallery image.");
  }
}

async function handleEventSave(event, editing, setMessage, refresh, setEditing) {
  event.preventDefault();
  setMessage("Saving event...");
  try {
    const form = event.currentTarget;
    const data = Object.fromEntries(new FormData(form).entries());
    const imageUrl = await resolveImageUrl("gallery-images", "events", form.elements.file.files[0], data.image_url, data.id);
    await upsertRecord("events", data.id, {
      title: data.title,
      description: data.description,
      event_date: data.event_date || null,
      location: data.location,
      image_url: imageUrl,
      active: Boolean(data.active),
      sort_order: Number(data.sort_order || 0),
    });
    form.reset();
    setEditing((all) => ({ ...all, event: null }));
    setMessage("Event saved.");
    await refresh();
  } catch (error) {
    setMessage(error.message || "Unable to save event.");
  }
}

async function handleEventImageSave(event, editing, setMessage, refresh, setEditing) {
  event.preventDefault();
  setMessage("Saving event image...");
  try {
    const form = event.currentTarget;
    const data = Object.fromEntries(new FormData(form).entries());
    const imageUrl = await resolveImageUrl("gallery-images", "event-gallery", form.elements.file.files[0], data.image_url, data.id);
    await upsertRecord("event_gallery_images", data.id, {
      event_id: data.event_id,
      title: data.title,
      caption: data.caption,
      image_url: imageUrl,
      active: Boolean(data.active),
      sort_order: Number(data.sort_order || 0),
    });
    form.reset();
    setEditing((all) => ({ ...all, eventImage: null }));
    setMessage("Event image saved.");
    await refresh();
  } catch (error) {
    setMessage(error.message || "Unable to save event image.");
  }
}

async function handleReviewSave(event, editing, setMessage, refresh, setEditing) {
  event.preventDefault();
  setMessage("Saving review...");
  try {
    const data = Object.fromEntries(new FormData(event.currentTarget).entries());
    await upsertRecord("customer_reviews", data.id, {
      customer_name: data.customer_name,
      role_or_location: data.role_or_location,
      review: data.review,
      rating: Number(data.rating || 5),
      active: Boolean(data.active),
      sort_order: Number(data.sort_order || 0),
    });
    event.currentTarget.reset();
    setEditing((all) => ({ ...all, review: null }));
    setMessage("Review saved.");
    await refresh();
  } catch (error) {
    setMessage(error.message || "Unable to save review.");
  }
}

async function handlePromoSave(event, editing, setMessage, refresh, setEditing) {
  event.preventDefault();
  setMessage("Saving promo code...");
  try {
    const data = Object.fromEntries(new FormData(event.currentTarget).entries());
    await upsertRecord("promo_codes", data.id, {
      code: data.code.toUpperCase(),
      discount_type: data.discount_type,
      discount_value: Number(data.discount_value),
      min_order_ghs: Number(data.min_order_ghs || 0),
      active: Boolean(data.active),
    });
    event.currentTarget.reset();
    setEditing((all) => ({ ...all, promo: null }));
    setMessage("Promo code saved.");
    await refresh();
  } catch (error) {
    setMessage(error.message || "Unable to save promo code.");
  }
}

async function handleBannerSave(event, editing, setMessage, refresh, setEditing) {
  event.preventDefault();
  setMessage("Saving banner...");
  try {
    const data = Object.fromEntries(new FormData(event.currentTarget).entries());
    await upsertRecord("banners", data.id, {
      placement: data.placement,
      body: data.body,
      active: Boolean(data.active),
    });
    event.currentTarget.reset();
    setEditing((all) => ({ ...all, banner: null }));
    setMessage("Banner saved.");
    await refresh();
  } catch (error) {
    setMessage(error.message || "Unable to save banner.");
  }
}

async function handleStaffSave(event, session, profile, setMessage, refresh) {
  event.preventDefault();
  if (profile?.role !== "admin") {
    setMessage("Only an owner can add accounts.");
    return;
  }
  setMessage("Adding account...");
  const data = Object.fromEntries(new FormData(event.currentTarget).entries());
  const response = await fetch("/api/create-staff-user", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${session.access_token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(data),
  });
  const result = await response.json();
  if (!response.ok) {
    setMessage(result.error || "Unable to add account.");
    return;
  }
  event.currentTarget.reset();
  setMessage("Account added.");
  await refresh();
}

async function upsertRecord(table, id, payload) {
  const query = id
    ? supabase.from(table).update(payload).eq("id", id)
    : supabase.from(table).insert(payload);
  const { error } = await query;
  if (error) throw error;
}

async function archiveRecord(table, id, setMessage, refresh) {
  const { error } = await supabase.from(table).update({ active: false }).eq("id", id);
  if (error) {
    setMessage(error.message);
    return;
  }
  setMessage("Archived.");
  await refresh();
}

async function deleteRecord(table, id, setMessage, refresh) {
  const { error } = await supabase.from(table).delete().eq("id", id);
  if (error) {
    setMessage(error.message);
    return;
  }
  setMessage("Deleted.");
  await refresh();
}

async function updateOrder(order, status, setMessage, refresh) {
  const { error } = await supabase.from("orders").update({ status }).eq("id", order.id);
  if (error) {
    setMessage(error.message);
    return;
  }
  await fetch("/api/send-order-email", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ order: { ...order, status } }),
  });
  setMessage("Order updated.");
  await refresh();
}

function cleanRoute(path) {
  if (path === "/index.html") return "/";
  if (["/", "/shop", "/gallery", "/contact"].includes(path)) return path;
  return "/";
}

function loadCart() {
  try {
    return JSON.parse(localStorage.getItem(cartKey)) || [];
  } catch {
    return [];
  }
}

function emptyAdminData() {
  return {
    products: [],
    banners: [],
    gallery: [],
    events: [],
    eventImages: [],
    reviews: [],
    promos: [],
    orders: [],
    staff: [],
  };
}

function isStaff(profile) {
  return ["admin", "staff"].includes(profile?.role);
}

function adminTabLabel(tab) {
  return {
    products: "Products",
    gallery: "Gallery",
    events: "Events",
    reviews: "Reviews",
    promos: "Promo Codes",
    banners: "Banners",
    orders: "Orders",
    staff: "Staff",
  }[tab];
}

function parseSizes(value = "") {
  return value.split(",").map((size) => size.trim()).filter(Boolean);
}

function formatSizes(value) {
  return Array.isArray(value) && value.length ? value.join(", ") : "";
}

function isProductDiscounted(product) {
  return Boolean(product.discount_active && Number(product.discount_percent) > 0);
}

function productPrice(product) {
  const base = Number(product.price_ghs || 0);
  if (!isProductDiscounted(product)) return base;
  return Math.max(0, base - base * (Math.min(Number(product.discount_percent), 95) / 100));
}

function cartSubtotal(cart, products) {
  return cart.reduce((sum, item) => {
    const product = products.find((entry) => entry.id === item.product_id);
    return sum + (product ? productPrice(product) * item.quantity : 0);
  }, 0);
}

function promoDiscount(promo, subtotal) {
  if (!promo || Number(promo.min_order_ghs || 0) > subtotal) return 0;
  const value = Number(promo.discount_value || 0);
  if (promo.discount_type === "fixed") return Math.min(subtotal, value);
  return Math.min(subtotal, subtotal * (Math.min(value, 95) / 100));
}

function labelForSection(section) {
  return { "new-arrivals": "Current Drops", "flash-sale": "Flashsale", trending: "Trending" }[section] || section;
}

function labelForPromo(promo) {
  const value = promo.discount_type === "fixed" ? money.format(Number(promo.discount_value)) : `${Number(promo.discount_value)}%`;
  return `${value} off / minimum ${money.format(Number(promo.min_order_ghs || 0))}`;
}

createRoot(document.getElementById("root")).render(<App />);
