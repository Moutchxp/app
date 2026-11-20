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
let annuaire: unknown[] = [];
let ailleurs: unknown[] = [];
let echec: string | null = null;
let fermes: { contact_id: string; copropriete_id: string }[] = [];
let transactions = 0;
let annulees = 0;
const q = async (sql: string, params: unknown[] = []) => {
  const s = norme(sql);
  if (echec !== null && s.startsWith(echec)) throw new Error('échec simulé');
  if (s.startsWith('SELECT ct.prenom, ct.nom, ct.titre')) return { rows: annuaire, rowCount: annuaire.length };
  if (s.startsWith('SELECT s.nom AS syndic FROM gestion_syndic_coordonnee')) return { rows: ailleurs, rowCount: ailleurs.length };
  if (s.startsWith('INSERT INTO gestion_syndic_contact (')) { ecrits.push({ sql: s, params }); return { rows: [{ id: '90' }], rowCount: 1 }; }
  if (s.includes('FROM gestion_copropriete c JOIN gestion_copropriete_syndic cs')) return { rows: syndic === null ? [] : [syndic], rowCount: syndic === null ? 0 : 1 };
  if (s.startsWith('SELECT id::text FROM gestion_syndic_contact WHERE id = ANY')) return { rows: siens.map((id) => ({ id })), rowCount: siens.length };
  if (s.startsWith('SELECT contact_id::text FROM gestion_syndic_contact_copropriete')) return { rows: deja.map((contact_id) => ({ contact_id })), rowCount: deja.length };
  if (s.startsWith('UPDATE')) { ecrits.push({ sql: s, params }); return { rows: s.includes('RETURNING') ? fermes : [], rowCount: modifie }; }
  if (s.startsWith('INSERT') || s.includes('DELETE')) { ecrits.push({ sql: s, params }); return { rows: [], rowCount: 1 }; }
  return { rows: [], rowCount: 0 };
};
vi.mock('../db/client', () => ({ query: (s: string, p?: unknown[]) => q(s, p),
  withTransaction: async (f: (x: typeof q) => unknown) => { transactions += 1; try { return await f(q); } catch (e) { annulees += 1; throw e; } } }));
const journal = vi.fn(async (..._a: unknown[]) => undefined);
vi.mock('./journalSyndicCopro', () => ({ journaliserContactsSyndic: (...a: unknown[]) => journal(...a) }));

import { contactRepond, detacherContactSyndic, rattacherContactsSyndic } from './contactsSyndicCoproRepo';

const AUTEUR = { id: 1, libelle: '_TEST' };
beforeEach(() => { ecrits = []; syndic = { copro: '30', syndic: '9', nom: '_TEST SYNDIC CONTACTS' }; siens = ['5', '6']; deja = []; modifie = 1; journal.mockClear();
  annuaire = []; ailleurs = []; echec = null; transactions = 0; annulees = 0; fermes = []; });

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

// ══ 🔴 (Arno, 20/11/2026, point 2) créer un contact dans l'annuaire du syndic ET le rattacher — tout ou rien ══════════════════════════════════════════
import { creerEtRattacherContactSyndic, doublonDansLAnnuaire, lireNouveauContact } from './contactsSyndicCoproRepo';

