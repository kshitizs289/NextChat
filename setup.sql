-- ============================================================
--  NexChat — Supabase Database Setup
--  Paste this entire file into:
--  Supabase Console → SQL Editor → New query → Run
-- ============================================================

-- ── Profiles (linked to auth.users) ──────────────────────────
create table if not exists public.profiles (
  id           uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default 'User',
  email        text,
  status       text default 'online',
  created_at   timestamptz default now(),
  updated_at   timestamptz default now()
);

-- ── Channels ──────────────────────────────────────────────────
create table if not exists public.channels (
  id          text primary key,
  name        text unique not null,
  description text default '',
  created_by  uuid references public.profiles(id),
  created_at  timestamptz default now()
);

-- ── Direct Message rooms ──────────────────────────────────────
create table if not exists public.dms (
  id          text primary key,   -- sorted UIDs joined with "_"
  member1_id  uuid not null references public.profiles(id) on delete cascade,
  member2_id  uuid not null references public.profiles(id) on delete cascade,
  last_at     timestamptz default now(),
  created_at  timestamptz default now()
);

-- ── Messages ──────────────────────────────────────────────────
create table if not exists public.messages (
  id          uuid primary key default gen_random_uuid(),
  room_id     text not null,
  room_type   text not null check (room_type in ('channel','dm')),
  sender_id   uuid references public.profiles(id) on delete set null,
  sender_name text not null,
  text        text not null,
  msg_type    text not null default 'text',
  created_at  timestamptz default now()
);

-- ── Indexes ───────────────────────────────────────────────────
create index if not exists messages_room_idx  on public.messages(room_id, created_at);
create index if not exists messages_sender_idx on public.messages(sender_id);
create index if not exists dms_member1_idx    on public.dms(member1_id);
create index if not exists dms_member2_idx    on public.dms(member2_id);

-- ── Default channels ──────────────────────────────────────────
insert into public.channels (id, name, description) values
  ('general',       'general',       'General chat for everyone'),
  ('random',        'random',        'Off-topic, fun stuff'),
  ('announcements', 'announcements', 'Important updates')
on conflict (id) do nothing;

-- ── Trigger: auto-create profile on signup ───────────────────
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  insert into public.profiles (id, display_name, email)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1)),
    new.email
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ── Row Level Security ────────────────────────────────────────
alter table public.profiles enable row level security;
alter table public.channels  enable row level security;
alter table public.dms       enable row level security;
alter table public.messages  enable row level security;

-- Profiles: anyone logged in can read; only owner can update
drop policy if exists "profiles_read"   on public.profiles;
drop policy if exists "profiles_update" on public.profiles;
create policy "profiles_read"   on public.profiles for select to authenticated using (true);
create policy "profiles_update" on public.profiles for update to authenticated using (auth.uid() = id);
create policy "profiles_insert" on public.profiles for insert to authenticated with check (auth.uid() = id);

-- Channels: anyone logged in can read/create
drop policy if exists "channels_read"   on public.channels;
drop policy if exists "channels_insert" on public.channels;
create policy "channels_read"   on public.channels for select to authenticated using (true);
create policy "channels_insert" on public.channels for insert to authenticated with check (true);

-- Messages: anyone logged in can read; only sender can delete
drop policy if exists "messages_read"   on public.messages;
drop policy if exists "messages_insert" on public.messages;
drop policy if exists "messages_delete" on public.messages;
create policy "messages_read"   on public.messages for select to authenticated using (true);
create policy "messages_insert" on public.messages for insert to authenticated with check (auth.uid() = sender_id);
create policy "messages_delete" on public.messages for delete to authenticated using (auth.uid() = sender_id);

-- DMs: only members can see their conversations
drop policy if exists "dms_read"   on public.dms;
drop policy if exists "dms_insert" on public.dms;
drop policy if exists "dms_update" on public.dms;
create policy "dms_read"   on public.dms for select to authenticated using (auth.uid() = member1_id or auth.uid() = member2_id);
create policy "dms_insert" on public.dms for insert to authenticated with check (auth.uid() = member1_id or auth.uid() = member2_id);
create policy "dms_update" on public.dms for update to authenticated using (auth.uid() = member1_id or auth.uid() = member2_id);

-- ── Enable Realtime on tables ─────────────────────────────────
-- (Required for postgres_changes subscriptions)
alter publication supabase_realtime add table public.messages;
alter publication supabase_realtime add table public.profiles;
alter publication supabase_realtime add table public.channels;
alter publication supabase_realtime add table public.dms;
