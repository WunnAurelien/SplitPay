<script setup lang="ts">
import { onMounted, ref, computed } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { state, actions } from '@/store'
import BaseButton from '@/components/ui/BaseButton.vue'
import BaseCard from '@/components/ui/BaseCard.vue'
import ErrorBanner from '@/components/ui/ErrorBanner.vue'
import PullToRefresh from '@/components/ui/PullToRefresh.vue'

const router = useRouter()
const { t, locale } = useI18n()

const activeTab = ref('users')
const searchQuery = ref('')

// Communication Tab State
const notifTitle = ref('')
const notifBody = ref('')
const selectedRecipients = ref<string[]>([])
const isSending = ref(false)
const sendResult = ref<{ success: boolean; count?: number; error?: string } | null>(null)
const searchRecipientQuery = ref('')

const filteredProfiles = computed(() => {
  const query = searchQuery.value.toLowerCase().trim()
  const adminId = state.impersonatingFrom?.session?.user?.id || state.session?.user?.id

  // 1. Filter profiles by username, email, phone_number
  const filtered = state.profiles.filter(profile => {
    if (!query) return true
    const usernameMatch = (profile.username || '').toLowerCase().includes(query)
    const emailMatch = (profile.email || '').toLowerCase().includes(query)
    const phoneMatch = (profile.phone_number || '').toLowerCase().includes(query)
    return usernameMatch || emailMatch || phoneMatch
  })

  // 2. Sort: Admin first, then alphabetical by username (pseudo)
  return [...filtered].sort((a, b) => {
    const isAAdmin = a.id === adminId
    const isBAdmin = b.id === adminId

    if (isAAdmin && !isBAdmin) return -1
    if (!isAAdmin && isBAdmin) return 1

    const usernameA = a.username || ''
    const usernameB = b.username || ''

    return usernameA.localeCompare(usernameB, locale.value, { sensitivity: 'base', numeric: true })
  })
})

const filteredRecipients = computed(() => {
  const query = searchRecipientQuery.value.toLowerCase().trim()
  return state.profiles.filter(profile => {
    if (!query) return true
    const usernameMatch = (profile.username || '').toLowerCase().includes(query)
    const emailMatch = (profile.email || '').toLowerCase().includes(query)
    const phoneMatch = (profile.phone_number || '').toLowerCase().includes(query)
    return usernameMatch || emailMatch || phoneMatch
  })
})

const sortedRecipients = computed(() => {
  const adminId = state.impersonatingFrom?.session?.user?.id || state.session?.user?.id
  return [...filteredRecipients.value].sort((a, b) => {
    const isAAdmin = a.id === adminId
    const isBAdmin = b.id === adminId

    if (isAAdmin && !isBAdmin) return -1
    if (!isAAdmin && isBAdmin) return 1

    const usernameA = a.username || ''
    const usernameB = b.username || ''

    return usernameA.localeCompare(usernameB, locale.value, { sensitivity: 'base', numeric: true })
  })
})

const selectAllRecipients = () => {
  selectedRecipients.value = state.profiles.map(p => p.id)
}

const selectActiveRecipients = () => {
  selectedRecipients.value = state.profiles
    .filter(p => p.push_subscription && (!Array.isArray(p.push_subscription) || p.push_subscription.length > 0))
    .map(p => p.id)
}

const deselectAllRecipients = () => {
  selectedRecipients.value = []
}

const hasSelectedNoPush = computed(() => {
  return selectedRecipients.value.some(id => {
    const p = state.profiles.find(prof => prof.id === id)
    return p && (!p.push_subscription || (Array.isArray(p.push_subscription) && p.push_subscription.length === 0))
  })
})

const handleSendPush = async () => {
  const activeSelected = selectedRecipients.value.filter(id => {
    const p = state.profiles.find(prof => prof.id === id)
    return p && p.push_subscription && (!Array.isArray(p.push_subscription) || p.push_subscription.length > 0)
  })

  if (activeSelected.length === 0) {
    sendResult.value = {
      success: false,
      error: t('admin.noRecipientSelected')
    }
    return
  }

  isSending.value = true
  sendResult.value = null

  try {
    await actions.sendPushNotification({
      recipientIds: activeSelected,
      title: notifTitle.value.trim() || undefined,
      body: notifBody.value.trim() || undefined,
      url: '/SplitPay/'
    })

    sendResult.value = {
      success: true,
      count: activeSelected.length
    }
    notifTitle.value = ''
    notifBody.value = ''
    selectedRecipients.value = []
  } catch (err) {
    sendResult.value = {
      success: false,
      error: (err as any).message || t('admin.sendError')
    }
  } finally {
    isSending.value = false
  }
}

