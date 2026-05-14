# Auto Glow Pro

PWA estatico para gestao de estetica automotiva com HTML, CSS, JavaScript puro e Supabase no backend.

## Como executar

1. Crie um projeto no Supabase.
2. No SQL Editor, execute `supabase/schema.sql`.
3. Execute tambem `supabase/migrations/20260512_mercado_pago_planos_prioridade.sql`.
4. Execute `supabase/migrations/20260512_security_hardening.sql`.
5. Configure Email/Password em Authentication.
6. Preencha `public/js/config.js` com `url`, `anonKey` e, opcionalmente, `MERCADO_PAGO_CONFIG.publicKey`.
7. Crie uma conta pelo app e promova o usuario administrador no SQL Editor:

```sql
update public.users
set tipo = 'admin'
where email = 'admin@seudominio.com';
```

8. Configure a Edge Function do Mercado Pago:

```bash
supabase secrets set MERCADO_PAGO_ACCESS_TOKEN=APP_USR-ou-TEST...
supabase secrets set SUPABASE_ADMIN_KEY=sua-chave-administrativa-do-supabase
supabase secrets set APP_URL=https://seu-dominio.com
supabase secrets set MERCADO_PAGO_FEE_RATE=0.05
supabase functions deploy mercado-pago-payments
```

9. Sirva a pasta `public` em HTTP:

```bash
npx serve public
```

## Estrutura

- `public/js/services`: services reais usados pela SPA.
- `public/services`: aliases com `supabase.js`, `auth.js` e `db.js` conforme a estrutura solicitada.
- `public/js/services/payments.js`: chamadas para a Edge Function de Pix e assinatura recorrente.
- `public/js/services/discounts.js`: leitura de assinatura ativa e calculo de desconto em servicos avulsos.
- `public/js/pages`: telas SPA do cliente e admin.
- `public/js/components`: componentes reutilizaveis.
- `public/manifest.json` e `public/service-worker.js`: instalacao PWA e cache parcial offline.
- `public/assets/icons`: icones SVG e PNG para instalacao mobile.
- `supabase/schema.sql`: tabelas, relacionamentos, RLS, trigger de cadastro e RPC de conclusao.
- `supabase/migrations/20260512_mercado_pago_planos_prioridade.sql`: planos Bronze/Prata/Ouro, pagamentos Mercado Pago e agenda com prioridade.
- `supabase/migrations/20260512_security_hardening.sql`: bloqueios RLS para impedir assinatura, pagamento e agendamento direto pelo frontend.
- `supabase/functions/mercado-pago-payments`: funcao segura para chamar APIs do Mercado Pago sem expor access token.

## Observacoes

- O app nao usa backend proprio.
- Pix usa a API de pagamentos do Mercado Pago e retorna QR Code/copia e cola.
- Cartao recorrente usa a API de assinaturas do Mercado Pago. Com `publicKey`, usa MercadoPago.js para tokenizar cartao; sem `publicKey`, abre o checkout recorrente hospedado.
- O valor cobrado pelo Mercado Pago inclui taxa de 5% por gross-up: `valor do plano / 0,95`, para o liquido ficar igual ao plano.
- O frontend nunca envia valores para pagamento. Ele envia apenas `planId`; a Edge Function busca plano, veiculo, preco, taxa e status diretamente do banco.
- Insercao/ativacao de assinaturas e criacao direta de agendamentos pelo navegador ficam bloqueadas por RLS. A agenda usa apenas a RPC segura `reservar_agendamento_prioritario`.
- A RPC `concluir_servico` executa a baixa de estoque em transacao no Supabase.
- A RPC `reservar_agendamento_prioritario` permite 2 vagas por horario e resolve disputa por prioridade: Ouro > Prata > Bronze.
- Para testes rapidos, desative confirmacao de email no Supabase Auth ou confirme o email antes do login.
- O plano de moto "So para manter" custa R$69,99 .
