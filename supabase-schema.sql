create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  full_name text,
  phone text,
  role text not null default 'customer' check (role in ('customer', 'staff', 'admin')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles
add column if not exists email text;

update public.profiles
set email = auth.users.email
from auth.users
where public.profiles.id = auth.users.id
  and public.profiles.email is null;

create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  price_ghs numeric(12, 2) not null check (price_ghs > 0),
  section text not null check (section in ('new-arrivals', 'flash-sale', 'trending')),
  sizes text[] not null default '{}',
  image_url text,
  active boolean not null default true,
  discount_active boolean not null default false,
  discount_percent numeric(5, 2) not null default 0 check (discount_percent >= 0 and discount_percent <= 95),
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.products
add column if not exists discount_active boolean not null default false;

alter table public.products
add column if not exists discount_percent numeric(5, 2) not null default 0;

alter table public.products
drop constraint if exists products_discount_percent_check;

alter table public.products
add constraint products_discount_percent_check check (discount_percent >= 0 and discount_percent <= 95);

create table if not exists public.banners (
  id uuid primary key default gen_random_uuid(),
  placement text not null check (placement in ('promo', 'notification')),
  body text not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.gallery_images (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  caption text,
  image_url text not null,
  active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.events (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  event_date date,
  location text,
  image_url text,
  active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.event_gallery_images (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  title text not null,
  caption text,
  image_url text not null,
  active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.customer_reviews (
  id uuid primary key default gen_random_uuid(),
  customer_name text not null,
  role_or_location text,
  review text not null,
  rating integer not null default 5 check (rating >= 1 and rating <= 5),
  active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.promo_codes (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  discount_type text not null default 'percent' check (discount_type in ('percent', 'fixed')),
  discount_value numeric(12, 2) not null check (discount_value > 0),
  min_order_ghs numeric(12, 2) not null default 0 check (min_order_ghs >= 0),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete restrict,
  reference text not null unique,
  status text not null default 'pending_payment' check (status in ('pending_payment', 'paid', 'processing', 'shipped', 'delivered', 'cancelled')),
  total_ghs numeric(12, 2) not null check (total_ghs >= 0),
  discount_ghs numeric(12, 2) not null default 0 check (discount_ghs >= 0),
  promo_code text,
  customer_name text not null,
  customer_email text not null,
  customer_phone text,
  delivery_address text,
  payment_reference text,
  payment_access_code text,
  payment_authorization_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.orders
add column if not exists discount_ghs numeric(12, 2) not null default 0;

alter table public.orders
add column if not exists promo_code text;

alter table public.orders
drop constraint if exists orders_status_check;

alter table public.orders
add constraint orders_status_check
check (status in ('pending_payment', 'paid', 'processing', 'shipped', 'fulfilled', 'delivered', 'cancelled'));

create table if not exists public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  product_id uuid references public.products(id) on delete set null,
  name text not null,
  price_ghs numeric(12, 2) not null check (price_ghs >= 0),
  quantity integer not null check (quantity > 0),
  created_at timestamptz not null default now()
);

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_touch_updated_at on public.profiles;
create trigger profiles_touch_updated_at
before update on public.profiles
for each row execute function public.touch_updated_at();

drop trigger if exists products_touch_updated_at on public.products;
create trigger products_touch_updated_at
before update on public.products
for each row execute function public.touch_updated_at();

drop trigger if exists banners_touch_updated_at on public.banners;
create trigger banners_touch_updated_at
before update on public.banners
for each row execute function public.touch_updated_at();

drop trigger if exists gallery_images_touch_updated_at on public.gallery_images;
create trigger gallery_images_touch_updated_at
before update on public.gallery_images
for each row execute function public.touch_updated_at();

drop trigger if exists events_touch_updated_at on public.events;
create trigger events_touch_updated_at
before update on public.events
for each row execute function public.touch_updated_at();

drop trigger if exists event_gallery_images_touch_updated_at on public.event_gallery_images;
create trigger event_gallery_images_touch_updated_at
before update on public.event_gallery_images
for each row execute function public.touch_updated_at();

drop trigger if exists customer_reviews_touch_updated_at on public.customer_reviews;
create trigger customer_reviews_touch_updated_at
before update on public.customer_reviews
for each row execute function public.touch_updated_at();

drop trigger if exists promo_codes_touch_updated_at on public.promo_codes;
create trigger promo_codes_touch_updated_at
before update on public.promo_codes
for each row execute function public.touch_updated_at();

drop trigger if exists orders_touch_updated_at on public.orders;
create trigger orders_touch_updated_at
before update on public.orders
for each row execute function public.touch_updated_at();

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name, phone)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', ''),
    coalesce(new.raw_user_meta_data ->> 'phone', '')
  );
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

create or replace function public.is_shop_admin()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and role in ('admin', 'staff')
  );
$$;

alter table public.profiles enable row level security;
alter table public.products enable row level security;
alter table public.banners enable row level security;
alter table public.gallery_images enable row level security;
alter table public.events enable row level security;
alter table public.event_gallery_images enable row level security;
alter table public.customer_reviews enable row level security;
alter table public.promo_codes enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;

drop policy if exists "profiles read own or staff" on public.profiles;
create policy "profiles read own or staff"
on public.profiles
for select
using (auth.uid() = id or public.is_shop_admin());

drop policy if exists "profiles update own or admin" on public.profiles;
create policy "profiles update own or admin"
on public.profiles
for update
using (auth.uid() = id or public.is_shop_admin())
with check (auth.uid() = id or public.is_shop_admin());

drop policy if exists "public active products" on public.products;
create policy "public active products"
on public.products
for select
using (active = true or public.is_shop_admin());

drop policy if exists "staff manage products" on public.products;
create policy "staff manage products"
on public.products
for all
using (public.is_shop_admin())
with check (public.is_shop_admin());

drop policy if exists "public active banners" on public.banners;
create policy "public active banners"
on public.banners
for select
using (active = true or public.is_shop_admin());

drop policy if exists "staff manage banners" on public.banners;
create policy "staff manage banners"
on public.banners
for all
using (public.is_shop_admin())
with check (public.is_shop_admin());

drop policy if exists "public active gallery images" on public.gallery_images;
create policy "public active gallery images"
on public.gallery_images
for select
using (active = true or public.is_shop_admin());

drop policy if exists "staff manage gallery images" on public.gallery_images;
create policy "staff manage gallery images"
on public.gallery_images
for all
using (public.is_shop_admin())
with check (public.is_shop_admin());

drop policy if exists "public active events" on public.events;
create policy "public active events"
on public.events
for select
using (active = true or public.is_shop_admin());

drop policy if exists "staff manage events" on public.events;
create policy "staff manage events"
on public.events
for all
using (public.is_shop_admin())
with check (public.is_shop_admin());

drop policy if exists "public active event gallery images" on public.event_gallery_images;
create policy "public active event gallery images"
on public.event_gallery_images
for select
using (active = true or public.is_shop_admin());

drop policy if exists "staff manage event gallery images" on public.event_gallery_images;
create policy "staff manage event gallery images"
on public.event_gallery_images
for all
using (public.is_shop_admin())
with check (public.is_shop_admin());

drop policy if exists "public active customer reviews" on public.customer_reviews;
create policy "public active customer reviews"
on public.customer_reviews
for select
using (active = true or public.is_shop_admin());

drop policy if exists "staff manage customer reviews" on public.customer_reviews;
create policy "staff manage customer reviews"
on public.customer_reviews
for all
using (public.is_shop_admin())
with check (public.is_shop_admin());

drop policy if exists "public active promo codes" on public.promo_codes;
create policy "public active promo codes"
on public.promo_codes
for select
using (active = true or public.is_shop_admin());

drop policy if exists "staff manage promo codes" on public.promo_codes;
create policy "staff manage promo codes"
on public.promo_codes
for all
using (public.is_shop_admin())
with check (public.is_shop_admin());

drop policy if exists "customers read own orders" on public.orders;
create policy "customers read own orders"
on public.orders
for select
using (auth.uid() = user_id or public.is_shop_admin());

drop policy if exists "staff update orders" on public.orders;
create policy "staff update orders"
on public.orders
for update
using (public.is_shop_admin())
with check (public.is_shop_admin());

drop policy if exists "customers read own order items" on public.order_items;
create policy "customers read own order items"
on public.order_items
for select
using (
  exists (
    select 1
    from public.orders
    where orders.id = order_items.order_id
      and (orders.user_id = auth.uid() or public.is_shop_admin())
  )
);

drop policy if exists "staff manage order items" on public.order_items;
create policy "staff manage order items"
on public.order_items
for all
using (public.is_shop_admin())
with check (public.is_shop_admin());

create index if not exists products_section_active_idx on public.products(section, active, sort_order);
create index if not exists banners_placement_active_idx on public.banners(placement, active);
create index if not exists gallery_images_active_sort_idx on public.gallery_images(active, sort_order);
create index if not exists events_active_sort_idx on public.events(active, sort_order, event_date);
create index if not exists event_gallery_images_event_sort_idx on public.event_gallery_images(event_id, active, sort_order);
create index if not exists customer_reviews_active_sort_idx on public.customer_reviews(active, sort_order);
create index if not exists promo_codes_code_active_idx on public.promo_codes(code, active);
create index if not exists orders_user_created_idx on public.orders(user_id, created_at desc);
create index if not exists order_items_order_idx on public.order_items(order_id);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'product-images',
  'product-images',
  true,
  5242880,
  array['image/png', 'image/jpeg', 'image/webp']
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "public read product images" on storage.objects;
create policy "public read product images"
on storage.objects
for select
using (bucket_id = 'product-images');

drop policy if exists "staff upload product images" on storage.objects;
create policy "staff upload product images"
on storage.objects
for insert
with check (bucket_id = 'product-images' and public.is_shop_admin());

drop policy if exists "staff update product images" on storage.objects;
create policy "staff update product images"
on storage.objects
for update
using (bucket_id = 'product-images' and public.is_shop_admin())
with check (bucket_id = 'product-images' and public.is_shop_admin());

drop policy if exists "staff delete product images" on storage.objects;
create policy "staff delete product images"
on storage.objects
for delete
using (bucket_id = 'product-images' and public.is_shop_admin());

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'gallery-images',
  'gallery-images',
  true,
  5242880,
  array['image/png', 'image/jpeg', 'image/webp']
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "public read gallery images" on storage.objects;
create policy "public read gallery images"
on storage.objects
for select
using (bucket_id = 'gallery-images');

drop policy if exists "staff upload gallery images" on storage.objects;
create policy "staff upload gallery images"
on storage.objects
for insert
with check (bucket_id = 'gallery-images' and public.is_shop_admin());

drop policy if exists "staff update gallery images" on storage.objects;
create policy "staff update gallery images"
on storage.objects
for update
using (bucket_id = 'gallery-images' and public.is_shop_admin())
with check (bucket_id = 'gallery-images' and public.is_shop_admin());

drop policy if exists "staff delete gallery images" on storage.objects;
create policy "staff delete gallery images"
on storage.objects
for delete
using (bucket_id = 'gallery-images' and public.is_shop_admin());

grant usage on schema public to anon, authenticated;
grant select on public.products to anon, authenticated;
grant select on public.banners to anon, authenticated;
grant select on public.gallery_images to anon, authenticated;
grant select on public.events to anon, authenticated;
grant select on public.event_gallery_images to anon, authenticated;
grant select on public.customer_reviews to anon, authenticated;
grant select on public.promo_codes to anon, authenticated;
grant select, update on public.profiles to authenticated;
grant select, update on public.orders to authenticated;
grant select on public.order_items to authenticated;
grant insert, update, delete on public.products to authenticated;
grant insert, update, delete on public.banners to authenticated;
grant insert, update, delete on public.gallery_images to authenticated;
grant insert, update, delete on public.events to authenticated;
grant insert, update, delete on public.event_gallery_images to authenticated;
grant insert, update, delete on public.customer_reviews to authenticated;
grant insert, update, delete on public.promo_codes to authenticated;
grant insert, update, delete on public.order_items to authenticated;
