create table public.reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references public.profiles(id) on delete cascade,
  target_type text not null check (target_type in ('profile','introduction','message')),
  target_id uuid not null,
  target_profile_id uuid references public.profiles(id) on delete set null,
  target_introduction_id uuid references public.conversation_introductions(id) on delete set null,
  target_message_id uuid references public.messages(id) on delete set null,
  reason text not null check (reason in ('spam','scam/fraud','harassment','sexual/inappropriate content','hate/abuse','fake profile/impersonation','underage concern','other')),
  details text check (details is null or char_length(details) <= 2000),
  status text not null default 'open' check (status in ('open','reviewing','actioned','dismissed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((target_type = 'profile' and target_profile_id = target_id) or (target_type = 'introduction' and target_introduction_id = target_id) or (target_type = 'message' and target_message_id = target_id)),
  check (target_id <> reporter_id or target_type <> 'profile')
);
create unique index reports_one_per_target on public.reports (reporter_id, target_type, target_id);
create index reports_review_idx on public.reports (status, created_at);
alter table public.reports enable row level security;
create policy "Users submit own reports" on public.reports for insert to authenticated with check (reporter_id = (select auth.uid()));
-- There is intentionally no ordinary-user SELECT policy. Moderator access will be added separately.

create or replace function public.submit_report(kind text, target uuid, report_reason text, report_details text default null, decline_pending boolean default false) returns uuid language plpgsql security definer set search_path = public as $$ declare report_id uuid; me uuid := auth.uid(); intro public.conversation_introductions; begin if me is null then raise exception 'Authentication required'; end if; if kind not in ('profile','introduction','message') then raise exception 'Invalid report target'; end if; if report_reason not in ('spam','scam/fraud','harassment','sexual/inappropriate content','hate/abuse','fake profile/impersonation','underage concern','other') then raise exception 'Invalid report reason'; end if; if kind = 'profile' then if target = me or not exists (select 1 from public.profiles where id = target) then raise exception 'Invalid profile target'; end if; elsif kind = 'introduction' then select * into intro from public.conversation_introductions where id = target; if intro.id is null then raise exception 'Invalid introduction target'; end if; elsif not exists (select 1 from public.messages where id = target) then raise exception 'Invalid message target'; end if; insert into public.reports (reporter_id, target_type, target_id, target_profile_id, target_introduction_id, target_message_id, reason, details) values (me, kind, target, case when kind = 'profile' then target end, case when kind = 'introduction' then target end, case when kind = 'message' then target end, report_reason, nullif(trim(report_details), '')) returning id into report_id; if kind = 'introduction' and decline_pending and intro.recipient_id = me and intro.status = 'pending' then update public.conversation_introductions set status = 'declined' where id = target; end if; return report_id; end; $$;
revoke all on function public.submit_report(text, uuid, text, text, boolean) from public;
grant execute on function public.submit_report(text, uuid, text, text, boolean) to authenticated;

create or replace function public.get_response_stats(target_user uuid) returns table (completed_opportunities bigint, response_rate numeric, median_hours numeric) language sql security definer set search_path = public as $$ with valid as (select i.* from public.conversation_introductions i where i.recipient_id = target_user and i.status in ('replied','declined','expired') and not exists (select 1 from public.profile_blocks b where (b.blocker_id = i.sender_id and b.blocked_id = i.recipient_id) or (b.blocker_id = i.recipient_id and b.blocked_id = i.sender_id)) and not exists (select 1 from public.reports r where r.target_type = 'introduction' and r.target_id = i.id and r.status <> 'dismissed' and r.reason in ('spam','scam/fraud','harassment','sexual/inappropriate content','hate/abuse','fake profile/impersonation','underage concern'))), stats as (select count(*) as completed, count(*) filter (where status in ('replied','declined')) as handled, percentile_cont(0.5) within group (order by extract(epoch from ((case when status = 'replied' then coalesce((select min(m.created_at) from public.messages m where m.conversation_id = valid.conversation_id_legacy and m.sender_id = valid.recipient_id), created_at) else created_at end) - created_at)) / 3600.0) filter (where status in ('replied','declined')) as median from valid) select completed, case when completed >= 5 then round(handled::numeric * 100 / completed, 0) else null end, median from stats $$;
