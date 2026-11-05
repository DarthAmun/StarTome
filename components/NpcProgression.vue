<template>
    <div class="npp">
        <div class="npp-pickers">
            <div class="field">
                <label class="f-label">Ancestry</label>
                <RulesNamePicker
                    :options="ancestries"
                    :id="attrs.ancestryId"
                    :name="attrs.ancestryName"
                    placeholder="Compendium or your own"
                    @pick="(v) => pick('ancestry', v)"
                />
            </div>
            <div class="field">
                <label class="f-label">Class</label>
                <RulesNamePicker
                    :options="classes"
                    :id="attrs.classId"
                    :name="attrs.className"
                    placeholder="Compendium or your own"
                    @pick="(v) => pick('class', v)"
                />
            </div>
            <div class="field">
                <label class="f-label" title="Dual-class variant rule: both classes' features and a class feat from each">Second class (dual-class)</label>
                <RulesNamePicker
                    :options="classes"
                    :id="attrs.classId2"
                    :name="attrs.className2"
                    placeholder="None"
                    @pick="(v) => pick('class2', v)"
                />
            </div>
            <div class="npp-level">
                <span class="f-label">Level</span>
                <b>{{ level ?? "—" }}</b>
            </div>
        </div>

        <p v-if="!classEntries.length" class="npp-hint">
            Pick a class, or type one of your own, to see the feat slots level by level. The level comes from Attributes.
        </p>

        <p v-else-if="customClasses.length" class="npp-hint">
            {{ customClasses.join(" and ") }}: not in the compendium, so the usual feat levels and no class features.
            Class feats are the ones with the trait “{{ customClasses.map(classTrait).join("” or “") }}”.
        </p>

        <div class="npp-body">
            <div class="npp-main">
                <div v-if="totals.length" class="npp-totals">
                    <span class="npp-totals-label">By level {{ shownLevel }}:</span>
                    <button
                        v-for="t in totals"
                        :key="slotKey(t.slot)"
                        class="npp-chip"
                        :class="[`npp-chip--${t.slot.kind}`, { active: isOpen(t.slot, shownLevel), static: !isFeatSlot(t.slot) }]"
                        @click="openSlot(t.slot, shownLevel)"
                    >
                        {{ slotLabel(t.slot) }} <span class="npp-count">×{{ t.count }}</span>
                    </button>
                </div>

                <table class="npp-table">
                    <tbody>
                        <tr
                            v-for="row in rows"
                            :key="row.level"
                            :class="{ future: level !== null && row.level > level }"
                        >
                            <td class="npp-lvl">{{ row.level }}</td>
                            <td class="npp-features">
                                <template v-for="(f, i) in row.features" :key="f.className + f.name">
                                    <span class="npp-link" @click="openFeature(f.name)">{{ f.name }}</span><span
                                        v-if="dual"
                                        class="npp-muted"
                                    > ({{ f.className }})</span><template v-if="i < row.features.length - 1">, </template>
                                </template>
                            </td>
                            <td class="npp-slots">
                                <button
                                    v-for="s in row.slots"
                                    :key="slotKey(s)"
                                    class="npp-chip"
                                    :class="[`npp-chip--${s.kind}`, { active: isOpen(s, row.level), static: !isFeatSlot(s) }]"
                                    @click="openSlot(s, row.level)"
                                >
                                    {{ slotLabel(s) }}
                                </button>
                            </td>
                        </tr>
                    </tbody>
                </table>
                <button v-if="level !== null && level < 20" class="npp-more" @click="showAll = !showAll">
                    {{ showAll ? `Hide levels above ${level}` : `Show levels ${level + 1}–20` }}
                </button>
            </div>

            <aside v-if="open" class="npp-options">
                <header class="npp-options-head">
                    <div>
                        <b>{{ slotLabel(open.slot, true) }}</b>
                        <span class="npp-muted"> up to level {{ open.level }}</span>
                    </div>
                    <button class="npp-close" title="Close" @click="open = null">
                        <OhVueIcon name="md-close" scale="0.8" />
                    </button>
                </header>
                <input v-model="search" class="npp-search" placeholder="Filter…" />
                <p v-if="loadingOptions" class="npp-muted">Loading…</p>
                <p v-else-if="open.slot.kind === 'ancestryFeat' && !ancestryName" class="npp-muted">Pick an ancestry first.</p>
                <template v-else>
                    <p class="npp-muted">{{ filteredOptions.length }} {{ filteredOptions.length === 1 ? "feat" : "feats" }}</p>
                    <ul class="npp-option-list">
                        <li v-for="f in filteredOptions" :key="f.id" @click="openEntry(f)">
                            <span class="npp-option-lvl">{{ f.level }}</span>
                            <span class="npp-option-name">{{ f.name }}</span>
                            <span v-if="f.publication && !f.publication.remaster" class="npp-muted" :title="`From ${f.publication.title}, a pre-Remaster book`">legacy</span>
                        </li>
                    </ul>
                </template>
            </aside>
        </div>
    </div>
