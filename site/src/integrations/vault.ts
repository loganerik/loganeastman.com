// Build-time integration: after the static build, (1) write dist/public-manifest.json listing every /m/ media
// URL referenced from a public page, and (2) fail the build if any private record's id or URL leaked into dist/.
import type { AstroIntegration } from 'astro';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getIndex } from '../loaders/index';

async function walk(dir: string, out: string[] = []): Promise<string[]> {
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) await walk(p, out);
    else if (/\.(html|xml|json|txt)$/.test(e.name)) out.push(p);
  }
  return out;
}

export default function vault(): AstroIntegration {
  return {
    name: 'vault',
    hooks: {
      'astro:build:done': async ({ dir, logger }) => {
        const dist = fileURLToPath(dir);
        const idx = await getIndex();
        const files = await walk(dist);
        const media = new Set<string>();
        const leaks: string[] = [];
        const privates = idx.records.filter((r) => !r.public).map((r) => ({ id: r.data.id, path: r.path }));
        for (const f of files) {
          if (f.endsWith('public-manifest.json')) continue;
          const text = await readFile(f, 'utf8');
          for (const m of text.matchAll(/\/m\/(med_[0-9a-z]{12})\/([a-z]+-[0-9a-f]{8}\.[a-z0-9]+)/g)) media.add(`${m[1]}/${m[2]}`);
          for (const p of privates) if (text.includes(p.id)) leaks.push(`${path.relative(dist, f)} contains private id ${p.id} (${p.path})`);
        }
        const manifest = { generated: new Date().toISOString(), records: Object.fromEntries(idx.records.filter((r) => r.public).map((r) => [r.data.id, r.path])), media: [...media].sort() };
        await writeFile(path.join(dist, 'public-manifest.json'), JSON.stringify(manifest, null, 2));
        logger.info(`public manifest: ${Object.keys(manifest.records).length} records, ${media.size} media urls`);
        if (idx.errors.length) for (const e of idx.errors) logger.warn(`vault: ${e.file}: ${e.error.split('\n')[0]}`);
        if (leaks.length) {
          for (const l of leaks) logger.error(l);
          throw new Error(`private content leaked into the build (${leaks.length})`);
        }
      },
    },
  };
}
