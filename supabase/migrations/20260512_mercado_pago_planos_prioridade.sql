create extension if not exists pgcrypto;

alter table public.users add column if not exists tipo text;

update public.users set tipo = coalesce(tipo, 'cliente');
alter table public.users alter column tipo set default 'cliente';
alter table public.users alter column tipo set not null;
alter table public.users drop constraint if exists users_tipo_check;
alter table public.users add constraint users_tipo_check check (tipo in ('admin', 'cliente'));

alter table public.veiculos add column if not exists categoria text not null default 'passeio';
alter table public.veiculos drop constraint if exists veiculos_categoria_check;
alter table public.veiculos add constraint veiculos_categoria_check
  check (categoria in ('passeio', 'suv', 'picape', 'moto'));

alter table public.planos drop constraint if exists planos_nome_key;
alter table public.planos add column if not exists slug text;
alter table public.planos add column if not exists categoria text not null default 'carro';
alter table public.planos add column if not exists nivel text not null default 'bronze';
alter table public.planos add column if not exists precos jsonb not null default '{}'::jsonb;
alter table public.planos add column if not exists desconto_percentual integer not null default 0;
alter table public.planos add column if not exists prioridade integer not null default 1;
alter table public.planos drop constraint if exists planos_categoria_check;
alter table public.planos add constraint planos_categoria_check check (categoria in ('carro', 'moto'));
alter table public.planos drop constraint if exists planos_nivel_check;
alter table public.planos add constraint planos_nivel_check check (nivel in ('bronze', 'prata', 'ouro'));
alter table public.planos drop constraint if exists planos_desconto_percentual_check;
alter table public.planos add constraint planos_desconto_percentual_check
  check (desconto_percentual between 0 and 100);
alter table public.planos drop constraint if exists planos_prioridade_check;
alter table public.planos add constraint planos_prioridade_check check (prioridade between 1 and 3);

update public.planos
set slug = 'legacy-' || id::text
where slug is null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'planos_slug_key'
      and conrelid = 'public.planos'::regclass
  ) then
    alter table public.planos add constraint planos_slug_key unique (slug);
  end if;
end $$;

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

alter table public.agendamentos add column if not exists prioridade_plano integer not null default 1;
alter table public.agendamentos add column if not exists slot_posicao smallint;
drop index if exists public.agendamentos_horario_unico_ativo;
create unique index if not exists agendamentos_user_horario_unico_ativo
  on public.agendamentos (user_id, data, horario)
  where status = 'agendado';

drop view if exists public.agenda_ocupada;
create or replace view public.agenda_ocupada as
  select
    data,
    horario,
    count(*)::integer as vagas_ocupadas,
    1::integer as capacidade,
    max(prioridade_plano)::integer as maior_prioridade
  from public.agendamentos
  where status = 'agendado'
  group by data, horario;

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

