import { SUPABASE_ANON_KEY, SUPABASE_URL, supabase } from './supabase.js'

const runtimeConfig = window.MERCADO_PAGO_CONFIG || {}
const EDGE_FUNCTION_TIMEOUT = 25000

export const MERCADO_PAGO_PUBLIC_KEY =
  runtimeConfig.publicKey ||
  localStorage.getItem('auto-glow:mercado-pago-public-key') ||
  ''

export function isMercadoPagoCardConfigured() {
  return MERCADO_PAGO_PUBLIC_KEY.startsWith('APP_USR-') || MERCADO_PAGO_PUBLIC_KEY.startsWith('TEST-')
}

export function saveMercadoPagoPublicKey(publicKey) {
  localStorage.setItem('auto-glow:mercado-pago-public-key', publicKey.trim())
}

export async function loadMercadoPagoSdk() {
  if (window.MercadoPago) return window.MercadoPago

  await new Promise((resolve, reject) => {
    const script = document.createElement('script')
    script.src = 'https://sdk.mercadopago.com/js/v2'
    script.async = true
    script.onload = resolve
    script.onerror = () => reject(new Error('Nao foi possivel carregar o Mercado Pago.'))
    document.head.appendChild(script)
  })

  return window.MercadoPago
}

async function invokeMercadoPago(action, payload = {}) {
  const {
    data: { session }
  } = await supabase.auth.getSession()
  const controller = new AbortController()
  const timeoutId = window.setTimeout(() => controller.abort(), EDGE_FUNCTION_TIMEOUT)

  try {
    const response = await fetch(`${SUPABASE_URL}/functions/v1/mercado-pago-payments`, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${session?.access_token || SUPABASE_ANON_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        action,
        ...payload
      })
    })

    const text = await response.text()
    let data = {}
    try {
      data = text ? JSON.parse(text) : {}
    } catch {
      data = { error: text }
    }

    if (!response.ok || data?.error) {
      throw new Error(data?.error || data?.message || 'Nao foi possivel processar o pagamento.')
    }

    return data
  } catch (error) {
    if (error?.name === 'AbortError') {
      throw new Error('O Mercado Pago demorou para responder. Tente novamente em instantes.')
    }
    throw error
  } finally {
    window.clearTimeout(timeoutId)
  }
}

export function createPixPayment({ planId }) {
  return invokeMercadoPago('create_pix_payment', { planId })
}

export function quotePlanPayment({ planId }) {
  return invokeMercadoPago('quote_plan_payment', { planId })
}

export function createCardSubscription({ planId, card }) {
  return invokeMercadoPago('create_card_subscription', { planId, card })
}

export function createSubscriptionCheckout({ planId }) {
  return invokeMercadoPago('create_subscription_checkout', { planId })
}

export function checkMercadoPagoStatus(payload) {
  return invokeMercadoPago('check_status', payload)
}
