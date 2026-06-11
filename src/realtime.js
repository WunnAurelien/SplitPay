/**
 * SplitPay Supabase Realtime Module
 * 
 * Gère les souscriptions aux channels Realtime pour les mises à jour en direct.
 * Utilise des updates ciblés sur le state quand c'est possible,
 * et des re-fetch complets quand les relations sont trop complexes.
 */

// Store les channels actifs pour pouvoir les nettoyer
let activeChannels = []
let globalGroupChannel = null
let globalProfileChannel = null
let groupChannels = {} // groupId -> channel

/**
 * Crée un channel Supabase avec gestion d'erreur
 */
function createChannel(supabase, channelName) {
  return supabase.channel(channelName)
}

/**
 * Nettoie tous les channels actifs
 */
function teardownAll() {
  activeChannels.forEach(ch => {
    try { ch.unsubscribe() } catch (e) { console.warn('[Realtime] unsubscribe error:', e) }
  })
  activeChannels = []
  globalGroupChannel = null
  globalProfileChannel = null
  groupChannels = {}
}

/**
 * Configure les channels globaux :
 * - groups (INSERT, UPDATE, DELETE)
 * - profiles (UPDATE)
 */
function setupGlobalChannels(supabase, store) {
  // Éviter les doublons
  teardownAll()

  // --- Channel Groups ---
  const groupChannel = createChannel(supabase, 'splitpay-groups')
  globalGroupChannel = groupChannel
  activeChannels.push(groupChannel)

  groupChannel
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'groups' },
      async (payload) => {
        console.log('[Realtime] Group INSERT:', payload.new?.id)
        // Un nouveau groupe a été créé — refresh la liste complète
        // pour récupérer les group_members et profiles associés
        await store.actions.fetchGroups()
      }
    )
    .on(
      'postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'groups' },
      (payload) => {
        console.log('[Realtime] Group UPDATE:', payload.new?.id)
        const updatedGroup = payload.new
        const idx = store.state.groups.findIndex(g => g.id === updatedGroup.id)
        if (idx !== -1) {
          // Merge les champs modifiés (name notamment)
          store.state.groups[idx] = { ...store.state.groups[idx], ...updatedGroup }
        }
      }
    )
    .on(
      'postgres_changes',
      { event: 'DELETE', schema: 'public', table: 'groups' },
      (payload) => {
        console.log('[Realtime] Group DELETE:', payload.old?.id)
        store.state.groups = store.state.groups.filter(g => g.id !== payload.old.id)
        // Si le groupe supprimé est le groupe actif, le désactiver
        if (store.state.activeGroup?.id === payload.old.id) {
          store.state.activeGroup = null
        }
      }
    )
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'group_members' },
      async (payload) => {
        console.log('[Realtime] Group Member change:', payload.eventType, payload.new?.group_id, payload.new?.profile_id)
        // Les changements de membres sont complexes (nécessitent profiles)
        // On refresh la liste des groupes et le groupe actif si concerné
        await store.actions.fetchGroups()
        if (store.state.activeGroup) {
          await store.actions.fetchGroupDetails(store.state.activeGroup.id)
        }
      }
    )
    .subscribe((status) => {
      console.log('[Realtime] Groups channel status:', status)
    })

  // --- Channel Profiles ---
  const profileChannel = createChannel(supabase, 'splitpay-profiles')
  globalProfileChannel = profileChannel
  activeChannels.push(profileChannel)

  profileChannel
    .on(
      'postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'profiles' },
      async (payload) => {
        const updatedProfile = payload.new
        console.log('[Realtime] Profile UPDATE:', updatedProfile?.id)

        const currentUserId = store.state.session?.user?.id

        // 1. Si c'est notre propre profil, mettre à jour state.profile
        if (currentUserId && updatedProfile.id === currentUserId) {
          const oldStatus = store.state.profile?.status
          store.state.profile = { ...store.state.profile, ...updatedProfile }

          // Si le statut a changé vers 'approved', refresh les données
          if (oldStatus !== 'approved' && updatedProfile.status === 'approved') {
            await store.actions.fetchGroups()
            await store.actions.fetchProfiles()
          }
        }

        // 2. Si on est admin ou si le profil est visible (approuvé), mettre à jour state.profiles
        if (store.state.isAdmin) {
          const idx = store.state.profiles.findIndex(p => p.id === updatedProfile.id)
          if (idx !== -1) {
            store.state.profiles[idx] = { ...store.state.profiles[idx], ...updatedProfile }
          } else {
            // Nouveau profil apparu (admin peut tout voir)
            await store.actions.fetchAdminProfiles()
          }
        } else if (updatedProfile.status === 'approved') {
          // Utilisateur non-admin : ne voit que les profils approuvés
          const idx = store.state.profiles.findIndex(p => p.id === updatedProfile.id)
          if (idx !== -1) {
            store.state.profiles[idx] = { ...store.state.profiles[idx], ...updatedProfile }
          } else {
            // Peut-être un nouveau profil approuvé — refresh
            await store.actions.fetchProfiles()
          }
        } else if (updatedProfile.status !== 'approved') {
          // Si un profil n'est plus approuvé, le retirer de la liste
          store.state.profiles = store.state.profiles.filter(p => p.id !== updatedProfile.id)
        }
      }
    )
    .subscribe((status) => {
      console.log('[Realtime] Profiles channel status:', status)
    })
}

