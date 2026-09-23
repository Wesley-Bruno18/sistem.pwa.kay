export function escapeHtml(value = '') {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;')
}

export function parseServiceList(value = '') {
  return String(value)
    .split(/\n|,/)
    .map((item) => item.trim())
    .filter(Boolean)
}

export function disableWhile(button, text = 'Salvando...') {
  if (!button) return () => undefined

  const previous = button.innerHTML
  button.disabled = true
  button.setAttribute('aria-busy', 'true')
  button.textContent = text

  return () => {
    button.disabled = false
    button.removeAttribute('aria-busy')
    button.innerHTML = previous
  }
}
