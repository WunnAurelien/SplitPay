import { createRouter, createWebHashHistory } from 'vue-router'
import { state, actions } from './store'

import AuthView from './components/AuthView.vue'
import DashboardView from './components/DashboardView.vue'
import GroupDetailsView from './components/GroupDetailsView.vue'
import JoinGroupView from './components/JoinGroupView.vue'
import SettingsView from './components/SettingsView.vue'
import AdminView from './components/AdminView.vue'

const routes = [
  {
    path: '/auth',
    name: 'auth',
    component: AuthView
  },
  {
    path: '/',
    name: 'dashboard',
    component: DashboardView,
    meta: { requiresAuth: true, requiresApproval: true }
  },
  {
    path: '/group/:id',
    name: 'group-details',
    component: GroupDetailsView,
    meta: { requiresAuth: true, requiresApproval: true }
  },
  {
    path: '/group/:id/join',
    name: 'join-group',
    component: JoinGroupView,
    meta: { requiresAuth: true, requiresApproval: true }
  },
  {
    path: '/settings',
    name: 'settings',
    component: SettingsView,
    meta: { requiresAuth: true }
  },
  {
    path: '/admin',
    name: 'admin',
    component: AdminView,
    meta: { requiresAuth: true, requiresAdmin: true }
  },
  {
    path: '/:pathMatch(.*)*',
    redirect: '/'
  }
]

const router = createRouter({
  history: createWebHashHistory(),
  routes
})

router.beforeEach(async (to, from) => {
  // Ensure global store is initialized first
  if (!state.isInitialized) {
    await actions.initialize()
  }

  const isLoggedIn = !!state.session?.user
  const isUserApproved = state.profile?.status === 'approved'
  const isUserAdmin = state.isAdmin

  // 1. Unauthenticated route guard
  if (to.meta.requiresAuth && !isLoggedIn) {
    return { name: 'auth' }
  }

  // 2. Redirect logged-in users away from Auth view
  if (to.name === 'auth' && isLoggedIn) {
    if (isUserApproved) {
      return { name: 'dashboard' }
    } else {
      return { name: 'settings' }
    }
  }

  // 3. Approval status guard (pending/rejected users must stay on settings/profile)
  if (to.meta.requiresApproval && !isUserApproved) {
    return { name: 'settings' }
  }

  // 4. Admin guard
  if (to.meta.requiresAdmin && !isUserAdmin) {
    return { name: 'dashboard' }
  }

  return true
})

export default router
