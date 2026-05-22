import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.105.3'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
}

type Plan = {
  id: string
  nome: string
  categoria: 'carro' | 'moto'
  preco: number
  precos?: Record<string, number>
  ativo: boolean
}

type Vehicle = {
  id: string
  categoria: 'passeio' | 'suv' | 'picape' | 'moto'
}

type PaymentContext = {
  user: {
    id: string
    email?: string
    user_metadata?: Record<string, unknown>
  }
  plan: Plan
  vehicle: Vehicle
  baseAmount: number
  feeRate: number
  feeAmount: number
  amount: number
  externalReference: string
  subscriptionId: string
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json'
    }
  })
}

function requiredEnv(name: string) {
  const value = Deno.env.get(name)
  if (!value) throw new Error(`Variavel de ambiente ausente: ${name}`)
  return value
}

function requiredAnyEnv(names: string[]) {
  for (const name of names) {
    const value = Deno.env.get(name)
    if (value) return value
  }

  throw new Error(`Variavel de ambiente ausente: ${names.join(' ou ')}`)
}

function roundCurrency(value: number) {
  return Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100
}

function getMercadoPagoFeeRate() {
  const rate = Number(Deno.env.get('MERCADO_PAGO_FEE_RATE') || '0')
  if (!Number.isFinite(rate) || rate < 0 || rate >= 1) return 0
  return rate
}

function calculateMercadoPagoCharge(baseAmount: number) {
  const feeRate = getMercadoPagoFeeRate()
  const normalizedBase = roundCurrency(baseAmount)
  const amount = roundCurrency(normalizedBase / (1 - feeRate))

  return {
    baseAmount: normalizedBase,
    feeRate,
    feeAmount: roundCurrency(amount - normalizedBase),
    amount
  }
}

function normalizeVehicleType(value?: string) {
  return ['passeio', 'suv', 'picape', 'moto'].includes(value || '') ? value! : 'passeio'
}

function planCategoryForVehicle(vehicleType: string) {
  return vehicleType === 'moto' ? 'moto' : 'carro'
}

function getPlanPrice(plan: Plan, vehicle: Vehicle) {
  const vehicleType = normalizeVehicleType(vehicle.categoria)
  const prices = plan.precos || {}

  if (prices[vehicleType] != null) return Number(prices[vehicleType])
  if (vehicleType !== 'moto' && prices.passeio != null) return Number(prices.passeio)
  if (prices.moto != null) return Number(prices.moto)

  return Number(plan.preco || 0)
}

async function mercadoPago(path: string, options: RequestInit = {}) {
  const accessToken = requiredEnv('MERCADO_PAGO_ACCESS_TOKEN')
  const headers = new Headers(options.headers)
  headers.set('Authorization', `Bearer ${accessToken}`)
  headers.set('Content-Type', 'application/json')
  headers.set('Accept', 'application/json')

  const response = await fetch(`https://api.mercadopago.com${path}`, {
    ...options,
    headers
  })
  const data = await response.json().catch(() => ({}))

  if (!response.ok) {
    const message = data?.message || data?.error || 'Falha na API do Mercado Pago.'
    throw new Error(message)
  }

  return data
}

async function buildClients(req: Request) {
  const supabaseUrl = requiredEnv('SUPABASE_URL')
  const anonKey = requiredEnv('SUPABASE_ANON_KEY')
  const adminKey = requiredAnyEnv(['SUPABASE_ADMIN_KEY', 'SUPABASE_SERVICE_ROLE_KEY', 'ADMIN_KEY'])
  const authHeader = req.headers.get('Authorization') || ''

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } }
  })
  const adminClient = createClient(supabaseUrl, adminKey)
  const {
    data: { user },
    error
  } = await userClient.auth.getUser()

  if (error || !user) throw new Error('Sessao invalida. Faca login novamente.')
  return { userClient, adminClient, user }
}