describe('créer un contact depuis la fiche copropriété', () => {
  const NOUVEAU = { civilite: 'Mme', prenom: 'Zoé', nom: '_Test Nouvelle', titre: 'Gestionnaire', telephone: '06 99 99 10 09', email: 'zoe@fictif.test' };
  const EXISTANT = { prenom: 'Claire', nom: '_TEST GESTIONNAIRE', titre: 'Gestionnaire', telephones: ['0699991001'], emails: ['claire@fictif.test'] };

  it('la saisie : nom ou fonction obligatoire, e-mail lisible, téléphone complet, civilité M. ou Mme', () => {
    expect(lireNouveauContact(NOUVEAU).ok).toBe(true);
    expect(lireNouveauContact({ ...NOUVEAU, prenom: '', nom: '', titre: '' })).toEqual({ ok: false, motif: 'Le contact doit avoir au moins un nom ou une fonction.' });
    expect(lireNouveauContact({ ...NOUVEAU, email: 'zoe@' }).ok).toBe(false);
    expect(lireNouveauContact({ ...NOUVEAU, telephone: '06 99' }).ok).toBe(false);
    expect(lireNouveauContact({ ...NOUVEAU, civilite: 'Dr' }).ok).toBe(false);
  });

  it('DOUBLON dans l’annuaire du syndic : même nom, même téléphone ou même e-mail — refusé, en nommant le contact existant', () => {
    const c = (o: Partial<typeof NOUVEAU>) => (lireNouveauContact({ ...NOUVEAU, ...o }) as { ok: true; c: Parameters<typeof doublonDansLAnnuaire>[0] }).c;
    expect(doublonDansLAnnuaire(c({ prenom: 'claire', nom: '_test gestionnaire' }), [EXISTANT], 'SYNDIC')).toContain('(le même nom)');
    expect(doublonDansLAnnuaire(c({ telephone: '+33 6 99 99 10 01' }), [EXISTANT], 'SYNDIC')).toBe('Claire _TEST GESTIONNAIRE est déjà dans l’annuaire de SYNDIC (le même téléphone) : rattachez-le depuis la recherche. Rien n’a été créé.');
    expect(doublonDansLAnnuaire(c({ email: 'CLAIRE@fictif.test' }), [EXISTANT], 'SYNDIC')).toContain('(le même e-mail)');
    expect(doublonDansLAnnuaire(c({}), [EXISTANT], 'SYNDIC')).toBeNull();
  });

  it('CRÉÉ dans l’annuaire du syndic + coordonnées + rattaché + journal « cree », dans UNE transaction', async () => {
    const r = await creerEtRattacherContactSyndic('12 rue _test', NOUVEAU, AUTEUR);
    expect(r.etat).toBe('ok');
    const sql = ecrits.map((e) => e.sql);
    expect(sql[0]).toContain('INSERT INTO gestion_syndic_contact (syndic_id, civilite, prenom, nom, titre, rang, cree_par_libelle, tous_immeubles)');
    expect(ecrits[0].params.slice(0, 5)).toEqual([9, 'Mme', 'Zoé', '_Test Nouvelle', 'Gestionnaire']);
    expect(ecrits.filter((e) => e.sql.startsWith('INSERT INTO gestion_syndic_coordonnee')).map((e) => e.params[1])).toEqual(['0699991009', 'zoe@fictif.test']);
    expect(sql.some((x) => x.startsWith('INSERT INTO gestion_syndic_contact_copropriete'))).toBe(true);
    expect(journal.mock.calls[0][1]).toMatchObject({ nature: 'cree', coproId: 30, syndicId: 9 });
    expect(transactions).toBe(1);
  });

  it('TOUT OU RIEN : une écriture qui échoue lève dans la transaction (rien n’est validé) ; un doublon refuse AVANT toute écriture', async () => {
    echec = 'INSERT INTO gestion_syndic_contact_copropriete';
    await expect(creerEtRattacherContactSyndic('12 rue _test', NOUVEAU, AUTEUR)).rejects.toThrow('échec simulé');
    expect(annulees).toBe(1);
    echec = null; ecrits = [];
    annuaire = [{ prenom: 'Zoé', nom: '_TEST NOUVELLE', titre: null, telephones: [], emails: [] }];
    const r = await creerEtRattacherContactSyndic('12 rue _test', NOUVEAU, AUTEUR);
    expect(r).toMatchObject({ etat: 'refus' });
    expect(ecrits).toEqual([]);
  });

  it('un e-mail déjà porté par le contact d’un AUTRE syndic : refusé, rien n’est créé', async () => {
    ailleurs = [{ syndic: 'Cabinet B' }];
    const r = await creerEtRattacherContactSyndic('12 rue _test', NOUVEAU, AUTEUR);
    expect(r).toEqual({ etat: 'refus', motif: 'L’e-mail zoe@fictif.test appartient déjà à un contact du syndic Cabinet B. Rien n’a été créé.' });
    expect(ecrits).toEqual([]);
  });
});

