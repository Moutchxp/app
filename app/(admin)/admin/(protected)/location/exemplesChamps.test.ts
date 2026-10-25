import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * 🔴 « Exemples des champs (texte gris) : préfixer par “ex.” — harmoniser tous les exemples de la tuile Location. » (Arno,
 * 18/10/2026). Tout texte d'exemple (`placeholder`) des écrans de la Location, et des parties de la Gestion qu'elle affiche
 * (section « Location » de la fiche commune, détail du syndic), commence par « ex. ». Seules exceptions : les CONSIGNES des
 * moteurs de recherche (« Chercher un propriétaire : … »), qui ne sont pas des exemples.
 */
const FICHIERS = (() => {
  const l: string[] = [];
  const parcourir = (d: string): void => {
    for (const n of readdirSync(d)) {
      const p = join(d, n);
      if (statSync(p).isDirectory()) parcourir(p);
      else if (/\.tsx$/.test(n) && !/\.test\.tsx$/.test(n)) l.push(p);
    }
  };
  parcourir('app/(admin)/admin/(protected)/location');
  return [...l, 'app/(admin)/admin/(protected)/gestion/SectionsLocationFiche.tsx', 'app/(admin)/admin/(protected)/gestion/SyndicConnuLocation.tsx'];
})();
const CONSIGNES = [/^Chercher un propriétaire/, /^Chercher un apporteur/, /^Propriétaire, locataire, syndic/, /^Propriétaire : nom, prénom/, /^Chercher un locataire occupant/];

describe('🔴 tuile Location : les exemples des champs commencent par « ex. »', () => {
  const trouves = FICHIERS.flatMap((f) => [...readFileSync(f, 'utf8').matchAll(/(?:placeholder|exemple)(?:=|: *)(?:\{)?(["'])((?:(?!\1).)*)\1/g)].map((m) => ({ f, t: m[2] })));
  it('les exemples sont bien trouvés', () => { expect(trouves.length).toBeGreaterThanOrEqual(12); });
  it('chacun commence par « ex. » (hors consignes de recherche)', () => {
    expect(trouves.filter(({ t }) => !t.startsWith('ex. ') && !CONSIGNES.some((r) => r.test(t))).map(({ f, t }) => `${f} : « ${t} »`)).toEqual([]);
  });
});
