import { createRouter, createWebHashHistory, type RouteRecordRaw } from 'vue-router'
import DataPage from '@/features/data/DataPage.vue'
import SettingsPage from '@/features/settings/SettingsPage.vue'
import ComingPage from '@/features/shared/ComingPage.vue'
import TonightPage from '@/features/tonight/TonightPage.vue'
import EntryPage from '@/features/world/EntryPage.vue'
import WorldPage from '@/features/world/WorldPage.vue'
import { PLACES, UTILITIES } from './places'
import WelcomePage from './WelcomePage.vue'

const built: Record<string, RouteRecordRaw['component']> = { tonight: TonightPage, world: WorldPage, data: DataPage, settings: SettingsPage }

const placeRoutes: RouteRecordRaw[] = [...PLACES, ...UTILITIES].map((p) => {
  const path = p.campaign ? `/c/:campaignId/${p.name}` : `/${p.name}`
  const component = built[p.name]
  return component
    ? { path, name: p.name, component }
    : { path, name: p.name, component: ComingPage, props: { title: p.label, phase: p.phase ?? 0, holds: p.holds } }
})

export const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: '/', name: 'welcome', component: WelcomePage },
    ...placeRoutes,
    { path: '/c/:campaignId/world/:entryId', name: 'entry', component: EntryPage, props: true },
    { path: '/:rest(.*)*', redirect: '/' },
  ],
})