// ══ 🔴 (Arno, 20/11/2026, point 3) changement ou retrait de syndic : les contacts de l'ancien syndic détachés (journal), jamais supprimés ══════════════
import { detacherContactsDeLAncienSyndic } from './contactsSyndicCoproRepo';

describe('changement ou retrait de syndic', () => {
  it('CHANGEMENT : les affectations de l’ANCIEN syndic sur cette copropriété fermées (motif), un journal par contact ; le contact jamais touché', async () => {
    fermes = [{ contact_id: '5', copropriete_id: '30' }, { contact_id: '6', copropriete_id: '30' }];
    await detacherContactsDeLAncienSyndic(q as never, { syndicId: 9, coproId: 30, motif: 'changement de syndic', ecran: 'la fiche copropriété' }, AUTEUR);
    expect(ecrits).toHaveLength(1);
    expect(ecrits[0].sql).toContain('UPDATE gestion_syndic_contact_copropriete a SET retire_le = now()');
    expect(ecrits[0].sql).toContain('a.copropriete_id = $2');
    expect(ecrits[0].params).toEqual([9, 30, '_TEST', 'changement de syndic']);
    expect(ecrits.some((e) => /UPDATE gestion_syndic_contact SET|DELETE/.test(e.sql))).toBe(false);
    expect(journal.mock.calls.map((c) => c[1])).toEqual([{ coproId: '30', syndicId: 9, nature: 'detache', contactIds: [5, 6], ecran: 'la fiche copropriété', motif: 'changement de syndic' }]);
  });

  it('SUPPRESSION du syndic : toutes ses copropriétés — un journal par copropriété, avec ses contacts', async () => {
    fermes = [{ contact_id: '5', copropriete_id: '30' }, { contact_id: '6', copropriete_id: '31' }];
    await detacherContactsDeLAncienSyndic(q as never, { syndicId: 9, motif: 'fermeture définitive', ecran: 'la fiche syndic (suppression du syndic)' }, AUTEUR);
    expect(ecrits[0].params).toEqual([9, '_TEST', 'fermeture définitive']);
    expect(journal.mock.calls.map((c) => [(c[1] as { coproId: string }).coproId, (c[1] as { contactIds: number[] }).contactIds])).toEqual([['30', [5]], ['31', [6]]]);
  });

  it('aucun contact rattaché : rien au journal', async () => {
    await detacherContactsDeLAncienSyndic(q as never, { syndicId: 9, coproId: 30, motif: 'changement de syndic', ecran: 'x' }, AUTEUR);
    expect(journal).not.toHaveBeenCalled();
  });

  it('TOUS les chemins qui ferment un lien syndic passent par la fonction unique', async () => {
    const { readFileSync } = await import('node:fs');
    const copro = readFileSync('app/lib/gestion/coproprieteEcritureRepo.ts', 'utf8');
    const syndic = readFileSync('app/lib/gestion/syndicRepo.ts', 'utf8');
    expect(copro.match(/detacherContactsDeLAncienSyndic\(q, /g)).toHaveLength(2);   // changement, regroupement
    expect(syndic.match(/detacherContactsDeLAncienSyndic\(q, /g)).toHaveLength(2);  // retrait / reprise (via retirerAffectationsDeLaCopro), suppression
    for (const src of [copro, syndic]) expect(src).not.toMatch(/UPDATE gestion_syndic_contact_copropriete a SET retire_le[^`]*FROM gestion_syndic_contact c WHERE a.contact_id = c.id AND c.syndic_id/);
  });
});
