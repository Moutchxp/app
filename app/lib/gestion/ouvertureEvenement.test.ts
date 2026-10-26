import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { jourParis, MOT_OUVERTURE_NON_MODIFIABLE, sqlJamaisDansLeFutur } from './ouvertureEvenement';

/**
 * 🔴 Arno (23/10/2026, option A) — « un événement a pour date d'ouverture la date (et l'heure) de sa CRÉATION. Elle n'est plus
 * saisie ni modifiable. […] Aucune ouverture ne peut être datée dans le futur, ni par l'écran, ni par l'API, ni par un script,
 * ni par un mail entrant. » Base SIMULÉE : rien n'est écrit.
 */
const emis: { sql: string; params: unknown[] }[] = [];
vi.mock('../db/client', () => {
  const query = async (sql: string, params: unknown[] = []) => {
    emis.push({ sql, params });
    if (sql.includes('INSERT INTO gestion_compteur')) return { rows: [{ dernier: 10 }], rowCount: 1 };
    if (sql.includes('INSERT INTO gestion_evenement')) return { rows: [{ id: 10 }], rowCount: 1 };
    if (sql.includes('FROM gestion_fil')) return { rows: [{ id: 3, etat: 'a_classer' }], rowCount: 1 };
    if (sql.includes('INSERT INTO gestion_monga_etape')) return { rows: [{ id: '501' }], rowCount: 1 };
    if (sql.includes('AS ouvert')) return { rows: [{ ouvert: false }], rowCount: 1 };
    if (sql.includes(')::text AS t')) return { rows: [{ t: String(params[2]) }], rowCount: 1 };
    if (sql.includes('min(survenu_le)::text AS premier')) return { rows: [{ premier: '2026-11-02 12:00:00+01' }], rowCount: 1 };
    if (sql.includes('FROM gestion_evenement WHERE id = $1 FOR UPDATE')) return { rows: [{ id: String(params[0]) }], rowCount: 1 };
    return { rows: [], rowCount: 0 };
  };
  return { query, withTransaction: async (fn: (q: typeof query) => unknown) => fn(query) };
});
vi.mock('./schema', async (orig) => ({ ...(await orig<typeof import('./schema')>()), evenementQualifieDisponible: async () => true }));
const gestes = await import('./gestes');
const repo = await import('./mongaEtapeRepo');
beforeEach(() => { emis.length = 0; });
const norm = (s: string) => s.replace(/\s+/g, ' ');

describe('🔴 la création : l’ouverture est l’instant de la création, toute date fournie est ignorée', () => {
  it('une ouverture au 02/11/2026 envoyée à la création n’est PAS écrite : le paramètre part NULL ⇒ now()', async () => {
    await gestes.affecter(3, { nouveau: { objet: 'Avis de passage désinsectisation', ouvertLe: '2026-11-02', closLe: null } as never },
      { id: 1, libelle: 'arno' }).catch(() => undefined);
    const ins = emis.find((e) => e.sql.includes('INSERT INTO gestion_evenement'))!;
    expect(norm(ins.sql)).toContain("coalesce(((");
    expect(norm(ins.sql)).toContain(", now()),");
    expect(ins.params).not.toContain('2026-11-02');
    expect(ins.params[9]).toBeNull();   // la place de l'ouverture : NULL ⇒ coalesce(…, now())
  });
  it('une date de clôture se juge contre le jour de la création (elle ne peut pas le précéder)', () => {
    const src = readFileSync('app/lib/gestion/gestes.ts', 'utf8');
    expect(src).toContain('const bornes = bornesEvenement(jourDeCreation(), n.closLe);');
    expect(jourParis(new Date('2026-10-23T22:30:00Z'))).toBe('2026-10-24');
  });
});

describe('🔴 « Corriger la date d’ouverture » n’existe plus : refusé, et rien n’est écrit', () => {
  it('le dépôt refuse, avec la phrase qui dit où noter une date à venir', async () => {
    expect(await gestes.deplacerOuvertureEvenement(10, '2026-11-02', { id: 1, libelle: 'arno' }))
      .toEqual({ ok: false, motif: MOT_OUVERTURE_NON_MODIFIABLE });
    expect(emis).toHaveLength(0);
    expect(MOT_OUVERTURE_NON_MODIFIABLE).toContain('ajoutez une carte « RDV intervention »');
  });
  it('la route PATCH de la frise rend ce refus (409) : l’API est verrouillée comme l’écran', () => {
    const route = readFileSync('app/(admin)/api/admin/gestion/evenements/[id]/frise/route.ts', 'utf8');
    expect(route).toContain('const issue = await deplacerOuvertureEvenement(evenementId, jour, auteur);');
    expect(route).toContain('if (!issue.ok) return Response.json({ erreur: issue.motif }, { status: 409 });');
  });
});

