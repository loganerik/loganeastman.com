// The vault's _config notes, read from GitHub and cached briefly in KV, so the worker files things
// by the same collections and list types the site renders.
import type { Env } from '../env';
import { parseNote, siteConfigSchema, collectionsConfigSchema, listTypesConfigSchema, type SiteConfig, type CollectionDef, type ListTypeDef } from '@lem/vault-core';
import { vaultFor } from './github';

export interface VaultConfig { site: SiteConfig; collections: CollectionDef[]; listTypes: ListTypeDef[] }

export async function loadVaultConfig(env: Env, opts: { fresh?: boolean } = {}): Promise<VaultConfig> {
  const key = `vault-config:${env.VAULT_BRANCH}`;
  if (!opts.fresh) {
    const hit = await env.KV.get<VaultConfig>(key, 'json').catch(() => null);
    if (hit) return hit;
  }
  const gh = vaultFor(env);
  const files = await gh.readMany(['_config/site.md', '_config/collections.md', '_config/list-types.md']);
  const fm = (p: string) => parseNote(files.get(p)?.text ?? '').frontmatter;
  const cfg: VaultConfig = {
    site: siteConfigSchema.parse({ type: 'config', title: 'Site', url: env.SITE_URL, ...fm('_config/site.md') }),
    collections: files.get('_config/collections.md') ? collectionsConfigSchema.parse(fm('_config/collections.md')).collections : [],
    listTypes: files.get('_config/list-types.md') ? listTypesConfigSchema.parse(fm('_config/list-types.md')).list_types : [],
  };
  await env.KV.put(key, JSON.stringify(cfg), { expirationTtl: 300 }).catch(() => {});
  return cfg;
}
