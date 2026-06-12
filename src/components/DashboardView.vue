<script setup>
import { ref, onMounted, computed } from 'vue'
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

const netBalance = computed(() => {
  return parseFloat((userGlobalStats.netOwedToMe - userGlobalStats.netIOwe).toFixed(2))
})

const getGroupInitials = (name) => {
  if (!name) return 'GP'
  const words = name.trim().split(/\s+/)
  if (words.length >= 2) {
    return (words[0][0] + words[1][0]).toUpperCase()
  }
  return name.slice(0, 2).toUpperCase()
}
</script>

<template>
  <PullToRefresh :loading="state.loading" :on-refresh="handleRefresh">
    <div class="space-y-5 sm:space-y-6">
      <!-- Header Greeting and Action -->
      <div class="flex items-center justify-between gap-4">
        <div>
          <h1 class="text-xl sm:text-2xl font-semibold">{{ $t('dashboard.welcome', { name: state.profile?.username }) }}
          </h1>
          <p class="text-xs sm:text-sm text-base-content/70">{{ $t('dashboard.subtitle') }}</p>
        </div>
        <BaseButton @click="openCreateModal" variant="primary"
          class="hidden sm:inline-flex shrink-0 text-sm sm:text-base">
          <span class="inline-flex items-center gap-1.5 sm:gap-2">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" class="h-3.5 w-3.5 sm:h-4 sm:w-4"
              aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"
              stroke-linejoin="round">
              <path d="M12 5v14M5 12h14" />
            </svg>
            {{ $t('dashboard.createGroupBtn') }}
          </span>
        </BaseButton>
      </div>

      <!-- Consolidated Balance Hero Card -->
      <div
        class="bg-gradient-to-br from-base-200 to-base-300/40 border border-base-300/40 rounded-2xl p-5 shadow-lg relative overflow-hidden">
        <!-- Background decorative glow -->
        <div class="absolute -right-10 -top-10 w-36 h-36 bg-primary/10 rounded-full blur-3xl pointer-events-none"></div>
        <div class="absolute -left-10 -bottom-10 w-36 h-36 bg-secondary/10 rounded-full blur-3xl pointer-events-none">
        </div>

        <div class="flex flex-col gap-4 relative z-10">
          <!-- Top row: Net Balance display -->
          <div class="flex items-baseline justify-between">
            <div class="min-w-0">
              <span class="text-xs uppercase tracking-wider text-base-content/50 font-semibold">{{
                $t('dashboard.netBalance') }}</span>
              <div class="flex flex-wrap items-baseline gap-2 mt-1">
                <span class="text-3xl sm:text-4xl font-extrabold tracking-tight"
                  :class="netBalance > 0 ? 'text-success' : netBalance < 0 ? 'text-error' : 'text-base-content/80'">
                  {{ netBalance > 0 ? '+' : '' }}{{ formatEuro(netBalance) }}
                </span>
                <span class="text-[11px] font-semibold px-2 py-0.5 rounded-full inline-flex items-center gap-1"
                  :class="netBalance > 0 ? 'bg-success/15 text-success' : netBalance < 0 ? 'bg-error/15 text-error' : 'bg-base-300 text-base-content/60'">
                  <span>{{ netBalance > 0 ? '📈' : netBalance < 0 ? '📉' : '⚖️' }}</span>
                      {{ netBalance > 0 ? $t('dashboard.owedToMe').toLowerCase() : netBalance < 0 ?
                        $t('dashboard.iOwe').toLowerCase() : $t('dashboard.balanced').toLowerCase() }} </span>
              </div>
            </div>

            <!-- Active groups pill (desktop only inside card, mobile doesn't need it as it's clear from list) -->
            <div
              class="hidden sm:flex items-center gap-1.5 bg-base-300/30 px-3 py-1.5 rounded-lg border border-base-300/10">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" class="h-4 w-4 text-primary" fill="none"
                stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                <circle cx="9" cy="7" r="4" />
              </svg>
              <span class="text-xs font-semibold text-base-content/80">
                {{ userGlobalStats.activeGroupsCount }} {{ $t('dashboard.activeGroups').toLowerCase() }}
              </span>
            </div>
          </div>

          <!-- Bottom row: Sub-balances grid -->
          <div class="grid grid-cols-2 gap-3 pt-3 border-t border-base-300/20">
            <div class="bg-base-300/20 border border-base-300/10 rounded-xl p-3 flex items-center gap-3">
              <div class="h-8 w-8 rounded-lg bg-success/10 flex items-center justify-center text-success shrink-0">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" class="h-4.5 w-4.5" fill="none"
                  stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                  <line x1="12" y1="5" x2="12" y2="19"></line>
                  <line x1="5" y1="12" x2="19" y2="12"></line>
                </svg>
              </div>
              <div class="min-w-0">
                <div
                  class="text-[10px] sm:text-xs uppercase tracking-wider text-base-content/50 font-semibold truncate">{{
                    $t('dashboard.owedToMe') }}</div>
                <div class="text-sm sm:text-base font-bold text-success truncate">{{
                  formatEuro(userGlobalStats.netOwedToMe) }}</div>
              </div>
            </div>

            <div class="bg-base-300/20 border border-base-300/10 rounded-xl p-3 flex items-center gap-3">
              <div class="h-8 w-8 rounded-lg bg-error/10 flex items-center justify-center text-error shrink-0">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" class="h-4.5 w-4.5" fill="none"
                  stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                  <line x1="5" y1="12" x2="19" y2="12"></line>
                </svg>
              </div>
              <div class="min-w-0">
                <div
                  class="text-[10px] sm:text-xs uppercase tracking-wider text-base-content/50 font-semibold truncate">{{
                    $t('dashboard.iOwe') }}</div>
                <div class="text-sm sm:text-base font-bold text-error truncate">{{ formatEuro(userGlobalStats.netIOwe)
                }}</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Groups Section -->
      <div class="space-y-3">
        <div class="flex items-center justify-between">
          <h2 class="text-lg sm:text-xl font-semibold">{{ $t('dashboard.yourGroups') }}</h2>
          <BaseButton @click="openCreateModal" variant="primary" size="sm"
            class="sm:hidden shrink-0 text-xs py-1.5 px-3 h-auto min-h-0">
            <span class="inline-flex items-center gap-1">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" class="h-3.5 w-3.5" fill="none"
                stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                <path d="M12 5v14M5 12h14" />
              </svg>
              {{ $t('dashboard.createGroupBtn') }}
            </span>
          </BaseButton>
        </div>

        <!-- Empty State -->
        <BaseCard v-if="state.groups.length === 0"
          class="p-6 sm:p-8 md:p-12 text-center bg-gradient-to-br from-base-300/20 to-base-300/5 border-2 border-base-300/30">
          <div class="text-4xl sm:text-5xl md:text-6xl mb-4 sm:mb-6">💸</div>
          <h3 class="text-lg sm:text-xl md:text-2xl font-semibold mb-2 sm:mb-3">{{ $t('dashboard.noGroupsTitle') }}</h3>
          <p class="text-xs sm:text-sm md:text-base text-base-content/70 mb-6 sm:mb-8">{{ $t('dashboard.noGroupsDesc')
          }}</p>
          <BaseButton @click="openCreateModal" variant="primary" class="text-sm sm:text-base">
            <span class="inline-flex items-center gap-1.5 sm:gap-2">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" class="h-3.5 w-3.5 sm:h-4 sm:w-4"
                aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"
                stroke-linejoin="round">
                <path d="M12 5v14M5 12h14" />
              </svg>
              {{ $t('dashboard.createFirstGroup') }}
            </span>
          </BaseButton>
        </BaseCard>

        <!-- Desktop Grid / Mobile List of Groups -->
        <div v-else class="flex flex-col gap-2.5 sm:grid sm:grid-cols-2 lg:grid-cols-3 sm:gap-4">
          <router-link v-for="group in state.groups" :key="group.id" :to="`/group/${group.id}`"
            class="flex sm:flex-col justify-between items-center sm:items-stretch p-3.5 sm:p-5 bg-base-200/40 hover:bg-base-200/80 border border-base-300/30 hover:border-primary/40 rounded-xl sm:rounded-2xl transition-all hover:shadow-md group cursor-pointer">
            <!-- Left side (mobile) / Top side (desktop) -->
            <div class="flex items-center gap-3 min-w-0">
              <!-- Group Avatar Initials -->
              <div
                class="h-10 w-10 sm:h-12 sm:w-12 rounded-xl bg-gradient-to-br from-primary/10 to-secondary/10 border border-primary/20 flex items-center justify-center font-bold text-primary shrink-0 group-hover:scale-105 transition-transform">
                {{ getGroupInitials(group.name) }}
              </div>

              <div class="min-w-0">
                <h3
                  class="text-sm sm:text-base font-semibold truncate text-base-content group-hover:text-primary transition-colors">
                  {{ group.name }}</h3>
                <!-- Member Count subtext -->
                <p class="text-xs text-base-content/50 mt-0.5">
                  {{ $t('dashboard.memberCount', { count: group.group_members?.length || 0 }) }}
                </p>
              </div>
            </div>

            <!-- Right side (mobile) / Bottom side (desktop) -->
            <div
              class="flex items-center gap-2 sm:mt-4 sm:pt-3 sm:border-t sm:border-base-300/20 sm:justify-between shrink-0">
              <span
                class="hidden sm:inline text-[10px] uppercase tracking-wider text-base-content/40 font-semibold">Balance</span>
              <div class="text-right sm:text-left">
                <span class="text-xs sm:text-sm font-bold block"
                  :class="getGroupBalanceText(group).class === 'owed' ? 'text-success' : getGroupBalanceText(group).class === 'owe' ? 'text-error' : 'text-base-content/60'">
                  {{ getGroupBalanceText(group).text }}
                </span>
              </div>
              <!-- Chevron (only on mobile for visual cue) -->
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"
                class="h-4 w-4 text-base-content/40 sm:hidden group-hover:translate-x-1 transition-transform"
                fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="9 18 15 12 9 6"></polyline>
              </svg>
            </div>
          </router-link>
        </div>
      </div>

      <!-- PWA Join from Clipboard (only visible in standalone PWA mode) -->
      <div v-if="isRunningAsPWA()"
        class="bg-primary/5 border border-primary/20 rounded-xl p-3 flex items-center justify-between gap-4 shadow-sm animate-fade-in">
        <div class="flex items-center gap-3 min-w-0">
          <div class="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center text-primary shrink-0">
            <span>📋</span>
          </div>
          <div class="min-w-0">
            <h3 class="text-xs sm:text-sm font-bold text-primary truncate">{{ $t('dashboard.clipboardJoinTitle') }}</h3>
            <p class="text-[11px] text-base-content/60 truncate max-w-[200px] sm:max-w-none">{{
              $t('dashboard.clipboardJoinDesc') }}</p>
          </div>
        </div>
        <BaseButton @click="checkClipboardAndJoin" variant="primary" size="sm"
          class="shrink-0 text-xs py-1.5 px-3 h-auto min-h-0">
          {{ $t('dashboard.clipboardJoinBtn') }}
        </BaseButton>
      </div>



      <!-- Create Group Modal Dialog -->
      <BaseModal ref="createGroupDialog" :title="$t('dashboard.createGroupTitle')" @close="closeCreateModal">
        <form @submit.prevent="handleCreateGroup">
          <ErrorBanner v-if="errorMsg" :error="errorMsg" />

          <BaseInput id="group-name" v-model="newGroupName" required :label="$t('dashboard.groupNameLabel')"
            :placeholder="t('dashboard.groupNamePlaceholder')" />

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