</template>

<script setup lang="ts">
import { getDb } from "~/composables/useDb";
import { rulesClassFeats, rulesFindByName, rulesGetMany, rulesNameList, rulesQuery, useRulesRevision } from "~/composables/useRules";
import { parseLevel } from "~/rules/party";
import { FEAT_SLOTS, levelPlan, SLOT_LABEL, slotOptions, slotTotals, type Slot } from "~/rules/progression";
import { classTrait } from "~/rules/subclasses";
import { campaignGame, type GameId } from "~/types/game";
import type { NpcAttributes } from "~/types/entities";
import { RULES_KIND_CONFIG, type Feat, type ReferenceEntry, type RulesEntity } from "~/types/rules";

const props = defineProps<{ attrs: NpcAttributes; campaignId: number }>();
const emit = defineEmits<{ update: [patch: Partial<NpcAttributes>] }>();

const router = useRouter();
const rulesRevision = useRulesRevision();

const game = ref<GameId>("pf2e");
const classes = ref<{ id: string; name: string }[]>([]);
const ancestries = ref<{ id: string; name: string }[]>([]);
const entries = ref<Record<string, RulesEntity>>({});

watch(
    () => [props.campaignId, rulesRevision.value] as const,
    async ([id]) => {
        game.value = campaignGame(await getDb().campaigns.get(id));
        [classes.value, ancestries.value] = await Promise.all([
            rulesNameList("class", [game.value]),
            rulesNameList("ancestry", [game.value]),
        ]);
    },
    { immediate: true },
);

const pickedIds = computed(() => [props.attrs.ancestryId, props.attrs.classId, props.attrs.classId2].filter((x): x is string => !!x));
watch(
    () => [pickedIds.value.join(","), rulesRevision.value] as const,
    async () => {
        const rows = await rulesGetMany(pickedIds.value);
        entries.value = Object.fromEntries(rows.map((r) => [r.id, r]));
    },
    { immediate: true },
);

const entry = (id?: string) => (id ? (entries.value[id] as ReferenceEntry | undefined) : undefined);
/** The ancestry's name, from the compendium or made up; ancestry feats carry it as a trait. */
const ancestryName = computed(() => entry(props.attrs.ancestryId)?.name ?? props.attrs.ancestryName);
type PlanClass = Pick<ReferenceEntry, "name" | "features" | "progression">;
/** A made-up class has no features and the usual feat levels. */
function planClass(id?: string, name?: string): PlanClass | null {
    const e = entry(id);
    if (e?.kind === "class") return e;
    return !id && name ? { name } : null;
}
const classEntries = computed(() =>
    [planClass(props.attrs.classId, props.attrs.className), planClass(props.attrs.classId2, props.attrs.className2)].filter((c): c is PlanClass => !!c),
);
const customClasses = computed(() => classEntries.value.filter((c) => !("id" in c)).map((c) => c.name));
const dual = computed(() => classEntries.value.length > 1);

const level = computed(() => parseLevel(props.attrs.level));
const showAll = ref(false);
const shownLevel = computed(() => level.value ?? 20);
const plan = computed(() => levelPlan(classEntries.value));
const rows = computed(() => (showAll.value || level.value === null ? plan.value : plan.value.filter((r) => r.level <= level.value!)));
const totals = computed(() => slotTotals(plan.value, shownLevel.value));

