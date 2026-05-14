import {
  createAppointment,
  getActiveSubscription,
  getBookedSlotsBetween,
  getPlans,
  getUserAppointments,
  getVehicle,
  updateAppointmentStatus
} from '../services/db.js'
import {
  checkMercadoPagoStatus,
  createCardSubscription,
  createPixPayment,
  createSubscriptionCheckout,
  isMercadoPagoCardConfigured,
  loadMercadoPagoSdk,
  MERCADO_PAGO_PUBLIC_KEY,
  quotePlanPayment
} from '../services/payments.js'
import { badge, emptyState, topbar } from '../components/layout.js'
import { showError, showToast } from '../components/toast.js'
import {
  addDays,
  formatCurrency,
  formatDisplayDate,
  formatTime,
  getWeekDays,
  getWeekStart,
  slotsForDay,
  statusLabel,
  toDateKey,
  todayKey
} from '../utils/dates.js'
import { disableWhile, escapeHtml } from '../utils/dom.js'
import {
  applySubscriberDiscount,
  calculateMercadoPagoCharge,
  getPlanPrice,
  getPlanPriceLabel,
  getPriorityLabel,
  planMatchesVehicle,
  VEHICLE_LABELS
} from '../utils/plans.js'

export function renderClientDashboard({ app, session, profile, onLogout }) {
  const state = {
    weekStart: getWeekStart(),
    selectedSlot: null
  }

  app.innerHTML = `
    <div class="app-shell">
      ${topbar({ profile })}
      <main id="clientContent" class="main-content">
        <div class="loading-card">Carregando dashboard...</div>
      </main>
    </div>
  `

  document.querySelector('#logoutButton').addEventListener('click', onLogout)

  async function refresh() {
    const content = document.querySelector('#clientContent')
    content.innerHTML = '<div class="loading-card">Atualizando dados...</div>'

    try {
      const start = toDateKey(state.weekStart)
      const end = toDateKey(addDays(state.weekStart, 6))
      const [plans, subscription, vehicle, userAppointments, weekAppointments] =
        await Promise.all([
          getPlans(),
          getActiveSubscription(session.user.id),
          getVehicle(session.user.id),
          getUserAppointments(session.user.id),
          getBookedSlotsBetween(start, end)
        ])

      content.innerHTML = renderContent({
        profile,
        plans,
        subscription,
        vehicle,
        userAppointments,
        weekAppointments,
        state
      })

      notifyPriorityLoss(userAppointments)
      bindClientActions({ refresh, state, session, plans, vehicle })
    } catch (error) {
      showError(error)
      content.innerHTML = emptyState('Nao foi possivel carregar', 'Confira a conexao com o Supabase.')
    }
  }

  refresh()
}

function renderContent(data) {
  return `
    <section class="dashboard-grid client-overview">
      <article class="metric-card">
        <span>Plano ativo</span>
        <strong>${data.subscription ? escapeHtml(data.subscription.planos?.nome) : 'Sem plano'}</strong>
        ${data.subscription ? badge(statusLabel(data.subscription.status), 'success') : badge('Bloqueado para agenda', 'warning')}
      </article>
      <article class="metric-card">
        <span>Veiculo</span>
        <strong>${data.vehicle ? escapeHtml(data.vehicle.placa) : 'Pendente'}</strong>
        <small>${data.vehicle ? `${escapeHtml(data.vehicle.modelo)} - ${escapeHtml(data.vehicle.cor)} - ${VEHICLE_LABELS[data.vehicle.categoria || 'passeio']}` : 'Complete o cadastro'}</small>
      </article>
      <article class="metric-card">
        <span>Proximo horario</span>
        <strong>${nextAppointmentLabel(data.userAppointments)}</strong>
        <small>${data.userAppointments.filter((item) => item.status === 'agendado').length} agendados</small>
      </article>
      <article class="metric-card">
        <span>Desconto avulso</span>
        <strong>${data.subscription ? `${Number(data.subscription.planos?.desconto_percentual || 0)}%` : '0%'}</strong>
        <small>${data.subscription ? 'Aplicado nos demais servicos' : 'Disponivel para assinantes'}</small>
      </article>
    </section>

    <section class="section-block">
      <div class="section-heading">
        <div>
          <p class="eyebrow">Planos</p>
          <h2>Escolha sua assinatura</h2>
        </div>
      </div>
      <div class="plan-carousel">
        ${renderPlans(data.plans, data.subscription, data.vehicle)}
      </div>
    </section>

    <section class="section-block">
      <div class="section-heading">
        <div>
          <p class="eyebrow">Agenda</p>
          <h2>Calendario semanal</h2>
        </div>
        <div class="button-row">
          <button class="secondary-button" type="button" data-week-prev>Anterior</button>
          <button class="secondary-button" type="button" data-week-next>Proxima</button>
        </div>
      </div>
      ${renderSchedule(data.weekAppointments, data.subscription, data.state)}
    </section>

    <section class="section-block">
      <div class="section-heading">
        <div>
          <p class="eyebrow">Historico</p>
          <h2>Meus agendamentos</h2>
        </div>
      </div>
      ${renderUserAppointments(data.userAppointments)}
    </section>
  `
}

