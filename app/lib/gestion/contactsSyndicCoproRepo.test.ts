import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * 🔴🔴 Arno (20/11/2026) — rattacher / détacher les contacts du syndic d'une copropriété : base SIMULÉE (fragments du SQL, paramètres liés).
 * Détacher FERME l'affectation et ne touche JAMAIS le contact (l'annuaire du syndic). Chaque geste écrit au journal. 🔒 Aucune donnée réelle.
 */
const norme = (s: string) => s.replace(/\s+/g, ' ');
let ecrits: { sql: string; params: unknown[] }[];
let syndic: { copro: string; syndic: string; nom: string } | null;
let siens: string[];
let deja: string[];
let modifie: number;
const q = async (sql: string, params: unknown[] = []) => {
  const s = norme(sql);
  if (s.includes('FROM gestion_copropriete c JOIN gestion_copropriete_syndic cs')) return { rows: syndic === null ? [] : [syndic], rowCount: syndic === null ? 0 : 1 };
  if (s.startsWith('SELECT id::text FROM gestion_syndic_contact WHERE id = ANY')) return { rows: siens.map((id) => ({ id })), rowCount: siens.length };
  if (s.startsWith('SELECT contact_id::text FROM gestion_syndic_contact_copropriete')) return { rows: deja.map((contact_id) => ({ contact_id })), rowCount: deja.length };
  if (s.startsWith('UPDATE')) { ecrits.push({ sql: s, params }); return { rows: [], rowCount: modifie }; }
  if (s.startsWith('INSERT') || s.includes('DELETE')) { ecrits.push({ sql: s, params }); return { rows: [], rowCount: 1 }; }
  return { rows: [], rowCount: 0 };
};
vi.mock('../db/client', () => ({ query: (s: string, p?: unknown[]) => q(s, p), withTransaction: async (f: (x: typeof q) => unknown) => f(q) }));
const journal = vi.fn(async (..._a: unknown[]) => undefined);
vi.mock('./journalSyndicCopro', () => ({ journaliserContactsSyndic: (...a: unknown[]) => journal(...a) }));

import { contactRepond, detacherContactSyndic, rattacherContactsSyndic } from './contactsSyndicCoproRepo';

const AUTEUR = { id: 1, libelle: '_TEST' };
beforeEach(() => { ecrits = []; syndic = { copro: '30', syndic: '9', nom: '_TEST SYNDIC CONTACTS' }; siens = ['5', '6']; deja = []; modifie = 1; journal.mockClear(); });

describe('la recherche (PUR)', () => {
  const c = { id: 6, civilite: null, prenom: 'Paul', nom: 'Essai', titre: 'Comptable', coordonnees: [{ sorte: 'telephone' as const, libelle: null, valeur: '+33 6 99 99 00 01' }, { sorte: 'email' as const, libelle: null, valeur: 'paul@cabinet.test' }] };
  it('nom, prénom, fonction, e-mail, téléphone (avec ou sans espaces, +33) ; tous les mots', () => {
    for (const t of ['essai', 'PAUL ess', 'comptable', 'paul@cabinet', '06 99 99', '0699990001', '']) expect(contactRepond(c, t)).toBe(true);
    for (const t of ['claire', 'paul gestionnaire', '07 11']) expect(contactRepond(c, t)).toBe(false);
  });
});

describe('rattacher / détacher', () => {
  it('RATTACHER : une affectation par contact non encore rattaché (tout ou rien), le journal « rattache »', async () => {
    deja = ['5'];
    const r = await rattacherContactsSyndic('12 rue _test', [5, 6], AUTEUR);
    expect(r.etat).toBe('ok');
    expect(ecrits).toHaveLength(1);
    expect(ecrits[0].sql).toContain('INSERT INTO gestion_syndic_contact_copropriete');
    expect(ecrits[0].params).toEqual([6, 30, 1, '_TEST']);
    expect(journal.mock.calls[0][1]).toMatchObject({ coproId: 30, syndicId: 9, nature: 'rattache', contactIds: [6] });
  });

  it('RATTACHER un contact qui n’est pas (ou plus) de ce syndic : refus, RIEN n’est écrit', async () => {
    siens = ['5'];
    const r = await rattacherContactsSyndic('12 rue _test', [5, 77], AUTEUR);
    expect(r.etat).toBe('refus');
    expect(ecrits).toEqual([]);
    expect(journal).not.toHaveBeenCalled();
  });

  it('copropriété sans syndic : refus, rien n’est écrit', async () => {
    syndic = null;
    expect((await rattacherContactsSyndic('12 rue _test', [5], AUTEUR)).etat).toBe('refus');
    expect((await detacherContactSyndic('12 rue _test', 5, AUTEUR)).etat).toBe('refus');
    expect(ecrits).toEqual([]);
  });

  it('DÉTACHER : l’affectation FERMÉE (retire_le, motif), le contact JAMAIS supprimé ni modifié ; journal « detache »', async () => {
    const r = await detacherContactSyndic('12 rue _test', 5, AUTEUR);
    expect(r.etat).toBe('ok');
    expect(ecrits).toHaveLength(1);
    expect(ecrits[0].sql).toContain('UPDATE gestion_syndic_contact_copropriete a SET retire_le = now()');
    expect(ecrits[0].sql).toContain("retire_motif = 'détaché de la copropriété'");
    expect(ecrits.some((e) => /UPDATE gestion_syndic_contact SET|DELETE/.test(e.sql))).toBe(false);
    expect(journal.mock.calls[0][1]).toMatchObject({ nature: 'detache', contactIds: [5] });
  });

  it('DÉTACHER un contact qui n’est plus rattaché : refus, pas de journal', async () => {
    modifie = 0;
    expect((await detacherContactSyndic('12 rue _test', 5, AUTEUR)).etat).toBe('refus');
    expect(journal).not.toHaveBeenCalled();
  });
});
