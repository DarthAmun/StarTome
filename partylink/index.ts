/**
 * PartyLink entry point. `NoneLink` is the default: StarTome works fully
 * without a character app. The live Play Buddy link is built and owned by
 * composables/usePlayBuddy.ts, which also mirrors what it reads into the party.
 */
import { LinkUnavailableError, type PartyLink } from '~/partylink/port'

export * from '~/partylink/port'

/** No character app linked: reads come back empty, writes refuse. */
export const NoneLink: PartyLink = {
  id: 'none',
  capabilities: { status: false, offers: false, requests: false, catalog: false, live: false },
  async probe() { return { ok: false, reason: 'disabled' } },
  async game() { throw new LinkUnavailableError('none', 'Reading the game') },
  async status() { return [] },
  async sendOffer() { throw new LinkUnavailableError('none', 'Sending an offer') },
  async getOffer() { throw new LinkUnavailableError('none', 'Reading an offer') },
  async withdrawOffer() { throw new LinkUnavailableError('none', 'Withdrawing an offer') },
  async sendRequest() { throw new LinkUnavailableError('none', 'Sending a request') },
  async withdrawRequest() { throw new LinkUnavailableError('none', 'Withdrawing a request') },
  async searchCatalog() { return [] },
  async events() { return { events: [], lastSeq: 0, resetRequired: false } },
}
