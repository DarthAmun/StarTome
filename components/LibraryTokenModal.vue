<template>
  <Teleport to="body">
    <div v-if="open" class="modal-overlay" @click.self="emit('close')">
      <div class="modal-box">
        <div class="modal-title">{{ title }}</div>
        <div class="space-y-3">
          <div>
            <label class="f-label">Name</label>
            <InputText v-model="form.name" placeholder="Goblin, Wizard, etc." autofocus />
          </div>
          <div>
            <label class="f-label">Image</label>
            <div class="enc-add-condition">
              <InputText v-model="form.imageSource" placeholder="URL or file path" class="flex-1" />
              <Button class="icon-btn-sq" @click="emit('browse')">
                <OhVueIcon name="fa-folder-open" scale="0.9" />
              </Button>
            </div>
            <div v-if="form.imageSource" class="mt-2" style="text-align:center">
              <img :src="form.imageSource" style="max-height:80px;border-radius:6px;object-fit:contain" />
            </div>
          </div>
          <TokenLinkPicker
            label="Linked Creature" hint="auto-fills HP & AC on placement" placeholder="Search creatures and hazards…"
            :selected="form.linkedRulesName" :results="rulesResults"
            :search="rulesSearch" @update:search="emit('update:rulesSearch', $event)"
            @select="emit('select-rules', $event)" @clear="emit('clear-rules')"
          />
          <div v-if="form.linkedRulesId" class="tok-adjust-row">
            <label class="f-label">Adjustment</label>
            <select v-model="form.adjustment" class="link-adjust">
              <option v-for="opt in ADJUSTMENT_OPTIONS" :key="opt.label" :value="opt.value">{{ opt.label }}</option>
            </select>
          </div>
          <TokenLinkPicker
            label="Linked NPC" hint="campaign character this token represents" placeholder="Search NPCs…"
            :selected="form.linkedEntityName" :results="npcResults" accent="#7cc44e"
            :search="npcSearch" @update:search="emit('update:npcSearch', $event)"
            @select="emit('select-npc', $event)" @clear="emit('clear-npc')"
          />
          <label v-if="form.linkedEntityId || form.linkedRulesId" class="tok-pc-row">
            <input v-model="form.syncImage" type="checkbox" class="tem-checkbox" @change="emit('pull-image')" />
            <span>Sync image with linked entry <span class="f-hint">{{ form.linkedEntityId ? 'NPC portrait' : 'creature token art' }} ↔ token — uncheck for a separate token image</span></span>
          </label>
          <label class="tok-pc-row">
            <input v-model="form.isPlayerCharacter" type="checkbox" class="tem-checkbox" />
            <span>Player Character <span class="f-hint">pinned at top of token list; for an NPC in the party, the party decides</span></span>
          </label>
        </div>
        <div class="flex justify-end gap-2 mt-4">
          <Button severity="secondary" @click="emit('close')">Cancel</Button>
          <Button @click="emit('confirm')">{{ confirmLabel }}</Button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
/**
 * The library token form, for adding a token and for editing one (it was two
 * copies inside the encounter page). The parent owns the form object and the
 * pickers' searches and results; this component only lays them out.
 */
import type { Adjustment } from '~/rules/combat'

export interface LibraryTokenForm {
  name: string
  imageSource: string
  imageType: 'file' | 'url'
  linkedRulesId: string | null
  linkedRulesName: string | null
  adjustment: Adjustment | null
  linkedEntityId: number | null
  linkedEntityName: string | null
  isPlayerCharacter: boolean
  syncImage: boolean
}

type PickerResult = { id: number | string; name: string; tag: string }

defineProps<{
  open: boolean
  title: string
  confirmLabel: string
  /** Edited in place: the parent's reactive form. */
  form: LibraryTokenForm
  rulesResults: PickerResult[]
  npcResults: PickerResult[]
  rulesSearch: string
  npcSearch: string
}>()

const emit = defineEmits<{
  close: []
  confirm: []
  browse: []
  'pull-image': []
  'select-rules': [id: number | string]
  'clear-rules': []
  'select-npc': [id: number | string]
  'clear-npc': []
  'update:rulesSearch': [value: string]
  'update:npcSearch': [value: string]
}>()

const ADJUSTMENT_OPTIONS: { value: Adjustment | null; label: string }[] = [
  { value: null, label: 'Normal' },
  { value: 'weak', label: 'Weak' },
  { value: 'elite', label: 'Elite' },
]
</script>

<style scoped>
/* Copies of the encounter page's modal rules: its scoped styles don't reach child components */
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(4, 3, 8, 0.7);
  backdrop-filter: blur(8px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: var(--z-modal);
}
.modal-box {
  background-color: var(--parch);
  background-image: var(--paper);
  background-blend-mode: multiply;
  border: 1px solid var(--parch-line);
  border-radius: 2px;
  padding: 24px;
  width: 420px;
  max-width: 92vw;
  box-shadow: 0 24px 64px rgba(0, 0, 0, 0.5);
}
.modal-title {
  font-family: var(--font-head);
  font-size: 14px;
  font-weight: 600;
  letter-spacing: 0.15em;
  text-transform: uppercase;
  color: var(--ink);
  margin-bottom: 20px;
  padding-bottom: 8px;
  border-bottom: 1px solid var(--parch-line);
}
.enc-add-condition { display: flex; gap: 6px; align-items: center; }
.tok-pc-row {
  display: flex;
  align-items: center;
  gap: 8px;
  font-family: var(--font-body);
  font-size: 13px;
  color: var(--ink);
  cursor: pointer;
}
.tok-adjust-row { display: flex; align-items: center; gap: 8px; margin-top: 6px; }
.tok-adjust-row .f-label { margin: 0; }
.link-adjust {
  font-size: 12px;
  padding: 2px 4px;
  border: 1px solid var(--parch-line);
  border-radius: 2px;
  background: transparent;
  color: var(--ink);
}
.f-hint {
  font-family: var(--font-body);
  font-size: 10px;
  font-weight: 400;
  text-transform: none;
  letter-spacing: 0;
  color: var(--ink-ghost);
  font-style: italic;
}
</style>
