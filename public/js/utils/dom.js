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
  const previous = button.textContent
  button.disabled = true
  button.textContent = text

  return () => {
    button.disabled = false
    button.textContent = previous
  }
}
