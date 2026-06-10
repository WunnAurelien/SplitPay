<template>
  <button 
    class="btn" 
    :class="[
      `btn-${variant}`,
      size ? `btn-${size}` : ''
    ]"
    :disabled="disabled || loading"
    v-bind="$attrs"
  >
    <span v-if="loading" class="spinner" style="width: 16px; height: 16px; border-width: 2px;"></span>
    <slot></slot>
  </button>
</template>

<script setup>
defineProps({
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
  }
})
</script>

<style scoped>
.spinner {
  margin-right: 4px;
}
</style>
