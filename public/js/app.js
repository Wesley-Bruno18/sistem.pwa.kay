import { renderAuthPage } from './pages/authPage.js'
import { renderClientDashboard } from './pages/clientDashboard.js'
import { renderAdminDashboard } from './pages/adminDashboard.js'
import { getSession, onAuthChange, signOut } from './services/auth.js'
import { getOrCreateProfile } from './services/db.js'
import { isSupabaseConfigured } from './services/supabase.js'
import { showError, showToast } from './components/toast.js'

const app = document.querySelector('#app')

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
  renderAuthPage({
    app,
    configured: isSupabaseConfigured()
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
    if (session) routeAuthenticated(session)
  })

  try {
    const { session } = await getSession()
    await routeAuthenticated(session)
  } catch (error) {
    showError(error)
    renderAuth()
  }
}

boot()
