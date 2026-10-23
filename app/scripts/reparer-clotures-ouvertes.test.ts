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
let ouverturesApres: { carte: string; avant: string }[] = [];
vi.mock('../lib/db/client', () => {
  const query = async (sql: string, params: unknown[] = []) => {
    emis.push({ sql, params });
    if (sql.includes('WITH cand AS')) return { rows: candidats, rowCount: candidats.length };
    /* LEAST(plafond, GREATEST(voulu, …)) avec plafond = voulu = la date du passage : la base rend la date du passage. */
    if (sql.includes(')::text AS t')) return { rows: [{ t: params[3] }], rowCount: 1 };
    if (sql.includes('b.carte::text AS carte')) { const l = ouverturesApres; ouverturesApres = []; return { rows: l, rowCount: l.length }; }
    if (sql.includes('UPDATE gestion_monga_etape c')) {
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
  date_finale: '2026-10-23 15:12:40', instant: '2026-10-23 15:12:40.5+02', ouvertures: null, ...plus,
});
beforeEach(() => { emis.length = 0; candidats = []; resteOuvert = false; transactions = 0; annulees = 0; ouverturesApres = []; });
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
    expect(t).toContain('date retenue : 23/10/2026 à 15:12 (passage à « Clôture ») → clôture au 23/10/2026 à 15:12');
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

describe('🔴 GES-2026-000010 (prod) : ouverture déplacée au 02/11/2026 → clôture au 23/10/2026, ouverture ramenée', () => {
  const G10 = () => LIGNE(10, 'fiable', {
    reference: 'GES-2026-000010', bien: 'lot 211', date_actuelle: '2026-10-23 12:00:00', date_retenue: '2026-10-23 12:02:11',
    date_finale: '2026-10-23 12:02:11', instant: '2026-10-23 12:02:11.4+02', ouvertures: ['2026-11-02 12:00:00'],
  });
  it('à blanc : le rapport dit une clôture au 23/10/2026, et l’ouverture future ramenée', async () => {
    candidats = [G10()];
    const t = texteRapportReprise(await passerReprise({ reel: false, avecAConfirmer: false }), { base: 'sansvisavis' });
    expect(t).toContain('date retenue : 23/10/2026 à 12:02 (passage à « Clôture ») → clôture au 23/10/2026 à 12:02');
    expect(t).toContain('ouverture datée du 02/11/2026 à 12:00 (à la clôture ou après) → ramenée une seconde avant la clôture ; date d’origine gardée au journal');
    expect(t).not.toContain('02/11/2026 12:00 « une seconde après');
  });
  it('--reel : l’ouverture est ramenée AVANT la redatation de la clôture, journalisée, et la clôture garde le 23/10', async () => {
    candidats = [G10()];
    ouverturesApres = [{ carte: '0', avant: '2026-11-02 12:00:00+01' }];
    await passerReprise({ reel: true, avecAConfirmer: false });
    const i = emis.findIndex((e) => e.sql.includes("UPDATE gestion_evenement SET ouvert_le = $2::timestamptz - interval '1 second'"));
    const j = emis.findIndex((e) => e.sql.includes('INSERT INTO gestion_journal'));
    const k = emis.findIndex((e) => e.sql.includes('UPDATE gestion_monga_etape c'));
    expect(emis[i].params).toEqual([10, '2026-10-23 12:02:11.4+02']);
    expect(emis[j].params.slice(0, 2)).toEqual([10, '2026-11-02 12:00:00+01']);   // la date d'origine, en valeur_avant
    expect(i).toBeLessThan(k);
    expect(emis[k].params[1]).toBe('2026-10-23 12:02:11.4+02');
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
    expect(sql).toContain('survenu_le = $2::timestamptz,');
    expect(sql).toContain('maj_le = now(), maj_par_libelle = $3');
    expect(maj[0].params).toEqual([101, '2026-10-23 15:12:40.5+02', AUTEUR_REPRISE]);
    // l'instant : la date du passage, plafonnée à elle-même (jamais plus tard)
    const t = emis.find((e) => e.sql.includes(')::text AS t'))!;
    expect(t.params).toEqual([[1], 101, '2026-10-23 15:12:40.5+02', '2026-10-23 15:12:40.5+02']);
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
