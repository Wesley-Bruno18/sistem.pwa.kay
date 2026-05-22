alter table public.assinaturas add column if not exists valor numeric(10, 2);
alter table public.assinaturas add column if not exists categoria_veiculo text;
alter table public.assinaturas add column if not exists mercado_pago_id text;
alter table public.assinaturas add column if not exists mercado_pago_status text;
alter table public.assinaturas add column if not exists external_reference text;

alter table public.assinaturas drop constraint if exists assinaturas_status_check;
alter table public.assinaturas add constraint assinaturas_status_check
  check (status in ('ativo', 'inativo', 'pendente', 'cancelado'));

alter table public.assinaturas drop constraint if exists assinaturas_categoria_veiculo_check;
alter table public.assinaturas add constraint assinaturas_categoria_veiculo_check
  check (categoria_veiculo is null or categoria_veiculo in ('passeio', 'suv', 'picape', 'moto'));

create table if not exists public.pagamentos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  plano_id uuid not null references public.planos(id) on delete restrict,
  assinatura_id uuid references public.assinaturas(id) on delete set null,
  metodo text not null check (metodo in ('pix', 'cartao')),
  status text not null default 'pending',
  valor numeric(10, 2) not null check (valor >= 0),
  mercado_pago_payment_id text,
  mercado_pago_preapproval_id text,
  external_reference text not null unique,
  qr_code text,
  qr_code_base64 text,
  init_point text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.pagamentos enable row level security;

drop policy if exists pagamentos_select_own_or_admin on public.pagamentos;
create policy pagamentos_select_own_or_admin on public.pagamentos
  for select using (user_id = auth.uid() or public.is_admin());

drop policy if exists pagamentos_admin_all on public.pagamentos;
