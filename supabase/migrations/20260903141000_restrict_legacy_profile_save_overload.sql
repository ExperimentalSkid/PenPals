-- The current profile action uses the normalized location-aware overload.
-- Keep the eleven-argument wrapper for historical callers, but remove its
-- direct client EXECUTE grant now that no repository caller depends on it.
revoke all on function public.save_profile(text, text, date, text, text, text, text, text, text, jsonb, bigint[]) from public, anon, authenticated;
