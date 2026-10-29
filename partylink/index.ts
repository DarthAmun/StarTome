/**
 * The active PartyLink. Only `NoneLink` exists until the Play Buddy GM API
 * is settled (FEATURES_PLAN.md P6/P7); callers check `capabilities` first.
 */
import { LinkUnavailableError, type PartyLink } from '~/partylink/port'

export * from '~/partylink/port'

/** No character app linked: reads come back empty, writes refuse. */
export const NoneLink: PartyLink = {
  id: 'none',
  capabilities: { status: false, offers: false, catalog: false, rolls: false, live: false },
  async probe() { return { ok: false, reason: 'disabled' } },
  async listPlayers() { return [] },
  async getStatus() { throw new LinkUnavailableError('none', 'Reading a character') },
  async sendOffer() { throw new LinkUnavailableError('none', 'Sending an offer') },
  async getOffer() { throw new LinkUnavailableError('none', 'Reading an offer') },
  async withdrawOffer() { throw new LinkUnavailableError('none', 'Withdrawing an offer') },
  async searchCatalog() { return [] },
  async rollsSince() { return [] },
}

export function usePartyLink(): PartyLink {
  return NoneLink
}
