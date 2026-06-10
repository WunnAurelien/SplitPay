<template>
  <component
    :is="to ? 'router-link' : 'button'"
    :to="to"
    class="btn"
    :class="buttonClasses"
    :disabled="disabled || loading"
    v-bind="$attrs"
  >
    <svg v-if="loading" class="animate-spin -ml-1 mr-2 h-4 w-4 text-current" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
      <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
      <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"></path>
    </svg>
    <slot></slot>
  </component>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  variant: {
    type: String,
    default: 'primary' // 'primary', 'secondary', 'danger'
  },
  size: {
    type: String,
    default: '' // 'sm'
  },
  loading: {
    type: Boolean,
    default: false
  },
  disabled: {
    type: Boolean,
    default: false
  },
  to: {
    type: [String, Object],
    required: false
  }
})

const buttonClasses = computed(() => {
  const classes = []
  // map variants to daisyUI classes
  if (props.variant === 'primary') classes.push('btn-primary')
  else if (props.variant === 'secondary') classes.push('btn-outline')
  else if (props.variant === 'danger') classes.push('btn-error')

  if (props.size === 'sm') classes.push('btn-sm')

  if (props.disabled || props.loading) classes.push('opacity-60', 'cursor-not-allowed')

  return classes.join(' ')
})
</script>
