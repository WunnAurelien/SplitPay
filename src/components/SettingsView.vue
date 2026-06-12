<script setup>
import { ref, watch, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { state, actions } from '../store'
import { useSupabase } from '../supabase'
import BaseButton from './ui/BaseButton.vue'
import BaseCard from './ui/BaseCard.vue'
import BaseInput from './ui/BaseInput.vue'
import ErrorBanner from './ui/ErrorBanner.vue'
import PullToRefresh from './ui/PullToRefresh.vue'
import { isRunningAsPWA } from '../usePWA'

const handleRefresh = () => {
  // Settings are local — just re-sync the form fields from state
  syncFields()
}

const router = useRouter()
const { t } = useI18n()
const { supabase } = useSupabase()
const username = ref('')
const paymentLink = ref('')
const phoneNumber = ref('')
const iban = ref('')
const isSaving = ref(false)
const errorMsg = ref('')
const successMsg = ref('')

const hasPendingRedirect = ref(!!localStorage.getItem('splitpay_redirect_after_auth'))
const pendingJoinGroupId = ref(localStorage.getItem('splitpay_pending_join_group_id'))
const pendingJoinStatus = ref(localStorage.getItem('splitpay_pending_join_status'))
const pendingGroupName = ref('')
const isFetchingGroup = ref(false)
const pendingRedirectUrl = ref(localStorage.getItem('splitpay_redirect_after_auth'))

const fetchPendingGroupName = async () => {
  let targetGroupId = pendingJoinGroupId.value
  if (!targetGroupId && pendingRedirectUrl.value) {
    const match = pendingRedirectUrl.value.match(/\/group\/([a-f0-9-]+)\/join/)
    if (match && match[1]) {
      targetGroupId = match[1]
    }
  }
  
  if (targetGroupId) {
    isFetchingGroup.value = true
    try {
      const { data: group } = await supabase
        .from('groups')
        .select('name')
        .eq('id', targetGroupId)
        .single()
      if (group) {
        pendingGroupName.value = group.name
        if (!pendingJoinGroupId.value) {
          pendingJoinGroupId.value = targetGroupId
        }
      }
    } catch (err) {
      console.error('Error fetching pending group name:', err)
    } finally {
      isFetchingGroup.value = false
    }
  }
}

const syncFields = () => {
  if (state.profile) {
    username.value = state.profile.username || ''
    paymentLink.value = state.profile.payment_link || ''
    phoneNumber.value = state.profile.phone_number || ''
    iban.value = state.profile.iban || ''
  }
}

const isIOSDevice = ref(false)
const isStandalone = ref(false)
const isPushSupported = ref(false)
const isSubscribed = ref(false)
const isSubscribing = ref(false)
const notificationPermission = ref('default')
const isInsecureOrigin = ref(false)
const isHttps = ref(false)

const urlBase64ToUint8Array = (base64String) => {
  // Supprimer les espaces éventuels
  const str = base64String.trim();
  const padding = '='.repeat((4 - (str.length % 4)) % 4);
  const base64 = (str + padding).replace(/-/g, '+').replace(/_/g, '/');
  
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
};

const getServiceWorkerReady = () => {
  return Promise.race([
    navigator.serviceWorker.ready,
    new Promise((_, reject) => setTimeout(() => reject(new Error('Service Worker ready timeout')), 5000))
  ])
}

const activeRegistration = ref(null)

const initNotifications = async () => {
  isIOSDevice.value = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  isStandalone.value = isRunningAsPWA()
  isPushSupported.value = 'Notification' in window && 'serviceWorker' in navigator && 'PushManager' in window
  
  notificationPermission.value = 'Notification' in window ? Notification.permission : 'default'
  
  const protocol = window.location.protocol
  const hostname = window.location.hostname
  isInsecureOrigin.value = protocol !== 'https:' && hostname !== 'localhost' && hostname !== '127.0.0.1'
  isHttps.value = protocol === 'https:'

  // Listen for service worker controller change to automatically refresh
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      setTimeout(() => {
        window.location.reload()
      }, 500)
    })
  }

  if (isPushSupported.value) {
    try {
      const registration = await getServiceWorkerReady()
      activeRegistration.value = registration
      
      const subscription = await registration.pushManager.getSubscription()
      isSubscribed.value = !!subscription
    } catch (err) {
      console.error('Error checking push subscription:', err)
    }
  }
}

