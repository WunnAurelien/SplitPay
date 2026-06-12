<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { state, activeGroupCalculations, actions } from '../store'
import { useSupabase } from '../supabase'
import { teardownGroupChannel } from '../realtime'
import BaseButton from './ui/BaseButton.vue'
import BaseModal from './ui/BaseModal.vue'
import BaseCard from './ui/BaseCard.vue'
import BaseInput from './ui/BaseInput.vue'
import ErrorBanner from './ui/ErrorBanner.vue'
import PullToRefresh from './ui/PullToRefresh.vue'

const handleRefresh = async () => {
  if (!groupId) return
  await actions.fetchGroupDetails(groupId)
}

const route = useRoute()
const router = useRouter()
const groupId = route.params.id
const { t, locale } = useI18n()
const { supabase } = useSupabase()

// Modal refs
const addExpenseDialog = ref(null)
const addMemberDialog = ref(null)
const settleUpDialog = ref(null)
const noteDialog = ref(null)

// Member Note State
const selectedNoteMember = ref(null)
const memberNote = ref('')
const isNoteLoading = ref(false)
const noteError = ref('')

// Settle Up Modal State
const activeSettleTx = ref(null)
const phoneCopied = ref(false)
const ibanCopied = ref(false)
const linkCopied = ref(false)
const isSettleLoading = ref(false)
const selectedPaymentMethod = ref('cash') // 'cash', 'link', 'wero', 'iban'



// Add Expense Form State
const expenseDesc = ref('')
const expenseAmount = ref('')
const expensePayer = ref('')
const splitType = ref('equal') // 'equal' or 'custom'
const customParts = ref({}) // profileId -> parts (string/number)
const expenseError = ref('')
const isExpenseLoading = ref(false)

// Add Member Form State (Deprecated, replaced by invite link but kept for form handlers)
const selectedProfileId = ref('')
const memberError = ref('')
const isMemberLoading = ref(false)

const inviteCopied = ref(false)
const copyInviteLink = async () => {
  try {
    const basePath = window.location.pathname.replace(/\/?$/, '/')
    const url = `${window.location.origin}${basePath}#/group/${groupId}/join`
    await navigator.clipboard.writeText(url)
    inviteCopied.value = true
    setTimeout(() => {
      inviteCopied.value = false
    }, 2000)
  } catch (err) {
    console.error('Failed to copy link:', err)
  }
}

onMounted(async () => {
  await actions.fetchGroupDetails(groupId)
  // Set default payer to current user
  expensePayer.value = state.session?.user?.id || ''
  initializeCustomParts()
})

// Nettoyer le channel Realtime du groupe quand on quitte la page
onUnmounted(() => {
  teardownGroupChannel(groupId)
})

const initializeCustomParts = () => {
  if (state.activeGroup?.members) {
    state.activeGroup.members.forEach(m => {
      customParts.value[m.id] = 1
    })
  }
}

// Compute profiles that are not yet in the group
const addableProfiles = computed(() => {
  if (!state.profiles || !state.activeGroup?.members) return []
  const memberIds = state.activeGroup.members.map(m => m.id)
  return state.profiles.filter(p => !memberIds.includes(p.id))
})

const pendingRepayments = computed(() => {
  if (!state.activeGroup?.expenses) return []
  return state.activeGroup.expenses.filter(e => e.is_pending)
})

const isConfirmingRepayment = ref({})

const handleConfirmRepayment = async (expenseId) => {
  isConfirmingRepayment.value[expenseId] = true
  try {
    await actions.confirmExpense(groupId, expenseId)
  } catch (e) {
    await actions.alert({
      title: t('common.error'),
      message: e.message,
      okText: 'OK'
    })
  } finally {
    isConfirmingRepayment.value[expenseId] = false
  }
}

const getPayerName = (payerId) => {
  const m = state.activeGroup?.members?.find(mem => mem.id === payerId)
  return m ? (m.username || m.email) : t('admin.noHandle')
}

const formatEuro = (amount) => {
  const val = parseFloat(amount || 0)
  return locale.value === 'fr'
    ? `${val.toFixed(2).replace('.', ',')} €`
    : `€${val.toFixed(2)}`
}

// Compute how an expense is split for displaying
const getExpenseSplitSummary = (expense) => {
  const beneficiaries = expense.expense_beneficiaries || []
  if (beneficiaries.length === 0) return t('group.noSplitDetails')
  
  // Check if all parts are equal
  const partsList = beneficiaries.map(b => parseFloat(b.parts))
  const firstPart = partsList[0]
  const allEqual = partsList.every(p => Math.abs(p - firstPart) < 0.0001) && beneficiaries.length === state.activeGroup?.members?.length

  if (allEqual) return t('group.splitEqually')

  return t('group.splitCustom', {
    details: beneficiaries.map(b => {
      const name = b.profiles?.username || b.profiles?.email || t('admin.noHandle')
      const partsVal = parseFloat(b.parts)
      const partsLabel = t('group.partsCount', partsVal, { count: partsVal })
      return `${name} (${partsLabel})`
    }).join(', ')
  })
}

// Edit/Delete Permissions
const canDeleteExpense = (expense) => {
  const currentUserId = state.session?.user?.id
  return (
    state.isAdmin ||
    expense.paid_by === currentUserId ||
    state.activeGroup?.createdBy === currentUserId
  )
}

const canRemoveMember = (profileId) => {
  const currentUserId = state.session?.user?.id
  return (
    state.isAdmin ||
    profileId === currentUserId || // Can leave themselves
    state.activeGroup?.createdBy === currentUserId // Group creator can remove members
  )
}

const getMemberBalance = (memberId) => {
  if (!activeGroupCalculations.value?.balances) return 0
  const bal = activeGroupCalculations.value.balances.find(b => b.profileId === memberId)
  return bal ? bal.netBalance : 0
}

// Dialog open/close methods
const openExpenseModal = () => {
  expenseDesc.value = ''
  expenseAmount.value = ''
  expensePayer.value = state.session?.user?.id || ''
  splitType.value = 'equal'
  initializeCustomParts()
  expenseError.value = ''
  addExpenseDialog.value.showModal()
}

const closeExpenseModal = () => {
  addExpenseDialog.value.close()
}

const openMemberModal = () => {
  selectedProfileId.value = ''
  memberError.value = ''
  addMemberDialog.value.showModal()
}

const closeMemberModal = () => {
  addMemberDialog.value.close()
}

const openNoteModal = (member) => {
  selectedNoteMember.value = member
  memberNote.value = member.note || ''
  noteError.value = ''
  noteDialog.value.showModal()
}

const closeNoteModal = () => {
  noteDialog.value.close()
  selectedNoteMember.value = null
  memberNote.value = ''
}

