<template>
  <div class="snap-timeline" :class="{ 'snap-timeline--active': viewingSnapshot }">

    <!-- History mode banner -->
    <div v-if="viewingSnapshot" class="snap-banner">
      <OhVueIcon name="gi-sands-of-time" scale="0.85" style="color:var(--gold)" />
      <span class="snap-banner-label">
        Viewing: <strong>{{ viewingSnapshot.label }}</strong>
      </span>
      <span v-if="viewingSnapshot.note" class="snap-banner-note">
        — {{ viewingSnapshot.note }}
      </span>
      <div style="flex:1" />
      <button class="snap-return-btn" @click="emit('return-to-present')">
        Return to Present ›
      </button>
    </div>

    <!-- Timeline strip -->
    <div class="snap-strip">
      <!-- Left label -->
      <span class="snap-strip-label">History</span>

      <!-- The line -->
      <div class="snap-line-wrap">
        <div class="snap-line" />

        <!-- Snapshot markers — sorted oldest to newest -->
        <div
          v-for="(snap, i) in sortedSnapshots"
          :key="snap.id"
          class="snap-marker"
          :class="{
            'snap-marker--active': viewingSnapshot?.id === snap.id,
            'snap-marker--event': !!snap.eventId,
          }"
          :style="{ left: markerPosition(i) }"
          :title="snap.label + (snap.note ? '\n' + snap.note : '') + (snap.eventId ? '\n⚡ ' + snap.eventName : '')"
          @click="emit('view-snapshot', snap)"
        >
          <span v-if="snap.eventId" class="snap-marker-event">
            <OhVueIcon name="gi-focused-lightning" scale="0.55" />
            {{ snap.eventName }}
          </span>
          <div class="snap-diamond" />
          <span class="snap-marker-label">{{ snap.label }}</span>
          <!-- Edit button — only on hover, only when not viewing a snapshot -->
          <button
            v-if="!viewingSnapshot"
            class="snap-edit-btn"
            :title="`Edit: ${snap.label}`"
            @click.stop="emit('edit-snapshot', snap)"
          >
            <OhVueIcon name="md-edit" scale="0.6" />
          </button>
        </div>

        <!-- Present marker -->
        <div
          class="snap-marker snap-marker--present"
          :class="{ 'snap-marker--active': !viewingSnapshot }"
          title="Current state"
          @click="emit('return-to-present')"
        >
          <div class="snap-diamond snap-diamond--present" />
          <span class="snap-marker-label">Present</span>
        </div>
      </div>

      <!-- Record new snapshot button -->
      <button
        v-if="!viewingSnapshot"
        class="snap-record-btn"
        title="Record a historical state"
        @click="emit('create-snapshot')"
      >
        <OhVueIcon name="md-addcircleoutline" scale="0.85" />
        Record
      </button>
    </div>

  </div>
</template>

<script setup lang="ts">
import type { EntitySnapshot } from '~/composables/useEntities'

const props = defineProps<{
  snapshots: EntitySnapshot[]
  viewingSnapshot: EntitySnapshot | null
}>()

const emit = defineEmits<{
  'view-snapshot': [snap: EntitySnapshot]
  'return-to-present': []
  'create-snapshot': []
  'edit-snapshot': [snap: EntitySnapshot]
}>()

const sortedSnapshots = computed(() =>
  [...props.snapshots].sort((a, b) => a.createdAt.localeCompare(b.createdAt))
)

// Position each marker as a percentage along the line
// First snapshot: ~5%, last snapshot: ~90%, present: always at right edge
function markerPosition(index: number): string {
  const total = sortedSnapshots.value.length
  if (total === 0) return '5%'
  // Distribute snapshots from 5% to 85%, leaving 15% for Present at the right
  const pct = 5 + (index / Math.max(total, 1)) * 80
  return `${pct}%`
}
</script>

<style scoped>
/* Timeline container */
.snap-timeline {
  flex-shrink: 0;
  background: var(--parch-dark);
  border-top: 1px solid var(--parch-line);
}

/* History mode: add a gold left border to the whole section */
.snap-timeline--active {
  border-left: 3px solid var(--gold);
}

/* Banner shown when viewing a past state */
.snap-banner {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 16px;
  background: rgba(184,134,11,0.08);
  border-bottom: 1px dashed var(--parch-line);
  flex-wrap: wrap;
}
.snap-banner-label {
  font-family: var(--font-head);
  font-size: 11px;
  letter-spacing: 0.1em;
  color: var(--ink);
}
.snap-banner-label strong {
  color: var(--gold);
}
.snap-banner-note {
  font-family: var(--font-body);
  font-size: 12px;
  color: var(--ink-ghost);
  font-style: italic;
}
.snap-return-btn {
  font-family: var(--font-head);
  font-size: 9px;
  font-weight: 600;
  letter-spacing: 0.15em;
  text-transform: uppercase;
  color: var(--gold);
  background: none;
  border: 1px solid rgba(184,134,11,0.4);
  border-radius: 2px;
  padding: 4px 10px;
  cursor: pointer;
  transition: all 0.15s;
  white-space: nowrap;
}
.snap-return-btn:hover {
  background: rgba(184,134,11,0.12);
  border-color: var(--gold);
}

