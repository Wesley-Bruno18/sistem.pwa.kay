import { supabase } from './supabase.js'

const runtimeConfig = window.MERCADO_PAGO_CONFIG || {}

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
  const { data, error } = await supabase.functions.invoke('mercado-pago-payments', {
    body: {
      action,
      ...payload
    }
  })

  if (error) throw error
  if (data?.error) throw new Error(data.error)
  return data
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