/** Picking a class or ancestry also fills the free-text fields the card shows, when they're empty. */
function pick(which: "ancestry" | "class" | "class2", v: { id?: string; name?: string }) {
    const [idKey, nameKey] = ({ ancestry: ["ancestryId", "ancestryName"], class: ["classId", "className"], class2: ["classId2", "className2"] } as const)[which];
    // A compendium pick keeps only its id; a made-up one only its name
    const patch: Partial<NpcAttributes> = { [idKey]: v.id, [nameKey]: v.id ? undefined : v.name };
    if (which === "ancestry" && v.name && !props.attrs.race) patch.race = v.name;
    if (which !== "ancestry" && v.name && !props.attrs.role) {
        const cur = (id?: string, name?: string) => classes.value.find((c) => c.id === id)?.name ?? name;
        const first = which === "class" ? v.name : cur(props.attrs.classId, props.attrs.className);
        const second = which === "class2" ? v.name : cur(props.attrs.classId2, props.attrs.className2);
        patch.role = [first, second].filter(Boolean).join(" / ");
    }
    emit("update", patch);
}

// ── Slots and their feats ─────────────────────────────────────────────────────
const slotKey = (s: Slot) => `${s.kind}:${s.className ?? ""}`;
const isFeatSlot = (s: Slot) => FEAT_SLOTS.includes(s.kind);
function slotLabel(s: Slot, plural = false) {
    const label = plural ? `${SLOT_LABEL[s.kind]}s` : SLOT_LABEL[s.kind];
    return s.kind === "classFeat" && dual.value ? `${label} (${s.className})` : label;
}

const open = ref<{ slot: Slot; level: number } | null>(null);
const search = ref("");
const options = ref<Feat[]>([]);
const loadingOptions = ref(false);

// The list is for one level; a new level or class starts over
watch(() => [level.value, classEntries.value.map((c) => c.name).join("/")], () => { open.value = null; });

const isOpen = (s: Slot, lvl: number) => !!open.value && slotKey(open.value.slot) === slotKey(s) && open.value.level === lvl;

function openSlot(s: Slot, lvl: number) {
    if (!isFeatSlot(s)) return;
    open.value = isOpen(s, lvl) ? null : { slot: s, level: lvl };
}

// Feats per source, loaded once per game: a class's trait, an ancestry's trait, or every general/skill feat
const featCache = new Map<string, Promise<Feat[]>>();
watch(rulesRevision, () => featCache.clear());

function featsFor(s: Slot): Promise<Feat[]> {
    const key =
        s.kind === "classFeat" ? `class:${s.className}`
        : s.kind === "ancestryFeat" ? `ancestry:${ancestryName.value ?? ""}`
        : "general";
    const cacheKey = `${game.value}:${key}`;
    let hit = featCache.get(cacheKey);
    if (!hit) {
        hit =
            s.kind === "classFeat" ? rulesClassFeats(classTrait(s.className ?? ""), game.value)
            : s.kind === "ancestryFeat" ? (ancestryName.value
                ? rulesQuery({ kind: "feat", games: [game.value], traits: [classTrait(ancestryName.value)], limit: 5000 }).then((p) => p.items as Feat[])
                : Promise.resolve([]))
            : rulesQuery({ kind: "feat", games: [game.value], traits: ["general"], limit: 5000 }).then((p) => p.items as Feat[]);
        featCache.set(cacheKey, hit);
    }
    return hit;
}

let optionsToken = 0;
watch(
    () => [open.value, ancestryName.value, rulesRevision.value] as const,
    async ([o]) => {
        const token = ++optionsToken;
        if (!o) { options.value = []; return; }
        loadingOptions.value = true;
        const feats = await featsFor(o.slot);
        if (token !== optionsToken) return;
        options.value = slotOptions(feats, o.slot, o.level, ancestryName.value);
        loadingOptions.value = false;
    },
);

const filteredOptions = computed(() => {
    const q = search.value.trim().toLowerCase();
    return q ? options.value.filter((f) => f.name.toLowerCase().includes(q) || f.traits.includes(q)) : options.value;
});

// ── Links into the compendium ─────────────────────────────────────────────────
function openEntry(e: RulesEntity) {
    router.push(`/compendium/${RULES_KIND_CONFIG[e.kind].segment}?id=${e.id}`);
}

async function openFeature(name: string) {
    const f = await rulesFindByName("feat", name, game.value);
    if (f) openEntry(f);
}
</script>

