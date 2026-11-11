-- MAX DAILY Loyalty — run in Supabase SQL Editor.
-- Tables are locked (RLS on, no policies); the app talks only through the RPC functions below,
-- so the anon key cannot list customers or edit stamps arbitrarily.

create table if not exists customers (
  id uuid primary key default gen_random_uuid(),
  name varchar(100) not null,
  phone varchar(20) unique not null,
  stamps int not null default 0 check (stamps between 0 and 5),
  visits int not null default 0,
  redeemed int not null default 0,
  first_order boolean not null default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists stamp_transactions (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid references customers(id) on delete cascade,
  action_type varchar(20) not null, -- ADD_1 | ADD_2_FIRST | REDEEM
  stamps_delta int not null,
  created_at timestamptz default now()
);

alter table customers enable row level security;
alter table stamp_transactions enable row level security;

create or replace function md_register(p_name text, p_phone text) returns customers
language plpgsql security definer as $$
declare c customers;
begin
  select * into c from customers where phone = p_phone;
  if found then return c; end if;
  insert into customers(name, phone) values (p_name, p_phone) returning * into c;
  return c;
end $$;

create or replace function md_get(p_id uuid) returns customers
language sql security definer as $$ select * from customers where id = p_id $$;

create or replace function md_find_phone(p_phone text) returns customers
language sql security definer as $$ select * from customers where phone = p_phone $$;

create or replace function md_apply(p_id uuid, p_action text) returns customers
language plpgsql security definer as $$
declare c customers; add_n int;
begin
  select * into c from customers where id = p_id for update;
  if not found then raise exception 'Customer not found'; end if;
  if p_action = 'REDEEM' then
    if c.stamps < 5 then raise exception 'Card is not full yet'; end if;
    update customers set stamps = 0, redeemed = redeemed + 1, updated_at = now() where id = p_id returning * into c;
    insert into stamp_transactions(customer_id, action_type, stamps_delta) values (p_id, 'REDEEM', -5);
  else
    if c.stamps >= 5 then raise exception 'Card is full - redeem first'; end if;
    add_n := case when p_action = 'ADD_2_FIRST' and c.first_order then 2 else 1 end;
    update customers set stamps = least(5, stamps + add_n), visits = visits + 1, first_order = false, updated_at = now()
      where id = p_id returning * into c;
    insert into stamp_transactions(customer_id, action_type, stamps_delta) values (p_id, p_action, add_n);
  end if;
  return c;
end $$;

grant execute on function md_register(text,text), md_get(uuid), md_find_phone(text), md_apply(uuid,text) to anon;
-- NOTE: md_apply/md_find_phone are callable by anon (cashier PIN is client-side). Before launch,
-- move the cashier to Supabase Auth and revoke anon execute on those two.
