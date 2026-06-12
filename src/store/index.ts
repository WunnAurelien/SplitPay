import { reactive, computed } from 'vue'
import { useSupabase } from '@/services/supabase'
import { setupGlobalChannels, setupGroupChannel, teardownAll } from '@/services/realtime'
import i18n from '@/i18n'
import type { 
  Profile, 
  Expense, 
  Session, 
  State, 
  SettlementResult, 
  SettlementTransaction 
} from '@/types/store'

const { supabase, useMock } = useSupabase()

const state = reactive<State>({
  session: null,
  profile: null,
  isAdmin: false,
  isRecovery: false, // Flag: PASSWORD_RECOVERY event detected
  groups: [],
  profiles: [], // All approved profiles for adding to groups, or all profiles for admin panel
  activeGroup: null,
  loading: false,
  error: null,
  connectionError: null,
  isInitialized: false,
  impersonatingFrom: null,
  confirmState: {
    isOpen: false,
    title: '',
    message: '',
    resolve: null,
    reject: null,
    confirmText: '',
    cancelText: ''
  },
  alertState: {
    isOpen: false,
    title: '',
    message: '',
    resolve: null,
    okText: 'OK'
  }
})

// Compute if user is approved
const isApproved = computed(() => state.profile?.status === 'approved')

// Computes the optimal settlements (minimum cash transfers) using a greedy algorithm
const calculateSettlements = (members: any[], expenses: any[]): SettlementResult => {
  if (!members || members.length === 0) return { balances: [], transactions: [] }

  // Initialize balances map
  const balances: Record<string, number> = {}
  members.forEach(m => {
    balances[m.id] = 0
  })

  // For each expense, calculate shares and adjust balances
  expenses.forEach(exp => {
    if (exp.is_pending || exp.deleted_at) return // Skip pending and deleted transactions from balance computations
    const amount = parseFloat(exp.amount)
    const paidBy = exp.paid_by
    const beneficiaries = exp.expense_beneficiaries || []
    
    if (beneficiaries.length === 0) return

    // Sum total parts
    const totalParts = beneficiaries.reduce((sum: number, b: any) => sum + parseFloat(b.parts), 0)
    if (totalParts === 0) return

    // Add paid amount to the payer's balance
    if (balances[paidBy] !== undefined) {
      balances[paidBy] += amount
    }

    // Subtract individual shares from beneficiaries' balances
    beneficiaries.forEach((b: any) => {
      const share = (parseFloat(b.parts) / totalParts) * amount
      if (balances[b.profile_id] !== undefined) {
        balances[b.profile_id] -= share
      }
    })
  })

  // Separate debtors and creditors
  const debtors: { id: string; balance: number }[] = []
  const creditors: { id: string; balance: number }[] = []

  Object.keys(balances).forEach(id => {
    const bal = balances[id]
    // Use epsilon to ignore tiny precision issues (e.g. < 0.01)
    if (bal < -0.005) {
      debtors.push({ id, balance: bal })
    } else if (bal > 0.005) {
      creditors.push({ id, balance: bal })
    }
  })

  // Sort debtors ascending (most negative first) and creditors descending (most positive first)
  debtors.sort((a, b) => a.balance - b.balance)
  creditors.sort((a, b) => b.balance - a.balance)

  const transactions: SettlementTransaction[] = []
  let dIdx = 0
  let cIdx = 0

  // Settle debts greedily
  while (dIdx < debtors.length && cIdx < creditors.length) {
    const debtor = debtors[dIdx]
    const creditor = creditors[cIdx]

    const debtAmount = Math.abs(debtor.balance)
    const creditAmount = creditor.balance

    const transfer = Math.min(debtAmount, creditAmount)

    // Find profiles to get payment links and usernames
    const debtorProfile = members.find(m => m.id === debtor.id)
    const creditorProfile = members.find(m => m.id === creditor.id)

    let rawPaymentLink = creditorProfile?.payment_link || ''
    let formattedPaymentLink = ''

    if (rawPaymentLink && (rawPaymentLink.includes('paypal.me') || rawPaymentLink.includes('paypal.com'))) {
      if (rawPaymentLink.includes('paypal.me')) {
        try {
          // Nettoyage de l'URL pour insérer le montant proprement
          const urlObj = new URL(rawPaymentLink)
          let path = urlObj.pathname
          if (path.endsWith('/')) {
            path = path.slice(0, -1)
          }
          urlObj.pathname = `${path}/${transfer.toFixed(2)}`
          formattedPaymentLink = urlObj.toString()
        } catch (e) {
          // Fallback simple
          if (rawPaymentLink.endsWith('/')) {
            rawPaymentLink = rawPaymentLink.slice(0, -1)
          }
          formattedPaymentLink = `${rawPaymentLink}/${transfer.toFixed(2)}`
        }
      } else {
        formattedPaymentLink = rawPaymentLink
      }
    }

    transactions.push({
      fromId: debtor.id,
      fromName: debtorProfile?.username || debtorProfile?.email || 'Unknown',
      toId: creditor.id,
      toName: creditorProfile?.username || creditorProfile?.email || 'Unknown',
      amount: parseFloat(transfer.toFixed(2)),
      paymentLink: formattedPaymentLink,
      phoneNumber: creditorProfile?.phone_number || '',
      iban: creditorProfile?.iban || ''
    })

    debtor.balance += transfer
    creditor.balance -= transfer

    if (Math.abs(debtor.balance) < 0.005) {
      dIdx++
    }
    if (creditor.balance < 0.005) {
      cIdx++
    }
  }

  return {
    balances: Object.keys(balances).map(id => ({
      profileId: id,
      netBalance: parseFloat(balances[id].toFixed(2))
    })),
    transactions
  }
}

