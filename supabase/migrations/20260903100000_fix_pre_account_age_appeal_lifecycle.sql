-- Keep a verified under-age signup outside the normal Penpal application while
-- still allowing the owner of that verified auth identity to request a safe
-- correction.  The check is deliberately boolean and self-relative: it never
-- exposes restriction rows or lets a caller probe another email/account.
create or replace function public.is_current_user_age_restricted()
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select public.is_email_verified()
     and exists (
       select 1
         from auth.users u
         join public.age_restrictions r
           on r.normalized_email_hash = encode(
                extensions.digest(lower(btrim(u.email)), 'sha256'),
                'hex'
              )
        where u.id = auth.uid()
          and u.email_confirmed_at is not null
          and r.blocked_until > current_date
          and (r.restricted_user_id is null or r.restricted_user_id = u.id)
     );
$$;

revoke all on function public.is_current_user_age_restricted()
  from public, anon, authenticated;
grant execute on function public.is_current_user_age_restricted()
  to authenticated;
