-- Run this after the trial owner has created an account from the site.
-- Replace the email below with the trial owner's login email.

update public.profiles
set role = 'admin'
where id = (
  select id
  from auth.users
  where email = 'trial-owner@example.com'
);
