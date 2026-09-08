alter table public.profiles add column last_active_at timestamptz;
create index profiles_last_active_idx on public.profiles (last_active_at desc nulls last);
create or replace function public.touch_activity() returns void language plpgsql security definer set search_path = public as $$ begin update public.profiles set last_active_at = now() where id = auth.uid() and (last_active_at is null or last_active_at < now() - interval '5 minutes'); end; $$;
revoke all on function public.touch_activity() from public;
grant execute on function public.touch_activity() to authenticated;
