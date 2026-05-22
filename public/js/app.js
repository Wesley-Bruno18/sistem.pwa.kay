import { renderAuthPage, renderPasswordResetPage } from './pages/authPage.js'
import { renderClientDashboard } from './pages/clientDashboard.js'
import { renderAdminDashboard } from './pages/adminDashboard.js'
import { getSession, onAuthChange, signOut } from './services/auth.js'
import { getOrCreateProfile } from './services/db.js'
import { isSupabaseConfigured } from './services/supabase.js'
import { showError, showToast } from './components/toast.js'

const app = document.querySelector('#app')
let passwordRecoveryOpen = false

async function logout() {
  try {
    await signOut()
    showToast('Sessao encerrada.')
    renderAuth()
  } catch (error) {
    showError(error)
  }
}

function renderAuth() {
  passwordRecoveryOpen = false
  renderAuthPage({
    app,
    configured: isSupabaseConfigured()
  })
}

function isPasswordRecoveryUrl() {
  const params = `${window.location.search}${window.location.hash}`
  return params.includes('type=recovery')
}

async function finishPasswordRecovery(options = {}) {
  passwordRecoveryOpen = false
  window.history.replaceState({}, document.title, window.location.pathname)
  await signOut().catch(() => undefined)
  renderAuth()
  if (!options.silent) {
    showToast('Entre com a nova senha.')
  }
}

function renderPasswordRecovery() {
  passwordRecoveryOpen = true
  renderPasswordResetPage({
    app,
    onComplete: finishPasswordRecovery
  })
}

async function routeAuthenticated(session) {
  if (!session?.user) {
    renderAuth()
    return
  }

  try {
    const profile = await getOrCreateProfile(session.user)

    if (profile.tipo === 'admin') {
      renderAdminDashboard({
        app,
        session,
        profile,
        onLogout: logout
      })
      return
    }

    renderClientDashboard({
      app,
      session,
      profile,
      onLogout: logout
    })
  } catch (error) {
    showError(error)
    renderAuth()
  }
}

function registerServiceWorker() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker
      .register('./service-worker.js')
      .then((registration) => registration.update())
      .catch(() => {
        showToast('Modo offline indisponivel neste navegador.', 'warning')
      })
  }
}

function watchConnectivity() {
  document.body.classList.toggle('is-offline', !navigator.onLine)

  window.addEventListener('online', () => {
    document.body.classList.remove('is-offline')
    showToast('Conexao restaurada.')
  })

  window.addEventListener('offline', () => {
    document.body.classList.add('is-offline')
    showToast('Voce esta offline. O app segue aberto com dados em cache.', 'warning')
  })
}

async function boot() {
  registerServiceWorker()
  watchConnectivity()

  onAuthChange((_event, session) => {
    if (_event === 'PASSWORD_RECOVERY') {
      renderPasswordRecovery()
      return
    }

    if (passwordRecoveryOpen || isPasswordRecoveryUrl()) return
    if (session) routeAuthenticated(session)
  })

  try {
    const { session } = await getSession()
    if (session?.user && isPasswordRecoveryUrl()) {
      renderPasswordRecovery()
      return
    }

    await routeAuthenticated(session)
  } catch (error) {
    showError(error)
    renderAuth()
  }
}

boot()
