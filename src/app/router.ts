import { createRouter, createWebHashHistory, type RouteRecordRaw } from 'vue-router'
import ComingPage from '@/features/shared/ComingPage.vue'
import TonightPage from '@/features/tonight/TonightPage.vue'
import { PLACES, UTILITIES } from './places'
import WelcomePage from './WelcomePage.vue'

// Every page but the first ones loads when it is opened; the offline cache holds them all
const DataPage = () => import('@/features/data/DataPage.vue')
const SettingsPage = () => import('@/features/settings/SettingsPage.vue')
const ArtPage = () => import('@/features/compendium/ArtPage.vue')
const CompendiumPage = () => import('@/features/compendium/CompendiumPage.vue')
const HomebrewPage = () => import('@/features/compendium/HomebrewPage.vue')
const SyncPage = () => import('@/features/compendium/SyncPage.vue')
const BuilderPage = () => import('@/features/encounters/BuilderPage.vue')
const EncounterPage = () => import('@/features/encounters/EncounterPage.vue')
const MapMakerPage = () => import('@/features/encounters/mapmaker/MapMakerPage.vue')
const EncountersPage = () => import('@/features/encounters/EncountersPage.vue')
const PlayerEncounterPage = () => import('@/features/encounters/PlayerEncounterPage.vue')
const TokensPage = () => import('@/features/encounters/TokensPage.vue')
const PartyPage = () => import('@/features/party/PartyPage.vue')
const BoardPage = () => import('@/features/sessions/BoardPage.vue')
const SessionsPage = () => import('@/features/sessions/SessionsPage.vue')
const DeskPage = () => import('@/features/desk/DeskPage.vue')
const SoundsPage = () => import('@/features/sounds/SoundsPage.vue')
const StarshipPage = () => import('@/features/starship/StarshipPage.vue')
const EntryPage = () => import('@/features/world/EntryPage.vue')
const GraphsPage = () => import('@/features/world/GraphsPage.vue')
const MapPage = () => import('@/features/world/MapPage.vue')
const MapsPage = () => import('@/features/world/MapsPage.vue')
const PlayerGraphPage = () => import('@/features/world/PlayerGraphPage.vue')
const PlayerMapPage = () => import('@/features/world/PlayerMapPage.vue')
const TimelinePage = () => import('@/features/world/TimelinePage.vue')
const WorldPage = () => import('@/features/world/WorldPage.vue')

const built: Record<string, RouteRecordRaw['component']> = { tonight: TonightPage, world: WorldPage, compendium: CompendiumPage, party: PartyPage, encounters: EncountersPage, sessions: SessionsPage, sounds: SoundsPage, desk: DeskPage, data: DataPage, settings: SettingsPage }

const placeRoutes: RouteRecordRaw[] = [...PLACES, ...UTILITIES].map((p) => {
  const path = p.campaign ? `/c/:campaignId/${p.name}` : `/${p.name}`
  const component = built[p.name]
  return component
    ? { path, name: p.name, component, props: ['party', 'encounters', 'sessions', 'desk'].includes(p.name) }
    : { path, name: p.name, component: ComingPage, props: { title: p.label, phase: p.phase ?? 0, holds: p.holds } }
})

export const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: '/', name: 'welcome', component: WelcomePage },
    ...placeRoutes,
    { path: '/c/:campaignId/world/:entryId', name: 'entry', component: EntryPage, props: true },
    { path: '/c/:campaignId/maps', name: 'maps', component: MapsPage, props: true },
    { path: '/c/:campaignId/map/:entryId', name: 'map', component: MapPage, props: true },
    { path: '/c/:campaignId/graphs/:graphId?', name: 'graphs', component: GraphsPage, props: true },
    { path: '/c/:campaignId/timeline', name: 'timeline', component: TimelinePage, props: true },
    { path: '/c/:campaignId/session/:sessionId', name: 'session', component: BoardPage, props: true },
    { path: '/c/:campaignId/starship', name: 'starship', component: StarshipPage, props: true },
    { path: '/c/:campaignId/encounters/builder', name: 'encounter-builder', component: BuilderPage, props: true },
    { path: '/c/:campaignId/encounters/tokens', name: 'encounter-tokens', component: TokensPage, props: true },
    { path: '/c/:campaignId/encounter/:encounterId', name: 'encounter', component: EncounterPage, props: true },
    { path: '/c/:campaignId/encounter/:encounterId/map-maker', name: 'map-maker', component: MapMakerPage, props: true },
    { path: '/compendium/sync', name: 'compendium-sync', component: SyncPage },
    { path: '/compendium/homebrew', name: 'compendium-homebrew', component: HomebrewPage },
    { path: '/compendium/art', name: 'compendium-art', component: ArtPage },
    // Windows for the players: no shell, nothing of the GM's
    { path: '/player/map', name: 'player-map', component: PlayerMapPage, meta: { player: true } },
    { path: '/player/encounter', name: 'player-encounter', component: PlayerEncounterPage, meta: { player: true } },
    { path: '/player/graph', name: 'player-graph', component: PlayerGraphPage, meta: { player: true } },
    { path: '/:rest(.*)*', redirect: '/' },
  ],
})
