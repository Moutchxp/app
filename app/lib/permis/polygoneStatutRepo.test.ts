import { describe, it, expect, beforeEach, vi } from 'vitest';

/**
 * RATT-6 — GARDE SERVEUR (refus d'une saisie manuelle sur un 'mixte' — fait géométrique) + RÉSILIENCE migration 167 (repli 'mixte' →
 * 'detruit' entier sur violation de CHECK 23514). FIG-1 — lien décision de statut ↔ version d'état figé (colonne gel_id, migration 169).
 * `db/client` mocké : on route par le SQL et on inspecte les INSERT émis.
 */
const H = vi.hoisted(() => {
  const calls: { sql: string; params: unknown[] }[] = [];
  const state = {
    statutCourant: null as string | null, // dernier statut du cleabs (SELECT statut ... LIMIT 1)
    etatBdtopo: 'En service' as string | null,
    checkViolationSurMixte: false,        // true → un INSERT avec statut='mixte'/origine='auto_mixte' lève 23514 (167 non appliquée)
    gelColonne: false as boolean,         // FIG-1 : la colonne gel_id existe-t-elle (migration 169) ?
    gelVersion: null as null | { id: number; version: number }, // FIG-1 : version d'état figé courante du dossier
  };
  const queryMock = async (sql: string, params: unknown[] = []) => {
    calls.push({ sql, params });
    if (/SELECT statut FROM permis_polygone_statut WHERE dossier_id/i.test(sql)) return { rows: state.statutCourant ? [{ statut: state.statutCourant }] : [] };
    if (/etat_de_l_objet AS etat FROM batiment/i.test(sql)) return { rows: [{ etat: state.etatBdtopo }] };
    if (/information_schema\.columns[\s\S]*permis_polygone_statut[\s\S]*gel_id/i.test(sql)) return { rows: [{ n: state.gelColonne ? 1 : 0 }] };
    if (/to_regclass\('public\.permis_gel'\)/i.test(sql)) return { rows: [{ t: state.gelVersion ? 'permis_gel' : null }] };
    if (/SELECT id, version FROM permis_gel WHERE dossier_id/i.test(sql)) return { rows: state.gelVersion ? [state.gelVersion] : [] };
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
  beforeEach(() => { H.calls.length = 0; H.state.statutCourant = null; H.state.checkViolationSurMixte = false; H.state.gelColonne = false; H.state.gelVersion = null; });

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
  beforeEach(() => { H.calls.length = 0; H.state.statutCourant = null; H.state.checkViolationSurMixte = true; H.state.gelColonne = false; H.state.gelVersion = null; });

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

describe('FIG-1 — poserStatutPolygone : lien décision de statut ↔ version d’état figé', () => {
  beforeEach(() => { H.calls.length = 0; H.state.statutCourant = null; H.state.checkViolationSurMixte = false; H.state.gelColonne = false; H.state.gelVersion = null; });

  it('colonne gel_id présente + version courante → INSERT 7 colonnes portant gel_id', async () => {
    H.state.gelColonne = true;
    H.state.gelVersion = { id: 55, version: 2 };
    const r = await poserStatutPolygone(11430, 'BAT_C', 'detruit', 'admin', 'saisie');
    expect(r).toEqual({ ok: true });
    const ins = inserts();
    expect(ins).toHaveLength(1);
    expect(ins[0].sql.replace(/\s+/g, ' ')).toContain('gel_id');
    expect(ins[0].params).toHaveLength(7);
    expect(ins[0].params[6]).toBe(55);      // la décision DÉSIGNE la version d'état figé
  });

  it('colonne gel_id absente (migration 169 non appliquée) → INSERT historique 6 colonnes, aucun gel_id', async () => {
    H.state.gelColonne = false;
    const r = await poserStatutPolygone(11430, 'BAT_C', 'detruit', 'admin', 'saisie');
    expect(r).toEqual({ ok: true });
    const ins = inserts();
    expect(ins).toHaveLength(1);
    expect(ins[0].sql.replace(/\s+/g, ' ')).not.toContain('gel_id');
    expect(ins[0].params).toHaveLength(6);
  });
});
