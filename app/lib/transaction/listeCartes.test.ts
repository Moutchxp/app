import { describe, expect, it } from 'vitest';
import type { Vente } from './modele';
import { correspond, dateDeCarte, ficheRecherche, lireMontant, normaliser, trierListe } from './listeCartes';

/** 🔴 LOT DJ (Arno) — le tri et la recherche des listes de cartes de « Le mois » et « L'année ». */
const v = (id: number, o: Partial<Vente>): Vente => ({ id, societe: 'criterimmo', libelle: `V${id}`, honorairesTtc: 6000, statut: 'vendue', annee: 2026, mois: 3,
  dateCompromis: null, apporteur: null, note: null, origine: 'saisie', sourceFichier: null, sourceOnglet: null, sourceLigne: null, lignes: [], double: null, ...o } as Vente);
const dossier = (o: Partial<NonNullable<Vente['dossier']>>): NonNullable<Vente['dossier']> => ({ adresseBien: null, dateActePrevue: null, dateActe: null, entree: null, sortie: null, apporteurId: null, personnes: [], ...o });

describe('🔴 LOT DJ — le tri des cartes', () => {
  const liste = [
    v(1, { libelle: 'BETA', honorairesTtc: 9000, mois: 5 }),
    v(2, { libelle: 'ALPHA', honorairesTtc: 9000, mois: 5, dossier: dossier({ dateActe: '2026-05-20' }) }),
    v(3, { libelle: 'GAMMA', honorairesTtc: 3000, mois: null }), // mois à confirmer
    v(4, { libelle: 'DELTA', honorairesTtc: 12000, mois: 1 }),
    v(5, { libelle: 'EPSILON', honorairesTtc: 3000, statut: 'compromis', mois: null, dateCompromis: null }), // compromis sans date
    v(6, { libelle: 'ZETA', honorairesTtc: 4500, statut: 'compromis', mois: null, dateCompromis: '2026-04-02' }),
  ];
  const t = (tri: Parameters<typeof trierListe>[1]) => trierListe(liste, tri, (x) => Math.round(x.honorairesTtc * 100), (x) => x.libelle).map((x) => x.libelle);
  it('les quatre tris ; égalité : alphabétique ; dates manquantes (mois à confirmer, sans date) en fin de liste', () => {
    expect(t('ca-desc')).toEqual(['DELTA', 'ALPHA', 'BETA', 'ZETA', 'EPSILON', 'GAMMA']);
    expect(t('ca-asc')).toEqual(['EPSILON', 'GAMMA', 'ZETA', 'ALPHA', 'BETA', 'DELTA']);
    expect(t('date-recent')).toEqual(['ALPHA', 'BETA', 'ZETA', 'DELTA', 'EPSILON', 'GAMMA']);
    expect(t('date-ancien')).toEqual(['DELTA', 'ZETA', 'BETA', 'ALPHA', 'EPSILON', 'GAMMA']);
  });
  it('la date : l’acte (sinon son mois) pour une vente, le compromis pour un compromis', () => {
    expect([dateDeCarte(liste[1]), dateDeCarte(liste[0]), dateDeCarte(liste[2]), dateDeCarte(liste[5]), dateDeCarte(liste[4])]).toEqual(['2026-05-20', '2026-05-00', null, '2026-04-02', null]);
  });
});

describe('🔴 LOT DJ — la recherche', () => {
  const affaire = v(7, { libelle: 'DUPONT/MARTIN', honorairesTtc: 9000, prixVente: 250000, apporteur: 'Cabinet Hélène',
    lignes: [{ id: 1, negociateur: 'ARNAUD', role: 'negociateur', montantTtc: 7500, nature: 'vente', compte: true, origine: 'saisie', sourceFichier: null, sourceOnglet: null, sourceLigne: null, note: null }],
    dossier: dossier({ adresseBien: '12 rue de l’Église, Asnières', personnes: [
      { id: 1, role: 'vendeur', nom: 'DUPONT', prenom: 'Élodie', telephone: '06 12 34 56 78', email: 'e.dupont@exemple.fr', adresse: null },
      { id: 2, role: 'acquereur', nom: 'SCI LES TILLEULS', type: 'societe', telephone: null, email: null, adresse: null,
        representants: [{ id: 3, civilite: null, nom: 'MARTIN', prenom: 'Josée', telephone: '+33 7 11 22 33 44', email: 'jose@sci.fr', adresse: null }] },
    ] }) });
  const f = ficheRecherche(affaire, { titre: 'DUPONT / SCI LES TILLEULS', vue: 'criterimmo', nommer: (x) => (x === 'ARNAUD' ? 'Arnaud JOREL' : x) });
  it('le nom, les personnes, représentants, négociateurs, apporteur, adresse, e-mail — sans majuscules ni accents', () => {
    for (const q of ['dupont', 'TILLEULS', 'elodie', 'josee martin', 'arnaud jorel', 'helene', 'eglise', 'asnieres', 'e.dupont@exemple', 'JOSE@SCI']) expect([q, correspond(f, q)]).toEqual([q, true]);
    expect([correspond(f, 'durand'), correspond(f, 'dupont durand'), correspond(f, '')]).toEqual([false, false, true]);
  });
  it('le téléphone, chiffres seuls, quel que soit le format', () => {
    for (const q of ['0612', '06 12', '06.12.34', '0612345678', '711 22']) expect([q, correspond(f, q)]).toEqual([q, true]);
    expect(correspond(f, '0699')).toBe(false);
  });
  it('les montants : « 7500 », « 7 500 », « 7500,00 » trouvent 7 500 € ; honoraires (HT, TTC), com négo, prix', () => {
    for (const q of ['7500', '7 500', '7500,00', '7 500 €', '9000', '7 500,00', '250000', '250 000']) expect([q, correspond(f, q)]).toEqual([q, true]);
    expect([correspond(f, '7501'), correspond(f, '7500,50')]).toEqual([false, false]);
    expect([lireMontant('7 500,00'), lireMontant('abc'), normaliser('  Élodie  DUPONT ')]).toEqual([7500, null, 'elodie dupont']);
  });
});