const handleSaveNote = async () => {
  if (!selectedNoteMember.value) return
  isNoteLoading.value = true
  noteError.value = ''
  try {
    await actions.updateGroupMemberNote(groupId, selectedNoteMember.value.id, memberNote.value.trim())
    closeNoteModal()
  } catch (err) {
    noteError.value = err.message || t('group.saveNoteError') || 'Impossible d\'enregistrer la note.'
  } finally {
    isNoteLoading.value = false
  }
}

// Form Handlers
const handleAddExpense = async () => {
  if (!expenseDesc.value.trim() || !expenseAmount.value || parseFloat(expenseAmount.value) <= 0) return
  isExpenseLoading.value = true
  expenseError.value = ''

  try {
    const splits = []
    if (splitType.value === 'equal') {
      state.activeGroup.members.forEach(m => {
        splits.push({ profileId: m.id, parts: 1 })
      })
    } else {
      let totalParts = 0
      state.activeGroup.members.forEach(m => {
        const parts = parseFloat(customParts.value[m.id]) || 0
        if (parts > 0) {
          splits.push({ profileId: m.id, parts })
          totalParts += parts
        }
      })
      if (splits.length === 0 || totalParts <= 0) {
        throw new Error(t('group.splitPartsError'))
      }
    }

    await actions.addExpense({
      groupId,
      description: expenseDesc.value.trim(),
      amount: expenseAmount.value,
      paidBy: expensePayer.value,
      splits
    })

    closeExpenseModal()
  } catch (err) {
    expenseError.value = err.message || t('group.addExpenseError')
  } finally {
    isExpenseLoading.value = false
  }
}

const handleAddMember = async () => {
  if (!selectedProfileId.value) return
  isMemberLoading.value = true
  memberError.value = ''

  try {
    await actions.addGroupMember(groupId, selectedProfileId.value)
    closeMemberModal()
  } catch (err) {
    memberError.value = err.message || t('group.addMemberError')
  } finally {
    isMemberLoading.value = false
  }
}

const handleRemoveMember = async (profileId) => {
  const m = state.activeGroup.members.find(mem => mem.id === profileId)
  const name = m ? (m.username || m.email) : t('admin.noHandle')
  
  const msg = profileId === state.session.user.id
    ? t('group.confirmRemoveSelf')
    : t('group.confirmRemoveMember', { name })
      
  const ok = await actions.confirm({
    title: profileId === state.session.user.id ? t('group.leave') || 'Quitter' : t('group.remove') || 'Retirer',
    message: msg,
    confirmText: profileId === state.session.user.id ? t('group.leave') || 'Quitter' : t('group.remove') || 'Retirer',
    cancelText: t('common.cancel') || 'Annuler'
  })
  if (ok) {
    await actions.removeGroupMember(groupId, profileId)
    if (profileId === state.session.user.id) {
      router.push('/')
    }
  }
}

const handleDeleteExpense = async (expenseId, description) => {
  const ok = await actions.confirm({
    title: t('group.deleteExpenseTitle') || 'Supprimer la dépense',
    message: t('group.confirmDeleteExpense', { description }),
    confirmText: t('common.confirm') || 'Confirmer',
    cancelText: t('common.cancel') || 'Annuler'
  })
  if (ok) {
    try {
      await actions.deleteExpense(groupId, expenseId)
    } catch (e) {
      await actions.alert({
        title: t('common.error'),
        message: e.message,
        okText: 'OK'
      })
    }
  }
}

const handleRejectRepayment = async (expenseId, description) => {
  const ok = await actions.confirm({
    title: t('group.declineRepaymentTitle'),
    message: t('group.declineRepaymentConfirm', { description }),
    confirmText: t('group.declineRepaymentBtn'),
    cancelText: t('common.cancel')
  })
  if (ok) {
    isConfirmingRepayment.value[expenseId] = true
    try {
      await actions.deleteExpense(groupId, expenseId)
    } catch (e) {
      await actions.alert({
        title: t('common.error'),
        message: e.message,
        okText: 'OK'
      })
    } finally {
      isConfirmingRepayment.value[expenseId] = false
    }
  }
}

const isRequestingRepayment = ref({})

const handleRequestRepayment = async (transaction, idx) => {
  const debtor = state.activeGroup?.members?.find(m => m.id === transaction.fromId)
  if (!debtor) {
    await actions.alert({
      title: t('common.error'),
      message: t('group.debtorNotFound'),
      okText: 'OK'
    })
    return
  }

  if (!debtor.push_subscription) {
    await actions.alert({
      title: t('settings.notificationsDisabled'),
      message: t('group.requestRepaymentNoPush'),
      okText: 'OK'
    })
    return
  }

  const confirmMsg = t('group.requestRepaymentConfirm', { amount: formatEuro(transaction.amount), name: debtor.username || debtor.email })
  
  const ok = await actions.confirm({
    title: t('group.request'),
    message: confirmMsg,
    confirmText: t('common.confirm'),
    cancelText: t('common.cancel')
  })

  if (!ok) return

  isRequestingRepayment.value[idx] = true
  try {
    const senderName = state.profile?.username || state.profile?.email || t('admin.noHandle')
    const { data, error } = await supabase.functions.invoke('send-push', {
      body: {
        recipientIds: [transaction.fromId],
        type: 'request_repayment',
        params: {
          senderName: senderName,
          amount: transaction.amount,
          groupName: state.activeGroup?.name || 'Groupe'
        },
        url: `/SplitPay/group/${groupId}`
      }
    })

    if (error) throw error

    await actions.alert({
      title: t('common.success'),
      message: t('group.requestRepaymentSuccess', { amount: formatEuro(transaction.amount), name: debtor.username || debtor.email }),
      okText: 'OK'
    })
  } catch (err) {
    console.error('Error sending request notification:', err)
    await actions.alert({
      title: t('common.error'),
      message: t('group.requestRepaymentFailed') + ` (${err.message})`,
      okText: 'OK'
    })
  } finally {
    isRequestingRepayment.value[idx] = false
  }
}

// Settle Up Handler (Opens choice dialog)
const handleSettleUp = (transaction) => {
  activeSettleTx.value = transaction
  phoneCopied.value = false
  ibanCopied.value = false
  linkCopied.value = false
  
  // Select default method based on what the receiver has configured
  if (transaction.paymentLink) {
    selectedPaymentMethod.value = 'link'
  } else if (transaction.phoneNumber) {
    selectedPaymentMethod.value = 'wero'
  } else if (transaction.iban) {
    selectedPaymentMethod.value = 'iban'
  } else {
    selectedPaymentMethod.value = 'cash'
  }

  settleUpDialog.value.showModal()
}

const closeSettleUpModal = () => {
  settleUpDialog.value.close()
  activeSettleTx.value = null
}

