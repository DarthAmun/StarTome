/** Relationship graphs: named sets of entries with positions, and the connections drawn by hand between entries. */
import { newId } from '@/domain/ids'
import { zGraph, zGraphEdge, type Graph, type GraphEdge, type Link } from '@/domain/schema'
import { getDb } from './db'

export const graphs = {
  ofCampaign: (campaignId: string): Promise<Graph[]> => getDb().rows('graphs').where('campaignId').equals(campaignId).sortBy('name'),
  get: (id: string) => getDb().rows('graphs').get(id),
  async create(campaignId: string, name: string): Promise<Graph> {
    const g = zGraph.parse({ id: newId(), campaignId, name: name.trim() || 'New graph' })
    await getDb().rows('graphs').put(g)
    return g
  },
  rename: (id: string, name: string) => getDb().rows('graphs').update(id, { name: name.trim() || 'Graph' }),
  remove: (id: string) => getDb().rows('graphs').delete(id),
  /** Changes one graph; `change` gets the stored graph, so two quick edits never overwrite each other. */
  async patch(id: string, change: (g: Graph) => void): Promise<void> {
    await getDb().rows('graphs').where('id').equals(id).modify((g) => { change(g) })
  },
  edges: (campaignId: string): Promise<GraphEdge[]> => getDb().rows('graphEdges').where('campaignId').equals(campaignId).toArray(),
  async saveEdge(edge: Partial<GraphEdge> & { campaignId: string; sourceEntryId: string; targetEntryId: string }): Promise<void> {
    await getDb().rows('graphEdges').put(zGraphEdge.parse({ id: newId(), ...edge }))
  },
  removeEdge: (id: string) => getDb().rows('graphEdges').delete(id),
  /** Text links between a set of entries: the "mention" edges. */
  async mentions(entryIds: string[]): Promise<Link[]> {
    const set = new Set(entryIds)
    const links = await getDb().rows('links').where('sourceId').anyOf(entryIds).toArray()
    return links.filter(l => l.targetEntryId !== null && set.has(l.targetEntryId) && l.targetEntryId !== l.sourceId)
  },
}
