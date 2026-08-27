import { describe, it, expect, beforeEach, vi } from 'vitest';

/**
 * D1 — câblage serveur de l'annulation (annulerLot + garde de changerStatutLot). On mocke `../db/client` (modèle
 * demandeRepoTransition.test.ts) : chaque requête émise est capturée (sql + params LIÉS). On assère le COMPORTEMENT
 * (statut posé, dossiers libérés, journal + auteur, refus rapportés), jamais la forme complète d'un SQL par regex.
 */
const { ecritures, lectures, cfg, queryMock, withTransactionMock } = vi.hoisted(() => {
  const ecritures: { sql: string; params: unknown[] }[] = [];
  const lectures: { sql: string; params: unknown[] }[] = [];
  // Map id → état de la demande + dossiers actifs libérables (RETURNING de l'UPDATE demande_dossier).
  const cfg = { demandes: {} as Record<number, { statut: string; dest_canal: string | null; reference: string; liberes: number[] }> };
  const queryMock = async (sql: string, params?: unknown[]) => {
    lectures.push({ sql, params: params ?? [] });
    // Garde de changerStatutLot : SELECT id, reference, statut FROM demande WHERE id = ANY($1).
    if (/SELECT id, reference, statut FROM demande WHERE id = ANY/.test(sql)) {
      const ids = (params?.[0] as number[]) ?? [];
      return { rows: ids.map((id) => ({ id, reference: cfg.demandes[id]?.reference ?? `REF-${id}`, statut: cfg.demandes[id]?.statut ?? 'brouillon' })) };
    }
    return { rows: [] as unknown[] };
  };
  const withTransactionMock = async (fn: (q: (sql: string, params?: unknown[]) => Promise<{ rows: unknown[] }>) => Promise<unknown>) => {
    const tx = async (sql: string, params?: unknown[]) => {
      ecritures.push({ sql, params: params ?? [] });
      if (/SELECT statut, dest_canal, reference FROM demande WHERE id = \$1/.test(sql)) {
        const id = params?.[0] as number;
        const d = cfg.demandes[id];
        return { rows: d ? [{ statut: d.statut, dest_canal: d.dest_canal, reference: d.reference }] : [] };
      }
      if (/UPDATE demande_dossier SET actif = false .* RETURNING dossier_id/.test(sql)) {
        const id = params?.[0] as number;
        return { rows: (cfg.demandes[id]?.liberes ?? []).map((dossier_id) => ({ dossier_id })) };
      }
      return { rows: [] as unknown[] };
    };
    return fn(tx);
  };
  return { ecritures, lectures, cfg, queryMock, withTransactionMock };
});

vi.mock('../db/client', () => ({
  query: queryMock,
  withTransaction: withTransactionMock,
}));

import { annulerLot, changerStatutLot, TransitionInterditeError } from './demandeRepo';

beforeEach(() => {
  ecritures.length = 0;
  lectures.length = 0;
  cfg.demandes = {};
});

const sqlEcrites = () => ecritures.map((e) => e.sql.replace(/\s+/g, ' '));
const journalInsert = () => ecritures.find((e) => /INSERT INTO demande_journal/.test(e.sql));

