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
  <div class="py-8">
    <div class="mb-6">
      <router-link to="/" class="text-sm font-semibold text-base-content/70">&larr; {{ $t('common.backToDashboard') }}</router-link>
      <h1 class="text-2xl font-semibold mt-2">{{ $t('admin.adminPanelTitle') }}</h1>
      <p class="text-sm text-base-content/70">{{ $t('admin.adminPanelSubtitle') }}</p>
    </div>

    <!-- Error Banner -->
    <ErrorBanner v-if="state.error" :error="state.error" class="mb-6" />

    <!-- Profiles Table -->
    <BaseCard class="p-4">
      <h3 class="mb-4">{{ $t('admin.allUserProfiles', { count: state.profiles.length }) }}</h3>

      <div class="overflow-x-auto">
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
            <tr v-if="state.profiles.length === 0">
              <td colspan="4" class="p-6 text-center text-base-content/70">{{ $t('admin.noProfiles') }}</td>
            </tr>
            <tr v-for="profile in state.profiles" :key="profile.id" :class="profile.id === state.session?.user?.id ? 'bg-primary/6' : ''">
              <td class="p-3 align-top">
                <div class="flex items-center gap-3">
                  <div class="w-8 h-8 rounded-full bg-gradient-to-br from-primary to-secondary text-white flex items-center justify-center font-bold">{{ (profile.username || profile.email)[0].toUpperCase() }}</div>
                  <div>
                    <div class="font-semibold">{{ profile.username || $t('admin.noHandle') }}</div>
                    <div v-if="profile.id === state.session?.user?.id" class="text-xs text-primary uppercase font-bold">{{ $t('admin.adminYou') }}</div>
                  </div>
                </div>
              </td>
              <td class="p-3 align-top">{{ profile.email }}</td>
              <td class="p-3 align-top">
                <span class="badge" :class="profile.status === 'approved' ? 'badge-success' : profile.status === 'pending' ? 'badge-warning' : profile.status === 'rejected' ? 'badge-error' : 'badge-secondary'">{{ profile.status === 'approved' ? $t('settings.approved') : profile.status === 'pending' ? $t('settings.pending') : profile.status === 'rejected' ? $t('settings.rejected') : profile.status }}</span>
              </td>
              <td class="p-3 align-top text-right">
                <div v-if="profile.id !== state.session?.user?.id" class="inline-flex gap-2">
                  <BaseButton v-if="profile.status === 'approved'" @click="handleImpersonate(profile)" variant="secondary" size="sm">{{ $t('admin.loginAs') }}</BaseButton>
                  <BaseButton v-if="profile.status !== 'approved'" @click="handleStatusUpdate(profile.id, 'approved')" variant="secondary" size="sm">{{ $t('admin.approveBtn') }}</BaseButton>
                  <BaseButton v-if="profile.status !== 'rejected'" @click="handleStatusUpdate(profile.id, 'rejected')" variant="secondary" size="sm">{{ $t('admin.rejectBtn') }}</BaseButton>
                </div>
                <div v-else class="text-sm italic text-base-content/60">{{ $t('admin.protected') }}</div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </BaseCard>
  </div>

</template>

<style scoped>
/* Rely on Tailwind/DaisyUI for admin styles */
</style>
