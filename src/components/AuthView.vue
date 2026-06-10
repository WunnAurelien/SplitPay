<script setup>
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useSupabase } from '../supabase'
import { actions } from '../store'
import BaseButton from './ui/BaseButton.vue'
import BaseCard from './ui/BaseCard.vue'
import BaseInput from './ui/BaseInput.vue'
import ErrorBanner from './ui/ErrorBanner.vue'

const router = useRouter()
const { t } = useI18n()
const { supabase } = useSupabase()
const isLogin = ref(true)
const email = ref('')
const password = ref('')
const username = ref('')
const paymentLink = ref('')
const errorMsg = ref('')
const successMsg = ref('')
const isLoading = ref(false)

const handleAuth = async () => {
  errorMsg.value = ''
  successMsg.value = ''
  
  if (!isLogin.value) {
    const pLink = paymentLink.value.trim()
    if (pLink && !pLink.includes('paypal.me') && !pLink.includes('paypal.com')) {
      errorMsg.value = t('auth.paymentLinkInvalid')
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
      
      // Successfully logged in
      await actions.initialize()
      router.push('/')
    } else {
      const { data, error } = await supabase.auth.signUp({
        email: email.value,
        password: password.value,
        options: {
          data: {
            username: username.value,
            payment_link: paymentLink.value
          }
        }
      })
      if (error) throw error
      
      // En fonction de la configuration Supabase, la session peut être renvoyée immédiatement ou être nulle (si validation d'e-mail obligatoire)
      if (data?.session) {
        // Session immédiate
        await actions.initialize()
        router.push('/settings')
      } else {
        // Confirmation d'email requise
        successMsg.value = t('auth.signUpSuccessConfirm')
        // Optionnel : Réinitialiser les champs du formulaire d'inscription
        email.value = ''
        password.value = ''
        username.value = ''
        paymentLink.value = ''
      }
    }
  } catch (err) {
    console.error('Auth error:', err)
    errorMsg.value = err.message || t('auth.authErrorFallback')
  } finally {
    isLoading.value = false
  }
}

const toggleMode = () => {
  isLogin.value = !isLogin.value
  errorMsg.value = ''
  successMsg.value = ''
}

const goToLoginAfterSignUp = () => {
  isLogin.value = true
  successMsg.value = ''
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
        <h2 class="text-3xl font-semibold tracking-tight text-base-content">
          {{ isLogin ? $t('auth.signInTitle') : $t('auth.signUpTitle') }}
        </h2>
        <p class="mt-3 text-sm leading-6 text-base-content/70">
          {{ isLogin ? $t('auth.signInSubtitle') : $t('auth.signUpSubtitle') }}
        </p>
      </div>

      <div v-if="successMsg" class="space-y-5">
        <div class="mx-auto flex h-16 w-16 items-center justify-center rounded-3xl bg-success/15 text-success text-2xl">
          ✉️
        </div>
        <h3 class="text-center text-lg font-semibold text-base-content">{{ successMsg }}</h3>
        <BaseButton class="w-full" type="button" variant="primary" @click="goToLoginAfterSignUp">
          {{ $t('auth.signInBtn') }}
        </BaseButton>
      </div>

      <template v-else>
        <form @submit.prevent="handleAuth" class="space-y-4">
          <ErrorBanner v-if="errorMsg" :error="errorMsg" />

          <BaseInput
            type="email"
            id="email"
            v-model="email"
            required
            :label="$t('auth.emailLabel')"
            :placeholder="t('auth.emailPlaceholder')"
          />

          <BaseInput
            type="password"
            id="password"
            v-model="password"
            required
            :label="$t('auth.passwordLabel')"
            placeholder="••••••••"
          />

          <template v-if="!isLogin">
            <BaseInput
              type="text"
              id="username"
              v-model="username"
              required
              :label="$t('auth.displayNameLabel')"
              :placeholder="t('auth.displayNamePlaceholder')"
            />

            <BaseInput
              type="url"
              id="payment-link"
              v-model="paymentLink"
              :label="$t('auth.paymentLinkLabel')"
              :placeholder="t('auth.paymentLinkPlaceholder')"
            />
            <p class="mt-1 text-sm text-base-content/60">{{ $t('auth.paymentLinkHint') }}</p>
          </template>

          <BaseButton class="w-full" type="submit" variant="primary" :loading="isLoading">
            <span>{{ isLogin ? $t('auth.signInBtn') : $t('auth.signUpBtn') }}</span>
          </BaseButton>
        </form>

        <div class="mt-6 text-center text-sm text-base-content/70">
          <p>
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
