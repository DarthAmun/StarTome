/** How each entry type is named and drawn, in one place. */
import { BookOpen, Castle, Dices, Flag, Hexagon, Hourglass, MessageCircle, ScrollText, Shield, User } from 'lucide-vue-next'
import type { Component } from 'vue'
import type { EntryType } from '@/domain/schema'

export interface EntryTypeInfo { label: string; plural: string; icon: Component; color: string }

export const ENTRY_TYPE_INFO: Record<EntryType, EntryTypeInfo> = {
  npc: { label: 'NPC', plural: 'NPCs', icon: User, color: 'var(--t-npc)' },
  location: { label: 'Location', plural: 'Locations', icon: Castle, color: 'var(--t-location)' },
  faction: { label: 'Faction', plural: 'Factions', icon: Shield, color: 'var(--t-faction)' },
  quest: { label: 'Quest', plural: 'Quests', icon: Flag, color: 'var(--t-quest)' },
  session: { label: 'Session', plural: 'Sessions', icon: BookOpen, color: 'var(--t-session)' },
  event: { label: 'Event', plural: 'Events', icon: Hourglass, color: 'var(--t-event)' },
  note: { label: 'Note', plural: 'Notes', icon: ScrollText, color: 'var(--t-note)' },
  rumor: { label: 'Rumor', plural: 'Rumors', icon: MessageCircle, color: 'var(--t-rumor)' },
  'random-table': { label: 'Random table', plural: 'Random tables', icon: Dices, color: 'var(--t-random-table)' },
  region: { label: 'Region', plural: 'Regions', icon: Hexagon, color: 'var(--t-region)' },
}

/** The order types are listed in. */
export const ENTRY_TYPE_ORDER: EntryType[] = ['npc', 'location', 'faction', 'quest', 'event', 'rumor', 'note', 'random-table', 'region', 'session']

export function isEntryType(v: string): v is EntryType {
  return v in ENTRY_TYPE_INFO
}
