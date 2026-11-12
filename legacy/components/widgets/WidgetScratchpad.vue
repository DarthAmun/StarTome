<template>
  <div class="wsp-body">
    <textarea
      class="wsp-textarea"
      placeholder="Notes for tonight… initiative tweaks, reminders, ad-hoc details."
      :value="modelValue"
      @input="$emit('update:modelValue', ($event.target as HTMLTextAreaElement).value)"
    />
  </div>
</template>

<script setup lang="ts">
defineProps<{ modelValue: string }>()
defineEmits<{ 'update:modelValue': [v: string] }>()
</script>

<style scoped>
.wsp-body { display: flex; flex-direction: column; flex: 1; min-height: 0; padding: 10px 12px; }
.wsp-textarea {
  flex: 1; width: 100%; background: transparent; border: none; outline: none; resize: none;
  font-family: var(--fu); font-size: 13px; line-height: 1.65;
  color: var(--text); caret-color: var(--accent);
}
.wsp-textarea::placeholder { color: var(--text3); font-style: italic; }
</style>
