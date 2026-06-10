<script setup>
import { onMounted, onUnmounted, watch, ref, computed } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { state, isApproved, actions } from './store'
import { useSupabase } from './supabase'
import BaseButton from './components/ui/BaseButton.vue'
import BaseModal from './components/ui/BaseModal.vue'
import ErrorBanner from './components/ui/ErrorBanner.vue'

const router = useRouter()
const { locale, t } = useI18n()
const { supabase } = useSupabase()

const confirmDialogRef = ref(null)
const alertDialogRef = ref(null)
const isMobileMenuOpen = ref(false)

let scrollPosition = 0

// Map locales to flag icons
const localeFlags = {
  fr: { code: 'fr', label: 'FR' },
  en: { code: 'gb', label: 'EN' }
}

const currentLanguage = computed(() => localeFlags[locale.value]?.label || '')

const pendingCount = computed(() => {
  if (!state.isAdmin) return 0
  return state.profiles.filter(p => p.status === 'pending').length
})

watch(isMobileMenuOpen, (isOpen) => {
  if (isOpen) {
    scrollPosition = window.scrollY
    document.body.style.overflow = 'hidden'
    document.body.style.position = 'fixed'
    document.body.style.top = `-${scrollPosition}px`
    document.body.style.width = '100%'
  } else {
    document.body.style.overflow = ''
    document.body.style.position = ''
    document.body.style.top = ''
    document.body.style.width = ''
    window.scrollTo(0, scrollPosition)
  }
})

watch(() => state.confirmState?.isOpen, (isOpen) => {
  if (isOpen) {
    confirmDialogRef.value?.showModal()
  } else {
    confirmDialogRef.value?.close()
  }
})

watch(() => state.alertState?.isOpen, (isOpen) => {
  if (isOpen) {
    alertDialogRef.value?.showModal()
  } else {
    alertDialogRef.value?.close()
  }
})

onMounted(async () => {
  // Détection du hash recovery AVANT Vue Router ne le consomme
  // Le SDK Supabase parse le hash fragment et établit la session automatiquement
  const fullHash = window.location.hash
  if (fullHash.includes('type=recovery')) {
    // Attendre que le SDK ait fini de parser le hash et établi la session
    state.isRecovery = true
    let attempts = 0
    while (attempts < 20) {
      const { data } = await supabase.auth.getSession()
      if (data?.session) {
        router.replace('/auth/update-password')
        return
      }
      await new Promise(r => setTimeout(r, 500))
      attempts++
    }
  }
  await actions.initialize()
})

const handleLogout = async () => {
  const ok = await actions.confirm({
    title: t('common.logout') || 'Déconnexion',
    message: t('common.confirmLogout') || 'Êtes-vous sûr de vouloir vous déconnecter ?',
    confirmText: t('common.logout') || 'Déconnexion',
    cancelText: t('common.cancel') || 'Annuler'
  })
  if (ok) {
    await actions.signOut()
    router.push('/auth')
  }
}

const saveLocale = () => {
  localStorage.setItem('splitpay_locale', locale.value)
}

const getStatusLabel = (status) => {
  if (!status) return ''
  const labels = {
    approved: t('settings.approved'),
    pending: t('settings.pending'),
    rejected: t('settings.rejected')
  }
  return labels[status] || status
}

const stopImpersonating = async () => {
  await actions.stopImpersonating()
  router.push('/admin')
}
</script>

