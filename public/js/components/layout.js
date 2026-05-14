import { escapeHtml } from '../utils/dom.js'

export function brand() {
  return `
    <div class="brand">
      <span class="brand-mark">AG</span>
      <span>
        <strong>Auto Glow</strong>
        <small>Pro</small>
      </span>
    </div>
  `
}

export function topbar({ profile, onLogoutId = 'logoutButton' }) {
  return `
    <header class="topbar">
      ${brand()}
      <div class="topbar-actions">
        <span class="user-pill">${escapeHtml(profile?.nome || 'Usuario')}</span>
        <button class="icon-button" id="${onLogoutId}" type="button" title="Sair">Sair</button>
      </div>
    </header>
  `
}

export function emptyState(title, text) {
  return `
    <div class="empty-state">
      <strong>${title}</strong>
      <p>${text}</p>
    </div>
  `
}

export function badge(text, tone = 'neutral') {
  return `<span class="badge badge-${tone}">${text}</span>`
}
