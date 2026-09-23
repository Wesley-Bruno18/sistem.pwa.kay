import {
  requestPasswordReset,
  signIn,
  SIGNUP_LOGIN_REDIRECT_KEY,
  signUpClient,
  updatePassword
} from '../services/auth.js'
import {
  clearSupabaseRuntimeConfig,
  saveSupabaseRuntimeConfig,
  SUPABASE_ANON_KEY,
  SUPABASE_URL
} from '../services/supabase.js'
import {
  ArrowLeft,
  ArrowRight,
  CarFront,
  Eye,
  EyeOff,
  LockKeyhole,
  Mail,
  Palette,
  RectangleHorizontal,
  UserRound,
  createIcons
} from 'lucide'
import { showError, showToast } from '../components/toast.js'
import { disableWhile, escapeHtml } from '../utils/dom.js'

export function renderAuthPage({ app, configured }) {
  app.innerHTML = `
    <main class="auth-screen">
      <div class="auth-stage">
        ${renderAuthBrand()}

        <section class="auth-panel" aria-label="Acesso ao Auto Glow Pro">
          ${configured ? '' : renderSetupPanel()}

          <div class="auth-tabs" role="tablist" aria-label="Escolha como acessar">
            <button
              class="auth-tab is-active"
              id="loginTab"
              type="button"
              role="tab"
              aria-controls="loginForm"
              aria-selected="true"
              tabindex="0"
              data-auth-tab="login"
            >Entrar</button>
            <button
              class="auth-tab"
              id="signupTab"
              type="button"
              role="tab"
              aria-controls="signupForm"
              aria-selected="false"
              tabindex="-1"
              data-auth-tab="signup"
            >Criar conta</button>
          </div>

          <form id="loginForm" class="auth-form" role="tabpanel" aria-labelledby="loginTab">
            ${renderInputField({
              id: 'loginEmail',
              label: 'E-mail',
              name: 'email',
              type: 'email',
              autocomplete: 'email',
              placeholder: 'seu@email.com',
              icon: 'mail'
            })}
            ${renderPasswordField({
              id: 'loginPassword',
              label: 'Senha',
              name: 'password',
              autocomplete: 'current-password',
              placeholder: 'Sua senha'
            })}
            <div class="auth-form-link-row">
              <button class="auth-text-button" type="button" id="forgotPassword" ${configured ? '' : 'disabled'}>
                Esqueci a senha?
              </button>
            </div>
            <button class="primary-button auth-submit" type="submit" ${configured ? '' : 'disabled'}>
              <span>Entrar</span>
              <i data-lucide="arrow-right" aria-hidden="true"></i>
            </button>
          </form>

          <form
            id="signupForm"
            class="auth-form is-hidden"
            role="tabpanel"
            aria-labelledby="signupTab"
            aria-hidden="true"
          >
            <div class="field-grid">
              ${renderInputField({
                id: 'signupName',
                label: 'Nome',
                name: 'name',
                type: 'text',
                autocomplete: 'name',
                placeholder: 'Seu nome completo',
                icon: 'user-round'
              })}
              ${renderInputField({
                id: 'signupEmail',
                label: 'E-mail',
                name: 'email',
                type: 'email',
                autocomplete: 'email',
                placeholder: 'seu@email.com',
                icon: 'mail'
              })}
            </div>
            ${renderPasswordField({
              id: 'signupPassword',
              label: 'Senha',
              name: 'password',
              autocomplete: 'new-password',
              placeholder: 'Mínimo de 6 caracteres',
              minlength: 6
            })}
            <div class="field-grid">
              ${renderInputField({
                id: 'signupPlate',
                label: 'Placa',
                name: 'plate',
                type: 'text',
                placeholder: 'ABC1D23',
                icon: 'rectangle-horizontal',
                maxlength: 8,
                autocapitalize: 'characters'
              })}
              ${renderInputField({
                id: 'signupModel',
                label: 'Modelo',
                name: 'model',
                type: 'text',
                placeholder: 'Civic, Corolla...',
                icon: 'car-front'
              })}
            </div>
            <div class="field-grid">
              ${renderInputField({
                id: 'signupColor',
                label: 'Cor (opcional)',
                name: 'color',
                type: 'text',
                placeholder: 'Preto, prata...',
                icon: 'palette',
                required: false
              })}
              <label class="auth-field" for="signupVehicleType">
                <span class="auth-field-label">Tipo do veículo</span>
                <span class="auth-input-wrap">
                  <i data-lucide="car-front" aria-hidden="true"></i>
                  <select id="signupVehicleType" name="vehicleType" required>
                    <option value="" selected disabled>Selecione o tipo</option>
                    <option value="passeio">Carro de passeio</option>
                    <option value="suv">SUV</option>
                    <option value="picape">Picape</option>
                    <option value="moto">Moto</option>
                  </select>
                </span>
              </label>
            </div>
            <button class="primary-button auth-submit" type="submit" ${configured ? '' : 'disabled'}>
              <span>Criar conta</span>
              <i data-lucide="arrow-right" aria-hidden="true"></i>
            </button>
          </form>
        </section>

        ${renderAuthFooter()}
      </div>
    </main>
  `

  renderAuthIcons()
  bindTabs()
  bindPasswordToggles()
  bindAuthForms()
  bindSetupForm()
}

