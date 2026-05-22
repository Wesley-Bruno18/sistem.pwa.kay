export const BUSINESS_START = 8 * 60
export const BUSINESS_END = 17 * 60
export const LUNCH_START = 12 * 60
export const LUNCH_END = 13 * 60
export const SLOT_DURATION = 80
export const SCHEDULE_SLOT_STARTS = [
  8 * 60,
  9 * 60 + 20,
  10 * 60 + 40,
  13 * 60,
  14 * 60 + 20,
  15 * 60 + 40
]

export function parseDate(value) {
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [year, month, day] = value.split('-').map(Number)
    return new Date(year, month - 1, day)
  }

  return new Date(value)
}

export function pad(value) {
  return String(value).padStart(2, '0')
}

export function toDateKey(date) {
  const value = parseDate(date)
  return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}`
}

export function todayKey() {
  return toDateKey(new Date())
}

export function addDays(date, amount) {
  const next = parseDate(date)
  next.setDate(next.getDate() + amount)
  return next
}

export function getWeekStart(date = new Date()) {
  const value = parseDate(date)
  const day = value.getDay()
  const diff = day === 0 ? -6 : 1 - day
  return addDays(value, diff)
}

export function getWeekDays(startDate) {
  return Array.from({ length: 7 }, (_, index) => addDays(startDate, index))
}

export function monthBounds(date) {
  const value = parseDate(date)
  const start = new Date(value.getFullYear(), value.getMonth(), 1)
  const end = new Date(value.getFullYear(), value.getMonth() + 1, 0)
  return { start, end }
}

export function getMonthGrid(date) {
  const { start, end } = monthBounds(date)
  const gridStart = addDays(start, -((start.getDay() + 6) % 7))
  const days = []

  for (let index = 0; index < 42; index += 1) {
    const day = addDays(gridStart, index)
    days.push({
      date: day,
      key: toDateKey(day),
      inMonth: day.getMonth() === start.getMonth(),
      isToday: toDateKey(day) === todayKey()
    })
  }

  return { days, start, end }
}

export function formatDisplayDate(date, options = {}) {
  return new Intl.DateTimeFormat('pt-BR', options).format(parseDate(date))
}

export function formatCurrency(value) {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL'
  }).format(Number(value || 0))
}

export function formatTime(value) {
  if (!value) return ''
  const [hour, minute] = String(value).split(':')
  return `${pad(hour)}:${pad(minute || '00')}`
}

export function minutesToTime(minutes) {
  return `${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}`
}

export function timeToMinutes(value) {
  const [hour, minute] = formatTime(value).split(':').map(Number)
  return hour * 60 + minute
}

export function isValidScheduleSlot(value) {
  return SCHEDULE_SLOT_STARTS.includes(timeToMinutes(value))
}

export function slotEndTime(value) {
  return minutesToTime(timeToMinutes(value) + SLOT_DURATION)
}

export function formatSlotRange(value) {
  const start = formatTime(value)
  if (!start) return ''
  return `${start} - ${slotEndTime(start)}`
}

export function slotsForDay(date) {
  const day = parseDate(date).getDay()
  if (day === 0) return []

  return SCHEDULE_SLOT_STARTS.map(minutesToTime)
}

export function statusLabel(status) {
  const labels = {
    agendado: 'Agendado',
    concluido: 'Concluido',
    cancelado: 'Cancelado',
    ativo: 'Ativo',
    inativo: 'Inativo'
  }

  return labels[status] || status
}