async function createPendingSubscription(
  adminClient: ReturnType<typeof createClient>,
  user: PaymentContext['user'],
  planId: string,
  method: 'pix' | 'cartao'
): Promise<PaymentContext> {
  const [{ data: plan, error: planError }, { data: vehicle, error: vehicleError }] =
    await Promise.all([
      adminClient.from('planos').select('*').eq('id', planId).eq('ativo', true).single(),
      adminClient.from('veiculos').select('id, categoria').eq('user_id', user.id).single()
    ])

  if (planError || !plan) throw new Error('Plano indisponivel.')
  if (vehicleError || !vehicle) throw new Error('Cadastre um veiculo antes de assinar.')

  const vehicleType = normalizeVehicleType(vehicle.categoria)
  if (plan.categoria !== planCategoryForVehicle(vehicleType)) {
    throw new Error('Este plano nao esta disponivel para o tipo do seu veiculo.')
  }

  const payment = calculateMercadoPagoCharge(getPlanPrice(plan, vehicle))
  if (!payment.amount || payment.amount <= 0) throw new Error('Valor do plano invalido.')

  const externalReference = `agp-${crypto.randomUUID()}`
  const { data: subscription, error: subscriptionError } = await adminClient
    .from('assinaturas')
    .insert({
      user_id: user.id,
      plano_id: plan.id,
      status: 'pendente',
      metodo_pagamento: method,
      valor: payment.amount,
      categoria_veiculo: vehicleType,
      external_reference: externalReference
    })
    .select('id')
    .single()

  if (subscriptionError || !subscription) {
    throw new Error(subscriptionError?.message || 'Nao foi possivel criar a assinatura.')
  }

  return {
    user,
    plan,
    vehicle,
    baseAmount: payment.baseAmount,
    feeRate: payment.feeRate,
    feeAmount: payment.feeAmount,
    amount: payment.amount,
    externalReference,
    subscriptionId: subscription.id
  }
}

async function quotePlanPayment(
  adminClient: ReturnType<typeof createClient>,
  userId: string,
  planId: string
) {
  const [{ data: plan, error: planError }, { data: vehicle, error: vehicleError }] =
    await Promise.all([
      adminClient.from('planos').select('*').eq('id', planId).eq('ativo', true).single(),
      adminClient.from('veiculos').select('id, categoria').eq('user_id', userId).single()
    ])

  if (planError || !plan) throw new Error('Plano indisponivel.')
  if (vehicleError || !vehicle) throw new Error('Cadastre um veiculo antes de assinar.')

  const vehicleType = normalizeVehicleType(vehicle.categoria)
  if (plan.categoria !== planCategoryForVehicle(vehicleType)) {
    throw new Error('Este plano nao esta disponivel para o tipo do seu veiculo.')
  }

  const payment = calculateMercadoPagoCharge(getPlanPrice(plan, vehicle))
  if (!payment.amount || payment.amount <= 0) throw new Error('Valor do plano invalido.')

  return {
    planId: plan.id,
    planName: plan.nome,
    vehicleType,
    ...payment
  }
}

async function activateSubscription(
  adminClient: ReturnType<typeof createClient>,
  subscriptionId: string,
  mercadoPagoId: string,
  mercadoPagoStatus: string
) {
  const { data: subscription, error: subscriptionError } = await adminClient
    .from('assinaturas')
    .select('user_id')
    .eq('id', subscriptionId)
    .single()

  if (subscriptionError || !subscription) {
    throw new Error(subscriptionError?.message || 'Assinatura nao encontrada.')
  }

  const { error: deactivateError } = await adminClient
    .from('assinaturas')
    .update({
      status: 'inativo',
      fim: new Date().toISOString().slice(0, 10)
    })
    .eq('user_id', subscription.user_id)
    .eq('status', 'ativo')
    .neq('id', subscriptionId)

  if (deactivateError) throw new Error(deactivateError.message)

  const { error: activateError } = await adminClient
    .from('assinaturas')
    .update({
      status: 'ativo',
      inicio: new Date().toISOString().slice(0, 10),
      fim: null,
      mercado_pago_id: mercadoPagoId,
      mercado_pago_status: mercadoPagoStatus
    })
    .eq('id', subscriptionId)

  if (activateError) throw new Error(activateError.message)
}

