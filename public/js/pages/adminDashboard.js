import {
  completeAppointment,
  deletePlan,
  deleteProduct,
  getAppointmentsBetween,
  getPlanMetrics,
  getReports,
  listProducts,
  savePlan,
  saveProduct,
  updateAppointmentStatus
} from '../services/db.js'
import { badge, brand, emptyState } from '../components/layout.js'
import { showError, showToast } from '../components/toast.js'
import {
  addDays,
  formatCurrency,
  formatDisplayDate,
  formatSlotRange,
  getMonthGrid,
  getWeekDays,
  getWeekStart,
  monthBounds,
  statusLabel,
  toDateKey,
  todayKey
} from '../utils/dates.js'
import { disableWhile, escapeHtml, parseServiceList } from '../utils/dom.js'
import { getPlanPrice, PLAN_LEVEL_LABELS, VEHICLE_LABELS } from '../utils/plans.js'

export function renderAdminDashboard({ app, profile, onLogout }) {
  const initialView = ['agenda', 'estoque', 'planos', 'relatorios'].includes(location.hash.slice(1))
    ? location.hash.slice(1)
    : 'agenda'

  const state = {
    view: initialView,
    monthDate: new Date(),
    weekStart: getWeekStart(),
    selectedDay: todayKey()
  }

  app.innerHTML = `
    <div class="admin-shell">
      <aside class="sidebar">
        ${brand()}
        <nav class="side-nav" aria-label="Administracao">
          <button class="side-link ${state.view === 'agenda' ? 'is-active' : ''}" type="button" data-admin-view="agenda">Agenda</button>
          <button class="side-link ${state.view === 'estoque' ? 'is-active' : ''}" type="button" data-admin-view="estoque">Estoque</button>
          <button class="side-link ${state.view === 'planos' ? 'is-active' : ''}" type="button" data-admin-view="planos">Planos</button>
          <button class="side-link ${state.view === 'relatorios' ? 'is-active' : ''}" type="button" data-admin-view="relatorios">Relatorios</button>
        </nav>
        <button class="ghost-button sidebar-logout" type="button" id="logoutButton">Sair</button>
      </aside>
      <div class="admin-main">
        <header class="admin-header">
          <div>
            <p class="eyebrow">Admin</p>
            <h1>Operacao</h1>
          </div>
          <div class="admin-actions">
            <span class="user-pill">${escapeHtml(profile.nome)}</span>
            <button class="ghost-button compact" type="button" id="headerLogoutButton">Sair</button>
          </div>
        </header>
        <main id="adminContent" class="main-content">
          <div class="loading-card">Carregando painel...</div>
        </main>
      </div>
    </div>
  `

  document.querySelector('#logoutButton').addEventListener('click', onLogout)
  document.querySelector('#headerLogoutButton').addEventListener('click', onLogout)
  document.querySelector('.side-nav').addEventListener('click', (event) => {
    const button = event.target.closest('[data-admin-view]')
    if (!button) return

    state.view = button.dataset.adminView
    history.replaceState(null, '', `#${state.view}`)
    document.querySelectorAll('[data-admin-view]').forEach((item) => {
      item.classList.toggle('is-active', item.dataset.adminView === state.view)
    })
    renderView()
  })

  async function renderView() {
    const content = document.querySelector('#adminContent')
    content.onclick = null
    content.innerHTML = '<div class="loading-card">Atualizando painel...</div>'

    try {
      if (state.view === 'agenda') await renderAgenda(content, state, renderView)
      if (state.view === 'estoque') await renderStock(content)
      if (state.view === 'planos') await renderPlans(content)
      if (state.view === 'relatorios') await renderReports(content)
    } catch (error) {
      showError(error)
      content.innerHTML = emptyState('Nao foi possivel carregar', 'Confira permissoes, RLS e conexao.')
    }
  }

  renderView()
}