/* The strip itself */
.snap-strip {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 16px;
  min-height: 66px;
}

.snap-strip-label {
  font-family: var(--font-head);
  font-size: 9px;
  font-weight: 600;
  letter-spacing: 0.2em;
  text-transform: uppercase;
  color: var(--ink-ghost);
  flex-shrink: 0;
}

/* The horizontal line */
.snap-line-wrap {
  flex: 1;
  position: relative;
  height: 46px;
  min-width: 0;
}

.snap-line {
  position: absolute;
  top: 50%;
  left: 0;
  right: 0;
  height: 1px;
  background: linear-gradient(to right, var(--parch-line), var(--ink-ghost) 20%, var(--ink-ghost) 80%, var(--parch-line));
  transform: translateY(-50%);
}

/* Snapshot marker */
.snap-marker {
  position: absolute;
  top: 50%;
  transform: translate(-50%, -50%);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  cursor: pointer;
  z-index: 1;
}

/* Present is always at the right end */
.snap-marker--present {
  left: 97% !important;
}

.snap-diamond {
  width: 10px;
  height: 10px;
  background: var(--ink-ghost);
  transform: rotate(45deg);
  transition: background 0.15s, transform 0.15s;
  flex-shrink: 0;
}
.snap-diamond--present {
  background: var(--parch);
  border: 2px solid var(--ink-ghost);
}

/* Hover and active states */
.snap-marker:hover .snap-diamond {
  background: var(--gold);
  transform: rotate(45deg) scale(1.2);
}
.snap-marker--active .snap-diamond {
  background: var(--gold);
  box-shadow: 0 0 6px rgba(184,134,11,0.5);
}
.snap-marker--present.snap-marker--active .snap-diamond {
  background: var(--parch);
  border-color: var(--gold);
}

/* Event-linked marker gets a slightly different color */
.snap-marker--event .snap-diamond {
  background: var(--arcane-l);
}
.snap-marker--event:hover .snap-diamond,
.snap-marker--event.snap-marker--active .snap-diamond {
  background: var(--arcane-l);
  box-shadow: 0 0 6px rgba(124,58,237,0.4);
}

/* Marker label */
.snap-marker-label {
  font-family: var(--font-head);
  font-size: 8px;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--ink-ghost);
  white-space: nowrap;
  max-width: 80px;
  overflow: hidden;
  text-overflow: ellipsis;
  text-align: center;
  margin-top: 14px;  /* positions label below the line */
  position: absolute;
  top: 100%;
}
.snap-marker--active .snap-marker-label,
.snap-marker:hover .snap-marker-label {
  color: var(--gold);
}

/* Event name badge — sits ABOVE the diamond */
.snap-marker-event {
  position: absolute;
  bottom: calc(100% + 3px);
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  align-items: center;
  gap: 3px;
  font-family: var(--font-head);
  font-size: 7px;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--arcane-l, #a78bfa);
  white-space: nowrap;
  background: rgba(124, 58, 237, 0.12);
  border: 1px solid rgba(124, 58, 237, 0.25);
  border-radius: 2px;
  padding: 1px 4px;
  line-height: 1.4;
}

/* Edit button — appears on hover over a marker */
.snap-edit-btn {
  position: absolute;
  bottom: calc(100% + 2px);
  left: 50%;
  transform: translateX(-50%);
  background: var(--parch);
  border: 1px solid var(--parch-line);
  border-radius: 2px;
  color: var(--ink-ghost);
  cursor: pointer;
  padding: 2px 4px;
  display: none;
  transition: color 0.15s;
  line-height: 1;
}
.snap-marker:hover .snap-edit-btn {
  display: flex;
  align-items: center;
}
.snap-edit-btn:hover { color: var(--gold); border-color: var(--gold); }

/* Record new snapshot button */
.snap-record-btn {
  display: flex;
  align-items: center;
  gap: 5px;
  font-family: var(--font-head);
  font-size: 9px;
  font-weight: 600;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--ink-ghost);
  background: none;
  border: 1px solid var(--parch-line);
  border-radius: 2px;
  padding: 5px 10px;
  cursor: pointer;
  flex-shrink: 0;
  transition: all 0.15s;
  white-space: nowrap;
}
.snap-record-btn:hover {
  color: var(--gold);
  border-color: rgba(184,134,11,0.4);
  background: rgba(184,134,11,0.06);
}
</style>
