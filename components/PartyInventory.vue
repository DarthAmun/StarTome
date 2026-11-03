<template>
  <section class="inv party-section">
    <div class="inv-head">
      <div class="party-section-title">{{ lockOwner ? 'Loot' : 'Inventory' }}</div>
      <div class="inv-view" role="group" aria-label="View">
        <button :class="{ active: view === 'gm' }" @click="view = 'gm'">GM view</button>
        <button :class="{ active: view === 'player' }" title="What the players know: unidentified items show their player name and count as 0" @click="view = 'player'">Player view</button>
      </div>
    </div>

    <!-- Totals -->
    <div v-if="lockOwner" class="inv-totals">
      <span>Loot value <b>{{ money(totals.byOwner[lockOwner]?.total ?? 0) }}</b></span>
      <span class="inv-dim">Goes to the party stash when the encounter is resolved</span>
    </div>
    <div v-else class="inv-totals">
      <span>Party total <b>{{ money(totals.total) }}</b></span>
      <span class="inv-dim">items {{ money(totals.items) }} · coins {{ money(totals.coins) }}</span>
      <span v-if="unknownCount" class="inv-warn" title="Free-text entries without a price, or compendium items without one">{{ unknownCount }} without a price</span>
      <span class="inv-spacer" />
      <span v-if="rules.baselineAt" class="inv-dim" :title="`Set ${formatDate(rules.baselineAt)} at party level ${rules.startingLevel}`">
        Baseline {{ money(rules.startingTreasure) }}
      </span>
      <button class="ghost-btn inv-small" :disabled="partyLevel == null" title="Store the current GM total and party level as the start of treasure tracking" @click="setBaseline">
        {{ rules.baselineAt ? 'Re-set baseline' : 'Set treasure baseline' }}
      </button>
    </div>

    <!-- Owners -->
    <div v-if="!lockOwner" class="inv-owners">
      <button v-for="o in owners" :key="o.key" class="inv-owner" :class="{ active: o.key === selected }" @click="selected = o.key">
        <OhVueIcon :name="o.key === STASH ? 'gi-locked-chest' : 'gi-person'" scale="0.75" />
        <span>{{ o.name }}</span>
        <span class="inv-owner-total">{{ money(totals.byOwner[o.key]?.total ?? 0) }}</span>
        <span v-if="o.load && o.load !== 'ok'" class="inv-owner-load" :class="`inv-load--${o.load}`" :title="loadLabel(o.load)">!</span>
      </button>
    </div>

    <div class="inv-panel">
      <!-- Purse -->
      <div class="inv-purse">
        <OhVueIcon name="gi-two-coins" scale="0.85" />
        <span class="inv-purse-amount">{{ money(purses[selected] ?? 0) }}</span>
        <span v-if="selectedLinked" class="inv-dim">From Play Buddy: {{ selectedCharacter!.name }}'s player owns these coins and items. Give from the stash; they arrive when the player accepts.</span>
        <template v-else>
        <input v-model="coinInput" class="inv-input inv-coin-input" :placeholder="game === 'sf2e' ? 'e.g. 250 cr' : 'e.g. 12 gp 5 sp'" @keydown.enter="changeCoins(1)" />
        <button class="ghost-btn inv-small" :disabled="coinCp == null" @click="changeCoins(1)">Add</button>
        <label v-if="!lockOwner" class="inv-check" :title="AWARD_HINT">
          <input v-model="coinAward" type="checkbox" /> as treasure
        </label>
        <button class="ghost-btn inv-small" :disabled="coinCp == null" @click="changeCoins(-1)">Remove</button>
        <select v-model="coinTarget" class="inv-input inv-select" :disabled="coinCp == null">
          <option value="">Give to…</option>
          <option v-for="o in owners.filter(x => x.key !== selected)" :key="o.key" :value="o.key">{{ o.name }}</option>
        </select>
        <button v-if="selected === STASH && memberOwners.length" class="ghost-btn inv-small" :disabled="!(purses[STASH] ?? 0)"
          title="Each party member gets an equal share; the remainder stays in the stash" @click="splitStash">
          Split evenly
        </button>
        </template>
      </div>
      <div v-if="!lockOwner" class="inv-bulk">
        Bulk {{ formatBulkTotal(totals.byOwner[selected]?.bulk ?? 0) }}
        <template v-if="selectedCharacter">
          <template v-if="selectedCharacter.strMod != null">
            / limit {{ 5 + selectedCharacter.strMod }} (max {{ 10 + selectedCharacter.strMod }})
            <span v-if="selectedLoad && selectedLoad !== 'ok'" class="inv-warn" :class="`inv-load--${selectedLoad}`">{{ loadLabel(selectedLoad) }}</span>
          </template>
          <span v-else class="inv-dim">· enter a Str modifier on the roster for the encumbrance warning</span>
        </template>
      </div>
      <div v-if="lastSplit" class="inv-note">{{ lastSplit }}</div>

      <!-- Items -->
      <div v-if="!ownerEntries.length" class="party-empty">No items.</div>
      <div v-for="e in ownerEntries" :key="e.id" class="inv-item"
        :class="{ 'inv-item--unid': !e.identified, 'inv-item--inside': insideOf(e) || hostOf(e), 'inv-item--attached': hostOf(e), 'inv-item--deep': hostOf(e) && insideOf(hostOf(e)!) }">
        <div class="inv-row">
          <span v-if="hostOf(e)" class="inv-qty inv-qty--fixed inv-branch" aria-hidden="true">{{ lastAttached(e) ? '└' : '├' }}</span>
          <span v-else-if="e.pbEntryId || e.pbOfferId" class="inv-qty inv-qty--fixed">{{ e.quantity }}</span>
          <input v-else class="inv-input inv-qty" type="number" min="0" :value="e.quantity" title="Quantity (0 removes)"
            @change="updateEntry(e.id, { quantity: Number(($event.target as HTMLInputElement).value) })" />
          <div class="inv-name">
            <span v-if="e.attachKind" class="inv-kind" :class="`inv-kind--${e.attachKind}`">{{ kindLabel(e) }}</span>
            <span v-if="e.relic" class="inv-kind inv-kind--relic" :title="e.relic.aspects.length ? `Aspects: ${e.relic.aspects.join(', ')}` : 'Relic'">relic{{ e.relic.aspects.length ? ` · ${e.relic.aspects.join(', ')}` : '' }}</span>
            <template v-if="view === 'gm'">
              <NuxtLink v-if="linkOf(e)" :to="linkOf(e)!">{{ nameOf(e) }}</NuxtLink>
              <span v-else>{{ nameOf(e) }}</span>
              <span v-if="e.itemId && !linkOf(e)" class="inv-warn" title="The compendium entry is missing; sync or import it">missing entry</span>
              <span v-if="dormantGift(e)" class="inv-unid" title="Planned: players don't see it and it doesn't count as treasure until it awakens">dormant</span>
              <span v-else-if="!e.identified" class="inv-unid" :title="`Players see: ${playerOf(e).name}`">unidentified · “{{ playerOf(e).name }}”</span>
              <span v-if="runeLabel(e)" class="inv-dim">{{ runeLabel(e) }}</span>
              <span v-if="attachedOf(e).length" class="inv-dim" :title="`${nameOf(e)} with everything attached`">· {{ money(withAttached(e)) }} in all</span>
              <span v-for="w in warningsOf(e)" :key="w" class="inv-warn">{{ w }}</span>
              <span v-if="e.pbOfferId" class="inv-offered" :title="offerTitle(e)">offered</span>
            </template>
            <template v-else>
              <span>{{ playerOf(e).name }}</span>
              <span v-if="!e.identified" class="inv-unid">unidentified</span>
            </template>
            <span v-if="loadOf(e)" class="inv-dim" :class="{ 'inv-warn': loadOf(e)!.over }"
              :title="`Holds ${formatBulkTotal(loadOf(e)!.contents)} Bulk; ${formatBulkTotal(loadOf(e)!.counted)} of it counts toward the carrier`">
              holds {{ formatBulkTotal(loadOf(e)!.contents) }} / {{ formatBulkTotal(loadOf(e)!.capacity) }}{{ loadOf(e)!.over ? ' · over capacity' : '' }}
            </span>
          </div>
          <span class="inv-level" title="Level">{{ shownLevel(e) }}</span>
          <span class="inv-price" :title="priceTitle(e)">{{ shownPrice(e) }}</span>
          <span class="inv-bulk-cell" title="Bulk">{{ formatBulkTotal(entryBulk(e, item(e))) }}</span>
          <div v-if="hostOf(e) && !e.pbEntryId" class="inv-actions">
            <button v-if="e.attachKind === 'gift'" class="party-icon-btn" :class="{ active: e.identified }"
              :title="e.identified ? 'Awakened: counts as treasure. Click to make it dormant (planned)' : 'Dormant: awaken it'" @click="setIdentified(e.id, !e.identified)">
              <OhVueIcon name="md-autoawesome" scale="0.75" />
            </button>
            <button v-else class="party-icon-btn" :title="e.identified ? 'Mark as unidentified' : 'Identify'" @click="setIdentified(e.id, !e.identified)">
              <OhVueIcon :name="e.identified ? 'md-visibility' : 'md-visibilityoff'" scale="0.75" />
            </button>
            <button v-if="e.attachKind !== 'gift'" class="party-icon-btn" :title="`Take off: back into ${ownerName(e.owner)}`" @click="detach(e.id)">
              <OhVueIcon name="md-fileupload" scale="0.75" />
            </button>
            <button class="party-icon-btn" title="Details" :class="{ active: open === e.id }" @click="open = open === e.id ? null : e.id">
              <OhVueIcon name="md-edit" scale="0.7" />
            </button>
            <button class="party-icon-btn party-icon-btn--danger" title="Delete" @click="removeEntry(e.id)">
              <OhVueIcon name="md-close" scale="0.75" />
            </button>
          </div>
          <div v-else-if="e.pbEntryId" class="inv-actions">
            <button v-if="!e.identified" class="party-icon-btn" title="Identify: Play Buddy reveals it to the player" @click="identifyMirrored(e)">
              <OhVueIcon name="md-visibilityoff" scale="0.75" />
            </button>
          </div>
          <div v-else-if="e.pbOfferId" class="inv-actions" />
          <div v-else class="inv-actions">
            <button class="party-icon-btn" :title="e.identified ? 'Mark as unidentified' : 'Identify'" @click="setIdentified(e.id, !e.identified)">
              <OhVueIcon :name="e.identified ? 'md-visibility' : 'md-visibilityoff'" scale="0.75" />
            </button>
            <button v-if="canHost(e)" class="party-icon-btn" :title="attachTitle(e)" :class="{ active: attaching === e.id }" @click="startAttach(e)">
              <OhVueIcon name="md-addcircleoutline" scale="0.75" />
            </button>
            <button class="party-icon-btn" title="Move to…" :class="{ active: moving === e.id }" @click="startMove(e)">
              <OhVueIcon name="md-arrowforward" scale="0.75" />
            </button>
            <button class="party-icon-btn" title="Details" :class="{ active: open === e.id }" @click="open = open === e.id ? null : e.id">
              <OhVueIcon name="md-edit" scale="0.7" />
            </button>
            <button class="party-icon-btn party-icon-btn--danger" :title="attachedOf(e).length ? 'Delete, with everything attached' : 'Delete'" @click="removeEntry(e.id)">
              <OhVueIcon name="md-close" scale="0.75" />
            </button>
          </div>
        </div>

        <!-- Attach: below the item's last attachment -->
        <div v-if="attachHost && panelAfter(e)" class="inv-attach" :class="{ 'inv-attach--attached': e.id !== attachHost.id }">
          <div class="inv-attach-bar">
            <input v-model="attachQuery" class="inv-input inv-add-input" :placeholder="attachPlaceholder(attachHost)" />
            <button class="ghost-btn inv-small" @click="attaching = null">Close</button>
          </div>
          <div class="party-add-results">
            <div v-for="l in looseAttachables(attachHost)" :key="`e${l.id}`" class="party-add-row">
              <span class="party-add-name">{{ nameOf(l) }} <span class="party-add-hint">· from this inventory{{ l.quantity > 1 ? ` (${l.quantity})` : '' }} · {{ money(eff(l).unitPrice) }}</span></span>
              <button class="ghost-btn party-add-btn" @click="doAttach(attachHost, { entryId: l.id })">Attach</button>
            </div>
            <div v-for="r in attachResults" :key="r.id" class="party-add-row">
              <span class="party-add-name">{{ r.name }}
                <span class="party-add-hint">· {{ r.kind === 'relicGift' ? `${r.tier} gift · ${r.aspects.join(', ')}` : `${r.level} · ${money(r.price?.cp ?? null)}` }}</span>
              </span>
              <button class="ghost-btn party-add-btn" @click="doAttach(attachHost, { itemId: r.id })">{{ r.kind === 'relicGift' ? 'Add gift' : 'Attach' }}</button>
            </div>
            <div v-if="!attachResults.length && !looseAttachables(attachHost).length" class="party-add-row">
              <span class="party-add-name party-add-hint">{{ attachQuery.trim() ? 'Nothing that fits.' : 'Type to search.' }}</span>
            </div>
          </div>
        </div>

        <!-- Move -->
        <div v-if="moving === e.id" class="inv-move">
          Move
          <input v-if="e.quantity > 1" v-model.number="moveQty" class="inv-input inv-qty" type="number" min="1" :max="e.quantity" />
          <span v-if="e.quantity > 1">of {{ e.quantity }}</span>
          to
          <select v-model="moveTo" class="inv-input inv-select">
            <option v-for="o in owners.filter(x => x.key !== selected)" :key="o.key" :value="o.key">{{ o.name }}</option>
          </select>
          <button class="seal-btn inv-small" :disabled="!moveTo" @click="doMove(e)">{{ linkedOwner(moveTo) ? 'Offer' : 'Move' }}</button>
          <span v-if="linkedOwner(moveTo)" class="inv-dim">goes to Play Buddy; stays here until accepted</span>
          <button class="ghost-btn inv-small" @click="moving = null">Cancel</button>
        </div>

        <!-- Details -->
        <div v-if="open === e.id" class="inv-details">
          <label>
            <span>Name</span>
            <input class="inv-input" :value="e.nameOverride ?? ''" :placeholder="item(e)?.name ?? 'Name'"
              @change="updateEntry(e.id, { nameOverride: val($event) })" />
          </label>
          <label>
            <span>Price each</span>
            <input class="inv-input" :value="e.priceOverride != null ? money(e.priceOverride) : ''" :placeholder="item(e)?.price ? money(item(e)!.price!.cp) : 'unknown'"
              @change="setPrice(e, val($event))" />
          </label>
          <label>
            <span>Bulk</span>
            <input class="inv-input" :value="e.bulkOverride != null ? formatBulk(e.bulkOverride) : ''" :placeholder="item(e) ? formatBulk(item(e)!.bulk, item(e)!.bulkNote) : '—'"
              @change="setBulk(e, val($event))" />
          </label>
          <template v-if="gearKind(e)">
            <label v-if="game === 'sf2e'">
              <span>Grade</span>
              <select class="inv-input" :value="e.grade ?? ''" @change="updateEntry(e.id, { grade: val($event) })">
                <option value="">{{ itemGrade(e) ? `as item (${itemGrade(e)})` : '—' }}</option>
                <option v-for="g in SF2E_GRADES" :key="g" :value="g">{{ g }}</option>
              </select>
            </label>
          </template>
          <template v-if="!hostOf(e) && game === 'pf2e'">
            <label class="inv-check inv-relic-check" title="A relic (GMG p. 94): it grows with its bearer through gifts, attached like runes">
              <input type="checkbox" :checked="!!e.relic" @change="setRelic(e.id, ($event.target as HTMLInputElement).checked ? { aspects: [] } : null)" /> Relic
            </label>
            <label v-if="e.relic">
              <span>Aspects</span>
              <input class="inv-input" :value="e.relic.aspects.join(', ')" placeholder="e.g. fire, mind"
                @change="setRelic(e.id, { aspects: val($event).split(',').map(a => a.trim().toLowerCase()).filter(Boolean) })" />
            </label>
          </template>
          <label v-if="!lockOwner && !hostOf(e) && (containersFor(e).length || e.containerId != null)">
            <span>Stored in</span>
            <select class="inv-input" :value="insideOf(e)?.id ?? ''" @change="store(e.id, val($event) ? Number(val($event)) : null)">
              <option value="">Carried loose</option>
              <option v-for="c in containersFor(e)" :key="c.id" :value="c.id">{{ eff(c).name }}</option>
            </select>
          </label>
          <label class="inv-wide">
            <span>GM notes</span>
            <textarea class="inv-input" rows="2" :value="e.notes" placeholder="Only you see these; > [!hidden] blocks stay hidden in exports too"
              @change="updateEntry(e.id, { notes: val($event) })" />
          </label>
          <div class="inv-wide inv-subtitle">While unidentified, players see</div>
          <label>
            <span>Player name</span>
            <input class="inv-input" :value="e.playerName ?? ''" :placeholder="item(e)?.unidentified?.name || unidentifiedName(item(e))"
              @change="updateEntry(e.id, { playerName: val($event) })" />
          </label>
          <label class="inv-wide">
            <span>Player description</span>
            <textarea class="inv-input" rows="2" :value="e.playerDescription ?? ''" :placeholder="item(e)?.unidentified?.description || 'Nothing'"
              @change="updateEntry(e.id, { playerDescription: val($event) })" />
          </label>
        </div>
      </div>

      <!-- Add (not to a Play Buddy mirror: those items come from the player's app) -->
      <div v-if="!selectedLinked" class="inv-add">
        <div class="inv-add-bar">
          <input v-model="addQuery" class="inv-input inv-add-input" placeholder="Add an item: search the compendium or type a name…" @keydown.enter="addTyped" />
          <input v-model.number="addQty" class="inv-input inv-qty" type="number" min="1" title="Quantity" />
          <label class="inv-check" title="Players don't know what it is yet">
            <input v-model="addUnidentified" type="checkbox" /> unidentified
          </label>
          <label v-if="!lockOwner" class="inv-check" :title="AWARD_HINT">
            <input v-model="addAward" type="checkbox" /> as treasure
          </label>
        </div>
        <div v-if="addQuery.trim()" class="party-add-results">
          <div v-for="r in addResults" :key="r.id" class="party-add-row">
            <span class="party-add-name">{{ r.name }} <span class="party-add-hint">· {{ r.level }} · {{ money(r.price?.cp ?? null) }}</span></span>
            <button class="ghost-btn party-add-btn" @click="addLinked(r)">+ Add</button>
          </div>
          <div class="party-add-row party-add-row--new">
            <span class="party-add-name">Free text: “{{ addQuery.trim() }}” <span class="party-add-hint">(set its price under Details)</span></span>
            <button class="ghost-btn party-add-btn" @click="addFree">+ Add</button>
          </div>
        </div>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { dbApi } from '~/composables/useDb'
import { useInventory } from '~/composables/useInventory'
import { rulesQuery } from '~/composables/useRules'
import { useFormatters } from '~/composables/useFormatters'
import type { Character } from '~/composables/useParty'
import { usePlayBuddy } from '~/composables/usePlayBuddy'
import { useWealth } from '~/composables/useWealth'
import { lootValue } from '~/rules/wealth'
import { SF2E_GRADES } from '~/rules/registry'
import { characterOwner, containerLoad, containerOf, dormantGift, effective, encumbrance, entryBulk, entryValue, parseOwner, partyTotals, STASH, toPlayerView, unidentifiedName, type Encumbrance, type InventoryEntry, type OwnerKey } from '~/rules/inventory'
import { ATTACH_LABEL, attachedLabel, attachKindOf, attachmentWarnings, canAttach, fundamentalOf, hostKindOf } from '~/rules/attachments'
import { formatBulk, formatMoney, parseBulk, parseMoney } from '~/rules/format'
import { isPartyMember } from '~/rules/party'
import { campaignRules, type CampaignRules, type GameId } from '~/types/game'
import { RULES_KIND_CONFIG, type Item, type RelicGift } from '~/types/rules'
import { stripGmOnly } from '~/utils/gmContent'

const props = defineProps<{
  campaignId: number
  game: GameId
  characters: Character[]
  partyLevel: number | null
  /** Shows only this owner (an encounter's loot), with the stash and characters as move targets. */
  lockOwner?: OwnerKey
}>()

const AWARD_HINT = 'Treasure the party was given: counts toward the wealth readout. Leave it off for corrections, such as a forgotten item from before.'

const inv = useInventory()
const { entries, purses, items, gifts, purseList, load, addEntry, updateEntry, removeEntry, setIdentified, move, store, attach, detach, setRelic, adjustPurse, transferCoins, splitPurse } = inv
const { formatDate } = useFormatters()

const view = ref<'gm' | 'player'>('gm')
const selected = ref<OwnerKey>(props.lockOwner ?? STASH)
const rules = ref<CampaignRules>(campaignRules(null))

onMounted(async () => {
  rules.value = campaignRules(await dbApi.campaigns.get(props.campaignId))
  await load(props.campaignId)
})

const money = (cp: number | null) => formatMoney(cp == null ? null : { cp }, props.game)
const item = (e: InventoryEntry): Item | undefined => (e.itemId ? items.value.get(e.itemId) : undefined)
/** The linked item, or a relic gift seen as one (name, text, traits; its value comes from `giftValue`). */
const linked = (e: InventoryEntry): Item | undefined => {
  const g = e.itemId && !item(e) ? gifts.value.get(e.itemId) : undefined
  // Gifts have no item level of their own
  return g ? ({ ...g, kind: 'item', category: 'equipment', price: null, bulk: 0, level: null } as unknown as Item) : item(e)
}
const eff = (e: InventoryEntry) => effective(e, linked(e))
const playerOf = (e: InventoryEntry) => toPlayerView(e, linked(e), stripGmOnly)
const val = (ev: Event) => (ev.target as HTMLInputElement).value
const gift = (e: InventoryEntry): RelicGift | undefined => (e.itemId ? gifts.value.get(e.itemId) : undefined)
const nameOf = (e: InventoryEntry) => eff(e).name
function linkOf(e: InventoryEntry): string | null {
  if (!e.itemId) return null
  const kind = items.value.has(e.itemId) ? 'item' : gifts.value.has(e.itemId) ? 'relicGift' : null
  return kind ? `/compendium/${RULES_KIND_CONFIG[kind].segment}?id=${encodeURIComponent(e.itemId)}` : null
}
const ownerName = (owner: OwnerKey) => (owner === STASH ? 'the party stash' : `${owners.value.find(o => o.key === owner)?.name ?? 'the owner'}'s inventory`)

const totals = computed(() => partyTotals(entries.value, items.value, purseList.value, view.value, props.game !== 'sf2e'))
const unknownCount = computed(() => Object.values(totals.value.byOwner).reduce((a, t) => a + t.unknownPrices, 0))

// ── Owners ──
const memberOwners = computed(() => props.characters.filter(isPartyMember).map(c => characterOwner(c.id)))
const owners = computed(() => [
  { key: STASH, name: 'Party stash', load: null as Encumbrance | null },
  ...props.characters.map(c => ({
    key: characterOwner(c.id), name: c.name,
    load: encumbrance(totals.value.byOwner[characterOwner(c.id)]?.bulk ?? 0, c.strMod),
  })),
])
const selectedCharacter = computed(() => props.characters.find(c => characterOwner(c.id) === selected.value) ?? null)
const selectedLoad = computed(() => owners.value.find(o => o.key === selected.value)?.load ?? null)
watch(owners, list => { if (!props.lockOwner && !list.some(o => o.key === selected.value)) selected.value = STASH })

/** The owner's stacks, each container followed by what's stored in it, each item followed by what's attached to it. */
const ownerEntries = computed(() => {
  const own = entries.value.filter(e => e.owner === selected.value)
  const byName = (a: InventoryEntry, b: InventoryEntry) => nameOf(a).localeCompare(nameOf(b))
  const withAttached = (e: InventoryEntry) => [e, ...shownAttached(e)]
  const top = own.filter(e => e.attachedTo == null)
  const loose = top.filter(e => !containerOf(e, own, items.value)).sort(byName)
  return loose.flatMap(e => [...withAttached(e), ...top.filter(c => containerOf(c, own, items.value)?.id === e.id).sort(byName).flatMap(withAttached)])
})

// ── Attachments (rules/attachments.ts) ──
const hostOf = (e: InventoryEntry) => (e.attachedTo == null ? null : entries.value.find(h => h.id === e.attachedTo) ?? null)
/** Fundamental runes first, then the rest by name. */
function attachedOf(host: InventoryEntry) {
  const rank = (e: InventoryEntry) => (fundamentalOf(nameOf(e)) ? 0 : e.attachKind === 'gift' ? 2 : 1)
  return entries.value.filter(a => a.attachedTo === host.id).sort((a, b) => rank(a) - rank(b) || a.id - b.id)
}
/** Players see nothing attached to an item they haven't identified, and no dormant gift. */
function shownAttached(host: InventoryEntry) {
  const all = attachedOf(host)
  return view.value === 'gm' ? all : host.identified ? all.filter(a => !dormantGift(a)) : []
}
function lastAttached(e: InventoryEntry) {
  const host = hostOf(e)
  const list = host ? shownAttached(host) : []
  return list[list.length - 1]?.id === e.id
}
const attachedInfo = (host: InventoryEntry) => attachedOf(host).map(a => ({ name: nameOf(a), kind: a.attachKind ?? 'accessory' }))
function kindLabel(e: InventoryEntry) {
  return e.attachKind === 'gift' ? `${gift(e)?.tier ?? ''} gift`.trim() : ATTACH_LABEL[e.attachKind ?? 'accessory']
}
function warningsOf(e: InventoryEntry) {
  return e.attachedTo == null ? attachmentWarnings(attachedInfo(e), { kind: hostKindOf(item(e)), relic: !!e.relic }) : []
}
const withAttached = (host: InventoryEntry) =>
  [host, ...attachedOf(host)].reduce((n, x) => n + entryValue(x, item(x)), 0)
/** Things that take attachments: weapons, armor, shields, relics and free-text items. */
const canHost = (e: InventoryEntry) => !e.pbOfferId && (!!e.relic || !!hostKindOf(item(e)) || !e.itemId)
function attachTitle(e: InventoryEntry) {
  if (e.relic) return 'Add a gift or rune…'
  return game.value === 'sf2e' ? 'Install an upgrade…' : 'Add a rune or talisman…'
}
function attachPlaceholder(e: InventoryEntry) {
  if (e.relic) return 'Search relic gifts and runes…'
  return game.value === 'sf2e' ? 'Search upgrades…' : 'Search runes, talismans, accessories…'
}
const game = computed(() => props.game)

const attaching = ref<number | null>(null)
const attachHost = computed(() => entries.value.find(h => h.id === attaching.value) ?? null)
/** The panel goes under the host's last attachment, or the host itself. */
function panelAfter(e: InventoryEntry) {
  const host = attachHost.value
  if (!host) return false
  const list = shownAttached(host)
  return list.length ? list[list.length - 1].id === e.id : e.id === host.id
}
const attachQuery = ref('')
const attachResults = ref<(Item | RelicGift)[]>([])
function startAttach(e: InventoryEntry) {
  attaching.value = attaching.value === e.id ? null : e.id
  attachQuery.value = ''
}
/** Loose entries of the same owner that fit the host. */
function looseAttachables(host: InventoryEntry) {
  const q = attachQuery.value.trim().toLowerCase()
  return entries.value.filter(l => l.owner === host.owner && l.id !== host.id && l.attachedTo == null && !l.pbOfferId
    && !entries.value.some(x => x.attachedTo === l.id)
    && !!attachKindOf(item(l)) && canAttach(item(l), item(host), !!host.relic)
    && (!q || nameOf(l).toLowerCase().includes(q)))
}
let attachSeq = 0
watch([attachQuery, attaching], async () => {
  const seq = ++attachSeq
  const host = entries.value.find(h => h.id === attaching.value)
  if (!host) { attachResults.value = []; return }
  const q = attachQuery.value.trim().toLowerCase()
  const hostKind = hostKindOf(item(host))
  // Without a search: the fundamental runes for this kind of item, so +1 or striking is two clicks
  const texts = q ? [q] : props.game === 'sf2e' ? [] : hostKind === 'armor' ? ['armor potency', 'resilient'] : hostKind === 'shield' ? ['reinforcing'] : hostKind === 'weapon' ? ['weapon potency', 'striking'] : []
  const found: (Item | RelicGift)[] = []
  if (host.relic) {
    const page = await rulesQuery({ kind: 'relicGift', text: q, limit: 1000 })
    const aspects = host.relic.aspects
    found.push(...(page.items as RelicGift[]).filter(g => !aspects.length || g.aspects.includes('any') || g.aspects.some(a => aspects.includes(a))))
  }
  for (const text of texts) {
    // Most matches don't attach to anything: fetch plenty, keep what fits
    const page = await rulesQuery({ kind: 'item', games: [props.game], text, limit: 300 })
    found.push(...(page.items as Item[]).filter(r => !!attachKindOf(r) && canAttach(r, item(host), !!host.relic)))
  }
  // Fundamental runes in order (potency, then striking/resilient, weakest first), then by name
  const rank = (r: Item | RelicGift) => {
    const f = fundamentalOf(r.name)
    return f ? (f.slot.endsWith('Potency') ? 0 : 10) + f.value : 100
  }
  const unique = [...new Map(found.map(r => [r.id, r])).values()].sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name))
  if (seq === attachSeq) attachResults.value = unique.slice(0, 20)
})
async function doAttach(host: InventoryEntry, source: { entryId: number } | { itemId: string }) {
  const id = await attach(host.id, source)
  // The host may have split off a stack: keep the panel on the item that got the rune
  const attached = entries.value.find(x => x.id === id)
  if (attached?.attachedTo != null) attaching.value = attached.attachedTo
}
const insideOf = (e: InventoryEntry) => containerOf(e, entries.value, items.value)
const loadOf = (e: InventoryEntry) => containerLoad(e, entries.value, items.value)
/** Containers of the same owner this entry can go into; containers holding something don't nest. */
function containersFor(e: InventoryEntry) {
  if (entries.value.some(x => x.containerId === e.id)) return []
  return entries.value.filter(c => c.owner === e.owner && c.id !== e.id && c.containerId == null && !!item(c)?.container)
}