const copyToClipboard = async (text, refFlag) => {
  try {
    await navigator.clipboard.writeText(text)
    if (refFlag === 'phone') {
      phoneCopied.value = true
      setTimeout(() => phoneCopied.value = false, 2000)
    } else if (refFlag === 'iban') {
      ibanCopied.value = true
      setTimeout(() => ibanCopied.value = false, 2000)
    } else if (refFlag === 'link') {
      linkCopied.value = true
      setTimeout(() => linkCopied.value = false, 2000)
    }
  } catch (err) {
    console.error('Failed to copy:', err)
  }
}

const confirmSettleUpPayment = async () => {
  if (!activeSettleTx.value) return
  isSettleLoading.value = true
  try {
    let methodDetail = ''
    if (selectedPaymentMethod.value === 'wero') {
      methodDetail = ` (${t('settings.phoneNumberLabel') || 'Wero'})`
    } else if (selectedPaymentMethod.value === 'iban') {
      methodDetail = ` (${t('settings.ibanLabel') || 'Virement'})`
    } else if (selectedPaymentMethod.value === 'link') {
      methodDetail = ` (${t('group.payLink') || 'Lien'})`
    } else {
      methodDetail = ` (${t('group.cashOrOther')})`
    }

    // Settle is represented as a payment expense where 'from' paid the amount
    // and 'to' is the sole beneficiary (1 part).
    await actions.addExpense({
      groupId,
      description: t('group.settledDescription', { from: activeSettleTx.value.fromName, to: activeSettleTx.value.toName }) + methodDetail,
      amount: activeSettleTx.value.amount,
      paidBy: activeSettleTx.value.fromId,
      splits: [{ profileId: activeSettleTx.value.toId, parts: 1 }],
      isPending: true
    })
    closeSettleUpModal()
  } catch (e) {
    await actions.alert({
      title: t('group.settleUpFailedTitle'),
      message: e.message,
      okText: 'OK'
    })
  } finally {
    isSettleLoading.value = false
  }
}

