-- Public contact intake reuses the existing support ticket engine while
-- keeping pre-login contact messages in their own staff queue. Anonymous users
-- can create only tightly validated public-contact tickets; all reads and
-- mutations remain behind the existing staff RPC boundary.

alter table public.support_tickets
  add column if not exists contact_name text,
  add column if not exists contact_email text,
  add column if not exists contact_request_metadata jsonb not null default '{}'::jsonb;

alter table public.support_tickets
  drop constraint if exists support_tickets_contact_name_length,
  drop constraint if exists support_tickets_contact_email_shape,
  drop constraint if exists support_tickets_contact_metadata_object,
  drop constraint if exists support_tickets_public_contact_identity;

alter table public.support_tickets
  add constraint support_tickets_contact_name_length
    check (contact_name is null or char_length(btrim(contact_name)) between 1 and 120),
  add constraint support_tickets_contact_email_shape
    check (
      contact_email is null
      or (
        char_length(contact_email) between 3 and 254
        and contact_email ~* '^[^[:space:]<>@]+@[^[:space:]<>@]+\.[^[:space:]<>@]+$'
      )
    ),
  add constraint support_tickets_contact_metadata_object
    check (jsonb_typeof(contact_request_metadata) = 'object'),
  add constraint support_tickets_public_contact_identity
    check (ticket_type <> 'public_contact' or (requester_id is null and contact_email is not null));

create index if not exists support_tickets_regular_support_queue_idx
  on public.support_tickets(status, priority, updated_at desc)
  where ticket_type <> 'public_contact';

create index if not exists support_tickets_public_contact_queue_idx
  on public.support_tickets(status, updated_at desc)
  where ticket_type = 'public_contact';

create index if not exists support_tickets_public_contact_email_idx
  on public.support_tickets((lower(contact_email)), created_at desc)
  where ticket_type = 'public_contact';

create index if not exists support_tickets_public_contact_client_idx
  on public.support_tickets((contact_request_metadata->>'client_key_hash'), created_at desc)
  where ticket_type = 'public_contact';

create or replace function public.staff_support_open_count()
returns bigint
language sql
security definer
stable
set search_path = pg_catalog, public
as $$
  select case when public.is_moderator()
    then (
      select count(*)
        from public.support_tickets
       where status <> 'resolved'
         and ticket_type <> 'public_contact'
    )
    else 0::bigint
  end
$$;

create or replace function public.staff_contact_open_count()
returns bigint
language sql
security definer
stable
set search_path = pg_catalog, public
as $$
  select case when public.is_moderator()
    then (
      select count(*)
        from public.support_tickets
       where status <> 'resolved'
         and ticket_type = 'public_contact'
    )
    else 0::bigint
  end
$$;

create or replace function public.staff_list_support_tickets(
  status_filter text default null,
  category_filter text default null,
  assignment_filter text default null,
  search_query text default null,
  sort_order text default 'updated_desc',
  page_size integer default 25,
  page_offset integer default 0
)
returns table (
  id uuid,
  ticket_number bigint,
  ticket_code text,
  ticket_type text,
  subject text,
  requester_id uuid,
  requester_username text,
  requester_display_name text,
  category text,
  status text,
  priority text,
  assigned_staff_id uuid,
  assigned_staff_name text,
  created_at timestamptz,
  updated_at timestamptz,
  last_message_at timestamptz,
  total_count bigint
)
language plpgsql
security definer
stable
set search_path = pg_catalog, public
as $$
declare
  clean_status text := nullif(lower(btrim(status_filter)), '');
  clean_category text := nullif(lower(btrim(category_filter)), '');
  clean_assignment text := nullif(lower(btrim(assignment_filter)), '');
  clean_search text := nullif(btrim(search_query), '');
  clean_sort text := lower(coalesce(nullif(btrim(sort_order), ''), 'updated_desc'));
