<script setup>
import { onMounted, watch, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { state, isApproved, actions } from './store'
import { supabase } from './supabase'

const router = useRouter()
const { locale, t } = useI18n()

const confirmDialogRef = ref(null)
const alertDialogRef = ref(null)
const isMobileMenuOpen = ref(false)

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
  <div class="app-container">
    <!-- Impersonation Banner -->
    <div v-if="state.impersonatingFrom" class="impersonation-banner">
      <div class="banner-content">
        <span class="banner-text">
          🕵️‍♂️ {{ $t('app.testingAs', { identity: state.profile?.username || state.profile?.email }) }}
        </span>
        <button @click="stopImpersonating" class="btn btn-primary btn-sm stop-imp-btn">
          {{ $t('app.returnToAdmin') }}
        </button>
      </div>
    </div>

    <!-- Top Header Navigation -->
    <header class="header" v-if="state.session">
      <div class="header-content">
        <router-link to="/" class="logo-container">
          <div class="logo-icon">S</div>
          <span>SplitPay</span>
        </router-link>

        <!-- Desktop Navigation (Hidden on mobile) -->
        <nav class="nav-links desktop-only">
          <router-link v-if="isApproved" to="/" class="nav-item">
            {{ $t('app.dashboard') }}
          </router-link>

          <router-link to="/settings" class="nav-item">
            {{ $t('app.settings') }}
            <span v-if="state.profile?.status === 'pending'" class="pending-dot"
              :title="$t('app.pendingDotTitle')"></span>
          </router-link>
        </nav>

        <!-- Desktop User Menu (Hidden on mobile) -->
        <div class="user-menu desktop-only">
          <div class="lang-selector">
            <select v-model="locale" @change="saveLocale" class="lang-select">
              <option value="fr">FR 🇫🇷</option>
              <option value="en">EN 🇬🇧</option>
            </select>
          </div>

          <div class="user-info">
            <span class="user-name">{{ state.profile?.username || state.session?.user?.email }}</span>
            <span class="user-status-dot" :class="state.profile?.status"
              :title="$t('app.statusTitle', { status: getStatusLabel(state.profile?.status) })"></span>
          </div>
          <button @click="handleLogout" class="btn btn-secondary btn-sm logout-btn">
            {{ $t('common.logout') }}
          </button>
        </div>

        <!-- Hamburger Button (Mobile only) -->
        <button @click="isMobileMenuOpen = !isMobileMenuOpen" class="hamburger-btn mobile-only"
          :class="{ 'is-active': isMobileMenuOpen }" aria-label="Toggle menu">
          <span class="hamburger-line"></span>
          <span class="hamburger-line"></span>
          <span class="hamburger-line"></span>
        </button>
      </div>

      <!-- Mobile Slide-over Drawer Menu -->
      <transition name="slide">
        <div v-if="isMobileMenuOpen" class="mobile-drawer-overlay" @click.self="isMobileMenuOpen = false">
          <div class="mobile-drawer">
            <div class="drawer-header">
              <div class="logo-container">
                <div class="logo-icon">S</div>
                <span>SplitPay</span>
              </div>
              <button @click="isMobileMenuOpen = false" class="drawer-close-btn">&times;</button>
            </div>

            <nav class="drawer-nav">
              <router-link v-if="isApproved" to="/" class="drawer-item" @click="isMobileMenuOpen = false">
                📊 {{ $t('app.dashboard') }}
              </router-link>

              <router-link to="/settings" class="drawer-item" @click="isMobileMenuOpen = false">
                ⚙️ {{ $t('app.settings') }}
                <span v-if="state.profile?.status === 'pending'" class="pending-dot inline"></span>
              </router-link>
            </nav>

            <div class="drawer-footer">
              <div class="drawer-user-info">
                <div class="user-avatar-large">
                  {{ (state.profile?.username || state.session?.user?.email)[0].toUpperCase() }}
                  <span class="user-status-dot-large" :class="state.profile?.status"></span>
                </div>
                <div class="user-details">
                  <span class="drawer-username">{{ state.profile?.username || state.session?.user?.email }}</span>
                  <span class="drawer-status-label">{{ getStatusLabel(state.profile?.status) }}</span>
                </div>
              </div>

              <div class="drawer-lang-selector">
                <label>{{ $t('app.languageLabel') }}</label>
                <select v-model="locale" @change="saveLocale" class="lang-select">
                  <option value="fr">FR 🇫🇷</option>
                  <option value="en">EN 🇬🇧</option>
                </select>
              </div>

              <button @click="handleLogout(); isMobileMenuOpen = false" class="btn btn-danger drawer-logout-btn">
                🚪 {{ $t('common.logout') }}
              </button>
            </div>
          </div>
        </div>
      </transition>
    </header>

    <!-- Main Content Root Router Mounting -->
    <main class="main-content">
      <div v-if="!state.isInitialized" class="global-loader">
        <div class="spinner"></div>
        <p>{{ $t('common.loading') }}</p>
      </div>
      <template v-else>
        <!-- Global Connection / Authentication Error Banner -->
        <div v-if="state.connectionError" class="error-banner-global glass-panel">
          <span class="warning-icon">⚠️</span>
          <div class="error-details">
            <h3>{{ $t('common.errorConfig') }}</h3>
            <p>{{ state.connectionError }}</p>
            <p class="error-resolution" v-html="$t('common.errorResolution')"></p>
          </div>
        </div>
        <router-view />
      </template>
    </main>

    <!-- Global Custom Confirm Dialog -->
    <dialog ref="confirmDialogRef" @cancel.prevent="state.confirmState?.reject()" class="global-confirm-dialog">
      <div class="dialog-content" v-if="state.confirmState?.isOpen">
        <div class="dialog-header">
          <h2>{{ state.confirmState.title || 'Confirmation' }}</h2>
        </div>
        <p class="confirm-message"
          style="font-size: 0.95rem; color: var(--text-muted); line-height: 1.5; margin-bottom: 24px;">
          {{ state.confirmState.message }}
        </p>
        <div class="dialog-actions" style="display: flex; gap: 12px; justify-content: flex-end;">
          <button @click="state.confirmState.reject()" class="btn btn-secondary btn-sm">
            {{ state.confirmState.cancelText || $t('common.cancel') || 'Annuler' }}
          </button>
          <button @click="state.confirmState.resolve()" class="btn btn-primary btn-sm">
            {{ state.confirmState.confirmText || $t('common.confirm') || 'Confirmer' }}
          </button>
        </div>
      </div>
    </dialog>

    <!-- Global Custom Alert Dialog -->
    <dialog ref="alertDialogRef" @cancel.prevent="state.alertState?.resolve()" class="global-alert-dialog">
      <div class="dialog-content" v-if="state.alertState?.isOpen">
        <div class="dialog-header">
          <h2>{{ state.alertState.title || 'Notification' }}</h2>
        </div>
        <p class="alert-message"
          style="font-size: 0.95rem; color: var(--text-muted); line-height: 1.5; margin-bottom: 24px;">
          {{ state.alertState.message }}
        </p>
        <div class="dialog-actions" style="display: flex; gap: 12px; justify-content: flex-end;">
          <button @click="state.alertState.resolve()" class="btn btn-primary btn-sm">
            {{ state.alertState.okText || 'OK' }}
          </button>
        </div>
      </div>
    </dialog>
  </div>
</template>

<style scoped>
.pending-dot {
  display: inline-block;
  width: 6px;
  height: 6px;
  background-color: var(--color-warning);
  border-radius: 50%;
  margin-left: 4px;
  vertical-align: top;
}

.user-menu {
  display: flex;
  align-items: center;
  gap: 16px;
}

.user-info {
  display: flex;
  align-items: center;
  gap: 8px;
}

.user-name {
  font-size: 0.85rem;
  font-weight: 600;
  max-width: 140px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.user-status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background-color: var(--text-dark);
}

.user-status-dot.approved {
  background-color: var(--color-success);
  box-shadow: 0 0 8px var(--color-success);
}

.user-status-dot.pending {
  background-color: var(--color-warning);
  box-shadow: 0 0 8px var(--color-warning);
}

.user-status-dot.rejected {
  background-color: var(--color-danger);
  box-shadow: 0 0 8px var(--color-danger);
}

.logout-btn {
  padding: 6px 12px;
  font-size: 0.8rem;
}

.global-loader {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: calc(100vh - 160px);
  gap: 16px;
  color: var(--text-muted);
}

.admin-link {
  border: 1px solid rgba(139, 92, 246, 0.2);
  color: var(--accent-purple-hover) !important;
}

.admin-link:hover,
.admin-link.router-link-active {
  background: rgba(139, 92, 246, 0.08) !important;
}

/* Spinner anim */
.spinner {
  width: 32px;
  height: 32px;
  border: 3px solid rgba(255, 255, 255, 0.05);
  border-radius: 50%;
  border-top-color: var(--accent-purple);
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

.error-banner-global {
  display: flex;
  align-items: flex-start;
  gap: 16px;
  background-color: var(--color-danger-bg);
  border-color: rgba(239, 68, 68, 0.2);
  margin-bottom: 24px;
  padding: 20px;
}

.warning-icon {
  font-size: 1.8rem;
  line-height: 1;
}

.error-details h3 {
  font-size: 1.1rem;
  color: var(--color-danger);
  margin-bottom: 4px;
}

.error-details p {
  font-size: 0.9rem;
  color: var(--text-muted);
}

.error-resolution {
  margin-top: 8px;
  font-size: 0.8rem !important;
  color: var(--text-dark) !important;
}

.error-resolution :deep(code) {
  color: var(--text-primary);
  background: rgba(255, 255, 255, 0.05);
  padding: 2px 6px;
  border-radius: 4px;
}

/* Lang Selector Styles */
.lang-selector {
  position: relative;
}

.lang-select {
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid var(--glass-border);
  color: var(--text-primary);
  border-radius: 8px;
  padding: 4px 8px;
  font-size: 0.8rem;
  font-weight: 600;
  cursor: pointer;
  outline: none;
  transition: all 0.2s;
}

.lang-select:hover {
  background: rgba(255, 255, 255, 0.1);
  border-color: rgba(255, 255, 255, 0.2);
}

.lang-select option {
  background-color: #0b0d19;
  color: var(--text-primary);
}

.impersonation-banner {
  background: linear-gradient(135deg, rgba(6, 182, 212, 0.2), rgba(139, 92, 246, 0.2));
  backdrop-filter: blur(12px);
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  padding: 10px 20px;
  width: 100%;
  position: sticky;
  top: 0;
  z-index: 1000;
}

.banner-content {
  max-width: 1200px;
  margin: 0 auto;
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
}

.banner-text {
  font-size: 0.9rem;
  font-weight: 600;
  color: var(--text-primary);
}

.stop-imp-btn {
  background: var(--accent-purple) !important;
  border: none !important;
  color: #fff !important;
  box-shadow: 0 0 12px rgba(139, 92, 246, 0.3);
}

.stop-imp-btn:hover {
  background: var(--accent-purple-hover) !important;
}

/* Responsive Layout Utilities */
@media (min-width: 769px) {
  .mobile-only {
    display: none !important;
  }
}

@media (max-width: 768px) {
  .desktop-only {
    display: none !important;
  }
}

/* Hamburger Button */
.hamburger-btn {
  background: transparent;
  border: none;
  cursor: pointer;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  width: 24px;
  height: 18px;
  padding: 0;
  z-index: 1010;
}

.hamburger-line {
  width: 100%;
  height: 2px;
  background-color: var(--text-primary);
  border-radius: 2px;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

.hamburger-btn.is-active .hamburger-line:nth-child(1) {
  transform: translateY(8px) rotate(45deg);
}

.hamburger-btn.is-active .hamburger-line:nth-child(2) {
  opacity: 0;
}

.hamburger-btn.is-active .hamburger-line:nth-child(3) {
  transform: translateY(-8px) rotate(-45deg);
}

/* Mobile Drawer Overlay */
.mobile-drawer-overlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 100vw;
  height: 100vh;
  height: 100dvh;
  background: rgba(4, 5, 8, 0.6);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  z-index: 1020;
  display: flex;
  justify-content: flex-end;
}

/* Mobile Drawer */
.mobile-drawer {
  width: 300px;
  height: 100%;
  max-height: 100%;
  background: var(--bg-secondary);
  border-left: 1px solid var(--border-color);
  padding: 24px;
  padding-bottom: calc(24px + env(safe-area-inset-bottom, 0px));
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  box-shadow: -10px 0 30px rgba(0, 0, 0, 0.5);
  overflow-y: auto;
}

.drawer-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 32px;
  border-bottom: 1px solid var(--border-color);
  padding-bottom: 16px;
  flex-shrink: 0;
}

.drawer-close-btn {
  background: transparent;
  border: none;
  color: var(--text-muted);
  font-size: 2rem;
  cursor: pointer;
  line-height: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border-radius: 50%;
  transition: background-color 0.2s;
}

.drawer-close-btn:hover {
  background: rgba(255, 255, 255, 0.05);
  color: var(--text-primary);
}

/* Drawer Navigation */
.drawer-nav {
  display: flex;
  flex-direction: column;
  gap: 16px;
  flex-grow: 1;
  flex-shrink: 0;
}

.drawer-item {
  color: var(--text-muted);
  font-size: 1.1rem;
  font-weight: 600;
  padding: 12px 16px;
  border-radius: 12px;
  display: flex;
  align-items: center;
  gap: 12px;
  transition: all 0.2s ease;
  border: 1px solid transparent;
}

.drawer-item:hover,
.drawer-item.router-link-active {
  color: var(--text-primary);
  background: rgba(255, 255, 255, 0.04);
  border-color: var(--border-color);
}

.drawer-item.admin-link {
  color: var(--accent-purple-hover);
  border-color: rgba(139, 92, 246, 0.1);
}

.drawer-item.admin-link:hover,
.drawer-item.admin-link.router-link-active {
  background: rgba(139, 92, 246, 0.06);
  border-color: rgba(139, 92, 246, 0.3);
}

.pending-dot.inline {
  display: inline-block;
  vertical-align: middle;
  margin-left: auto;
}

/* Drawer Footer */
.drawer-footer {
  border-top: 1px solid var(--border-color);
  padding-top: 24px;
  display: flex;
  flex-direction: column;
  gap: 20px;
  flex-shrink: 0;
}

.drawer-user-info {
  display: flex;
  align-items: center;
  gap: 16px;
}

.user-avatar-large {
  width: 44px;
  height: 44px;
  border-radius: 50%;
  background: linear-gradient(135deg, var(--accent-purple), var(--accent-cyan));
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 700;
  font-size: 1.1rem;
  color: #fff;
  position: relative;
}

.user-status-dot-large {
  position: absolute;
  bottom: 0;
  right: 0;
  width: 12px;
  height: 12px;
  border-radius: 50%;
  border: 2px solid var(--bg-secondary);
  background-color: var(--text-dark);
}

.user-status-dot-large.approved {
  background-color: var(--color-success);
  box-shadow: 0 0 6px var(--color-success);
}

.user-status-dot-large.pending {
  background-color: var(--color-warning);
  box-shadow: 0 0 6px var(--color-warning);
}

.user-status-dot-large.rejected {
  background-color: var(--color-danger);
  box-shadow: 0 0 6px var(--color-danger);
}

.user-details {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.drawer-username {
  font-size: 0.95rem;
  font-weight: 600;
  color: var(--text-primary);
  max-width: 190px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.drawer-status-label {
  font-size: 0.75rem;
  color: var(--text-muted);
}

.drawer-lang-selector {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.drawer-lang-selector label {
  font-size: 0.85rem;
  font-weight: 600;
  color: var(--text-muted);
  text-transform: none;
  letter-spacing: normal;
  margin-bottom: 0;
  white-space: nowrap;
}

.drawer-lang-selector .lang-select {
  padding: 6px 12px;
  width: auto;
  min-width: 100px;
}

.drawer-logout-btn {
  width: 100%;
  justify-content: center;
}

/* Transition Animations */
.slide-enter-active,
.slide-leave-active {
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

.slide-enter-active .mobile-drawer,
.slide-leave-active .mobile-drawer {
  transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

.slide-enter-from,
.slide-leave-to {
  opacity: 0;
}

.slide-enter-from .mobile-drawer {
  transform: translateX(100%);
}

.slide-leave-to .mobile-drawer {
  transform: translateX(100%);
}
</style>