// Dialog backdrop click close fallbacks
const handleBackdropClick = (dialog, event) => {
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
  <div v-if="state.activeGroup" class="space-y-6">
    <!-- Header -->
    <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
      <div>
        <router-link to="/" class="text-sm font-semibold text-base-content/70">&larr; {{ $t('common.backToDashboard') }}</router-link>
        <h1 class="text-2xl font-semibold mt-2">{{ state.activeGroup.name }}</h1>
      </div>
      <div class="grid grid-cols-2 gap-3 w-full sm:w-auto sm:min-w-[300px]">
        <BaseButton @click="copyInviteLink" variant="secondary" size="sm" :class="inviteCopied ? 'bg-success/10 border-success/20 shadow' : ''">
          {{ inviteCopied ? $t('group.inviteCopied') : $t('group.inviteBtn') }}
        </BaseButton>
        <BaseButton @click="openExpenseModal" variant="primary" size="sm">
          {{ $t('group.addExpenseBtn') }}
        </BaseButton>
      </div>
    </div>

    <!-- Error state -->
    <ErrorBanner v-if="state.error" :error="state.error" style="margin-bottom: 20px;" />

    <!-- Main Grid -->
    <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <!-- Left Column: Expenses & Settlements -->
      <div class="lg:col-span-2 flex flex-col gap-6">
        <!-- Settlements Card -->
        <BaseCard class="settlements-section">
          <h3>{{ $t('group.settlementGuideTitle') }}</h3>
          <p class="section-desc">{{ $t('group.settlementGuideDesc') }}</p>
          
          <div v-if="!activeGroupCalculations || activeGroupCalculations.transactions.length === 0" class="settlements-empty">
            <span class="check-icon">✓</span> {{ $t('group.allSettled') }}
          </div>
          
          <div v-else class="transactions-list">
            <div 
              v-for="(tx, idx) in activeGroupCalculations.transactions" 
              :key="idx" 
              class="tx-row"
            >
              <div class="tx-info" v-html="$t('group.owesMessage', { from: tx.fromName, to: tx.toName, amount: formatEuro(tx.amount) })">
              </div>
              <div class="tx-actions" style="display: flex; gap: 8px; align-items: center;">
                <BaseButton 
                  v-if="(state.isAdmin || state.session.user.id === tx.fromId) && state.session.user.id !== tx.toId" 
                  @click="handleSettleUp(tx)" 
                  variant="primary" size="sm"
                  style="padding: 6px 12px; font-size: 0.75rem;"
                >
                  {{ $t('group.repay') }}
                </BaseButton>
                <BaseButton 
                  v-if="state.session?.user?.id === tx.toId" 
                  @click="handleRequestRepayment(tx, idx)" 
                  variant="secondary" size="sm"
                  class="text-cyan border-cyan/30 hover:bg-cyan/10 hover:text-cyan hover:border-cyan/50"
                  style="padding: 6px 12px; font-size: 0.75rem;"
                  :loading="isRequestingRepayment[idx]"
                  :disabled="isRequestingRepayment[idx]"
                >
                  {{ $t('group.request') }}
                </BaseButton>
              </div>
            </div>
          </div>
        </BaseCard>

        <!-- Pending Validation Reimbursements Card -->
        <BaseCard v-if="pendingRepayments.length > 0" class="pending-repayments-section">
          <h3>
            {{ $t('group.pendingConfirmation') }}
            <span class="pending-badge">{{ pendingRepayments.length }}</span>
          </h3>
          <p class="section-desc">
            {{ $t('group.pendingConfirmationDesc') }}
          </p>

          <div class="pending-repayments-list">
            <div 
              v-for="rep in pendingRepayments" 
              :key="rep.id" 
              class="pending-rep-row"
            >
              <div class="rep-meta">
                <div class="rep-title">
                  <span class="rep-payer-name">{{ getPayerName(rep.paid_by) }}</span>
                  <span class="rep-arrow">➔</span>
                  <span class="rep-receiver-name">
                    {{ rep.expense_beneficiaries?.[0]?.profiles?.username || rep.expense_beneficiaries?.[0]?.profiles?.email || '?' }}
                  </span>
                </div>
                <div class="rep-desc-text">{{ rep.description }}</div>
              </div>
              
              <div class="rep-actions-value">
                <span class="rep-amount">{{ formatEuro(rep.amount) }}</span>
                
                <!-- If logged in user is the receiver or admin -->
                <div v-if="state.isAdmin || state.session?.user?.id === rep.expense_beneficiaries?.[0]?.profile_id" style="display: flex; gap: 8px;">
                  <BaseButton 
                    @click="handleConfirmRepayment(rep.id)"
                    variant="primary" size="sm" class="confirm-rep-btn"
                    :disabled="isConfirmingRepayment[rep.id]"
                    :loading="isConfirmingRepayment[rep.id]"
                  >
                    <span>{{ $t('group.confirmBtn') }}</span>
                  </BaseButton>
                  <BaseButton 
                    @click="handleRejectRepayment(rep.id, rep.description)"
                    variant="secondary" size="sm" class="reject-rep-btn"
                    style="border-color: rgba(239, 68, 68, 0.3); color: var(--color-danger);"
                    :disabled="isConfirmingRepayment[rep.id]"
                  >
                    <span>{{ locale === 'fr' ? 'Refuser' : 'Decline' }}</span>
                  </BaseButton>
                </div>
                
                <!-- If logged in user is the sender (payer) -->
                <div v-else-if="state.session?.user?.id === rep.paid_by" style="display: flex; align-items: center; gap: 8px;">
                  <span class="awaiting-label">
                    ⏳ {{ $t('group.awaiting') }}
                  </span>
                  <BaseButton 
                    @click="handleDeleteExpense(rep.id, rep.description)"
                    variant="secondary" size="sm" class="cancel-rep-btn"
                    style="border-color: rgba(255, 255, 255, 0.1); color: var(--text-muted); padding: 4px 8px; font-size: 0.75rem;"
                  >
                    <span>{{ locale === 'fr' ? 'Annuler' : 'Cancel' }}</span>
                  </BaseButton>
                </div>

                <!-- Other group members -->
                <span v-else class="awaiting-label-generic">
                  ⏳ {{ $t('group.pending') }}
                </span>
              </div>
            </div>
          </div>
        </BaseCard>

        <!-- Expenses List Card -->
        <BaseCard class="expenses-section">
          <h3>{{ $t('group.expenseLogTitle') }}</h3>
          
          <div v-if="state.activeGroup.expenses.filter(e => !e.is_pending).length === 0" class="empty-log">
            <p>{{ $t('group.noExpensesLogged') }}</p>
            <BaseButton @click="openExpenseModal" variant="secondary" size="sm" style="margin-top: 10px;">
              {{ $t('group.logFirstExpenseBtn') }}
            </BaseButton>
          </div>

          <div v-else class="expenses-list">
              <div 
              v-for="expense in state.activeGroup.expenses.filter(e => !e.is_pending)" 
              :key="expense.id" 
              class="expense-row"
              :class="{ 'expense-deleted': expense.deleted_at }"
            >
              <div class="expense-meta">
                <div class="expense-title">
                  <h4 :class="{ 'text-strikethrough': expense.deleted_at }">{{ expense.description }}</h4>
                  <div class="expense-title-meta">
                    <span v-if="expense.deleted_at" class="deleted-badge">{{ $t('group.deleted') }}</span>
                    <span class="expense-payer">{{ $t('group.paidBy', { name: getPayerName(expense.paid_by) }) }}</span>
                  </div>
                </div>
                <div class="expense-split">
                  {{ getExpenseSplitSummary(expense) }}
                </div>
              </div>
              <div class="expense-value-actions">
                <span class="expense-amount" :class="{ 'text-strikethrough text-muted': expense.deleted_at }">{{ formatEuro(expense.amount) }}</span>
                <button 
                  v-if="canDeleteExpense(expense) && !expense.deleted_at"
                  @click="handleDeleteExpense(expense.id, expense.description)"
                  class="delete-btn"
                  :title="$t('group.deleteExpenseTitle')"
                >
                  &times;
                </button>
              </div>
            </div>
          </div>
        </BaseCard>
      </div>

      <!-- Right Column: Members Sidebar -->
      <div>
        <BaseCard class="p-4">
          <h3>{{ $t('group.membersTitle') }} ({{ state.activeGroup.members?.length || 0 }})</h3>
          
          <div class="members-list">
            <div 
              v-for="member in state.activeGroup.members" 
              :key="member.id"
              class="member-row"
            >
              <div class="member-profile">
                <div class="member-avatar">
                  {{ (member.username || member.email)[0].toUpperCase() }}
                </div>
                <div class="member-details">
                  <div class="member-name-row">
                    <span class="member-name">{{ member.username || member.email }}</span>
                    <span v-if="member.id === state.session?.user?.id" class="me-tag">({{ $t('group.you') }})</span>
                  </div>
                  <span 
                    v-if="getMemberBalance(member.id) !== 0" 
                    class="member-balance"
                    :class="{ 
                      'balance-positive': getMemberBalance(member.id) > 0, 
                      'balance-negative': getMemberBalance(member.id) < 0 
                    }"
                  >
                    {{ getMemberBalance(member.id) > 0 
                       ? $t('group.balanceCredit', { amount: formatEuro(getMemberBalance(member.id)) })
                       : $t('group.balanceOwes', { amount: formatEuro(Math.abs(getMemberBalance(member.id))) })
                    }}
                  </span>
                  <span v-else class="member-balance balance-zero">
                    {{ $t('group.balanceSettled') }}
                  </span>
                  <div class="mt-1 flex items-center gap-1.5 text-left">
                    <button 
                      @click="openNoteModal(member)"
                      class="p-0.5 hover:bg-base-300 rounded transition-colors text-base-content/60 hover:text-primary focus:outline-none flex-shrink-0 flex items-center justify-center"
                      :title="member.note ? $t('group.editNote') : $t('group.addNote')"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2.5" stroke="currentColor" class="w-3.5 h-3.5">
                        <path stroke-linecap="round" stroke-linejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L6.832 19.82a4.5 4.5 0 01-1.897 1.13l-2.685.8.8-2.685a4.5 4.5 0 011.13-1.897L16.863 4.487zm0 0L19.5 7.125" />
                      </svg>
                    </button>
                    <span v-if="member.note" class="text-xs text-base-content/60 italic max-w-[150px] truncate" :title="member.note">
                      {{ member.note }}
                    </span>
                  </div>
                </div>
              </div>
              <div class="member-actions" style="display: flex; gap: 6px; align-items: center;">
                <button 
                  v-if="canRemoveMember(member.id)"
                  @click="handleRemoveMember(member.id)"
                  class="remove-member-btn"
                  :title="member.id === state.session.user.id ? $t('group.confirmRemoveSelf') : $t('group.confirmRemoveMember', { name: member.username || member.email })"
                >
                  {{ member.id === state.session.user.id ? $t('group.leave') : $t('group.remove') }}
                </button>
              </div>
            </div>
          </div>
        </BaseCard>
      </div>
    </div>

    <!-- Modals -->
    <!-- 1. Add Expense Dialog -->
    <BaseModal 
      ref="addExpenseDialog" 
      :title="$t('group.addNewExpense')"
      @close="closeExpenseModal"
    >
      <form @submit.prevent="handleAddExpense">
        <ErrorBanner v-if="expenseError" :error="expenseError" />

        <BaseInput 
          id="exp-desc" 
          v-model="expenseDesc" 
          required 
          :label="$t('group.descriptionLabel')"
          :placeholder="t('group.descriptionPlaceholder')"
        />

        <BaseInput 
          type="number" 
          step="0.01" 
          id="exp-amount" 
          v-model="expenseAmount" 
          required 
          :label="$t('group.amountLabel')"
          placeholder="0.00"
          min="0.01"
        />

        <BaseInput 
          type="select"
          id="exp-payer" 
          v-model="expensePayer" 
          required
          :label="$t('group.whoPaidLabel')"
        >
          <option 
            v-for="m in state.activeGroup.members" 
            :key="m.id" 
            :value="m.id"
          >
            {{ m.username || m.email }}
          </option>
        </BaseInput>

        <div class="form-group">
          <label>{{ $t('group.splitMethodLabel') }}</label>
          <div class="split-toggle">
            <button 
              type="button" 
              :class="{ active: splitType === 'equal' }" 
              @click="splitType = 'equal'"
            >
              {{ $t('group.equally') }}
            </button>
            <button 
              type="button" 
              :class="{ active: splitType === 'custom' }" 
              @click="splitType = 'custom'"
            >
              {{ $t('group.customParts') }}
            </button>
          </div>
        </div>

        <!-- Custom Split Weight Section -->
        <div v-if="splitType === 'custom'" class="custom-split-section">
          <label>{{ $t('group.assignPartsLabel') }}</label>
          <div 
            v-for="m in state.activeGroup.members" 
            :key="m.id" 
            class="custom-split-row"
          >
            <span>{{ m.username || m.email }}</span>
            <input 
              type="number" 
              step="0.1" 
              min="0" 
              v-model="customParts[m.id]"
              placeholder="1"
              style="width: 80px; padding: 6px 10px;"
            />
          </div>
        </div>

        <div class="dialog-actions" style="display: flex; gap: 12px; justify-content: flex-end; margin-top: 24px;">
          <BaseButton type="button" @click="closeExpenseModal" variant="secondary" size="sm">
            {{ $t('common.cancel') }}
          </BaseButton>
          <BaseButton type="submit" variant="primary" size="sm" :loading="isExpenseLoading">
            {{ $t('group.logExpenseSubmit') }}
          </BaseButton>
        </div>
      </form>
    </BaseModal>

    <!-- 2. Add Member Dialog -->
    <BaseModal 
      ref="addMemberDialog" 
      :title="$t('group.addMemberToGroup')"
      @close="closeMemberModal"
    >
      <form @submit.prevent="handleAddMember">
        <ErrorBanner v-if="memberError" :error="memberError" />

        <BaseInput 
          v-if="addableProfiles.length > 0"
          type="select"
          id="member-select" 
          v-model="selectedProfileId" 
          required
          :label="$t('group.selectApprovedUser')"
        >
          <option value="" disabled>{{ $t('group.selectUserPlaceholder') }}</option>
          <option 
            v-for="p in addableProfiles" 
            :key="p.id" 
            :value="p.id"
          >
            {{ p.username || p.email }}
          </option>
        </BaseInput>

        <div v-else class="no-users-warning">
          {{ $t('group.noUsersWarning') }}
        </div>

        <div class="dialog-actions" style="display: flex; gap: 12px; justify-content: flex-end; margin-top: 24px;">
          <BaseButton type="button" @click="closeMemberModal" variant="secondary" size="sm">
            {{ $t('common.cancel') }}
          </BaseButton>
          <BaseButton 
            v-if="addableProfiles.length > 0" 
            type="submit" 
            variant="primary" size="sm" 
            :loading="isMemberLoading"
          >
            {{ $t('group.addMemberSubmit') }}
          </BaseButton>
        </div>
      </form>
    </BaseModal>

    <!-- 3. Settle Up (Repay) Dialog with Payment Method selection -->
    <BaseModal 
      ref="settleUpDialog" 
      :title="activeSettleTx ? $t('group.repayUserTitle', { name: activeSettleTx.toName }) : ''"
      @close="closeSettleUpModal"
    >
      <template v-if="activeSettleTx">
        <div class="settle-amount-banner">
          <span class="settle-label">{{ $t('group.amountOwed') }}</span>
          <span class="settle-val">{{ formatEuro(activeSettleTx.amount) }}</span>
        </div>

        <form @submit.prevent="confirmSettleUpPayment">
          <!-- Information Message -->
          <p class="settle-instructions">
            {{ $t('group.repayInstructions', { name: activeSettleTx.toName }) }}
          </p>

          <!-- Visual payment method selector cards -->
          <div class="settle-method-section">
            <label class="settle-method-title">
              {{ $t('group.selectPaymentMethod') }}
            </label>
            <div class="payment-method-selector-grid">
              <!-- Cash Card -->
              <label 
                class="method-selector-card" 
                :class="{ active: selectedPaymentMethod === 'cash' }"
              >
                <input 
                  type="radio" 
                  name="paymentMethod" 
                  value="cash" 
                  v-model="selectedPaymentMethod" 
                  class="sr-only" 
                />
                <span class="card-icon">💵</span>
                <span class="card-info">
                  <span class="card-label">{{ $t('group.paymentMethodCash') }}</span>
                </span>
                <span class="card-radio-indicator"></span>
              </label>

              <!-- Link Card -->
              <label 
                v-if="activeSettleTx.paymentLink"
                class="method-selector-card" 
                :class="{ active: selectedPaymentMethod === 'link' }"
              >
                <input 
                  type="radio" 
                  name="paymentMethod" 
                  value="link" 
                  v-model="selectedPaymentMethod" 
                  class="sr-only" 
                />
                <span class="card-icon">🔗</span>
                <span class="card-info">
                  <span class="card-label">{{ $t('group.paymentMethodLink') }}</span>
                </span>
                <span class="card-radio-indicator"></span>
              </label>

              <!-- Wero Card -->
              <label 
                v-if="activeSettleTx.phoneNumber"
                class="method-selector-card" 
                :class="{ active: selectedPaymentMethod === 'wero' }"
              >
                <input 
                  type="radio" 
                  name="paymentMethod" 
                  value="wero" 
                  v-model="selectedPaymentMethod" 
                  class="sr-only" 
                />
                <span class="card-icon">📱</span>
                <span class="card-info">
                  <span class="card-label">Wero</span>
                </span>
                <span class="card-radio-indicator"></span>
              </label>

              <!-- IBAN Card -->
              <label 
                v-if="activeSettleTx.iban"
                class="method-selector-card" 
                :class="{ active: selectedPaymentMethod === 'iban' }"
              >
                <input 
                  type="radio" 
                  name="paymentMethod" 
                  value="iban" 
                  v-model="selectedPaymentMethod" 
                  class="sr-only" 
                />
                <span class="card-icon">🏦</span>
                <span class="card-info">
                  <span class="card-label">{{ $t('group.paymentMethodIban') }}</span>
                </span>
                <span class="card-radio-indicator"></span>
              </label>
            </div>
          </div>

          <!-- Direct Payment Info (Only for selected method) -->
          <div class="payment-info-list">
            
            <!-- Wero Card -->
            <div v-if="selectedPaymentMethod === 'wero' && activeSettleTx.phoneNumber" class="info-card-detail">
              <div class="card-header-icon">
                <span class="m-icon">📱</span>
                <div>
                  <h4>Wero (Virement Instantané)</h4>
                  <p class="m-hint">{{ $t('group.sendWeroTo') }}</p>
                </div>
              </div>
              <div class="copy-value-box">
                <span class="value-text">{{ activeSettleTx.phoneNumber }}</span>
                <button type="button" @click="copyToClipboard(activeSettleTx.phoneNumber, 'phone')" class="copy-btn-sm" :class="{ 'copied-success': phoneCopied }" style="min-width: 110px;">
                  {{ phoneCopied ? $t('group.copied') : $t('group.copy') }}
                </button>
              </div>
            </div>

            <!-- IBAN Card -->
            <div v-if="selectedPaymentMethod === 'iban' && activeSettleTx.iban" class="info-card-detail">
              <div class="card-header-icon">
                <span class="m-icon">🏦</span>
                <div>
                  <h4>Virement Bancaire (IBAN)</h4>
                  <p class="m-hint">{{ $t('group.sendIbanTo') }}</p>
                </div>
              </div>
              <div class="copy-value-box column-layout">
                <span class="value-text iban-text">{{ activeSettleTx.iban }}</span>
                <BaseButton type="button" @click="copyToClipboard(activeSettleTx.iban, 'iban')" variant="secondary" size="sm" style="width: 100%; margin-top: 8px;" :class="{ 'copied-success': ibanCopied }">
                  {{ ibanCopied ? $t('group.ibanCopied') : $t('group.copyIban') }}
                </BaseButton>
              </div>
            </div>

            <!-- Payment Link Card -->
            <div v-if="selectedPaymentMethod === 'link' && activeSettleTx.paymentLink" class="info-card-detail">
              <div class="card-header-icon">
                <span class="m-icon">🔗</span>
                <div>
                  <h4>{{ $t('group.payLink') || 'Lien de paiement' }}</h4>
                  <p class="m-hint">{{ $t('group.payPaypalTo') }}</p>
                </div>
              </div>
              <div class="detail-action-row" style="margin-top: 8px;">
                <a :href="activeSettleTx.paymentLink" target="_blank" class="btn btn-secondary btn-sm" style="flex: 1; text-align: center; display: inline-flex; align-items: center; justify-content: center;">
                  🌐 {{ $t('group.openLink') }}
                </a>
                <BaseButton type="button" @click="copyToClipboard(activeSettleTx.paymentLink, 'link')" variant="secondary" size="sm" style="flex: 1; min-width: 140px;" :class="{ 'copied-success': linkCopied }">
                  {{ linkCopied ? $t('group.linkCopied') : $t('group.copyLink') }}
                </BaseButton>
              </div>
            </div>

            <!-- Cash / Other Option Card (Always active for fallback info) -->
            <div v-if="selectedPaymentMethod === 'cash'" class="info-card-detail info-card-fallback">
              <div class="card-header-icon" style="margin-bottom: 0;">
                <span class="m-icon">💵</span>
                <div>
                  <h4>{{ $t('group.cashOtherTitle') }}</h4>
                  <p class="m-hint" style="margin-bottom: 0;">
                    {{ $t('group.cashOtherDesc') }}
                  </p>
                </div>
              </div>
            </div>

          </div>

          <p class="method-helper-text">
            {{ $t('group.paymentHistoryDesc') }}
          </p>

          <div class="dialog-actions" style="display: flex; gap: 12px; justify-content: flex-end; margin-top: 24px;">
            <BaseButton type="button" @click="closeSettleUpModal" variant="secondary" size="sm">
              {{ $t('common.cancel') }}
            </BaseButton>
            <BaseButton type="submit" variant="primary" size="sm" :loading="isSettleLoading">
              <span>{{ $t('group.declareRepayment') }}</span>
            </BaseButton>
          </div>
        </form>
      </template>
    </BaseModal>

    <!-- 4. Edit Member Note Dialog -->
    <BaseModal 
      ref="noteDialog" 
      :title="selectedNoteMember ? $t('group.noteModalTitle', { name: selectedNoteMember.username || selectedNoteMember.email }) : ''"
      @close="closeNoteModal"
    >
      <form @submit.prevent="handleSaveNote">
        <ErrorBanner v-if="noteError" :error="noteError" />

        <BaseInput 
          type="textarea"
          id="member-note-input" 
          v-model="memberNote" 
          :label="$t('group.noteLabel')"
          :placeholder="t('group.notePlaceholder')"
          rows="3"
        />

        <div class="dialog-actions" style="display: flex; gap: 12px; justify-content: flex-end; margin-top: 24px;">
          <BaseButton type="button" @click="closeNoteModal" variant="secondary" size="sm">
            {{ $t('common.cancel') }}
          </BaseButton>
          <BaseButton type="submit" variant="primary" size="sm" :loading="isNoteLoading">
            {{ $t('group.saveNote') }}
          </BaseButton>
        </div>
      </form>
    </BaseModal>
  </div>
  <ErrorBanner v-else-if="state.error" :error="state.error" :title="$t('common.errorConfig')" global>
    <router-link to="/" class="btn btn-secondary btn-sm" style="margin-top: 15px; display: inline-block;">
      &larr; {{ $t('common.backToDashboard') }}
    </router-link>
  </ErrorBanner>
  <div v-else class="empty-state">
    {{ $t('group.loadingGroup') }}
  </div>
  </PullToRefresh>
