-- Discovery must not expose a viewer-visible user's exact activity timestamp.
-- Keep the legacy response columns for compatibility, but return a coarse
-- recent-activity flag for the optional client-side filter instead.
drop function if exists public.get_discover_profiles(uuid);

create function public.get_discover_profiles(viewer uuid default auth.uid())
returns table (
  id uuid,
  username text,
  display_name text,
  birth_date date,
  gender text,
  country text,
  city text,
  avatar_path text,
  last_active_at timestamptz,
  recently_active boolean,
  quote text
)
language sql
security definer
set search_path = pg_catalog, public
as $$
  select p.id,
         p.username,
         p.display_name,
         p.birth_date,
         p.gender,
         p.country,
         case when p.show_city then p.city end,
         null::text,
         null::timestamptz,
         case
           when p.show_activity_status then p.last_active_at >= now() - interval '24 hours'
           else null
         end,
         p.quote
    from public.profiles p
   where p.id <> auth.uid()
     and p.deactivated_at is null
     and p.last_active_at >= now() - interval '7 days'
     and nullif(btrim(p.display_name), '') is not null
     and p.birth_date is not null
     and nullif(btrim(p.gender), '') is not null
     and nullif(btrim(p.country), '') is not null
     and nullif(btrim(p.city), '') is not null
     and nullif(btrim(p.bio), '') is not null
     and nullif(btrim(p.quote), '') is not null
     and nullif(btrim(p.looking_for), '') is not null
     and nullif(btrim(p.avatar_path), '') is not null
     and exists (
       select 1
         from public.profile_languages pl
        where pl.profile_id = p.id
     )
     and (
       select count(*)
         from public.profile_interests pi
        where pi.profile_id = p.id
     ) >= 3
     and public.viewer_can_access_profile(p.id)
   order by p.last_active_at desc nulls last, p.created_at desc;
$$;

revoke all on function public.get_discover_profiles(uuid) from public, anon, authenticated;
grant execute on function public.get_discover_profiles(uuid) to authenticated;
