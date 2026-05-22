insert into public.planos (
  slug, nome, categoria, nivel, preco, precos, desconto_percentual, prioridade, servicos, ativo
)
values
  (
    'auto-bronze',
    'So pra Manter',
    'carro',
    'bronze',
    124.99,
    '{"passeio":124.99,"suv":121.99,"picape":134.99}'::jsonb,
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
    219.99,
    '{"passeio":219.99,"suv":219.99,"picape":219.99}'::jsonb,
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
