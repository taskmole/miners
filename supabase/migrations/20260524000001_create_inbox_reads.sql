create table if not exists public.inbox_reads (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  place_id uuid not null,
  city_id text not null,
  created_at timestamptz not null default now(),
  unique (user_id, place_id)
);

create index idx_inbox_reads_user_city on public.inbox_reads (user_id, city_id);

alter table public.inbox_reads enable row level security;

create policy "Users can view own inbox reads"
  on public.inbox_reads for select
  using (user_id = auth.uid());

create policy "Users can insert own inbox reads"
  on public.inbox_reads for insert
  with check (user_id = auth.uid());

create policy "Users can delete own inbox reads"
  on public.inbox_reads for delete
  using (user_id = auth.uid());
