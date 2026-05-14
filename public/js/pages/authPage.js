import { signIn, signUpClient } from '../services/auth.js'
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
          <span><strong>30 min</strong> Intervalos</span>
          <span><strong>2</strong> Vagas por horario</span>
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
            <input name="color" type="text" placeholder="Preto, prata..." required />
          </label>
          <label>
            Tipo do veiculo
            <select name="vehicleType" required>
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
      document.querySelectorAll('[data-auth-tab]').forEach((tab) => {
        tab.classList.toggle('is-active', tab.dataset.authTab === selected)
      })

      document.querySelector('#loginForm').classList.toggle('is-hidden', selected !== 'login')
      document.querySelector('#signupForm').classList.toggle('is-hidden', selected !== 'signup')
    })
  })
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

  document.querySelector('#signupForm')?.addEventListener('submit', async (event) => {
    event.preventDefault()
    const button = event.submitter
    const restore = disableWhile(button, 'Criando...')

    try {
      const formData = new FormData(event.currentTarget)
      const result = await signUpClient({
        name: formData.get('name'),
        email: formData.get('email'),
        password: formData.get('password'),
        plate: formData.get('plate'),
        model: formData.get('model'),
        color: formData.get('color'),
        vehicleType: formData.get('vehicleType')
      })

      if (result.session) {
        showToast('Conta criada com sucesso.')
      } else {
        showToast('Cadastro criado. Confirme o email antes do primeiro acesso.', 'warning')
      }
    } catch (error) {
      showError(error)
    } finally {
      restore()
    }
  })
}