create or replace function public.validate_agendamento()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_ocupados integer;
begin
  if not public.is_valid_schedule_slot(new.horario) then
    raise exception 'Escolha um horario valido da agenda.';
  end if;

  if new.status <> 'cancelado' then
    select count(*) into v_ocupados
    from public.agendamentos a
    where a.data = new.data
      and a.horario = new.horario
      and a.status = 'agendado'
      and a.id <> coalesce(new.id, '00000000-0000-0000-0000-000000000000'::uuid);

    if v_ocupados >= 1 then
      raise exception 'Horario esgotado. Escolha outro horario disponivel.';
    end if;
  end if;

  if new.status <> 'cancelado' and not exists (
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

create or replace function public.reservar_agendamento_prioritario(
  p_data date,
  p_horario time
)
returns table (
  id uuid,
  displaced boolean,
  message text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_assinatura_id uuid;
  v_plano_id uuid;
  v_veiculo_id uuid;
  v_prioridade integer;
  v_ocupados integer;
  v_lowest_id uuid;
  v_lowest_priority integer;
  v_slot_posicao smallint;
  v_id uuid;
  v_displaced boolean := false;
begin
  if v_user_id is null then
    raise exception 'Sessao expirada. Faca login novamente.';
  end if;

  if not public.is_valid_schedule_slot(p_horario) then
    raise exception 'Escolha um horario valido da agenda.';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_data::text || ':' || p_horario::text, 0));

  select s.id, s.plano_id, coalesce(p.prioridade, 1)
    into v_assinatura_id, v_plano_id, v_prioridade
  from public.assinaturas s
  join public.planos p on p.id = s.plano_id
  where s.user_id = v_user_id
    and s.status = 'ativo'
    and (s.fim is null or s.fim >= p_data)
  order by s.created_at desc
  limit 1;

  if v_assinatura_id is null then
    raise exception 'Ative um plano antes de agendar.';
  end if;

  select id into v_veiculo_id
  from public.veiculos
  where user_id = v_user_id
  limit 1;

  if v_veiculo_id is null then
    raise exception 'Cadastre um veiculo antes de agendar.';
  end if;

  if exists (
    select 1
    from public.agendamentos
    where user_id = v_user_id
      and data = p_data
      and horario = p_horario
      and status = 'agendado'
  ) then
    raise exception 'Voce ja possui agendamento neste horario.';
  end if;

  select count(*) into v_ocupados
  from public.agendamentos
  where data = p_data
    and horario = p_horario
    and status = 'agendado';

  if v_ocupados >= 1 then
    select a.id, coalesce(a.prioridade_plano, 1)
      into v_lowest_id, v_lowest_priority
    from public.agendamentos a
    where a.data = p_data
      and a.horario = p_horario
      and a.status = 'agendado'
    order by coalesce(a.prioridade_plano, 1) asc, a.created_at asc
    limit 1
    for update;

    if v_prioridade <= coalesce(v_lowest_priority, 1) then
      raise exception 'Essa vaga ficou com um plano de prioridade maior. Escolha outro horario, por favor.';
    end if;

    update public.agendamentos
    set status = 'cancelado',
        observacao = 'Cancelado automaticamente por disputa de prioridade de plano.'
    where id = v_lowest_id;

    v_displaced := true;
  end if;

  v_slot_posicao := 1;

  insert into public.agendamentos (
    user_id,
    veiculo_id,
    assinatura_id,
    plano_id,
    data,
    horario,
    status,
    prioridade_plano,
    slot_posicao
  )
  values (
    v_user_id,
    v_veiculo_id,
    v_assinatura_id,
    v_plano_id,
    p_data,
    p_horario,
    'agendado',
    v_prioridade,
    v_slot_posicao
  )
  returning agendamentos.id into v_id;

  return query select
    v_id,
    v_displaced,
    case
      when v_displaced then 'Agendamento confirmado por prioridade do seu plano.'
      else 'Agendamento confirmado.'
    end;
end;
$$;

