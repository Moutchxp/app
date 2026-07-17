import { describe, it, expect, beforeEach, vi } from 'vitest';

// `cycleVie` est `server-only` + accède au pool `pg`. On neutralise `server-only` et on MOCKE `withTransaction`/`query`
// pour PROUVER la RÉCONCILIATION ACCORD-ONLY des consentements de `completerParcours` (RÈGLE PRODUIT : le tunnel n'ACCORDE
// jamais ne retire → coché+inactif → 'accorde' ; déjà actif → RIEN ; ABSENT + actif → RIEN, JAMAIS de 'retire' par absence).
const { withTransaction, query } = vi.hoisted(() => ({ withTransaction: vi.fn(), query: vi.fn() }));
vi.mock('server-only', () => ({}));
vi.mock('../db/client', () => ({ withTransaction, query }));

import { completerParcours, retirerConsentement } from './cycleVie';

/** Mock du `q` transactionnel : route par SQL, et CAPTURE les INSERT dans `internaute_consentement` (finalité + état). */
function installerTx(actif: { finalite: string; actif: boolean }[]) {
  const inserts: { finalite: string; etat: string }[] = [];
  const marks: { projetId: unknown; internauteId: unknown }[] = []; // marquages certificat_envoye
  let updateSql = '';
  const q = vi.fn(async (sql: string, params?: unknown[]) => {
    if (/UPDATE internaute_projet SET certificat_envoye/.test(sql)) {
      marks.push({ projetId: params?.[0], internauteId: params?.[1] });
      return { rows: [] };
    }
    if (/UPDATE internaute SET/.test(sql)) {
      updateSql = sql;
      return { rows: [{ id: 'uuid-1' }] };
    }
    if (/FROM internaute_consentement_actif/.test(sql)) return { rows: actif };
    if (/internaute_consentement_texte/.test(sql)) return { rows: [{ id: 42 }] };
    if (/INSERT INTO internaute_consentement /.test(sql)) {
      inserts.push({ finalite: String(params?.[1]), etat: String(params?.[2]) });
      return { rows: [] };
    }
    if (/internaute_cycle_vie_log/.test(sql)) return { rows: [] };
    return { rows: [] };
  });
  withTransaction.mockImplementation(async (cb: (q: unknown) => Promise<unknown>) => cb(q));
  return { inserts, marks, getUpdateSql: () => updateSql, q };
}

const F1 = 'recontact_interne';
const F2 = 'email_marketing';

