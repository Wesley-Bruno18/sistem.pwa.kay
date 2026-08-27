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