create or replace function public.ativar_assinatura_paga(
  p_assinatura_id uuid,
  p_mercado_pago_id text,
  p_mercado_pago_status text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
begin
  select user_id into v_user_id
  from public.assinaturas
  where id = p_assinatura_id
  for update;

  if v_user_id is null then
    raise exception 'Assinatura nao encontrada.';
  end if;

  update public.assinaturas
  set status = 'inativo',
      fim = current_date
  where user_id = v_user_id
    and status = 'ativo'
    and id <> p_assinatura_id;

  update public.assinaturas
  set status = 'ativo',
      inicio = current_date,
      fim = null,
      mercado_pago_id = p_mercado_pago_id,
      mercado_pago_status = p_mercado_pago_status
  where id = p_assinatura_id;
end;
$$;

grant select on public.agenda_ocupada to authenticated;
grant execute on function public.reservar_agendamento_prioritario(date, time) to authenticated;
revoke all on function public.ativar_assinatura_paga(uuid, text, text) from public;
revoke all on function public.ativar_assinatura_paga(uuid, text, text) from anon;
revoke all on function public.ativar_assinatura_paga(uuid, text, text) from authenticated;

alter table public.pagamentos enable row level security;

drop policy if exists assinaturas_insert_own on public.assinaturas;
drop policy if exists assinaturas_update_own_or_admin on public.assinaturas;
drop policy if exists assinaturas_admin_insert on public.assinaturas;
drop policy if exists assinaturas_admin_update on public.assinaturas;

drop policy if exists agendamentos_insert_own on public.agendamentos;

drop policy if exists pagamentos_select_own_or_admin on public.pagamentos;
create policy pagamentos_select_own_or_admin on public.pagamentos
  for select using (auth.uid() = user_id or public.is_admin());

drop policy if exists pagamentos_admin_all on public.pagamentos;

update public.planos
set ativo = false
where slug like 'legacy-%'
  and nome in ('Essencial', 'Premium', 'Master Detail');

insert into public.planos (
  slug, nome, categoria, nivel, preco, precos, desconto_percentual, prioridade, servicos, ativo
)
values
  (
    'auto-bronze',
    'So pra Manter',
    'carro',
    'bronze',
    109.99,
    '{"passeio":109.99,"suv":121.99,"picape":134.99}'::jsonb,
    10,
    1,
    array[
      '2 lavagens tradicional mensal (nao acumula)',
      '2 enceramentos liquidos mensal',
      'Conservacao do veiculo',
      '10% de desconto nos demais servicos',
      'Economia superior a 120,00 reais'
    ],
    true
  ),
  (
    'auto-prata',
    'Daquele Modelo',
    'carro',
    'prata',
    153.99,
    '{"passeio":153.99,"suv":164.99,"picape":175.99}'::jsonb,
    15,
    2,
    array[
      '3 lavagens tradicional mensal (nao acumula)',
      '3 enceramentos liquidos mensal',
      'Prioridade no agendamento',
      'Conservacao do veiculo',
      '15% de desconto nos demais servicos',
      'Economia superior a 160,00 reais'
    ],
    true
  ),
  (
    'auto-ouro',
    'So Boraaa',
    'carro',
    'ouro',
    200.00,
    '{"passeio":200.00,"suv":200.00,"picape":200.00}'::jsonb,
    15,
    3,
    array[
      '7 lavagens mensais',
      '1 descontaminacao de pintura mensal',
      '1 enceramento em pasta mensal',
      'Conservacao do veiculo',
      'Quer lavar e so marcar',
      'Economia gigante',
      '15% de desconto nos demais servicos'
    ],
    true
  ),
  (
    'moto-bronze',
    'So pra Manter',
    'moto',
    'bronze',
    79.99,
    '{"moto":79.99}'::jsonb,
    10,
    1,
    array[
      '2 lavagens tradicional mensal (nao acumula)',
      '2 enceramentos liquidos mensal',
      'Conservacao do veiculo',
      'Economia superior a 70,00 reais',
      '10% de desconto nos demais servicos'
    ],
    true
  ),
  (
    'moto-prata',
    'So Boraaa',
    'moto',
    'prata',
    169.99,
    '{"moto":169.99}'::jsonb,
    15,
    2,
    array[
      '3 lavagens tradicional mensal (nao acumula)',
      '1 lavagem detalhada com aplicacao de verniz de motor',
      '1 enceramento em pasta',
      'Prioridade no agendamento',
      'Economia superior a 100,00 reais',
      '15% de desconto nos demais servicos'
    ],
    true
  )
on conflict (slug) do update
set nome = excluded.nome,
    categoria = excluded.categoria,
    nivel = excluded.nivel,
    preco = excluded.preco,
    precos = excluded.precos,
    desconto_percentual = excluded.desconto_percentual,
    prioridade = excluded.prioridade,
    servicos = excluded.servicos,
    ativo = excluded.ativo;