describe('🔴 le verrou : aucune ouverture n’est datée dans le futur (écran, API, script, mail entrant)', () => {
  it('le verrou SQL : LEAST(…, now())', () => {
    expect(sqlJamaisDansLeFutur('$3::timestamptz')).toBe('LEAST($3::timestamptz, now())');
  });
  it('une carte Ouverture posée à la main (écran / API) : bornée à maintenant', async () => {
    await repo.ajouterEtapeManuelle({ evenementId: 10, type: 'ouverture', survenuLe: '2026-11-02T12:00', heureConnue: false,
      jourConnu: true, texte: null, montantCents: null, pieceNom: null, titre: null, parId: null, parLibelle: 'x' });
    expect(norm(emis.find((e) => e.sql.includes('INSERT INTO gestion_monga_etape'))!.sql)).toContain('LEAST($3::timestamptz, now())');
  });
  it('une ouverture venue d’un mail Monga (accusé, ou ouverture de repli) : bornée à maintenant', async () => {
    await repo.poserOuvertureDeRepli('MNG-1');
    const ins = emis.find((e) => e.sql.includes('INSERT INTO gestion_monga_etape'))!;
    expect(norm(ins.sql)).toContain("VALUES ($1,'ouverture',LEAST($2::timestamptz, now())");
    const src = norm(readFileSync('app/lib/gestion/mongaEtapeRepo.ts', 'utf8'));
    /* 🔴 LOT FRISE-CORRECTION-MANUELLE — l'insertion de la relève est devenue un INSERT … SELECT (garde de la correction
       humaine) ; le verrou de date reste le même. */
    expect(src).toContain("CASE WHEN $2::text = 'ouverture' THEN ${sqlJamaisDansLeFutur('$3::timestamptz')} ELSE $3::timestamptz END,");
  });
  it('le script de reprise Monga, et une carte qui devient une Ouverture, portent le même verrou', () => {
    const script = norm(readFileSync('app/scripts/monga-etapes-reprise.ts', 'utf8'));
    expect(script).toContain("CASE WHEN $2 = 'ouverture' THEN ${sqlJamaisDansLeFutur('$3::timestamptz')} ELSE $3::timestamptz END");
    expect(script).toContain("SELECT $1,'ouverture',${sqlJamaisDansLeFutur('$2::timestamptz')},$3,'monga','a_confirmer'");
    expect(norm(readFileSync('app/lib/gestion/mongaEtapeRepo.ts', 'utf8')))
      .toContain(": a.type === 'ouverture' ? sqlJamaisDansLeFutur('$3::timestamptz') : '$3';");
  });
  it('🔴 garde : tout code qui insère une carte « ouverture » porte le verrou (aucun nouvel écrivain ne peut l’oublier)', () => {
    const fichiers: string[] = [];
    const parcourir = (d: string) => {
      for (const n of readdirSync(d)) {
        const p = join(d, n);
        if (statSync(p).isDirectory()) parcourir(p);
        else if (/\.ts$/.test(n) && !/\.(test|itest)\.ts$/.test(n)) fichiers.push(p);
      }
    };
    parcourir('app/lib'); parcourir('app/scripts');
    const fautifs = fichiers.filter((f) => {
      const s = readFileSync(f, 'utf8');
      return /INSERT INTO gestion_monga_etape[\s\S]{0,400}'ouverture'/.test(s) && !s.includes('sqlJamaisDansLeFutur');
    });
    expect(fautifs).toEqual([]);
    // et `ouvert_le` ne s'écrit que par la création (now()) ou pour REVENIR en arrière (reprise, clôture)
    const ecrivains = fichiers.filter((f) => /SET ouvert_le\s*=/.test(readFileSync(f, 'utf8'))).sort();
    expect(ecrivains).toEqual(['app/lib/gestion/mongaEtapeRepo.ts', 'app/lib/gestion/repriseOuverturesRepo.ts']);
  });
  it('une Réouverture s’ouvre à la date ET À L’HEURE où on la pose (jamais midi, jamais le futur)', async () => {
    const avant = Date.now();
    await repo.poserCarteDeBorne({ evenementId: 10, type: 'reouverture', jourDePose: '2026-10-23T12:00', texte: null, pieceNom: null,
      parId: null, parLibelle: 'x' }).catch(() => undefined);
    const t = emis.find((e) => e.sql.includes(')::text AS t'))!;
    const voulu = Date.parse(String(t.params[2]));
    expect(voulu).toBeGreaterThanOrEqual(avant - 1000);
    expect(voulu).toBeLessThanOrEqual(Date.now() + 1000);
    expect(t.params[3]).toBeNull();   // plafond = now() côté base
  });
});
