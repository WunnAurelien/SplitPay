<template>
  <div v-if="error" :class="['w-full', global ? 'fixed top-4 left-1/2 -translate-x-1/2 z-50' : '']">
    <div class="alert alert-error shadow-lg">
      <div>
        <svg xmlns="http://www.w3.org/2000/svg" class="stroke-current flex-shrink-0 h-6 w-6" fill="none" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
        <div>
          <h3 v-if="title" class="font-bold">{{ title }}</h3>
          <div class="text-sm">{{ error }}</div>
          <slot></slot>
        </div>
      </div>
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
