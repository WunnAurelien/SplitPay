<template>
  <component
    :is="to ? 'router-link' : 'div'"
    :to="to"
    class="glass-panel"
    :class="{ 'interactive': interactive }"
  >
    <slot></slot>
  </component>
</template>

<script setup>
defineProps({
  interactive: {
    type: Boolean,
    default: false
  },
  to: {
    type: [String, Object],
    default: null
  }
})
</script>
