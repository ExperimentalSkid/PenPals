create table if not exists public.profile_photo_access_requests (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null references public.profiles(id) on delete cascade,
  owner_id uuid not null references public.profiles(id) on delete cascade,
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending','allowed','declined')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (requester_id <> owner_id),
  unique (requester_id, owner_id, conversation_id)
);
create unique index if not exists profile_photo_pending_unique
  on public.profile_photo_access_requests(requester_id, owner_id)
  where status = 'pending';

create table if not exists public.profile_photo_access_grants (
  owner_id uuid not null references public.profiles(id) on delete cascade,
  viewer_id uuid not null references public.profiles(id) on delete cascade,
  granted_at timestamptz not null default now(),
  primary key (owner_id, viewer_id),
  check (owner_id <> viewer_id)
);
create index if not exists profile_photo_grants_viewer_idx on public.profile_photo_access_grants(viewer_id);

create or replace function public.revoke_photo_access_on_block()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  delete from public.profile_photo_access_grants
   where (owner_id = new.blocker_id and viewer_id = new.blocked_id)
      or (owner_id = new.blocked_id and viewer_id = new.blocker_id);
  update public.profile_photo_access_requests
     set status = 'declined', updated_at = now()
   where status = 'pending'
     and ((requester_id = new.blocker_id and owner_id = new.blocked_id)
       or (requester_id = new.blocked_id and owner_id = new.blocker_id));
  return new;
end; $$;
revoke execute on function public.revoke_photo_access_on_block() from public;
grant execute on function public.revoke_photo_access_on_block() to authenticated;
create trigger revoke_photo_access_after_block
  after insert on public.profile_blocks
  for each row execute function public.revoke_photo_access_on_block();

alter table public.profile_photo_access_requests enable row level security;
alter table public.profile_photo_access_grants enable row level security;

create policy "Photo request participants can read" on public.profile_photo_access_requests
  for select to authenticated using (requester_id = auth.uid() or owner_id = auth.uid());
create policy "Users request photos in own conversations" on public.profile_photo_access_requests
  for insert to authenticated with check (
    requester_id = auth.uid()
    and exists (select 1 from public.conversation_participants cp where cp.conversation_id = profile_photo_access_requests.conversation_id and cp.user_id = auth.uid())
    and exists (select 1 from public.conversation_participants cp where cp.conversation_id = profile_photo_access_requests.conversation_id and cp.user_id = profile_photo_access_requests.owner_id)
  );
create policy "Photo owners respond" on public.profile_photo_access_requests
  for update to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());

create policy "Photo grant participants can read" on public.profile_photo_access_grants
  for select to authenticated using (owner_id = auth.uid() or viewer_id = auth.uid());
create policy "Owners manage photo grants" on public.profile_photo_access_grants
  for insert to authenticated with check (owner_id = auth.uid());
create policy "Owners revoke photo grants" on public.profile_photo_access_grants
  for delete to authenticated using (owner_id = auth.uid());

create or replace function public.can_view_profile_photo(owner_user uuid, viewer_user uuid default auth.uid())
returns boolean language sql security definer stable set search_path = public as $$
  select owner_user = viewer_user
    or (
      viewer_user is not null
      and exists (select 1 from public.profiles p where p.id = owner_user and p.deactivated_at is null and p.avatar_path is not null)
      and exists (select 1 from public.profile_photo_access_grants g where g.owner_id = owner_user and g.viewer_id = viewer_user)
      and not exists (select 1 from public.profile_blocks b where (b.blocker_id = owner_user and b.blocked_id = viewer_user) or (b.blocker_id = viewer_user and b.blocked_id = owner_user))
    );
$$;
revoke execute on function public.can_view_profile_photo(uuid, uuid) from public;
grant execute on function public.can_view_profile_photo(uuid, uuid) to authenticated;

create or replace function public.request_photo_access(owner_user uuid, conversation uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); request_id uuid;
begin
  if me is null or me = owner_user then raise exception 'Photo request unavailable'; end if;
  if exists (select 1 from profiles where id in (me, owner_user) and deactivated_at is not null) then raise exception 'Photo request unavailable'; end if;
  if exists (select 1 from profile_blocks where (blocker_id = me and blocked_id = owner_user) or (blocker_id = owner_user and blocked_id = me)) then raise exception 'Photo request unavailable'; end if;
  if not exists (select 1 from conversation_participants where conversation_id = conversation and user_id = me)
     or not exists (select 1 from conversation_participants where conversation_id = conversation and user_id = owner_user)
     or not exists (select 1 from profiles where id = owner_user and avatar_path is not null) then raise exception 'Photo request unavailable'; end if;
  insert into profile_photo_access_requests(requester_id, owner_id, conversation_id) values(me, owner_user, conversation)
    on conflict (requester_id, owner_id) where status = 'pending' do nothing returning id into request_id;
  if request_id is null then raise exception 'Photo request already pending'; end if;
  return request_id;
end; $$;
revoke execute on function public.request_photo_access(uuid, uuid) from public;
grant execute on function public.request_photo_access(uuid, uuid) to authenticated;

create or replace function public.respond_photo_access(request_id uuid, decision text)
returns void language plpgsql security definer set search_path = public as $$
declare r profile_photo_access_requests;
begin
  select * into r from profile_photo_access_requests where id = request_id for update;
  if r.id is null or r.owner_id <> auth.uid() or r.status <> 'pending' or decision not in ('allowed','declined') then raise exception 'Photo request unavailable'; end if;
  if decision = 'allowed' then
    if exists (select 1 from profile_blocks where (blocker_id = r.owner_id and blocked_id = r.requester_id) or (blocker_id = r.requester_id and blocked_id = r.owner_id)) then raise exception 'Photo request unavailable'; end if;
    insert into profile_photo_access_grants(owner_id, viewer_id) values(r.owner_id, r.requester_id) on conflict do nothing;
  end if;
  update profile_photo_access_requests set status = decision, updated_at = now() where id = r.id;
end; $$;
revoke execute on function public.respond_photo_access(uuid, text) from public;
grant execute on function public.respond_photo_access(uuid, text) to authenticated;

create or replace function public.revoke_photo_access(viewer_user uuid)
returns void language sql security definer set search_path = public as $$
  delete from public.profile_photo_access_grants where owner_id = auth.uid() and viewer_id = viewer_user;
$$;
revoke execute on function public.revoke_photo_access(uuid) from public;
grant execute on function public.revoke_photo_access(uuid) to authenticated;

drop policy if exists "View permitted avatars" on storage.objects;
create policy "View permitted avatars" on storage.objects for select to authenticated using (
  bucket_id = 'avatars' and public.can_view_profile_photo(((storage.foldername(name))[1])::uuid)
);
