<template>
  <component
    :is="to ? 'router-link' : 'div'"
    :to="to"
    class="rounded-2xl border border-base-300/40 bg-base-200/20 p-6"
    :class="interactive ? 'hover:border-primary shadow-lg' : ''"
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
