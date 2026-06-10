<script setup>
import { onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { state, actions } from '../store'
import BaseButton from './ui/BaseButton.vue'
import BaseCard from './ui/BaseCard.vue'
import ErrorBanner from './ui/ErrorBanner.vue'

const router = useRouter()
const { t, locale } = useI18n()

onMounted(async () => {
  await actions.fetchAdminProfiles()
})

const handleStatusUpdate = async (userId, newStatus) => {
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

const handleImpersonate = async (profile) => {
  await actions.impersonateUser(profile)
  router.push('/')
}
</script>

<template>
  <div class="admin-page">
    <div class="admin-header">
      <div>
        <router-link to="/" class="back-link">&larr; {{ $t('common.backToDashboard') }}</router-link>
        <h1>{{ $t('admin.adminPanelTitle') }}</h1>
        <p class="subtitle">{{ $t('admin.adminPanelSubtitle') }}</p>
      </div>
    </div>

    <!-- Error Banner -->
    <ErrorBanner v-if="state.error" :error="state.error" style="margin-bottom: 25px;" />

    <!-- Profiles Table -->
    <BaseCard class="profiles-card">
      <h3>{{ $t('admin.allUserProfiles', { count: state.profiles.length }) }}</h3>

      <div class="table-container">
        <table class="profiles-table">
          <thead>
            <tr>
              <th>{{ $t('admin.thUser') }}</th>
              <th>{{ $t('admin.thEmail') }}</th>
              <th>{{ $t('admin.thStatus') }}</th>
              <th class="actions-col">{{ $t('admin.thActions') }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-if="state.profiles.length === 0">
              <td colspan="5" class="empty-table">{{ $t('admin.noProfiles') }}</td>
            </tr>
            <tr v-for="profile in state.profiles" :key="profile.id"
              :class="{ 'current-admin': profile.id === state.session?.user?.id }">
              <td>
                <div class="user-cell">
                  <div class="user-avatar">
                    {{ (profile.username || profile.email)[0].toUpperCase() }}
                  </div>
                  <div>
                    <span class="username">{{ profile.username || $t('admin.noHandle') }}</span>
                    <span v-if="profile.id === state.session?.user?.id" class="admin-tag">{{ $t('admin.adminYou')
                    }}</span>
                  </div>
                </div>
              </td>
              <td>{{ profile.email }}</td>
              <td>
                <span class="badge" :class="{
                  'badge-approved': profile.status === 'approved',
                  'badge-pending': profile.status === 'pending',
                  'badge-rejected': profile.status === 'rejected'
                }">
                  {{ profile.status === 'approved' ? $t('settings.approved') : profile.status === 'pending' ?
                    $t('settings.pending') : profile.status === 'rejected' ? $t('settings.rejected') : profile.status }}
                </span>
              </td>
              <td class="actions-col">
                <!-- No status changes allowed for the active admin themselves -->
                <div v-if="profile.id !== state.session?.user?.id" class="action-buttons">
                  <BaseButton v-if="profile.status === 'approved'" @click="handleImpersonate(profile)"
                    variant="secondary" size="sm" class="impersonate-btn"
                    style="border-color: rgba(6, 182, 212, 0.3); color: var(--accent-cyan);">
                    {{ $t('admin.loginAs') }}
                  </BaseButton>
                  <BaseButton v-if="profile.status !== 'approved'" @click="handleStatusUpdate(profile.id, 'approved')"
                    variant="secondary" size="sm" class="approve-btn">
                    {{ $t('admin.approveBtn') }}
                  </BaseButton>
                  <BaseButton v-if="profile.status !== 'rejected'" @click="handleStatusUpdate(profile.id, 'rejected')"
                    variant="secondary" size="sm" class="reject-btn">
                    {{ $t('admin.rejectBtn') }}
                  </BaseButton>
                </div>
                <span v-else class="text-muted italic">{{ $t('admin.protected') }}</span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </BaseCard>
  </div>
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

.admin-header {
  margin-bottom: 30px;
}

.subtitle {
  color: var(--text-muted);
  font-size: 0.95rem;
  margin-top: 4px;
}

.table-container {
  overflow-x: auto;
  margin-top: 20px;
}

.profiles-table {
  width: 100%;
  border-collapse: collapse;
  text-align: left;
}

.profiles-table th {
  padding: 12px 16px;
  border-bottom: 2px solid var(--border-color);
  color: var(--text-muted);
  font-size: 0.8rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.profiles-table td {
  padding: 16px;
  border-bottom: 1px solid var(--border-color);
  font-size: 0.9rem;
}

.profiles-table tbody tr:hover {
  background: rgba(255, 255, 255, 0.01);
}

.profiles-table tbody tr.current-admin {
  background: rgba(139, 92, 246, 0.03);
}

.user-cell {
  display: flex;
  align-items: center;
  gap: 12px;
}

.user-avatar {
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

.username {
  font-weight: 600;
}

.admin-tag {
  display: block;
  font-size: 0.7rem;
  color: var(--accent-purple);
  font-weight: 700;
  text-transform: uppercase;
}

.pay-link {
  color: var(--accent-cyan);
}

.pay-link:hover {
  text-decoration: underline;
}

.actions-col {
  text-align: right;
}

.action-buttons {
  display: inline-flex;
  gap: 8px;
  justify-content: flex-end;
}

.approve-btn {
  border-color: rgba(16, 185, 129, 0.3);
  color: var(--color-success);
}

.approve-btn:hover {
  background: var(--color-success-bg);
  border-color: var(--color-success);
}

.reject-btn {
  border-color: rgba(239, 68, 68, 0.3);
  color: var(--color-danger);
}

.reject-btn:hover {
  background: var(--color-danger-bg);
  border-color: var(--color-danger);
}

.impersonate-btn:hover {
  background: rgba(6, 182, 212, 0.08);
  border-color: var(--accent-cyan);
}

.empty-table {
  text-align: center;
  padding: 40px;
  color: var(--text-muted);
}

.italic {
  font-style: italic;
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
