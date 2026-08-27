create extension if not exists pgcrypto;

-- =========================
-- Tabelas
-- =========================
create table if not exists public.users (
  id uuid primary key references auth.users(id) on delete cascade,
  nome text not null,
  email text not null unique,
  tipo text not null default 'cliente' check (tipo in ('admin', 'cliente')),
  created_at timestamptz not null default now()
);

create table if not exists public.veiculos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references public.users(id) on delete cascade,
  placa text not null unique,
  modelo text not null,
  cor text not null,
  categoria text not null default 'passeio' check (categoria in ('passeio', 'suv', 'picape', 'moto')),
  created_at timestamptz not null default now()
);

create table if not exists public.planos (
  id uuid primary key default gen_random_uuid(),
  nome text not null unique,
  preco numeric(10, 2) not null check (preco >= 0),
  servicos text[] not null default '{}',
  ativo boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.assinaturas (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  plano_id uuid not null references public.planos(id) on delete restrict,
  status text not null default 'ativo' check (status in ('ativo', 'inativo')),
  metodo_pagamento text not null check (metodo_pagamento in ('pix', 'cartao')),
  inicio date not null default current_date,
  fim date,
  created_at timestamptz not null default now()
);

create table if not exists public.agendamentos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  veiculo_id uuid not null references public.veiculos(id) on delete restrict,
  assinatura_id uuid not null references public.assinaturas(id) on delete restrict,
  plano_id uuid not null references public.planos(id) on delete restrict,
  data date not null,
  horario time not null,
  status text not null default 'agendado' check (status in ('agendado', 'concluido', 'cancelado')),
  observacao text,
  created_at timestamptz not null default now()
);

create unique index if not exists agendamentos_horario_unico_ativo
  on public.agendamentos (data, horario)
  where status <> 'cancelado';

create or replace view public.agenda_ocupada as
  select
    data,
    horario,
    count(*)::integer as vagas_ocupadas,
    1::integer as capacidade,
    1::integer as maior_prioridade
  from public.agendamentos
  where status <> 'cancelado'
  group by data, horario;

create table if not exists public.produtos (
  id uuid primary key default gen_random_uuid(),
  nome text not null unique,
  quantidade numeric(10, 2) not null default 0 check (quantidade >= 0),
  unidade text not null,
  estoque_minimo numeric(10, 2) not null default 3 check (estoque_minimo >= 0),
  created_at timestamptz not null default now()
);

create table if not exists public.consumo (
  id uuid primary key default gen_random_uuid(),
  agendamento_id uuid not null references public.agendamentos(id) on delete cascade,
  produto_id uuid not null references public.produtos(id) on delete restrict,
  quantidade numeric(10, 2) not null check (quantidade > 0),
  created_at timestamptz not null default now()
);

-- =========================
-- Funções
-- =========================
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.users
    where id = auth.uid() and tipo = 'admin'
  );
$$;

create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.users (id, nome, email, tipo)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'nome', split_part(new.email, '@', 1), 'Cliente'),
    new.email,
    'cliente'
  )
  on conflict (id) do nothing;

  if coalesce(new.raw_user_meta_data ->> 'placa', '') <> '' then
    insert into public.veiculos (user_id, placa, modelo, cor, categoria)
    values (
      new.id,
      upper(new.raw_user_meta_data ->> 'placa'),
      coalesce(new.raw_user_meta_data ->> 'modelo', 'Nao informado'),
      coalesce(new.raw_user_meta_data ->> 'cor', 'Nao informado'),
      coalesce(nullif(new.raw_user_meta_data ->> 'categoria', ''), 'passeio')
    )
    on conflict (user_id) do nothing;
  end if;

  return new;
end;
$$;

create or replace function public.is_valid_schedule_slot(p_horario time)
returns boolean
language sql
immutable
as $$
  select extract(second from p_horario) = 0
    and (
      extract(hour from p_horario)::int * 60
      + extract(minute from p_horario)::int
    ) in (480, 560, 640, 780, 860, 940);
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_auth_user();

create or replace function public.validate_agendamento()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if not public.is_valid_schedule_slot(new.horario) then
    raise exception 'Escolha um horario valido da agenda.';
  end if;

  if new.status <> 'cancelado' and exists (
    select 1
    from public.agendamentos a
    where a.data = new.data
      and a.horario = new.horario
      and a.status <> 'cancelado'
      and a.id <> coalesce(new.id, '00000000-0000-0000-0000-000000000000'::uuid)
  ) then
    raise exception 'Horario indisponivel.';
  end if;

  if not exists (
    select 1
    from public.assinaturas s
    where s.id = new.assinatura_id
      and s.user_id = new.user_id
      and s.plano_id = new.plano_id
      and s.status = 'ativo'
      and (s.fim is null or s.fim >= new.data)
  ) then
    raise exception 'Cliente sem plano ativo.';
  end if;

  return new;
