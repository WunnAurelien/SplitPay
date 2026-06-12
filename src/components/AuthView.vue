<script setup>
import { ref } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useSupabase } from '../supabase'
import { actions } from '../store'
import BaseButton from './ui/BaseButton.vue'
import BaseCard from './ui/BaseCard.vue'
import BaseInput from './ui/BaseInput.vue'
import ErrorBanner from './ui/ErrorBanner.vue'

const router = useRouter()
const route = useRoute()
const { t } = useI18n()
const { supabase } = useSupabase()
const isLogin = ref(true)
const showReset = ref(false)
const email = ref('')
const password = ref('')
const confirmPassword = ref('')
const username = ref('')
const paymentLink = ref('')
const errorMsg = ref('')
const successMsg = ref('')
const isLoading = ref(false)

const getTranslationAuthError = (err) => {
  if (!err) return ''
  const msg = err.message || ''
  
  if (msg.includes('Invalid login credentials') || msg.includes('invalid_credentials') || msg.includes('invalid_grant')) {
    return t('auth.invalidCredentials')
  }
  if (msg.includes('User already exists') || msg.includes('already registered')) {
    return t('auth.userAlreadyExists')
  }
  if (msg.includes('Email not confirmed') || msg.includes('Email signup is disabled') || msg.includes('email_not_confirmed')) {
    return t('auth.emailNotConfirmed')
  }
  if (msg.includes('Password should be at least 6 characters') || msg.includes('Password is too short')) {
    return t('auth.passwordMinLength')
  }
  
  return msg || t('auth.authErrorFallback')
}

const handleAuth = async () => {
  errorMsg.value = ''
  successMsg.value = ''
  
  if (showReset.value) {
    // Mode réinitialisation de mot de passe
    isLoading.value = true
    try {
      const { data, error } = await supabase.auth.resetPasswordForEmail(email.value, {
        redirectTo: window.location.origin + '/SplitPay/'
      })
      if (error) throw error
      successMsg.value = t('auth.resetPasswordSuccess')
      email.value = ''
    } catch (err) {
      console.error('Reset password error:', err)
      errorMsg.value = getTranslationAuthError(err)
    } finally {
      isLoading.value = false
    }
    return
  }

  // Client-side validation for signup
  if (!isLogin.value) {
    if (password.value.length < 6) {
      errorMsg.value = t('auth.passwordMinLength')
      return
    }
    if (password.value !== confirmPassword.value) {
      errorMsg.value = t('auth.passwordMismatch')
      return
    }
  }

  isLoading.value = true
  
  try {
    if (isLogin.value) {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: email.value,
        password: password.value
      })
      if (error) throw error
      
      // Successfully logged in — redirect to original destination if one was saved
      await actions.initialize()
      const redirect = route.query.redirect
      router.push(redirect || '/')
    } else {
      const { data, error } = await supabase.auth.signUp({
        email: email.value,
        password: password.value,
        options: {
          data: {
            username: username.value,
            payment_link: paymentLink.value,
            locale: locale.value
          }
        }
      })
      if (error) throw error
      
      // En fonction de la configuration Supabase, la session peut être renvoyée immédiatement ou être nulle (si validation d'e-mail obligatoire)
      if (data?.session) {
        // Session immédiate
        await actions.initialize()
        const redirect = route.query.redirect
        router.push(redirect || '/settings')
      } else {
        // Confirmation d'email requise
        successMsg.value = t('auth.signUpSuccessConfirm')
        // Optionnel : Réinitialiser les champs du formulaire d'inscription
        email.value = ''
        password.value = ''
        confirmPassword.value = ''
        username.value = ''
        paymentLink.value = ''
      }
    }
  } catch (err) {
    console.error('Auth error:', err)
    errorMsg.value = getTranslationAuthError(err)
  } finally {
    isLoading.value = false
  }
}

const toggleMode = () => {
  isLogin.value = !isLogin.value
  showReset.value = false
  errorMsg.value = ''
  successMsg.value = ''
  confirmPassword.value = ''
}

const toggleReset = () => {
  showReset.value = !showReset.value
  errorMsg.value = ''
  successMsg.value = ''
  confirmPassword.value = ''
}

const goToLoginAfterSignUp = () => {
  isLogin.value = true
  successMsg.value = ''
  confirmPassword.value = ''
}
</script>

