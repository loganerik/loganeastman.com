import { useEffect, useState } from 'preact/hooks';
import { api, getConfig } from '../api';
import { toast } from '../ui/toast';

export interface ConfigFile { frontmatter: Record<string, unknown>; sha: string | null }
export interface Usage { collections: Record<string, number>; list_types: Record<string, number> }

/** Load one config file and its usage; save a subset of keys back, keeping the note body. */
export function useConfigFile(name: 'collections' | 'list-types' | 'site') {
  const [file, setFile] = useState<ConfigFile | null>(null);
  const [usage, setUsage] = useState<Usage>({ collections: {}, list_types: {} });
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const load = () => Promise.all([api<ConfigFile>(`/api/config/${name}`), api<Usage>('/api/config/usage')]).then(([f, u]) => { setFile(f); setUsage(u); }).catch((e) => setErr((e as Error).message));
  useEffect(() => { load(); }, [name]);
  const save = async (data: Record<string, unknown>): Promise<boolean> => {
    if (!file) return false;
    setBusy(true); setErr('');
    try {
      const r = await api<{ sha: string }>(`/api/config/${name}`, { method: 'PUT', body: JSON.stringify({ data, base_sha: file.sha ?? undefined }) });
      setFile({ frontmatter: { ...file.frontmatter, ...data }, sha: r.sha });
      await getConfig(true).catch(() => {});
      toast('Saved · the site picks it up on the next build');
      return true;
    } catch (e) { setErr((e as Error).message); return false; }
    finally { setBusy(false); }
  };
  return { file, usage, err, busy, save, reload: load };
}

export const slugKey = (s: string) => s.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
