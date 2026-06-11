# OSCO Website

React/Netlify website for OSCO with a public brand site, shop, gallery/events pages, contact page, customer accounts, Paystack checkout, and a private staff console.

## Structure

- `/` - brand home page with logo hero, slogan, image shuttle, brand description, featured shop items, events and reviews
- `/shop` - products grouped into Current Drops, Flashsale and Trending
- `/gallery` - brand gallery, event announcements and event galleries grouped by event
- `/contact` - WhatsApp and social links
- `/admin.html` - private owner/staff console

Triple tap the OSCO logo in the public header to open `/admin.html`.

## Staff console

Owners and staff can manage:

- products, images, active/hidden state, discounts and sections
- brand gallery images
- event announcements
- event gallery images grouped by event
- customer reviews
- promo codes
- promo/notification banners
- orders and fulfillment status
- owner/staff accounts

## Supabase setup

Open Supabase SQL Editor and run the full `supabase-schema.sql` file after every schema change.

This creates or updates:

- `products`
- `gallery_images`
- `events`
- `event_gallery_images`
- `customer_reviews`
- `promo_codes`
- `banners`
- `orders`
- `order_items`
- `profiles`
- storage buckets `product-images` and `gallery-images`

If gallery upload says `Bucket not found`, the latest SQL has not been applied to Supabase yet. Run `supabase-schema.sql`, then refresh the live site and try the upload again.

If products were added but do not appear, check these:

1. The product is marked `Active`.
2. The product section is one of `Current Drops`, `Flashsale`, or `Trending`.
3. The latest `supabase-schema.sql` has been run.
4. Netlify has deployed the latest GitHub commit.

The React app includes fallback loading for older product rows, but checkout and discounts still need the latest database schema.

## Owner account

Owner/admin passwords cannot be viewed later. To add a new owner:

1. Sign in as an existing owner at `/admin.html`.
2. Open the `Staff` tab.
3. Add the new email, phone, name and temporary password.
4. Set access level to `Owner`.
5. The new owner signs in at `/admin.html`.

## Auth redirect

In Supabase:

1. Go to `Authentication`.
2. Open `URL Configuration`.
3. Set `Site URL` to the live Netlify domain.
4. Add this redirect URL:

```text
https://your-netlify-site.netlify.app/*
```

Use the exact live domain.

## Contact and social links

Edit `public/config.js`:

```js
window.OSCO_CONFIG = {
  supabaseUrl: "https://your-project.supabase.co",
  supabaseAnonKey: "your-public-anon-key",
  contact: {
    whatsapp: "https://wa.me/233XXXXXXXXX",
    instagram: "https://instagram.com/osco",
    tiktok: "https://tiktok.com/@osco",
    snapchat: "https://snapchat.com/add/osco",
  },
};
```

The Supabase anon key is public. Never put the service role key in `public/config.js`.

## Netlify environment variables

Set these in Netlify:

- `SUPABASE_SERVICE_ROLE_KEY`
- `PAYSTACK_SECRET_KEY`
- `PAYSTACK_CALLBACK_URL`
- `EMAIL_WEBHOOK_URL`
- `EMAIL_WEBHOOK_TOKEN` if your email provider needs it

Do not set public browser values like `SUPABASE_URL` as Netlify secrets if Netlify keeps flagging them. The public Supabase URL is already in the browser config and is not a private secret.

Paystack webhook URL:

```text
https://your-site.netlify.app/api/paystack-webhook
```

## Local development

```powershell
npm install
npm run dev
```

Build:

```powershell
npm run build
```