describe('completerParcours — réconciliation APPEND-ONLY des consentements + parcours complet', () => {
  beforeEach(() => {
    withTransaction.mockReset();
    query.mockReset();
  });

  it('F2 coché en B + F2 INACTIF → append une nouvelle ligne F2 « accorde » (jamais un UPDATE)', async () => {
    const tx = installerTx([{ finalite: F1, actif: true }]); // F1 actif, F2 absent/inactif
    const r = await completerParcours('uuid-1', { email: 'x@y.z', telephone: null }, [
      { finalite: F1, version: 1 },
      { finalite: F2, version: 1 },
    ], ['email_marketing'], null, null);
    expect(r).toEqual({ complete: true });
    // F1 inchangé (coché & actif) → aucun insert ; F2 (coché & inactif) → append accorde.
    expect(tx.inserts).toEqual([{ finalite: F2, etat: 'accorde' }]);
  });

  // (a) RÈGLE PRODUIT : le tunnel ne retire JAMAIS par absence. F2 déjà ACTIVE + ABSENTE du corps → elle RESTE active,
  // AUCUNE ligne insérée (surtout pas un 'retire'). Garantit qu'un internaute qui revient sans re-cocher ne perd rien.
  it('F2 ACTIVE + ABSENTE du corps → RESTE active, AUCUN insert (jamais de retrait par absence)', async () => {
    const tx = installerTx([{ finalite: F1, actif: true }, { finalite: F2, actif: true }]);
    const r = await completerParcours('uuid-1', { email: 'x@y.z', telephone: null }, [
      { finalite: F1, version: 1 }, // F2 ABSENT des souhaits (non re-cochée)
    ], ['email_marketing'], null, null);
    expect(r).toEqual({ complete: true });
    expect(tx.inserts).toEqual([]); // ni 'retire', ni quoi que ce soit : le consentement acquis est préservé
  });

  it('F2 inchangé (coché & déjà actif) → AUCUN insert (pas de doublon de preuve)', async () => {
    const tx = installerTx([{ finalite: F1, actif: true }, { finalite: F2, actif: true }]);
    await completerParcours('uuid-1', { email: 'x@y.z', telephone: null }, [
      { finalite: F1, version: 1 },
      { finalite: F2, version: 1 },
    ], ['email_marketing'], null, null);
    expect(tx.inserts).toEqual([]); // aucun changement → append-only ne duplique rien
  });

  it('projetId fourni → marque certificat_envoye=true, SCOPÉ à l’internaute (WHERE id ET internaute_id = jeton) — garde IDOR', async () => {
    const tx = installerTx([]);
    await completerParcours('uuid-1', { email: 'x@y.z', telephone: null }, [], ['email_marketing'], 77, null);
    expect(tx.marks).toEqual([{ projetId: 77, internauteId: 'uuid-1' }]); // UPDATE … WHERE id=77 AND internaute_id='uuid-1'
  });

  it('projetId NULL → aucun marquage de projet (analyse non validée en B reste certificat_envoye=false)', async () => {
    const tx = installerTx([]);
    await completerParcours('uuid-1', { email: 'x@y.z', telephone: null }, [], ['email_marketing'], null, null);
    expect(tx.marks).toEqual([]);
  });

  it('F1 (HORS scope Écran B) n’est JAMAIS réconcilié ici, même absent des souhaits → aucun retrait accidentel', async () => {
    const tx = installerTx([{ finalite: F1, actif: true }]); // F1 actif en base
    // souhaits VIDES (un client omettant F1) + scope = F2 uniquement : F1 ne doit PAS être retiré.
    await completerParcours('uuid-1', { email: 'x@y.z', telephone: null }, [], ['email_marketing'], null, null);
    expect(tx.inserts).toEqual([]); // F1 hors scope → intouché ; F2 absent & inactif → rien
  });

  it('pose bien parcours = complet dans l’UPDATE (statut de complétude), sur profil non effacé', async () => {
    const tx = installerTx([]);
    await completerParcours('uuid-1', { email: 'x@y.z', telephone: '+33612345678' }, [{ finalite: F2, version: 1 }], ['email_marketing'], null, null);
    expect(tx.getUpdateSql()).toContain("parcours = 'complet'");
    expect(tx.getUpdateSql()).toContain('efface_a IS NULL'); // ne complète jamais un profil effacé
  });

  it('profil introuvable / effacé (UPDATE 0 ligne) → { complete:false }, aucun consentement touché', async () => {
    const inserts: unknown[] = [];
    const q = vi.fn(async (sql: string) => {
      if (/UPDATE internaute SET/.test(sql)) return { rows: [] }; // 0 ligne
      if (/INSERT INTO internaute_consentement /.test(sql)) { inserts.push(1); return { rows: [] }; }
      return { rows: [] };
    });
    withTransaction.mockImplementation(async (cb: (q: unknown) => Promise<unknown>) => cb(q));
    const r = await completerParcours('absent', { email: 'x@y.z', telephone: null }, [{ finalite: F2, version: 1 }], ['email_marketing'], null, null);
    expect(r).toEqual({ complete: false });
    expect(inserts).toEqual([]); // court-circuit avant toute réconciliation
  });
});