const actions = {
  setError(err: any) {
    state.error = err ? (err.message || err) : null
  },

  async sendPushNotification({ recipientIds, type, params, url, title, body }: {
    recipientIds: string[]
    type?: string
    params?: any
    url?: string
    title?: string
    body?: string
  }) {
    if (!recipientIds || recipientIds.length === 0) return
    
    if (useMock) {
      console.log(`[Mock Push Notification] To: ${JSON.stringify(recipientIds)}, Type: "${type || 'custom'}", Title: "${title}", Body: "${body}", Params: ${JSON.stringify(params)}, URL: "${url}"`)
      return
    }

    try {
      const { data, error } = await supabase.functions.invoke('send-push', {
        body: {
          recipientIds,
          type,
          params,
          url,
          title,
          body
        }
      })
      if (error) throw error
      return data
    } catch (err) {
      console.error('[SplitPay] Error sending push notification:', err)
    }
  },

  confirm({ title, message, confirmText, cancelText }: { title?: string; message?: string; confirmText?: string; cancelText?: string }): Promise<boolean> {
    state.confirmState.title = title || ''
    state.confirmState.message = message || ''
    state.confirmState.confirmText = confirmText || ''
    state.confirmState.cancelText = cancelText || ''
    state.confirmState.isOpen = true
    
    return new Promise((resolve) => {
      state.confirmState.resolve = (val: boolean) => {
        state.confirmState.isOpen = false
        resolve(val)
      }
      state.confirmState.reject = () => {
        state.confirmState.isOpen = false
        resolve(false)
      }
    })
  },

  alert({ title, message, okText }: { title?: string; message?: string; okText?: string }): Promise<void> {
    state.alertState.title = title || ''
    state.alertState.message = message || ''
    state.alertState.okText = okText || 'OK'
    state.alertState.isOpen = true
    
    return new Promise<void>((resolve) => {
      state.alertState.resolve = () => {
        state.alertState.isOpen = false
        resolve()
      }
    })
  },

  setConnectionError(err: any) {
    state.connectionError = err ? (err.message || err) : null
  },

  async initialize() {
    if (state.isInitialized) return
    state.loading = true
    
    try {
      // 1. Fetch current session immediately to bypass listener delay on page reload
      const { data: { session }, error: sError } = await supabase.auth.getSession()
      if (sError) throw sError

      state.session = session
      if (session?.user) {
        await this.fetchProfile(session.user.id)
        if (state.profile?.status === 'approved' || state.isAdmin) {
          await this.fetchGroups()
          await this.fetchProfiles()
        }
      }
      
      state.loading = false
      state.isInitialized = true

      // 2. Setup Realtime global channels if in production mode
      if (!useMock && session?.user) {
        setupGlobalChannels(supabase, { state, actions: this })
      }

      // 3. Setup background listener for auth updates (login, logout, token refresh)
      supabase.auth.onAuthStateChange(async (event: any, newSession: any) => {
        // Skip handling during initial load to prevent parallel race conditions
        if (!state.isInitialized) return

        // Prevent duplicate loads if the session hasn't changed
        if (state.session?.user?.id === newSession?.user?.id && state.profile) {
          state.session = newSession // Sync token/metadata if needed
          return
        }

        try {
          state.session = newSession
          if (newSession?.user) {
            await this.fetchProfile(newSession.user.id)
            if (state.profile?.status === 'approved' || state.isAdmin) {
              await this.fetchGroups()
              await this.fetchProfiles()
            }
            // Setup Realtime global channels for the new session
            if (!useMock) {
              setupGlobalChannels(supabase, { state, actions: this })
            }
          } else {
            state.profile = null
            state.isAdmin = false
            state.groups = []
            state.profiles = []
            state.activeGroup = null
            // Teardown Realtime channels on logout
            teardownAll()
          }
        } catch (callbackError) {
          console.error('onAuthStateChange callback error:', callbackError)
          this.setConnectionError(callbackError)
        }
      })
    } catch (initError) {
      console.error('Auth initialization error:', initError)
      this.setConnectionError(initError)
      state.loading = false
      state.isInitialized = true
    }
  },

  async signOut() {
    state.loading = true
    
    // Teardown all Realtime channels
    teardownAll()
    
    // Call Supabase signOut in the background without awaiting it.
    // This prevents any hanging promise (due to invalid API key or connection issues) from blocking the local signout flow.
    supabase.auth.signOut().catch((e: any) => {
      console.error('Non-blocking Supabase signOut failed:', e)
    })

    // Immediately clear local reactive state
    state.session = null
    state.profile = null
    state.isAdmin = false
    state.groups = []
    state.profiles = []
    state.activeGroup = null
    state.impersonatingFrom = null
    
    // Clear all auth-related local storage items to ensure session cleanup
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const key = localStorage.key(i)
      if (key && (key.includes('auth-token') || key.includes('supabase') || key.includes('splitpay'))) {
        localStorage.removeItem(key)
      }
    }
    
    state.loading = false
  },

  async fetchProfile(userId: string) {
    try {
      // Fetch profile as an array instead of .single() to avoid throwing on empty results
      const { data: profilesList, error: pError } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
      
      if (pError) throw pError
      
      let profile = profilesList && profilesList.length > 0 ? profilesList[0] : null
      
      // Self-healing check: if Auth user is present but profile table is missing their row (e.g. trigger failed)
      if (!profile) {
        if (!state.session?.user) return
        const { data: newProfile, error: insError } = await supabase
          .from('profiles')
          .insert({
            id: userId,
            email: state.session.user.email,
            username: state.session.user.email.split('@')[0],
            status: 'pending',
            locale: localStorage.getItem('splitpay_locale') || 'fr'
          })
          .select()
        
        if (insError) {
          // If the profile already exists, this means the RLS select policy failed to return the row
          // because the client authentication headers were not fully applied yet during onAuthStateChange callback.
          // We handle this gracefully by waiting 150ms and retrying the select query.
          if (insError.code === '23505' || insError.message?.includes('duplicate key') || insError.message?.includes('profiles_pkey')) {
            await new Promise(resolve => setTimeout(resolve, 150));
            
            const { data: retryList, error: retryError } = await supabase
              .from('profiles')
              .select('*')
              .eq('id', userId)
            
            if (retryError) throw retryError
            profile = retryList && retryList.length > 0 ? retryList[0] : null
          } else {
            throw insError
          }
        } else {
          profile = newProfile && newProfile.length > 0 ? newProfile[0] : null
        }
      }
      
      state.profile = profile

      // Admin setup via server-side RPC (atomic, bypasses RLS)
      const { data: adminSetup, error: rpcError } = await supabase.rpc('setup_admin_if_needed')

      if (!rpcError && adminSetup && !adminSetup.error) {
        // RPC succeeded — use authoritative server response
        state.isAdmin = adminSetup.is_admin === true
        if (state.profile && adminSetup.status === 'approved') {
          state.profile.status = 'approved'
        }
      } else {
        // RPC not available (function not deployed yet) — fallback to manual logic
        console.warn('[SplitPay] setup_admin_if_needed RPC unavailable, using manual fallback:', rpcError?.message)

        const { data: adminConfigData, error: cError } = await supabase
          .from('app_config')
          .select('*')
          .eq('key', 'admin_uuid')

        if (cError) throw cError

        const adminConfig = adminConfigData && adminConfigData.length > 0 ? adminConfigData[0] : null

        if (!adminConfig) {
          state.isAdmin = true

          const { error: insError } = await supabase
            .from('app_config')
            .insert({ key: 'admin_uuid', value: userId })

          if (insError) {
            console.error('[SplitPay] Failed to set admin config in DB:', insError)
            throw insError
          }

          const { error: updError } = await supabase
            .from('profiles')
            .update({ status: 'approved' })
            .eq('id', userId)

          if (updError) {
            console.error('[SplitPay] Failed to approve admin profile in DB:', updError)
            throw updError
          }

          if (state.profile) {
            state.profile.status = 'approved'
          }
        } else {
          state.isAdmin = adminConfig.value === userId

          if (state.isAdmin && state.profile && state.profile.status !== 'approved') {
            const { error: updError } = await supabase
              .from('profiles')
              .update({ status: 'approved' })
              .eq('id', userId)

            if (updError) {
              console.error('[SplitPay] Failed to approve admin profile in DB:', updError)
              throw updError
            }

            state.profile.status = 'approved'
          }
        }
      }
    } catch (e) {
      console.error('Error fetching profile:', e)
      this.setError(e)
    }
  },

  async updateProfile({ username, paymentLink, phoneNumber, iban }: { username: string; paymentLink: string; phoneNumber: string; iban: string }) {
    if (!state.session?.user) return
    state.loading = true
    state.error = null
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ 
          username, 
          payment_link: paymentLink,
          phone_number: phoneNumber,
          iban: iban
        })
        .eq('id', state.session.user.id)

      if (error) throw error
      if (state.profile) {
        state.profile.username = username
        state.profile.payment_link = paymentLink
        state.profile.phone_number = phoneNumber
        state.profile.iban = iban
      }
    } catch (e) {
      this.setError(e)
      throw e
    } finally {
      state.loading = false
    }
  },

  async updateLocale(locale: string) {
    if (!state.session?.user) return
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ locale })
        .eq('id', state.session.user.id)
      if (error) throw error
      if (state.profile) {
        state.profile.locale = locale
      }
    } catch (e) {
      console.error('[SplitPay] Failed to update locale in DB:', e)
    }
  },

  async fetchGroups() {
    if (!state.session?.user) return
    try {
      // In a real database, we select groups where user is a member.
      // With RLS, select on groups returns only groups the member has access to.
      // So we can select '*' from groups and it returns only their groups.
      const { data, error } = await supabase
        .from('groups')
        .select('*, group_members(*, profiles(*)), expenses(*, expense_beneficiaries(*, profiles(*)))')
      
      if (error) throw error

      // Client-side filtering to correctly support LocalStorage Mock mode and Impersonation testing
      const currentUserId = state.session?.user?.id
      const filtered = data.filter((g: any) => {
        if (!g.group_members) return false
        return g.group_members.some((m: any) => m.profile_id === currentUserId)
      })

      state.groups = filtered
    } catch (e) {
      console.error('Error fetching groups:', e)
      this.setError(e)
    }
  },

  async fetchProfiles() {
    try {
      // If admin, fetch all profiles. If regular approved user, fetch only approved.
      const query = supabase.from('profiles').select('*')
      if (!state.isAdmin) {
        query.eq('status', 'approved')
      }
      const { data, error } = await query
      if (error) throw error
      state.profiles = data
    } catch (e) {
      console.error('Error fetching profiles:', e)
      this.setError(e)
    }
  },

  async fetchGroupDetails(groupId: string) {
    state.loading = true
    state.error = null
    try {
      // Fetch group with members
      const { data: group, error: gError } = await supabase
        .from('groups')
        .select('*, group_members(*, profiles(*))')
        .eq('id', groupId)
        .single()
      
      if (gError) throw gError

      // Fetch expenses for the group with beneficiaries
      const { data: expenses, error: eError } = await supabase
        .from('expenses')
        .select('*, expense_beneficiaries(*, profiles(*))')
        .eq('group_id', groupId)
        .order('created_at', { ascending: false })
      
      if (eError) throw eError

      // Map member profiles
      // Since group contains group_members which has joined profiles in Mock,
      // let's make sure it handles both Mock and Real database mapping.
      let members: any[] = []
      if (group.group_members) {
        members = group.group_members.map((gm: any) => {
          if (!gm.profiles) return null
          return {
            ...gm.profiles,
            note: gm.note || ''
          }
        }).filter(Boolean)
      }

      state.activeGroup = {
        id: group.id,
        name: group.name,
        createdBy: group.created_by,
        members,
        expenses: expenses || []
      }

      // Setup Realtime group channel for live updates on this group's expenses
      if (!useMock) {
        setupGroupChannel(supabase, groupId, { state, actions: this })
      }
    } catch (e) {
      console.error('Error fetching group details:', e)
      this.setError(e)
    } finally {
      state.loading = false
    }
  },

  async createGroup(name: string) {
    if (!state.session?.user) return
    state.loading = true
    state.error = null
    try {
      // 1. Insert Group
      const { data: group, error: gError } = await supabase
        .from('groups')
        .insert({ name, created_by: state.session.user.id })
        .select()
        .single()
      
      if (gError) throw gError

      // 2. Insert Membership for Creator
      const { error: mError } = await supabase
        .from('group_members')
        .insert({ group_id: group.id, profile_id: state.session.user.id })

      if (mError) throw mError

      // Refresh groups list
      await this.fetchGroups()
      return group
    } catch (e) {
      this.setError(e)
      throw e
    } finally {
      state.loading = false
    }
  },

  async addGroupMember(groupId: string, profileId: string) {
    state.loading = true
    state.error = null
    try {
      const { error } = await supabase
        .from('group_members')
        .insert({ group_id: groupId, profile_id: profileId })
      
      if (error) throw error
      await this.fetchGroupDetails(groupId)

      // Send notification to the added user
      if (state.activeGroup && profileId !== state.session?.user?.id) {
        const addedBy = state.profile?.username || state.profile?.email || i18n.global.t('admin.noHandle')
        await this.sendPushNotification({
          recipientIds: [profileId],
          type: 'added_to_group',
          params: { addedBy, groupName: state.activeGroup.name },
          url: `/SplitPay/group/${groupId}`
        })
      }
    } catch (e) {
      this.setError(e)
      throw e
    } finally {
      state.loading = false
    }
  },

  async joinGroup(groupId: string) {
    if (!state.session?.user) return
    state.loading = true
    state.error = null
    try {
      const { error } = await supabase
        .from('group_members')
        .insert({ group_id: groupId, profile_id: state.session.user.id })
      
      if (error) throw error
      
      await this.fetchGroups()
      
      // Notify other group members that a new user has joined
      const group = state.groups.find(g => g.id === groupId)
      if (group) {
        const otherMemberIds = group.group_members
          ?.map((gm: any) => gm.profile_id)
          .filter((id: string) => id !== state.session!.user.id) || []
        
        if (otherMemberIds.length > 0) {
          const joinerName = state.profile?.username || state.profile?.email || i18n.global.t('admin.noHandle')
          await this.sendPushNotification({
            recipientIds: otherMemberIds,
            type: 'new_member',
            params: { joinerName, groupName: group.name },
            url: `/SplitPay/group/${groupId}`
          })
        }
      }
    } catch (e) {
      this.setError(e)
      throw e
    } finally {
      state.loading = false
    }
  },

  async removeGroupMember(groupId: string, profileId: string) {
    state.loading = true
    state.error = null
    try {
      const group = state.groups.find(g => g.id === groupId) || state.activeGroup
      const groupName = group?.name || 'Groupe'
      
      const memberObj = group?.group_members?.find((m: any) => m.profile_id === profileId)?.profiles
        || state.activeGroup?.members?.find(m => m.id === profileId)
      
      const memberName = memberObj?.username || memberObj?.email || i18n.global.t('admin.noHandle')
      
      const otherMemberIds = group?.group_members
        ?.map((gm: any) => gm.profile_id)
        ?.filter((id: string) => id !== profileId)
        || state.activeGroup?.members
          ?.map(m => m.id)
          ?.filter(id => id !== profileId)
        || []

      const { error } = await supabase
        .from('group_members')
        .delete()
        .eq('group_id', groupId)
        .eq('profile_id', profileId)

      if (error) throw error
      
      if (state.session?.user && profileId === state.session.user.id) {
        // Left the group, notify other members
        if (otherMemberIds.length > 0) {
          await this.sendPushNotification({
            recipientIds: otherMemberIds,
            type: 'member_left',
            params: { memberName, groupName },
            url: `/SplitPay/`
          })
        }
        state.activeGroup = null
        await this.fetchGroups()
      } else {
        // Removed from the group, notify the removed user
        await this.sendPushNotification({
          recipientIds: [profileId],
          type: 'removed_from_group',
          params: { groupName },
          url: `/SplitPay/`
        })
        await this.fetchGroupDetails(groupId)
      }
    } catch (e) {
      this.setError(e)
      throw e
    } finally {
      state.loading = false
    }
  },

  async updateGroupMemberNote(groupId: string, profileId: string, note: string) {
    state.loading = true
    state.error = null
    try {
      const { error } = await supabase
        .from('group_members')
        .update({ note })
        .eq('group_id', groupId)
        .eq('profile_id', profileId)

      if (error) throw error
      
      if (state.activeGroup && state.activeGroup.id === groupId) {
        const mem = state.activeGroup.members.find(m => m.id === profileId)
        if (mem) {
          mem.note = note
        }
      }
    } catch (e) {
      this.setError(e)
      throw e
    } finally {
      state.loading = false
    }
  },

  async addExpense({ groupId, description, amount, paidBy, splits, isPending = false }: {
    groupId: string
    description: string
    amount: string | number
    paidBy: string
    splits: Array<{ profileId: string; parts: string | number }>
    isPending?: boolean
  }) {
    state.loading = true
    state.error = null
    try {
      // 1. Insert Expense
      const { data: expense, error: eError } = await supabase
        .from('expenses')
        .insert({
          group_id: groupId,
          description,
          amount: typeof amount === 'string' ? parseFloat(amount) : amount,
          paid_by: paidBy,
          is_pending: isPending
        })
        .select()
        .single()
      
      if (eError) throw eError

      // 2. Insert beneficiaries
      const beneficiaries = splits.map(s => ({
        expense_id: expense.id,
        profile_id: s.profileId,
        parts: typeof s.parts === 'string' ? parseFloat(s.parts) : s.parts
      }))

      const { error: bError } = await supabase
        .from('expense_beneficiaries')
        .insert(beneficiaries)

      if (bError) throw bError

      // Refresh group details
      await this.fetchGroupDetails(groupId)

      // Send push notifications
      if (state.activeGroup) {
        const groupName = state.activeGroup.name
        const payerProfile = state.activeGroup.members?.find(m => m.id === paidBy) || state.profile
        const payerName = payerProfile?.username || payerProfile?.email || i18n.global.t('admin.noHandle')

        if (isPending) {
          // Settlement repayment
          const creditorId = splits[0]?.profileId
          if (creditorId && creditorId !== paidBy) {
            await this.sendPushNotification({
              recipientIds: [creditorId],
              type: 'settlement',
              params: { payerName, amount: parseFloat(amount as string).toFixed(2), groupName },
              url: `/SplitPay/group/${groupId}`
            })
          }
        } else {
          // Standard expense
          const otherMemberIds = state.activeGroup.members
            ?.map(m => m.id)
            .filter(id => id !== paidBy) || []

          if (otherMemberIds.length > 0) {
            await this.sendPushNotification({
              recipientIds: otherMemberIds,
              type: 'new_expense',
              params: { payerName, description, amount: parseFloat(amount as string).toFixed(2), groupName },
              url: `/SplitPay/group/${groupId}`
            })
          }
        }
      }
    } catch (e) {
      this.setError(e)
      throw e
    } finally {
      state.loading = false
    }
  },

  async deleteExpense(groupId: string, expenseId: string) {
    state.loading = true
    state.error = null
    try {
      const group = state.groups.find(g => g.id === groupId) || state.activeGroup
      const groupName = group?.name || 'Groupe'
      const expense = state.activeGroup?.expenses?.find(e => e.id === expenseId)
        || group?.expenses?.find((e: any) => e.id === expenseId)

      const { error } = await supabase
        .from('expenses')
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', expenseId)

      if (error) throw error
      await this.fetchGroupDetails(groupId)

      if (expense) {
        const description = expense.description
        const amount = parseFloat((expense.amount || 0) as string).toFixed(2)

        if (expense.is_pending) {
          // If it was a pending repayment, check if it was declined by the creditor
          const creditorId = expense.expense_beneficiaries?.[0]?.profile_id
          const debtorId = expense.paid_by
          const creditorName = state.profile?.username || state.profile?.email || i18n.global.t('admin.noHandle')

          // Only send if the creditor (or admin) rejected it (debtor did not cancel it themselves)
          if (creditorId && debtorId && state.session?.user?.id !== debtorId) {
            await this.sendPushNotification({
              recipientIds: [debtorId],
              type: 'settlement_declined',
              params: { creditorName, amount, groupName },
              url: `/SplitPay/group/${groupId}`
            })
          }
        } else {
          // Standard expense deletion: notify other group members
          const deleterName = state.profile?.username || state.profile?.email || i18n.global.t('admin.noHandle')
          const otherMemberIds = state.activeGroup?.members
            ?.map(m => m.id)
            ?.filter(id => id !== state.session?.user?.id) || []

          if (otherMemberIds.length > 0) {
            await this.sendPushNotification({
              recipientIds: otherMemberIds,
              type: 'expense_deleted',
              params: { deleterName, description, amount, groupName },
              url: `/SplitPay/group/${groupId}`
            })
          }
        }
      }
    } catch (e) {
      this.setError(e)
      throw e
    } finally {
      state.loading = false
    }
  },

  async confirmExpense(groupId: string, expenseId: string) {
    state.loading = true
    state.error = null
    try {
      const expense = state.activeGroup?.expenses?.find(e => e.id === expenseId)

      const { error } = await supabase
        .from('expenses')
        .update({ is_pending: false })
        .eq('id', expenseId)

      if (error) throw error
      await this.fetchGroupDetails(groupId)

      // Send notification to the debtor
      if (expense && state.activeGroup) {
        const creditorName = state.profile?.username || state.profile?.email || i18n.global.t('admin.noHandle')
        const debtorId = expense.paid_by
        if (debtorId && debtorId !== state.session?.user?.id) {
          await this.sendPushNotification({
            recipientIds: [debtorId],
            type: 'settlement_confirmed',
            params: { creditorName, amount: parseFloat(expense.amount as string).toFixed(2), groupName: state.activeGroup.name },
            url: `/SplitPay/group/${groupId}`
          })
        }
      }
    } catch (e) {
      this.setError(e)
      throw e
    } finally {
      state.loading = false
    }
  },

  // Admin Actions
  async fetchAdminProfiles() {
    if (!state.isAdmin) return
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
      if (error) throw error
      state.profiles = data
    } catch (e) {
      this.setError(e)
    }
  },

  async updateUserStatus(userId: string, status: string) {
    if (!state.isAdmin) return
    state.loading = true
    state.error = null
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ status })
        .eq('id', userId)

      if (error) throw error
      // Update local profiles list
      const idx = state.profiles.findIndex(p => p.id === userId)
      if (idx !== -1) {
        state.profiles[idx].status = status
      }

      if (status === 'approved') {
        await this.sendPushNotification({
          recipientIds: [userId],
          type: 'account_approved',
          params: {},
          url: '/SplitPay/'
        })
      }
    } catch (e) {
      this.setError(e)
      throw e
    } finally {
      state.loading = false
    }
  },

  async deleteUser(userId: string) {
    if (!state.isAdmin) return
    state.loading = true
    state.error = null
    try {
      const { data, error } = await supabase.rpc('delete_user_by_admin', { user_id: userId })
      if (error) throw error
      if (data && data.error) throw new Error(data.error)
      
      // Update local profiles list
      state.profiles = state.profiles.filter(p => p.id !== userId)
    } catch (e) {
      this.setError(e)
      throw e
    } finally {
      state.loading = false
    }
  },

  async impersonateUser(profile: Profile) {
    if (!profile) return
    state.loading = true
    state.error = null
    try {
      // Save original admin details if we aren't already impersonating
      if (!state.impersonatingFrom) {
        state.impersonatingFrom = {
          session: state.session ? { ...state.session } : null,
          profile: state.profile ? { ...state.profile } : null,
          isAdmin: state.isAdmin
        }
      }

      // Set simulated session and profile
      state.session = {
        access_token: 'impersonated-session-token',
        user: {
          id: profile.id,
          email: profile.email
        }
      }
      state.profile = { ...profile }
      state.isAdmin = false

      // Fetch groups for the impersonated user
      await this.fetchGroups()
    } catch (e) {
      console.error('Failed to impersonate:', e)
      this.setError(e)
      throw e
    } finally {
      state.loading = false
    }
  },

  async stopImpersonating() {
    if (!state.impersonatingFrom) return
    state.loading = true
    state.error = null
    try {
      const orig = state.impersonatingFrom
      state.session = orig.session
      state.profile = orig.profile
      state.isAdmin = orig.isAdmin
      state.impersonatingFrom = null

      await this.fetchGroups()
    } catch (e) {
      console.error('Failed to stop impersonating:', e)
      this.setError(e)
      throw e
    } finally {
      state.loading = false
    }
  }
}

