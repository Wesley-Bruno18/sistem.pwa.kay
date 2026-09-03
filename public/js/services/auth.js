import { supabase } from './supabase.js'
import { ensureUserProfile, upsertVehicle } from './db.js'

export const SIGNUP_LOGIN_REDIRECT_KEY = 'auto-glow:signup-login-redirect'

export async function getSession() {
  const { data, error } = await supabase.auth.getSession()
  if (error) throw error
  return data
}

export function onAuthChange(callback) {
  const { data } = supabase.auth.onAuthStateChange(callback)
  return data.subscription
}

export async function signIn({ email, password }) {
  const { data, error } = await supabase.auth.signInWithPassword({
    email: email?.trim().toLowerCase(),
    password
  })

  if (error) throw error
  return data
}

export function getEmailRedirectTo() {
  const baseUrl = window.APP_CONFIG?.appUrl || window.location.href
  const url = new URL(baseUrl, window.location.origin)
  url.hash = ''
  url.search = ''
  return url.toString()
}

export async function signUpClient({ name, email, password, plate, model, color, vehicleType }) {
  const normalizedEmail = email?.trim().toLowerCase()

  const { data, error } = await supabase.auth.signUp({
    email: normalizedEmail,
    password,
    options: {
      emailRedirectTo: getEmailRedirectTo(),
      data: {
        nome: name?.trim(),
        tipo: 'cliente',
        placa: plate?.trim().toUpperCase(),
        modelo: model?.trim(),
        cor: color?.trim() || 'Nao informado',
        categoria: vehicleType
      }
    }
  })

  if (error) {
    if (/already|registered|exists/i.test(error.message || '')) {
      throw new Error('Este email ja esta cadastrado. Entre na conta ou use a recuperacao de senha.')
    }
    throw error
  }

  if (data.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) {
    throw new Error('Este email ja esta cadastrado. Entre na conta ou use a recuperacao de senha.')
  }

  if (data.session?.user) {
    try {
      await ensureUserProfile(data.session.user, {
        name: name?.trim(),
        tipo: 'cliente'
      })
      await upsertVehicle(data.session.user.id, {
        plate: plate?.trim().toUpperCase(),
        model: model?.trim(),
        color: color?.trim() || 'Nao informado',
        vehicleType
      })
    } finally {
      await supabase.auth.signOut().catch(() => undefined)
    }
  }

  return {
    ...data,
    session: null
  }
}

export async function requestPasswordReset(email) {
  const normalizedEmail = email?.trim().toLowerCase()
  if (!normalizedEmail) {
    throw new Error('Informe seu email para receber o link de recuperacao.')
  }

  const { error } = await supabase.auth.resetPasswordForEmail(normalizedEmail, {
    redirectTo: getEmailRedirectTo()
  })

  if (error) throw error
}

export async function updatePassword(password) {
  const { data, error } = await supabase.auth.updateUser({ password })
  if (error) throw error
  return data
}

export async function signOut() {
  const { error } = await supabase.auth.signOut()
  if (error) throw error
}