const toggleRecipient = (profileId: string) => {
  const index = selectedRecipients.value.indexOf(profileId)
  if (index === -1) {
    selectedRecipients.value.push(profileId)
  } else {
    selectedRecipients.value.splice(index, 1)
  }
}

onMounted(async () => {
  await actions.fetchAdminProfiles()
})

const handleStatusUpdate = async (userId: string, newStatus: string) => {
  const confirmMsg = newStatus === 'approved' ? t('admin.confirmApproveUser') : t('admin.confirmRejectUser')
  const ok = await actions.confirm({
    title: newStatus === 'approved' ? t('admin.approveBtn') || 'Approuver' : t('admin.rejectBtn') || 'Rejeter',
    message: confirmMsg,
    confirmText: newStatus === 'approved' ? t('admin.approveBtn') || 'Approuver' : t('admin.rejectBtn') || 'Rejeter',
    cancelText: t('common.cancel') || 'Annuler'
  })
  if (ok) {
    await actions.updateUserStatus(userId, newStatus)
  }
}

const handleImpersonate = async (profile: any) => {
  await actions.impersonateUser(profile)
  router.push('/')
}

const handleDelete = async (profile: any) => {
  const ok = await actions.confirm({
    title: t('admin.deleteBtn') || 'Supprimer',
    message: t('admin.confirmDeleteUser'),
    confirmText: t('admin.deleteBtn') || 'Supprimer',
    cancelText: t('common.cancel') || 'Annuler'
  })
  if (ok) {
    await actions.deleteUser(profile.id)
  }
}

const handleRefresh = async () => {
  await actions.fetchAdminProfiles()
}
</script>