<template>
  <div class="relative flex min-h-[calc(100vh-120px)] items-center justify-center px-4 py-10">
    <div class="pointer-events-none absolute -top-12 left-1/2 h-56 w-56 -translate-x-1/2 rounded-full bg-purple-500/10 blur-3xl" />
    <div class="pointer-events-none absolute -bottom-12 right-8 h-48 w-48 rounded-full bg-cyan-400/10 blur-3xl" />

    <BaseCard class="w-full max-w-lg p-6 sm:p-8">
      <div class="text-center mb-8">
        <div class="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-3xl bg-gradient-to-br from-primary to-secondary text-xl font-bold text-white">
          S
        </div>

        <!-- Titre: Reset password -->
        <template v-if="showReset">
          <h2 class="text-3xl font-semibold tracking-tight text-base-content">
            {{ $t('auth.resetPasswordTitle') }}
          </h2>
          <p class="mt-3 text-sm leading-6 text-base-content/70">
            {{ $t('auth.resetPasswordSubtitle') }}
          </p>
        </template>

        <!-- Titre: Login / Signup standard -->
        <template v-else>
          <h2 class="text-3xl font-semibold tracking-tight text-base-content">
            {{ isLogin ? $t('auth.signInTitle') : $t('auth.signUpTitle') }}
          </h2>
          <p class="mt-3 text-sm leading-6 text-base-content/70">
            {{ isLogin ? $t('auth.signInSubtitle') : $t('auth.signUpSubtitle') }}
          </p>
        </template>
      </div>

      <!-- Message de succès (email envoyé, inscription confirmée) -->
      <div v-if="successMsg && !showReset" class="space-y-5">
        <div class="mx-auto flex h-16 w-16 items-center justify-center rounded-3xl bg-success/15 text-success text-2xl">
          ✉️
        </div>
        <h3 class="text-center text-lg font-semibold text-base-content">{{ successMsg }}</h3>
        <BaseButton class="w-full" type="button" variant="primary" @click="goToLoginAfterSignUp">
          {{ $t('auth.signInBtn') }}
        </BaseButton>
      </div>

      <!-- Message de succès pour le reset password uniquement -->
      <div v-if="successMsg && showReset" class="space-y-5">
        <div class="mx-auto flex h-16 w-16 items-center justify-center rounded-3xl bg-success/15 text-success text-2xl">
          ✉️
        </div>
        <h3 class="text-center text-lg font-semibold text-base-content">{{ successMsg }}</h3>
        <BaseButton class="w-full" type="button" variant="primary" @click="toggleReset">
          {{ $t('auth.backToSignIn') }}
        </BaseButton>
      </div>

      <!-- Formulaire -->
      <template v-else-if="!successMsg">
        <form @submit.prevent="handleAuth" class="space-y-4">
          <ErrorBanner v-if="errorMsg" :error="errorMsg" />

          <!-- Email (toujours requis) -->
          <BaseInput
            type="email"
            id="email"
            v-model="email"
            required
            :label="$t('auth.emailLabel')"
            :placeholder="t('auth.emailPlaceholder')"
          />

          <!-- Password (caché en mode reset) -->
          <BaseInput
            v-if="!showReset"
            type="password"
            id="password"
            v-model="password"
            required
            :label="$t('auth.passwordLabel')"
            placeholder="••••••••"
          />

          <!-- Confirm Password (uniquement en mode inscription) -->
          <BaseInput
            v-if="!isLogin && !showReset"
            type="password"
            id="confirm-password"
            v-model="confirmPassword"
            required
            :label="$t('auth.confirmPasswordLabel')"
            :placeholder="t('auth.confirmPasswordPlaceholder') || '••••••••'"
          />

          <!-- Champs d'inscription -->
          <template v-if="!isLogin && !showReset">
            <BaseInput
              type="text"
              id="username"
              v-model="username"
              required
              :label="$t('auth.displayNameLabel')"
              :placeholder="t('auth.displayNamePlaceholder')"
            />

          </template>

          <!-- Bouton submit -->
          <BaseButton class="w-full" type="submit" variant="primary" :loading="isLoading">
            <span v-if="showReset">{{ $t('auth.resetPasswordBtn') }}</span>
            <span v-else>{{ isLogin ? $t('auth.signInBtn') : $t('auth.signUpBtn') }}</span>
          </BaseButton>
        </form>

        <!-- Liens de navigation -->
        <div class="mt-6 space-y-3 text-center text-sm text-base-content/70">
          <!-- Mot de passe oublié (visible uniquement en mode login) -->
          <p v-if="isLogin && !showReset">
            <button type="button" class="text-primary hover:underline" @click="toggleReset">
              {{ $t('auth.forgotPassword') }}
            </button>
          </p>

          <!-- Retour à la connexion (visible en mode reset) -->
          <p v-if="showReset">
            <button type="button" class="text-primary hover:underline" @click="toggleReset">
              {{ $t('auth.backToSignIn') }}
            </button>
          </p>

          <!-- Bascule Login / Signup (caché en mode reset) -->
          <p v-if="!showReset">
            {{ isLogin ? $t('auth.noAccount') : $t('auth.hasAccount') }}
            <button type="button" class="btn btn-ghost btn-sm normal-case text-primary hover:underline" @click="toggleMode">
              {{ isLogin ? $t('auth.signUpBtn') : $t('auth.signInBtn') }}
            </button>
          </p>
        </div>
      </template>
    </BaseCard>
  </div>
</template>


<style scoped>
/* Auth view layout uses Tailwind utilities. */
</style>
