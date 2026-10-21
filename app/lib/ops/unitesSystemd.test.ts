import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

// Arrêts propres comptés comme des pannes (15/10/2026) : les unités doivent dire à systemd comment s'arrêter.
const dossier = path.join(process.cwd(), 'deploy/systemd');
const gabarits = readdirSync(dossier).filter((n) => n.endsWith('.service.in'))
  .map((n) => ({ nom: n, texte: readFileSync(path.join(dossier, n), 'utf8') }));
const directive = (texte: string, cle: string) => texte.split('\n').filter((l) => l.startsWith(`${cle}=`)).map((l) => l.slice(cle.length + 1));

describe('gabarits systemd — arrêt propre', () => {
  it('tout script lancé DIRECTEMENT par tsx a KillMode=mixed (SIGTERM au seul processus principal)', () => {
    const tsxDirect = gabarits.filter((g) => directive(g.texte, 'ExecStart').some((e) => e.startsWith('@NODE@ ') && e.includes('tsx/dist/cli.mjs')));
    expect(tsxDirect.map((g) => g.nom).sort()).toEqual([
      'svav-analytics-maintenance.service.in', 'svav-archivage-fins.service.in', 'svav-drive-empreintes.service.in', 'svav-gestion-continu.service.in', 'svav-veille.service.in',
    ]);
    for (const g of tsxDirect) expect(directive(g.texte, 'KillMode'), g.nom).toEqual(['mixed']);
  });

  it('les unités lancées sous flock gardent le KillMode par défaut (mixed tuerait flock seul et laisserait le script orphelin)', () => {
    const sousFlock = gabarits.filter((g) => directive(g.texte, 'ExecStart').some((e) => e.startsWith('/usr/bin/flock ')));
    expect(sousFlock.length).toBeGreaterThan(0);
    for (const g of sousFlock) expect(directive(g.texte, 'KillMode'), g.nom).toEqual([]);
  });

  it('svav-next accepte 143 (sortie volontaire de next start sur SIGTERM), et rien d’autre', () => {
    const next = gabarits.find((g) => g.nom === 'svav-next.service.in');
    expect(directive(next!.texte, 'SuccessExitStatus')).toEqual(['143']);
    for (const g of gabarits.filter((x) => x.nom !== 'svav-next.service.in')) expect(directive(g.texte, 'SuccessExitStatus'), g.nom).toEqual([]);
  });
});