</template>


<style scoped>
.back-link {
  font-size: 0.85rem;
  font-weight: 600;
  display: inline-block;
  margin-bottom: 8px;
  color: var(--text-muted);
}
.back-link:hover {
  color: var(--text-primary);
}

.group-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 30px;
}

.action-buttons {
  display: flex;
  gap: 12px;
  align-items: center; /* Empêche l'étirement vertical */
}

.invite-btn {
  min-width: 170px;
}

@media (max-width: 640px) {
  .group-header {
    flex-direction: column;
    align-items: flex-start;
    gap: 16px;
  }
  .action-buttons {
    width: 100%;
  }
  .action-buttons > * {
    flex: 1;
    justify-content: center;
    padding-left: 8px;
    padding-right: 8px;
  }
  .invite-btn {
    min-width: 0;
  }
}

.group-grid {
  display: grid;
  grid-template-columns: 2fr 1fr;
  gap: 30px;
}

@media (max-width: 768px) {
  .group-grid {
    grid-template-columns: 1fr;
  }
}

.left-column {
  display: flex;
  flex-direction: column;
  gap: 30px;
}

.section-desc {
  color: var(--text-muted);
  font-size: 0.85rem;
  margin: 4px 0 16px 0;
}

/* Settlements List */
.settlements-empty {
  padding: 12px;
  background-color: var(--color-success-bg);
  color: var(--color-success);
  border: 1px solid rgba(16, 185, 129, 0.2);
  border-radius: 12px;
  font-size: 0.9rem;
  font-weight: 600;
}

