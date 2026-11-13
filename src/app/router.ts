import { createRouter, createWebHashHistory, type RouteRecordRaw } from 'vue-router'
import DataPage from '@/features/data/DataPage.vue'
import SettingsPage from '@/features/settings/SettingsPage.vue'
import ComingPage from '@/features/shared/ComingPage.vue'
import ArtPage from '@/features/compendium/ArtPage.vue'
import CompendiumPage from '@/features/compendium/CompendiumPage.vue'
import HomebrewPage from '@/features/compendium/HomebrewPage.vue'
import SyncPage from '@/features/compendium/SyncPage.vue'
import PartyPage from '@/features/party/PartyPage.vue'
import TonightPage from '@/features/tonight/TonightPage.vue'
import EntryPage from '@/features/world/EntryPage.vue'
import GraphsPage from '@/features/world/GraphsPage.vue'
import MapPage from '@/features/world/MapPage.vue'
import MapsPage from '@/features/world/MapsPage.vue'
import PlayerGraphPage from '@/features/world/PlayerGraphPage.vue'
import PlayerMapPage from '@/features/world/PlayerMapPage.vue'
import TimelinePage from '@/features/world/TimelinePage.vue'
import WorldPage from '@/features/world/WorldPage.vue'
import { PLACES, UTILITIES } from './places'
import WelcomePage from './WelcomePage.vue'

const built: Record<string, RouteRecordRaw['component']> = { tonight: TonightPage, world: WorldPage, compendium: CompendiumPage, party: PartyPage, data: DataPage, settings: SettingsPage }

const placeRoutes: RouteRecordRaw[] = [...PLACES, ...UTILITIES].map((p) => {
  const path = p.campaign ? `/c/:campaignId/${p.name}` : `/${p.name}`
  const component = built[p.name]
  return component
    ? { path, name: p.name, component, props: p.name === 'party' }
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
    { path: '/compendium/sync', name: 'compendium-sync', component: SyncPage },
    { path: '/compendium/homebrew', name: 'compendium-homebrew', component: HomebrewPage },
    { path: '/compendium/art', name: 'compendium-art', component: ArtPage },
    // Windows for the players: no shell, nothing of the GM's
    { path: '/player/map', name: 'player-map', component: PlayerMapPage, meta: { player: true } },
    { path: '/player/graph', name: 'player-graph', component: PlayerGraphPage, meta: { player: true } },
    { path: '/:rest(.*)*', redirect: '/' },
  ],
})
