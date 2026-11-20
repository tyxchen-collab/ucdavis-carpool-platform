-- Phase 2.1: schema only. Review locally; this file has NOT been applied.
-- Run once as the Supabase migration/database owner, not as an API role.
-- No application connection, auth signup trigger, seed data, or approval RPC.
begin;

-- Fail rather than reuse a pre-existing schema with unknown ownership/objects.
create schema davis_private;
revoke all on schema davis_private from public, anon, authenticated, service_role;
grant usage on schema davis_private to authenticated;

-- No caller-supplied user ID, email, or metadata is trusted here.
-- Keep davis_private OUT of the Data API's exposed schemas.
create function davis_private.is_verified_ucdavis_user()
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1 from auth.users as u
    where u.id = (select auth.uid())
      and u.email_confirmed_at is not null
      and (u.banned_until is null or u.banned_until <= statement_timestamp())
      and not coalesce(u.is_anonymous, false)
      and lower(u.email) ~ '^[^@[:space:]]+@ucdavis[.]edu$'
  );
$$;
revoke all on function davis_private.is_verified_ucdavis_user() from public, anon, authenticated, service_role;
grant execute on function davis_private.is_verified_ucdavis_user() to authenticated;

create table public.profiles (
  id uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  nickname text not null check (char_length(nickname) <= 30 and char_length(btrim(nickname, E' \t\n\r')) >= 1),
  bio text not null default '' check (char_length(bio) <= 300),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table public.profiles is 'Private, self-managed profile. No email, phone, WeChat, student ID, or auth metadata copies. No public profile directory.';

create table public.trips (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  origin text not null check (char_length(origin) <= 120 and char_length(btrim(origin, E' \t\n\r')) >= 1),
  destination text not null check (char_length(destination) <= 120 and char_length(btrim(destination, E' \t\n\r')) >= 1),
  departure_date date not null check (isfinite(departure_date) and departure_date between date '0001-01-01' and date '9999-12-31'),
  -- Retain fractional seconds until the minute-precision CHECK rejects them;
  -- time(0) could silently round fractional inputs onto a valid minute.
  departure_time time without time zone not null,
  time_flexibility_minutes smallint not null default 30 check (time_flexibility_minutes in (15, 30, 60)),
  existing_traveler_count smallint not null default 1 check (existing_traveler_count between 1 and 6),
  additional_companions_requested smallint not null check (additional_companions_requested between 1 and 6),
  luggage_type text not null default 'none' check (luggage_type in ('none', 'backpack', 'carryOn', 'checked', 'mixed', 'other')),
  luggage_quantity smallint not null default 0 check (luggage_quantity between 0 and 12),
  notes text not null default '' check (char_length(notes) <= 500),
  status text not null default 'active' check (status in ('active', 'cancelled', 'completed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint trips_distinct_endpoints check (lower(regexp_replace(btrim(origin, E' \t\n\r'), '[[:space:]]+', ' ', 'g')) <> lower(regexp_replace(btrim(destination, E' \t\n\r'), '[[:space:]]+', ' ', 'g'))),
  constraint trips_luggage_consistent check ((luggage_type = 'none' and luggage_quantity = 0) or (luggage_type <> 'none' and luggage_quantity >= 1)),
  constraint trips_minute_precision check (extract(second from departure_time) = 0 and departure_time < time '24:00')
);
comment on column public.trips.departure_time is 'Local civil time in America/Los_Angeles; never interpret using the database session timezone.';
comment on column public.trips.existing_traveler_count is 'Owner party size, including the owner. Not the sum of approved join requests.';
comment on column public.trips.additional_companions_requested is 'Recruitment limit, not total vehicle seating. Future remaining capacity = this value minus SUM(approved party_size).';

create table public.trip_participants (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips(id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  party_size smallint not null default 1 check (party_size between 1 and 6),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'withdrawn')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint trip_participants_one_request_per_user unique (trip_id, user_id)
);
comment on table public.trip_participants is 'Private join requests. Direct approval and deletion are disabled. One request per user per trip, including historical requests.';
comment on column public.trip_participants.party_size is 'Applicant party size including applicant. Immutable after submission; future approval must reserve this many places.';

create index trips_owner_id_idx on public.trips(owner_id);
create index trips_active_departure_idx on public.trips(departure_date, departure_time) where status = 'active';
create index trip_participants_user_id_idx on public.trip_participants(user_id);
-- The unique index above already supports lookups by trip_id.

-- Column grants restrict writable fields; triggers additionally protect identity
-- and state transitions. RLS alone cannot compare OLD and NEW values.
create function davis_private.guard_profile_update()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if row(new.id, new.created_at) is distinct from row(old.id, old.created_at) then
    raise exception 'Profile identity and creation time are immutable' using errcode = '42501';
  end if;
  new.updated_at := statement_timestamp();
  return new;
end;
$$;

create function davis_private.guard_trip_write()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    if new.status <> 'active' then
      raise exception 'New trips must be active' using errcode = '23514';
    end if;
  else
    if row(new.id, new.owner_id, new.created_at) is distinct from row(old.id, old.owner_id, old.created_at) then
      raise exception 'Trip identity and owner are immutable' using errcode = '42501';
    end if;
    if old.status <> 'active' then
      raise exception 'Cancelled and completed trips cannot be edited or reopened' using errcode = '42501';
    end if;
    -- Closing a trip must not also rewrite its route, schedule, party or notes.
    if new.status <> 'active' and
      (to_jsonb(new) - array['status', 'updated_at']) is distinct from
      (to_jsonb(old) - array['status', 'updated_at']) then
      raise exception 'Cancellation and completion must change status only' using errcode = '42501';
    end if;
    if new.status = 'active' and
      ((old.departure_date + old.departure_time) at time zone 'America/Los_Angeles') <= clock_timestamp() then
      raise exception 'Departed trips cannot be edited or rescheduled; cancel or complete instead' using errcode = '42501';
    end if;
  end if;
  if new.status = 'active' and ((new.departure_date + new.departure_time) at time zone 'America/Los_Angeles') <= clock_timestamp() then
    raise exception 'Active departure must be in the future (California time)' using errcode = '23514';
  end if;
  if new.status = 'completed' and ((new.departure_date + new.departure_time) at time zone 'America/Los_Angeles') > clock_timestamp() then
    raise exception 'Future trips cannot be completed' using errcode = '23514';
  end if;
  new.updated_at := statement_timestamp();
  return new;
end;
$$;

-- SECURITY DEFINER is needed only for the parent-row lock: applicants must not
-- receive general UPDATE rights/policies on other people's trips. No RPC access.
-- This trigger repeats authorization explicitly rather than relying on bypassed RLS.
create function davis_private.guard_participant_write()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  parent public.trips%rowtype;
  caller uuid := auth.uid();
begin
  if tg_op = 'INSERT' then
    if caller is null or new.user_id is distinct from caller
       or not davis_private.is_verified_ucdavis_user() then
      raise exception 'A verified university user must submit their own request' using errcode = '42501';
    end if;
    -- SHARE conflicts with every parent UPDATE, including non-key status edits.
    -- A waiting insert checks the latest committed parent at READ COMMITTED;
    -- stronger isolation may raise a serialization error that callers must retry.
    select t.* into parent from public.trips t where t.id = new.trip_id for share;
    if not found then
      raise exception 'Trip is unavailable for this request' using errcode = '23514';
    end if;
    if parent.owner_id = caller or parent.status <> 'active'
       or ((parent.departure_date + parent.departure_time) at time zone 'America/Los_Angeles') <= clock_timestamp()
       or new.party_size > parent.additional_companions_requested then
      raise exception 'Trip is unavailable for this request' using errcode = '23514';
    end if;
    if new.status <> 'pending' then
      raise exception 'Join requests must start pending' using errcode = '42501';
    end if;
  else
    if row(new.id, new.trip_id, new.user_id, new.party_size, new.created_at)
       is distinct from row(old.id, old.trip_id, old.user_id, old.party_size, old.created_at) then
      raise exception 'Join request identity and party size are immutable' using errcode = '42501';
    end if;
    -- Closed-trip requests remain history; applicant withdrawal / owner rejection
    -- are still allowed. No approval, reopening, or changing request identity.
    if caller is null or old.status <> 'pending' or not (
      (new.status = 'withdrawn' and old.user_id = caller)
      or (new.status = 'rejected' and exists (
        select 1 from public.trips t where t.id = old.trip_id and t.owner_id = caller
      ))
    ) then
      raise exception 'Only applicant withdrawal or owner rejection of pending requests is allowed' using errcode = '42501';
    end if;
  end if;
  new.updated_at := statement_timestamp();
  return new;
end;
$$;

revoke all on function davis_private.guard_profile_update() from public, anon, authenticated, service_role;
revoke all on function davis_private.guard_trip_write() from public, anon, authenticated, service_role;
revoke all on function davis_private.guard_participant_write() from public, anon, authenticated, service_role;

create trigger profiles_guard before update on public.profiles for each row execute function davis_private.guard_profile_update();
create trigger trips_guard before insert or update on public.trips for each row execute function davis_private.guard_trip_write();
create trigger trip_participants_guard before insert or update on public.trip_participants for each row execute function davis_private.guard_participant_write();

alter table public.profiles enable row level security;
alter table public.trips enable row level security;
alter table public.trip_participants enable row level security;

-- Remove Supabase's possible default API grants before granting minimum access.
-- Privileged database owners/service credentials are trusted and must never be
-- used in a browser; RLS does not constrain BYPASSRLS roles.
revoke all on table public.profiles, public.trips, public.trip_participants from public, anon, authenticated;
grant select on public.profiles, public.trips, public.trip_participants to authenticated;
grant insert (id, nickname, bio) on public.profiles to authenticated;
grant update (nickname, bio) on public.profiles to authenticated;
grant insert (owner_id, origin, destination, departure_date, departure_time, time_flexibility_minutes, existing_traveler_count, additional_companions_requested, luggage_type, luggage_quantity, notes)
  on public.trips to authenticated;
grant update (origin, destination, departure_date, departure_time, time_flexibility_minutes, existing_traveler_count, additional_companions_requested, luggage_type, luggage_quantity, notes, status)
  on public.trips to authenticated;
grant insert (trip_id, user_id, party_size) on public.trip_participants to authenticated;
grant update (status) on public.trip_participants to authenticated;
-- No DELETE, TRUNCATE, ownership transfer, direct status insertion, or public access.

create policy profiles_read_self on public.profiles for select to authenticated
  using (id = (select auth.uid()));
create policy profiles_insert_self on public.profiles for insert to authenticated
  with check (id = (select auth.uid()));
create policy profiles_update_self on public.profiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

create policy trips_read on public.trips for select to authenticated
  using (
    owner_id = (select auth.uid())
    or ((select davis_private.is_verified_ucdavis_user()) and status = 'active'
      and ((departure_date + departure_time) at time zone 'America/Los_Angeles') > statement_timestamp())
  );
create policy trips_insert_verified_owner on public.trips for insert to authenticated
  with check (owner_id = (select auth.uid()) and (select davis_private.is_verified_ucdavis_user()) and status = 'active');
-- An owner who loses university verification can still cancel (status only).
-- The trigger prevents using this exception to modify any other trip fields.
create policy trips_update_owner on public.trips for update to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()) and
    (status = 'cancelled' or (select davis_private.is_verified_ucdavis_user())));

create policy participants_read_self_or_owner on public.trip_participants for select to authenticated
  using (user_id = (select auth.uid()) or exists (
    select 1 from public.trips t where t.id = trip_id and t.owner_id = (select auth.uid())
  ));
create policy participants_request_verified on public.trip_participants for insert to authenticated
  with check (
    user_id = (select auth.uid()) and status = 'pending'
    and (select davis_private.is_verified_ucdavis_user())
    and exists (
      select 1 from public.trips t where t.id = trip_id
        and t.owner_id <> (select auth.uid()) and t.status = 'active'
        and ((t.departure_date + t.departure_time) at time zone 'America/Los_Angeles') > statement_timestamp()
        and party_size <= t.additional_companions_requested
    )
  );
create policy participants_update_self_or_owner on public.trip_participants for update to authenticated
  using (user_id = (select auth.uid()) or exists (
    select 1 from public.trips t where t.id = trip_id and t.owner_id = (select auth.uid())
  ))
  with check (user_id = (select auth.uid()) or exists (
    select 1 from public.trips t where t.id = trip_id and t.owner_id = (select auth.uid())
  ));

commit;
