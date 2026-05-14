import { supabase } from './supabase.js'
import {
  addDays,
  formatTime,
  isThirtyMinuteSlot,
  toDateKey,
  todayKey
} from '../utils/dates.js'
import { normalizeVehicleType } from '../utils/plans.js'

function unwrap({ data, error }) {
  if (error) throw error
  return data
}

function friendlyDuplicateMessage(error) {
  if (error?.code === '23505') {
    return new Error('Este horario acabou de ser ocupado. Escolha outro horario.')
  }
  return error
}

export async function ensureUserProfile(authUser, defaults = {}) {
  const meta = authUser.user_metadata || {}
  const profile = {
    id: authUser.id,
    nome: defaults.name || meta.nome || authUser.email?.split('@')[0] || 'Cliente',
    email: authUser.email,
    tipo: defaults.tipo || meta.tipo || 'cliente'
  }

  const { data, error } = await supabase
    .from('users')
    .upsert(profile, { onConflict: 'id' })
    .select()
    .single()

  if (error) throw error
  return data
}

export async function getProfile(userId) {
  const { data, error } = await supabase
    .from('users')
    .select('*')
    .eq('id', userId)
    .maybeSingle()

  if (error) throw error
  return data
}

export async function getOrCreateProfile(authUser) {
  const profile = await getProfile(authUser.id)
  if (profile) return profile
  return ensureUserProfile(authUser)
}

export async function upsertVehicle(userId, { plate, model, color, vehicleType }) {
  const payload = {
    user_id: userId,
    placa: plate?.trim().toUpperCase(),
    modelo: model?.trim(),
    cor: color?.trim(),
    categoria: normalizeVehicleType(vehicleType)
  }

  const { data, error } = await supabase
    .from('veiculos')
    .upsert(payload, { onConflict: 'user_id' })
    .select()
    .single()

  if (error) throw error
  return data
}

export async function getVehicle(userId) {
  const { data, error } = await supabase
    .from('veiculos')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle()

  if (error) throw error
  return data
}

export async function getPlans({ activeOnly = true } = {}) {
  let query = supabase
    .from('planos')
    .select('*')
    .order('categoria', { ascending: true })
    .order('prioridade', { ascending: true })
    .order('preco', { ascending: true })
  if (activeOnly) query = query.eq('ativo', true)
  return unwrap(await query)
}

export async function savePlan(plan) {
  const prices = plan.precos || {
    passeio: Number(plan.preco),
    suv: Number(plan.preco),
    picape: Number(plan.preco),
    moto: Number(plan.preco)
  }

  const payload = {
    nome: plan.nome.trim(),
    preco: Number(plan.preco),
    slug: plan.slug?.trim() || plan.nome.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''),
    categoria: plan.categoria || 'carro',
    nivel: plan.nivel || 'bronze',
    precos: prices,
    desconto_percentual: Number(plan.desconto_percentual || 0),
    prioridade: Number(plan.prioridade || 1),
    servicos: plan.servicos,
    ativo: Boolean(plan.ativo)
  }

  const request = plan.id
    ? supabase.from('planos').update(payload).eq('id', plan.id).select().single()
    : supabase.from('planos').insert(payload).select().single()

  return unwrap(await request)
}

export async function deletePlan(id) {
  return unwrap(await supabase.from('planos').delete().eq('id', id))
}

export async function getActiveSubscription(userId) {
  const { data, error } = await supabase
    .from('assinaturas')
    .select('*, planos(*)')
    .eq('user_id', userId)
    .eq('status', 'ativo')
    .or(`fim.is.null,fim.gte.${todayKey()}`)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) throw error
  return data
}

export async function getAppointmentsBetween(startDate, endDate) {
  const { data, error } = await supabase
    .from('agendamentos')
    .select('*, users(nome, email), veiculos(placa, modelo, cor, categoria), planos(nome, nivel, prioridade)')
    .gte('data', startDate)
    .lte('data', endDate)
    .order('data', { ascending: true })
    .order('horario', { ascending: true })

  if (error) throw error
  return data || []
}

export async function getBookedSlotsBetween(startDate, endDate) {
  const { data, error } = await supabase
    .from('agenda_ocupada')
    .select('data, horario, vagas_ocupadas, capacidade, maior_prioridade')
    .gte('data', startDate)
    .lte('data', endDate)
    .order('data', { ascending: true })
    .order('horario', { ascending: true })

  if (error) throw error
  return data || []
}

export async function getUserAppointments(userId) {
  const { data, error } = await supabase
    .from('agendamentos')
    .select('*, planos(nome, nivel, prioridade, desconto_percentual)')
    .eq('user_id', userId)
    .order('data', { ascending: false })
    .order('horario', { ascending: true })
    .limit(20)

  if (error) throw error
  return data || []
}

export async function isSlotBooked(date, time) {
  const { data, error } = await supabase
    .from('agenda_ocupada')
    .select('vagas_ocupadas, capacidade')
    .eq('data', date)
    .eq('horario', `${formatTime(time)}:00`)
    .maybeSingle()

  if (error) throw error
  return Number(data?.vagas_ocupadas || 0) >= Number(data?.capacidade || 2)
}

