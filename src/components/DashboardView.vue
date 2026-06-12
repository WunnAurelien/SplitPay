<script setup>
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { state, userGlobalStats, calculateSettlements, actions } from '../store'
import { useSupabase } from '../supabase'
import { isRunningAsPWA } from '../usePWA'
import BaseButton from './ui/BaseButton.vue'
import BaseModal from './ui/BaseModal.vue'
import BaseCard from './ui/BaseCard.vue'
import BaseInput from './ui/BaseInput.vue'
import ErrorBanner from './ui/ErrorBanner.vue'
import PullToRefresh from './ui/PullToRefresh.vue'

const router = useRouter()
const { t, locale } = useI18n()
const { supabase } = useSupabase()
const newGroupName = ref('')
const errorMsg = ref('')
const isLoading = ref(false)
const createGroupDialog = ref(null)

const checkClipboardAndJoin = async () => {
  try {
    const text = await navigator.clipboard.readText()
    const match = text.match(/\/group\/([^\/]+)\/join/)
    if (match && match[1]) {
      const groupId = match[1]
      router.push(`/group/${groupId}/join`)
    } else {
      await actions.alert({
        title: t('dashboard.clipboardNoLinkTitle') || 'Aucun lien détecté',
        message: t('dashboard.clipboardNoLinkMsg') || 'Aucun lien de groupe SplitPay valide n\'a été détecté dans votre presse-papiers.',
        okText: t('common.ok') || 'OK'
      })
    }
  } catch (err) {
    console.error('Clipboard read failed:', err)
    await actions.alert({
      title: t('dashboard.clipboardErrorTitle') || 'Accès refusé',
      message: t('dashboard.clipboardErrorMsg') || 'Impossible de lire le presse-papiers. Veuillez accorder la permission de lecture ou vérifier votre lien.',
      okText: t('common.ok') || 'OK'
    })
  }
}

onMounted(async () => {
  await actions.fetchGroups()
})

const handleRefresh = async () => {
  await actions.fetchGroups()
  await actions.fetchProfiles()
}

const formatEuro = (amount) => {
  const val = parseFloat(amount || 0)
  return locale.value === 'fr'
    ? `${val.toFixed(2).replace('.', ',')} €`
    : `€${val.toFixed(2)}`
}

const getGroupBalanceText = (group) => {
  const members = group.group_members?.map(gm => gm.profiles).filter(Boolean) || []
  const expenses = group.expenses || []
  const settlements = calculateSettlements(members, expenses)
  const myBalance = settlements.balances?.find(b => b.profileId === state.session?.user?.id)

  if (!myBalance || Math.abs(myBalance.netBalance) < 0.01) {
    return { text: t('dashboard.balanced'), class: 'settled' }
  } else if (myBalance.netBalance > 0) {
    return { text: t('dashboard.owedToMeAmount', { amount: formatEuro(myBalance.netBalance) }), class: 'owed' }
  } else {
    return { text: t('dashboard.iOweAmount', { amount: formatEuro(Math.abs(myBalance.netBalance)) }), class: 'owe' }
  }
}

const openCreateModal = () => {
  newGroupName.value = ''
  errorMsg.value = ''
  createGroupDialog.value.showModal()
}

const closeCreateModal = () => {
  createGroupDialog.value.close()
}

const handleCreateGroup = async () => {
  if (!newGroupName.value.trim()) return
  isLoading.value = true
  errorMsg.value = ''

  try {
    const group = await actions.createGroup(newGroupName.value.trim())
    closeCreateModal()
  } catch (err) {
    errorMsg.value = err.message || t('dashboard.createGroupError')
  } finally {
    isLoading.value = false
  }
}

// Dialog backdrop click close fallback
const handleBackdropClick = (event) => {
  const dialog = createGroupDialog.value
  if (!dialog || 'closedBy' in HTMLDialogElement.prototype) return
  if (event.target !== dialog) return

  const rect = dialog.getBoundingClientRect()
  const isInDialog = (
    rect.top <= event.clientY &&
    event.clientY <= rect.top + rect.height &&
    rect.left <= event.clientX &&
    event.clientX <= rect.left + rect.width
  )
  if (!isInDialog) {
    dialog.close()
  }
}
</script>

