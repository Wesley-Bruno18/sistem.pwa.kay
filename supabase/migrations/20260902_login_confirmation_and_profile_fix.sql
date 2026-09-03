update auth.users
set email_confirmed_at = coalesce(email_confirmed_at, now())
where email_confirmed_at is null
  and deleted_at is null
  and coalesce(is_anonymous, false) = false;

alter table public.veiculos add column if not exists categoria text;

update public.veiculos as v
set categoria = case
  when lower(trim(coalesce(v.categoria, ''))) in ('passeio', 'suv', 'picape', 'moto') then lower(trim(v.categoria))
  when lower(trim(coalesce(au.raw_user_meta_data ->> 'categoria', ''))) in ('passeio', 'suv', 'picape', 'moto')
    then lower(trim(au.raw_user_meta_data ->> 'categoria'))
  else 'passeio'
end
from auth.users as au
where au.id = v.user_id
  and (
    v.categoria is null
    or lower(trim(coalesce(v.categoria, ''))) not in ('passeio', 'suv', 'picape', 'moto')
  );

update public.veiculos
set categoria = 'passeio'
where categoria is null
  or lower(trim(coalesce(categoria, ''))) not in ('passeio', 'suv', 'picape', 'moto');

update public.veiculos
set
  placa = upper(trim(placa)),
  modelo = trim(modelo),
  cor = coalesce(nullif(trim(coalesce(cor, '')), ''), 'Nao informado');

alter table public.veiculos alter column user_id set not null;
alter table public.veiculos alter column placa set not null;
alter table public.veiculos alter column modelo set not null;
alter table public.veiculos alter column cor set not null;
alter table public.veiculos alter column categoria set default 'passeio';
alter table public.veiculos alter column categoria set not null;

alter table public.veiculos drop constraint if exists veiculos_categoria_check;
alter table public.veiculos add constraint veiculos_categoria_check
  check (categoria in ('passeio', 'suv', 'picape', 'moto'));

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.veiculos'::regclass
      and conname = 'veiculos_placa_key'
  ) then
    alter table public.veiculos add constraint veiculos_placa_key unique (placa);
  end if;
end;
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
      upper(trim(new.raw_user_meta_data ->> 'placa')),
      coalesce(nullif(trim(coalesce(new.raw_user_meta_data ->> 'modelo', '')), ''), 'Nao informado'),
      coalesce(nullif(trim(coalesce(new.raw_user_meta_data ->> 'cor', '')), ''), 'Nao informado'),
      coalesce(nullif(new.raw_user_meta_data ->> 'categoria', ''), 'passeio')
    )
    on conflict (user_id) do update
    set
      placa = excluded.placa,
      modelo = excluded.modelo,
      cor = excluded.cor,
      categoria = excluded.categoria;
  end if;

  return new;
end;
$$;

drop function if exists public.atualizar_perfil_cliente(text, text, text, text, text);

create or replace function public.atualizar_perfil_cliente(
  p_nome text,
  p_placa text,
  p_modelo text,
  p_cor text default null,
  p_categoria text default 'passeio'
)
returns table (
  cliente_id uuid,
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
  on conflict on constraint veiculos_user_id_key do update
  set
    placa = excluded.placa,
    modelo = excluded.modelo,
    cor = excluded.cor,
    categoria = excluded.categoria;

  return query
    select
      u.id as cliente_id,
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

notify pgrst, 'reload schema';