function renderPlans(plans, subscription, vehicle) {
  const visiblePlans = plans.filter((plan) => planMatchesVehicle(plan, vehicle))

  if (!visiblePlans.length) {
    return emptyState('Nenhum plano publicado', 'O administrador ainda nao liberou planos ativos.')
  }

  return visiblePlans
    .map((plan) => {
      const isCurrent = subscription?.plano_id === plan.id
      const price = getPlanPrice(plan, vehicle)
      const payment = calculateMercadoPagoCharge(price)
      const discountSample = applySubscriberDiscount(100, plan)
      const services = (plan.servicos || [])
        .map((service) => `<li>${escapeHtml(service)}</li>`)
        .join('')

      return `
        <article class="plan-card ${isCurrent ? 'is-current' : ''}">
          <div>
            <span class="plan-status">${isCurrent ? 'Plano atual' : `${escapeHtml(plan.nivel || 'plano')} - ${getPriorityLabel(plan)}`}</span>
            <h3>${escapeHtml(plan.nome)}</h3>
            <strong>${formatCurrency(price)}<small>/mes</small></strong>
            <small>${escapeHtml(getPlanPriceLabel(plan, vehicle))}</small>
            <small>Mercado Pago: ${formatCurrency(payment.paymentTotal)} com taxa de 5%</small>
            <small>${discountSample.discount}% de desconto nos demais servicos</small>
          </div>
          <ul>${services}</ul>
          <div class="button-row stacked-mobile">
            <button class="secondary-button" type="button" data-payment-plan="${plan.id}" data-method="pix" ${isCurrent ? 'disabled' : ''}>PIX</button>
            <button class="primary-button" type="button" data-payment-plan="${plan.id}" data-method="cartao" ${isCurrent ? 'disabled' : ''}>Cartao recorrente</button>
          </div>
        </article>
      `
    })
    .join('')
}

function renderSchedule(appointments, subscription, state) {
  const availability = new Map(
    appointments.map((item) => [
      `${item.data}-${formatTime(item.horario)}`,
      {
        occupied: Number(item.vagas_ocupadas || 0),
        capacity: Number(item.capacidade || 2)
      }
    ])
  )
  const weekDays = getWeekDays(state.weekStart)

  return `
    <div class="schedule-shell">
      <div class="week-grid">
        ${weekDays
          .map((day) => {
            const key = toDateKey(day)
            const slots = slotsForDay(day)
            const isPastDay = key < todayKey()

            return `
              <article class="day-column">
                <header>
                  <strong>${formatDisplayDate(day, { weekday: 'short' })}</strong>
                  <span>${formatDisplayDate(day, { day: '2-digit', month: '2-digit' })}</span>
                </header>
                <div class="slot-list">
                  ${
                    slots.length
                      ? slots
                          .map((slot) => {
                            const slotKey = `${key}-${slot}`
                            const slotAvailability = availability.get(slotKey) || {
                              occupied: 0,
                              capacity: 2
                            }
                            const isBooked = slotAvailability.occupied >= slotAvailability.capacity
                            const isSelected =
                              state.selectedSlot?.date === key && state.selectedSlot?.time === slot
                            const disabled = !subscription || isBooked || isPastDay
                            const freeLabel = `${slotAvailability.capacity - slotAvailability.occupied}/${slotAvailability.capacity} vagas`

                            return `
                              <button class="slot-option ${isSelected ? 'is-selected' : ''}" type="button"
                                data-slot-date="${key}" data-slot-time="${slot}" ${disabled ? 'disabled' : ''}>
                                ${slot}
                                <span>${isBooked ? 'Esgotado' : disabled ? 'Indisp.' : freeLabel}</span>
                              </button>
                            `
                          })
                          .join('')
                      : '<span class="closed-day">Fechado</span>'
                  }
                </div>
              </article>
            `
          })
          .join('')}
      </div>
      <div class="confirm-bar">
        <span>${
          subscription
            ? selectedSlotLabel(state.selectedSlot)
            : 'Ative um plano para liberar a agenda.'
        }</span>
        <button class="primary-button" type="button" data-confirm-schedule ${
          state.selectedSlot && subscription ? '' : 'disabled'
        }>Confirmar agendamento</button>
      </div>
    </div>
  `
}

