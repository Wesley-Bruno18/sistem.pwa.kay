import { supabase } from './supabase.js'
import { ensureUserProfile, upsertVehicle } from './db.js'

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
    email,
    password
  })

  if (error) throw error
  return data
}

export async function signUpClient({ name, email, password, plate, model, color, vehicleType }) {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        nome: name,
        tipo: 'cliente',
        placa: plate,
        modelo: model,
        cor: color,
        categoria: vehicleType
      }
    }
  })

  if (error) throw error

  if (data.session?.user) {
    await ensureUserProfile(data.session.user, {
      name,
      tipo: 'cliente'
    })
    await upsertVehicle(data.session.user.id, {
      plate,
      model,
      color,
      vehicleType
    })
  }

  return data
}

export async function signOut() {
  const { error } = await supabase.auth.signOut()
  if (error) throw error
}