/**
 * Configure un channel pour un groupe spécifique.
 * Souscrit aux tables expenses et expense_beneficiaries.
 */
function setupGroupChannel(supabase, groupId, store) {
  // Nettoyer l'ancien channel du groupe si existant
  teardownGroupChannel(groupId)

  const channelName = `splitpay-group-${groupId}`
  const channel = createChannel(supabase, channelName)
  groupChannels[groupId] = channel
  activeChannels.push(channel)

  channel
    // Écouter les INSERT sur expenses
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'expenses', filter: `group_id=eq.${groupId}` },
      async (payload) => {
        console.log('[Realtime] Expense INSERT in group', groupId, ':', payload.new?.id)
        // L'INSERT a les champs de base mais pas les beneficiaries
        // On refresh complet pour avoir les relations
        await store.actions.fetchGroupDetails(groupId)
      }
    )
    // Écouter les UPDATE sur expenses
    .on(
      'postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'expenses', filter: `group_id=eq.${groupId}` },
      async (payload) => {
        console.log('[Realtime] Expense UPDATE in group', groupId, ':', payload.new?.id)
        const updatedExpense = payload.new
        const oldExpense = payload.old

        // Pour les updates simples (description, amount, is_pending, deleted_at),
        // on peut update directement sans re-fetch
        if (store.state.activeGroup) {
          const idx = store.state.activeGroup.expenses.findIndex(e => e.id === updatedExpense.id)
          if (idx !== -1) {
            const existing = store.state.activeGroup.expenses[idx]
            
            // Si le statut is_pending change, on refresh les calculs sont impactés
            // Si deleted_at change, idem
            const needsFullRefresh = 
              (oldExpense.is_pending !== updatedExpense.is_pending) ||
              (oldExpense.deleted_at !== updatedExpense.deleted_at) ||
              (oldExpense.paid_by !== updatedExpense.paid_by)

            // Fusionner les champs modifiés
            store.state.activeGroup.expenses[idx] = { 
              ...existing, 
              ...updatedExpense,
              // Garder les relations existantes (profiles, beneficiaries)
              profiles: existing.profiles,
              expense_beneficiaries: existing.expense_beneficiaries
            }

            if (needsFullRefresh) {
              await store.actions.fetchGroupDetails(groupId)
            }
          }
        }
      }
    )
    // Écouter les DELETE sur expenses
    .on(
      'postgres_changes',
      { event: 'DELETE', schema: 'public', table: 'expenses', filter: `group_id=eq.${groupId}` },
      (payload) => {
        console.log('[Realtime] Expense DELETE in group', groupId, ':', payload.old?.id)
        if (store.state.activeGroup) {
          store.state.activeGroup.expenses = store.state.activeGroup.expenses.filter(e => e.id !== payload.old.id)
        }
      }
    )
    // Écouter les changements sur expense_beneficiaries
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'expense_beneficiaries' },
      async (payload) => {
        console.log('[Realtime] Expense Beneficiary change in group', groupId, ':', payload.eventType)
        // Les beneficiaries changent les calculs financiers ⟶ refresh complet
        // On ne refresh que si la dépense concernée appartient au groupe actif
        if (store.state.activeGroup?.expenses.some(e => e.id === payload.new?.expense_id || e.id === payload.old?.expense_id)) {
          await store.actions.fetchGroupDetails(groupId)
        }
      }
    )
    .subscribe((status) => {
      console.log(`[Realtime] Group channel ${groupId} status:`, status)
    })
}

/**
 * Désabonne un channel de groupe spécifique
 */
function teardownGroupChannel(groupId) {
  const channel = groupChannels[groupId]
  if (channel) {
    try {
      channel.unsubscribe()
    } catch (e) {
      console.warn('[Realtime] Group channel unsubscribe error:', e)
    }
    const idx = activeChannels.indexOf(channel)
    if (idx !== -1) activeChannels.splice(idx, 1)
    delete groupChannels[groupId]
  }
}

export {
  setupGlobalChannels,
  setupGroupChannel,
  teardownGroupChannel,
  teardownAll
}