<template>
  <PullToRefresh :loading="state.loading" :on-refresh="handleRefresh">
  <div class="py-6 sm:py-8">
    <div class="mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
      <div>
        <router-link to="/" class="text-sm font-semibold text-base-content/70 inline-flex items-center gap-1 hover:text-base-content">&larr; {{ $t('common.backToDashboard') }}</router-link>
        <h1 class="text-2xl font-semibold mt-2">{{ $t('admin.adminPanelTitle') }}</h1>
        <p class="text-sm text-base-content/70">{{ $t('admin.adminPanelSubtitle') }}</p>
      </div>
    </div>

    <!-- Error Banner -->
    <ErrorBanner v-if="state.error" :error="state.error" class="mb-6" />

    <!-- Tabs Navigation -->
    <div class="flex border-b border-base-content/10 mb-6">
      <button
        @click="activeTab = 'users'"
        class="py-2.5 px-4 font-medium text-sm transition-all duration-200 border-b-2 -mb-[2px] focus:outline-none"
        :class="activeTab === 'users' ? 'border-primary text-primary font-semibold' : 'border-transparent text-base-content/60 hover:text-base-content hover:border-base-content/20'"
      >
        {{ $t('admin.tabUsers') }}
      </button>
      <button
        @click="activeTab = 'communication'"
        class="py-2.5 px-4 font-medium text-sm transition-all duration-200 border-b-2 -mb-[2px] focus:outline-none"
        :class="activeTab === 'communication' ? 'border-primary text-primary font-semibold' : 'border-transparent text-base-content/60 hover:text-base-content hover:border-base-content/20'"
      >
        {{ $t('admin.tabCommunication') }}
      </button>
    </div>

    <!-- Profiles Table -->
    <BaseCard v-if="activeTab === 'users'" class="p-4">
      <div class="mb-6 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <h3 class="text-lg font-semibold">{{ $t('admin.allUserProfiles', { count: filteredProfiles.length }) }}</h3>
        <div class="w-full md:w-96">
          <div class="input input-bordered flex items-center gap-2">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" class="h-4 w-4 opacity-70 shrink-0">
              <path fill-rule="evenodd" d="M9.965 11.026a5 5 0 1 1 1.06-1.06l2.755 2.754a.75.75 0 1 1-1.06 1.06l-2.755-2.754ZM10.5 7a3.5 3.5 0 1 1-7 0 3.5 3.5 0 0 1 7 0Z" clip-rule="evenodd" />
            </svg>
            <input
              v-model="searchQuery"
              type="text"
              class="grow input-reset"
              :placeholder="$t('admin.searchPlaceholder')"
              autocomplete="off"
            />
          </div>
        </div>
      </div>

      <!-- Mobile List View -->
      <div class="md:hidden space-y-4">
        <div v-if="filteredProfiles.length === 0" class="p-6 text-center text-base-content/60 bg-base-300/10 rounded-xl border border-base-content/5">
          {{ $t('admin.noProfiles') }}
        </div>
        
        <div 
          v-for="profile in filteredProfiles" 
          :key="profile.id" 
          class="p-4 rounded-xl border border-base-content/5 bg-base-200/10 flex flex-col gap-4"
          :class="profile.id === state.session?.user?.id ? 'border-primary/30 bg-primary/5' : ''"
        >
          <!-- Top info line: Avatar + Name/Details + Status -->
          <div class="flex items-start justify-between gap-3">
            <div class="flex items-center gap-3 min-w-0">
              <div class="w-10 h-10 rounded-full bg-gradient-to-br from-primary to-secondary text-white flex items-center justify-center font-bold text-lg shrink-0 shadow">
                {{ (profile.username || profile.email)[0].toUpperCase() }}
              </div>
              <div class="min-w-0">
                <div class="font-semibold text-base truncate flex items-center gap-1.5 flex-wrap">
                  <span class="truncate">{{ profile.username || $t('admin.noHandle') }}</span>
                  <span v-if="profile.id === state.session?.user?.id" class="badge badge-xs badge-primary text-[10px] py-1 font-bold shrink-0">{{ $t('admin.adminYou') }}</span>
                </div>
                <div class="text-xs text-base-content/60 truncate mt-0.5">{{ profile.email }}</div>
                <div v-if="profile.phone_number" class="text-xs text-base-content/50 mt-0.5 flex items-center gap-1">
                  <span>📞</span> <span class="truncate">{{ profile.phone_number }}</span>
                </div>
              </div>
            </div>
            
            <span class="badge badge-sm shrink-0" :class="profile.status === 'approved' ? 'badge-success' : profile.status === 'pending' ? 'badge-warning' : profile.status === 'rejected' ? 'badge-error' : 'badge-secondary'">
              {{ profile.status === 'approved' ? $t('settings.approved') : profile.status === 'pending' ? $t('settings.pending') : profile.status === 'rejected' ? $t('settings.rejected') : profile.status }}
            </span>
          </div>

          <!-- Action buttons row -->
          <div class="pt-3 border-t border-base-content/5">
            <div v-if="profile.id !== state.session?.user?.id" class="grid grid-cols-2 gap-2">
              <BaseButton v-if="profile.status === 'approved'" @click="handleImpersonate(profile)" variant="secondary" size="sm" class="w-full">
                {{ $t('admin.loginAs') }}
              </BaseButton>
              <BaseButton v-if="profile.status !== 'approved'" @click="handleStatusUpdate(profile.id, 'approved')" variant="secondary" size="sm" class="w-full">
                {{ $t('admin.approveBtn') }}
              </BaseButton>
              <BaseButton v-if="profile.status !== 'rejected'" @click="handleStatusUpdate(profile.id, 'rejected')" variant="secondary" size="sm" class="w-full">
                {{ $t('admin.rejectBtn') }}
              </BaseButton>
              <BaseButton v-if="profile.status === 'rejected'" @click="handleDelete(profile)" variant="danger" size="sm" class="w-full col-span-2">
                {{ $t('admin.deleteBtn') }}
              </BaseButton>
            </div>
            <div v-else class="text-center text-xs italic text-base-content/50">
              {{ $t('admin.protected') }}
            </div>
          </div>
        </div>
      </div>

      <!-- Desktop Table View -->
      <div class="hidden md:block overflow-x-auto">
        <table class="min-w-full">
          <thead>
            <tr>
              <th class="text-xs text-base-content/70 font-bold uppercase tracking-wider p-3">{{ $t('admin.thUser') }}</th>
              <th class="text-xs text-base-content/70 font-bold uppercase tracking-wider p-3">{{ $t('admin.thEmail') }}</th>
              <th class="text-xs text-base-content/70 font-bold uppercase tracking-wider p-3">{{ $t('admin.thStatus') }}</th>
              <th class="text-xs text-base-content/70 font-bold uppercase tracking-wider p-3 text-right">{{ $t('admin.thActions') }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-if="filteredProfiles.length === 0">
              <td colspan="4" class="p-6 text-center text-base-content/70">{{ $t('admin.noProfiles') }}</td>
            </tr>
            <tr v-for="profile in filteredProfiles" :key="profile.id" :class="profile.id === state.session?.user?.id ? 'bg-primary/6' : ''">
              <td class="p-3 align-top">
                <div class="flex items-center gap-3">
                  <div class="w-8 h-8 rounded-full bg-gradient-to-br from-primary to-secondary text-white flex items-center justify-center font-bold">{{ (profile.username || profile.email)[0].toUpperCase() }}</div>
                  <div>
                    <div class="font-semibold">{{ profile.username || $t('admin.noHandle') }}</div>
                    <div v-if="profile.id === state.session?.user?.id" class="text-xs text-primary uppercase font-bold">{{ $t('admin.adminYou') }}</div>
                  </div>
                </div>
              </td>
              <td class="p-3 align-top">
                <div>{{ profile.email }}</div>
                <div v-if="profile.phone_number" class="text-xs text-base-content/60 mt-0.5" title="Téléphone">
                  📞 {{ profile.phone_number }}
                </div>
              </td>
              <td class="p-3 align-top">
                <span class="badge" :class="profile.status === 'approved' ? 'badge-success' : profile.status === 'pending' ? 'badge-warning' : profile.status === 'rejected' ? 'badge-error' : 'badge-secondary'">{{ profile.status === 'approved' ? $t('settings.approved') : profile.status === 'pending' ? $t('settings.pending') : profile.status === 'rejected' ? $t('settings.rejected') : profile.status }}</span>
              </td>
              <td class="p-3 align-top text-right">
                <div v-if="profile.id !== state.session?.user?.id" class="inline-flex gap-2">
                  <BaseButton v-if="profile.status === 'approved'" @click="handleImpersonate(profile)" variant="secondary" size="sm">{{ $t('admin.loginAs') }}</BaseButton>
                  <BaseButton v-if="profile.status !== 'approved'" @click="handleStatusUpdate(profile.id, 'approved')" variant="secondary" size="sm">{{ $t('admin.approveBtn') }}</BaseButton>
                  <BaseButton v-if="profile.status !== 'rejected'" @click="handleStatusUpdate(profile.id, 'rejected')" variant="secondary" size="sm">{{ $t('admin.rejectBtn') }}</BaseButton>
                  <BaseButton v-if="profile.status === 'rejected'" @click="handleDelete(profile)" variant="danger" size="sm">{{ $t('admin.deleteBtn') }}</BaseButton>
                </div>
                <div v-else class="text-sm italic text-base-content/60">{{ $t('admin.protected') }}</div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </BaseCard>

    <!-- Communication Tab -->
    <BaseCard v-if="activeTab === 'communication'" class="p-4">
      <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <!-- Form compose column -->
        <div class="lg:col-span-1 flex flex-col gap-4">
          <div>
            <h3 class="text-lg font-semibold">{{ $t('admin.tabCommunication') }}</h3>
            <p class="text-xs text-base-content/60 mt-1">
              {{ $t('admin.adminPanelSubtitle') }}
            </p>
          </div>

          <form @submit.prevent="handleSendPush" class="space-y-4">
            <div>
              <label for="notif-title" class="text-sm font-semibold block mb-1">
                {{ $t('admin.notificationTitle') }}
              </label>
              <input
                id="notif-title"
                v-model="notifTitle"
                type="text"
                class="input input-bordered w-full"
                :placeholder="$t('admin.titlePlaceholder')"
                required
                :disabled="isSending"
                autocomplete="off"
              />
            </div>

            <div>
              <label for="notif-body" class="text-sm font-semibold block mb-1">
                {{ $t('admin.notificationBody') }}
              </label>
              <textarea
                id="notif-body"
                v-model="notifBody"
                class="textarea textarea-bordered w-full h-32 resize-none"
                :placeholder="$t('admin.bodyPlaceholder')"
                required
                :disabled="isSending"
              ></textarea>
            </div>

            <!-- Warning for users without Push -->
            <div v-if="hasSelectedNoPush && selectedRecipients.length > 0" class="p-3 bg-warning/10 border border-warning/20 rounded-xl text-warning text-xs">
              ⚠️ {{ $t('admin.someRecipientsNoPush') }}
            </div>

            <!-- Feedback Alert Banners -->
            <div v-if="sendResult" class="animate-fade-in">
              <div 
                v-if="sendResult.success" 
                class="p-3 bg-success/10 border border-success/20 rounded-xl text-success text-sm font-semibold"
              >
                {{ $t('admin.sendSuccess', { count: sendResult.count }) }}
              </div>
              <div 
                v-else 
                class="p-3 bg-error/10 border border-error/20 rounded-xl text-error text-sm font-semibold"
              >
                {{ sendResult.error }}
              </div>
            </div>

            <BaseButton
              type="submit"
              variant="primary"
              class="w-full"
              :loading="isSending"
              :disabled="isSending || selectedRecipients.length === 0"
            >
              {{ isSending ? $t('admin.sending') : $t('admin.sendPushBtn') }}
            </BaseButton>
          </form>
        </div>

        <!-- Checkbox Selection Column -->
        <div class="lg:col-span-2 flex flex-col gap-4">
          <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <h4 class="text-sm font-semibold">
              {{ $t('admin.selectRecipients') }} ({{ selectedRecipients.length }}/{{ sortedRecipients.length }})
            </h4>
            <div class="flex flex-wrap gap-1">
              <button
                type="button"
                @click="selectAllRecipients"
                class="btn btn-xs btn-outline"
              >
                {{ $t('admin.selectAll') }}
              </button>
              <button
                type="button"
                @click="selectActiveRecipients"
                class="btn btn-xs btn-outline btn-primary"
              >
                {{ $t('admin.selectActiveOnly') }}
              </button>
              <button
                type="button"
                @click="deselectAllRecipients"
                class="btn btn-xs btn-outline btn-ghost"
              >
                {{ $t('admin.deselectAll') }}
              </button>
            </div>
          </div>

          <!-- Search recipients -->
          <div class="w-full">
            <div class="input input-bordered flex items-center gap-2">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" class="h-4 w-4 opacity-70 shrink-0">
                <path fill-rule="evenodd" d="M9.965 11.026a5 5 0 1 1 1.06-1.06l2.755 2.754a.75.75 0 1 1-1.06 1.06l-2.755-2.754ZM10.5 7a3.5 3.5 0 1 1-7 0 3.5 3.5 0 0 1 7 0Z" clip-rule="evenodd" />
              </svg>
              <input
                v-model="searchRecipientQuery"
                type="text"
                class="grow input-reset"
                :placeholder="$t('admin.searchRecipientsPlaceholder')"
                autocomplete="off"
              />
            </div>
          </div>

          <!-- Scrollable checklist list -->
          <div class="border border-base-content/5 rounded-xl max-h-[380px] overflow-y-auto divide-y divide-base-content/5 bg-base-200/10">
            <div v-if="sortedRecipients.length === 0" class="p-8 text-center text-base-content/50">
              {{ $t('admin.noProfiles') }}
            </div>
            
            <div
              v-for="profile in sortedRecipients"
              :key="profile.id"
              class="flex items-center gap-4 p-3 hover:bg-base-200/30 cursor-pointer select-none transition-colors"
              @click="toggleRecipient(profile.id)"
            >
              <input
                type="checkbox"
                :value="profile.id"
                v-model="selectedRecipients"
                class="checkbox checkbox-primary checkbox-sm shrink-0"
                @click.stop
              />
              
              <div class="w-8 h-8 rounded-full bg-gradient-to-br from-primary to-secondary text-white flex items-center justify-center font-bold text-sm shrink-0">
                {{ (profile.username || profile.email)[0].toUpperCase() }}
              </div>

              <div class="flex-grow min-w-0 flex flex-col items-start text-left">
                <div class="font-semibold text-sm truncate flex items-center gap-1.5 w-full">
                  <span class="truncate">{{ profile.username || $t('admin.noHandle') }}</span>
                  <span v-if="profile.id === state.session?.user?.id" class="badge badge-xs badge-primary text-[10px] shrink-0">
                    {{ $t('admin.adminYou') }}
                  </span>
                </div>
                <div class="text-xs text-base-content/60 truncate w-full">{{ profile.email }}</div>
              </div>

              <div class="shrink-0">
                <span
                  class="badge badge-sm"
                  :class="profile.push_subscription && (!Array.isArray(profile.push_subscription) || profile.push_subscription.length > 0) ? 'badge-success bg-success/10 text-success border-success/20' : 'badge-neutral opacity-50'"
                >
                  {{ profile.push_subscription && (!Array.isArray(profile.push_subscription) || profile.push_subscription.length > 0) ? $t('admin.pushSubscriptionEnabled') : $t('admin.pushSubscriptionDisabled') }}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </BaseCard>
  </div>
  </PullToRefresh>
</template>

<style scoped>
/* Rely on Tailwind/DaisyUI for admin styles */
</style>