function renderUserAppointments(appointments) {
  if (!appointments.length) {
    return emptyState('Nenhum agendamento', 'Seus horarios confirmados aparecem aqui.')
  }

  return `
    <div class="appointment-list">
      ${appointments
        .map((item) => {
          const canCancel = item.status === 'agendado' && item.data >= todayKey()
          return `
            <article class="appointment-card">
              <div>
                <strong>${formatDisplayDate(item.data, { day: '2-digit', month: 'short', year: 'numeric' })} - ${formatTime(item.horario)}</strong>
                <span>${escapeHtml(item.planos?.nome || 'Plano')}</span>
                ${item.observacao ? `<small>${escapeHtml(item.observacao)}</small>` : ''}
              </div>
              <div class="button-row">
                ${badge(statusLabel(item.status), item.status === 'concluido' ? 'success' : item.status === 'cancelado' ? 'danger' : 'neutral')}
                ${
                  canCancel
                    ? `<button class="ghost-button" type="button" data-cancel-appointment="${item.id}">Cancelar</button>`
                    : ''
                }
              </div>
            </article>
          `
        })
        .join('')}
    </div>
  `
}

function bindClientActions({ refresh, state, session, plans, vehicle }) {
  const content = document.querySelector('#clientContent')

  content.addEventListener('click', async (event) => {
    const target = event.target.closest('button')
    if (!target) return

    if (target.matches('[data-week-prev]')) {
      state.weekStart = addDays(state.weekStart, -7)
      state.selectedSlot = null
      refresh()
      return
    }

    if (target.matches('[data-week-next]')) {
      state.weekStart = addDays(state.weekStart, 7)
      state.selectedSlot = null
      refresh()
      return
    }

    if (target.matches('[data-slot-date]')) {
      state.selectedSlot = {
        date: target.dataset.slotDate,
        time: target.dataset.slotTime
      }
      refresh()
      return
    }

    if (target.matches('[data-payment-plan]')) {
      const plan = plans.find((item) => item.id === target.dataset.paymentPlan)
      if (!plan) return

      const restore = disableWhile(target, 'Processando...')
      try {
        if (target.dataset.method === 'pix') {
          await openPixPaymentModal(plan, refresh)
        } else {
          await openCardSubscriptionModal({ plan, session, refresh, vehicle })
        }
      } catch (error) {
        showError(error)
      } finally {
        restore()
      }
      return
    }

    if (target.matches('[data-confirm-schedule]')) {
      if (!state.selectedSlot) return
      const ok = window.confirm(`Confirmar ${state.selectedSlot.date} as ${state.selectedSlot.time}?`)
      if (!ok) return

      const restore = disableWhile(target, 'Confirmando...')
      try {
        const appointmentResult = await createAppointment({
          userId: session.user.id,
          date: state.selectedSlot.date,
          time: state.selectedSlot.time
        })
        showToast(appointmentResult?.message || 'Agendamento confirmado.')
        window.setTimeout(() => {
          showToast(`Lembrete simulado: horario em ${state.selectedSlot.date} as ${state.selectedSlot.time}.`, 'warning')
        }, 4500)
        state.selectedSlot = null
        refresh()
      } catch (error) {
        showError(error)
      } finally {
        restore()
      }
      return
    }

    if (target.matches('[data-cancel-appointment]')) {
      const ok = window.confirm('Cancelar este agendamento?')
      if (!ok) return

      try {
        await updateAppointmentStatus(target.dataset.cancelAppointment, 'cancelado')
        showToast('Agendamento cancelado.')
        refresh()
      } catch (error) {
        showError(error)
      }
    }
  })
}

