<script setup>
import { ref, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { state, userGlobalStats, calculateSettlements, getTableExpenses, actions } from '../store'
import { supabase } from '../supabase'
import BaseButton from './ui/BaseButton.vue'
import BaseModal from './ui/BaseModal.vue'
import BaseCard from './ui/BaseCard.vue'
import BaseInput from './ui/BaseInput.vue'
import ErrorBanner from './ui/ErrorBanner.vue'

const { t, locale } = useI18n()
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
  const expenses = getTableExpenses(group.id)
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
  <div class="dashboard">
    <!-- Header Greeting -->
    <div class="dashboard-header">
      <div>
        <h1>{{ $t('dashboard.welcome', { name: state.profile?.username }) }}</h1>
        <p class="subtitle">{{ $t('dashboard.subtitle') }}</p>
      </div>
      <BaseButton @click="openCreateModal" variant="primary">
        <span class="plus-icon">+</span> {{ $t('dashboard.createGroupBtn') }}
      </BaseButton>
    </div>

    <!-- Stats Summary Grid -->
    <div class="stat-grid">
      <BaseCard class="stat-card">
        <span class="stat-label">{{ $t('dashboard.owedToMe') }}</span>
        <span class="stat-value positive">{{ formatEuro(userGlobalStats.netOwedToMe) }}</span>
      </BaseCard>
      <BaseCard class="stat-card">
        <span class="stat-label">{{ $t('dashboard.iOwe') }}</span>
        <span class="stat-value negative">{{ formatEuro(userGlobalStats.netIOwe) }}</span>
      </BaseCard>
      <BaseCard class="stat-card">
        <span class="stat-label">{{ $t('dashboard.activeGroups') }}</span>
        <span class="stat-value">{{ userGlobalStats.activeGroupsCount }}</span>
      </BaseCard>
    </div>

    <!-- Groups Grid -->
    <h2 class="section-title">{{ $t('dashboard.yourGroups') }}</h2>

    <BaseCard v-if="state.groups.length === 0" class="empty-state">
      <div class="empty-state-icon">💸</div>
      <h3>{{ $t('dashboard.noGroupsTitle') }}</h3>
      <p>{{ $t('dashboard.noGroupsDesc') }}</p>
      <BaseButton @click="openCreateModal" variant="secondary" style="margin-top: 15px;">
        {{ $t('dashboard.createFirstGroup') }}
      </BaseButton>
    </BaseCard>

    <div v-else class="groups-grid">
      <BaseCard v-for="group in state.groups" :key="group.id" :to="`/group/${group.id}`"
        class="group-card" interactive>
        <div class="group-info">
          <h3>{{ group.name }}</h3>
          <p class="member-count">
            {{ $t('dashboard.memberCount', group.group_members?.length || 0, {
              count: group.group_members?.length || 0
            }) }}
          </p>
        </div>
        <div class="group-balance" :class="getGroupBalanceText(group).class">
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
.dashboard-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 30px;
}

.subtitle {
  color: var(--text-muted);
  font-size: 0.95rem;
  margin-top: 4px;
}

.plus-icon {
  font-size: 1.2rem;
  font-weight: 700;
  line-height: 1;
}

.section-title {
  margin-bottom: 20px;
  font-size: 1.4rem;
}

.groups-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 20px;
}

.group-card {
  display: flex;
  justify-content: space-between;
  align-items: center;
  text-decoration: none;
  color: inherit;
}

.group-info h3 {
  font-size: 1.15rem;
  margin-bottom: 4px;
}

.member-count {
  font-size: 0.85rem;
  color: var(--text-muted);
}

.group-balance {
  font-weight: 600;
  font-size: 0.9rem;
}

.group-balance.owed {
  color: var(--color-success);
}

.group-balance.owe {
  color: var(--color-danger);
}

.group-balance.settled {
  color: var(--text-muted);
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
</style>
