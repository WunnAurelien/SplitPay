<template>
  <Dialog :open="isOpen" @close="isOpen = false" class="relative z-50">
    <div class="fixed inset-0 bg-black/50" aria-hidden="true" />

    <div class="fixed inset-0 flex items-center justify-center p-4">
      <DialogPanel class="w-full max-w-lg rounded-2xl bg-base-200 p-6 max-h-[90dvh] flex flex-col">
        <div class="flex items-start justify-between flex-shrink-0">
          <DialogTitle as="h2" class="text-lg font-semibold"> <slot name="title">{{ title }}</slot> </DialogTitle>
          <button v-if="showClose" @click="isOpen = false" class="btn btn-ghost btn-sm">✕</button>
        </div>

        <div class="mt-4 overflow-y-auto flex-grow pr-1">
          <slot></slot>
        </div>

        <div v-if="$slots.actions" class="mt-6 flex justify-end items-center gap-3 flex-shrink-0">
          <slot name="actions"></slot>
        </div>
      </DialogPanel>
    </div>
  </Dialog>
</template>

<script setup lang="ts">
import { Dialog, DialogPanel, DialogTitle } from '@headlessui/vue'

defineProps({
  title: {
    type: String,
    default: ''
  },
  showClose: {
    type: Boolean,
    default: true
  }
})

const isOpen = defineModel<boolean>({ default: false })
</script>