<template>
    <div class="min-h-screen min-h-[100dvh] flex flex-col">
    <!-- Impersonation Banner -->
    <div v-if="state.impersonatingFrom" class="bg-gradient-to-r from-cyan-600/20 via-transparent to-purple-600/20 backdrop-blur-sm border-b border-base-300 sticky top-0 z-50">
      <div class="max-w-6xl mx-auto flex items-center justify-between px-4 py-3">
        <div class="text-sm font-semibold text-base-content">🕵️‍♂️ {{ $t('app.connectedAs', { identity: state.profile?.username || state.profile?.email }) }}</div>
        <BaseButton @click="stopImpersonating" variant="primary" size="sm">{{ $t('app.returnToAdmin') }}</BaseButton>
      </div>
    </div>

    <!-- Top Header Navigation -->
    <header v-if="state.session" class="sticky top-0 z-40 bg-base-200/60 backdrop-blur border-b border-base-300">
      <div class="max-w-6xl mx-auto flex items-center justify-between px-4 py-3">
        <router-link to="/" class="flex items-center gap-2 font-semibold text-lg">
          <div class="w-7 h-7 rounded-md bg-gradient-to-br from-primary to-secondary text-white flex items-center justify-center font-bold">S</div>
          <span>SplitPay</span>
        </router-link>

        <!-- Desktop Navigation -->
        <nav class="hidden md:flex items-center gap-4">
          <router-link v-if="isApproved" to="/" class="px-3 py-2 rounded-md text-base-content/80 font-semibold hover:bg-base-300/40">{{ $t('app.dashboard') }}</router-link>
          <router-link to="/settings" class="px-3 py-2 rounded-md text-base-content/80 font-semibold hover:bg-base-300/40">
            {{ $t('app.settings') }}
            <span v-if="state.profile?.status === 'pending'" class="inline-block w-1.5 h-1.5 bg-warning rounded-full ml-2" :title="$t('app.pendingDotTitle')"></span>
          </router-link>
          <router-link v-if="state.isAdmin" to="/admin" class="px-3 py-2 rounded-md text-base-content/80 font-semibold hover:bg-base-300/40 flex items-center gap-1.5">
            {{ $t('app.admin') }}
            <span v-if="pendingCount > 0" class="badge badge-warning badge-xs" :title="$t('app.adminPendingTitle')">{{ $t('app.adminPendingCount', { count: pendingCount }) }}</span>
          </router-link>
        </nav>

        <!-- Desktop User Menu -->
        <div class="hidden md:flex items-center gap-3">
          <select v-model="locale" @change="saveLocale" class="select select-sm select-bordered">
            <option value="fr">🇫🇷 FR</option>
            <option value="en">🇬🇧 EN</option>
          </select>

          <div class="flex items-center gap-2">
            <div class="text-sm font-semibold max-w-[140px] truncate">{{ state.profile?.username || state.session?.user?.email }}</div>
            <span :class="['w-2.5 h-2.5 rounded-full', state.profile?.status === 'approved' ? 'bg-success' : state.profile?.status === 'pending' ? 'bg-warning' : 'bg-error']" :title="getStatusLabel(state.profile?.status)"></span>
          </div>

          <BaseButton @click="handleLogout" variant="secondary" size="sm">{{ $t('common.logout') }}</BaseButton>
        </div>

        <!-- Hamburger Button (Mobile only) -->
        <button @click="isMobileMenuOpen = !isMobileMenuOpen" class="md:hidden p-2" :class="{ 'is-active': isMobileMenuOpen }" aria-label="Toggle menu">
          <svg class="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M4 6h16M4 12h16M4 18h16" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
        </button>
      </div>
    </header>

    <!-- Mobile Slide-over Drawer Menu -->
    <transition name="slide">
      <div v-if="isMobileMenuOpen" class="fixed inset-0 bg-black/50 backdrop-blur z-50 flex justify-end" @click.self="isMobileMenuOpen = false">
        <div class="w-72 bg-base-200 h-full p-4 flex flex-col justify-between">
          <div>
            <div class="flex items-center justify-between mb-4 border-b border-base-300 pb-3">
              <div class="flex items-center gap-2 font-semibold">
                <div class="w-8 h-8 rounded-md bg-gradient-to-br from-primary to-secondary text-white flex items-center justify-center font-bold">S</div>
                <span>SplitPay</span>
              </div>
              <button @click="isMobileMenuOpen = false" class="text-xl">&times;</button>
            </div>

            <nav class="flex flex-col gap-3">
              <router-link v-if="isApproved" to="/" class="rounded-lg px-4 py-3 text-base-content/80 font-semibold hover:bg-base-300/40" @click="isMobileMenuOpen = false">📊 {{ $t('app.dashboard') }}</router-link>
              <router-link to="/settings" class="rounded-lg px-4 py-3 text-base-content/80 font-semibold hover:bg-base-300/40" @click="isMobileMenuOpen = false">
                ⚙️ {{ $t('app.settings') }}
                <span v-if="state.profile?.status === 'pending'" class="inline-block w-1.5 h-1.5 bg-warning rounded-full ml-2"></span>
              </router-link>
              <router-link v-if="state.isAdmin" to="/admin" class="rounded-lg px-4 py-3 text-base-content/80 font-semibold hover:bg-base-300/40 flex items-center gap-1.5" @click="isMobileMenuOpen = false">
                🛡️ {{ $t('app.admin') }}
                <span v-if="pendingCount > 0" class="badge badge-warning badge-xs" :title="$t('app.adminPendingTitle')">{{ $t('app.adminPendingCount', { count: pendingCount }) }}</span>
              </router-link>
            </nav>
          </div>

          <div class="flex flex-col gap-4">
            <div class="flex items-center gap-3">
              <div class="w-11 h-11 rounded-full bg-gradient-to-br from-primary to-secondary text-white flex items-center justify-center font-bold">
                {{ (state.profile?.username || state.session?.user?.email)[0]?.toUpperCase() }}
              </div>
              <div>
                <div class="font-semibold truncate max-w-[140px]">{{ state.profile?.username || state.session?.user?.email }}</div>
                <div class="text-sm text-base-content/70">{{ getStatusLabel(state.profile?.status) }}</div>
              </div>
            </div>

            <div class="flex flex-col gap-2">
              <label class="text-sm font-semibold">{{ $t('app.languageLabel') }}</label>
              <select v-model="locale" @change="saveLocale" class="select select-sm select-bordered">
                <option value="fr">🇫🇷 FR</option>
                <option value="en">🇬🇧 EN</option>
              </select>
            </div>

            <BaseButton @click="handleLogout(); isMobileMenuOpen = false" variant="danger" class="w-full">🚪 {{ $t('common.logout') }}</BaseButton>
          </div>
        </div>
      </div>
    </transition>

    <main class="mx-auto w-full max-w-6xl px-4 py-6">
      <router-view />
    </main>

    <!-- Confirm Dialog Modal -->
    <BaseModal ref="confirmDialogRef" :title="state.confirmState.title" :show-close="false">
      <p>{{ state.confirmState.message }}</p>
      <template #actions>
        <BaseButton @click="state.confirmState.reject?.()" variant="secondary" size="sm">{{ state.confirmState.cancelText }}</BaseButton>
        <BaseButton @click="state.confirmState.resolve?.()" variant="primary" size="sm">{{ state.confirmState.confirmText }}</BaseButton>
      </template>
    </BaseModal>

    <!-- Alert Dialog Modal -->
    <BaseModal ref="alertDialogRef" :title="state.alertState.title" :show-close="false">
      <p>{{ state.alertState.message }}</p>
      <template #actions>
        <BaseButton @click="state.alertState.resolve?.()" variant="primary" size="sm">{{ state.alertState.okText }}</BaseButton>
      </template>
    </BaseModal>
  </div>
</template>

<style scoped>
/* Keep slide transition classes for Vue transition */
.slide-enter-active,
.slide-leave-active {
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}
.slide-enter-from,
.slide-leave-to {
  opacity: 0;
}
</style>
