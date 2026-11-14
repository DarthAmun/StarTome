<script setup lang="ts">
/** One ability of a stat block: name, action cost, traits, frequency and its text. */
import { computed } from 'vue'
import { parseAreaEffect } from '@/domain/rules/areas'
import { parseZoneAreaEffect, type ZoneAreaSpec } from '@/domain/rules/sensorMap'
import { formatActionCost, formatTrait } from '@/domain/rules/format'
import type { StatAction } from '@/domain/rules/types'
import { md } from './statText'

const props = defineProps<{ action: StatAction; owner: string; canPlaceArea?: boolean; /** A starship's ability while a sensor map is open. */ canZoneArea?: boolean }>()
const emit = defineEmits<{ area: [spec: NonNullable<ReturnType<typeof parseAreaEffect>> & { label: string }]; zone: [spec: ZoneAreaSpec] }>()

const area = computed(() => (props.canPlaceArea ? parseAreaEffect(props.action.text) : null))
const zone = computed(() => (props.canZoneArea ? parseZoneAreaEffect(props.action.text) : null))
const glyph = computed(() => formatActionCost(props.action.cost))
</script>

<template>
  <p class="line action">
    <b>{{ action.name }}</b> <span v-if="glyph" class="glyph">{{ glyph }}</span>
    <button v-if="area" class="place" :title="`Place the ${area.sizeFt}-foot ${area.kind} on the map and roll saves`" @click.stop="emit('area', { ...area, label: `${action.name} (${owner})` })">Place area</button>
    <button v-if="zone" class="place" :title="`Aim the ${zone.size}-zone ${zone.kind} on the sensor map, from the selected ship`" data-test="stat-zone-area" @click.stop="emit('zone', zone)">Zone area</button>
    <template v-if="action.traits.length"> ({{ action.traits.map(formatTrait).join(', ') }})</template>
    <template v-if="action.frequency"> <b>Frequency</b> {{ action.frequency }};</template>
    <!-- eslint-disable-next-line vue/no-v-html -- sanitised by renderMarkdown -->
    {{ ' ' }}<span class="prose inline" v-html="md(action.text)" />
  </p>
</template>