describe('retirerConsentement — retrait HORS TUNNEL (admin), accord-only interdit, opposition_recontact intacte', () => {
  beforeEach(() => {
    withTransaction.mockReset();
    query.mockReset();
  });

  /** Mock du `q` : profil présent/absent + finalité active/inactive pilotables ; CAPTURE l'insert consentement
   *  (finalité/état/canal), l'entrée de journal, et TOUT le SQL vu (pour prouver qu'`opposition_recontact` n'est jamais écrite). */
  function installerRetrait({ profilPresent = true, actif = true }: { profilPresent?: boolean; actif?: boolean } = {}) {
    const inserts: { finalite: string; etat: string; canal: string }[] = [];
    const journal: { action: unknown; details: unknown }[] = [];
    const sqls: string[] = [];
    const q = vi.fn(async (sql: string, params?: unknown[]) => {
      sqls.push(sql);
      if (/SELECT id FROM internaute WHERE id = \$1 AND efface_a IS NULL/.test(sql)) return { rows: profilPresent ? [{ id: 'uuid-1' }] : [] };
      if (/FROM internaute_consentement_actif WHERE internaute_id = \$1 AND finalite = \$2/.test(sql)) return { rows: [{ actif }] };
      if (/internaute_consentement_texte/.test(sql)) return { rows: [{ id: 42 }] };
      if (/INSERT INTO internaute_consentement /.test(sql)) {
        inserts.push({ finalite: String(params?.[1]), etat: String(params?.[2]), canal: String(params?.[4]) });
        return { rows: [] };
      }
      if (/INSERT INTO internaute_cycle_vie_log/.test(sql)) {
        journal.push({ action: params?.[1], details: params?.[3] });
        return { rows: [] };
      }
      return { rows: [] };
    });
    withTransaction.mockImplementation(async (cb: (q: unknown) => Promise<unknown>) => cb(q));
    return { inserts, journal, sqls };
  }

  it('(a) finalité ACTIVE → UNE ligne « retire » canal=admin + une entrée de journal « retrait_consentement »', async () => {
    const tx = installerRetrait({ actif: true });
    const r = await retirerConsentement('uuid-1', F2, 7, { aLaDemandeDe: 'internaute', motif: 'désabonnement' });
    expect(r).toEqual({ retire: true });
    expect(tx.inserts).toEqual([{ finalite: F2, etat: 'retire', canal: 'admin' }]); // JAMAIS 'accorde', JAMAIS 'tunnel'
    expect(tx.journal).toHaveLength(1);
    expect(tx.journal[0].action).toBe('retrait_consentement');
    expect(tx.journal[0].details).toBe(JSON.stringify({ finalite: F2, a_la_demande_de: 'internaute', motif: 'désabonnement' }));
  });

  it('(b) opposition_recontact n’est JAMAIS écrite (aucun SQL ne la mentionne)', async () => {
    const tx = installerRetrait({ actif: true });
    await retirerConsentement('uuid-1', F1, null, { aLaDemandeDe: 'admin' });
    expect(tx.sqls.some((s) => /opposition_recontact/i.test(s))).toBe(false);
    // et rien d'autre que le retrait : ni efface_a, ni internaute_projet
    expect(tx.sqls.some((s) => /efface_a\s*=|DELETE FROM internaute_projet/i.test(s))).toBe(false);
  });

  it('(c) aucun chemin n’accorde : la SEULE ligne consentement insérée est « retire »', async () => {
    const tx = installerRetrait({ actif: true });
    await retirerConsentement('uuid-1', F2, 7, { aLaDemandeDe: 'admin' });
    expect(tx.inserts.every((i) => i.etat === 'retire')).toBe(true);
    expect(tx.inserts.some((i) => i.etat === 'accorde')).toBe(false);
  });

  it('IDEMPOTENT : finalité DÉJÀ inactive → aucune ligne, aucun journal, { retire:false, raison:deja_inactif }', async () => {
    const tx = installerRetrait({ actif: false });
    const r = await retirerConsentement('uuid-1', F2, 7, { aLaDemandeDe: 'admin' });
    expect(r).toEqual({ retire: false, raison: 'deja_inactif' });
    expect(tx.inserts).toEqual([]);
    expect(tx.journal).toEqual([]);
  });

  it('profil inexistant / effacé → { retire:false, raison:introuvable }, aucune écriture', async () => {
    const tx = installerRetrait({ profilPresent: false });
    const r = await retirerConsentement('absent', F2, 7, { aLaDemandeDe: 'admin' });
    expect(r).toEqual({ retire: false, raison: 'introuvable' });
    expect(tx.inserts).toEqual([]);
    expect(tx.journal).toEqual([]);
  });
});
