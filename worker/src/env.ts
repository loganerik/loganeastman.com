export interface Env {
  ASSETS: Fetcher;
  DB: D1Database;
  MEDIA: R2Bucket;
  KV: KVNamespace;
  VAULT_WRITER: DurableObjectNamespace;
  PROCESSOR: DurableObjectNamespace;
  IMAGES?: ImagesBinding;
  // vars
  ENVIRONMENT: string;
  SITE_URL: string;
  VAULT_REPO: string;
  VAULT_BRANCH: string;
  SITE_REPO: string;
  OWNER_EMAIL: string;
  LLM_PROVIDER: string;
  OPENAI_MODEL: string;
  OPENAI_IMAGE_MODEL?: string;
  BUILTIN_FALLBACK_AFTER_MIN: string;
  // secrets
  DEV_BYPASS_ACCESS?: string;
  GITHUB_TOKEN?: string;
  GITHUB_WEBHOOK_SECRET?: string;
  ACCESS_TEAM_DOMAIN?: string;
  ACCESS_AUD?: string;
  TOKEN_PEPPER?: string;
  OPENAI_API_KEY?: string;
  TMDB_TOKEN?: string;
  REPLICATE_TOKEN?: string;
  CLIP_MODEL?: string;
  CF_ZONE_ID?: string;
  CF_PURGE_TOKEN?: string;
  // dev-only upstream overrides (mock servers)
  GITHUB_API_URL?: string;
  TMDB_BASE_URL?: string;
  TMDB_IMAGE_URL?: string;
  PAGE_PROXY_URL?: string;
  OPENLIBRARY_BASE_URL?: string;
  MUSICBRAINZ_BASE_URL?: string;
}

export type Principal = { kind: 'owner'; email: string } | { kind: 'agent'; id: string; name: string; scopes: string[] } | { kind: 'builtin' };

export type Vars = { principal?: Principal };
export type AppEnv = { Bindings: Env; Variables: Vars };
