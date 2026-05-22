import { requestPasswordReset, signIn, signUpClient, updatePassword } from '../services/auth.js'
import {
  clearSupabaseRuntimeConfig,
  saveSupabaseRuntimeConfig,
  SUPABASE_ANON_KEY,
  SUPABASE_URL
} from '../services/supabase.js'
import { showError, showToast } from '../components/toast.js'
import { brand } from '../components/layout.js'
import { disableWhile, escapeHtml } from '../utils/dom.js'

export function renderAuthPage({ app, configured }) {
  app.innerHTML = `
    <main class="auth-screen">
      <section class="auth-hero">
        ${brand()}
        <div>
          <p class="eyebrow">PWA Supabase</p>
          <h1>Gestao premium para estetica automotiva</h1>
          <p class="hero-copy">
            Agenda inteligente, planos, estoque e relatorios em uma interface rapida para celular e desktop.
          </p>
        </div>
        <div class="hero-metrics">
          <span><strong>1h20</strong> Servicos</span>
          <span><strong>1</strong> Vaga por horario</span>
          <span><strong>Offline</strong> Parcial</span>
        </div>
      </section>

      <section class="auth-panel">
        ${configured ? '' : renderSetupPanel()}

        <div class="auth-tabs" role="tablist">
          <button class="auth-tab is-active" type="button" data-auth-tab="login">Login</button>
          <button class="auth-tab" type="button" data-auth-tab="signup">Cadastro</button>
        </div>

        <form id="loginForm" class="auth-form">
          <label>
            Email
            <input name="email" type="email" autocomplete="email" required />
          </label>
          <label>
            Senha
            <input name="password" type="password" autocomplete="current-password" required />
          </label>
          <button class="primary-button" type="submit" ${configured ? '' : 'disabled'}>Entrar</button>
          <button class="ghost-button full-button" type="button" id="forgotPassword" ${configured ? '' : 'disabled'}>Recuperar senha</button>
        </form>

        <form id="signupForm" class="auth-form is-hidden">
          <div class="field-grid">
            <label>
              Nome
              <input name="name" type="text" autocomplete="name" required />
            </label>
            <label>
              Email
              <input name="email" type="email" autocomplete="email" required />
            </label>
          </div>
          <label>
            Senha
            <input name="password" type="password" autocomplete="new-password" minlength="6" required />
          </label>
          <div class="field-grid">
            <label>
              Placa
              <input name="plate" type="text" maxlength="8" placeholder="ABC1D23" required />
            </label>
            <label>
              Modelo
              <input name="model" type="text" placeholder="Civic, Corolla..." required />
            </label>
          </div>
          <label>
            Cor
            <input name="color" type="text" placeholder="Preto, prata... (opcional)" />
          </label>
          <label>
            Tipo do veiculo
            <select name="vehicleType" required>
              <option value="" selected disabled>Selecione o tipo</option>
              <option value="passeio">Carro de passeio</option>
              <option value="suv">SUV</option>
              <option value="picape">Picape</option>
              <option value="moto">Moto</option>
            </select>
          </label>
          <button class="primary-button" type="submit" ${configured ? '' : 'disabled'}>Criar conta</button>
        </form>
      </section>
    </main>
  `

  bindTabs()
  bindAuthForms()
  bindSetupForm()
}

export function renderPasswordResetPage({ app, onComplete }) {
  app.innerHTML = `
    <main class="auth-screen">
      <section class="auth-hero">
        ${brand()}
        <div>
          <p class="eyebrow">Seguranca</p>
          <h1>Nova senha de acesso</h1>
          <p class="hero-copy">
            Defina uma nova senha para voltar ao painel com seguranca.
          </p>
        </div>
        <div class="hero-metrics">
          <span><strong>Email</strong> Validado</span>
          <span><strong>Conta</strong> Protegida</span>
          <span><strong>PWA</strong> Online</span>
        </div>
      </section>

      <section class="auth-panel">
        <form id="resetPasswordForm" class="auth-form">
          <label>
            Nova senha
            <input name="password" type="password" autocomplete="new-password" minlength="6" required />
          </label>
          <label>
            Confirmar senha
            <input name="confirmPassword" type="password" autocomplete="new-password" minlength="6" required />
          </label>
          <button class="primary-button" type="submit">Salvar nova senha</button>
          <button class="secondary-button" type="button" id="backToLogin">Voltar ao login</button>
        </form>
      </section>
    </main>
  `

  document.querySelector('#resetPasswordForm')?.addEventListener('submit', async (event) => {
    event.preventDefault()
    const form = event.currentTarget
    const formData = new FormData(form)
    const password = String(formData.get('password') || '')
    const confirmPassword = String(formData.get('confirmPassword') || '')

    if (password !== confirmPassword) {
      showToast('As senhas precisam ser iguais.', 'warning')
      return
    }

    const restore = disableWhile(event.submitter, 'Salvando...')

    try {
      await updatePassword(password)
      form.reset()
      showToast('Senha atualizada com sucesso.')
      await onComplete?.()
    } catch (error) {
      showError(error)
    } finally {
      restore()
    }
  })

  document.querySelector('#backToLogin')?.addEventListener('click', async () => {
    await onComplete?.({ silent: true })
  })
}

