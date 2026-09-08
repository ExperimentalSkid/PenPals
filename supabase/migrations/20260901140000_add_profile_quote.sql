alter table public.profiles add column quote text not null default '' check (char_length(quote) <= 240);
