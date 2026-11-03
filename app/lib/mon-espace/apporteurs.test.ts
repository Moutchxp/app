import { describe, expect, it } from 'vitest';
import type { Apporteur } from '../location/suivi/suivi';
import type { LigneApporteur } from '../transaction/modele';
import { chercherApporteur, doublonsApporteur, emailComparable, mesApporteursAnnuaire, messageDoublon, peutModifierApporteur, telephoneComparable } from './apporteurs';

/**
 * 🔴 MON ESPACE, LOT 9 — « Mes apporteurs » (pur) : zéro doublon (homonyme, même téléphone, même e-mail, fiche principale et autres), qui je vois,
 * qui peut modifier, la recherche (nom, téléphone, e-mail).
 */
const JOUR = '2026-11-02';
const ap = (o: Partial<Apporteur> & { id: number; nom: string }): Apporteur => ({ type: 'partenaire', baremes: [], archive: false, collegues: [], ...o } as Apporteur);
const rattache = (collegueId: number, collegueLibelle: string) => [{ depuis: '0001-01-01', collegueId, collegueLibelle }];
const ANNUAIRE: Apporteur[] = [
  ap({ id: 1, nom: 'DURAND Paul', nomFamille: 'DURAND', prenom: 'Paul', telephone: '06 12 34 56 78', email: 'paul@durand.fr', collegues: rattache(7, 'Marc') }),
  ap({ id: 2, nom: 'MARTIN Lise', telephone: '+33 7 11 22 33 44', emailsAutres: ['lise.pro@cabinet.fr'], collegues: rattache(5, 'Léa') }),
  ap({ id: 3, nom: 'Léa ITEST', compteId: 5, compteLibelle: 'Léa' }),
  ap({ id: 4, nom: 'ANCIEN Jean', archive: true, telephone: '0600000000', collegues: rattache(5, 'Léa') }),
  ap({ id: 5, nom: 'SANS Rattachement' }),
];
const saisie = (o: Partial<{ nom: string; prenom: string; telephone: string; email: string }>) => ({ nom: '', prenom: '', telephone: '', email: '', ...o });

describe('🔴 zéro doublon : homonyme, même téléphone, même e-mail', () => {
  it('téléphones et e-mails comparables : espaces, +33, 0033, casse ; trop court ou sans @ : rien', () => {
    expect(telephoneComparable('06 12 34 56 78')).toBe(telephoneComparable('+33612345678'));
    expect(telephoneComparable('0033 6 12 34 56 78')).toBe(telephoneComparable('0612345678'));
    expect(telephoneComparable('1234')).toBeNull();
    expect(emailComparable('  Paul@Durand.FR ')).toBe('paul@durand.fr');
    expect(emailComparable('paul')).toBeNull();
  });
  it('un homonyme (prénom + nom, dans les deux ordres) est proposé avec son collègue', () => {
    const d = doublonsApporteur(saisie({ prenom: 'paul', nom: 'Durand' }), ANNUAIRE, JOUR);
    expect(d).toEqual([{ id: 1, libelle: expect.any(String), collegue: 'Marc', raisons: ['nom'] }]);
    expect(messageDoublon(d[0])).toMatch(/^Cet apporteur existe déjà, rattaché à Marc/);
  });
  it('le même téléphone (autre écriture) ou le même e-mail (même « autre ») : doublon, même sous un autre nom', () => {
    expect(doublonsApporteur(saisie({ nom: 'Quelqu’un', telephone: '07.11.22.33.44' }), ANNUAIRE, JOUR).map((x) => [x.id, x.raisons])).toEqual([[2, ['telephone']]]);
    expect(doublonsApporteur(saisie({ nom: 'Autre', email: 'LISE.PRO@cabinet.fr' }), ANNUAIRE, JOUR).map((x) => [x.id, x.raisons])).toEqual([[2, ['email']]]);
    expect(messageDoublon(doublonsApporteur(saisie({ nom: 'Autre', email: 'lise.pro@cabinet.fr' }), ANNUAIRE, JOUR)[0])).toContain('(même e-mail)');
  });
  it('un apporteur interne est dit « apporteur interne » ; un orphelin « à rattacher » ; une fiche archivée n’est jamais un doublon', () => {
    expect(doublonsApporteur(saisie({ nom: 'Léa ITEST' }), ANNUAIRE, JOUR)[0].collegue).toBe('Léa (apporteur interne)');
    expect(messageDoublon(doublonsApporteur(saisie({ nom: 'SANS Rattachement' }), ANNUAIRE, JOUR)[0])).toContain('(à rattacher)');
    expect(doublonsApporteur(saisie({ nom: 'Nouveau', telephone: '06 00 00 00 00' }), ANNUAIRE, JOUR)).toEqual([]);
  });
  it('rien de commun : aucun doublon', () => {
    expect(doublonsApporteur(saisie({ prenom: 'Zoé', nom: 'NOUVELLE', telephone: '0699999999', email: 'zoe@nouvelle.fr' }), ANNUAIRE, JOUR)).toEqual([]);
  });
});

