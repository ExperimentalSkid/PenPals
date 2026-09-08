-- A moderator may exercise the same account-erasure right as any other user.
-- Keep immutable moderation evidence, but sever the deleted account's identity
-- from those records rather than letting a RESTRICT FK block erasure.
alter table public.moderation_audit_log
  alter column moderator_id drop not null;
alter table public.profile_moderation_evidence
  alter column moderator_id drop not null;

alter table public.moderation_audit_log
  drop constraint if exists moderation_audit_log_moderator_id_fkey;
alter table public.moderation_audit_log
  add constraint moderation_audit_log_moderator_id_fkey
  foreign key (moderator_id) references public.profiles(id) on delete set null;

alter table public.profile_moderation_evidence
  drop constraint if exists profile_moderation_evidence_moderator_id_fkey;
alter table public.profile_moderation_evidence
  add constraint profile_moderation_evidence_moderator_id_fkey
  foreign key (moderator_id) references public.profiles(id) on delete set null;
