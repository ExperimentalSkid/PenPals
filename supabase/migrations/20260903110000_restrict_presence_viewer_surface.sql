-- Presence authorization is now evaluated directly from the private
-- realtime.messages RLS policy.  The target-dependent helper remains only for
-- migration compatibility, but it is not a client API and must not be an
-- existence/privacy oracle.
revoke all on function public.realtime_presence_viewer(uuid)
  from public, anon, authenticated;
