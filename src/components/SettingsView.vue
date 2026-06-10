<script setup>
import { ref, watch, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { state, actions } from '../store'
import { supabase } from '../supabase'
import BaseButton from './ui/BaseButton.vue'
import BaseCard from './ui/BaseCard.vue'
import BaseInput from './ui/BaseInput.vue'
import ErrorBanner from './ui/ErrorBanner.vue'

const router = useRouter()
const { t } = useI18n()
const username = ref('')
const paymentLink = ref('')
const phoneNumber = ref('')
const iban = ref('')
const isSaving = ref(false)
const errorMsg = ref('')
const successMsg = ref('')

const syncFields = () => {
  if (state.profile) {
    username.value = state.profile.username || ''
    paymentLink.value = state.profile.payment_link || ''
    phoneNumber.value = state.profile.phone_number || ''
    iban.value = state.profile.iban || ''
  }
}

onMounted(() => {
  syncFields()
})

watch(() => state.profile, () => {
  syncFields()
}, { deep: true })

const handleUpdate = async () => {
  if (!username.value.trim()) return

  const pLink = paymentLink.value.trim()
  if (pLink && !pLink.includes('paypal.me') && !pLink.includes('paypal.com')) {
    errorMsg.value = t('settings.paymentLinkInvalid')
    return
  }

  isSaving.value = true
  errorMsg.value = ''
  successMsg.value = ''

  try {
    await actions.updateProfile({
      username: username.value.trim(),
      paymentLink: paymentLink.value.trim(),
      phoneNumber: phoneNumber.value.trim(),
      iban: iban.value.trim()
    })
    successMsg.value = t('settings.profileUpdateSuccess')
  } catch (err) {
    errorMsg.value = err.message || t('settings.profileUpdateError')
  } finally {
    isSaving.value = false
  }
}

const handleLogout = async () => {
  const ok = await actions.confirm({
    title: t('common.logout') || 'Déconnexion',
    message: t('common.confirmLogout') || 'Êtes-vous sûr de vouloir vous déconnecter ?',
    confirmText: t('common.logout') || 'Déconnexion',
    cancelText: t('common.cancel') || 'Annuler'
  })
  if (ok) {
    await actions.signOut()
    router.push('/auth')
  }
}
</script>

<template>
  <div class="settings-page">
    <BaseCard class="settings-container">
      <!-- Header -->
      <div class="settings-header">
        <h2>{{ $t('settings.profileSettings') }}</h2>
        <p class="subtitle">{{ $t('settings.profileSettingsSubtitle') }}</p>
      </div>

      <!-- Account Approval Status -->
      <div class="status-box">
        <label>{{ $t('settings.accountStatus') }}</label>
        <div class="status-details">
          <span 
            v-if="state.profile?.status === 'approved'" 
            class="badge badge-approved"
          >
            {{ $t('settings.approved') }}
          </span>
          <span 
            v-else-if="state.profile?.status === 'pending'" 
            class="badge badge-pending"
          >
            {{ $t('settings.pending') }}
          </span>
          <span 
            v-else-if="state.profile?.status === 'rejected'" 
            class="badge badge-rejected"
          >
            {{ $t('settings.rejected') }}
          </span>
          <span 
            v-else 
            class="badge badge-pending"
          >
            {{ $t('common.loading') }}
          </span>

          <p v-if="state.profile?.status === 'approved'" class="status-msg success">
            {{ $t('settings.approvedMsg') }}
          </p>
          <p v-else-if="state.profile?.status === 'pending'" class="status-msg warning">
            {{ $t('settings.pendingMsg') }}
          </p>
          <p v-else-if="state.profile?.status === 'rejected'" class="status-msg danger">
            {{ $t('settings.rejectedMsg') }}
          </p>
          <p v-else class="status-msg warning">
            {{ $t('settings.loadingStatus') }}
          </p>
        </div>
      </div>

      <!-- Profile Edit Form -->
      <form @submit.prevent="handleUpdate" class="settings-form">
        <ErrorBanner v-if="errorMsg" :error="errorMsg" />
        <div v-if="successMsg" class="success-banner">
          {{ successMsg }}
        </div>

        <BaseInput
          type="email"
          id="email"
          :modelValue="state.session?.user?.email"
          disabled
          class="disabled-input"
          :label="$t('settings.emailLabel')"
        />
        <span class="field-hint" style="margin-top: -14px; margin-bottom: 20px;">{{ $t('settings.emailHint') }}</span>

        <BaseInput
          type="text"
          id="username"
          v-model="username"
          required
          :label="$t('settings.displayNameLabel')"
          :placeholder="t('settings.displayNamePlaceholder')"
        />

        <BaseInput
          type="url"
          id="payment-link"
          v-model="paymentLink"
          :label="$t('settings.paymentLinkLabel')"
          :placeholder="t('settings.paymentLinkPlaceholder')"
        />
        <span class="field-hint" style="margin-top: -14px; margin-bottom: 20px;">{{ $t('settings.paymentLinkHintSettings') }}</span>

        <BaseInput
          type="text"
          id="phone-number"
          v-model="phoneNumber"
          :label="$t('settings.phoneNumberLabel')"
          :placeholder="t('settings.phoneNumberPlaceholder')"
        />
        <span class="field-hint" style="margin-top: -14px; margin-bottom: 20px;">{{ $t('settings.phoneNumberHint') }}</span>

        <BaseInput
          type="text"
          id="iban"
          v-model="iban"
          :label="$t('settings.ibanLabel')"
          :placeholder="t('settings.ibanPlaceholder')"
        />
        <span class="field-hint" style="margin-top: -14px; margin-bottom: 20px;">{{ $t('settings.ibanHint') }}</span>

        <div class="form-actions">
          <BaseButton type="submit" variant="primary" :loading="isSaving">
            {{ $t('settings.saveChanges') }}
          </BaseButton>
          
          <BaseButton 
            v-if="state.isAdmin" 
            to="/admin" 
            variant="secondary"
            style="border-color: rgba(139, 92, 246, 0.3); color: var(--accent-purple);"
          >
            {{ $t('settings.adminPanel') }}
          </BaseButton>

          <BaseButton type="button" @click="handleLogout" variant="secondary" style="border-color: rgba(239, 68, 68, 0.3); color: var(--color-danger);">
            {{ $t('settings.signOut') }}
          </BaseButton>
        </div>
      </form>
    </BaseCard>
  </div>
</template>


<style scoped>
.settings-page {
  display: flex;
  justify-content: center;
  align-items: center;
  padding: 20px 0;
}

.settings-container {
  width: 100%;
  max-width: 580px;
}

.settings-header {
  margin-bottom: 25px;
}

.subtitle {
  color: var(--text-muted);
  font-size: 0.9rem;
  margin-top: 4px;
}

.status-box {
  background: rgba(255, 255, 255, 0.01);
  border: 1px solid var(--border-color);
  border-radius: 12px;
  padding: 16px;
  margin-bottom: 25px;
}

.status-details {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 10px;
  margin-top: 6px;
}

.status-msg {
  font-size: 0.85rem;
  line-height: 1.4;
  margin-top: 4px;
}

.status-msg.warning {
  color: var(--color-warning);
}

.status-msg.danger {
  color: var(--color-danger);
}

.status-msg.success {
  color: var(--text-muted);
}

.disabled-input {
  background: rgba(255, 255, 255, 0.01) !important;
  color: var(--text-muted) !important;
  border-color: rgba(255, 255, 255, 0.03) !important;
  cursor: not-allowed;
}

.form-actions {
  display: flex;
  gap: 12px;
  margin-top: 30px;
}

@media (max-width: 480px) {
  .form-actions {
    flex-direction: column;
  }
}

.field-hint {
  display: block;
  font-size: 0.75rem;
  color: var(--text-dark);
  margin-top: 6px;
}

.error-banner {
  background-color: var(--color-danger-bg);
  color: var(--color-danger);
  border: 1px solid rgba(239, 68, 68, 0.2);
  border-radius: 12px;
  padding: 12px;
  font-size: 0.9rem;
  margin-bottom: 20px;
}

.success-banner {
  background-color: var(--color-success-bg);
  color: var(--color-success);
  border: 1px solid rgba(16, 185, 129, 0.2);
  border-radius: 12px;
  padding: 12px;
  font-size: 0.9rem;
  margin-bottom: 20px;
}
</style>