function loadLabel(l: Encumbrance) {
  return l === 'overloaded' ? 'Over the Bulk limit' : 'Encumbered'
}

function formatBulkTotal(tenths: number) {
  return tenths ? formatBulk(tenths) : '0'
}

// ── Row display ──
function shownLevel(e: InventoryEntry) {
  const l = view.value === 'gm' ? eff(e).level : playerOf(e).level
  // An item is as high-level as its highest rune
  const levels = [l, ...shownAttached(e).map(a => (view.value === 'gm' ? eff(a).level : playerOf(a).level))].filter((x): x is number => x != null)
  return levels.length ? String(Math.max(...levels)) : ''
}
function shownPrice(e: InventoryEntry) {
  if (view.value === 'player') {
    const p = playerOf(e).price
    return p == null ? '?' : money(p)
  }
  return eff(e).unitPrice == null ? '—' : money(Math.round((eff(e).unitPrice! * e.quantity) / eff(e).per))
}
function priceTitle(e: InventoryEntry) {
  const f = eff(e)
  if (f.unitPrice == null) return 'No price'
  return f.per > 1 ? `${money(f.unitPrice)} per ${f.per}` : `${money(f.unitPrice)} each`
}
function gearKind(e: InventoryEntry): 'weapon' | 'armor' | null {
  const c = item(e)?.category
  return c === 'weapon' || c === 'armor' ? c : null
}
function itemGrade(e: InventoryEntry) {
  const i = item(e)
  return i?.weapon?.grade ?? i?.armor?.grade ?? null
}
function runeLabel(e: InventoryEntry) {
  if (e.grade) return e.grade
  if (attachedOf(e).length) return attachedLabel(attachedInfo(e))
  // Runes from before attachments, not yet matched to compendium runes
  const r = e.runes
  if (!r) return ''
  const fund = r.striking ? ['striking', 'greater striking', 'major striking'][r.striking - 1] : r.resilient ? ['resilient', 'greater resilient', 'major resilient'][r.resilient - 1] : ''
  return [r.potency ? `+${r.potency}` : '', fund].filter(Boolean).join(' ')
}

