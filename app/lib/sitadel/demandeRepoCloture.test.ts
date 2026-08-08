import { describe, it, expect, beforeEach, vi } from 'vitest';

/**
 * R5c — CLÔTURE / RÉOUVERTURE d'une demande (cloturerDemande / rouvrirDemande) : enfin un écrivain pour 'close'. On mocke
 * `../db/client` et on FAIT tourner le callback de withTransaction avec un `q` qui capture chaque (sql, params). On assère le
 * COMPORTEMENT (statut posé, journal écrit, gardes-fous) et la LIAISON des paramètres — jamais la forme complète d'un WHERE.
 *
 * Non-régression S41 (22P02) : l'UPDATE réutilisé est `SET statut = $2 … WHERE id = $1`, params `[id, nouveau]`. On vérifie
 * explicitement que l'id est lié à « WHERE id » et le statut à « SET statut » (l'inversion produisait 22P02 sur bigint).
 */
const { ecritures, etat, queryMock, withTransactionMock } = vi.hoisted(() => {
  const ecritures: { sql: string; params: unknown[] }[] = [];
  const etat = { statut: 'envoyee', dus: 0 };
  const queryMock = async () => ({ rows: [] as unknown[] });
  const withTransactionMock = async (fn: (q: (sql: string, params?: unknown[]) => Promise<{ rows: unknown[] }>) => Promise<unknown>) => {
    const tx = async (sql: string, params?: unknown[]) => {
      ecritures.push({ sql, params: params ?? [] });
      if (/AS dus/i.test(sql)) return { rows: [{ statut: etat.statut, dus: etat.dus }] };          // SELECT de cloturerDemande
      if (/SELECT statut FROM demande WHERE id/i.test(sql)) return { rows: [{ statut: etat.statut }] }; // SELECT de rouvrirDemande
      return { rows: [] as unknown[] };
    };
    return fn(tx);
  };
  return { ecritures, etat, queryMock, withTransactionMock };
});

vi.mock('../db/client', () => ({ query: queryMock, withTransaction: withTransactionMock, pool: {}, closePool: async () => undefined }));

import { cloturerDemande, rouvrirDemande, TransitionInterditeError } from './demandeRepo';

const norm = (s: string) => s.replace(/\s+/g, ' ');
beforeEach(() => { ecritures.length = 0; etat.statut = 'envoyee'; etat.dus = 0; });

describe('R5c — cloturerDemande : écrivain de « close », uniquement depuis « envoyee »', () => {
  it('depuis « envoyee », tous dossiers obtenus (0 dû) → UPDATE close + journal ; params [id, nouveau] (régression S41)', async () => {
    etat.statut = 'envoyee'; etat.dus = 0;
    await cloturerDemande(154, '', 'a.jorel');

    const upd = ecritures.find((e) => /UPDATE demande SET statut/.test(e.sql))!;
    const sql = norm(upd.sql);
    expect(sql).toContain('SET statut = $2');
    expect(sql).toContain('WHERE id = $1');
    const idxId = Number(/WHERE id = \$(\d+)/.exec(sql)![1]) - 1;
    const idxStatut = Number(/SET statut = \$(\d+)/.exec(sql)![1]) - 1;
    expect(upd.params[idxId]).toBe(154);          // id → « WHERE id » (jamais le statut : c'est 22P02)
    expect(upd.params[idxStatut]).toBe('close');  // statut → « SET statut »

    const jrn = ecritures.find((e) => /INSERT INTO demande_journal/.test(e.sql))!;
    expect(jrn.params[0]).toBe(154);
    expect(jrn.params[1]).toBe('envoyee');                                   // statut_avant (lu par le SELECT)
    expect(jrn.params[2]).toBe('clôture (tous les dossiers satisfaits)');    // motif par défaut si tout est obtenu
    expect(jrn.params[3]).toBe('a.jorel');
  });

  it('depuis « brouillon » → refusée (TransitionInterditeError), AUCUNE écriture de statut', async () => {
    etat.statut = 'brouillon';
    await expect(cloturerDemande(154, 'peu importe', 'a')).rejects.toBeInstanceOf(TransitionInterditeError);
    expect(ecritures.some((e) => /UPDATE demande SET statut/.test(e.sql))).toBe(false);
  });

  it('depuis « abandonnee » → refusée', async () => {
    etat.statut = 'abandonnee';
    await expect(cloturerDemande(154, 'x', 'a')).rejects.toThrow(/envoyée/i);
  });

  it('dossiers DUS sans motif → refusée, aucune écriture de statut', async () => {
    etat.statut = 'envoyee'; etat.dus = 2;
    await expect(cloturerDemande(154, '   ', 'a')).rejects.toThrow(/motif/i);
    expect(ecritures.some((e) => /UPDATE demande SET statut/.test(e.sql))).toBe(false);
  });

  it('dossiers DUS avec motif → acceptée, le motif SAISI est journalisé', async () => {
    etat.statut = 'envoyee'; etat.dus = 2;
    await cloturerDemande(154, 'relance restée sans réponse', 'a.jorel');
    const jrn = ecritures.find((e) => /INSERT INTO demande_journal/.test(e.sql))!;
    expect(jrn.params[2]).toBe('relance restée sans réponse');
  });
});

describe('R5c — rouvrirDemande : « close » → « envoyee », aucune date dérivée stockée', () => {
  it('depuis « close » → UPDATE envoyee + journal (close → envoyee), params [id, nouveau]', async () => {
    etat.statut = 'close';
    await rouvrirDemande(154, null, 'a.jorel');

    const upd = ecritures.find((e) => /UPDATE demande SET statut/.test(e.sql))!;
    const sql = norm(upd.sql);
    const idxId = Number(/WHERE id = \$(\d+)/.exec(sql)![1]) - 1;
    const idxStatut = Number(/SET statut = \$(\d+)/.exec(sql)![1]) - 1;
    expect(upd.params[idxId]).toBe(154);
    expect(upd.params[idxStatut]).toBe('envoyee');

    const jrn = ecritures.find((e) => /INSERT INTO demande_journal/.test(e.sql))!;
    expect(norm(jrn.sql)).toContain("'close', 'envoyee'"); // statut_avant/apres littéraux
    expect(jrn.params[0]).toBe(154);

    // Aucune date DÉRIVÉE stockée : l'échéance se recalcule seule depuis envoye_le (aucune colonne echeance écrite).
    expect(ecritures.some((e) => /echeance/i.test(e.sql))).toBe(false);
    expect(ecritures.some((e) => /UPDATE demande_dossier/.test(e.sql))).toBe(false);
  });

  it('depuis « envoyee » (pas close) → refusée', async () => {
    etat.statut = 'envoyee';
    await expect(rouvrirDemande(154, null, 'a')).rejects.toBeInstanceOf(TransitionInterditeError);
    expect(ecritures.some((e) => /UPDATE demande SET statut/.test(e.sql))).toBe(false);
  });

  it('motif fourni → journalisé tel quel', async () => {
    etat.statut = 'close';
    await rouvrirDemande(154, 'clôture par erreur', 'a.jorel');
    const jrn = ecritures.find((e) => /INSERT INTO demande_journal/.test(e.sql))!;
    expect(jrn.params[1]).toBe('clôture par erreur'); // motif = $2 (statut_avant/apres sont des littéraux)
  });
});