describe('🔴 qui je vois, qui modifie', () => {
  const vide = { idsSurMesVentes: new Set<number>(), nomsSurMesVentes: new Set<string>(), utilises: new Set<number>(), lignes: [] as LigneApporteur[] };
  it('Léa (5) : rattachés à elle, son compte interne ; pas ceux de Marc ; jamais une fiche archivée', () => {
    expect(mesApporteursAnnuaire(ANNUAIRE, { compteId: 5, administrateur: false, jour: JOUR, ...vide }).map((a) => a.id).sort()).toEqual([2, 3]);
  });
  it('+ ceux de ses ventes (dossier ou nom écrit) et ceux qu’elle « utilise »', () => {
    expect(mesApporteursAnnuaire(ANNUAIRE, { compteId: 5, administrateur: false, jour: JOUR, ...vide, idsSurMesVentes: new Set([1]) }).map((a) => a.id)).toContain(1);
    expect(mesApporteursAnnuaire(ANNUAIRE, { compteId: 5, administrateur: false, jour: JOUR, ...vide, nomsSurMesVentes: new Set(['durand paul']) }).map((a) => a.id)).toContain(1);
    expect(mesApporteursAnnuaire(ANNUAIRE, { compteId: 5, administrateur: false, jour: JOUR, ...vide, utilises: new Set([5]) }).map((a) => a.id)).toContain(5);
  });
  it('un administrateur voit tout l’annuaire vivant', () => {
    expect(mesApporteursAnnuaire(ANNUAIRE, { compteId: 99, administrateur: true, jour: JOUR, ...vide }).map((a) => a.id).sort()).toEqual([1, 2, 3, 5]);
  });
  it('les chiffres viennent de `parApporteur` (mes ventes) : ventes et CA apporté', () => {
    const lignes: LigneApporteur[] = [{ apporteur: 'DURAND Paul', nbRetrocessions: 1, retroHt: 500, ventesIds: [10, 11], caApporteHt: 8000 } as LigneApporteur];
    const a = mesApporteursAnnuaire(ANNUAIRE, { compteId: 5, administrateur: false, jour: JOUR, ...vide, lignes }).find((x) => x.id === 1)!;
    expect([a.nbVentes, a.caApporteHt, a.retroHt, a.modifiable]).toEqual([2, 8000, 500, false]);
  });
  it('modifier : le collègue de rattachement, l’interne lui-même, un administrateur ; personne d’autre', () => {
    expect(peutModifierApporteur(ANNUAIRE[0], 7, false, JOUR)).toBe(true);
    expect(peutModifierApporteur(ANNUAIRE[0], 5, false, JOUR)).toBe(false);
    expect(peutModifierApporteur(ANNUAIRE[2], 5, false, JOUR)).toBe(true);
    expect(peutModifierApporteur(ANNUAIRE[0], 5, true, JOUR)).toBe(true);
  });
  it('la recherche : nom, téléphone (chiffres), e-mail', () => {
    const tous = mesApporteursAnnuaire(ANNUAIRE, { compteId: 1, administrateur: true, jour: JOUR, ...vide });
    expect(chercherApporteur(tous, 'durand').map((a) => a.id)).toEqual([1]);
    expect(chercherApporteur(tous, '06 12 34').map((a) => a.id)).toEqual([1]);
    expect(chercherApporteur(tous, 'paul@durand').map((a) => a.id)).toEqual([1]);
    expect(chercherApporteur(tous, '')).toHaveLength(4);
  });
});

describe('🔴 D32 (option B) — « Me rattacher cet apporteur » : un collaborateur, un apporteur « à rattacher » seulement', () => {
  const vide = { idsSurMesVentes: new Set<number>(), nomsSurMesVentes: new Set<string>(), utilises: new Set<number>(), lignes: [] as LigneApporteur[] };
  it('Léa voit « SANS Rattachement » (sur ses ventes) : elle peut se le rattacher ; pas DURAND (Marc), pas son compte interne ; un administrateur : jamais ce bouton', () => {
    const l = mesApporteursAnnuaire(ANNUAIRE, { compteId: 5, administrateur: false, jour: JOUR, ...vide, idsSurMesVentes: new Set([1, 5]) });
    expect(l.filter((a) => a.peutSeRattacher === true).map((a) => a.id)).toEqual([5]);
    expect(l.find((a) => a.id === 5)?.modifiable).toBe(false);
    expect(mesApporteursAnnuaire(ANNUAIRE, { compteId: 1, administrateur: true, jour: JOUR, ...vide }).some((a) => a.peutSeRattacher === true)).toBe(false);
  });
});
