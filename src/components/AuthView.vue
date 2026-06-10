<script setup>
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { supabase } from '../supabase'
import { actions } from '../store'
import BaseButton from './ui/BaseButton.vue'
import BaseCard from './ui/BaseCard.vue'
import BaseInput from './ui/BaseInput.vue'
import ErrorBanner from './ui/ErrorBanner.vue'

const router = useRouter()
const { t } = useI18n()
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
  <div class="auth-page">
    <div class="glow-sphere purple"></div>
    <div class="glow-sphere cyan"></div>

    <BaseCard class="auth-card">
      <div class="auth-header">
        <div class="logo-icon">S</div>
        <h2>{{ isLogin ? $t('auth.signInTitle') : $t('auth.signUpTitle') }}</h2>
        <p class="auth-tagline">{{ isLogin ? $t('auth.signInSubtitle') : $t('auth.signUpSubtitle') }}</p>
      </div>

      <div v-if="successMsg" class="auth-success-state">
        <div class="success-icon">✉️</div>
        <h3>{{ successMsg }}</h3>
        <BaseButton type="button" variant="primary" style="margin-top: 24px; width: 100%;" @click="goToLoginAfterSignUp">
          {{ $t('auth.signInBtn') }}
        </BaseButton>
      </div>

      <template v-else>
        <form @submit.prevent="handleAuth" class="auth-form">
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

          <!-- Registration Fields -->
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
            <span class="field-hint" style="margin-top: -14px; margin-bottom: 20px;">{{ $t('auth.paymentLinkHint') }}</span>
          </template>

          <BaseButton type="submit" variant="primary" class="auth-submit" :loading="isLoading">
            <span>{{ isLogin ? $t('auth.signInBtn') : $t('auth.signUpBtn') }}</span>
          </BaseButton>
        </form>

        <div class="auth-footer">
          <p>
            {{ isLogin ? $t('auth.noAccount') : $t('auth.hasAccount') }}
            <button type="button" class="btn-link" @click="toggleMode">
              {{ isLogin ? $t('auth.signUpBtn') : $t('auth.signInBtn') }}
            </button>
          </p>
        </div>
      </template>
    </BaseCard>
  </div>
</template>


<style scoped>
.auth-page {
  display: flex;
  justify-content: center;
  align-items: center;
  min-height: calc(100vh - 120px);
  position: relative;
}

.auth-card {
  width: 100%;
  max-width: 480px;
  position: relative;
  z-index: 10;
  border-color: rgba(255, 255, 255, 0.08);
}

.auth-header {
  text-align: center;
  margin-bottom: 30px;
}

.auth-header .logo-icon {
  margin: 0 auto 16px auto;
  width: 48px;
  height: 48px;
  border-radius: 14px;
  font-size: 1.6rem;
}

.auth-header h2 {
  font-size: 1.8rem;
  margin-bottom: 8px;
}

.auth-tagline {
  color: var(--text-muted);
  font-size: 0.95rem;
}

.auth-form {
  display: flex;
  flex-direction: column;
}

.auth-submit {
  margin-top: 10px;
  height: 48px;
}

.auth-footer {
  text-align: center;
  margin-top: 24px;
  font-size: 0.9rem;
  color: var(--text-muted);
}

.btn-link {
  background: none;
  border: none;
  color: var(--accent-cyan);
  font-weight: 600;
  font-family: inherit;
  font-size: inherit;
  cursor: pointer;
  padding: 0 4px;
  transition: color 0.2s;
}

.btn-link:hover {
  color: var(--accent-cyan-hover);
  text-decoration: underline;
}

.error-banner {
  background-color: var(--color-danger-bg);
  color: var(--color-danger);
  border: 1px solid rgba(239, 68, 68, 0.2);
  border-radius: 12px;
  padding: 12px 16px;
  font-size: 0.9rem;
  margin-bottom: 20px;
}

.field-hint {
  display: block;
  font-size: 0.75rem;
  color: var(--text-dark);
  margin-top: 6px;
}

/* Glowing background spheres */
.glow-sphere {
  position: absolute;
  border-radius: 50%;
  filter: blur(80px);
  opacity: 0.15;
  z-index: 1;
}

.glow-sphere.purple {
  width: 300px;
  height: 300px;
  background-color: var(--accent-purple);
  top: 10%;
  left: 20%;
}

.glow-sphere.cyan {
  width: 250px;
  height: 250px;
  background-color: var(--accent-cyan);
  bottom: 15%;
  right: 25%;
}

/* Spinner anim */
.spinner {
  width: 18px;
  height: 18px;
  border: 2px solid rgba(255, 255, 255, 0.3);
  border-radius: 50%;
  border-top-color: white;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.auth-success-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  padding: 20px 0;
}

.success-icon {
  font-size: 3rem;
  margin-bottom: 20px;
  background: rgba(16, 185, 129, 0.1);
  border: 1px solid rgba(16, 185, 129, 0.2);
  width: 72px;
  height: 72px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  box-shadow: 0 0 20px rgba(16, 185, 129, 0.15);
}

.auth-success-state h3 {
  font-size: 1.1rem;
  line-height: 1.6;
  color: var(--text-primary);
  font-weight: 500;
  margin: 0;
}
</style>