function renderSetupPanel() {
  const savedUrl = SUPABASE_URL.includes('YOUR-PROJECT') ? '' : SUPABASE_URL
  const savedAnonKey = SUPABASE_ANON_KEY.includes('YOUR_SUPABASE') ? '' : SUPABASE_ANON_KEY

  return `
    <form id="setupForm" class="setup-panel">
      <strong>Conectar Supabase</strong>
      <label>
        SUPABASE_URL
        <input name="url" type="url" value="${escapeHtml(savedUrl)}" placeholder="https://seu-projeto.supabase.co" required />
      </label>
      <label>
        SUPABASE_ANON_KEY
        <input name="anonKey" type="password" value="${escapeHtml(savedAnonKey)}" required />
      </label>
      <div class="button-row">
        <button class="secondary-button" type="button" id="clearSetup">Limpar</button>
        <button class="primary-button" type="submit">Salvar</button>
      </div>
    </form>
  `
}

function bindTabs() {
  document.querySelectorAll('[data-auth-tab]').forEach((button) => {
    button.addEventListener('click', () => {
      const selected = button.dataset.authTab
      const current = document.querySelector('[data-auth-tab].is-active')?.dataset.authTab
      if (current === selected) return

      resetAuthForms()
      switchAuthTab(selected)
    })
  })
}

function switchAuthTab(selected) {
  document.querySelectorAll('[data-auth-tab]').forEach((tab) => {
    tab.classList.toggle('is-active', tab.dataset.authTab === selected)
  })

  document.querySelector('#loginForm')?.classList.toggle('is-hidden', selected !== 'login')
  document.querySelector('#signupForm')?.classList.toggle('is-hidden', selected !== 'signup')
}

function resetAuthForms() {
  document.querySelector('#loginForm')?.reset()
  document.querySelector('#signupForm')?.reset()
}

function bindSetupForm() {
  const form = document.querySelector('#setupForm')
  if (!form) return

  form.addEventListener('submit', (event) => {
    event.preventDefault()
    const formData = new FormData(form)
    saveSupabaseRuntimeConfig({
      url: formData.get('url'),
      anonKey: formData.get('anonKey')
    })
    showToast('Configuracao salva. Recarregando app...')
    window.setTimeout(() => window.location.reload(), 700)
  })

  document.querySelector('#clearSetup')?.addEventListener('click', () => {
    clearSupabaseRuntimeConfig()
    window.location.reload()
  })
}

function bindAuthForms() {
  document.querySelector('#loginForm')?.addEventListener('submit', async (event) => {
    event.preventDefault()
    const button = event.submitter
    const restore = disableWhile(button, 'Entrando...')

    try {
      const formData = new FormData(event.currentTarget)
      await signIn({
        email: formData.get('email'),
        password: formData.get('password')
      })
      showToast('Login realizado.')
    } catch (error) {
      showError(error)
    } finally {
      restore()
    }
  })

  document.querySelector('#forgotPassword')?.addEventListener('click', async () => {
    const emailInput = document.querySelector('#loginForm input[name="email"]')
    const email = emailInput?.value?.trim()

    if (!email) {
      emailInput?.focus()
      showToast('Digite seu email para receber o link de recuperacao.', 'warning')
      return
    }

    const restore = disableWhile(document.querySelector('#forgotPassword'), 'Enviando...')

    try {
      await requestPasswordReset(email)
      document.querySelector('#loginForm')?.reset()
      showToast('Link de recuperacao enviado para seu email.')
    } catch (error) {
      showError(error)
    } finally {
      restore()
    }
  })

  document.querySelector('#signupForm')?.addEventListener('submit', async (event) => {
    event.preventDefault()
    const form = event.currentTarget
    if (!form.checkValidity()) {
      form.reportValidity()
      return
    }

    const button = event.submitter
    const restore = disableWhile(button, 'Criando...')

    try {
      const formData = new FormData(form)
      const payload = {
        name: String(formData.get('name') || '').trim(),
        email: String(formData.get('email') || '').trim().toLowerCase(),
        password: String(formData.get('password') || ''),
        plate: String(formData.get('plate') || '').trim().toUpperCase(),
        model: String(formData.get('model') || '').trim(),
        color: String(formData.get('color') || '').trim(),
        vehicleType: String(formData.get('vehicleType') || '').trim()
      }

      if (!payload.name || !payload.email || !payload.password || !payload.plate || !payload.model || !payload.vehicleType) {
        throw new Error('Preencha todos os campos obrigatorios do cadastro.')
      }

      const result = await signUpClient({
        name: payload.name,
        email: payload.email,
        password: payload.password,
        plate: payload.plate,
        model: payload.model,
        color: payload.color,
        vehicleType: payload.vehicleType
      })

      form.reset()

      if (result.session) {
        showToast('Cadastro concluido com sucesso.')
      } else {
        showToast('Cadastro concluido com sucesso. Confirme o email antes do primeiro acesso.')
      }
    } catch (error) {
      showError(error)
    } finally {
      restore()
    }
  })
}