begin
  if not public.is_moderator() then
    raise exception 'Moderator authorization required';
  end if;

  if clean_status is not null and clean_status not in ('all','open','waiting_staff','waiting_user','resolved','mine','unassigned') then
    raise exception 'Unsupported support ticket status filter';
  end if;
  if clean_category is not null and clean_category not in ('account_access','profile','communication','snail_mail','privacy_safety','bug_report','feedback','other') then
    raise exception 'Unsupported support ticket category filter';
  end if;
  if clean_assignment is not null and clean_assignment not in ('all','mine','unassigned') then
    begin
      perform clean_assignment::uuid;
    exception when invalid_text_representation then
      raise exception 'Unsupported support ticket assignment filter';
    end;
  end if;
  if clean_sort not in ('updated_desc','updated_asc','created_desc','priority_desc') then
    raise exception 'Unsupported support ticket sort';
  end if;

  page_size := least(greatest(coalesce(page_size, 25), 1), 100);
  page_offset := greatest(coalesce(page_offset, 0), 0);

  return query
  select t.id,
         t.ticket_number,
         ('SUP-' || t.ticket_number)::text,
         t.ticket_type,
         t.subject,
         t.requester_id,
         requester.username,
         requester.display_name,
         t.category,
         t.status,
         t.priority,
         t.assigned_staff_id,
         assigned.display_name,
         t.created_at,
         t.updated_at,
         latest_message.created_at,
         count(*) over ()
    from public.support_tickets t
    left join public.profiles requester on requester.id = t.requester_id
    left join public.profiles assigned on assigned.id = t.assigned_staff_id
    left join lateral (
      select m.created_at
        from public.support_ticket_messages m
       where m.ticket_id = t.id
       order by m.created_at desc
       limit 1
    ) latest_message on true
   where t.ticket_type <> 'public_contact'
     and (clean_status is null or clean_status = 'all'
      or (clean_status = 'open' and t.status <> 'resolved')
      or (clean_status = 'mine' and t.assigned_staff_id = auth.uid())
      or (clean_status = 'unassigned' and t.assigned_staff_id is null)
      or t.status = clean_status)
     and (clean_category is null or t.category = clean_category)
     and (clean_assignment is null or clean_assignment = 'all'
      or (clean_assignment = 'mine' and t.assigned_staff_id = auth.uid())
      or (clean_assignment = 'unassigned' and t.assigned_staff_id is null)
      or (case when clean_assignment not in ('all','mine','unassigned') then clean_assignment::uuid end = t.assigned_staff_id))
     and (clean_search is null
      or t.subject ilike '%' || clean_search || '%'
      or ('SUP-' || t.ticket_number)::text ilike '%' || clean_search || '%'
      or requester.username ilike '%' || clean_search || '%'
      or requester.display_name ilike '%' || clean_search || '%')
   order by
     case when clean_sort = 'priority_desc' then case t.priority when 'urgent' then 0 when 'high' then 1 when 'normal' then 2 else 3 end end asc nulls last,
     case when clean_sort = 'updated_asc' then t.updated_at end asc nulls last,
     case when clean_sort = 'created_desc' then t.created_at end desc nulls last,
     case when clean_sort in ('updated_desc','priority_desc') then t.updated_at end desc nulls last,
     t.id
   limit page_size offset page_offset;
end;
$$;

create or replace function public.staff_list_public_contact_tickets(
  status_filter text default null,
  category_filter text default null,
  assignment_filter text default null,
  search_query text default null,
  sort_order text default 'updated_desc',
  page_size integer default 25,
  page_offset integer default 0
)
returns table (
  id uuid,
  ticket_number bigint,
  ticket_code text,
  ticket_type text,
  subject text,
  requester_id uuid,
  requester_username text,
  requester_display_name text,
  category text,
  status text,
  priority text,
  assigned_staff_id uuid,
  assigned_staff_name text,
  created_at timestamptz,
  updated_at timestamptz,
  last_message_at timestamptz,
  total_count bigint
)
language plpgsql
security definer
stable
set search_path = pg_catalog, public
as $$
declare
  clean_status text := nullif(lower(btrim(status_filter)), '');
  clean_category text := nullif(lower(btrim(category_filter)), '');
  clean_assignment text := nullif(lower(btrim(assignment_filter)), '');
  clean_search text := nullif(btrim(search_query), '');
  clean_sort text := lower(coalesce(nullif(btrim(sort_order), ''), 'updated_desc'));
