<template>
  <dialog 
    ref="dialogRef" 
    closedby="any" 
    @click="handleBackdropClick"
    :aria-labelledby="titleId"
  >
    <div class="dialog-content">
      <div class="dialog-header">
        <h2 :id="titleId">
          <slot name="title">{{ title }}</slot>
        </h2>
        <button v-if="showClose" @click="close" class="dialog-close" type="button">&times;</button>
      </div>
      <slot></slot>
      <div v-if="$slots.actions" class="dialog-actions" style="display: flex; gap: 12px; justify-content: flex-end; margin-top: 24px;">
        <slot name="actions"></slot>
      </div>
    </div>
  </dialog>
</template>

<script setup>
import { ref } from 'vue'

const props = defineProps({
  title: {
    type: String,
    default: ''
  },
  titleId: {
    type: String,
    default: 'dialog-title'
  },
  showClose: {
    type: Boolean,
    default: true
  }
})

const emit = defineEmits(['close'])

const dialogRef = ref(null)

const showModal = () => {
  dialogRef.value?.showModal()
}

const close = () => {
  dialogRef.value?.close()
  emit('close')
}

// Dialog backdrop click close
const handleBackdropClick = (event) => {
  if (!dialogRef.value || 'closedBy' in HTMLDialogElement.prototype) return
  if (event.target !== dialogRef.value) return
  
  const rect = dialogRef.value.getBoundingClientRect()
  const isInDialog = (
    rect.top <= event.clientY &&
    event.clientY <= rect.top + rect.height &&
    rect.left <= event.clientX &&
    event.clientX <= rect.left + rect.width
  )
  if (!isInDialog) {
    close()
  }
}

defineExpose({
  showModal,
  close
})
</script>