.check-icon {
  margin-right: 6px;
}

.transactions-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.tx-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 16px;
  background: rgba(255, 255, 255, 0.02);
  border: 1px solid var(--border-color);
  border-radius: 12px;
}

.tx-info {
  font-size: 0.95rem;
}

.tx-amount {
  font-family: 'Outfit', sans-serif;
  font-weight: 700;
  color: var(--accent-cyan);
  margin-left: 8px;
  font-size: 1.1rem;
}

.tx-actions {
  display: flex;
  gap: 8px;
}

/* Expenses Log */
.empty-log {
  padding: 40px;
  text-align: center;
  color: var(--text-muted);
}

.expenses-list {
  display: flex;
  flex-direction: column;
  gap: 16px;
  margin-top: 15px;
}

.expense-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px;
  background: rgba(255, 255, 255, 0.02);
  border: 1px solid var(--border-color);
  border-radius: 16px;
  transition: border-color 0.2s;
}

.expense-row:hover {
  border-color: rgba(255, 255, 255, 0.12);
}

.expense-title {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.expense-title h4 {
  font-size: 1.05rem;
  margin: 0;
}

.expense-title-meta {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}

.expense-payer {
  font-size: 0.75rem;
  color: var(--text-muted);
}

.expense-split {
  font-size: 0.8rem;
  color: var(--text-dark);
  margin-top: 6px;
  max-width: 450px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.expense-value-actions {
  display: flex;
  align-items: center;
  gap: 16px;
}

.expense-amount {
  font-family: 'Outfit', sans-serif;
  font-weight: 700;
  font-size: 1.25rem;
}

.delete-btn {
  background: transparent;
  border: none;
  color: var(--text-dark);
  font-size: 1.5rem;
  cursor: pointer;
  line-height: 1;
  transition: color 0.2s;
}

.delete-btn:hover {
  color: var(--color-danger);
}

.expense-deleted {
  opacity: 0.6;
  background: rgba(0, 0, 0, 0.02);
}

.text-strikethrough {
  text-decoration: line-through;
}

.text-muted {
  color: var(--text-muted);
}

.deleted-badge {
  font-size: 0.65rem;
  background: var(--color-danger);
  color: white;
  padding: 2px 7px;
  border-radius: 5px;
  font-weight: 700;
  line-height: 1.4;
  white-space: nowrap;
  flex-shrink: 0;
}

/* Members Card */
.members-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin-top: 15px;
}

.member-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px 12px;
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.01);
  border: 1px solid transparent;
}

