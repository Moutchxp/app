import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';

/**
 * 🔴🔴 Arno (20/11/2026, lot 7d) — Transaction et fiche syndic : le format unique À CÔTÉ de la chaîne, jamais à sa place ; seule une adresse TOUCHÉE et
 * choisie dans la liste le remplit ; une chaîne inchangée n'est jamais réécrite (les actes, PDF et mails gardent le même texte).
 */
const h = vi.hoisted(() => ({ poses: [] as unknown[] }));
vi.mock('../db/client', () => ({ query: async () => ({ rows: [{ ok: true }] }) }));
vi.mock('./banRepo', () => ({ rapprocherAdresse: async (a: unknown) => { h.poses.push(a); return { statut: 'certain', codePostal: '75019',
  ban: { id: '75119_5560_00003', libelle: '3 Rue des Lilas', numero: 3, suffixe: null, insee: '75119', commune: 'Paris' } }; } }));
beforeEach(() => { h.poses = []; });
const { decouperAdresseTexte, enregistrerAdresseTexte } = await import('./personneAdresseRepo');
const { lireDossier } = await import('../transaction/saisie');
const { versSaisie, validerSyndic } = await import('../gestion/syndics');

describe('une adresse gardée en une chaîne', () => {
  it('« voie, code postal commune » se découpe ; une chaîne sans code postal reste la voie', () => {
    expect(decouperAdresseTexte('3 Rue des Lilas, 75019 Paris')).toEqual({ adresse: '3 Rue des Lilas', codePostal: '75019', commune: 'Paris' });
    expect(decouperAdresseTexte('Lieu-dit Les Prés')).toEqual({ adresse: 'Lieu-dit Les Prés', codePostal: null, commune: null });
    expect(decouperAdresseTexte('  ')).toEqual({ adresse: null, codePostal: null, commune: null });
  });
  it('choisie dans la liste : rapprochée (voie, code postal, commune) et posée ; saisie libre ou tapée sans choisir : rien n’est rapproché', async () => {
    const q = vi.fn(async (sql: string) => ({ rows: sql.includes('SELECT id::text, ban_id') ? [] : [] }));
    expect(await enregistrerAdresseTexte(q as never, 'transaction_vente', 196, '3 Rue des Lilas, 75019 Paris', 'liste', { id: 2, libelle: 'a.jorel@sansvisavis.com' })).toBe('pose');
    expect(h.poses).toEqual([{ texte: '3 Rue des Lilas', codePostal: '75019', commune: 'Paris' }]);
    h.poses = [];
    expect(await enregistrerAdresseTexte(q as never, 'transaction_personne', 8, 'BP 12, 92001 Nanterre CEDEX', 'libre', { id: 2, libelle: 'x' })).toBe('rien');
    expect(await enregistrerAdresseTexte(q as never, 'syndic', 3, '1 rue X', null, { id: 2, libelle: 'x' })).toBe('rien');
    expect(h.poses).toEqual([]);
  });
});

describe('Transaction : la nature ne part que si l’on a touché à l’adresse', () => {
  const base = { societe: 'criterimmo', statut: 'compromis', libelle: 'DUPONT', honorairesTtc: '1000', dateCompromis: '2026-11-02', dateActePrevue: null, dateActe: null, note: '',
    entreeId: null, sortieId: null, apporteurId: null, retroApporteurTtc: '0', personnes: [{ id: null, role: 'vendeur', nom: 'DUPONT', telephone: '', email: '', adresse: '3 Rue des Lilas, 75019 Paris' }], parties: [] };
  it('non touchée : aucune nature (le dossier lu est celui d’avant) ; choisie dans la liste : « liste » sur le bien et sur la personne', () => {
    const avant = lireDossier({ ...base, adresseBien: '12 rue X, 92400 Courbevoie' });
    expect(avant.ok && 'adresseBienNature' in avant.valeur).toBe(false);
    expect(avant.ok && 'adresseNature' in avant.valeur.personnes[0]).toBe(false);
    const apres = lireDossier({ ...base, adresseBien: '3 Rue des Lilas, 75019 Paris', adresseBienNature: 'liste', personnes: [{ ...base.personnes[0], adresseNature: 'liste' }] });
    expect(apres.ok && [apres.valeur.adresseBienNature, apres.valeur.personnes[0].adresseNature]).toEqual(['liste', 'liste']);
  });
  it('le dépôt n’écrit le format unique que si la chaîne a CHANGÉ (bien et fiches), dans la transaction de l’enregistrement', () => {
    const src = readFileSync('app/lib/transaction/repo.ts', 'utf8');
    expect(src).toContain("if ((s.adresseBien ?? null) !== adresseAvant && (id !== null || s.adresseBien !== null)) {");
    expect(src).toContain("if (p.adresse !== null) await enregistrerAdresseTexte(q, 'transaction_personne', pid, p.adresse, p.adresseNature,");
    expect(src).toContain("if (typeof maj.adresse === 'string' && maj.adresse !== adresseAvant) {");
  });
});

describe('Fiche syndic : la nature de l’adresse du cabinet', () => {
  const form = { nom: 'CABINET _TEST', adresse: '8 Rue Denfert-Rochereau', codePostal: '92100', ville: 'Boulogne-Billancourt', telephones: [''], email: '', note: '', contacts: [], immeubles: [], lotNote: null, noteBien: '' };
  it('non touchée : rien de plus dans la saisie ; choisie : « liste » ; le serveur la relit', () => {
    expect('adresseNature' in versSaisie(form as never)).toBe(false);
    expect(versSaisie({ ...form, adresseNature: 'liste' } as never).adresseNature).toBe('liste');
    const v = validerSyndic({ ...versSaisie({ ...form, adresseNature: 'liste' } as never) });
    expect(v.ok && v.syndic.adresseNature).toBe('liste');
  });
  it('le serveur ne pose le format unique que si la rue, le code postal ou la ville ont changé', () => {
    const src = readFileSync('app/lib/gestion/syndicRepo.ts', 'utf8');
    expect(src).toContain('apres.adresse !== adresseAvant.adresse || apres.codePostal !== adresseAvant.codePostal || apres.ville !== adresseAvant.ville');
    expect(src).toMatch(/if \(touchee\) \{\s+await enregistrerAdressePersonne\(q, 'syndic', syndicId,/);
  });
});
