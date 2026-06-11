<script setup>
import { ref, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useSupabase } from '../supabase'
import { state, actions } from '../store'
import BaseButton from './ui/BaseButton.vue'
import BaseCard from './ui/BaseCard.vue'
import ErrorBanner from './ui/ErrorBanner.vue'

const route = useRoute()
const router = useRouter()
const { t } = useI18n()
const { supabase } = useSupabase()

const groupId = route.params.id
const groupName = ref('')
const isLoading = ref(true)
const isJoining = ref(false)
const errorMsg = ref('')

onMounted(async () => {
  try {
    // 1. Fetch group name (allowed by RLS policy "Allow approved users to read groups")
    const { data: group, error: gError } = await supabase
      .from('groups')
      .select('name, id')
      .eq('id', groupId)
      .single()

    if (gError || !group) {
      throw new Error(t('group.groupNotFound') || 'Groupe introuvable')
    }

    groupName.value = group.name

    // 2. Check if already a member
    const { data: membership, error: mError } = await supabase
      .from('group_members')
      .select('*')
      .eq('group_id', groupId)
      .eq('profile_id', state.session?.user?.id)

    if (!mError && membership && membership.length > 0) {
      // Already a member, redirect to details
      router.push(`/group/${groupId}`)
    }
  } catch (err) {
    console.error('Error checking join invite:', err)
    errorMsg.value = err.message || t('group.inviteError') || 'Impossible de charger l\'invitation.'
  } finally {
    isLoading.value = false
  }
})

const handleJoin = async () => {
  isJoining.value = true
  errorMsg.value = ''
  try {
    // Insert membership row for current user (allowed by our updated insert policy)
    const { error } = await supabase
      .from('group_members')
      .insert({
        group_id: groupId,
        profile_id: state.session.user.id
      })

    if (error) throw error

    // Fetch groups in store to update the sidebar list & stats
    await actions.fetchGroups()

    // Redirect to group details
    router.push(`/group/${groupId}`)
  } catch (err) {
    console.error('Error joining group:', err)
    errorMsg.value = err.message || t('group.joinFailed') || 'Impossible de rejoindre le groupe.'
  } finally {
    isJoining.value = false
  }
}
</script>

<template>
  <div class="min-h-[calc(100vh-120px)] flex items-center justify-center relative">
    <div class="glow-sphere purple"></div>
    <div class="glow-sphere cyan"></div>

    <BaseCard class="w-full max-w-md p-8 text-center relative z-10">
      <!-- Loading state -->
      <div v-if="isLoading" class="flex flex-col items-center">
        <span class="spinner"></span>
        <p class="mt-4">{{ $t('group.loadingGroup') }}</p>
      </div>

      <!-- Error state -->
      <ErrorBanner v-else-if="errorMsg" :error="errorMsg" global>
        <BaseButton to="/" variant="secondary" class="w-full mt-4">
          &larr; {{ $t('common.backToDashboard') }}
        </BaseButton>
      </ErrorBanner>

      <!-- Ready to join -->
      <div v-else class="flex flex-col items-center">
        <div class="text-5xl mb-4">👋</div>
        <h2 class="text-2xl font-semibold">{{ $t('group.joinTitle') || 'Rejoindre un groupe' }}</h2>
        <p class="text-sm text-base-content/70 mt-2 mb-4">{{ $t('group.joinInvitation', { name: groupName }) || `Vous avez été invité à rejoindre le groupe :` }}</p>
        
        <div class="w-full bg-cyan/10 border border-cyan/20 rounded-xl p-4 mb-6">
          <h3 class="text-lg font-semibold text-cyan">{{ groupName }}</h3>
        </div>

        <div class="w-full flex flex-col gap-3">
          <BaseButton @click="handleJoin" variant="primary" :loading="isJoining" class="w-full">
            {{ $t('group.joinConfirmBtn') || 'Rejoindre le groupe' }}
          </BaseButton>
          <BaseButton to="/" variant="secondary" class="w-full">
            {{ $t('common.cancel') }}
          </BaseButton>
        </div>
      </div>
    </BaseCard>
  </div>

</template>

<style scoped>
/* Keep decorative spheres and spinner */
.glow-sphere { position: absolute; border-radius: 50%; filter: blur(80px); opacity: 0.15; z-index: 1; pointer-events: none; }
.glow-sphere.purple { width: 300px; height: 300px; background-color: var(--accent-purple); top: 10%; left: 20%; }
.glow-sphere.cyan { width: 250px; height: 250px; background-color: var(--accent-cyan); bottom: 15%; right: 25%; }
.spinner { width: 32px; height: 32px; border: 3px solid rgba(255,255,255,0.12); border-top-color: var(--accent-cyan); border-radius: 50%; animation: spin 0.8s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }
</style>