.member-profile {
  display: flex;
  align-items: center;
  gap: 10px;
}

.member-avatar {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  background: linear-gradient(135deg, var(--accent-purple), var(--accent-cyan));
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 700;
  font-size: 0.85rem;
  color: #fff;
}

.member-details {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.member-name {
  font-size: 0.9rem;
  font-weight: 600;
}

.member-name-row {
  display: flex;
  align-items: center;
  gap: 6px;
}

.me-tag {
  font-size: 0.65rem;
  color: var(--accent-cyan);
  background: rgba(6, 182, 212, 0.1);
  padding: 1px 5px;
  border-radius: 4px;
  font-weight: 600;
}

.member-balance {
  font-size: 0.72rem;
  font-weight: 600;
  letter-spacing: 0.01em;
}

.member-balance.balance-positive {
  color: var(--color-success);
}

.member-balance.balance-negative {
  color: var(--color-danger);
}

.member-balance.balance-zero {
  color: var(--text-dark);
  font-weight: 500;
}


.remove-member-btn {
  background: none;
  border: none;
  color: var(--text-dark);
  font-size: 0.75rem;
  font-weight: 600;
  cursor: pointer;
  transition: color 0.2s;
}

.remove-member-btn:hover {
  color: var(--color-danger);
}

/* Dialog Forms split method toggle */
.split-toggle {
  display: flex;
  border: 1px solid var(--glass-border);
  border-radius: 12px;
  overflow: hidden;
  margin-top: 6px;
}

.split-toggle button {
  flex: 1;
  background: transparent;
  border: 0;
  color: var(--text-muted);
  padding: 10px;
  font-family: inherit;
  font-size: 0.85rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
}

.split-toggle button.active {
  background: var(--accent-purple);
  color: #fff;
}

.custom-split-section {
  background: rgba(255, 255, 255, 0.02);
  border-radius: 12px;
  padding: 16px;
  margin-top: 15px;
  border: 1px solid var(--border-color);
}

.custom-split-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}
.custom-split-row:last-child {
  margin-bottom: 0;
}

.custom-split-row span {
  font-size: 0.9rem;
  color: var(--text-muted);
}

