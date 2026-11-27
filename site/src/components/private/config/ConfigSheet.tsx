// "Manage collections" / "Manage list types" / site settings, right where you are: a sheet with a form, no YAML.
import { useEffect, useState } from 'preact/hooks';
import Sheet from '../ui/Sheet';
import CollectionsForm from './CollectionsForm';
import ListTypesForm from './ListTypesForm';
import SiteForm from './SiteForm';

export type ConfigName = 'collections' | 'list-types' | 'site';
const TITLES: Record<ConfigName, string> = { collections: 'Writing collections', 'list-types': 'Kinds of lists', site: 'Site settings' };

export default function ConfigSheet({ initial, page = false }: { initial?: ConfigName; page?: boolean }) {
  const [name, setName] = useState<ConfigName | null>(initial ?? null);
  useEffect(() => {
    const click = (e: MouseEvent) => { const b = (e.target as HTMLElement).closest<HTMLElement>('[data-config]'); if (!b) return; e.preventDefault(); setName(b.dataset.config as ConfigName); };
    document.addEventListener('click', click);
    return () => document.removeEventListener('click', click);
  }, []);
  const form = name === 'collections' ? <CollectionsForm onSaved={() => !page && setName(null)} /> : name === 'list-types' ? <ListTypesForm onSaved={() => !page && setName(null)} /> : name === 'site' ? <SiteForm onSaved={() => !page && setName(null)} /> : null;
  if (page) return <div class="config-page">{form}</div>;
  return <Sheet open={!!name} onClose={() => setName(null)} title={name ? TITLES[name] : ''} wide>{form}</Sheet>;
}
