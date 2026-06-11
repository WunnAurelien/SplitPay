<script setup>
import { ref, watch, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { state, actions } from '../store'
import { useSupabase } from '../supabase'
import BaseButton from './ui/BaseButton.vue'
import BaseCard from './ui/BaseCard.vue'
import BaseInput from './ui/BaseInput.vue'
import ErrorBanner from './ui/ErrorBanner.vue'
import PullToRefresh from './ui/PullToRefresh.vue'

const handleRefresh = () => {
  // Settings are local — just re-sync the form fields from state
  syncFields()
}

const router = useRouter()
const { t } = useI18n()
const { supabase } = useSupabase()
const username = ref('')
const paymentLink = ref('')
const phoneNumber = ref('')
const iban = ref('')
const isSaving = ref(false)
const errorMsg = ref('')
const successMsg = ref('')

const hasPendingRedirect = ref(!!localStorage.getItem('splitpay_redirect_after_auth'))
const pendingJoinGroupId = ref(localStorage.getItem('splitpay_pending_join_group_id'))
const pendingJoinStatus = ref(localStorage.getItem('splitpay_pending_join_status'))
const pendingGroupName = ref('')
const isFetchingGroup = ref(false)
const pendingRedirectUrl = ref(localStorage.getItem('splitpay_redirect_after_auth'))

const fetchPendingGroupName = async () => {
  let targetGroupId = pendingJoinGroupId.value
  if (!targetGroupId && pendingRedirectUrl.value) {
    const match = pendingRedirectUrl.value.match(/\/group\/([a-f0-9-]+)\/join/)
    if (match && match[1]) {
      targetGroupId = match[1]
    }
  }
  
  if (targetGroupId) {
    isFetchingGroup.value = true
    try {
      const { data: group } = await supabase
        .from('groups')
        .select('name')
        .eq('id', targetGroupId)
        .single()
      if (group) {
        pendingGroupName.value = group.name
        if (!pendingJoinGroupId.value) {
          pendingJoinGroupId.value = targetGroupId
        }
      }
    } catch (err) {
      console.error('Error fetching pending group name:', err)
    } finally {
      isFetchingGroup.value = false
    }
  }
}

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
  fetchPendingGroupName()
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
  <PullToRefresh :loading="false" :on-refresh="handleRefresh">
  <div class="flex justify-center py-6 sm:py-8">
    <BaseCard class="w-full max-w-2xl p-6">
      <!-- Header -->
      <div class="mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 class="text-2xl font-semibold">{{ $t('settings.profileSettings') }}</h2>
          <p class="text-sm text-base-content/70">{{ $t('settings.profileSettingsSubtitle') }}</p>
        </div>
      </div>

      <!-- Account Approval Status -->
      <div class="p-4 border rounded-lg mb-6">
        <label class="block text-sm font-semibold">{{ $t('settings.accountStatus') }}</label>
        <div class="mt-3 flex flex-col gap-2">
          <div>
            <span v-if="state.profile?.status === 'approved'" class="badge badge-success">{{ $t('settings.approved') }}</span>
            <span v-else-if="state.profile?.status === 'pending'" class="badge badge-warning">{{ $t('settings.pending') }}</span>
            <span v-else-if="state.profile?.status === 'rejected'" class="badge badge-error">{{ $t('settings.rejected') }}</span>
            <span v-else class="badge badge-secondary">{{ $t('common.loading') }}</span>
          </div>
          <div class="text-sm mt-2 text-base-content/70">
            <p v-if="state.profile?.status === 'approved'">{{ $t('settings.approvedMsg') }}</p>
            <template v-else-if="state.profile?.status === 'pending'">
              <p>{{ $t('settings.pendingMsg') }}</p>
              
              <!-- Case 1: Accepted invite pending approval -->
              <div v-if="pendingJoinStatus === 'accepted'" class="mt-3 p-4 bg-success/10 border border-success/20 rounded-xl text-sm flex items-start gap-3">
                <span class="text-lg">✅</span>
                <div class="leading-relaxed text-base-content/85 flex-1">
                  <p v-if="pendingGroupName">
                    {{ $t('settings.acceptedInvitePendingGroupMsg', { name: pendingGroupName }) || `Vous rejoindrez le groupe "${pendingGroupName}" automatiquement dès que votre compte sera approuvé.` }}
                  </p>
                  <p v-else>
                    {{ $t('settings.acceptedInvitePendingMsg') || 'Vous rejoindrez le groupe automatiquement dès que votre compte sera approuvé.' }}
                  </p>
                </div>
              </div>
              
              <!-- Case 2: Has invite but hasn't made a choice yet -->
              <div v-else-if="hasPendingRedirect" class="mt-3 p-4 bg-cyan/10 border border-cyan/20 rounded-xl text-sm flex flex-col gap-3">
                <div class="flex items-start gap-3">
                  <span class="text-lg">👉</span>
                  <div class="leading-relaxed text-base-content/85 flex-1">
                    <p v-if="pendingGroupName">
                      {{ $t('settings.undecidedInviteGroupMsg', { name: pendingGroupName }) || `Vous avez été invité à rejoindre le groupe "${pendingGroupName}".` }}
                    </p>
                    <p v-else>
                      {{ $t('settings.undecidedInviteMsg') || 'Vous avez reçu un lien d\'invitation pour rejoindre un groupe.' }}
                    </p>
                  </div>
                </div>
                <div class="flex justify-end">
                  <BaseButton :to="pendingRedirectUrl || `/group/${pendingJoinGroupId}/join`" variant="primary" size="sm">
                    {{ $t('settings.viewInviteBtn') || 'Voir l\'invitation' }}
                  </BaseButton>
                </div>
              </div>
            </template>
            <p v-else-if="state.profile?.status === 'rejected'">{{ $t('settings.rejectedMsg') }}</p>
            <p v-else>{{ $t('settings.loadingStatus') }}</p>
          </div>
        </div>
      </div>

      <!-- Profile Edit Form -->
      <form @submit.prevent="handleUpdate" class="space-y-4">
        <ErrorBanner v-if="errorMsg" :error="errorMsg" />
        <div v-if="successMsg" class="p-3 rounded bg-success/10 text-success">{{ successMsg }}</div>

        <BaseInput type="email" id="email" :modelValue="state.session?.user?.email" disabled class="disabled-input" :label="$t('settings.emailLabel')" />
        <div class="text-xs text-base-content/60">{{ $t('settings.emailHint') }}</div>

        <BaseInput type="text" id="username" v-model="username" required :label="$t('settings.displayNameLabel')" :placeholder="t('settings.displayNamePlaceholder')" />

        <BaseInput type="url" id="payment-link" v-model="paymentLink" :label="$t('settings.paymentLinkLabel')" :placeholder="t('settings.paymentLinkPlaceholder')" />
        <div class="text-xs text-base-content/60">{{ $t('settings.paymentLinkHintSettings') }}</div>

        <BaseInput type="text" id="phone-number" v-model="phoneNumber" :label="$t('settings.phoneNumberLabel')" :placeholder="t('settings.phoneNumberPlaceholder')" />
        <div class="text-xs text-base-content/60">{{ $t('settings.phoneNumberHint') }}</div>

        <BaseInput type="text" id="iban" v-model="iban" :label="$t('settings.ibanLabel')" :placeholder="t('settings.ibanPlaceholder')" />
        <div class="text-xs text-base-content/60">{{ $t('settings.ibanHint') }}</div>

        <div class="flex flex-wrap gap-3 mt-4">
          <BaseButton type="submit" variant="primary" :loading="isSaving">{{ $t('settings.saveChanges') }}</BaseButton>
          <BaseButton type="button" @click="handleLogout" variant="secondary" class="text-error">{{ $t('settings.signOut') }}</BaseButton>
        </div>
      </form>
    </BaseCard>
  </div>
  </PullToRefresh>
</template>

<style scoped>
/* minimal or no scoped CSS - relying on Tailwind and component styles */
</style>