.no-users-warning {
  padding: 15px;
  background: rgba(255, 255, 255, 0.02);
  border: 1px dashed var(--border-color);
  color: var(--text-muted);
  font-size: 0.9rem;
  border-radius: 12px;
  text-align: center;
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

.invite-success-btn {
  background: rgba(16, 185, 129, 0.1) !important;
  color: var(--accent-green) !important;
  border-color: rgba(16, 185, 129, 0.3) !important;
  box-shadow: 0 0 12px rgba(16, 185, 129, 0.15);
}

/* Settle Up customized modal styling */
.settle-amount-banner {
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid var(--border-color);
  border-radius: 16px;
  padding: 16px 20px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
}

.settle-label {
  color: var(--text-muted);
  font-size: 0.95rem;
  font-weight: 500;
}

.settle-val {
  color: var(--accent-green);
  font-size: 1.6rem;
  font-weight: 700;
}

.settle-instructions {
  font-size: 0.9rem;
  color: var(--text-muted);
  line-height: 1.5;
  margin: 0 0 20px 0;
}

.payment-info-list {
  display: flex;
  flex-direction: column;
  gap: 16px;
  margin-bottom: 20px;
}

.info-card-detail {
  background: rgba(255, 255, 255, 0.02);
  border: 1px solid var(--border-color);
  border-radius: 14px;
  padding: 16px;
  transition: all 0.2s;
}

.info-card-detail:hover {
  background: rgba(255, 255, 255, 0.04);
  border-color: rgba(255, 255, 255, 0.15);
}

.info-card-fallback {
  border-style: dashed;
  background: transparent;
}

.card-header-icon {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  margin-bottom: 12px;
  text-align: left;
}

.card-header-icon h4 {
  font-size: 0.95rem;
  font-weight: 600;
  color: var(--text-primary);
  margin: 0 0 4px 0;
}

.m-icon {
  font-size: 1.4rem;
  line-height: 1;
}

.m-hint {
  font-size: 0.75rem;
  color: var(--text-muted);
  margin: 0;
}

.copy-value-box {
  background: rgba(0, 0, 0, 0.2);
  border: 1px solid rgba(255, 255, 255, 0.05);
  border-radius: 10px;
  padding: 10px 14px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  width: 100%;
}

.copy-value-box.column-layout {
  flex-direction: column;
  align-items: flex-start;
  gap: 8px;
  padding: 12px;
}

.value-text {
  font-family: monospace;
  font-size: 1.05rem;
  color: var(--text-primary);
  word-break: break-all;
}

.value-text.iban-text {
  font-size: 0.85rem;
  letter-spacing: 0.5px;
  line-height: 1.4;
  width: 100%;
  text-align: center;
  background: rgba(0, 0, 0, 0.15);
  padding: 8px;
  border-radius: 6px;
  border: 1px solid rgba(255, 255, 255, 0.03);
}

.copy-btn-sm {
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid var(--border-color);
  border-radius: 8px;
  color: var(--text-primary);
  padding: 6px 12px;
  font-size: 0.75rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
}

.copy-btn-sm:hover {
  background: rgba(255, 255, 255, 0.1);
  color: var(--accent-cyan);
  border-color: var(--accent-cyan);
}

.detail-action-row {
  display: flex;
  gap: 12px;
}

.copied-success {
  background: rgba(16, 185, 129, 0.1) !important;
  color: var(--accent-green) !important;
  border-color: rgba(16, 185, 129, 0.3) !important;
}

/* Custom Payment Method Selector */
.settle-method-section {
  margin-bottom: 20px;
}

.settle-method-title {
  font-size: 0.85rem;
  font-weight: 600;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  margin-bottom: 12px;
  display: block;
}

.payment-method-selector-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 12px;
  margin-bottom: 12px;
}

@media (max-width: 480px) {
  .payment-method-selector-grid {
    grid-template-columns: 1fr;
  }
}

.method-selector-card {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 14px 16px;
  background: rgba(255, 255, 255, 0.02);
  border: 1px solid var(--border-color);
  border-radius: 14px;
  cursor: pointer;
  transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
  position: relative;
  overflow: hidden;
}

.method-selector-card:hover {
  background: rgba(255, 255, 255, 0.04);
  border-color: rgba(255, 255, 255, 0.15);
}

.method-selector-card.active {
  background: rgba(139, 92, 246, 0.06);
  border-color: var(--accent-purple);
  box-shadow: 0 0 16px var(--accent-purple-glow);
}

.method-selector-card .card-icon {
  font-size: 1.4rem;
  line-height: 1;
  transition: transform 0.2s ease;
}

.method-selector-card:hover .card-icon {
  transform: scale(1.1);
}

.method-selector-card .card-info {
  flex: 1;
  display: flex;
  flex-direction: column;
}

.method-selector-card .card-label {
  font-size: 0.9rem;
  font-weight: 600;
  color: var(--text-primary);
}

.method-selector-card .card-radio-indicator {
  width: 16px;
  height: 16px;
  border-radius: 50%;
  border: 2px solid var(--text-dark);
  position: relative;
  transition: all 0.2s ease;
}

.method-selector-card:hover .card-radio-indicator {
  border-color: var(--text-muted);
}

.method-selector-card.active .card-radio-indicator {
  border-color: var(--accent-purple);
  background: var(--accent-purple);
}

.method-selector-card.active .card-radio-indicator::after {
  content: '';
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #fff;
}

.method-helper-text {
  font-size: 0.75rem;
  color: var(--text-dark);
  line-height: 1.4;
  margin-top: 8px;
}

.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  border: 0;
}

/* Spinner */
.spinner {
  width: 16px;
  height: 16px;
  border: 2px solid rgba(255, 255, 255, 0.2);
  border-radius: 50%;
  border-top-color: #fff;
  animation: spin 0.8s linear infinite;
  display: inline-block;
  margin-right: 8px;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

/* Pending Repayments section */
.pending-repayments-section {
  border-color: rgba(245, 158, 11, 0.25);
  background: linear-gradient(180deg, rgba(245, 158, 11, 0.02) 0%, rgba(255, 255, 255, 0.01) 100%);
  margin-top: 24px;
}

.pending-repayments-section h3 {
  display: flex;
  align-items: center;
  gap: 8px;
}

.pending-badge {
  background: var(--color-warning-bg);
  color: var(--color-warning);
  font-size: 0.75rem;
  font-weight: 700;
  padding: 2px 8px;
  border-radius: 99px;
  border: 1px solid rgba(245, 158, 11, 0.2);
}

.pending-repayments-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin-top: 15px;
}

.pending-rep-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 14px 16px;
  background: rgba(255, 255, 255, 0.02);
  border: 1px solid var(--border-color);
  border-radius: 14px;
  transition: all 0.2s;
}

.pending-rep-row:hover {
  background: rgba(255, 255, 255, 0.04);
  border-color: rgba(255, 255, 255, 0.12);
}

.rep-meta {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.rep-title {
  display: flex;
  align-items: center;
  gap: 6px;
  font-weight: 600;
  font-size: 0.95rem;
}

.rep-payer-name {
  color: var(--text-primary);
}

.rep-arrow {
  color: var(--text-dark);
  font-size: 0.8rem;
}

.rep-receiver-name {
  color: var(--accent-cyan);
}

.rep-desc-text {
  font-size: 0.75rem;
  color: var(--text-muted);
}

.rep-actions-value {
  display: flex;
  align-items: center;
  gap: 16px;
}

.rep-amount {
  font-family: 'Outfit', sans-serif;
  font-weight: 700;
  font-size: 1.15rem;
  color: var(--color-warning);
}

.confirm-rep-btn {
  background: linear-gradient(135deg, var(--color-warning), #d97706);
  color: #fff;
  border: none;
  box-shadow: 0 4px 12px rgba(245, 158, 11, 0.2);
}

.confirm-rep-btn:hover {
  transform: translateY(-1px);
  box-shadow: 0 6px 16px rgba(245, 158, 11, 0.4);
}

.awaiting-label {
  font-size: 0.75rem;
  font-weight: 600;
  color: var(--color-warning);
  background: var(--color-warning-bg);
  padding: 4px 10px;
  border-radius: 8px;
  border: 1px solid rgba(245, 158, 11, 0.1);
}

.awaiting-label-generic {
  font-size: 0.75rem;
  color: var(--text-dark);
  font-style: italic;
}
</style>