<style scoped>
.npp { display: flex; flex-direction: column; gap: 10px; }
.npp-pickers { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)) auto; gap: 10px; align-items: end; }
.npp-pickers .field { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
.npp-level { display: flex; flex-direction: column; gap: 4px; align-items: center; padding: 0 6px 6px; }
.npp-level b { font-family: var(--fh); font-size: 18px; color: var(--accent-l, var(--accent)); }
.npp-hint { margin: 0; color: var(--text2); font-size: 12.5px; }

.npp-body { display: flex; gap: 14px; align-items: flex-start; }
.npp-main { flex: 1; min-width: 0; }

.npp-totals { display: flex; flex-wrap: wrap; gap: 4px; align-items: center; margin-bottom: 8px; }
.npp-totals-label { font-size: 11.5px; color: var(--text2); margin-right: 4px; }
.npp-count { opacity: 0.75; }

.npp-table { width: 100%; border-collapse: collapse; font-size: 12.5px; }
.npp-table td { padding: 4px 6px; border-bottom: 1px solid var(--border); vertical-align: top; }
.npp-table tr.future { opacity: 0.45; }
.npp-lvl { width: 28px; text-align: right; font-family: var(--fh); font-weight: 700; color: var(--text2); }
.npp-features { line-height: 1.6; }
.npp-slots { width: 45%; text-align: right; line-height: 1.9; }
.npp-slots .npp-chip { margin-left: 3px; white-space: nowrap; }

.npp-chip {
    font-size: 11px; padding: 1px 7px; border-radius: 10px; cursor: pointer;
    border: 1px solid var(--border); background: var(--bg2); color: var(--text2);
    transition: all 0.12s;
}
.npp-chip:hover:not(.static) { border-color: var(--border-hi); background: var(--surface-hi); }
.npp-chip.static { cursor: default; border-style: dashed; }
.npp-chip.active { background: var(--accent-bg); border-color: var(--accent); color: var(--accent-l); }
.npp-chip--classFeat { border-color: color-mix(in srgb, #e05555 55%, var(--border)); }
.npp-chip--ancestryFeat { border-color: color-mix(in srgb, #7cc44e 55%, var(--border)); }
.npp-chip--skillFeat { border-color: color-mix(in srgb, #4a9ee8 55%, var(--border)); }
.npp-chip--generalFeat { border-color: color-mix(in srgb, #e8c44a 55%, var(--border)); }

.npp-link { color: var(--accent-l, var(--accent)); cursor: pointer; text-decoration: underline dotted; }
.npp-muted { color: var(--text2); font-size: 11.5px; }
.npp-more {
    margin-top: 6px; font-size: 11.5px; background: none; border: none; color: var(--text2);
    cursor: pointer; text-decoration: underline dotted; padding: 0;
}

.npp-options {
    width: 280px; flex-shrink: 0; position: sticky; top: 0;
    border: 1px solid var(--border); border-radius: var(--r1); background: var(--bg2);
    padding: 8px 10px; display: flex; flex-direction: column; gap: 6px; max-height: 48vh;
}
.npp-options-head { display: flex; justify-content: space-between; align-items: baseline; gap: 6px; font-size: 12.5px; }
.npp-options p { margin: 0; }
.npp-close { background: none; border: none; color: var(--text2); cursor: pointer; padding: 0; }
.npp-search {
    width: 100%; padding: 4px 8px; font-size: 12px; border-radius: var(--r1);
    border: 1px solid var(--border); background: var(--bg); color: var(--text);
}
.npp-option-list { list-style: none; margin: 0; padding: 0; overflow-y: auto; min-height: 0; }
.npp-option-list li { display: flex; gap: 8px; align-items: baseline; padding: 3px 4px; border-radius: 3px; cursor: pointer; font-size: 12.5px; }
.npp-option-list li:hover { background: var(--surface-hi); }
.npp-option-lvl { width: 18px; text-align: right; font-family: var(--fh); font-weight: 700; color: var(--text2); flex-shrink: 0; }
.npp-option-name { flex: 1; }

@media (max-width: 760px) {
    .npp-pickers { grid-template-columns: 1fr; }
    .npp-body { flex-direction: column; }
    .npp-options { width: 100%; position: static; }
}
</style>