const requestNotificationPermission = () => {
  try {
    const r = Notification.requestPermission()
    if (r && typeof r.then === 'function') {
      return r
    }
  } catch (e) {
    // Fallback for callback-only Safari implementations
  }
  return new Promise((resolve) => {
    Notification.requestPermission(resolve)
  })
}

const handleSubscribe = () => {
  if (!isPushSupported.value) return
  
  isSubscribing.value = true
  errorMsg.value = ''
  
  const initialPermission = 'Notification' in window ? Notification.permission : 'default'
  notificationPermission.value = initialPermission

  const registration = activeRegistration.value
  if (!registration) {
    errorMsg.value = 'Le Service Worker n\'est pas encore prêt. Veuillez rééssayer.'
    isSubscribing.value = false
    return
  }

  const vapidPublicKey = import.meta.env.VITE_VAPID_PUBLIC_KEY
  if (!vapidPublicKey) {
    errorMsg.value = 'La clé publique VAPID n\'est pas configurée.'
    isSubscribing.value = false
    return
  }

  let convertedKey
  try {
    convertedKey = urlBase64ToUint8Array(vapidPublicKey)
  } catch (err) {
    console.error('Décodage VAPID failed:', err)
    errorMsg.value = `Erreur configuration clé VAPID: ${err.message}`
    isSubscribing.value = false
    return
  }

  const doSubscribe = () => {
    return registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: convertedKey
    })
    .then(async (subscription) => {
      if (state.profile?.id) {
        // Fetch current subscriptions to avoid overwriting other devices
        const { data: profileData, error: fetchError } = await supabase
          .from('profiles')
          .select('push_subscription')
          .eq('id', state.profile.id)
          .single()

        if (fetchError) throw fetchError

        let currentSubs = []
        if (profileData && profileData.push_subscription) {
          if (Array.isArray(profileData.push_subscription)) {
            currentSubs = profileData.push_subscription
          } else {
            currentSubs = [profileData.push_subscription]
          }
        }

        const newSubJson = subscription.toJSON()
        
        // Remove existing duplicate endpoint if any
        currentSubs = currentSubs.filter(sub => sub && sub.endpoint !== newSubJson.endpoint)
        currentSubs.push(newSubJson)

        const { error: updateError } = await supabase
          .from('profiles')
          .update({ push_subscription: currentSubs })
          .eq('id', state.profile.id)

        if (updateError) throw updateError
        
        // Sync local state
        state.profile.push_subscription = currentSubs
        isSubscribed.value = true
      } else {
        isSubscribed.value = true
      }
    })
  }

  if (initialPermission === 'granted') {
    doSubscribe()
      .catch((err) => {
        console.error('Direct Subscribe failed:', err)
        errorMsg.value = `Échec de l'abonnement direct : ${err.message} (${err.name})`
      })
      .finally(() => {
        isSubscribing.value = false
      })
  } else if (initialPermission === 'denied') {
    errorMsg.value = 'Les notifications sont bloquées dans les paramètres de votre appareil. Veuillez les activer manuellement.'
    isSubscribing.value = false
  } else {
    requestNotificationPermission()
      .then((permission) => {
        notificationPermission.value = permission
        if (permission !== 'granted') {
          throw new Error(`L'utilisateur a décliné la permission de notification (${permission}).`)
        }
        return doSubscribe()
      })
      .catch((err) => {
        console.error('Chained Subscribe failed:', err)
        errorMsg.value = `Échec de l'activation : ${err.message} (${err.name})`
      })
      .finally(() => {
        isSubscribing.value = false
      })
  }
}

const isUnsubscribing = ref(false)

