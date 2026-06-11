<script setup>
import { ref, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { state, userGlobalStats, calculateSettlements, actions } from '../store'
import { useSupabase } from '../supabase'
import BaseButton from './ui/BaseButton.vue'
import BaseModal from './ui/BaseModal.vue'
import BaseCard from './ui/BaseCard.vue'
import BaseInput from './ui/BaseInput.vue'
import ErrorBanner from './ui/ErrorBanner.vue'

const { t, locale } = useI18n()
const { supabase } = useSupabase()
const newGroupName = ref('')
const errorMsg = ref('')
const isLoading = ref(false)
const createGroupDialog = ref(null)

onMounted(async () => {
  await actions.fetchGroups()
  
  // Direct console diagnostics for RLS and user status debugging
  console.log('[SplitPay Diagnostic] Current User Session:', state.session)
  console.log('[SplitPay Diagnostic] Local State Profile:', state.profile)
  console.log('[SplitPay Diagnostic] Is Local Admin:', state.isAdmin)

  const { data: pData, error: pErr } = await supabase.from('profiles').select('*')
  console.log('[SplitPay Diagnostic] DB Profiles Select Result:', pData, pErr)

  const { data: cData, error: cErr } = await supabase.from('app_config').select('*')
  console.log('[SplitPay Diagnostic] DB App Config Select Result:', cData, cErr)
})

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
  <div class="space-y-6">
    <!-- Header Greeting -->
    <div class="flex items-center justify-between">
      <div>
        <h1 class="text-2xl font-semibold">{{ $t('dashboard.welcome', { name: state.profile?.username }) }}</h1>
        <p class="text-sm text-base-content/70">{{ $t('dashboard.subtitle') }}</p>
      </div>
      <BaseButton @click="openCreateModal" variant="primary">
        <span class="mr-2">+</span> {{ $t('dashboard.createGroupBtn') }}
      </BaseButton>
    </div>

    <!-- Stats Summary Grid -->
    <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
      <BaseCard class="p-4">
        <div class="text-sm text-base-content/70">{{ $t('dashboard.owedToMe') }}</div>
        <div class="text-2xl font-bold text-success">{{ formatEuro(userGlobalStats.netOwedToMe) }}</div>
      </BaseCard>
      <BaseCard class="p-4">
        <div class="text-sm text-base-content/70">{{ $t('dashboard.iOwe') }}</div>
        <div class="text-2xl font-bold text-error">{{ formatEuro(userGlobalStats.netIOwe) }}</div>
      </BaseCard>
      <BaseCard class="p-4">
        <div class="text-sm text-base-content/70">{{ $t('dashboard.activeGroups') }}</div>
        <div class="text-2xl font-bold">{{ userGlobalStats.activeGroupsCount }}</div>
      </BaseCard>
    </div>

    <!-- Groups Grid -->
    <h2 class="text-xl font-semibold">{{ $t('dashboard.yourGroups') }}</h2>

    <BaseCard v-if="state.groups.length === 0" class="p-6 text-center">
      <div class="text-4xl mb-4">💸</div>
      <h3 class="text-lg font-semibold">{{ $t('dashboard.noGroupsTitle') }}</h3>
      <p class="text-sm text-base-content/70">{{ $t('dashboard.noGroupsDesc') }}</p>
      <BaseButton @click="openCreateModal" variant="secondary" class="mt-4">
        {{ $t('dashboard.createFirstGroup') }}
      </BaseButton>
    </BaseCard>

    <div v-else class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
      <BaseCard v-for="group in state.groups" :key="group.id" :to="`/group/${group.id}`" interactive class="p-4 flex justify-between items-center">
        <div>
          <h3 class="text-lg font-semibold">{{ group.name }}</h3>
          <p class="text-sm text-base-content/70">
            {{ $t('dashboard.memberCount', group.group_members?.length || 0, { count: group.group_members?.length || 0 }) }}
          </p>
        </div>
        <div :class="getGroupBalanceText(group).class === 'owed' ? 'text-success font-semibold' : getGroupBalanceText(group).class === 'owe' ? 'text-error font-semibold' : 'text-base-content/70 font-semibold'">
          {{ getGroupBalanceText(group).text }}
        </div>
      </BaseCard>
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
</template>

<style scoped>
/* minimal scoped styles (kept empty) */
</style>
