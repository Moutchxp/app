import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * AUTO-CONFIRMATION téléservice — COMPORTEMENT. La décision est PURE (aucune I/O) ; l'orchestrateur est testé avec un mock de
 * ../db/client (routé par fragment de SQL) et de ../sitadel/demandeRepo (marquerDeposee/ajouterReferenceExterne mockés). On PROUVE
 * les scénarios du porteur : 1 candidate → confirmé (réf. de l'objet, malgré le bruit num_dau du corps) ; ≥2 candidates → rien ;
 * canal e-mail (absent des candidates) → rien ; nature 'autre' (absente des accusés) → rien ; 0/≥2 références → bascule sans réf.
 */
const H = vi.hoisted(() => {
  const state = { accuses: [] as Record<string, unknown>[], candidats: [] as Record<string, unknown>[], updates: [] as unknown[][], journals: [] as unknown[][] };
  const queryMock = vi.fn(async (sql: string, params?: unknown[]) => {
    if (sql.includes('UPDATE demande_acheminement')) return { rows: [] };                          // reclamperEnvoyeLe → 0 ligne → no-op (⚠ contient « nature='accuse' » dans une sous-requête : à router AVANT)
    if (sql.includes('FROM demande_reponse') && sql.includes("nature = 'accuse'")) return { rows: state.accuses }; // accusés non rattachés
    if (sql.includes("statut IN ('brouillon', 'prete')")) return { rows: state.candidats };        // candidates en attente (formulaire)
    if (sql.includes('UPDATE demande_reponse')) { state.updates.push(params ?? []); return { rows: [], rowCount: 1 }; } // rattachement
    if (sql.includes('INSERT INTO demande_journal')) { state.journals.push(params ?? []); return { rows: [] }; }       // trace
    return { rows: [] };
  });
  return { state, queryMock };
});
vi.mock('../db/client', () => ({ query: H.queryMock, withTransaction: async (fn: (q: unknown) => Promise<unknown>) => fn(H.queryMock) }));
vi.mock('../sitadel/demandeRepo', () => ({
  marquerDeposee: vi.fn(async () => {}),
  ajouterReferenceExterne: vi.fn(async () => {}),
  DepotInterditError: class DepotInterditError extends Error {},
  ReferenceDejaEnregistreeError: class ReferenceDejaEnregistreeError extends Error {},
}));

import { deciderAutoConfirmation, autoConfirmerAccusesTeleservice } from './autoConfirmationTeleservice';
import { marquerDeposee, ajouterReferenceExterne } from '../sitadel/demandeRepo';

const md = marquerDeposee as unknown as ReturnType<typeof vi.fn>;
const are = ajouterReferenceExterne as unknown as ReturnType<typeof vi.fn>;

// Le vrai cas Paris : num_dau DANS LE CORPS (« Permis concerné : PC07511625V0016 »), référence DANS L'OBJET (« …SLC260914095998… »).
const OBJET = 'Accusé de réception (référence SLC260914095998) | Urbanisme';
const CORPS = 'Bonjour,\nPermis concerné : PC07511625V0016 — autorisé le 8 décembre 2025.';

beforeEach(() => { H.state.accuses = []; H.state.candidats = []; H.state.updates = []; H.state.journals = []; vi.clearAllMocks(); });

describe('deciderAutoConfirmation (PURE)', () => {
  it('1 candidate citée dans le corps + référence dans l’objet → confirmé, référence = celle de l’OBJET (le bruit « PC07511625 » du corps est ignoré)', () => {
    const d = deciderAutoConfirmation([{ demandeId: 9418, numeros: ['07511625V0016'] }], { objet: OBJET, corpsTexte: CORPS, corpsHtml: null });
    expect(d.demandeId).toBe(9418);
    expect(d.reference).toBe('SLC260914095998');
    expect(d.nbCandidats).toBe(1); expect(d.nbReferences).toBe(1);
  });
  it('num_dau SEULEMENT dans le corps HTML → matché (objet/corps/HTML)', () => {
    const d = deciderAutoConfirmation([{ demandeId: 9418, numeros: ['07511625V0016'] }], { objet: 'Accusé SLC260914095998', corpsTexte: null, corpsHtml: '<p>Permis : 07511625V0016</p>' });
    expect(d.demandeId).toBe(9418); expect(d.reference).toBe('SLC260914095998');
  });
  it('2 demandes candidates citées → RIEN (garde d’ambiguïté)', () => {
    const d = deciderAutoConfirmation(
      [{ demandeId: 9418, numeros: ['07511625V0016'] }, { demandeId: 9500, numeros: ['07511699X0001'] }],
      { objet: OBJET, corpsTexte: `${CORPS}\nAutre : 07511699X0001`, corpsHtml: null });
    expect(d.demandeId).toBeNull(); expect(d.nbCandidats).toBe(2);
  });
  it('0 candidate (aucune demande en attente ne cite le message — ex. la demande est en e-mail) → RIEN', () => {
    const d = deciderAutoConfirmation([], { objet: OBJET, corpsTexte: CORPS, corpsHtml: null });
    expect(d.demandeId).toBeNull(); expect(d.nbCandidats).toBe(0);
  });
  it('1 candidate mais 0 référence exploitable → confirmable SANS référence', () => {
    const d = deciderAutoConfirmation([{ demandeId: 9418, numeros: ['07511625V0016'] }], { objet: 'Votre dépôt', corpsTexte: 'Permis : 07511625V0016 (aucune référence)', corpsHtml: null });
    expect(d.demandeId).toBe(9418); expect(d.reference).toBeNull(); expect(d.nbReferences).toBe(0);
  });
  it('1 candidate mais ≥2 références DISTINCTES dans l’objet → confirmable SANS référence (ambigu)', () => {
    const d = deciderAutoConfirmation([{ demandeId: 9418, numeros: ['07511625V0016'] }], { objet: 'Accusés SLC260914095998 et ABC12345678', corpsTexte: '07511625V0016', corpsHtml: null });
    expect(d.demandeId).toBe(9418); expect(d.reference).toBeNull(); expect(d.nbReferences).toBe(2);
  });
});

describe('autoConfirmerAccusesTeleservice (orchestrateur)', () => {
  const accuse = { id: 1714, objet: OBJET, corps_texte: CORPS, corps_html: null, recu_le: new Date('2026-09-14T15:39:57.000Z') };

  it('accusé + 1 candidate → bascule (envoye_le=recu_le), référence accuse_reception, rattach, trace journal', async () => {
    H.state.accuses = [accuse];
    H.state.candidats = [{ demande_id: 9418, num_daus: ['07511625V0016'] }];
    const r = await autoConfirmerAccusesTeleservice(true);
    expect(r.confirmees).toBe(1);
    expect(md).toHaveBeenCalledWith(9418, 'systeme', null, '2026-09-14T15:39:57.000Z');                        // envoye_le = recu_le
    expect(are).toHaveBeenCalledWith(9418, 'SLC260914095998', { source: 'accuse_reception', recuLe: '2026-09-14T15:39:57.000Z' });
    expect(H.state.updates).toHaveLength(1);   // rattachement du message
    expect(H.state.journals).toHaveLength(1);   // TRACE obligatoire
    expect(String(H.state.journals[0][1])).toContain('SLC260914095998'); // motif cite la référence
    expect(String(H.state.journals[0][2])).toBe('systeme');              // auteur
  });

  it('DRY-RUN (appliquer=false) → AUCUNE écriture', async () => {
    H.state.accuses = [accuse];
    H.state.candidats = [{ demande_id: 9418, num_daus: ['07511625V0016'] }];
    const r = await autoConfirmerAccusesTeleservice(false);
    expect(r.resultats[0].demandeId).toBe(9418); // décidé…
    expect(r.confirmees).toBe(0);                 // …mais rien appliqué
    expect(md).not.toHaveBeenCalled();
    expect(are).not.toHaveBeenCalled();
    expect(H.state.journals).toHaveLength(0);
  });

  it('2 candidates citées → RIEN écrit (proposition manuelle conservée)', async () => {
    H.state.accuses = [{ ...accuse, corps_texte: `${CORPS}\nAutre : 07511699X0001` }];
    H.state.candidats = [{ demande_id: 9418, num_daus: ['07511625V0016'] }, { demande_id: 9500, num_daus: ['07511699X0001'] }];
    const r = await autoConfirmerAccusesTeleservice(true);
    expect(r.confirmees).toBe(0);
    expect(md).not.toHaveBeenCalled();
  });

  it('nature « autre » (ou tout message non-accusé) → absent de la requête d’accusés → RIEN', async () => {
    H.state.accuses = []; // la requête filtre nature='accuse' : un message 'autre' n'est jamais chargé
    H.state.candidats = [{ demande_id: 9418, num_daus: ['07511625V0016'] }];
    const r = await autoConfirmerAccusesTeleservice(true);
    expect(r.accusesExamines).toBe(0); expect(r.confirmees).toBe(0);
    expect(md).not.toHaveBeenCalled();
  });

  it('0 référence → bascule SANS référence (ajouterReferenceExterne jamais appelé), trace le signale', async () => {
    H.state.accuses = [{ ...accuse, objet: 'Votre dépôt', corps_texte: 'Permis : 07511625V0016 (aucune référence)' }];
    H.state.candidats = [{ demande_id: 9418, num_daus: ['07511625V0016'] }];
    await autoConfirmerAccusesTeleservice(true);
    expect(md).toHaveBeenCalledWith(9418, 'systeme', null, '2026-09-14T15:39:57.000Z');
    expect(are).not.toHaveBeenCalled();
    expect(String(H.state.journals[0][1])).toMatch(/AUCUNE enregistrée/i);
  });
});
