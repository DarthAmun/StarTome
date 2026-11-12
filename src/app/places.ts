/** The places of the app: what the rail shows and the command bar can go to. */
import { BookOpen, Database, Library, LayoutDashboard, Music, Globe, Settings, Sunrise, Swords, Users } from 'lucide-vue-next'
import type { Component } from 'vue'

export interface Place {
  name: string
  label: string
  icon: Component
  /** Needs an open campaign. */
  campaign: boolean
  /** The rework phase that builds it; null = built. */
  phase: number | null
  holds: string
  aliases: string[]
}

export const PLACES: Place[] = [
  { name: 'tonight', label: 'Tonight', icon: Sunrise, campaign: true, phase: null, holds: 'The session in hand, open quests, the party.', aliases: ['home', 'dashboard', 'overview'] },
  { name: 'world', label: 'World', icon: Globe, campaign: true, phase: null, holds: 'Every lore entry, maps, graphs and the timeline.', aliases: ['npcs', 'locations', 'factions', 'quests', 'notes', 'rumors', 'events', 'regions', 'entries', 'lore'] },
  { name: 'sessions', label: 'Sessions', icon: BookOpen, campaign: true, phase: 6, holds: 'Session boards, capture while you play, recap and review, the session log.', aliases: ['board', 'log'] },
  { name: 'encounters', label: 'Encounters', icon: Swords, campaign: true, phase: 5, holds: 'Encounter list and builder, the battle map with tokens, fog, walls and combat, the map maker.', aliases: ['battle', 'combat', 'vtt', 'builder', 'map maker'] },
  { name: 'party', label: 'Party', icon: Users, campaign: true, phase: 4, holds: 'Roster, levels and XP, inventory, wealth, the starship, the character-app link.', aliases: ['inventory', 'wealth', 'loot', 'starship', 'play buddy'] },
  { name: 'compendium', label: 'Compendium', icon: Library, campaign: false, phase: 3, holds: 'Items, creatures, spells and every other rules entry with stat blocks and rolls; Foundry sync and homebrew import.', aliases: ['rules', 'items', 'creatures', 'spells', 'feats', 'sync', 'homebrew'] },
  { name: 'desk', label: 'Desk', icon: LayoutDashboard, campaign: true, phase: 6, holds: 'The widget board for the table: timers, DCs, tables, pinned entries.', aliases: ['gm screen', 'widgets'] },
]

export const UTILITIES: Place[] = [
  { name: 'sounds', label: 'Sounds', icon: Music, campaign: false, phase: 6, holds: 'Tracks, playlists and the player.', aliases: ['music', 'playlists'] },
  { name: 'data', label: 'Import & Backup', icon: Database, campaign: false, phase: null, holds: 'Bring data over from v0.42, back up, restore.', aliases: ['export', 'import', 'backup', 'restore'] },
  { name: 'settings', label: 'Settings', icon: Settings, campaign: false, phase: null, holds: 'Mode, accent, size.', aliases: ['preferences', 'theme'] },
]
