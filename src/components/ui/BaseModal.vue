<template>
  <Dialog :open="isOpen" @close="close" class="relative z-50">
    <div class="fixed inset-0 bg-black/50" aria-hidden="true" />

    <div class="fixed inset-0 flex items-center justify-center p-4">
      <DialogPanel class="w-full max-w-lg rounded-2xl bg-base-200 p-6">
        <div class="flex items-start justify-between">
          <DialogTitle as="h2" class="text-lg font-semibold"> <slot name="title">{{ title }}</slot> </DialogTitle>
          <button v-if="showClose" @click="close" class="btn btn-ghost btn-sm">✕</button>
        </div>

        <div class="mt-4">
          <slot></slot>
        </div>

        <div v-if="$slots.actions" class="mt-6 flex justify-end items-center gap-3">
          <slot name="actions"></slot>
        </div>
      </DialogPanel>
    </div>
  </Dialog>
</template>

<script setup>
import { ref } from 'vue'
import { Dialog, DialogPanel, DialogTitle } from '@headlessui/vue'

const props = defineProps({
  title: {
    type: String,
    default: ''
  },
  showClose: {
    type: Boolean,
    default: true
  }
})

const emit = defineEmits(['close'])

const isOpen = ref(false)

const showModal = () => { isOpen.value = true }
const close = () => { isOpen.value = false; emit('close') }

defineExpose({ showModal, close })
</script>
