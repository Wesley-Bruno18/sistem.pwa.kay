-- Segurança crítica:
-- O frontend nunca pode ativar assinatura, criar pagamento ou inserir agendamento direto.
-- Valores de plano/pagamento devem ser calculados somente no banco/Edge Function.

drop policy if exists assinaturas_insert_own on public.assinaturas;
drop policy if exists assinaturas_update_own_or_admin on public.assinaturas;
drop policy if exists assinaturas_admin_insert on public.assinaturas;
drop policy if exists assinaturas_admin_update on public.assinaturas;

drop policy if exists agendamentos_insert_own on public.agendamentos;

drop policy if exists pagamentos_admin_all on public.pagamentos;

revoke all on function public.ativar_assinatura_paga(uuid, text, text) from public;
revoke all on function public.ativar_assinatura_paga(uuid, text, text) from anon;
revoke all on function public.ativar_assinatura_paga(uuid, text, text) from authenticated;
