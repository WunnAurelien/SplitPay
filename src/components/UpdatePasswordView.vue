<script setup>
import { ref, onMounted } from 'vue'
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

const newPassword = ref('')
const confirmPassword = ref('')
const errorMsg = ref('')
const successMsg = ref('')
const isLoading = ref(false)
const isRecoveryValid = ref(false)
const checkingToken = ref(true)

onMounted(async () => {
  // Récupérer le token depuis l'URL (?token_hash=xxx&type=recovery)
  const tokenHash = route.query.token_hash
  const type = route.query.type

  if (tokenHash && type === 'recovery') {
    // Échanger le token contre une session temporaire
    const { data, error } = await supabase.auth.verifyOtp({
      type: 'recovery',
      token_hash: tokenHash,
    })
    if (error) {
      errorMsg.value = error.message || t('auth.authErrorFallback')
      isRecoveryValid.value = false
    } else {
      isRecoveryValid.value = true
    }
  } else {
    // Vérifier si l'utilisateur a déjà une session de recovery en cours
    const { data: sessionData } = await supabase.auth.getSession()
    if (sessionData?.session?.is_recovery || sessionData?.session) {
      isRecoveryValid.value = true
    } else {
      errorMsg.value = t('auth.authErrorFallback')
      isRecoveryValid.value = false
    }
  }
  checkingToken.value = false
})

const handleUpdatePassword = async () => {
  errorMsg.value = ''
  successMsg.value = ''

  // Validation
  if (newPassword.value.length < 6) {
    errorMsg.value = t('auth.passwordMinLength')
    return
  }
  if (newPassword.value !== confirmPassword.value) {
    errorMsg.value = t('auth.passwordMismatch')
    return
  }

  isLoading.value = true
  try {
    const { data, error } = await supabase.auth.updateUser({
      password: newPassword.value
    })
    if (error) throw error

    // Succès : déconnecter l'utilisateur et rediriger vers la page de connexion
    await supabase.auth.signOut()
    successMsg.value = t('auth.passwordUpdated')

    // Redirection vers /auth après 3 secondes
    setTimeout(() => {
      router.push('/auth')
    }, 3000)
  } catch (err) {
    console.error('Update password error:', err)
    errorMsg.value = err.message || t('auth.authErrorFallback')
  } finally {
    isLoading.value = false
  }
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
          {{ $t('auth.updatePasswordTitle') }}
        </h2>
        <p class="mt-3 text-sm leading-6 text-base-content/70">
          {{ $t('auth.updatePasswordSubtitle') }}
        </p>
      </div>

      <!-- Vérification du token en cours -->
      <div v-if="checkingToken" class="py-8 text-center">
        <span class="loading loading-spinner loading-lg text-primary"></span>
        <p class="mt-4 text-sm text-base-content/70">{{ $t('common.loading') }}</p>
      </div>

      <!-- Token invalide -->
      <div v-else-if="!isRecoveryValid && errorMsg" class="space-y-5">
        <ErrorBanner :error="errorMsg" />
        <BaseButton class="w-full" type="button" variant="primary" @click="router.push('/auth')">
          {{ $t('auth.backToSignIn') }}
        </BaseButton>
      </div>

      <!-- Succès -->
      <div v-else-if="successMsg" class="space-y-5">
        <div class="mx-auto flex h-16 w-16 items-center justify-center rounded-3xl bg-success/15 text-success text-2xl">
          ✓
        </div>
        <h3 class="text-center text-lg font-semibold text-base-content">{{ successMsg }}</h3>
        <p class="text-center text-sm text-base-content/70">{{ $t('auth.backToSignIn') }}</p>
      </div>

      <!-- Formulaire -->
      <template v-else>
        <form @submit.prevent="handleUpdatePassword" class="space-y-4">
          <ErrorBanner v-if="errorMsg" :error="errorMsg" />

          <BaseInput
            type="password"
            id="new-password"
            v-model="newPassword"
            required
            :label="$t('auth.newPasswordLabel')"
            :placeholder="t('auth.newPasswordPlaceholder')"
          />

          <BaseInput
            type="password"
            id="confirm-password"
            v-model="confirmPassword"
            required
            :label="$t('auth.confirmPasswordLabel')"
            :placeholder="t('auth.confirmPasswordPlaceholder')"
          />

          <BaseButton class="w-full" type="submit" variant="primary" :loading="isLoading">
            {{ $t('auth.updatePasswordBtn') }}
          </BaseButton>
        </form>
      </template>
    </BaseCard>
  </div>
</template>

<style scoped>
/* Update password view layout uses Tailwind utilities. */
</style>