async function renderAgenda(content, state, refresh) {
  const grid = getMonthGrid(state.monthDate)
  const { start, end } = monthBounds(state.monthDate)
  const weekEnd = addDays(state.weekStart, 6)
  const [monthAppointments, weekAppointments] = await Promise.all([
    getAppointmentsBetween(toDateKey(start), toDateKey(end)),
    getAppointmentsBetween(toDateKey(state.weekStart), toDateKey(weekEnd))
  ])

  const countByDay = countAppointmentsByDay(monthAppointments)
  const selectedAppointments = monthAppointments.filter((item) => item.data === state.selectedDay)

  content.innerHTML = `
    <section class="admin-agenda-grid">
      <article class="section-block calendar-panel">
        <div class="section-heading">
          <div>
            <p class="eyebrow">Mensal</p>
            <h2>${formatDisplayDate(state.monthDate, { month: 'long', year: 'numeric' })}</h2>
          </div>
          <div class="button-row">
            <button class="secondary-button" type="button" data-month-prev>Anterior</button>
            <button class="secondary-button" type="button" data-month-next>Proximo</button>
          </div>
        </div>
        <div class="month-weekdays">
          <span>Seg</span><span>Ter</span><span>Qua</span><span>Qui</span><span>Sex</span><span>Sab</span><span>Dom</span>
        </div>
        <div class="month-grid">
          ${grid.days
            .map((day) => {
              const count = countByDay.get(day.key) || 0
              return `
                <button class="month-day ${day.inMonth ? '' : 'is-muted'} ${day.isToday ? 'is-today' : ''} ${state.selectedDay === day.key ? 'is-selected' : ''}"
                  type="button" data-day="${day.key}">
                  <span>${day.date.getDate()}</span>
                  ${count ? '<i class="day-dot" aria-hidden="true"></i>' : ''}
                </button>
              `
            })
            .join('')}
        </div>
      </article>

      <article class="section-block selected-day-panel">
        <div class="section-heading">
          <div>
            <p class="eyebrow">Dia selecionado</p>
            <h2>${formatDisplayDate(state.selectedDay, { day: '2-digit', month: 'long' })}</h2>
          </div>
        </div>
        ${renderAdminAppointmentList(selectedAppointments)}
      </article>
    </section>

    <section class="section-block">
      <div class="section-heading">
        <div>
          <p class="eyebrow">Semanal</p>
          <h2>${formatDisplayDate(state.weekStart, { day: '2-digit', month: 'short' })} a ${formatDisplayDate(weekEnd, { day: '2-digit', month: 'short' })}</h2>
        </div>
        <div class="button-row">
          <button class="secondary-button" type="button" data-admin-week-prev>Anterior</button>
          <button class="secondary-button" type="button" data-admin-week-next>Proxima</button>
        </div>
      </div>
      ${renderAdminWeek(state.weekStart, weekAppointments)}
    </section>
  `

  content.onclick = async (event) => {
    const button = event.target.closest('button')
    if (!button) return

    if (button.matches('[data-month-prev]')) {
      state.monthDate = new Date(state.monthDate.getFullYear(), state.monthDate.getMonth() - 1, 1)
      state.selectedDay = toDateKey(state.monthDate)
      refresh()
      return
    }

    if (button.matches('[data-month-next]')) {
      state.monthDate = new Date(state.monthDate.getFullYear(), state.monthDate.getMonth() + 1, 1)
      state.selectedDay = toDateKey(state.monthDate)
      refresh()
      return
    }

    if (button.matches('[data-admin-week-prev]')) {
      state.weekStart = addDays(state.weekStart, -7)
      refresh()
      return
    }

    if (button.matches('[data-admin-week-next]')) {
      state.weekStart = addDays(state.weekStart, 7)
      refresh()
      return
    }

    if (button.matches('[data-day]')) {
      state.selectedDay = button.dataset.day
      refresh()
      return
    }

    if (button.matches('[data-complete]')) {
      openConsumptionModal(button.dataset.complete, refresh)
      return
    }

    if (button.matches('[data-cancel]')) {
      if (!window.confirm('Cancelar este agendamento?')) return
      try {
        await updateAppointmentStatus(button.dataset.cancel, 'cancelado')
        showToast('Agendamento cancelado.')
        refresh()
      } catch (error) {
        showError(error)
      }
    }
  }
}