async function openPixPaymentModal(plan, refresh) {
  const modal = createModal(`
    <div class="section-heading">
      <div>
        <p class="eyebrow">Mercado Pago</p>
        <h2>Pix</h2>
      </div>
      <button class="ghost-button compact" type="button" data-modal-close>Fechar</button>
    </div>
    <div class="loading-card">Gerando QR Code...</div>
  `)

  const result = await createPixPayment({ planId: plan.id })
  const content = modal.querySelector('.modal')
  content.innerHTML = `
    <div class="section-heading">
      <div>
        <p class="eyebrow">Mercado Pago</p>
        <h2>Pix</h2>
      </div>
      <button class="ghost-button compact" type="button" data-modal-close>Fechar</button>
    </div>
    <div class="pix-box">
      <div class="payment-summary">
        <span>Plano: ${formatCurrency(result.baseAmount || result.amount || 0)}</span>
        <span>Taxa Mercado Pago: ${formatCurrency(result.feeAmount || 0)}</span>
        <strong>Total: ${formatCurrency(result.amount || 0)}</strong>
      </div>
      ${
        result.qrCodeBase64
          ? `<img class="pix-qr" src="data:image/png;base64,${result.qrCodeBase64}" alt="QR Code Pix" />`
          : ''
      }
      <label>
        Copia e cola
        <textarea readonly rows="5">${escapeHtml(result.qrCode || '')}</textarea>
      </label>
      <div class="button-row stacked-mobile">
        <button class="secondary-button" type="button" data-copy-pix>Copiar codigo</button>
        <button class="primary-button" type="button" data-check-pix="${escapeHtml(result.paymentId)}">Verificar pagamento</button>
      </div>
    </div>
  `

  bindModalClose(modal)
  content.querySelector('[data-copy-pix]')?.addEventListener('click', async () => {
    await navigator.clipboard.writeText(result.qrCode || '')
    showToast('Codigo Pix copiado.')
  })

  content.querySelector('[data-check-pix]')?.addEventListener('click', async (event) => {
    const restore = disableWhile(event.currentTarget, 'Verificando...')
    try {
      const status = await checkMercadoPagoStatus({
        paymentId: result.paymentId,
        subscriptionId: result.subscriptionId
      })
      if (status.activated) {
        showToast('Pagamento aprovado. Plano ativo.')
        modal.remove()
        refresh()
      } else {
        showToast('Pagamento ainda nao aprovado pelo Mercado Pago.', 'warning')
      }
    } catch (error) {
      showError(error)
    } finally {
      restore()
    }
  })
}

