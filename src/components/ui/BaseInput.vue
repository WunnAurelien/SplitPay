<template>
  <div class="mb-4 w-full">
    <label v-if="label" :for="id" class="block text-sm font-semibold mb-2 text-base-content/70">{{ label }}</label>
    <input
      v-if="type !== 'select' && type !== 'textarea'"
      :type="type"
      :id="id"
      :value="modelValue"
      @input="$emit('update:modelValue', $event.target.value)"
      class="input input-bordered w-full"
      v-bind="$attrs"
    />
    <textarea
      v-else-if="type === 'textarea'"
      :id="id"
      :value="modelValue"
      @input="$emit('update:modelValue', $event.target.value)"
      class="textarea textarea-bordered w-full"
      v-bind="$attrs"
    ></textarea>
    <select
      v-else
      :id="id"
      :value="modelValue"
      @change="$emit('update:modelValue', $event.target.value)"
      class="select select-bordered w-full"
      v-bind="$attrs"
    >
      <slot></slot>
    </select>
  </div>
</template>

<script setup>
defineProps({
  modelValue: {
    type: [String, Number],
    default: ''
  },
  label: {
    type: String,
    default: ''
  },
  id: {
    type: String,
    required: true
  },
  type: {
    type: String,
    default: 'text' // text, number, password, email, select, textarea
  }
})

defineEmits(['update:modelValue'])
</script>