function renderAdminWeek(startDate, appointments) {
  const byDay = groupBy(appointments, 'data')
  return `
    <div class="admin-week-grid">
      ${getWeekDays(startDate)
        .map((day) => {
          const key = toDateKey(day)
          const items = byDay.get(key) || []
          return `
            <article class="admin-week-day">
              <header>
                <strong>${formatDisplayDate(day, { weekday: 'short' })}</strong>
                <span>${formatDisplayDate(day, { day: '2-digit', month: '2-digit' })}</span>
              </header>
              ${
                items.length
                  ? items
                      .map(
                        (item) => `
                          <div class="mini-appointment">
                            <strong>${formatSlotRange(item.horario)}</strong>
                            <span>${escapeHtml(item.users?.nome || 'Cliente')}</span>
                          </div>
                        `
                      )
                      .join('')
                  : '<span class="closed-day">Sem agenda</span>'
              }
            </article>
          `
        })
        .join('')}
    </div>
  `
}

function renderAdminAppointmentList(appointments) {
  if (!appointments.length) {
    return emptyState('Sem agendamentos', 'Nenhum carro marcado para este dia.')
  }

  return `
    <div class="admin-appointment-list">
      ${appointments
        .map(
          (item) => `
          <article class="admin-appointment-card">
            <div>
              <strong>${formatSlotRange(item.horario)} - ${escapeHtml(item.users?.nome || 'Cliente')}</strong>
              <span>${escapeHtml(item.veiculos?.placa || '')} | ${escapeHtml(item.veiculos?.modelo || '')} | ${escapeHtml(item.veiculos?.cor || '')}</span>
              <small>${escapeHtml(item.planos?.nome || 'Plano')}</small>
            </div>
            <div class="button-row">
              ${badge(statusLabel(item.status), item.status === 'concluido' ? 'success' : item.status === 'cancelado' ? 'danger' : 'neutral')}
              ${
                item.status === 'agendado'
                  ? `<button class="primary-button compact" type="button" data-complete="${item.id}">Concluir</button>
                     <button class="ghost-button compact" type="button" data-cancel="${item.id}">Cancelar</button>`
                  : ''
              }
            </div>
          </article>
        `
        )
        .join('')}
    </div>
  `
}

async function renderStock(content) {
  const products = await listProducts()
  content.innerHTML = `
    <section class="crud-layout">
      <form id="productForm" class="section-block form-panel">
        <div class="section-heading">
          <div>
            <p class="eyebrow">Estoque</p>
            <h2>Produto</h2>
          </div>
        </div>
        <input type="hidden" name="id" />
        <label>Nome <input name="nome" type="text" required /></label>
        <div class="field-grid">
          <label>Quantidade <input name="quantidade" type="number" min="0" step="0.01" required /></label>
          <label>Unidade <input name="unidade" type="text" placeholder="ml, un, kg" required /></label>
        </div>
        <label>Estoque minimo <input name="estoque_minimo" type="number" min="0" step="0.01" value="3" required /></label>
        <div class="button-row">
          <button class="secondary-button" type="button" data-reset-product>Limpar</button>
          <button class="primary-button" type="submit">Salvar produto</button>
        </div>
      </form>

      <section class="section-block">
        <div class="section-heading">
          <div>
            <p class="eyebrow">Itens</p>
            <h2>${products.length} cadastrados</h2>
          </div>
        </div>
        ${renderProductList(products)}
      </section>
    </section>
  `

  const form = content.querySelector('#productForm')
  form.onsubmit = async (event) => {
    event.preventDefault()
    const restore = disableWhile(event.submitter)
    const formData = new FormData(form)

    try {
      await saveProduct({
        id: formData.get('id') || null,
        nome: formData.get('nome'),
        quantidade: formData.get('quantidade'),
        unidade: formData.get('unidade'),
        estoque_minimo: formData.get('estoque_minimo')
      })
      showToast('Produto salvo.')
      await renderStock(content)
    } catch (error) {
      showError(error)
    } finally {
      restore()
    }
  }

  content.onclick = async (event) => {
    const button = event.target.closest('button')
    if (!button) return

    if (button.matches('[data-reset-product]')) {
      form.reset()
      form.elements.id.value = ''
      return
    }

    if (button.matches('[data-edit-product]')) {
      const product = products.find((item) => item.id === button.dataset.editProduct)
      if (!product) return
      form.elements.id.value = product.id
      form.elements.nome.value = product.nome
      form.elements.quantidade.value = product.quantidade
      form.elements.unidade.value = product.unidade
      form.elements.estoque_minimo.value = product.estoque_minimo
      form.scrollIntoView({ behavior: 'smooth', block: 'start' })
      return
    }

    if (button.matches('[data-delete-product]')) {
      if (!window.confirm('Excluir produto?')) return
      try {
        await deleteProduct(button.dataset.deleteProduct)
        showToast('Produto removido.')
        await renderStock(content)
      } catch (error) {
        showError(error)
      }
    }
  }
}