describe('D1 — annulerLot (masse, per-item résilient)', () => {
  it('brouillons annulés : statut=annulee, dossiers libérés (RETURNING), journal AVEC auteur, compte rendu chiffré', async () => {
    cfg.demandes = {
      1: { statut: 'brouillon', dest_canal: 'email', reference: 'SVAV-1', liberes: [10, 11] },
      2: { statut: 'brouillon', dest_canal: 'email', reference: 'SVAV-2', liberes: [12] },
    };
    const r = await annulerLot([1, 2], '42', false);
    expect(r.annulees).toBe(2);
    expect(r.permisLiberes).toBe(3); // 10,11,12 distincts
    expect(r.refusees).toEqual([]);
    // Chemin d'annulation existant : statut posé + dossiers désactivés (jamais un DELETE).
    expect(sqlEcrites().some((s) => /UPDATE demande SET statut = 'annulee'/.test(s))).toBe(true);
    expect(sqlEcrites().some((s) => /UPDATE demande_dossier SET actif = false/.test(s))).toBe(true);
    expect(sqlEcrites().some((s) => /DELETE FROM demande/.test(s))).toBe(false);
    // Journalisée AVEC auteur (params: [id, statut_avant, motif, auteur]).
    const j = journalInsert();
    expect(j).toBeDefined();
    expect(j!.params[3]).toBe('42');
  });

  it('permisLiberes dédoublonne (un dossier compté une seule fois même si RETURNING le répète)', async () => {
    cfg.demandes = {
      1: { statut: 'brouillon', dest_canal: 'email', reference: 'SVAV-1', liberes: [10, 10] },
    };
    const r = await annulerLot([1], null, false);
    expect(r.permisLiberes).toBe(1);
  });

  // 🔴 PART 4 — envoyee/close JAMAIS annulées, même en masse : refus rapporté, AUCUNE écriture d'annulation pour elles.
  it('envoyee/close refusées avec raison, aucune UPDATE statut émise', async () => {
    cfg.demandes = {
      3: { statut: 'envoyee', dest_canal: 'email', reference: 'SVAV-3', liberes: [] },
      4: { statut: 'close', dest_canal: 'email', reference: 'SVAV-4', liberes: [] },
    };
    const r = await annulerLot([3, 4], '42', true); // même avec autoriserPrete=true
    expect(r.annulees).toBe(0);
    expect(r.refusees.map((x) => x.raison)).toEqual([
      'demande déjà envoyée ou close — jamais annulable',
      'demande déjà envoyée ou close — jamais annulable',
    ]);
    expect(sqlEcrites().some((s) => /UPDATE demande SET statut = 'annulee'/.test(s))).toBe(false);
  });

  // 🔴 PART 3 — une prête est refusée par le geste de MASSE (autoriserPrete=false), annulée par le geste DÉDIÉ (true).
  it('prete : refusée en masse (autoriserPrete=false), annulée par le geste dédié (autoriserPrete=true)', async () => {
    cfg.demandes = { 5: { statut: 'prete', dest_canal: 'email', reference: 'SVAV-5', liberes: [20] } };

    const masse = await annulerLot([5], '42', false);
    expect(masse.annulees).toBe(0);
    expect(masse.refusees[0]).toMatchObject({ id: 5, statut: 'prete', raison: 'demande prête (sur le point de partir) — à annuler par le geste dédié' });
    expect(sqlEcrites().some((s) => /UPDATE demande SET statut = 'annulee'/.test(s))).toBe(false);

    ecritures.length = 0;
    const dedie = await annulerLot([5], '42', true);
    expect(dedie.annulees).toBe(1);
    expect(dedie.permisLiberes).toBe(1);
  });

  it('mélange brouillon + envoyee : le brouillon est annulé, l’envoyée refusée (per-item, jamais tout-ou-rien)', async () => {
    cfg.demandes = {
      1: { statut: 'brouillon', dest_canal: 'email', reference: 'SVAV-1', liberes: [10] },
      3: { statut: 'envoyee', dest_canal: 'email', reference: 'SVAV-3', liberes: [] },
    };
    const r = await annulerLot([1, 3], '42', false);
    expect(r.annulees).toBe(1);
    expect(r.permisLiberes).toBe(1);
    expect(r.refusees).toHaveLength(1);
    expect(r.refusees[0].id).toBe(3);
  });
});

describe('D1 — garde de changerStatutLot (protège aussi le chemin unitaire PATCH)', () => {
  // 🔴 PART 4 — annuler une 'envoyee' via le chemin existant échoue AVANT toute écriture (tout-ou-rien).
  it('annulee sur une envoyee → TransitionInterditeError, aucune écriture transactionnelle', async () => {
    cfg.demandes = { 9: { statut: 'envoyee', dest_canal: 'email', reference: 'SVAV-9', liberes: [] } };
    await expect(changerStatutLot([9], 'annulee', '42')).rejects.toBeInstanceOf(TransitionInterditeError);
    expect(ecritures.length).toBe(0); // withTransaction jamais atteint
  });

  it('annulee sur une close → refus idem', async () => {
    cfg.demandes = { 9: { statut: 'close', dest_canal: 'email', reference: 'SVAV-9', liberes: [] } };
    await expect(changerStatutLot([9], 'annulee', '42')).rejects.toBeInstanceOf(TransitionInterditeError);
    expect(ecritures.length).toBe(0);
  });

  it('annulee sur un brouillon → PASSE la garde (pas d’exception ; l’annulation s’exécute)', async () => {
    cfg.demandes = { 9: { statut: 'brouillon', dest_canal: 'email', reference: 'SVAV-9', liberes: [] } };
    await expect(changerStatutLot([9], 'annulee', '42')).resolves.toBeDefined();
    expect(sqlEcrites().some((s) => /UPDATE demande SET statut = \$2/.test(s))).toBe(true);
  });
});