// ── Edits ──
function setPrice(e: InventoryEntry, raw: string) {
  if (!raw.trim()) return updateEntry(e.id, { priceOverride: null })
  const cp = parseMoney(raw, props.game)
  if (cp != null) updateEntry(e.id, { priceOverride: cp })
}
function setBulk(e: InventoryEntry, raw: string) {
  if (!raw.trim()) return updateEntry(e.id, { bulkOverride: null })
  const b = parseBulk(raw)
  if (b !== undefined) updateEntry(e.id, { bulkOverride: b })
}

const open = ref<number | null>(null)

// ── Move ──
const moving = ref<number | null>(null)
const moveTo = ref<OwnerKey>('')
const moveQty = ref(1)
function startMove(e: InventoryEntry) {
  if (moving.value === e.id) { moving.value = null; return }
  moving.value = e.id
  moveQty.value = e.quantity
  moveTo.value = owners.value.find(o => o.key !== selected.value)?.key ?? ''
}
async function doMove(e: InventoryEntry) {
  const quantity = Math.min(e.quantity, Math.max(1, moveQty.value || 1))
  const target = linkedOwner(moveTo.value)
  if (target) await playBuddy.offerItems(props.campaignId, target, [{ entry: e, item: item(e), quantity }])
  else await move(e.id, moveTo.value, quantity)
  moving.value = null
}