function renderProductList(products) {
  if (!products.length) {
    return emptyState('Estoque vazio', 'Cadastre produtos usados nos servicos.')
  }

  return `
    <div class="data-list">
      ${products
        .map((product) => {
          const low = Number(product.quantidade) <= Number(product.estoque_minimo)
          return `
            <article class="data-row ${low ? 'is-alert' : ''}">
              <div>
                <strong>${escapeHtml(product.nome)}</strong>
                <span>${product.quantidade} ${escapeHtml(product.unidade)} | minimo ${product.estoque_minimo}</span>
              </div>
              <div class="button-row">
                ${low ? badge('Estoque baixo', 'danger') : badge('OK', 'success')}
                <button class="secondary-button compact" type="button" data-edit-product="${product.id}">Editar</button>
                <button class="ghost-button compact" type="button" data-delete-product="${product.id}">Excluir</button>
              </div>
            </article>
          `
        })
        .join('')}
    </div>
  `
}

async function renderPlans(content) {
  const plans = await getPlanMetrics()
  content.innerHTML = `
    <section class="crud-layout">
      <form id="planForm" class="section-block form-panel">
        <div class="section-heading">
          <div>
            <p class="eyebrow">Planos</p>
            <h2>Cadastro</h2>
          </div>
        </div>
        <input type="hidden" name="id" />
        <label>Slug <input name="slug" type="text" placeholder="auto-bronze" /></label>
        <label>Nome <input name="nome" type="text" required /></label>
        <div class="field-grid">
          <label>Categoria
            <select name="categoria">
              <option value="carro">Carros</option>
              <option value="moto">Motos</option>
            </select>
          </label>
          <label>Nivel
            <select name="nivel">
              <option value="bronze">Bronze</option>
              <option value="prata">Prata</option>
              <option value="ouro">Ouro</option>
            </select>
          </label>
        </div>
        <div class="field-grid">
          <label>Passeio <input name="preco_passeio" type="number" min="0" step="0.01" /></label>
          <label>SUV <input name="preco_suv" type="number" min="0" step="0.01" /></label>
        </div>
        <div class="field-grid">
          <label>Picape <input name="preco_picape" type="number" min="0" step="0.01" /></label>
          <label>Moto <input name="preco_moto" type="number" min="0" step="0.01" /></label>
        </div>
        <div class="field-grid">
          <label>Prioridade <input name="prioridade" type="number" min="1" max="3" step="1" value="1" required /></label>
          <label>Desconto (%) <input name="desconto_percentual" type="number" min="0" max="100" step="1" value="10" required /></label>
        </div>
        <label>Servicos inclusos <textarea name="servicos" rows="5" required></textarea></label>
        <label>Status
          <select name="ativo">
            <option value="true">Ativo</option>
            <option value="false">Inativo</option>
          </select>
        </label>
        <div class="button-row">
          <button class="secondary-button" type="button" data-reset-plan>Limpar</button>
          <button class="primary-button" type="submit">Salvar plano</button>
        </div>
      </form>

      <section class="section-block">
        <div class="section-heading">
          <div>
            <p class="eyebrow">Metricas</p>
            <h2>Clientes por plano</h2>
          </div>
        </div>
        ${renderPlanMetrics(plans)}
      </section>
    </section>
  `

  const form = content.querySelector('#planForm')
  form.onsubmit = async (event) => {
    event.preventDefault()
    const restore = disableWhile(event.submitter)
    const formData = new FormData(form)

    try {
      await savePlan({
        id: formData.get('id') || null,
        slug: formData.get('slug'),
        nome: formData.get('nome'),
        preco: firstPriceFromForm(formData),
        categoria: formData.get('categoria'),
        nivel: formData.get('nivel'),
        precos: pricesFromForm(formData),
        prioridade: formData.get('prioridade'),
        desconto_percentual: formData.get('desconto_percentual'),
        servicos: parseServiceList(formData.get('servicos')),
        ativo: formData.get('ativo') === 'true'
      })
      showToast('Plano salvo.')
      await renderPlans(content)
    } catch (error) {
      showError(error)
    } finally {
      restore()
    }
  }

  content.onclick = async (event) => {
    const button = event.target.closest('button')
    if (!button) return

    if (button.matches('[data-reset-plan]')) {
      form.reset()
      form.elements.id.value = ''
      return
    }

    if (button.matches('[data-edit-plan]')) {
      const plan = plans.find((item) => item.id === button.dataset.editPlan)
      if (!plan) return
      form.elements.id.value = plan.id
      form.elements.slug.value = plan.slug || ''
      form.elements.nome.value = plan.nome
      form.elements.categoria.value = plan.categoria || 'carro'
      form.elements.nivel.value = plan.nivel || 'bronze'
      form.elements.preco_passeio.value = plan.precos?.passeio ?? plan.preco ?? ''
      form.elements.preco_suv.value = plan.precos?.suv ?? plan.preco ?? ''
      form.elements.preco_picape.value = plan.precos?.picape ?? plan.preco ?? ''
      form.elements.preco_moto.value = plan.precos?.moto ?? plan.preco ?? ''
      form.elements.prioridade.value = plan.prioridade || 1
      form.elements.desconto_percentual.value = plan.desconto_percentual || 0
      form.elements.servicos.value = (plan.servicos || []).join('\n')
      form.elements.ativo.value = String(plan.ativo)
      form.scrollIntoView({ behavior: 'smooth', block: 'start' })
      return
    }

    if (button.matches('[data-delete-plan]')) {
      if (!window.confirm('Excluir plano?')) return
      try {
        await deletePlan(button.dataset.deletePlan)
        showToast('Plano removido.')
        await renderPlans(content)
      } catch (error) {
        showError(error)
      }
    }
  }
}

