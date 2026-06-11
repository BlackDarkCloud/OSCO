# OSCO Shop

Professional Netlify storefront for the Ghana clothing brand using Supabase for catalog, users, admin roles, banners and orders.

## Current build

- Public shop sections: New Arrivals, Flashsale and Trending
- Real catalog data from Supabase
- Customer account required before checkout
- Admin console controlled by Supabase `profiles.role`
- Paystack checkout initialized by a Netlify Function
- Paystack webhook endpoint for marking successful payments as paid
- Email/order update webhook function

## Supabase setup

1. Create a Supabase project.
2. Open the SQL editor and run `supabase-schema.sql`.
3. Create the first owner account from the site sign-up form.
4. In Supabase SQL editor, promote that account:

```sql
update public.profiles
set role = 'admin'
where id = 'USER_ID_FROM_AUTH_USERS';
```

5. Add real products, banners and notifications through the owner console.

## Frontend config

Copy `config.example.js` values into `config.js`:

```js
window.OSCO_CONFIG = {
  supabaseUrl: "https://your-project.supabase.co",
  supabaseAnonKey: "your-public-anon-key",
};
```

The anon key is safe for the browser. Never place the service role key in `config.js`.

## Netlify environment variables

Set these in Netlify:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `PAYSTACK_SECRET_KEY`
- `PAYSTACK_CALLBACK_URL`
- `EMAIL_WEBHOOK_URL`
- `EMAIL_WEBHOOK_TOKEN` if your email provider/webhook needs it

Paystack webhook URL:

```text
https://your-site.netlify.app/api/paystack-webhook
```

## Local preview

```powershell
npm start
```

Then open:

```text
http://localhost:4173
```
