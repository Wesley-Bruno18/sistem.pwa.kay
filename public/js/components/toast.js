const toastRoot = document.querySelector('#toast-root')

export function showToast(message, type = 'success') {
  const toast = document.createElement('div')
  toast.className = `toast toast-${type}`
  toast.textContent = message
  toastRoot.appendChild(toast)

  window.setTimeout(() => {
    toast.classList.add('toast-leaving')
    window.setTimeout(() => toast.remove(), 220)
  }, 4200)
}

export function showError(error) {
  showToast(error?.message || 'Nao foi possivel concluir a acao.', 'error')
}
