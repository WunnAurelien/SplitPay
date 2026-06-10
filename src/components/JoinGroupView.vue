<script setup>
import { ref, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { supabase } from '../supabase'
import { state, actions } from '../store'
import BaseButton from './ui/BaseButton.vue'
import BaseCard from './ui/BaseCard.vue'
import ErrorBanner from './ui/ErrorBanner.vue'

const route = useRoute()
const router = useRouter()
const { t } = useI18n()

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
  <div class="join-page">
    <div class="glow-sphere purple"></div>
    <div class="glow-sphere cyan"></div>

    <BaseCard class="join-card">
      <!-- Loading state -->
      <div v-if="isLoading" class="loading-state">
        <span class="spinner"></span>
        <p>{{ $t('group.loadingGroup') }}</p>
      </div>

      <!-- Error state -->
      <ErrorBanner v-else-if="errorMsg" :error="errorMsg" global>
        <BaseButton to="/" variant="secondary" style="margin-top: 24px; width: 100%;">
          &larr; {{ $t('common.backToDashboard') }}
        </BaseButton>
      </ErrorBanner>

      <!-- Ready to join -->
      <div v-else class="join-content">
        <div class="join-icon">👋</div>
        <h2>{{ $t('group.joinTitle') || 'Rejoindre un groupe' }}</h2>
        <p class="join-tagline">
          {{ $t('group.joinInvitation', { name: groupName }) || `Vous avez été invité à rejoindre le groupe :` }}
        </p>
        
        <div class="group-badge">
          <h3>{{ groupName }}</h3>
        </div>

        <div class="join-actions">
          <BaseButton 
            @click="handleJoin" 
            variant="primary" class="join-submit" 
            :loading="isJoining"
          >
            {{ $t('group.joinConfirmBtn') || 'Rejoindre le groupe' }}
          </BaseButton>
          
          <BaseButton to="/" variant="secondary" class="cancel-btn">
            {{ $t('common.cancel') }}
          </BaseButton>
        </div>
      </div>
    </BaseCard>
  </div>
</template>

<style scoped>
.join-page {
  display: flex;
  justify-content: center;
  align-items: center;
  min-height: calc(100vh - 120px);
  position: relative;
}

.join-card {
  width: 100%;
  max-width: 480px;
  position: relative;
  z-index: 10;
  padding: 40px;
  text-align: center;
}

.loading-state, .error-state, .join-content {
  display: flex;
  flex-direction: column;
  align-items: center;
}

.join-icon {
  font-size: 3.5rem;
  margin-bottom: 20px;
}

.error-icon {
  font-size: 3.5rem;
  margin-bottom: 20px;
  color: var(--accent-red);
}

.join-content h2 {
  font-size: 1.8rem;
  margin-bottom: 12px;
  font-weight: 700;
  color: var(--text-primary);
}

.join-tagline {
  color: var(--text-muted);
  font-size: 1rem;
  line-height: 1.5;
  margin-bottom: 24px;
}

.group-badge {
  background: rgba(6, 182, 212, 0.08);
  border: 1px solid rgba(6, 182, 212, 0.2);
  border-radius: 16px;
  padding: 16px 24px;
  width: 100%;
  margin-bottom: 32px;
  box-shadow: inset 0 0 12px rgba(6, 182, 212, 0.05);
}

.group-badge h3 {
  color: var(--accent-cyan);
  font-size: 1.3rem;
  margin: 0;
  font-weight: 600;
}

.join-actions {
  display: flex;
  flex-direction: column;
  gap: 12px;
  width: 100%;
}

.join-submit {
  height: 48px;
  font-size: 1rem;
}

.cancel-btn {
  height: 48px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1rem;
}

/* Glowing background spheres */
.glow-sphere {
  position: absolute;
  border-radius: 50%;
  filter: blur(80px);
  opacity: 0.15;
  z-index: 1;
}

.glow-sphere.purple {
  width: 300px;
  height: 300px;
  background-color: var(--accent-purple);
  top: 10%;
  left: 20%;
}

.glow-sphere.cyan {
  width: 250px;
  height: 250px;
  background-color: var(--accent-cyan);
  bottom: 15%;
  right: 25%;
}

/* Spinner anim */
.spinner {
  width: 18px;
  height: 18px;
  border: 2px solid rgba(255, 255, 255, 0.3);
  border-radius: 50%;
  border-top-color: white;
  animation: spin 0.8s linear infinite;
  margin-right: 8px;
}

.loading-state .spinner {
  width: 32px;
  height: 32px;
  border-width: 3px;
  border-top-color: var(--accent-cyan);
  margin-right: 0;
  margin-bottom: 16px;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}
</style>