// ── Play Buddy: linked characters own their inventory; the GM offers ──
const playBuddy = usePlayBuddy()
const linkedOwner = (owner: OwnerKey) => props.characters.find(c => c.pbPlayerId && characterOwner(c.id) === owner) ?? null
const selectedLinked = computed(() => !!selectedCharacter.value?.pbPlayerId)
function offerTitle(e: InventoryEntry) {
  const o = playBuddy.offers.value.find(x => x.id === e.pbOfferId)
  return o ? `${o.summary} (${o.state})` : 'Offered to a Play Buddy player'
}
async function identifyMirrored(e: InventoryEntry) {
  const c = selectedCharacter.value
  if (c) await playBuddy.identify(props.campaignId, c, e, eff(e).name)
}

// ── Coins ──
const coinInput = ref('')
const coinTarget = ref<OwnerKey>('')
const coinCp = computed(() => {
  const cp = parseMoney(coinInput.value, props.game)
  return cp != null && cp > 0 ? cp : null
})
const coinAward = ref(false)
async function changeCoins(sign: 1 | -1) {
  if (coinCp.value == null) return
  await adjustPurse(props.campaignId, selected.value, sign * coinCp.value)
  if (sign > 0 && coinAward.value && !props.lockOwner) {
    await wealth.awardTreasure({ campaignId: props.campaignId, value: { value: coinCp.value, consumables: 0 }, label: `Coins: ${money(coinCp.value)}` })
  }
  coinInput.value = ''
}
watch(coinTarget, async to => {
  if (!to || coinCp.value == null) return
  const target = linkedOwner(to)
  if (target) await playBuddy.offerCoins(props.campaignId, target, Math.min(coinCp.value, purses.value[selected.value] ?? 0), money(coinCp.value), selected.value)
  else await transferCoins(props.campaignId, selected.value, to, coinCp.value)
  coinInput.value = ''
  coinTarget.value = ''
})
const lastSplit = ref('')
async function splitStash() {
  const n = memberOwners.value.length
  const linked = memberOwners.value.map(linkedOwner).filter((c): c is Character => !!c)
  if (linked.length) {
    // Linked members get their share as an offer; the rest straight away
    const each = Math.floor((purses.value[STASH] ?? 0) / n)
    if (!each) { lastSplit.value = 'Not enough coins to split.'; return }
    for (const owner of memberOwners.value) {
      const c = linkedOwner(owner)
      if (c) await playBuddy.offerCoins(props.campaignId, c, each, money(each))
      else await transferCoins(props.campaignId, STASH, owner, each)
    }
    lastSplit.value = `Gave ${money(each)} to each of ${n} members (${linked.length} as Play Buddy offers); ${money(purses.value[STASH] ?? 0)} stays in the stash.`
    return
  }
  const { each, remainder } = await splitPurse(props.campaignId, STASH, memberOwners.value)
  lastSplit.value = each ? `Gave ${money(each)} to each of ${n} members; ${money(remainder)} stays in the stash.` : 'Not enough coins to split.'
}

