<script setup lang="ts">
/** A token that ended its move on stairs: take them to the other floor, or stay. */
import { computed } from 'vue'
import { stairsOn } from '@/domain/rules/floors'
import { floorOf, getToken, live, takeStair, tokenFloor } from './live'

const token = computed(() => getToken(live.stairPrompt?.tokenId))
const end = computed(() => {
  const t = token.value, p = live.stairPrompt
  return t && p && live.encounter && live.map ? stairsOn(live.encounter, live.map, tokenFloor(t)).find(e => e.stairId === p.stairId) : undefined
})
const to = computed(() => floorOf(end.value?.to.floorId))
</script>

<template>
  <div v-if="token && end && to" class="stair panel" data-test="stair-prompt">
    <span><b>{{ token.name }}</b> is on the stairs {{ end.dir }} to {{ to.name }}.</span>
    <button class="btn btn-primary" data-test="stair-go" @click="takeStair(token.id, end.stairId)">Go {{ end.dir }}</button>
    <button class="btn" @click="live.stairPrompt = null">Stay</button>
  </div>
</template>

<style scoped>
.stair { position: absolute; left: 50%; top: .6rem; transform: translateX(-50%); z-index: 5; display: flex; gap: .5rem; align-items: center; padding: .4rem .7rem; border: 1px solid var(--accent); box-shadow: var(--shadow); }
</style>
