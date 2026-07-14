import { describe, it, expect, beforeEach, vi } from 'vitest';

// `cycleVie` est `server-only` + accède au pool `pg`. On neutralise `server-only` et on MOCKE `withTransaction`/`query`
// pour PROUVER la RÉCONCILIATION APPEND-ONLY des consentements de `completerParcours` (invariant RGPD : coché+inactif →
// nouvelle ligne 'accorde' ; décoché+actif → nouvelle ligne 'retire' ; inchangé → RIEN ; jamais d'UPDATE d'une preuve).
const { withTransaction, query } = vi.hoisted(() => ({ withTransaction: vi.fn(), query: vi.fn() }));
vi.mock('server-only', () => ({}));
vi.mock('../db/client', () => ({ withTransaction, query }));

import { completerParcours } from './cycleVie';

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

  it('F2 DÉCOCHÉ en B + F2 ACTIF → append une nouvelle ligne F2 « retire » (l’internaute peut décocher)', async () => {
    const tx = installerTx([{ finalite: F1, actif: true }, { finalite: F2, actif: true }]);
    const r = await completerParcours('uuid-1', { email: 'x@y.z', telephone: null }, [
      { finalite: F1, version: 1 }, // F2 ABSENT des souhaits → décoché en B
    ], ['email_marketing'], null, null);
    expect(r).toEqual({ complete: true });
    expect(tx.inserts).toEqual([{ finalite: F2, etat: 'retire' }]);
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