async function openCardSubscriptionModal({ plan, session, refresh, vehicle }) {
  if (!isMercadoPagoCardConfigured()) {
    const checkout = await createSubscriptionCheckout({ planId: plan.id })
    openPaymentLink(checkout.initPoint)
    showToast('Checkout recorrente aberto em nova aba.')
    return
  }

  const quote = await quotePlanPayment({ planId: plan.id })
  const modal = createModal(`
    <form id="mp-card-form" class="mp-card-form">
      <div class="section-heading">
        <div>
          <p class="eyebrow">Mercado Pago</p>
          <h2>Cartao recorrente</h2>
        </div>
        <button class="ghost-button compact" type="button" data-modal-close>Fechar</button>
      </div>
      <div class="payment-summary">
        <span>Plano: ${formatCurrency(quote.baseAmount)}</span>
        <span>Taxa Mercado Pago: ${formatCurrency(quote.feeAmount)}</span>
        <strong>Total recorrente: ${formatCurrency(quote.amount)}</strong>
      </div>
      <div id="form-checkout__cardNumber" class="mp-field"></div>
      <div class="field-grid">
        <div id="form-checkout__expirationDate" class="mp-field"></div>
        <div id="form-checkout__securityCode" class="mp-field"></div>
      </div>
      <label>Nome no cartao <input id="form-checkout__cardholderName" type="text" required /></label>
      <label>Email <input id="form-checkout__cardholderEmail" type="email" value="${escapeHtml(session.user.email || '')}" required /></label>
      <div class="field-grid">
        <select id="form-checkout__issuer"></select>
        <select id="form-checkout__installments"></select>
      </div>
      <div class="field-grid">
        <select id="form-checkout__identificationType"></select>
        <input id="form-checkout__identificationNumber" type="text" placeholder="Documento" />
      </div>
      <button class="primary-button full-button" type="submit" id="form-checkout__submit">Ativar recorrencia</button>
      <progress value="0" class="progress-bar is-hidden">Carregando...</progress>
    </form>
  `)

  bindModalClose(modal)

  const MercadoPago = await loadMercadoPagoSdk()
  const mp = new MercadoPago(MERCADO_PAGO_PUBLIC_KEY, { locale: 'pt-BR' })
  const cardForm = mp.cardForm({
    amount: String(quote.amount),
    iframe: true,
    form: {
      id: 'mp-card-form',
      cardNumber: {
        id: 'form-checkout__cardNumber',
        placeholder: 'Numero do cartao'
      },
      expirationDate: {
        id: 'form-checkout__expirationDate',
        placeholder: 'MM/AA'
      },
      securityCode: {
        id: 'form-checkout__securityCode',
        placeholder: 'CVV'
      },
      cardholderName: {
        id: 'form-checkout__cardholderName',
        placeholder: 'Nome impresso'
      },
      issuer: {
        id: 'form-checkout__issuer',
        placeholder: 'Banco emissor'
      },
      installments: {
        id: 'form-checkout__installments',
        placeholder: 'Parcelas'
      },
      identificationType: {
        id: 'form-checkout__identificationType',
        placeholder: 'Tipo'
      },
      identificationNumber: {
        id: 'form-checkout__identificationNumber',
        placeholder: 'Numero'
      },
      cardholderEmail: {
        id: 'form-checkout__cardholderEmail',
        placeholder: 'Email'
      }
    },
    callbacks: {
      onSubmit: async (event) => {
        event.preventDefault()
        const submit = modal.querySelector('#form-checkout__submit')
        const restore = disableWhile(submit, 'Ativando...')

        try {
          const formData = cardForm.getCardFormData()
          const result = await createCardSubscription({
            planId: plan.id,
            card: {
              token: formData.token,
              paymentMethodId: formData.paymentMethodId,
              issuerId: formData.issuerId,
              cardholderEmail: formData.cardholderEmail,
              identificationType: formData.identificationType,
              identificationNumber: formData.identificationNumber
            }
          })

          if (result.activated) {
            showToast('Cartao recorrente aprovado. Plano ativo.')
            modal.remove()
            refresh()
          } else if (result.initPoint) {
            openPaymentLink(result.initPoint)
            showToast('Finalize a autorizacao no Mercado Pago.', 'warning')
          } else {
            showToast('Assinatura enviada para autorizacao.', 'warning')
          }
        } catch (error) {
          showError(error)
        } finally {
          restore()
        }
      },
      onFetching: () => {
        const progress = modal.querySelector('.progress-bar')
        progress.classList.remove('is-hidden')
        return () => progress.classList.add('is-hidden')
      },
      onFormMounted: (error) => {
        if (error) showError(error)
      }
    }
  })
}

function createModal(content) {
  const modal = document.createElement('div')
  modal.className = 'modal-backdrop'
  modal.innerHTML = `<div class="modal">${content}</div>`
  document.body.appendChild(modal)
  bindModalClose(modal)
  return modal
}

function bindModalClose(modal) {
  modal.querySelectorAll('[data-modal-close]').forEach((button) => {
    button.addEventListener('click', () => modal.remove())
  })

  modal.addEventListener('click', (event) => {
    if (event.target === modal) modal.remove()
  })
}

function openPaymentLink(url) {
  if (!url) throw new Error('Link de pagamento nao retornado pelo Mercado Pago.')
  const opened = window.open(url, '_blank', 'noopener,noreferrer')
  if (!opened) window.location.assign(url)
}

function selectedSlotLabel(slot) {
  if (!slot) return 'Selecione um horario livre.'
  return `${slot.date} as ${slot.time}`
}

function nextAppointmentLabel(appointments) {
  const next = appointments
    .filter((item) => item.status === 'agendado' && item.data >= todayKey())
    .sort((a, b) => `${a.data}${a.horario}`.localeCompare(`${b.data}${b.horario}`))[0]

  if (!next) return 'Nenhum'
  return `${formatDisplayDate(next.data, { day: '2-digit', month: 'short' })} ${formatTime(next.horario)}`
}

function notifyPriorityLoss(appointments) {
  const lostAppointment = appointments.find(
    (item) =>
      item.status === 'cancelado' &&
      item.observacao?.toLowerCase().includes('prioridade') &&
      !sessionStorage.getItem(`priority-loss:${item.id}`)
  )

  if (!lostAppointment) return
  sessionStorage.setItem(`priority-loss:${lostAppointment.id}`, '1')
  showToast(
    'Um horario foi assumido por um plano com prioridade maior. Escolha outro horario disponivel.',
    'warning'
  )
}
