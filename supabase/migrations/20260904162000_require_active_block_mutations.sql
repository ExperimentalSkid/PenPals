-- Deactivated accounts cannot continue mutating their block list through
-- direct table APIs.  Voluntary Pause remains a separate state: paused users
-- can still manage their own blocks while their account stays intact.
drop policy if exists "Users can read own blocks" on public.profile_blocks;
create policy "Users can read own blocks" on public.profile_blocks
for select to authenticated
using (
  public.is_email_verified()
  and exists (
    select 1
      from public.profiles p
     where p.id = auth.uid()
       and p.deactivated_at is null
  )
  and blocker_id = auth.uid()
);

drop policy if exists "Users can manage own blocks" on public.profile_blocks;
create policy "Users can manage own blocks" on public.profile_blocks
for all to authenticated
using (
  public.is_email_verified()
  and exists (
    select 1
      from public.profiles p
     where p.id = auth.uid()
       and p.deactivated_at is null
  )
  and blocker_id = auth.uid()
)
with check (
  public.is_email_verified()
  and exists (
    select 1
      from public.profiles p
     where p.id = auth.uid()
       and p.deactivated_at is null
  )
  and blocker_id = auth.uid()
);
