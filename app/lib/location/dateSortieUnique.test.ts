import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * 🔴🔴 « UNE SEULE PORTE POUR LA SORTIE » (Arno, 18/10/2026) — UNE SEULE FONCTION ÉCRIT LA DATE DE SORTIE D'UNE OCCUPATION.
 *
 * `ecrireDateSortie` (`dateSortieOccupation.ts`) est la seule à écrire `gestion_annuaire_occupation.sortie`. Cette épreuve
 * lit TOUT le code de l'application (hors tests) et échoue si un autre fichier y écrit — par UPDATE … SET … sortie, ou par
 * un INSERT qui nomme la colonne. EXCEPTIONS, nommées ici et seulement elles : l'IMPORT WIPPIMMO (`annuaireRepo.ts`), qui
 * recopie l'export et n'est pas un geste de sortie ; et deux ÉPREUVES qui fabriquent un JEU D'ESSAI sur une base JETABLE
 * (`gestion_jetable` ou `svav_test_…` ; elles refusent de s'exécuter ailleurs) — ce sont des données d'essai, pas des sorties.
 */
const RACINES = ['app', 'scripts'];
const SEULE_PORTE = 'app/lib/location/dateSortieOccupation.ts';
const EXCEPTION_IMPORT = 'app/lib/gestion/annuaireRepo.ts';
const EPREUVES_JETABLES = ['app/scripts/rattachement-epreuve.ts', 'app/scripts/rattachement-auto-epreuve.ts'];

function fichiers(d: string): string[] {
  let l: string[] = [];
  let entrees: string[];
  try { entrees = readdirSync(d); } catch { return []; }
  for (const n of entrees) {
    if (n === 'node_modules' || n.startsWith('.')) continue;
    const p = join(d, n);
    if (statSync(p).isDirectory()) l = l.concat(fichiers(p));
    else if (/\.(ts|tsx|sql)$/.test(n) && !/\.(test|itest)\.tsx?$/.test(n)) l.push(p);
  }
  return l;
}

/** Les écritures de la colonne `sortie` d'une occupation, dans un texte. PUR. */
export function ecrituresDeSortie(src: string): string[] {
  const t = src.replace(/\s+/g, ' ');
  const maj = [...t.matchAll(/UPDATE gestion_annuaire_occupation\b[^`'"]*?\bSET\b[^`'"]*?\bsortie\s*=/gi)].map((m) => m[0]);
  const ins = [...t.matchAll(/INSERT INTO gestion_annuaire_occupation\s*\(([^)]*)\)/gi)].filter((m) => /\bsortie\b/.test(m[1])).map((m) => m[0]);
  return [...maj, ...ins];
}

describe('🔴 une seule fonction écrit la date de sortie d’une occupation', () => {
  const tous = RACINES.flatMap(fichiers).filter((f) => !f.startsWith('db/'));
  it('le code est bien lu', () => { expect(tous.length).toBeGreaterThan(500); });

  it('aucune écriture hors de la seule porte (et de l’import WIPPIMMO, nommé)', () => {
    const fautifs = tous.filter((f) => f !== SEULE_PORTE && f !== EXCEPTION_IMPORT && !EPREUVES_JETABLES.includes(f)
      && ecrituresDeSortie(readFileSync(f, 'utf8')).length > 0);
    expect(fautifs).toEqual([]);
  });

  it('la seule porte écrit bien, et l’import aussi (l’exception est réelle, pas un oubli)', () => {
    expect(ecrituresDeSortie(readFileSync(SEULE_PORTE, 'utf8')).length).toBeGreaterThanOrEqual(4);
    expect(ecrituresDeSortie(readFileSync(EXCEPTION_IMPORT, 'utf8')).length).toBeGreaterThan(0);
    for (const f of EPREUVES_JETABLES) expect(readFileSync(f, 'utf8'), f).toMatch(/REFUS[^\n]*(gestion_jetable|svav_test_)|ELLE REFUSE DE S'EXÉCUTER AILLEURS QUE SUR/);
  });

  it('le détecteur attrape bien une seconde implémentation', () => {
    expect(ecrituresDeSortie("await q(`UPDATE gestion_annuaire_occupation\n SET sortie = coalesce($2::date, now()) WHERE id = $1`)")).toHaveLength(1);
    expect(ecrituresDeSortie("INSERT INTO gestion_annuaire_occupation (wippimmo_id, entree, sortie) VALUES (…)")).toHaveLength(1);
    expect(ecrituresDeSortie("INSERT INTO gestion_annuaire_occupation (wippimmo_id, locataire_id, lot_id, entree) VALUES (…)")).toHaveLength(0);
  });

  it('le « départ » de la Gestion passe par LA fonction commune ; l’ancienne écriture a disparu', () => {
    const route = readFileSync(join('app', '(admin)', 'api', 'admin', 'gestion', 'annuaire', 'route.ts'), 'utf8');
    expect(route).toMatch(/enregistrerSortie\(\{ occupationId, sortants: \[occupationId\], date: date\(corps\.sortie\) \}, auteur\)/);
    expect(route).not.toMatch(/enregistrerDepart/);
    expect(readFileSync('app/lib/gestion/annuaireEditionRepo.ts', 'utf8')).not.toMatch(/export async function enregistrerDepart/);
    // La fonction commune passe, elle, par la seule porte.
    expect(readFileSync('app/lib/location/sortieLocatairesRepo.ts', 'utf8')).toMatch(/ecrireDateSortie\(q, ids, \{ mode: 'poser', date \}\)/);
  });
});
