-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- Profiles (extends auth.users)
create table public.profiles (
  id uuid references auth.users(id) on delete cascade primary key,
  name text not null,
  avatar_url text,
  is_super_admin boolean default false,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Establishments
create table public.establishments (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  slug text unique not null,
  address text,
  phone text,
  plan text default 'basic' check (plan in ('basic', 'pro')),
  active boolean default true,
  owner_id uuid references auth.users(id),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Establishment Members (employees linked to establishments)
create table public.establishment_members (
  id uuid primary key default uuid_generate_v4(),
  establishment_id uuid references public.establishments(id) on delete cascade not null,
  user_id uuid references auth.users(id) on delete cascade not null,
  role text not null check (role in ('owner', 'admin', 'cashier')),
  active boolean default true,
  created_at timestamptz default now(),
  unique(establishment_id, user_id)
);

-- Categories
create table public.categories (
  id uuid primary key default uuid_generate_v4(),
  establishment_id uuid references public.establishments(id) on delete cascade not null,
  name text not null,
  color text default '#6366f1',
  created_at timestamptz default now()
);

-- Products
create table public.products (
  id uuid primary key default uuid_generate_v4(),
  establishment_id uuid references public.establishments(id) on delete cascade not null,
  category_id uuid references public.categories(id),
  name text not null,
  barcode text,
  description text,
  price numeric(10,2) not null default 0,
  cost numeric(10,2) default 0,
  stock_qty numeric(10,3) not null default 0,
  min_stock numeric(10,3) default 0,
  unit text default 'un' check (unit in ('un', 'kg', 'g', 'l', 'ml', 'cx', 'm')),
  active boolean default true,
  image_url text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index idx_products_barcode on public.products(establishment_id, barcode);
create index idx_products_establishment on public.products(establishment_id);

-- Stock Movements
create table public.stock_movements (
  id uuid primary key default uuid_generate_v4(),
  establishment_id uuid references public.establishments(id) on delete cascade not null,
  product_id uuid references public.products(id) on delete cascade not null,
  type text not null check (type in ('in', 'out', 'adjustment')),
  qty numeric(10,3) not null,
  reason text,
  reference_type text,
  reference_id uuid,
  employee_id uuid references auth.users(id),
  created_at timestamptz default now()
);

-- Sales
create table public.sales (
  id uuid primary key default uuid_generate_v4(),
  establishment_id uuid references public.establishments(id) on delete cascade not null,
  employee_id uuid references auth.users(id),
  tab_id uuid,
  subtotal numeric(10,2) not null default 0,
  discount numeric(10,2) default 0,
  total numeric(10,2) not null default 0,
  status text default 'completed' check (status in ('completed', 'cancelled', 'pending')),
  notes text,
  created_at timestamptz default now()
);
create index idx_sales_establishment on public.sales(establishment_id);
create index idx_sales_created_at on public.sales(establishment_id, created_at);

-- Sale Items
create table public.sale_items (
  id uuid primary key default uuid_generate_v4(),
  sale_id uuid references public.sales(id) on delete cascade not null,
  product_id uuid references public.products(id) not null,
  qty numeric(10,3) not null,
  unit_price numeric(10,2) not null,
  subtotal numeric(10,2) not null
);

-- Sale Payments (supports mixed payment types)
create table public.sale_payments (
  id uuid primary key default uuid_generate_v4(),
  sale_id uuid references public.sales(id) on delete cascade not null,
  payment_type text not null check (payment_type in ('cash', 'pix', 'debit', 'credit')),
  amount numeric(10,2) not null,
  received_amount numeric(10,2),
  change_amount numeric(10,2)
);

-- Tabs (Comandas)
create table public.tabs (
  id uuid primary key default uuid_generate_v4(),
  establishment_id uuid references public.establishments(id) on delete cascade not null,
  customer_name text not null,
  table_number text,
  employee_id uuid references auth.users(id),
  status text default 'open' check (status in ('open', 'closed', 'cancelled')),
  subtotal numeric(10,2) default 0,
  total numeric(10,2) default 0,
  notes text,
  opened_at timestamptz default now(),
  closed_at timestamptz,
  sale_id uuid references public.sales(id)
);
create index idx_tabs_establishment on public.tabs(establishment_id, status);

-- Tab Items
create table public.tab_items (
  id uuid primary key default uuid_generate_v4(),
  tab_id uuid references public.tabs(id) on delete cascade not null,
  product_id uuid references public.products(id) not null,
  qty numeric(10,3) not null,
  unit_price numeric(10,2) not null,
  subtotal numeric(10,2) not null,
  added_by uuid references auth.users(id),
  created_at timestamptz default now()
);

-- RLS Policies
alter table public.profiles enable row level security;
alter table public.establishments enable row level security;
alter table public.establishment_members enable row level security;
alter table public.categories enable row level security;
alter table public.products enable row level security;
alter table public.stock_movements enable row level security;
alter table public.sales enable row level security;
alter table public.sale_items enable row level security;
alter table public.sale_payments enable row level security;
alter table public.tabs enable row level security;
alter table public.tab_items enable row level security;

create or replace function public.is_member_of(establishment_id uuid)
returns boolean language sql security definer as $$
  select exists (
    select 1 from public.establishment_members em
    where em.establishment_id = $1
    and em.user_id = auth.uid()
    and em.active = true
  );
$$;

create or replace function public.is_admin_of(establishment_id uuid)
returns boolean language sql security definer as $$
  select exists (
    select 1 from public.establishment_members em
    where em.establishment_id = $1
    and em.user_id = auth.uid()
    and em.role in ('owner', 'admin')
    and em.active = true
  );
$$;

create or replace function public.is_super_admin()
returns boolean language sql security definer as $$
  select coalesce((select is_super_admin from public.profiles where id = auth.uid()), false);
$$;

create policy "Users can read own profile" on public.profiles for select using (id = auth.uid() or public.is_super_admin());
create policy "Users can update own profile" on public.profiles for update using (id = auth.uid());
create policy "Enable insert for auth users" on public.profiles for insert with check (id = auth.uid());

create policy "Members can read their establishments" on public.establishments
  for select using (public.is_member_of(id) or public.is_super_admin());
create policy "Owners can update establishments" on public.establishments
  for update using (owner_id = auth.uid() or public.is_super_admin());
create policy "Authenticated can create establishments" on public.establishments
  for insert with check (owner_id = auth.uid());

create policy "Members can read their establishment members" on public.establishment_members
  for select using (public.is_member_of(establishment_id) or public.is_super_admin());
create policy "Admins can manage members" on public.establishment_members
  for update using (public.is_admin_of(establishment_id) or public.is_super_admin());
create policy "Admins can delete members" on public.establishment_members
  for delete using (public.is_admin_of(establishment_id) or public.is_super_admin());
create policy "Admins or owners can insert members" on public.establishment_members
  for insert with check (
    public.is_admin_of(establishment_id)
    or exists (select 1 from public.establishments e where e.id = establishment_id and e.owner_id = auth.uid())
    or public.is_super_admin()
  );

create policy "Members can read categories" on public.categories
  for select using (public.is_member_of(establishment_id) or public.is_super_admin());
create policy "Admins can manage categories" on public.categories
  for all using (public.is_admin_of(establishment_id) or public.is_super_admin());

create policy "Members can read products" on public.products
  for select using (public.is_member_of(establishment_id) or public.is_super_admin());
create policy "Admins can manage products" on public.products
  for all using (public.is_admin_of(establishment_id) or public.is_super_admin());
create policy "Cashiers can update product stock" on public.products
  for update using (public.is_member_of(establishment_id));

create policy "Members can read stock movements" on public.stock_movements
  for select using (public.is_member_of(establishment_id) or public.is_super_admin());
create policy "Members can create stock movements" on public.stock_movements
  for insert with check (public.is_member_of(establishment_id));
create policy "Admins can manage stock movements" on public.stock_movements
  for all using (public.is_admin_of(establishment_id) or public.is_super_admin());

create policy "Members can read sales" on public.sales
  for select using (public.is_member_of(establishment_id) or public.is_super_admin());
create policy "Members can create sales" on public.sales
  for insert with check (public.is_member_of(establishment_id));
create policy "Admins can manage sales" on public.sales
  for all using (public.is_admin_of(establishment_id) or public.is_super_admin());

create policy "Members can manage sale items" on public.sale_items
  for all using (exists (select 1 from public.sales s where s.id = sale_id and public.is_member_of(s.establishment_id)));
create policy "Members can manage sale payments" on public.sale_payments
  for all using (exists (select 1 from public.sales s where s.id = sale_id and public.is_member_of(s.establishment_id)));

create policy "Members can read tabs" on public.tabs
  for select using (public.is_member_of(establishment_id) or public.is_super_admin());
create policy "Members can create tabs" on public.tabs
  for insert with check (public.is_member_of(establishment_id));
create policy "Members can update tabs" on public.tabs
  for update using (public.is_member_of(establishment_id));
create policy "Admins can delete tabs" on public.tabs
  for delete using (public.is_admin_of(establishment_id) or public.is_super_admin());

create policy "Members can manage tab items" on public.tab_items
  for all using (exists (select 1 from public.tabs t where t.id = tab_id and public.is_member_of(t.establishment_id)));

-- Auto-create owner membership when an establishment is created
create or replace function public.handle_new_establishment()
returns trigger language plpgsql security definer as $$
begin
  if new.owner_id is not null then
    insert into public.establishment_members (establishment_id, user_id, role)
    values (new.id, new.owner_id, 'owner')
    on conflict (establishment_id, user_id) do nothing;
  end if;
  return new;
end;
$$;
create trigger on_establishment_created
  after insert on public.establishments
  for each row execute function public.handle_new_establishment();

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer as $$
begin
  insert into public.profiles (id, name)
  values (new.id, coalesce(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)));
  return new;
end;
$$;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
