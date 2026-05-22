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

grant execute on function public.reservar_agendamento_prioritario(date, time) to authenticated;
grant select on public.agenda_ocupada to authenticated;