export function renderPasswordResetPage({ app, onComplete }) {
  app.innerHTML = `
    <main class="auth-screen">
      <div class="auth-stage auth-stage-compact">
        ${renderAuthBrand({
          title: 'Nova senha',
          subtitle: 'Defina uma nova senha para acessar sua conta.'
        })}

        <section class="auth-panel" aria-label="Definir nova senha">
          <form id="resetPasswordForm" class="auth-form">
            ${renderPasswordField({
              id: 'resetPassword',
              label: 'Nova senha',
              name: 'password',
              autocomplete: 'new-password',
              placeholder: 'Mínimo de 6 caracteres',
              minlength: 6
            })}
            ${renderPasswordField({
              id: 'confirmPassword',
              label: 'Confirmar senha',
              name: 'confirmPassword',
              autocomplete: 'new-password',
              placeholder: 'Digite novamente',
              minlength: 6
            })}
            <button class="primary-button auth-submit" type="submit">
              <span>Salvar nova senha</span>
              <i data-lucide="arrow-right" aria-hidden="true"></i>
            </button>
            <button class="auth-back-button" type="button" id="backToLogin">
              <i data-lucide="arrow-left" aria-hidden="true"></i>
              <span>Voltar ao login</span>
            </button>
          </form>
        </section>

        ${renderAuthFooter()}
      </div>
    </main>
  `

  renderAuthIcons()
  bindPasswordToggles()

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

function renderAuthBrand({ title = 'Auto Glow', subtitle = 'Gestão inteligente para estética automotiva' } = {}) {
  const isMainBrand = title === 'Auto Glow'

  return `
    <header class="auth-brand">
      <div class="auth-logo" aria-hidden="true">AG</div>
      <h1>${escapeHtml(title)}${isMainBrand ? ' <span>Pro</span>' : ''}</h1>
      <p>${escapeHtml(subtitle)}</p>
    </header>
  `
}

function renderAuthFooter() {
  return `
    <footer class="auth-footer">
      <p>ORGANIZE <span>•</span> CONTROLE <span>•</span> EVOLUA</p>
      <small>Auto Glow • ${new Date().getFullYear()}</small>
    </footer>
  `
}

function renderInputField({
  id,
  label,
  name,
  type,
  autocomplete = '',
  placeholder = '',
  icon,
  required = true,
  minlength,
  maxlength,
  autocapitalize
}) {
  const attributes = [
    `id="${id}"`,
    `name="${name}"`,
    `type="${type}"`,
    autocomplete ? `autocomplete="${autocomplete}"` : '',
    placeholder ? `placeholder="${placeholder}"` : '',
    required ? 'required' : '',
    minlength ? `minlength="${minlength}"` : '',
    maxlength ? `maxlength="${maxlength}"` : '',
    autocapitalize ? `autocapitalize="${autocapitalize}"` : ''
  ].filter(Boolean).join(' ')

  return `
    <label class="auth-field" for="${id}">
      <span class="auth-field-label">${label}</span>
      <span class="auth-input-wrap">
        <i data-lucide="${icon}" aria-hidden="true"></i>
        <input ${attributes} />
      </span>
    </label>
  `
}

function renderPasswordField({ id, label, name, autocomplete, placeholder, minlength = '' }) {
  return `
    <label class="auth-field" for="${id}">
      <span class="auth-field-label">${label}</span>
      <span class="auth-input-wrap auth-password-wrap">
        <i data-lucide="lock-keyhole" aria-hidden="true"></i>
        <input
          id="${id}"
          name="${name}"
          type="password"
          autocomplete="${autocomplete}"
          placeholder="${placeholder}"
          ${minlength ? `minlength="${minlength}"` : ''}
          required
        />
        <button
          class="password-toggle"
          type="button"
          aria-label="Mostrar senha"
          title="Mostrar senha"
          aria-controls="${id}"
          data-password-toggle="${id}"
        >
          <i data-lucide="eye" aria-hidden="true"></i>
        </button>
      </span>
    </label>
  `
}

function renderAuthIcons() {
  createIcons({
    icons: {
      ArrowLeft,
      ArrowRight,
      CarFront,
      Eye,
      EyeOff,
      LockKeyhole,
      Mail,
      Palette,
      RectangleHorizontal,
      UserRound
    }
  })
}

function bindPasswordToggles() {
  document.querySelectorAll('[data-password-toggle]').forEach((button) => {
    button.addEventListener('click', () => {
      const input = document.getElementById(button.dataset.passwordToggle)
      if (!input) return

      const showing = input.type === 'text'
      input.type = showing ? 'password' : 'text'
      button.setAttribute('aria-label', showing ? 'Mostrar senha' : 'Ocultar senha')
      button.title = showing ? 'Mostrar senha' : 'Ocultar senha'
      button.innerHTML = `<i data-lucide="${showing ? 'eye' : 'eye-off'}" aria-hidden="true"></i>`
      renderAuthIcons()
    })
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
    const active = tab.dataset.authTab === selected
    tab.classList.toggle('is-active', active)
    tab.setAttribute('aria-selected', String(active))
    tab.tabIndex = active ? 0 : -1
  })

  const loginForm = document.querySelector('#loginForm')
  const signupForm = document.querySelector('#signupForm')
  loginForm?.classList.toggle('is-hidden', selected !== 'login')
  signupForm?.classList.toggle('is-hidden', selected !== 'signup')
  loginForm?.setAttribute('aria-hidden', String(selected !== 'login'))
  signupForm?.setAttribute('aria-hidden', String(selected !== 'signup'))
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

      sessionStorage.setItem(SIGNUP_LOGIN_REDIRECT_KEY, '1')

      await signUpClient({
        name: payload.name,
        email: payload.email,
        password: payload.password,
        plate: payload.plate,
        model: payload.model,
        color: payload.color,
        vehicleType: payload.vehicleType
      })

      form.reset()
      switchAuthTab('login')

      const loginEmail = document.querySelector('#loginForm input[name="email"]')
      if (loginEmail) {
        loginEmail.value = payload.email
        loginEmail.focus()
      }

      showToast('Cadastro concluido com sucesso. Entre com sua senha para acessar.')
    } catch (error) {
      showError(error)
    } finally {
      sessionStorage.removeItem(SIGNUP_LOGIN_REDIRECT_KEY)
      restore()
    }
  })
}
