import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';

/**
 * 🔴 Arno (23/10/2026) — la reprise des événements restés à l'étape « Clôture » sans période fermée. Base SIMULÉE : rien
 * n'est écrit. À blanc par défaut (aucune transaction, aucune écriture), `--reel` en une transaction tout-ou-rien, rejouable.
 */
const emis: { sql: string; params: unknown[] }[] = [];
let candidats: Record<string, unknown>[] = [];
let resteOuvert = false;
let transactions = 0;
let annulees = 0;
vi.mock('../lib/db/client', () => {
  const query = async (sql: string, params: unknown[] = []) => {
    emis.push({ sql, params });
    if (sql.includes('WITH cand AS')) return { rows: candidats, rowCount: candidats.length };
    if (sql.includes('UPDATE gestion_monga_etape')) {
      candidats = candidats.filter((c) => c.carte_id !== String(params[0]));   // réparé : il ne ressort plus
      return { rows: [], rowCount: 1 };
    }
    if (sql.includes('AS ouvert')) return { rows: [{ ouvert: resteOuvert }], rowCount: 1 };
    return { rows: [], rowCount: 0 };
  };
  return {
    query, closePool: async () => {},
    withTransaction: async (fn: (q: typeof query) => unknown) => {
      transactions += 1;
      try { return await fn(query); } catch (e) { annulees += 1; throw e; }
    },
  };
});
const { passerReprise, aTraiter, AUTEUR_REPRISE } = await import('../lib/gestion/repriseCloturesRepo');
const { texteRapportReprise } = await import('./reparer-clotures-ouvertes');

const LIGNE = (id: number, certitude = 'fiable', plus: Record<string, unknown> = {}) => ({
  evenement_id: String(id), reference: `GES-2026-00000${id}`, objet: 'Avis de passage désinsectisation - 13h30 39 bis rue Rousselle - Studio et T2',
  bien: 'lot 219 - 39 bis rue Rousselle Paris', carte_id: String(100 + id), source: certitude === 'a_confirmer' ? 'monga' : 'manuelle', certitude,
  date_actuelle: '2026-10-23 12:00:00', date_retenue: '2026-10-23 15:12:40', origine: 'passage', auteur: 'arno@x.test',
  date_finale: '2026-10-23 15:12:40', ...plus,
});
beforeEach(() => { emis.length = 0; candidats = []; resteOuvert = false; transactions = 0; annulees = 0; });
const ecritures = () => emis.filter((e) => /^\s*(UPDATE|INSERT|DELETE)\b/.test(e.sql));

describe('🔴 à blanc par défaut', () => {
  it('liste, n’écrit rien, n’ouvre aucune transaction', async () => {
    candidats = [LIGNE(1)];
    const p = await passerReprise({ reel: false, avecAConfirmer: false });
    expect(p.trouvees.map((c) => c.evenementId)).toEqual([1]);
    expect(p.reparees).toEqual([]);
    expect(ecritures()).toHaveLength(0);
    expect(transactions).toBe(0);
    const t = texteRapportReprise(p, { base: 'sansvisavis' });
    expect(t).toContain('À BLANC (aucune écriture)');
    expect(t).toContain('GES-2026-000001 — Avis de passage désinsectisation - 13h30 39 bis rue Rousselle - Studio et T2');
    expect(t).toContain('bien : lot 219 - 39 bis rue Rousselle Paris');
    expect(t).toContain('date retenue : 23/10/2026 à 15:12 (passage à « Clôture »)');
    expect(t).toContain('auteur : arno@x.test');
    expect(t).toContain('serait clos');
  });
  it('le script lit --reel et --avec-a-confirmer ; rien d’autre n’écrit', () => {
    const s = readFileSync('app/scripts/reparer-clotures-ouvertes.ts', 'utf8');
    expect(s).toContain("const reel = argv.includes('--reel');");
    expect(s).toContain("const avecAConfirmer = argv.includes('--avec-a-confirmer');");
    expect(readFileSync('package.json', 'utf8')).toContain('"gestion:reparer-clotures": "tsx app/scripts/reparer-clotures-ouvertes.ts"');
  });
});

describe('🔴 --reel : une transaction, la carte Clôture redatée, l’effet vérifié', () => {
  it('redate la carte (date retenue, ou une seconde après la dernière borne) et la marque ; l’événement est relu clos', async () => {
    candidats = [LIGNE(1)];
    const p = await passerReprise({ reel: true, avecAConfirmer: false });
    expect(p.reparees).toEqual([1]);
    expect(transactions).toBe(1);
    const maj = ecritures();
    expect(maj).toHaveLength(1);
    const sql = maj[0].sql.replace(/\s+/g, ' ');
    expect(sql).toContain('survenu_le = GREATEST(coalesce(CASE WHEN c.certitude = \'confirmee\' THEN c.confirme_le END, c.cree_le, c.maj_le),');
    expect(sql).toContain('maj_le = now(), maj_par_libelle = $3');
    expect(maj[0].params).toEqual([101, 1, AUTEUR_REPRISE]);
    expect(texteRapportReprise(p, { base: 'x' })).toContain('— CLOS');
  });
  it('rejouable : la seconde passe ne trouve plus rien et n’écrit rien', async () => {
    candidats = [LIGNE(1)];
    await passerReprise({ reel: true, avecAConfirmer: false });
    emis.length = 0;
    const p = await passerReprise({ reel: true, avecAConfirmer: false });
    expect(p.trouvees).toEqual([]);
    expect(ecritures()).toHaveLength(0);
  });
  it('si un événement restait ouvert, TOUT est annulé', async () => {
    candidats = [LIGNE(1)];
    resteOuvert = true;
    await expect(passerReprise({ reel: true, avecAConfirmer: false })).rejects.toThrow('reste ouvert');
    expect(annulees).toBe(1);
  });
  it('une Clôture Monga « à confirmer » est listée, pas traitée — sauf --avec-a-confirmer', async () => {
    expect(aTraiter({ certitude: 'a_confirmer' } as never, false)).toBe(false);
    expect(aTraiter({ certitude: 'a_confirmer' } as never, true)).toBe(true);
    candidats = [LIGNE(2, 'a_confirmer')];
    const p = await passerReprise({ reel: true, avecAConfirmer: false });
    expect(ecritures()).toHaveLength(0);
    expect(texteRapportReprise(p, { base: 'x' })).toContain('CLÔTURES MONGA « À CONFIRMER » (listées seulement');
    candidats = [LIGNE(2, 'a_confirmer')];
    const p2 = await passerReprise({ reel: true, avecAConfirmer: true });
    expect(p2.reparees).toEqual([2]);
    expect(ecritures()[0].sql.replace(/\s+/g, ' ')).toContain("certitude = CASE WHEN c.certitude = 'a_confirmer' THEN 'confirmee'");
  });
});
