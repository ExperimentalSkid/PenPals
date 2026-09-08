create or replace function public.touch_moderation_case_on_note()
returns trigger language plpgsql security definer set search_path = pg_catalog, public as $$
begin
  update public.moderation_cases set updated_at = now() where id = new.case_id;
  return new;
end;
$$;
drop trigger if exists moderation_case_note_touch on public.moderation_case_notes;
create trigger moderation_case_note_touch after insert on public.moderation_case_notes
for each row execute function public.touch_moderation_case_on_note();
revoke all on function public.touch_moderation_case_on_note() from public, anon, authenticated;