end;
$$;

drop trigger if exists validate_agendamento_before_write on public.agendamentos;
create trigger validate_agendamento_before_write
  before insert or update of data, horario, assinatura_id, plano_id on public.agendamentos
  for each row execute function public.validate_agendamento();

create or replace function public.concluir_servico(
  p_agendamento_id uuid,
  p_itens jsonb default '[]'::jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_agendamento public.agendamentos%rowtype;
  v_item record;
  v_produto public.produtos%rowtype;
begin
  if not public.is_admin() then
    raise exception 'Apenas administradores podem concluir servicos.';
  end if;

  select * into v_agendamento
  from public.agendamentos
  where id = p_agendamento_id
  for update;

  if not found then
    raise exception 'Agendamento nao encontrado.';
  end if;

  if v_agendamento.status <> 'agendado' then
    raise exception 'Apenas agendamentos em aberto podem ser concluidos.';
  end if;

  for v_item in
    select * from jsonb_to_recordset(p_itens)
      as x(product_id uuid, quantidade numeric)
  loop
    if v_item.quantidade is not null and v_item.quantidade > 0 then
      select * into v_produto
      from public.produtos
      where id = v_item.product_id
      for update;

      if not found then
        raise exception 'Produto nao encontrado.';
      end if;

      if v_produto.quantidade < v_item.quantidade then
        raise exception 'Estoque insuficiente para %.', v_produto.nome;
      end if;

      update public.produtos
      set quantidade = quantidade - v_item.quantidade
      where id = v_item.product_id;

      insert into public.consumo (agendamento_id, produto_id, quantidade)
      values (p_agendamento_id, v_item.product_id, v_item.quantidade);
    end if;
  end loop;

  update public.agendamentos
  set status = 'concluido'
  where id = p_agendamento_id;
end;
$$;

grant execute on function public.concluir_servico(uuid, jsonb) to authenticated;
grant select on public.agenda_ocupada to authenticated;

create or replace function public.atualizar_perfil_cliente(
  p_nome text,
  p_placa text,
  p_modelo text,
  p_cor text default null,
  p_categoria text default 'passeio'
)
returns table (
  user_id uuid,
  nome text,
  email text,
  tipo text,
  veiculo_id uuid,
  placa text,
  modelo text,
  cor text,
  categoria text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_categoria text := lower(trim(coalesce(p_categoria, 'passeio')));
begin
  if v_user_id is null then
    raise exception 'Sessao invalida. Faca login novamente.';
  end if;

  if trim(coalesce(p_nome, '')) = '' then
    raise exception 'Informe seu nome.';
  end if;

  if trim(coalesce(p_placa, '')) = '' then
    raise exception 'Informe a placa do veiculo.';
  end if;

  if trim(coalesce(p_modelo, '')) = '' then
    raise exception 'Informe o modelo do veiculo.';
  end if;

  if v_categoria not in ('passeio', 'suv', 'picape', 'moto') then
    raise exception 'Tipo de veiculo invalido.';
  end if;

  update public.users as u
  set nome = trim(p_nome)
  where u.id = v_user_id;

  if not found then
    raise exception 'Perfil nao encontrado.';
  end if;

  insert into public.veiculos as v (user_id, placa, modelo, cor, categoria)
  values (
    v_user_id,
    upper(trim(p_placa)),
    trim(p_modelo),
    coalesce(nullif(trim(coalesce(p_cor, '')), ''), 'Nao informado'),
    v_categoria
  )
  on conflict (user_id) do update
  set
    placa = excluded.placa,
    modelo = excluded.modelo,
    cor = excluded.cor,
    categoria = excluded.categoria;

  return query
    select
      u.id as user_id,
      u.nome,
      u.email,
      u.tipo,
      v.id as veiculo_id,
      v.placa,
      v.modelo,
      v.cor,
      v.categoria
    from public.users as u
    join public.veiculos as v on v.user_id = u.id
    where u.id = v_user_id;
exception
  when unique_violation then
    raise exception 'Esta placa ja esta cadastrada em outra conta.';
end;
$$;

grant execute on function public.atualizar_perfil_cliente(text, text, text, text, text) to authenticated;

-- =========================
-- RLS + Policies
-- =========================
alter table public.users enable row level security;
alter table public.veiculos enable row level security;
alter table public.planos enable row level security;
alter table public.assinaturas enable row level security;
alter table public.agendamentos enable row level security;
alter table public.produtos enable row level security;
alter table public.consumo enable row level security;

-- usuarios
drop policy if exists users_select_own_or_admin on public.users;
create policy users_select_own_or_admin on public.users
  for select using (auth.uid() = id or public.is_admin());

drop policy if exists users_insert_own on public.users;
create policy users_insert_own on public.users
  for insert with check (auth.uid() = id);

drop policy if exists users_update_own_or_admin on public.users;
create policy users_update_own_or_admin on public.users
  for update using (auth.uid() = id or public.is_admin())
  with check (auth.uid() = id or public.is_admin());

-- veiculos
drop policy if exists veiculos_select_own_or_admin on public.veiculos;
create policy veiculos_select_own_or_admin on public.veiculos
  for select using (auth.uid() = user_id or public.is_admin());

drop policy if exists veiculos_insert_own on public.veiculos;
create policy veiculos_insert_own on public.veiculos
  for insert with check (auth.uid() = user_id);

drop policy if exists veiculos_update_own_or_admin on public.veiculos;
create policy veiculos_update_own_or_admin on public.veiculos
  for update using (auth.uid() = user_id or public.is_admin())
  with check (auth.uid() = user_id or public.is_admin());

-- planos
drop policy if exists planos_select_active_or_admin on public.planos;
create policy planos_select_active_or_admin on public.planos
  for select to authenticated using (ativo = true or public.is_admin());

drop policy if exists planos_admin_insert on public.planos;
create policy planos_admin_insert on public.planos
  for insert to authenticated with check (public.is_admin());

drop policy if exists planos_admin_update on public.planos;
create policy planos_admin_update on public.planos
  for update to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists planos_admin_delete on public.planos;
create policy planos_admin_delete on public.planos
  for delete to authenticated using (public.is_admin());

-- assinaturas
drop policy if exists assinaturas_select_own_or_admin on public.assinaturas;
create policy assinaturas_select_own_or_admin on public.assinaturas
  for select using (auth.uid() = user_id or public.is_admin());

drop policy if exists assinaturas_insert_own on public.assinaturas;
drop policy if exists assinaturas_update_own_or_admin on public.assinaturas;
drop policy if exists assinaturas_admin_insert on public.assinaturas;
drop policy if exists assinaturas_admin_update on public.assinaturas;

-- agendamentos
drop policy if exists agendamentos_select_own_or_admin on public.agendamentos;
create policy agendamentos_select_own_or_admin on public.agendamentos
  for select using (auth.uid() = user_id or public.is_admin());

drop policy if exists agendamentos_insert_own on public.agendamentos;

drop policy if exists agendamentos_admin_update on public.agendamentos;
create policy agendamentos_admin_update on public.agendamentos
  for update using (public.is_admin()) with check (public.is_admin());

drop policy if exists agendamentos_client_cancel on public.agendamentos;
create policy agendamentos_client_cancel on public.agendamentos
  for update using (auth.uid() = user_id and status = 'agendado')
  with check (auth.uid() = user_id and status = 'cancelado');

-- produtos
drop policy if exists produtos_admin_all on public.produtos;
create policy produtos_admin_all on public.produtos
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- consumo
drop policy if exists consumo_admin_all on public.consumo;
create policy consumo_admin_all on public.consumo
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- =========================
-- Seed
-- =========================
insert into public.planos (nome, preco, servicos, ativo)
values
  ('Essencial', 149.90, array['Lavagem tecnica', 'Aspiracao interna', 'Pretinho nos pneus'], true),
  ('Premium', 249.90, array['Lavagem tecnica', 'Higienizacao interna', 'Cera premium', 'Pretinho nos pneus'], true),
  ('Master Detail', 399.90, array['Lavagem detalhada', 'Higienizacao completa', 'Protecao de pintura', 'Cristalizacao de vidros'], true)
on conflict (nome) do nothing;

insert into public.produtos (nome, quantidade, unidade, estoque_minimo)
values
  ('Shampoo neutro', 5000, 'ml', 800),
  ('Cera liquida', 2500, 'ml', 400),
  ('Pretinho', 1800, 'ml', 300),
  ('Microfibra', 24, 'un', 6)
on conflict (nome) do nothing;
