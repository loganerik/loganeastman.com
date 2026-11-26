// The vault repo on GitHub, read through GraphQL, written with createCommitOnBranch (atomic, verified,
// optimistic via expectedHeadOid). Every write re-reads the file at head and patches it, never overwrites blindly.
export interface Blob { text: string; sha: string }
export interface CommitInput { message: string; additions: Array<{ path: string; contents: string }>; deletions: Array<{ path: string }>; expectedHeadOid: string }

export class GitHubError extends Error {
  constructor(message: string, public status: number, public code?: string) {
    super(message);
  }
}

export class GitHubVault {
  private fetchImpl: typeof fetch;
  constructor(private token: string, public repo: string, public branch: string, fetchImpl?: typeof fetch, private api = 'https://api.github.com') {
    this.fetchImpl = fetchImpl ?? ((input, init) => fetch(input, init));
  }

  private get owner() { return this.repo.split('/')[0]!; }
  private get name() { return this.repo.split('/')[1]!; }

  async graphql<T>(query: string, variables: Record<string, unknown>): Promise<T> {
    const res = await this.fetchImpl(`${this.api}/graphql`, {
      method: 'POST',
      headers: { authorization: `Bearer ${this.token}`, 'content-type': 'application/json', 'user-agent': 'loganeastman-worker' },
      body: JSON.stringify({ query, variables }),
    });
    if (!res.ok) throw new GitHubError(`github graphql ${res.status}`, res.status);
    const body = (await res.json()) as { data?: T; errors?: Array<{ message: string; type?: string }> };
    if (body.errors?.length) {
      const e = body.errors[0]!;
      throw new GitHubError(e.message, 422, e.type);
    }
    return body.data as T;
  }

  async rest<T>(path: string, init: RequestInit = {}): Promise<T> {
    const res = await this.fetchImpl(`${this.api}${path}`, {
      ...init,
      headers: { authorization: `Bearer ${this.token}`, accept: 'application/vnd.github+json', 'user-agent': 'loganeastman-worker', ...(init.headers ?? {}) },
    });
    if (!res.ok) throw new GitHubError(`github ${path} ${res.status}`, res.status);
    return (res.status === 204 ? null : await res.json()) as T;
  }

  async head(): Promise<string> {
    const d = await this.graphql<{ repository: { ref: { target: { oid: string } } | null } }>(
      `query($o:String!,$n:String!,$r:String!){repository(owner:$o,name:$n){ref(qualifiedName:$r){target{oid}}}}`,
      { o: this.owner, n: this.name, r: `refs/heads/${this.branch}` },
    );
    if (!d.repository.ref) throw new GitHubError(`branch ${this.branch} not found`, 404);
    return d.repository.ref.target.oid;
  }

  /** Read several files at a given ref in one request. Missing files map to null. */
  async readMany(paths: string[], ref = this.branch): Promise<Map<string, Blob | null>> {
    const out = new Map<string, Blob | null>();
    if (paths.length === 0) return out;
    const fields = paths.map((p, i) => `f${i}: object(expression: ${JSON.stringify(`${ref}:${p}`)}) { ... on Blob { text oid } }`).join('\n');
    const d = await this.graphql<{ repository: Record<string, { text: string; oid: string } | null> }>(
      `query($o:String!,$n:String!){repository(owner:$o,name:$n){ ${fields} }}`,
      { o: this.owner, n: this.name },
    );
    paths.forEach((p, i) => {
      const b = d.repository[`f${i}`];
      out.set(p, b ? { text: b.text, sha: b.oid } : null);
    });
    return out;
  }

  async readFile(path: string, ref = this.branch): Promise<Blob | null> {
    return (await this.readMany([path], ref)).get(path) ?? null;
  }

  /** All .md paths in the branch (recursive tree). */
  async listMarkdown(): Promise<Array<{ path: string; sha: string }>> {
    const t = await this.rest<{ tree: Array<{ path: string; type: string; sha: string }>; truncated: boolean }>(`/repos/${this.repo}/git/trees/${encodeURIComponent(this.branch)}?recursive=1`);
    return t.tree.filter((e) => e.type === 'blob' && (e.path.endsWith('.md') || e.path === '_media/index.json'));
  }

  async commit(input: CommitInput): Promise<{ oid: string }> {
    const enc = (s: string) => btoa(unescape(encodeURIComponent(s)));
    const d = await this.graphql<{ createCommitOnBranch: { commit: { oid: string } } }>(
      `mutation($in: CreateCommitOnBranchInput!){ createCommitOnBranch(input:$in){ commit { oid } } }`,
      {
        in: {
          branch: { repositoryNameWithOwner: this.repo, branchName: this.branch },
          expectedHeadOid: input.expectedHeadOid,
          message: { headline: input.message.split('\n')[0], body: input.message.split('\n').slice(1).join('\n').trim() || undefined },
          fileChanges: { additions: input.additions.map((a) => ({ path: a.path, contents: enc(a.contents) })), deletions: input.deletions },
        },
      },
    );
    return { oid: d.createCommitOnBranch.commit.oid };
  }

  /** Has a commit carrying this trailer value already landed on the branch? (checked before retrying a write) */
  async findCommitByTrailer(key: string, value: string): Promise<string | null> {
    const commits = await this.rest<Array<{ sha: string; commit: { message: string } }>>(`/repos/${this.repo}/commits?sha=${encodeURIComponent(this.branch)}&per_page=50`);
    const needle = `${key}: ${value}`;
    return commits.find((c) => c.commit.message.includes(needle))?.sha ?? null;
  }

  async dispatch(repo: string, eventType: string, payload: Record<string, unknown> = {}): Promise<void> {
    await this.rest(`/repos/${repo}/dispatches`, { method: 'POST', body: JSON.stringify({ event_type: eventType, client_payload: payload }), headers: { 'content-type': 'application/json' } });
  }

  /** Ensure a branch exists (dev writes go to a side branch). */
  async ensureBranch(from = 'main'): Promise<void> {
    try {
      await this.head();
      return;
    } catch (e) {
      if (!(e instanceof GitHubError) || e.status !== 404) throw e;
    }
    const base = await this.rest<{ object: { sha: string } }>(`/repos/${this.repo}/git/ref/heads/${encodeURIComponent(from)}`);
    await this.rest(`/repos/${this.repo}/git/refs`, { method: 'POST', body: JSON.stringify({ ref: `refs/heads/${this.branch}`, sha: base.object.sha }), headers: { 'content-type': 'application/json' } });
  }
}

export function vaultFor(env: { GITHUB_TOKEN?: string; VAULT_REPO: string; VAULT_BRANCH: string; GITHUB_API_URL?: string }): GitHubVault {
  if (!env.GITHUB_TOKEN) throw new Error('GITHUB_TOKEN is not set');
  return new GitHubVault(env.GITHUB_TOKEN, env.VAULT_REPO, env.VAULT_BRANCH || 'main', undefined, env.GITHUB_API_URL || 'https://api.github.com');
}
