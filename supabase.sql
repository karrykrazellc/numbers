create table if not exists public.phone_numbers (
  id bigint generated always as identity primary key,
  phone text not null unique,
  created_at timestamptz not null default now()
);

alter table public.phone_numbers enable row level security;

drop policy if exists "Allow public read phone_numbers" on public.phone_numbers;
create policy "Allow public read phone_numbers"
on public.phone_numbers
for select
to anon, authenticated
using (true);

drop policy if exists "Allow public insert phone_numbers" on public.phone_numbers;
create policy "Allow public insert phone_numbers"
on public.phone_numbers
for insert
to anon, authenticated
with check (true);

drop policy if exists "Allow public delete phone_numbers" on public.phone_numbers;
create policy "Allow public delete phone_numbers"
on public.phone_numbers
for delete
to anon, authenticated
using (true);