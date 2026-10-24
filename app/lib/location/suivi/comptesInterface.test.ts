import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * 🔴 Arno (24/10/2026) — UN COLLÈGUE = TOUTE PERSONNE QUI A UN COMPTE D'ACCÈS À L'INTERFACE, quels que soient ses droits et ses tuiles
 * (Location, Gestion, administrateur, ou aucune). Une seule fonction serveur (`lireComptesInterface`) ; toutes les listes de collègues
 * la lisent ; seul un compte désactivé est retiré par la liste (sauf s'il est déjà la valeur enregistrée : « compte désactivé »).
 * Base simulée : la requête est inspectée, et elle rend tous les comptes qu'on lui donne.
 */
vi.mock('server-only', () => ({}));
const lues: string[] = [];
// Des comptes de tous profils (fictifs) : administrateur, Gestion seule, Location seule, AUCUNE tuile, et un compte désactivé.
const COMPTES = [
  { id: '2', libelle: 'Admin Fictif', actif: true },
  { id: '5', libelle: 'Gestion Seule', actif: true },
  { id: '6', libelle: 'Location Seule', actif: true },
  { id: '7', libelle: 'Aucune Tuile', actif: true },
  { id: '3', libelle: 'Ancien Compte', actif: false },
];
const query = vi.fn(async (sql: string) => { lues.push(sql.replace(/\s+/g, ' ')); return { rows: COMPTES, rowCount: COMPTES.length }; });
vi.mock('../../db/client', () => ({ query, withTransaction: vi.fn() }));
vi.mock('../sondeLocation', () => ({ colonneExisteMemo: async () => true }));
const { lireComptesInterface } = await import('./suiviRepo');
beforeEach(() => { lues.length = 0; });

describe('🔴 lireComptesInterface : tous les comptes, sans filtre', () => {
  it('un compte sans aucune tuile, un compte Gestion seule, un administrateur — et le désactivé, marqué (la liste ne le propose pas)', async () => {
    const c = await lireComptesInterface();
    expect(c.map((x) => x.libelle)).toEqual(['Admin Fictif', 'Gestion Seule', 'Location Seule', 'Aucune Tuile', 'Ancien Compte']);
    expect(c.find((x) => x.libelle === 'Ancien Compte')?.actif).toBe(false);
    expect(c.filter((x) => x.actif).map((x) => x.id)).toEqual([2, 5, 6, 7]);
  });
  it('la requête ne filtre ni par profil, ni par droit, ni par tuile (aucun WHERE)', async () => {
    await lireComptesInterface();
    expect(lues).toHaveLength(1);
    expect(lues[0]).toContain('FROM admin_utilisateur u');
    expect(lues[0]).not.toMatch(/\bWHERE\b/i);
    expect(lues[0]).not.toMatch(/perm_|service_gestion|role\s*=/);
  });
});

// ── Garde : toutes les listes de collègues lisent la même fonction ──────────────────────────────────────────────────────────
const RACINE = join(__dirname, '../../../..');
const ECRANS = join(RACINE, 'app/(admin)/admin/(protected)/location');
const lire = (f: string): string => readFileSync(f, 'utf8');

describe('🔴 toutes les listes de collègues utilisent les comptes de l’interface', () => {
  it('côté serveur : la liste `collegues` de l’annuaire et de la feuille du mois vient de lireComptesInterface', () => {
    const route = lire(join(RACINE, 'app/(admin)/api/admin/location/suivi/route.ts')).replace(/\s+/g, ' ');
    const tableau = lire(join(__dirname, 'tableauBordRepo.ts')).replace(/\s+/g, ' ');
    // Même ordre dans le Promise.all que dans la déstructuration : `collegues` ← lireComptesInterface().
    for (const src of [route, tableau]) {
      const noms = /const \[([^\]]+)\] = await Promise\.all\(\[/.exec(src.slice(src.indexOf('collegues') - 400))?.[1]?.split(',').map((x) => x.trim()) ?? [];
      const appels = src.slice(src.indexOf('await Promise.all([', src.indexOf('collegues') - 400)).split(']);')[0];
      const rang = noms.indexOf('collegues');
      expect(rang).toBeGreaterThanOrEqual(0);
      const liste = appels.replace('await Promise.all([', '').split(/,(?![^(]*\))/).map((x) => x.trim()).filter(Boolean);
      expect(liste[rang]).toBe('lireComptesInterface()');
    }
    // Plus aucune autre lecture d'une liste de comptes « collègues » (lireNegociateurs garde sa règle : Location OU administrateur).
    expect(lire(join(__dirname, 'suiviRepo.ts'))).not.toMatch(/lireCollegues/);
  });
  it('côté écran : chaque liste « Collègue » / « Compte de l’interface » prend ses choix dans `collegues` (ou `comptes`, qui en vient)', () => {
    const fichiers = readdirSync(ECRANS).filter((f) => f.endsWith('.tsx') && !f.includes('.test.'));
    let vues = 0;
    for (const f of fichiers) {
      const src = lire(join(ECRANS, f));
      for (const m of src.matchAll(/<ListeChoix options=\{([^}]*(?:\{[^}]*\}[^}]*)*)\}[^>]*libelle="([^"]*)"/g)) {
        if (!/Collègue|Compte de l’/.test(m[2])) continue;
        vues += 1;
        expect(m[1], `${f} — ${m[2]}`).toMatch(/\bcollegues\b|^options$/);
      }
    }
    expect(vues).toBeGreaterThanOrEqual(6);
    // « options » (Passer en interne) = les comptes `comptes`, que l'annuaire lui passe depuis `lu.collegues`.
    expect(lire(join(ECRANS, 'PanneauxApporteur.tsx'))).toMatch(/const options = comptes\.map/);
    expect(lire(join(ECRANS, 'OngletsSuivi.tsx'))).toMatch(/comptes=\{lu\.collegues\}/);
  });
});