// Compute active group calculations
const activeGroupCalculations = computed(() => {
  if (!state.activeGroup) return null
  return calculateSettlements(state.activeGroup.members, state.activeGroup.expenses)
})

// Compute global user stats across all groups
const userGlobalStats = computed(() => {
  let netOwedToMe = 0
  let netIOwe = 0
  let activeGroupsCount = state.groups.length

  state.groups.forEach(group => {
    // If the group has members/expenses info, we can aggregate
    // Let's compute settlements for this group
    const members = group.group_members?.map((gm: any) => gm.profiles).filter(Boolean) || []
    const expenses = group.expenses || []
    const settlements = calculateSettlements(members, expenses)
    const myBalance = settlements.balances?.find(b => b.profileId === state.session?.user?.id)
    if (myBalance) {
      if (myBalance.netBalance > 0) netOwedToMe += myBalance.netBalance
      else if (myBalance.netBalance < 0) netIOwe += Math.abs(myBalance.netBalance)
    }
  })

  return {
    netOwedToMe: parseFloat(netOwedToMe.toFixed(2)),
    netIOwe: parseFloat(netIOwe.toFixed(2)),
    activeGroupsCount
  }
})

export { state, isApproved, activeGroupCalculations, userGlobalStats, calculateSettlements, actions }