const handleUnsubscribe = async () => {
  if (!isPushSupported.value) return
  
  isUnsubscribing.value = true
  errorMsg.value = ''
  
  try {
    const registration = activeRegistration.value
    if (!registration) {
      throw new Error('Le Service Worker n\'est pas encore prêt.')
    }

    const subscription = await registration.pushManager.getSubscription()
    if (subscription) {
      // Unsubscribe locally in the browser
      const success = await subscription.unsubscribe()
      if (!success) {
        throw new Error('Échec de la désinscription locale.')
      }

      // Remove from Database
      if (state.profile?.id) {
        const { data: profileData, error: fetchError } = await supabase
          .from('profiles')
          .select('push_subscription')
          .eq('id', state.profile.id)
          .single()

        if (fetchError) throw fetchError

        let currentSubs = []
        if (profileData && profileData.push_subscription) {
          if (Array.isArray(profileData.push_subscription)) {
            currentSubs = profileData.push_subscription
          } else {
            currentSubs = [profileData.push_subscription]
          }
        }

        const subJson = subscription.toJSON()
        // Filter out this endpoint
        const updatedSubs = currentSubs.filter(sub => sub && sub.endpoint !== subJson.endpoint)

        const { error: updateError } = await supabase
          .from('profiles')
          .update({ push_subscription: updatedSubs })
          .eq('id', state.profile.id)

        if (updateError) throw updateError
        
        state.profile.push_subscription = updatedSubs
      }
    }
    
    isSubscribed.value = false
  } catch (err) {
    console.error('Failed to unsubscribe:', err)
    errorMsg.value = `Échec de la désactivation : ${err.message}`
  } finally {
    isUnsubscribing.value = false
  }
}

onMounted(() => {
  syncFields()
  fetchPendingGroupName()
  initNotifications()
})

watch(() => state.profile, () => {
  syncFields()
}, { deep: true })

const handleUpdate = async () => {
  if (!username.value.trim()) return

  const pLink = paymentLink.value.trim()
  if (pLink && !pLink.includes('paypal.me') && !pLink.includes('paypal.com')) {
    errorMsg.value = t('settings.paymentLinkInvalid')
    return
  }

  isSaving.value = true
  errorMsg.value = ''
  successMsg.value = ''

  try {
    await actions.updateProfile({
      username: username.value.trim(),
      paymentLink: paymentLink.value.trim(),
      phoneNumber: phoneNumber.value.trim(),
      iban: iban.value.trim()
    })
    successMsg.value = t('settings.profileUpdateSuccess')
  } catch (err) {
    errorMsg.value = err.message || t('settings.profileUpdateError')
  } finally {
    isSaving.value = false
  }
}

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
</script>