function renderPlanMetrics(plans) {
  if (!plans.length) {
    return emptyState('Sem planos', 'Crie o primeiro plano para liberar assinaturas.')
  }

  return `
    <div class="data-list">
      ${plans
        .map(
          (plan) => `
            <article class="data-row">
              <div>
                <strong>${escapeHtml(plan.nome)} - ${formatCurrency(plan.preco)}</strong>
                <span>${PLAN_LEVEL_LABELS[plan.nivel] || 'Plano'} | ${plan.categoria === 'moto' ? 'Motos' : 'Carros'} | prioridade ${plan.prioridade || 1} | ${plan.desconto_percentual || 0}% off</span>
                <span>${priceSummary(plan)}</span>
                <span>${plan.clientesAtivos} ativos | ${plan.clientesInativos} inativos</span>
              </div>
              <div class="button-row">
                ${badge(plan.ativo ? 'Ativo' : 'Inativo', plan.ativo ? 'success' : 'neutral')}
                <button class="secondary-button compact" type="button" data-edit-plan="${plan.id}">Editar</button>
                <button class="ghost-button compact" type="button" data-delete-plan="${plan.id}">Excluir</button>
              </div>
            </article>
          `
        )
        .join('')}
    </div>
  `
}

function pricesFromForm(formData) {
  const prices = {}
  const passeio = Number(formData.get('preco_passeio') || 0)
  const suv = Number(formData.get('preco_suv') || 0)
  const picape = Number(formData.get('preco_picape') || 0)
  const moto = Number(formData.get('preco_moto') || 0)

  if (passeio > 0) prices.passeio = passeio
  if (suv > 0) prices.suv = suv
  if (picape > 0) prices.picape = picape
  if (moto > 0) prices.moto = moto

  return prices
}

function firstPriceFromForm(formData) {
  const prices = pricesFromForm(formData)
  return prices.passeio || prices.moto || prices.suv || prices.picape || 0
}

