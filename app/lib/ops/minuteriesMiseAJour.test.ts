import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * 🔴 Arno (22/10/2026) — une mise à jour de la prod met en pause, puis relance, TOUTES les minuteries de l'application : aucune
 * passe (veille, Drive, surveillance, analytics, archivage des fins de gestion) ne tourne pendant que les migrations passent.
 * Le garde : chaque `*.timer` livré dans `deploy/systemd/` figure dans la liste `MINUTERIES` de `deploy/maj/serveur.sh`.
 */
describe('🔴 les minuteries mises en pause pendant une mise à jour', () => {
  const src = readFileSync('deploy/maj/serveur.sh', 'utf8');
  const liste = (/^MINUTERIES=\(([^)]*)\)/m.exec(src)?.[1] ?? '').trim().split(/\s+/);
  const timers = readdirSync('deploy/systemd').filter((f) => f.endsWith('.timer')).map((f) => f.replace(/\.timer$/, '')).sort();

  it('l’archivage des fins de gestion y est, avec les quatre d’avant', () => {
    expect(liste).toEqual(['svav-veille', 'svav-drive-empreintes', 'svav-surveillance', 'svav-analytics-maintenance', 'svav-archivage-fins']);
  });
  it('chaque minuterie livrée dans deploy/systemd est dans la liste (aucune oubliée), et rien d’autre', () => {
    expect([...liste].sort()).toEqual(timers);
  });
  it('la même liste sert à la pause, à l’attente des passes en cours et à la relance', () => {
    expect(src).toContain('for m in "${MINUTERIES[@]}"; do systemctl stop "$m.timer" < /dev/null; done; PAUSE=1');
    expect(src).toContain('for m in "${MINUTERIES[@]}"; do systemctl start "$m.timer" < /dev/null; done');
    expect(src).toContain('for m in "${MINUTERIES[@]}"; do [[ $(systemctl is-active "$m.service" < /dev/null) == activ* ]] && encours+=("$m"); done');
  });
});
