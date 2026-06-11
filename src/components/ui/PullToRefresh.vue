<script setup>
import { ref } from 'vue'
import { isRunningAsPWA } from '../../usePWA'

const props = defineProps({
  onRefresh: {
    type: Function,
    required: true
  },
  loading: {
    type: Boolean,
    default: false
  },
  threshold: {
    type: Number,
    default: 60
  }
})

const pullDistance = ref(0)
const pullState = ref('idle')
const containerRef = ref(null)

const maxPullDistance = 100
const resistanceFactor = 2.5

let startY = 0
let isPulling = false
let isTouchActive = false
let hasScrolledFromTop = false

const isPWA = isRunningAsPWA()

const preventBodyScroll = () => {
  document.body.style.overflow = 'hidden'
  document.body.style.position = 'relative'
}

const allowBodyScroll = () => {
  document.body.style.overflow = ''
  document.body.style.position = ''
}

const onTouchStart = (e) => {
  // Never activate while already loading
  if (pullState.value === 'loading') return

  const scrollTop = window.scrollY || document.documentElement.scrollTop

  // Only activate when at the very top of the scroll
  if (scrollTop > 0) {
    hasScrolledFromTop = true
    return
  }
  hasScrolledFromTop = false

  startY = e.touches[0].clientY
  isPulling = true
  isTouchActive = true
}

const onTouchMove = (e) => {
  if (!isPulling || pullState.value === 'loading') return

  const currentY = e.touches[0].clientY
  const diff = currentY - startY

  if (diff <= 0) {
    pullDistance.value = 0
    pullState.value = 'idle'
    return
  }

  // Apply resistance so the pull feels natural
  const resisted = Math.min(diff / resistanceFactor, maxPullDistance)
  pullDistance.value = resisted

  // Lock body scroll during pull to prevent scrollbar from appearing
  preventBodyScroll()

  if (resisted >= props.threshold) {
    pullState.value = 'threshold'
  } else {
    pullState.value = 'pulling'
  }
}

const resetPull = () => {
  pullDistance.value = 0
  pullState.value = 'idle'
  isPulling = false
  isTouchActive = false
  allowBodyScroll()
}

const onTouchEnd = async () => {
  if (!isPulling) return
  isPulling = false
  isTouchActive = false

  if (pullDistance.value >= props.threshold && pullState.value !== 'loading') {
    // Trigger refresh
    pullState.value = 'loading'
    pullDistance.value = props.threshold / 2 // Keep a small indicator visible

    try {
      await props.onRefresh()
    } catch (e) {
      console.error('[PullToRefresh] Refresh failed:', e)
    } finally {
      // Reset after a short delay for smooth transition
      setTimeout(() => {
        resetPull()
      }, 300)
    }
  } else {
    // Snap back
    resetPull()
  }
}

const onTouchCancel = () => {
  if (!isPulling) return
  resetPull()
}

// Expose a programmatic refresh trigger for parent usage
const triggerRefresh = async () => {
  if (pullState.value === 'loading') return
  pullState.value = 'loading'
  pullDistance.value = props.threshold / 2
  try {
    await props.onRefresh()
  } catch (e) {
    console.error('[PullToRefresh] Programmatic refresh failed:', e)
  } finally {
    setTimeout(() => {
      resetPull()
    }, 300)
  }
}

defineExpose({ triggerRefresh })
</script>

<template>
  <div
    ref="containerRef"
    class="pull-to-refresh-container"
    :class="{ 'is-pwa': isPWA }"
    @touchstart="onTouchStart"
    @touchmove="onTouchMove"
    @touchend="onTouchEnd"
    @touchcancel="onTouchCancel"
  >
    <!-- Pull indicator -->
    <div
      v-if="pullState !== 'idle' || pullDistance > 0"
      class="pull-indicator"
      :style="{
        height: pullDistance + 'px',
        opacity: Math.min(pullDistance / threshold, 1)
      }"
    >
      <div class="pull-indicator-content">
        <!-- Spinner when loading -->
        <svg v-if="pullState === 'loading'" class="pull-spinner" viewBox="0 0 24 24" fill="none">
          <circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-dasharray="31.416" stroke-dashoffset="8" />
        </svg>
        <!-- Arrow icon when pulling -->
        <svg
          v-else
          class="pull-arrow"
          :class="{ 'pull-arrow-flip': pullState === 'threshold' }"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2.5"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <polyline points="17 9 12 4 7 9" />
          <line x1="12" y1="4" x2="12" y2="20" />
        </svg>
        <span class="pull-text">
          <template v-if="pullState === 'loading'">{{ $t('common.refreshing') || 'Chargement...' }}</template>
          <template v-else-if="pullState === 'threshold'">{{ $t('common.releaseToRefresh') || 'Relâchez pour rafraîchir' }}</template>
          <template v-else>{{ $t('common.pullToRefresh') || 'Tirez pour rafraîchir' }}</template>
        </span>
      </div>
    </div>

    <!-- Slot for the actual page content -->
    <div
      class="pull-content"
      :style="{
        transform: `translateY(${pullDistance}px)`,
        transition: isTouchActive ? 'none' : 'transform 0.3s cubic-bezier(0.4, 0, 0.2, 1)'
      }"
    >
      <slot />
    </div>
  </div>
</template>

<style scoped>
.pull-to-refresh-container {
  position: relative;
  /* Clip overflow during pull to prevent scrollbar when content is translated */
  overflow: clip;
}

/*
 * In PWA mode (standalone): no native pull-to-refresh exists,
 * so we use `overscroll-behavior: auto` to let Safari scroll freely.
 * In browser mode: we block native overscroll to avoid dual pull-to-refresh.
 */
.pull-to-refresh-container:not(.is-pwa) {
  overscroll-behavior: contain;
  touch-action: pan-y;
}

.pull-to-refresh-container.is-pwa {
  overscroll-behavior: auto;
  touch-action: pan-y;
}

.pull-indicator {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  pointer-events: none;
  overflow: visible;
  z-index: 10;
  transition: opacity 0.2s ease, height 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

.pull-indicator-content {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 16px;
  background: var(--glass-bg);
  backdrop-filter: blur(var(--glass-blur));
  -webkit-backdrop-filter: blur(var(--glass-blur));
  border: 1px solid var(--glass-border);
  border-radius: 999px;
  color: var(--text-muted);
  font-size: 0.8rem;
  font-weight: 600;
  box-shadow: var(--glass-shadow);
  margin-top: 12px;
}

.pull-spinner {
  width: 20px;
  height: 20px;
  animation: spin 0.8s linear infinite;
  color: var(--accent-purple);
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.pull-arrow {
  width: 20px;
  height: 20px;
  color: var(--accent-purple);
  transition: transform 0.2s ease;
}

.pull-arrow-flip {
  transform: rotate(180deg);
}

.pull-text {
  white-space: nowrap;
}

.pull-content {
  will-change: transform;
  position: relative;
  z-index: 1;
  background: var(--bg-primary);
}
</style>