begin
  if not public.is_moderator() then
    raise exception 'Moderator authorization required';
  end if;

  if clean_status is not null and clean_status not in ('all','open','waiting_staff','waiting_user','resolved','mine','unassigned') then
    raise exception 'Unsupported contact ticket status filter';
  end if;
  if clean_category is not null and clean_category not in ('account_access','privacy_safety','bug_report','feedback','other') then
    raise exception 'Unsupported contact ticket category filter';
  end if;
  if clean_assignment is not null and clean_assignment not in ('all','mine','unassigned') then
    begin
      perform clean_assignment::uuid;
    exception when invalid_text_representation then
      raise exception 'Unsupported contact ticket assignment filter';
    end;
  end if;
  if clean_sort not in ('updated_desc','updated_asc','created_desc','priority_desc') then
    raise exception 'Unsupported contact ticket sort';
  end if;

  page_size := least(greatest(coalesce(page_size, 25), 1), 100);
  page_offset := greatest(coalesce(page_offset, 0), 0);

  return query
  select t.id,
         t.ticket_number,
         ('CON-' || t.ticket_number)::text,
         t.ticket_type,
         t.subject,
         null::uuid,
         null::text,
         coalesce(nullif(t.contact_name, ''), t.contact_email, 'Public contact')::text,
         t.category,
         t.status,
         t.priority,
         t.assigned_staff_id,
         assigned.display_name,
         t.created_at,
         t.updated_at,
         latest_message.created_at,
         count(*) over ()
    from public.support_tickets t
    left join public.profiles assigned on assigned.id = t.assigned_staff_id
    left join lateral (
      select m.created_at
        from public.support_ticket_messages m
       where m.ticket_id = t.id
       order by m.created_at desc
       limit 1
    ) latest_message on true
   where t.ticket_type = 'public_contact'
     and (clean_status is null or clean_status = 'all'
      or (clean_status = 'open' and t.status <> 'resolved')
      or (clean_status = 'mine' and t.assigned_staff_id = auth.uid())
      or (clean_status = 'unassigned' and t.assigned_staff_id is null)
      or t.status = clean_status)
     and (clean_category is null or t.category = clean_category)
     and (clean_assignment is null or clean_assignment = 'all'
      or (clean_assignment = 'mine' and t.assigned_staff_id = auth.uid())
      or (clean_assignment = 'unassigned' and t.assigned_staff_id is null)
      or (case when clean_assignment not in ('all','mine','unassigned') then clean_assignment::uuid end = t.assigned_staff_id))
     and (clean_search is null
      or t.subject ilike '%' || clean_search || '%'
      or ('CON-' || t.ticket_number)::text ilike '%' || clean_search || '%'
      or t.contact_name ilike '%' || clean_search || '%'
      or t.contact_email ilike '%' || clean_search || '%')
   order by
     case when clean_sort = 'priority_desc' then case t.priority when 'urgent' then 0 when 'high' then 1 when 'normal' then 2 else 3 end end asc nulls last,
     case when clean_sort = 'updated_asc' then t.updated_at end asc nulls last,
     case when clean_sort = 'created_desc' then t.created_at end desc nulls last,
     case when clean_sort in ('updated_desc','priority_desc') then t.updated_at end desc nulls last,
     t.id
   limit page_size offset page_offset;
end;
$$;

create or replace function public.staff_get_support_ticket(ticket_uuid uuid)
returns jsonb
language plpgsql
security definer
stable
set search_path = pg_catalog, public
as $$
declare
  result jsonb;
begin
  if not public.is_moderator() then
    raise exception 'Moderator authorization required';
  end if;

  select jsonb_build_object(
    'ticket', jsonb_build_object(
      'id', t.id,
      'ticket_number', t.ticket_number,
      'ticket_code', case when t.ticket_type = 'public_contact' then 'CON-' else 'SUP-' end || t.ticket_number,
      'ticket_type', t.ticket_type,
      'subject', t.subject,
      'category', t.category,
      'status', t.status,
      'priority', t.priority,
      'created_at', t.created_at,
      'updated_at', t.updated_at,
      'resolved_at', t.resolved_at,
      'requester', case
        when t.requester_id is not null then jsonb_build_object(
          'id', t.requester_id, 'username', requester.username, 'display_name', requester.display_name
        )
        when t.ticket_type = 'public_contact' then jsonb_build_object(
          'type', 'public_contact',
          'display_name', coalesce(nullif(t.contact_name, ''), t.contact_email, 'Public contact'),
          'email', t.contact_email
        )
        else null
      end,
      'contact', case when t.ticket_type = 'public_contact' then jsonb_build_object(
        'name', t.contact_name,
        'email', t.contact_email,
        'metadata', t.contact_request_metadata
      ) else null end,
      'assigned_staff', case when t.assigned_staff_id is null then null else jsonb_build_object(
        'id', t.assigned_staff_id, 'display_name', assigned.display_name
      ) end
    ),
    'messages', coalesce((select jsonb_agg(jsonb_build_object(
      'id', m.id,
      'author_id', m.author_id,
      'author_name', coalesce(
        author.display_name,
        author.username,
        case
          when t.ticket_type = 'public_contact' and m.author_id is null and not m.is_internal
            then coalesce(nullif(t.contact_name, ''), t.contact_email, 'Public contact')
          else 'Former account'
        end
      ),
      'body', m.body,
      'is_internal', m.is_internal,
      'created_at', m.created_at
    ) order by m.created_at asc)
      from public.support_ticket_messages m
      left join public.profiles author on author.id = m.author_id
     where m.ticket_id = t.id), '[]'::jsonb),
    'attachments', coalesce((select jsonb_agg(jsonb_build_object(
      'id', a.id,
      'storage_path', a.storage_path,
      'file_name', a.file_name,
      'mime_type', a.mime_type,
      'size_bytes', a.size_bytes,
      'created_at', a.created_at
    ) order by a.created_at asc)
      from public.support_ticket_attachments a
     where a.ticket_id = t.id), '[]'::jsonb)
  ) into result
    from public.support_tickets t
    left join public.profiles requester on requester.id = t.requester_id
    left join public.profiles assigned on assigned.id = t.assigned_staff_id
   where t.id = ticket_uuid;

  return result;
