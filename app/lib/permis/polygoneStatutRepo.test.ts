import { describe, it, expect, beforeEach, vi } from 'vitest';

/**
 * RATT-6 — GARDE SERVEUR (refus d'une saisie manuelle sur un 'mixte' — fait géométrique) + RÉSILIENCE migration 167 (repli 'mixte' →
 * 'detruit' entier sur violation de CHECK 23514). `db/client` mocké : on route par le SQL et on inspecte les INSERT émis.
 */
const H = vi.hoisted(() => {
  const calls: { sql: string; params: unknown[] }[] = [];
  const state = {
    statutCourant: null as string | null, // dernier statut du cleabs (SELECT statut ... LIMIT 1)
    etatBdtopo: 'En service' as string | null,
    checkViolationSurMixte: false,        // true → un INSERT avec statut='mixte'/origine='auto_mixte' lève 23514 (167 non appliquée)
  };
  const queryMock = async (sql: string, params: unknown[] = []) => {
    calls.push({ sql, params });
    if (/SELECT statut FROM permis_polygone_statut WHERE dossier_id/i.test(sql)) return { rows: state.statutCourant ? [{ statut: state.statutCourant }] : [] };
    if (/etat_de_l_objet AS etat FROM batiment/i.test(sql)) return { rows: [{ etat: state.etatBdtopo }] };
    if (/INSERT INTO permis_polygone_statut/i.test(sql)) {
      const statut = params[2], origine = params[5];
      if (state.checkViolationSurMixte && (statut === 'mixte' || origine === 'auto_mixte')) { const e = new Error('check') as Error & { code: string }; e.code = '23514'; throw e; }
      return { rows: [], rowCount: 1 };
    }
    return { rows: [], rowCount: 1 };
  };
  return { calls, state, queryMock };
});
vi.mock('../db/client', () => ({ query: H.queryMock, withTransaction: async (fn: (q: unknown) => unknown) => fn(H.queryMock) }));
vi.mock('./rattachementConfig', () => ({ lireSeuilRecouvrementEmprisePct: async () => ({ seuilPct: 3, provenance: 'defaut' }) }));

import { poserStatutPolygone } from './polygoneStatutRepo';

const inserts = () => H.calls.filter((c) => /INSERT INTO permis_polygone_statut/i.test(c.sql));

describe('RATT-6 — poserStatutPolygone : garde serveur « mixte » non modifiable', () => {
  beforeEach(() => { H.calls.length = 0; H.state.statutCourant = null; H.state.checkViolationSurMixte = false; });

  it('SAISIE manuelle sur un polygone dont le statut COURANT est « mixte » → REFUSÉE côté serveur (aucun INSERT)', async () => {
    H.state.statutCourant = 'mixte';
    const r = await poserStatutPolygone(1, 'CLEABS_X', 'preserve', 'admin', 'saisie');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.motif).toMatch(/non modifiable/i);
    expect(inserts()).toHaveLength(0); // rien écrit
  });

  it('SAISIE manuelle sur un polygone « detruit » (pas mixte) → AUTORISÉE (INSERT émis)', async () => {
    H.state.statutCourant = 'detruit';
    const r = await poserStatutPolygone(1, 'CLEABS_X', 'preserve', 'admin', 'saisie');
    expect(r.ok).toBe(true);
    expect(inserts()).toHaveLength(1);
    expect(inserts()[0].params[2]).toBe('preserve');
  });

  it('l’AUTOMATISME (origine auto_mixte) n’est PAS bloqué par la garde, même si le courant est mixte', async () => {
    H.state.statutCourant = 'mixte';
    const r = await poserStatutPolygone(1, 'CLEABS_X', 'mixte', 'auto:emprise', 'auto_mixte');
    expect(r.ok).toBe(true);
    expect(inserts()).toHaveLength(1);
  });
});

describe('RATT-6 — poserStatutPolygone : résilience migration 167 non appliquée (23514 → repli détruit entier)', () => {
  beforeEach(() => { H.calls.length = 0; H.state.statutCourant = null; H.state.checkViolationSurMixte = true; });

  it('INSERT « mixte »/« auto_mixte » rejeté par le CHECK → REPLI sur « detruit »/« auto_recouvrement », sans crash, ok:true', async () => {
    const r = await poserStatutPolygone(1, 'CLEABS_X', 'mixte', 'auto:emprise', 'auto_mixte');
    expect(r.ok).toBe(true);                      // aucun crash : l'app tourne comme avant la 167
    const emis = inserts();
    expect(emis).toHaveLength(2);                 // 1er INSERT (mixte) rejeté, 2e (repli) réussi
    expect(emis[0].params[2]).toBe('mixte');      // tentative
    expect(emis[1].params[2]).toBe('detruit');    // repli : détruit ENTIER (ancien comportement)
    expect(emis[1].params[5]).toBe('auto_recouvrement');
  });
});
