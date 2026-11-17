/**
 * Which build this is, and whether GitHub has something newer: the newest
 * commit on `main` (what the Pages deploy builds from) against the commit
 * this copy was built from.
 */
export const REPO = 'DarthAmun/StarTome'
export const REPO_PAGE = `https://github.com/${REPO}`

export const build = {
  version: __APP_VERSION__,
  commit: __APP_COMMIT__,
  short: __APP_COMMIT__.slice(0, 7),
  built: __APP_BUILT__,
}

export interface LatestCommit { sha: string; short: string; message: string; date: string; url: string }

export async function fetchLatestCommit(): Promise<LatestCommit> {
  const res = await fetch(`https://api.github.com/repos/${REPO}/commits/main`, { cache: 'no-store', headers: { Accept: 'application/vnd.github+json' } })
  if (!res.ok) throw new Error(res.status === 403 ? 'GitHub is limiting requests; try again in an hour' : `GitHub answered ${res.status}`)
  const c = await res.json() as { sha: string; html_url: string; commit: { message: string; committer?: { date?: string }; author?: { date?: string } } }
  return { sha: c.sha, short: c.sha.slice(0, 7), message: c.commit.message.split('\n')[0] ?? '', date: c.commit.committer?.date ?? c.commit.author?.date ?? '', url: c.html_url }
}

/**
 * 'same': this build is the newest commit. 'behind': GitHub has a commit made after this build.
 * 'other': a different commit, but not a newer one (a local build ahead of GitHub). 'unknown': this build does not know its commit.
 */
export function compareToLatest(latest: LatestCommit): 'same' | 'behind' | 'other' | 'unknown' {
  if (!build.commit) return 'unknown'
  if (latest.sha === build.commit) return 'same'
  return !latest.date || Date.parse(latest.date) > Date.parse(build.built) ? 'behind' : 'other'
}