// ── Baseline ──
const wealth = useWealth()
async function setBaseline() {
  if (props.partyLevel == null) return
  const owned = entries.value.filter(e => parseOwner(e.owner).kind !== 'encounter')
  const coins = purseList.value.filter(p => parseOwner(p.owner).kind !== 'encounter').reduce((n, p) => n + p.cp, 0)
  const { value, consumables } = lootValue(owned, items.value, coins)
  if (rules.value.baselineAt && !confirm(`Replace the baseline of ${money(rules.value.startingTreasure)} with ${money(value)}? Awards up to now are then part of the baseline.`)) return
  rules.value = await wealth.updateRules(props.campaignId, {
    startingTreasure: value, startingConsumables: consumables, startingLevel: props.partyLevel, baselineAt: new Date().toISOString(),
  })
}

// ── Add ──
const addQuery = ref('')
const addQty = ref(1)
const addUnidentified = ref(false)
const addAward = ref(false)

/** "Award or correction?" (§9.6): only ticked adds count as treasure. */
async function recordAward(itemId: string | null, name: string, quantity: number) {
  if (!addAward.value || props.lockOwner) return
  const probe = { id: -1, owner: selected.value, itemId, quantity, nameOverride: itemId ? null : name, priceOverride: null, bulkOverride: null,
    notes: '', identified: true, playerName: null, playerDescription: null, runes: null, grade: null, containerId: null }
  const value = lootValue([probe], items.value)
  const label = `${quantity > 1 ? `${quantity}× ` : ''}${name}`
  if (value.value > 0) await wealth.awardTreasure({ campaignId: props.campaignId, value, label })
  else lastSplit.value = `${label} has no price, so it wasn't counted as treasure. Record its value under Wealth › Record award.`
}
const addResults = ref<Item[]>([])
let searchSeq = 0
watch(addQuery, async q => {
  const seq = ++searchSeq
  if (!q.trim()) { addResults.value = []; return }
  const page = await rulesQuery({ kind: 'item', games: [props.game], text: q.trim().toLowerCase(), limit: 8 })
  if (seq === searchSeq) addResults.value = page.items as Item[]
})
async function addLinked(r: Item) {
  await addEntry({ campaignId: props.campaignId, owner: selected.value, itemId: r.id, quantity: addQty.value || 1, identified: !addUnidentified.value })
  await recordAward(r.id, r.name, addQty.value || 1)
  addQuery.value = ''
}
async function addFree() {
  const name = addQuery.value.trim()
  if (!name) return
  await addEntry({ campaignId: props.campaignId, owner: selected.value, name, quantity: addQty.value || 1, identified: !addUnidentified.value })
  await recordAward(null, name, addQty.value || 1)
  addQuery.value = ''
}
function addTyped() {
  const q = addQuery.value.trim().toLowerCase()
  const exact = addResults.value.find(r => r.name.toLowerCase() === q)
  return exact ? addLinked(exact) : addFree()
}
</script>