end;
$$;

create or replace function public.submit_public_contact_ticket(
  p_name text,
  p_email text,
  p_category text,
  p_subject text,
  p_message text,
  p_client_key text default null
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  clean_name text := nullif(btrim(coalesce(p_name, '')), '');
  clean_email text := lower(btrim(coalesce(p_email, '')));
  clean_category text := lower(btrim(coalesce(p_category, '')));
  clean_subject text := btrim(coalesce(p_subject, ''));
  clean_message text := btrim(coalesce(p_message, ''));
  clean_client_key text := nullif(btrim(coalesce(p_client_key, '')), '');
  client_hash text := null;
  ticket_id uuid;
begin
  if clean_client_key is not null then
    client_hash := encode(extensions.digest(clean_client_key, 'sha256'), 'hex');
  end if;

  perform pg_advisory_xact_lock(hashtext('public-contact:' || clean_email));

  if clean_name is not null and char_length(clean_name) > 120 then
    raise exception 'Use a shorter name';
  end if;
  if clean_email !~* '^[^[:space:]<>@]+@[^[:space:]<>@]+\.[^[:space:]<>@]+$'
     or char_length(clean_email) > 254 then
    raise exception 'Enter a valid email address';
  end if;
  if clean_category not in ('account_access','privacy_safety','bug_report','feedback','other') then
    raise exception 'Choose a valid topic';
  end if;
  if char_length(clean_subject) < 3 or char_length(clean_subject) > 200 then
    raise exception 'Subject must be 3 to 200 characters';
  end if;
  if char_length(clean_message) < 10 or char_length(clean_message) > 4000 then
    raise exception 'Message must be 10 to 4000 characters';
  end if;

  if exists (
    select 1
      from public.support_tickets t
     where t.ticket_type = 'public_contact'
       and lower(t.contact_email) = clean_email
       and t.created_at > now() - interval '1 minute'
  ) then
    raise exception 'Please wait before sending another message';
  end if;

  if (
    select count(*)
      from public.support_tickets t
     where t.ticket_type = 'public_contact'
       and lower(t.contact_email) = clean_email
       and t.created_at > now() - interval '24 hours'
  ) >= 5 then
    raise exception 'Please wait before sending another message';
  end if;

  if client_hash is not null and exists (
    select 1
      from public.support_tickets t
     where t.ticket_type = 'public_contact'
       and t.contact_request_metadata->>'client_key_hash' = client_hash
       and t.created_at > now() - interval '1 minute'
  ) then
    raise exception 'Please wait before sending another message';
  end if;

  if client_hash is not null and (
    select count(*)
      from public.support_tickets t
     where t.ticket_type = 'public_contact'
       and t.contact_request_metadata->>'client_key_hash' = client_hash
       and t.created_at > now() - interval '24 hours'
  ) >= 10 then
    raise exception 'Please wait before sending another message';
  end if;

  insert into public.support_tickets (
    ticket_type,
    subject,
    requester_id,
    contact_name,
    contact_email,
    contact_request_metadata,
    category,
    status,
    priority
  )
  values (
    'public_contact',
    clean_subject,
    null,
    clean_name,
    clean_email,
    jsonb_strip_nulls(jsonb_build_object('client_key_hash', client_hash)),
    clean_category,
    'open',
    'normal'
  )
  returning id into ticket_id;

  insert into public.support_ticket_messages (ticket_id, author_id, body, is_internal)
  values (ticket_id, null, clean_message, false);

  return ticket_id;
end;
$$;

revoke all on function public.staff_support_open_count() from public, anon, authenticated;
grant execute on function public.staff_support_open_count() to authenticated;
revoke all on function public.staff_contact_open_count() from public, anon, authenticated;
grant execute on function public.staff_contact_open_count() to authenticated;
revoke all on function public.staff_list_support_tickets(text, text, text, text, text, integer, integer) from public, anon, authenticated;
grant execute on function public.staff_list_support_tickets(text, text, text, text, text, integer, integer) to authenticated;
revoke all on function public.staff_list_public_contact_tickets(text, text, text, text, text, integer, integer) from public, anon, authenticated;
grant execute on function public.staff_list_public_contact_tickets(text, text, text, text, text, integer, integer) to authenticated;
revoke all on function public.staff_get_support_ticket(uuid) from public, anon, authenticated;
grant execute on function public.staff_get_support_ticket(uuid) to authenticated;
revoke all on function public.submit_public_contact_ticket(text, text, text, text, text, text) from public, anon, authenticated;
grant execute on function public.submit_public_contact_ticket(text, text, text, text, text, text) to anon, authenticated;
