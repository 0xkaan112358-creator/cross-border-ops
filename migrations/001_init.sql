create table if not exists app_meta (
  key text primary key,
  value text not null
);

create table if not exists app_settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);

create table if not exists user_roles (
  email text primary key,
  role text not null,
  updated_by text,
  updated_at timestamptz not null default now()
);

create table if not exists skus (
  id serial primary key,
  sku text not null,
  marketplace text not null,
  asin text,
  name text not null,
  category text,
  owner text,
  unit_cost numeric(12, 2) not null default 0,
  case_pack integer not null default 1,
  moq integer not null default 0,
  production_days integer not null default 20,
  sea_days integer not null default 35,
  air_days integer not null default 10,
  receiving_days integer not null default 10,
  active boolean not null default true,
  updated_at timestamptz not null default now(),
  unique (sku, marketplace)
);

create table if not exists inventory (
  sku_id integer primary key references skus(id) on delete cascade,
  fba_available integer not null default 0,
  fba_inbound integer not null default 0,
  in_transit integer not null default 0,
  overseas_wh integer not null default 0,
  domestic_wh integer not null default 0,
  in_production integer not null default 0,
  aged_qty integer not null default 0,
  snapshot_date date not null default current_date,
  updated_at timestamptz not null default now()
);

create table if not exists daily_sales (
  sku_id integer not null references skus(id) on delete cascade,
  date date not null,
  units integer not null default 0,
  in_stock boolean not null default true,
  primary key (sku_id, date)
);

create table if not exists shipments (
  id serial primary key,
  shipment_no text not null,
  sku_id integer not null references skus(id) on delete cascade,
  qty integer not null,
  method text not null default 'sea',
  status text not null default '运输中',
  ship_date date,
  eta date,
  created_at timestamptz not null default now(),
  unique (shipment_no, sku_id)
);

create table if not exists promotions (
  id serial primary key,
  name text not null,
  marketplace text,
  start_date date not null,
  end_date date not null,
  factor numeric(5, 2) not null default 1
);

create table if not exists replenishment_decisions (
  id serial primary key,
  sku_id integer not null references skus(id) on delete cascade,
  suggested_qty integer not null,
  final_qty integer not null,
  reason text,
  decided_by text,
  created_at timestamptz not null default now()
);

create table if not exists orders (
  order_id text primary key,
  marketplace text,
  sku text,
  customer_name text,
  purchase_date date,
  carrier text,
  tracking_no text,
  shipping_status text,
  est_delivery date,
  updated_at timestamptz not null default now()
);

create table if not exists kb_documents (
  id serial primary key,
  title text not null,
  category text not null default '其他',
  filename text,
  char_count integer not null default 0,
  chunk_count integer not null default 0,
  uploaded_by text,
  is_sample boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists kb_chunks (
  id serial primary key,
  document_id integer not null references kb_documents(id) on delete cascade,
  idx integer not null,
  heading text,
  content text not null
);

create index if not exists kb_chunks_document_idx on kb_chunks (document_id);

create table if not exists tickets (
  id serial primary key,
  channel text not null default '邮件',
  marketplace text,
  order_id text,
  customer_name text,
  customer_email text,
  subject text,
  body text not null,
  language text,
  translation_zh text,
  intent text,
  difficulty text,
  urgency text,
  sentiment text,
  confidence numeric(4, 2),
  summary text,
  route text,
  route_reason text,
  status text not null default 'new',
  reply_draft text,
  reply_draft_zh text,
  compliance_flags jsonb not null default '[]'::jsonb,
  kb_refs jsonb not null default '[]'::jsonb,
  final_reply text,
  handled_by text,
  ai_mode text,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  sent_at timestamptz
);

create index if not exists tickets_status_idx on tickets (status);