async function storePayment(
  adminClient: ReturnType<typeof createClient>,
  context: PaymentContext,
  payload: Record<string, unknown>,
  method: 'pix' | 'cartao'
) {
  const { error } = await adminClient.from('pagamentos').insert({
    user_id: context.user.id,
    plano_id: context.plan.id,
    assinatura_id: context.subscriptionId,
    metodo: method,
    status: String(payload.status || 'pending'),
    valor: context.amount,
    mercado_pago_payment_id: payload.id && method === 'pix' ? String(payload.id) : null,
    mercado_pago_preapproval_id: payload.preapproval_id
      ? String(payload.preapproval_id)
      : payload.id && method === 'cartao'
        ? String(payload.id)
        : null,
    external_reference: context.externalReference,
    qr_code: payload.qr_code ? String(payload.qr_code) : null,
    qr_code_base64: payload.qr_code_base64 ? String(payload.qr_code_base64) : null,
    init_point: payload.init_point ? String(payload.init_point) : null,
    payload
  })

  if (error) throw new Error(error.message)
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const { adminClient, user } = await buildClients(req)
    const body = await req.json()
    const action = body.action

    if (action === 'quote_plan_payment') {
      return json(await quotePlanPayment(adminClient, user.id, body.planId))
    }

    if (action === 'create_pix_payment') {
      const context = await createPendingSubscription(adminClient, user, body.planId, 'pix')
      const payment = await mercadoPago('/v1/payments', {
        method: 'POST',
        headers: {
          'X-Idempotency-Key': context.externalReference
        },
        body: JSON.stringify({
          transaction_amount: context.amount,
          description: `Assinatura ${context.plan.nome}`,
          payment_method_id: 'pix',
          external_reference: context.externalReference,
          notification_url: Deno.env.get('MERCADO_PAGO_NOTIFICATION_URL') || undefined,
          payer: {
            email: user.email,
            first_name: String(user.user_metadata?.nome || 'Cliente')
          },
          metadata: {
            user_id: user.id,
            plano_id: context.plan.id,
            assinatura_id: context.subscriptionId,
            valor_plano: context.baseAmount,
            taxa_mercado_pago: context.feeAmount,
            percentual_taxa_mercado_pago: context.feeRate
          }
        })
      })

      await storePayment(
        adminClient,
        context,
        {
          ...payment,
          qr_code: payment?.point_of_interaction?.transaction_data?.qr_code,
          qr_code_base64: payment?.point_of_interaction?.transaction_data?.qr_code_base64
        },
        'pix'
      )

      const activated = payment.status === 'approved'
      if (activated) {
        await activateSubscription(adminClient, context.subscriptionId, String(payment.id), payment.status)
      }

      return json({
        paymentId: String(payment.id),
        subscriptionId: context.subscriptionId,
        status: payment.status,
        baseAmount: context.baseAmount,
        feeAmount: context.feeAmount,
        feeRate: context.feeRate,
        amount: context.amount,
        qrCode: payment?.point_of_interaction?.transaction_data?.qr_code,
        qrCodeBase64: payment?.point_of_interaction?.transaction_data?.qr_code_base64,
        ticketUrl: payment?.point_of_interaction?.transaction_data?.ticket_url,
        activated
      })
    }

    if (action === 'create_card_subscription') {
      if (!body.card?.token) throw new Error('Token do cartao ausente.')
      const context = await createPendingSubscription(adminClient, user, body.planId, 'cartao')
      const appUrl = Deno.env.get('APP_URL') || req.headers.get('Origin') || 'https://example.com'
      const preapproval = await mercadoPago('/preapproval', {
        method: 'POST',
        headers: {
          'X-Idempotency-Key': context.externalReference
        },
        body: JSON.stringify({
          reason: `Assinatura ${context.plan.nome}`,
          external_reference: context.externalReference,
          payer_email: user.email,
          card_token_id: body.card.token,
          payment_method_id: body.card.paymentMethodId,
          auto_recurring: {
            frequency: 1,
            frequency_type: 'months',
            transaction_amount: context.amount,
            currency_id: 'BRL'
          },
          back_url: appUrl,
          status: 'authorized'
        })
      })

      await storePayment(
        adminClient,
        context,
        {
          ...preapproval,
          preapproval_id: preapproval.id,
          init_point: preapproval.init_point || preapproval.sandbox_init_point
        },
        'cartao'
      )

      const activated = preapproval.status === 'authorized'
      if (activated) {
        await activateSubscription(
          adminClient,
          context.subscriptionId,
          String(preapproval.id),
          preapproval.status
        )
      }

      return json({
        preapprovalId: String(preapproval.id),
        subscriptionId: context.subscriptionId,
        status: preapproval.status,
        baseAmount: context.baseAmount,
        feeAmount: context.feeAmount,
        feeRate: context.feeRate,
        amount: context.amount,
        initPoint: preapproval.init_point || preapproval.sandbox_init_point,
        activated
      })
    }

    if (action === 'create_subscription_checkout') {
      const context = await createPendingSubscription(adminClient, user, body.planId, 'cartao')
      const appUrl = Deno.env.get('APP_URL') || req.headers.get('Origin') || 'https://example.com'
      const preapproval = await mercadoPago('/preapproval', {
        method: 'POST',
        headers: {
          'X-Idempotency-Key': context.externalReference
        },
        body: JSON.stringify({
          reason: `Assinatura ${context.plan.nome}`,
          external_reference: context.externalReference,
          payer_email: user.email,
          auto_recurring: {
            frequency: 1,
            frequency_type: 'months',
            transaction_amount: context.amount,
            currency_id: 'BRL'
          },
          back_url: appUrl,
          status: 'pending'
        })
      })

      await storePayment(
        adminClient,
        context,
        {
          ...preapproval,
          preapproval_id: preapproval.id,
          init_point: preapproval.init_point || preapproval.sandbox_init_point
        },
        'cartao'
      )

      return json({
        preapprovalId: String(preapproval.id),
        subscriptionId: context.subscriptionId,
        status: preapproval.status,
        baseAmount: context.baseAmount,
        feeAmount: context.feeAmount,
        feeRate: context.feeRate,
        amount: context.amount,
        initPoint: preapproval.init_point || preapproval.sandbox_init_point,
        activated: false
      })
    }

    if (action === 'check_status') {
      const paymentId = body.paymentId ? String(body.paymentId) : null
      const preapprovalId = body.preapprovalId ? String(body.preapprovalId) : null
      if (!paymentId && !preapprovalId) {
        throw new Error('Informe o pagamento ou assinatura a verificar.')
      }
      const path = paymentId ? `/v1/payments/${paymentId}` : `/preapproval/${preapprovalId}`
      const statusPayload = await mercadoPago(path)
      const mercadoPagoId = paymentId || preapprovalId || String(statusPayload.id)

      const { data: paymentRow } = await adminClient
        .from('pagamentos')
        .select('id, assinatura_id, metodo')
        .or(
          paymentId
            ? `mercado_pago_payment_id.eq.${paymentId}`
            : `mercado_pago_preapproval_id.eq.${preapprovalId}`
        )
        .eq('user_id', user.id)
        .maybeSingle()

      if (paymentRow) {
        await adminClient
          .from('pagamentos')
          .update({
            status: statusPayload.status,
            payload: statusPayload,
            updated_at: new Date().toISOString()
          })
          .eq('id', paymentRow.id)
      }

      const approved = statusPayload.status === 'approved' || statusPayload.status === 'authorized'
      if (approved && paymentRow?.assinatura_id) {
        await activateSubscription(
          adminClient,
          paymentRow.assinatura_id,
          mercadoPagoId,
          statusPayload.status
        )
      }

      return json({
        status: statusPayload.status,
        activated: approved,
        mercadoPagoId
      })
    }

    return json({ error: 'Acao nao reconhecida.' }, 400)
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : 'Erro inesperado.' }, 400)
  }
})