function priceSummary(plan) {
  if (plan.categoria === 'moto') {
    return `${VEHICLE_LABELS.moto}: ${formatCurrency(getPlanPrice(plan, 'moto'))}`
  }

  return ['passeio', 'suv', 'picape']
    .map((type) => `${VEHICLE_LABELS[type]} ${formatCurrency(getPlanPrice(plan, type))}`)
    .join(' | ')
}

async function renderReports(content) {
  const reports = await getReports()
  content.innerHTML = `
    <section class="dashboard-grid">
      <article class="metric-card"><span>Total de servicos</span><strong>${reports.totalServices}</strong><small>Concluidos</small></article>
      <article class="metric-card"><span>Agenda aberta</span><strong>${reports.scheduledServices}</strong><small>Agendados</small></article>
      <article class="metric-card"><span>Clientes ativos</span><strong>${reports.activeClients}</strong><small>Com plano ativo</small></article>
      <article class="metric-card"><span>Estoque baixo</span><strong>${reports.lowStock}</strong><small>Itens em alerta</small></article>
    </section>

    <section class="section-block">
      <div class="section-heading">
        <div>
          <p class="eyebrow">Consumo</p>
          <h2>Produtos usados</h2>
        </div>
      </div>
      ${
        reports.consumption.length
          ? `<div class="data-list">
              ${reports.consumption
                .map(
                  (item) => `
                    <article class="data-row">
                      <div>
                        <strong>${escapeHtml(item.name)}</strong>
                        <span>${item.total} ${escapeHtml(item.unit)}</span>
                      </div>
                    </article>
                  `
                )
                .join('')}
            </div>`
          : emptyState('Sem consumo registrado', 'Produtos aparecem aqui quando servicos forem concluidos.')
      }
    </section>
  `
}

async function openConsumptionModal(appointmentId, refresh) {
  try {
    const products = await listProducts()
    const modal = document.createElement('div')
    modal.className = 'modal-backdrop'
    modal.innerHTML = `
      <div class="modal">
        <form id="consumptionForm">
          <div class="section-heading">
            <div>
              <p class="eyebrow">Conclusao</p>
              <h2>Consumo de produtos</h2>
            </div>
            <button class="ghost-button compact" type="button" data-modal-close>Fechar</button>
          </div>
          ${
            products.length
              ? `<div class="consume-list">
                  ${products
                    .map(
                      (product) => `
                        <label class="consume-row">
                          <span>
                            <strong>${escapeHtml(product.nome)}</strong>
                            <small>${product.quantidade} ${escapeHtml(product.unidade)} em estoque</small>
                          </span>
                          <input name="${product.id}" type="number" min="0" max="${product.quantidade}" step="0.01" value="0" />
                        </label>
                      `
                    )
                    .join('')}
                </div>`
              : emptyState('Sem produtos', 'O servico sera concluido sem baixar estoque.')
          }
          <button class="primary-button full-button" type="submit">Concluir servico</button>
        </form>
      </div>
    `

    document.body.appendChild(modal)
    modal.querySelector('[data-modal-close]').addEventListener('click', () => modal.remove())
    modal.addEventListener('click', (event) => {
      if (event.target === modal) modal.remove()
    })

    modal.querySelector('#consumptionForm').addEventListener('submit', async (event) => {
      event.preventDefault()
      const restore = disableWhile(event.submitter, 'Concluindo...')
      const formData = new FormData(event.currentTarget)
      const items = products.map((product) => ({
        product_id: product.id,
        quantidade: Number(formData.get(product.id) || 0)
      }))

      try {
        await completeAppointment(appointmentId, items)
        showToast('Servico concluido e estoque atualizado.')
        modal.remove()
        refresh()
      } catch (error) {
        showError(error)
      } finally {
        restore()
      }
    })
  } catch (error) {
    showError(error)
  }
}

function countAppointmentsByDay(appointments) {
  const map = new Map()
  for (const item of appointments) {
    map.set(item.data, (map.get(item.data) || 0) + 1)
  }
  return map
}

function groupBy(items, key) {
  const map = new Map()
  for (const item of items) {
    const value = item[key]
    const bucket = map.get(value) || []
    bucket.push(item)
    map.set(value, bucket)
  }
  return map
}
