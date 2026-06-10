-- SplitPay Supabase Database Schema DDL
-- Paste this script into the Supabase SQL Editor to initialize the database structure and security rules.

-- 1. App Configuration Table (To store admin UUID and public settings)
create table if not exists public.app_config (
    key text primary key,
    value text not null,
    created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Enable RLS on app_config
alter table public.app_config enable row level security;

-- 2. User Profiles Table (Associated with Supabase Auth users)
create table if not exists public.profiles (
    id uuid references auth.users on delete cascade primary key,
    email text not null,
    username text,
    payment_link text,
    phone_number text,
    iban text,
    status text default 'pending'::text not null check (status in ('pending', 'approved', 'rejected')),
    created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Enable RLS on profiles
alter table public.profiles enable row level security;

-- 3. Groups Table
create table if not exists public.groups (
    id uuid default gen_random_uuid() primary key,
    name text not null,
    created_by uuid references public.profiles(id) on delete set null,
    created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Enable RLS on groups
alter table public.groups enable row level security;

-- 4. Group Members Table (Junction Table)
create table if not exists public.group_members (
    group_id uuid references public.groups(id) on delete cascade,
    profile_id uuid references public.profiles(id) on delete cascade,
    created_at timestamp with time zone default timezone('utc'::text, now()) not null,
    primary key (group_id, profile_id)
);

-- Enable RLS on group_members
alter table public.group_members enable row level security;

-- 5. Expenses Table
create table if not exists public.expenses (
    id uuid default gen_random_uuid() primary key,
    group_id uuid references public.groups(id) on delete cascade not null,
    description text not null,
    amount numeric(12, 2) not null check (amount > 0),
    paid_by uuid references public.profiles(id) on delete restrict not null,
    is_pending boolean default false not null,
    deleted_at timestamp with time zone default null,
    created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Enable RLS on expenses
alter table public.expenses enable row level security;

-- 6. Expense Beneficiaries Table (Junction Table with custom parts/weight)
create table if not exists public.expense_beneficiaries (
    expense_id uuid references public.expenses(id) on delete cascade,
    profile_id uuid references public.profiles(id) on delete cascade,
    parts numeric(10, 4) default 1.0000 not null check (parts >= 0),
    primary key (expense_id, profile_id)
);

-- Enable RLS on expense_beneficiaries
alter table public.expense_beneficiaries enable row level security;


-- ==========================================
-- TRIGGERS & FUNCTIONS
-- ==========================================

-- Trigger to create profile on new user sign-up
create or replace function public.handle_new_user()
returns trigger as $$
begin
    insert into public.profiles (id, email, username, payment_link, status)
    values (
        new.id,
        new.email,
        coalesce(new.raw_user_meta_data->>'username', split_part(new.email, '@', 1)),
        new.raw_user_meta_data->>'payment_link',
        'pending'
    );
    return new;
end;
$$ language plpgsql security definer;

-- Recreate trigger if exists
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
    after insert on auth.users
    for each row execute procedure public.handle_new_user();

-- Trigger to validate profile updates (ensure only admins can change status)
create or replace function public.check_profile_update()
returns trigger as $$
declare
    admin_uuid text;
begin
    -- Retrieve the admin UUID from the config table
    select value into admin_uuid from public.app_config where key = 'admin_uuid' limit 1;

    -- If status is changing, enforce that only the admin can change it
    if (old.status is distinct from new.status) then
        if (auth.uid()::text <> admin_uuid or admin_uuid is null) then
            raise exception 'Only the administrator can change user approval status.';
        end if;
    end if;

    -- If a user is updating a profile that is NOT their own, enforce they must be admin
    if (auth.uid() <> old.id) then
        if (auth.uid()::text <> admin_uuid or admin_uuid is null) then
            raise exception 'You do not have permission to update this profile.';
        end if;
    end if;

    return new;
end;
$$ language plpgsql security definer;

-- Recreate trigger if exists
drop trigger if exists before_profile_update on public.profiles;
create trigger before_profile_update
    before update on public.profiles
    for each row execute procedure public.check_profile_update();


-- ==========================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- ==========================================

-- Helper function to fetch admin UUID without RLS recursion
create or replace function public.get_admin_uuid()
returns text
language sql
security definer
set search_path = ''
as $$
    select value from public.app_config where key = 'admin_uuid' limit 1;
$$;

-- Helper function to check group membership without RLS recursion
create or replace function public.is_group_member(group_id uuid, user_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
    return exists (
        select 1 from public.group_members
        where group_members.group_id = $1 and group_members.profile_id = $2
    );
end;
$$;

-- Helper function to check if a user is an expense beneficiary without RLS recursion
create or replace function public.is_expense_beneficiary(expense_id uuid, user_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
    return exists (
        select 1 from public.expense_beneficiaries
        where expense_beneficiaries.expense_id = $1 and expense_beneficiaries.profile_id = $2
    );
end;
$$;

-- Helper function to check group membership for an expense without RLS recursion
create or replace function public.is_expense_group_member(expense_id uuid, user_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
    return exists (
        select 1 from public.expenses e
        join public.group_members m on e.group_id = m.group_id
        where e.id = $1 and m.profile_id = $2
    );
end;
$$;



-- App Config Policies
create policy "Allow public read access to app config"
    on public.app_config for select
    using (true);

create policy "Allow admin full access to app config"
    on public.app_config for all
    using (
        auth.uid()::text = public.get_admin_uuid()
        or public.get_admin_uuid() is null -- Allow initial setup
    );

-- Helper function to check if requesting user is approved
create or replace function public.is_approved_user(user_id uuid)
returns boolean as $$
begin
    return exists (
        select 1 from public.profiles
        where id = user_id and status = 'approved'
    );
end;
$$ language plpgsql security definer;

-- Profiles Policies
create policy "Allow users to read approved profiles and their own profile"
    on public.profiles for select
    using (
        status = 'approved'
        or auth.uid() = id
        or auth.uid()::text = public.get_admin_uuid()
    );

create policy "Allow users to update their own profiles"
    on public.profiles for update
    using (auth.uid() = id);

create policy "Allow admin full control over profiles"
    on public.profiles for all
    using (auth.uid()::text = public.get_admin_uuid());

-- Groups Policies
create policy "Allow approved users to read groups"
    on public.groups for select
    using (
        public.is_approved_user(auth.uid())
    );

create policy "Allow approved users to create groups"
    on public.groups for insert
    with check (
        public.is_approved_user(auth.uid())
        and created_by = auth.uid()
    );

create policy "Allow creator and admin to update groups"
    on public.groups for update
    using (
        (created_by = auth.uid() and public.is_approved_user(auth.uid()))
        or auth.uid()::text = public.get_admin_uuid()
    );

create policy "Allow creator and admin to delete groups"
    on public.groups for delete
    using (
        (created_by = auth.uid() and public.is_approved_user(auth.uid()))
        or auth.uid()::text = public.get_admin_uuid()
    );

-- Group Members Policies
create policy "Allow members to view group memberships"
    on public.group_members for select
    using (
        public.is_approved_user(auth.uid())
        and public.is_group_member(group_id, auth.uid())
    );

create policy "Allow users to join or members to add memberships"
    on public.group_members for insert
    with check (
        public.is_approved_user(auth.uid())
        and (
            -- Either joining themselves
            profile_id = auth.uid()
            -- Or the creator of the group
            or exists (
                select 1 from public.groups
                where id = group_id and created_by = auth.uid()
            )
            -- Or already a member of the group
            or public.is_group_member(group_id, auth.uid())
        )
    );

create policy "Allow members to leave or group creator/admin to remove memberships"
    on public.group_members for delete
    using (
        public.is_approved_user(auth.uid())
        and (
            -- The member themselves leaving
            profile_id = auth.uid()
            -- Or the creator of the group
            or exists (
                select 1 from public.groups
                where id = group_id and created_by = auth.uid()
            )
            -- Or the admin
            or auth.uid()::text = public.get_admin_uuid()
        )
    );

-- Expenses Policies
create policy "Allow members to view expenses"
    on public.expenses for select
    using (
        public.is_approved_user(auth.uid())
        and exists (
            select 1 from public.group_members
            where group_id = expenses.group_id and profile_id = auth.uid()
        )
    );

create policy "Allow members to add expenses"
    on public.expenses for insert
    with check (
        public.is_approved_user(auth.uid())
        and exists (
            select 1 from public.group_members
            where group_id = expenses.group_id and profile_id = auth.uid()
        )
        and exists (
            select 1 from public.group_members
            where group_id = expenses.group_id and profile_id = expenses.paid_by
        )
    );

create policy "Allow payer, beneficiary or group creator to update expenses"
    on public.expenses for update
    using (
        public.is_approved_user(auth.uid())
        and (
            paid_by = auth.uid()
            or exists (
                select 1 from public.groups
                where id = group_id and created_by = auth.uid()
            )
            or public.is_expense_beneficiary(id, auth.uid())
        )
    );

create policy "Allow payer, beneficiary (if pending) or group creator to delete expenses"
    on public.expenses for delete
    using (
        public.is_approved_user(auth.uid())
        and (
            paid_by = auth.uid()
            or exists (
                select 1 from public.groups
                where id = group_id and created_by = auth.uid()
            )
            or (is_pending = true and public.is_expense_beneficiary(id, auth.uid()))
        )
    );

-- Expense Beneficiaries Policies
create policy "Allow members to view beneficiaries"
    on public.expense_beneficiaries for select
    using (
        public.is_approved_user(auth.uid())
        and public.is_expense_group_member(expense_id, auth.uid())
    );

create policy "Allow members to manage beneficiaries"
    on public.expense_beneficiaries for all
    using (
        public.is_approved_user(auth.uid())
        and public.is_expense_group_member(expense_id, auth.uid())
    );

-- ==========================================
-- RPC FUNCTIONS (called from frontend)
-- ==========================================

-- Atomic admin setup: claims admin role if unclaimed, auto-approves admin profile.
-- Runs as security definer to bypass RLS — the check_profile_update trigger
-- still enforces authorization via auth.uid() vs admin_uuid.
create or replace function public.setup_admin_if_needed()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
    current_admin_uuid text;
    caller_id uuid;
    caller_status text;
begin
    -- Get the calling user's ID from JWT
    caller_id := auth.uid();
    if caller_id is null then
        return jsonb_build_object('error', 'Not authenticated');
    end if;

    -- Check if admin already exists
    select value into current_admin_uuid
    from public.app_config
    where key = 'admin_uuid';

    -- If no admin exists, this user claims admin
    if current_admin_uuid is null then
        insert into public.app_config (key, value)
        values ('admin_uuid', caller_id::text)
        on conflict (key) do nothing;

        -- Re-read to handle race conditions (another user may have claimed first)
        select value into current_admin_uuid
        from public.app_config
        where key = 'admin_uuid';
    end if;

    -- If caller is the admin, ensure their profile is approved
    if current_admin_uuid = caller_id::text then
        update public.profiles
        set status = 'approved'
        where id = caller_id and status <> 'approved';

        select status into caller_status
        from public.profiles
        where id = caller_id;

        return jsonb_build_object(
            'is_admin', true,
            'status', coalesce(caller_status, 'unknown'),
            'admin_uuid', current_admin_uuid
        );
    else
        -- Not admin, just return current status
        select status into caller_status
        from public.profiles
        where id = caller_id;

        return jsonb_build_object(
            'is_admin', false,
            'status', coalesce(caller_status, 'unknown'),
            'admin_uuid', current_admin_uuid
        );
    end if;
end;
$$;


-- ==========================================
-- PERMISSIONS & GRANTS
-- ==========================================

-- Grant schema usage to standard API roles
grant usage on schema public to anon, authenticated, service_role;

-- Grant table CRUD permissions
grant select, insert, update, delete on public.app_config to anon, authenticated, service_role;
grant select, insert, update, delete on public.profiles to anon, authenticated, service_role;
grant select, insert, update, delete on public.groups to anon, authenticated, service_role;
grant select, insert, update, delete on public.group_members to anon, authenticated, service_role;
grant select, insert, update, delete on public.expenses to anon, authenticated, service_role;
grant select, insert, update, delete on public.expense_beneficiaries to anon, authenticated, service_role;

-- Grant sequence usage for auto-increment keys
grant usage, select on all sequences in schema public to anon, authenticated, service_role;