<template>
  <PullToRefresh :loading="state.loading" :on-refresh="handleRefresh">
  <div class="space-y-4 sm:space-y-6">
    <!-- Header Greeting -->
    <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 sm:gap-4">
      <div>
        <h1 class="text-xl sm:text-2xl font-semibold">{{ $t('dashboard.welcome', { name: state.profile?.username }) }}</h1>
        <p class="text-xs sm:text-sm text-base-content/70">{{ $t('dashboard.subtitle') }}</p>
      </div>
      <BaseButton @click="openCreateModal" variant="primary" class="sm:shrink-0 text-sm sm:text-base">
        <span class="inline-flex items-center gap-1.5 sm:gap-2">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" class="h-3.5 w-3.5 sm:h-4 sm:w-4" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M12 5v14M5 12h14" />
          </svg>
          {{ $t('dashboard.createGroupBtn') }}
        </span>
      </BaseButton>
    </div>

    <!-- PWA Join from Clipboard (only visible in standalone PWA mode) -->
    <div v-if="isRunningAsPWA()" class="bg-base-200/50 border border-base-300 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-sm animate-fade-in">
      <div class="flex-1">
        <h3 class="text-sm font-semibold flex items-center gap-1.5 text-primary">
          <span>📋</span>
          {{ $t('dashboard.clipboardJoinTitle') }}
        </h3>
        <p class="text-xs text-base-content/70 mt-0.5">
          {{ $t('dashboard.clipboardJoinDesc') }}
        </p>
      </div>
      <BaseButton @click="checkClipboardAndJoin" variant="secondary" size="sm" class="shrink-0">
        {{ $t('dashboard.clipboardJoinBtn') }}
      </BaseButton>
    </div>

    <!-- Groups Grid - Prioritized (no scroll needed) -->
    <div>
      <h2 class="text-lg sm:text-xl font-semibold mb-3 sm:mb-4">{{ $t('dashboard.yourGroups') }}</h2>

      <BaseCard v-if="state.groups.length === 0" class="p-6 sm:p-8 md:p-12 text-center bg-gradient-to-br from-base-300/20 to-base-300/5 border-2 border-base-300/30">
        <div class="text-4xl sm:text-5xl md:text-6xl mb-4 sm:mb-6">💸</div>
        <h3 class="text-lg sm:text-xl md:text-2xl font-semibold mb-2 sm:mb-3">{{ $t('dashboard.noGroupsTitle') }}</h3>
        <p class="text-xs sm:text-sm md:text-base text-base-content/70 mb-6 sm:mb-8">{{ $t('dashboard.noGroupsDesc') }}</p>
        <BaseButton @click="openCreateModal" variant="primary" class="text-sm sm:text-base">
          <span class="inline-flex items-center gap-1.5 sm:gap-2">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" class="h-3.5 w-3.5 sm:h-4 sm:w-4" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M12 5v14M5 12h14" />
            </svg>
            {{ $t('dashboard.createFirstGroup') }}
          </span>
        </BaseButton>
      </BaseCard>

      <div v-else class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-5">
        <BaseCard v-for="group in state.groups" :key="group.id" :to="`/group/${group.id}`" interactive class="p-3 sm:p-5 flex flex-col justify-between gap-3 hover:shadow-lg hover:border-primary/50 transition-all border border-base-300/30">
          <div class="flex justify-between items-start gap-2">
            <div class="flex-1 min-w-0">
              <h3 class="text-base sm:text-lg font-semibold truncate">{{ group.name }}</h3>
            </div>
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" class="h-4 w-4 sm:h-5 sm:w-5 text-primary/60 shrink-0 group-hover:translate-x-1 transition-transform" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="9 18 15 12 9 6" />
            </svg>
          </div>
          <div class="flex items-center justify-between pt-2 border-t border-base-300/20">
            <span class="text-xs uppercase tracking-wide text-base-content/50">Balance</span>
            <div :class="getGroupBalanceText(group).class === 'owed' ? 'text-success font-semibold' : getGroupBalanceText(group).class === 'owe' ? 'text-error font-semibold' : 'text-base-content/70 font-semibold'">
              {{ getGroupBalanceText(group).text }}
            </div>
          </div>
        </BaseCard>
      </div>
    </div>

    <!-- Stats Summary Grid - Secondary Info Below -->
    <div class="pt-3 sm:pt-4">
      <h3 class="text-xs sm:text-sm font-semibold text-base-content/70 uppercase tracking-wide mb-3">{{ $t('dashboard.overview') }}</h3>
      <div class="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
        <BaseCard class="p-3 sm:p-5 border border-success/20 bg-success/5 hover:border-success/40 transition-colors">
          <div class="flex items-center justify-between mb-2 sm:mb-3">
            <div class="text-xs sm:text-sm text-base-content/70 font-medium">{{ $t('dashboard.owedToMe') }}</div>
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" class="h-4 w-4 sm:h-5 sm:w-5 text-success/60" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M12 2v20M2 12h20" />
            </svg>
          </div>
          <div class="text-2xl sm:text-3xl font-bold text-success">{{ formatEuro(userGlobalStats.netOwedToMe) }}</div>
        </BaseCard>
        <BaseCard class="p-3 sm:p-5 border border-error/20 bg-error/5 hover:border-error/40 transition-colors">
          <div class="flex items-center justify-between mb-2 sm:mb-3">
            <div class="text-xs sm:text-sm text-base-content/70 font-medium">{{ $t('dashboard.iOwe') }}</div>
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" class="h-4 w-4 sm:h-5 sm:w-5 text-error/60" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M12 5v14M5 12h14" />
            </svg>
          </div>
          <div class="text-2xl sm:text-3xl font-bold text-error">{{ formatEuro(userGlobalStats.netIOwe) }}</div>
        </BaseCard>
        <BaseCard class="p-3 sm:p-5 border border-primary/20 bg-primary/5 hover:border-primary/40 transition-colors">
          <div class="flex items-center justify-between mb-2 sm:mb-3">
            <div class="text-xs sm:text-sm text-base-content/70 font-medium">{{ $t('dashboard.activeGroups') }}</div>
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" class="h-4 w-4 sm:h-5 sm:w-5 text-primary/60" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
              <circle cx="9" cy="7" r="4" />
              <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
              <path d="M16 3.13a4 4 0 0 1 0 7.75" />
            </svg>
          </div>
          <div class="text-2xl sm:text-3xl font-bold text-primary">{{ userGlobalStats.activeGroupsCount }}</div>
        </BaseCard>
      </div>
    </div>

    <!-- Create Group Modal Dialog -->
    <BaseModal 
      ref="createGroupDialog" 
      :title="$t('dashboard.createGroupTitle')"
      @close="closeCreateModal"
    >
      <form @submit.prevent="handleCreateGroup">
        <ErrorBanner v-if="errorMsg" :error="errorMsg" />

        <BaseInput 
          id="group-name" 
          v-model="newGroupName" 
          required
          :label="$t('dashboard.groupNameLabel')"
          :placeholder="t('dashboard.groupNamePlaceholder')" 
        />

        <div class="dialog-actions" style="display: flex; gap: 12px; justify-content: flex-end; margin-top: 24px;">
          <BaseButton type="button" @click="closeCreateModal" variant="secondary" size="sm">
            {{ $t('common.cancel') }}
          </BaseButton>
          <BaseButton type="submit" variant="primary" size="sm" :loading="isLoading">
            {{ $t('dashboard.createGroupSubmit') }}
          </BaseButton>
        </div>
      </form>
    </BaseModal>
  </div>
  </PullToRefresh>
</template>

<style scoped>
/* minimal scoped styles (kept empty) */
</style>