export async function createAppointment({ userId, date, time }) {
  const normalizedTime = formatTime(time)

  if (!isThirtyMinuteSlot(normalizedTime)) {
    throw new Error('Os agendamentos precisam respeitar intervalos de 30 minutos.')
  }

  if (`${date}T${normalizedTime}` < `${todayKey()}T00:00`) {
    throw new Error('Escolha uma data atual ou futura.')
  }

  const subscription = await getActiveSubscription(userId)
  if (!subscription) {
    throw new Error('Ative um plano antes de agendar.')
  }

  const vehicle = await getVehicle(userId)
  if (!vehicle) {
    throw new Error('Cadastre um veiculo antes de agendar.')
  }

  const { data: rpcData, error: rpcError } = await supabase.rpc('reservar_agendamento_prioritario', {
    p_data: date,
    p_horario: `${normalizedTime}:00`
  })

  if (!rpcError) return Array.isArray(rpcData) ? rpcData[0] : rpcData
  if (!['42883', 'PGRST202'].includes(rpcError.code)) throw friendlyDuplicateMessage(rpcError)

  throw new Error('Reserva segura indisponivel. Execute a migration da RPC de agendamento.')
}

export async function getSubscriberDiscount(userId) {
  const subscription = await getActiveSubscription(userId)
  const discount = Number(subscription?.planos?.desconto_percentual || 0)

  return {
    subscription,
    discount,
    hasDiscount: discount > 0
  }
}

export async function updateAppointmentStatus(id, status) {
  const { data, error } = await supabase
    .from('agendamentos')
    .update({ status })
    .eq('id', id)
    .select()
    .single()

  if (error) throw error
  return data
}

export async function listProducts() {
  const { data, error } = await supabase
    .from('produtos')
    .select('*')
    .order('nome', { ascending: true })

  if (error) throw error
  return data || []
}

export async function saveProduct(product) {
  const payload = {
    nome: product.nome.trim(),
    quantidade: Number(product.quantidade),
    unidade: product.unidade.trim(),
    estoque_minimo: Number(product.estoque_minimo || 0)
  }

  const request = product.id
    ? supabase.from('produtos').update(payload).eq('id', product.id).select().single()
    : supabase.from('produtos').insert(payload).select().single()

  return unwrap(await request)
}

export async function deleteProduct(id) {
  return unwrap(await supabase.from('produtos').delete().eq('id', id))
}

async function fallbackCompleteAppointment(appointmentId, items) {
  for (const item of items) {
    if (!item.product_id || Number(item.quantidade) <= 0) continue

    const { data: product, error: productError } = await supabase
      .from('produtos')
      .select('*')
      .eq('id', item.product_id)
      .single()

    if (productError) throw productError

    const nextQuantity = Number(product.quantidade) - Number(item.quantidade)
    if (nextQuantity < 0) {
      throw new Error(`Estoque insuficiente para ${product.nome}.`)
    }

    const { error: updateError } = await supabase
      .from('produtos')
      .update({ quantidade: nextQuantity })
      .eq('id', item.product_id)

    if (updateError) throw updateError

    const { error: consumeError } = await supabase.from('consumo').insert({
      agendamento_id: appointmentId,
      produto_id: item.product_id,
      quantidade: Number(item.quantidade)
    })

    if (consumeError) throw consumeError
  }

  return updateAppointmentStatus(appointmentId, 'concluido')
}

export async function completeAppointment(appointmentId, items) {
  const normalizedItems = items
    .filter((item) => item.product_id && Number(item.quantidade) > 0)
    .map((item) => ({
      product_id: item.product_id,
      quantidade: Number(item.quantidade)
    }))

  const { data, error } = await supabase.rpc('concluir_servico', {
    p_agendamento_id: appointmentId,
    p_itens: normalizedItems
  })

  if (!error) return data
  if (!['42883', 'PGRST202'].includes(error.code)) throw error

  return fallbackCompleteAppointment(appointmentId, normalizedItems)
}

export async function getPlanMetrics() {
  const plans = await getPlans({ activeOnly: false })
  const { data: subscriptions, error } = await supabase
    .from('assinaturas')
    .select('plano_id, status, user_id')

  if (error) throw error

  return plans.map((plan) => {
    const related = (subscriptions || []).filter((item) => item.plano_id === plan.id)
    return {
      ...plan,
      clientesAtivos: related.filter((item) => item.status === 'ativo').length,
      clientesInativos: related.filter((item) => item.status !== 'ativo').length
    }
  })
}

export async function getReports() {
  const [appointments, subscriptions, consumption, products] = await Promise.all([
    getAppointmentsBetween(toDateKey(addDays(new Date(), -365)), toDateKey(addDays(new Date(), 365))),
    unwrap(await supabase.from('assinaturas').select('status, user_id, plano_id')),
    unwrap(await supabase.from('consumo').select('quantidade, produtos(nome, unidade)')),
    listProducts()
  ])

  const activeClientIds = new Set(
    subscriptions.filter((item) => item.status === 'ativo').map((item) => item.user_id)
  )

  const consumptionByProduct = new Map()
  for (const item of consumption || []) {
    const name = item.produtos?.nome || 'Produto'
    const unit = item.produtos?.unidade || 'un'
    const current = consumptionByProduct.get(name) || { name, unit, total: 0 }
    current.total += Number(item.quantidade)
    consumptionByProduct.set(name, current)
  }

  return {
    totalServices: appointments.filter((item) => item.status === 'concluido').length,
    scheduledServices: appointments.filter((item) => item.status === 'agendado').length,
    activeClients: activeClientIds.size,
    lowStock: products.filter((item) => Number(item.quantidade) <= Number(item.estoque_minimo)).length,
    consumption: Array.from(consumptionByProduct.values())
  }
}