<template>
  <PullToRefresh :loading="false" :on-refresh="handleRefresh">
  <div class="flex flex-col items-center py-6 sm:py-8 gap-6 w-full px-4">
    <BaseCard class="w-full max-w-2xl p-6">
      <!-- Header -->
      <div class="mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 class="text-2xl font-semibold">{{ $t('settings.profileSettings') }}</h2>
          <p class="text-sm text-base-content/70">{{ $t('settings.profileSettingsSubtitle') }}</p>
        </div>
      </div>

      <!-- Account Approval Status -->
      <div class="p-4 border rounded-lg mb-6">
        <label class="block text-sm font-semibold">{{ $t('settings.accountStatus') }}</label>
        <div class="mt-3 flex flex-col gap-2">
          <div>
            <span v-if="state.profile?.status === 'approved'" class="badge badge-success">{{ $t('settings.approved') }}</span>
            <span v-else-if="state.profile?.status === 'pending'" class="badge badge-warning">{{ $t('settings.pending') }}</span>
            <span v-else-if="state.profile?.status === 'rejected'" class="badge badge-error">{{ $t('settings.rejected') }}</span>
            <span v-else class="badge badge-secondary">{{ $t('common.loading') }}</span>
          </div>
          <div class="text-sm mt-2 text-base-content/70">
            <p v-if="state.profile?.status === 'approved'">{{ $t('settings.approvedMsg') }}</p>
            <template v-else-if="state.profile?.status === 'pending'">
              <p>{{ $t('settings.pendingMsg') }}</p>
              
              <!-- Case 1: Accepted invite pending approval -->
              <div v-if="pendingJoinStatus === 'accepted'" class="mt-3 p-4 bg-success/10 border border-success/20 rounded-xl text-sm flex items-start gap-3">
                <span class="text-lg">✅</span>
                <div class="leading-relaxed text-base-content/85 flex-1">
                  <p v-if="pendingGroupName">
                    {{ $t('settings.acceptedInvitePendingGroupMsg', { name: pendingGroupName }) || `Vous rejoindrez le groupe "${pendingGroupName}" automatiquement dès que votre compte sera approuvé.` }}
                  </p>
                  <p v-else>
                    {{ $t('settings.acceptedInvitePendingMsg') || 'Vous rejoindrez le groupe automatiquement dès que votre compte sera approuvé.' }}
                  </p>
                </div>
              </div>
              
              <!-- Case 2: Has invite but hasn't made a choice yet -->
              <div v-else-if="hasPendingRedirect" class="mt-3 p-4 bg-cyan/10 border border-cyan/20 rounded-xl text-sm flex flex-col gap-3">
                <div class="flex items-start gap-3">
                  <span class="text-lg">👉</span>
                  <div class="leading-relaxed text-base-content/85 flex-1">
                    <p v-if="pendingGroupName">
                      {{ $t('settings.undecidedInviteGroupMsg', { name: pendingGroupName }) || `Vous avez été invité à rejoindre le groupe "${pendingGroupName}".` }}
                    </p>
                    <p v-else>
                      {{ $t('settings.undecidedInviteMsg') || 'Vous avez reçu un lien d\'invitation pour rejoindre un groupe.' }}
                    </p>
                  </div>
                </div>
                <div class="flex justify-end">
                  <BaseButton :to="pendingRedirectUrl || `/group/${pendingJoinGroupId}/join`" variant="primary" size="sm">
                    {{ $t('settings.viewInviteBtn') || 'Voir l\'invitation' }}
                  </BaseButton>
                </div>
              </div>
            </template>
            <p v-else-if="state.profile?.status === 'rejected'">{{ $t('settings.rejectedMsg') }}</p>
            <p v-else>{{ $t('settings.loadingStatus') }}</p>
          </div>
        </div>
      </div>

      <!-- Profile Edit Form -->
      <form @submit.prevent="handleUpdate" class="space-y-4">
        <ErrorBanner v-if="errorMsg" :error="errorMsg" />
        <div v-if="successMsg" class="p-3 rounded bg-success/10 text-success">{{ successMsg }}</div>

        <BaseInput type="email" id="email" :modelValue="state.session?.user?.email" disabled class="disabled-input" :label="$t('settings.emailLabel')" />
        <div class="text-xs text-base-content/60">{{ $t('settings.emailHint') }}</div>

        <BaseInput type="text" id="username" v-model="username" required :label="$t('settings.displayNameLabel')" :placeholder="t('settings.displayNamePlaceholder')" />

        <BaseInput type="url" id="payment-link" v-model="paymentLink" :label="$t('settings.paymentLinkLabel')" :placeholder="t('settings.paymentLinkPlaceholder')" />
        <div class="text-xs text-base-content/60">{{ $t('settings.paymentLinkHintSettings') }}</div>

        <BaseInput type="text" id="phone-number" v-model="phoneNumber" :label="$t('settings.phoneNumberLabel')" :placeholder="t('settings.phoneNumberPlaceholder')" />
        <div class="text-xs text-base-content/60">{{ $t('settings.phoneNumberHint') }}</div>

        <BaseInput type="text" id="iban" v-model="iban" :label="$t('settings.ibanLabel')" :placeholder="t('settings.ibanPlaceholder')" />
        <div class="text-xs text-base-content/60">{{ $t('settings.ibanHint') }}</div>

        <div class="flex flex-wrap gap-3 mt-4">
          <BaseButton type="submit" variant="primary" :loading="isSaving">{{ $t('settings.saveChanges') }}</BaseButton>
          <BaseButton type="button" @click="handleLogout" variant="secondary" class="text-error">{{ $t('settings.signOut') }}</BaseButton>
        </div>
      </form>
    </BaseCard>

    <!-- Push Notifications Section -->
    <BaseCard class="w-full max-w-2xl p-6">
      <div class="mb-4">
        <h3 class="text-xl font-semibold">{{ $t('settings.pushNotifications') }}</h3>
        <p class="text-sm text-base-content/70">{{ $t('settings.pushNotificationsSubtitle') }}</p>
      </div>

      <!-- iOS non-PWA fallback warning -->
      <div v-if="isIOSDevice && !isStandalone" class="p-4 bg-warning/10 border border-warning/20 rounded-xl text-sm flex items-start gap-3 w-full">
        <span class="text-lg">⚠️</span>
        <div class="leading-relaxed text-base-content/85 flex-1">
          <p class="font-semibold text-warning">{{ $t('settings.iosPwaRequired') }}</p>
          <p class="mt-1 text-xs text-base-content/70">{{ $t('settings.iosPwaInstruction') }}</p>
        </div>
      </div>

      <!-- Browser not supported fallback warning -->
      <div v-else-if="!isPushSupported" class="p-4 bg-error/10 border border-error/20 rounded-xl text-sm flex items-start gap-3 w-full animate-fade-in">
        <span class="text-lg">❌</span>
        <div class="leading-relaxed text-base-content/85 flex-1">
          <p class="font-semibold text-error">Notifications non supportées</p>
          <p class="mt-1 text-xs text-base-content/70">
            Votre navigateur ou votre mode de navigation actuel ne supporte pas les notifications push natives.
          </p>
        </div>
      </div>

      <!-- Standalone/Standard Notifications Config -->
      <div v-else class="w-full flex flex-col gap-4 py-2">
        <!-- Insecure Origin Warning -->
        <div v-if="isInsecureOrigin" class="p-4 bg-warning/10 border border-warning/20 rounded-xl text-sm flex items-start gap-3 w-full">
          <span class="text-lg">⚠️</span>
          <div class="leading-relaxed text-base-content/85 flex-1">
            <p class="font-semibold text-warning">Connexion non sécurisée (HTTP)</p>
            <p class="mt-1 text-xs text-base-content/70">
              Le Web Push requiert obligatoirement une connexion HTTPS sécurisée avec un certificat SSL valide. Les adresses IP locales en HTTP (comme 192.168.x.x) ne supportent pas les notifications push sur iOS.
            </p>
            <p class="mt-2 text-xs text-base-content/70">
              <strong>Solution :</strong> Utilisez un tunnel de développement sécurisé comme <strong>ngrok</strong> ou <strong>Cloudflare Tunnel</strong> pour exposer votre projet en HTTPS.
            </p>
          </div>
        </div>

        <!-- Permission denied instructions -->
        <div v-if="notificationPermission === 'denied'" class="p-4 bg-error/10 border border-error/20 rounded-xl text-sm flex items-start gap-3 w-full">
          <span class="text-lg">🚫</span>
          <div class="leading-relaxed text-base-content/85 flex-1">
            <p class="font-semibold text-error">Notifications bloquées par le système</p>
            <p class="mt-1 text-xs text-base-content/70">
              Pour réactiver les notifications sur votre iPhone :
            </p>
            <ol class="list-decimal list-inside text-xs mt-1 text-base-content/70 space-y-1">
              <li>Allez dans l'application <strong>Réglages</strong> de votre iOS.</li>
              <li>Sélectionnez <strong>Notifications</strong> puis cherchez <strong>SplitPay</strong> dans la liste.</li>
              <li>Activez l'option <strong>Autoriser les notifications</strong>.</li>
            </ol>
            <p class="mt-2 text-[10px] text-base-content/50 leading-snug">
              Si SplitPay ne figure pas dans la liste des Réglages, supprimez l'application de votre écran d'accueil, effacez l'historique et les données de site du domaine dans les paramètres de Safari, puis rajoutez à nouveau l'application sur l'écran d'accueil.
            </p>
          </div>
        </div>



        <!-- Subscription Panel (Controls) -->
        <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 w-full">
          <div class="flex items-center gap-3">
            <div :class="[isSubscribed ? 'bg-success/20 text-success' : 'bg-base-300 text-base-content/50']" class="w-10 h-10 rounded-full flex items-center justify-center text-lg flex-shrink-0">
              {{ isSubscribed ? '🔔' : '🔕' }}
            </div>
            <div>
              <p class="font-medium">
                {{ isSubscribed ? $t('settings.notificationsEnabled') : $t('settings.notificationsDisabled') }}
              </p>
              <p class="text-xs text-base-content/60">
                {{ isSubscribed ? $t('settings.notificationsEnabledSubtitle') : $t('settings.notificationsDisabledSubtitle') }}
              </p>
            </div>
          </div>

          <div class="flex justify-end flex-shrink-0">
            <button 
              v-if="!isSubscribed" 
              @click="handleSubscribe" 
              :disabled="isSubscribing"
              class="btn btn-primary btn-sm flex items-center gap-2"
            >
              <span v-if="isSubscribing" class="loading loading-spinner loading-xs"></span>
              {{ $t('settings.enableNotificationsBtn') }}
            </button>
            <button 
              v-else 
              @click="handleUnsubscribe" 
              :disabled="isUnsubscribing"
              class="btn btn-error btn-outline btn-sm flex items-center gap-2"
            >
              <span v-if="isUnsubscribing" class="loading loading-spinner loading-xs"></span>
              {{ $t('settings.disableNotificationsBtn') }}
            </button>
          </div>
        </div>
      </div>
    </BaseCard>
  </div>
  </PullToRefresh>
</template>

<style scoped>
/* minimal or no scoped CSS - relying on Tailwind and component styles */
</style>
