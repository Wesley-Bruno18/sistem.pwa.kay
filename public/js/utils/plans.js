export const VEHICLE_LABELS = {
  passeio: 'Carro de passeio',
  suv: 'SUV',
  picape: 'Picape',
  moto: 'Moto'
}

export const PLAN_LEVEL_LABELS = {
  bronze: 'Bronze',
  prata: 'Prata',
  ouro: 'Ouro'
}

export const MERCADO_PAGO_FEE_RATE = 0.05

export function roundCurrency(value) {
  return Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100
}

export function calculateMercadoPagoCharge(basePrice, feeRate = MERCADO_PAGO_FEE_RATE) {
  const baseAmount = roundCurrency(basePrice)
  const paymentTotal = roundCurrency(baseAmount / (1 - feeRate))

  return {
    baseAmount,
    feeRate,
    feeAmount: roundCurrency(paymentTotal - baseAmount),
    paymentTotal
  }
}

export function normalizeVehicleType(vehicleOrType) {
  const value =
    typeof vehicleOrType === 'string'
      ? vehicleOrType
      : vehicleOrType?.categoria || vehicleOrType?.tipo || 'passeio'

  return ['passeio', 'suv', 'picape', 'moto'].includes(value) ? value : 'passeio'
}

export function vehiclePlanCategory(vehicleOrType) {
  return normalizeVehicleType(vehicleOrType) === 'moto' ? 'moto' : 'carro'
}

export function planMatchesVehicle(plan, vehicleOrType) {
  if (!plan) return false
  return (plan.categoria || 'carro') === vehiclePlanCategory(vehicleOrType)
}

export function getPlanPrice(plan, vehicleOrType) {
  if (!plan) return 0
  const vehicleType = normalizeVehicleType(vehicleOrType)
  const prices = plan.precos || {}

  if (prices[vehicleType] != null) return Number(prices[vehicleType])
  if (vehicleType !== 'moto' && prices.passeio != null) return Number(prices.passeio)
  if (prices.moto != null) return Number(prices.moto)

  return Number(plan.preco || 0)
}

export function getPlanPriceLabel(plan, vehicleOrType) {
  const vehicleType = normalizeVehicleType(vehicleOrType)
  return `${VEHICLE_LABELS[vehicleType]}: ${new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL'
  }).format(getPlanPrice(plan, vehicleType))}`
}

export function getPlanDiscount(subscriptionOrPlan) {
  const plan = subscriptionOrPlan?.planos || subscriptionOrPlan
  return Number(plan?.desconto_percentual || 0)
}

export function applySubscriberDiscount(basePrice, subscriptionOrPlan) {
  const discount = getPlanDiscount(subscriptionOrPlan)
  const original = Number(basePrice || 0)
  const finalPrice = original * (1 - discount / 100)

  return {
    original,
    discount,
    finalPrice: Number(finalPrice.toFixed(2)),
    hasDiscount: discount > 0
  }
}

export function getPriorityLabel(plan) {
  const priority = Number(plan?.prioridade || 0)
  if (priority >= 3) return 'Prioridade maxima'
  if (priority === 2) return 'Prioridade no agendamento'
  if (priority === 1) return 'Prioridade padrao'
  return 'Sem prioridade'
}
