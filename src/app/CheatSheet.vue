<script setup lang="ts">
/** The shortcut cheat sheet: `?` anywhere outside a text field. */
import AppDialog from '@/ui/components/AppDialog.vue'
import ShortcutList from '@/ui/components/ShortcutList.vue'

defineEmits<{ close: [] }>()
</script>

<template>
  <AppDialog title="Keyboard shortcuts" wide data-test="cheat-sheet" @close="$emit('close')">
    <ShortcutList />
  </AppDialog>
</template>
