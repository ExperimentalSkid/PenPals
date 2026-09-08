-- The Supabase HTTP trigger helper is invoked by database triggers, not by
-- browser clients. Remove its inherited client EXECUTE surface while
-- preserving the helper for trigger execution. The guarded lookup keeps
-- this migration portable where the optional functions schema is absent.
do $$
begin
  if to_regprocedure('supabase_functions.http_request()') is not null then
    execute 'revoke execute on function supabase_functions.http_request() from public, anon, authenticated';
    execute 'alter function supabase_functions.http_request() set search_path = pg_catalog, supabase_functions';
  end if;
end;
$$;
