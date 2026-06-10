<template>
  <div v-if="error" class="error-banner" :class="{ 'error-banner-global glass-panel': global }">
    <span v-if="global" class="warning-icon">⚠️</span>
    <div class="error-details">
      <h3 v-if="title">{{ title }}</h3>
      <p>{{ error }}</p>
      <slot></slot>
    </div>
  </div>
</template>

<script setup>
defineProps({
  error: {
    type: String,
    default: ''
  },
  title: {
    type: String,
    default: ''
  },
  global: {
    type: Boolean,
    default: false
  }
})
</script>