<style scoped>
/* Shared with the party page (its styles are scoped) */
.party-section { margin-bottom: 28px; }
.party-section-title { font-family: var(--fh, serif); font-size: 12px; letter-spacing: 0.08em; text-transform: uppercase; color: var(--text3); }
.party-empty { font-size: 13px; color: var(--text3); padding: 8px 0 12px; }
.party-icon-btn { width: 28px; height: 28px; display: flex; align-items: center; justify-content: center; background: transparent; border: 1px solid var(--border); border-radius: 6px; color: var(--text2); cursor: pointer; }
.party-icon-btn:hover { color: var(--text); border-color: var(--border-hi); }
.party-icon-btn--danger:hover { color: var(--blood, #d04a4a); }
.party-add-results { margin-top: 6px; border: 1px solid var(--border); border-radius: 8px; overflow: hidden; }
.party-add-row { display: flex; align-items: center; gap: 8px; padding: 6px 10px; border-bottom: 1px solid var(--border); }
.party-add-row:last-child { border-bottom: none; }
.party-add-name { flex: 1; font-size: 13px; color: var(--text); }
.party-add-hint { color: var(--text3); font-size: 12px; }
.party-add-btn { padding: 3px 10px; font-size: 12px; }

.inv-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.inv-head .party-section-title { margin-bottom: 0; }
.inv-view { display: inline-flex; border: 1px solid var(--border); border-radius: 6px; overflow: hidden; }
.inv-view button { padding: 3px 10px; font-size: 12px; background: transparent; border: none; color: var(--text2); cursor: pointer; }
.inv-view button.active { background: var(--surface-hi); color: var(--text); }

.inv-totals { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; margin: 10px 0 12px; font-size: 13px; color: var(--text2); }
.inv-totals b { color: var(--text); }
.inv-spacer { flex: 1; }
.inv-dim { color: var(--text3); font-size: 12px; }
.inv-warn { padding: 1px 6px; border-radius: 4px; font-size: 11px; color: #c9973a; border: 1px solid #c9973a66; }
.inv-load--overloaded { color: var(--blood, #d04a4a); border-color: #d04a4a66; }
.inv-note { font-size: 12px; color: var(--text2); margin: 4px 0 8px; }
.inv-small { padding: 3px 10px; font-size: 12px; }
.inv-qty--fixed { display: inline-block; text-align: center; font-family: var(--fm); font-size: 12px; color: var(--text2); }
.inv-offered { padding: 1px 6px; border-radius: 4px; font-size: 11px; color: #e8c44a; border: 1px solid #e8c44a66; }

.inv-owners { display: flex; gap: 6px; flex-wrap: wrap; margin-bottom: 10px; }
.inv-owner { display: inline-flex; align-items: center; gap: 6px; padding: 5px 10px; font-size: 13px; background: transparent; border: 1px solid var(--border); border-radius: 8px; color: var(--text2); cursor: pointer; }
.inv-owner.active { border-color: var(--border-hi); background: var(--surface); color: var(--text); }
.inv-owner-total { font-family: var(--fm); font-size: 11px; color: var(--text3); }
.inv-owner-load { font-weight: 700; color: #c9973a; }
.inv-owner-load.inv-load--overloaded { color: var(--blood, #d04a4a); }

.inv-panel { background: var(--surface); border: 1px solid var(--border); border-radius: 8px; padding: 12px; }
.inv-purse { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; color: var(--text2); }
.inv-purse-amount { font-family: var(--fm); color: var(--text); min-width: 90px; }
.inv-bulk { font-size: 12px; color: var(--text2); margin: 8px 0 10px; display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }

.inv-input { height: 28px; padding: 0 8px; border: 1px solid var(--border); border-radius: 6px; background: transparent; color: var(--text); font-size: 13px; }
textarea.inv-input { height: auto; padding: 6px 8px; resize: vertical; font-family: inherit; }
.inv-coin-input { width: 150px; }
.inv-select { max-width: 180px; }
.inv-qty { width: 56px; text-align: center; font-family: var(--fm); }

.inv-item { border-top: 1px solid var(--border); }
.inv-item--inside { margin-left: 24px; border-top-style: dashed; }
.inv-item--attached { border-top-color: transparent; }
.inv-item--deep { margin-left: 48px; }
.inv-branch { color: var(--text3); font-family: var(--fm); }
.inv-kind { padding: 0 5px; border-radius: 4px; font-size: 10px; text-transform: uppercase; letter-spacing: 0.05em; color: var(--text2); border: 1px solid var(--border); }
.inv-kind--rune { color: #6b9fe8; border-color: #6b9fe866; }
.inv-kind--talisman { color: #5fc98a; border-color: #5fc98a66; }
.inv-kind--upgrade { color: #4ab8e8; border-color: #4ab8e866; }
.inv-kind--gift, .inv-kind--relic { color: #e0a35a; border-color: #e0a35a66; }
.inv-attach { padding: 4px 0 10px 66px; }
.inv-attach--attached { margin-left: -24px; }
.inv-attach-bar { display: flex; gap: 8px; align-items: center; }
.inv-details .inv-relic-check { flex-direction: row; align-items: center; align-self: end; height: 28px; }
.inv-row { display: flex; align-items: center; gap: 10px; padding: 6px 0; }
.inv-name { flex: 1; min-width: 0; display: flex; align-items: center; gap: 8px; flex-wrap: wrap; font-size: 13px; color: var(--text); }
.inv-name a { color: inherit; text-decoration: none; }
.inv-name a:hover { text-decoration: underline; }
.inv-unid { font-size: 11px; color: #a87de8; }
.inv-level { width: 28px; text-align: right; font-family: var(--fm); font-size: 12px; color: var(--text3); }
.inv-price { width: 110px; text-align: right; font-family: var(--fm); font-size: 12px; color: var(--text2); }
.inv-bulk-cell { width: 44px; text-align: right; font-family: var(--fm); font-size: 12px; color: var(--text3); }
.inv-actions { display: flex; gap: 4px; }
.inv-actions .active { border-color: var(--border-hi); color: var(--text); }

.inv-move { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; padding: 4px 0 10px 66px; font-size: 13px; color: var(--text2); }
.inv-details { display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 8px 12px; padding: 4px 0 12px 66px; }
.inv-details label { display: flex; flex-direction: column; gap: 3px; }
.inv-details label > span, .inv-subtitle { font-size: 11px; text-transform: uppercase; letter-spacing: 0.06em; color: var(--text3); }
.inv-subtitle { margin-top: 4px; }
.inv-wide { grid-column: 1 / -1; }

.inv-add { margin-top: 10px; }
.inv-add-bar { display: flex; gap: 8px; align-items: center; }
.inv-add-input { flex: 1; border-style: dashed; border-color: var(--border-hi); }
.inv-check { display: flex; align-items: center; gap: 4px; font-size: 12px; color: var(--text2); white-space: nowrap; }

@media (max-width: 640px) {
  .inv-move, .inv-details, .inv-attach { padding-left: 0; }
  .inv-price { width: 80px; }
  .inv-level { display: none; }
}
</style>
