alter table public.profiles add column looking_for text not null default 'friendship';

drop function if exists public.get_discover_profiles(uuid);
create function public.get_discover_profiles(viewer uuid default auth.uid()) returns table (id uuid,username text,display_name text,birth_date date,gender text,country text,city text,avatar_path text,last_active_at timestamptz,quote text) language sql security definer set search_path=public as $$
  select p.id,p.username,p.display_name,p.birth_date,p.gender,p.country,case when p.show_city then p.city end,p.avatar_path,p.last_active_at,p.quote
  from public.profiles p
  where p.id <> auth.uid()
    and p.deactivated_at is null
    and p.last_active_at >= now() - interval '7 days'
    and p.display_name <> '' and p.birth_date is not null and p.gender <> '' and p.country <> '' and p.city <> '' and p.bio <> '' and p.quote <> '' and p.avatar_path <> ''
    and p.looking_for <> ''
    and (select count(*) from public.profile_languages pl where pl.profile_id = p.id) >= 1
    and (select count(*) from public.profile_interests pi where pi.profile_id = p.id) >= 3
    and public.viewer_can_access_profile(p.id)
$$;
revoke all on function public.get_discover_profiles(uuid) from public; grant execute on function public.get_discover_profiles(uuid) to authenticated;
