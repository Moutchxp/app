import { describe, expect, it } from 'vitest';
import { ajouterJours, jourParisDe, type Tache } from './taches';
import {
  chercherTaches, collaborateursDesTaches, filtrerTachesPleinePage, FILTRES_TACHES_VIDES, lirePreferencesTaches, PREFERENCES_TACHES_DEFAUT,
  statutsDeLaTache, trierTachesPleinePage,
} from './tachesPleinePage';

/**
 * 🔴🔴 LA PLEINE PAGE « TÂCHES » (Arno, 10/11/2026) — les règles pures : recherche, chaque tri dans les deux sens, chaque filtre cumulable,
 * les préférences conservées. Les règles du bloc (échéance, statut, ordre) sont les mêmes.
 */
const MAINTENANT = new Date('2026-11-10T09:00:00Z');
const AUJ = jourParisDe(MAINTENANT);
const acc = (statut: 'en_attente' | 'acceptee' | 'refusee') => ({ statut, automatique: false, destinataireId: 4, destinataireLibelle: 'Claire Test', demandeurId: 3,
  demandeurLibelle: 'Arno', demandeLe: '2026-11-01T08:00:00Z', reponduLe: null, reponduParLibelle: null, motif: null, mailEtat: 'envoye' as const, mailLe: null });
const t = (p: Partial<Tache>): Tache => ({
  id: 0, lotId: 27, lotCle: '26', adresseBien: '4 rue Fictive', evenement: null, objet: 'x', note: null, jour: AUJ, heure: null, rappels: [], etat: 'a_faire',
  confieeA: 4, confieeALibelle: 'Claire Test', creeLe: '2026-11-01T08:00:00Z', creeParLibelle: 'Arno Test', majLe: '2026-11-01T08:00:00Z', faiteLe: null,
  faiteParLibelle: null, annuleeLe: null, annuleeParLibelle: null, nbContacts: 0, ...p,
});
const T = [
  t({ id: 1, objet: 'Relancer le plombier', jour: ajouterJours(AUJ, -3), creeLe: '2026-10-01T08:00:00Z', acceptation: acc('acceptee') }),
  t({ id: 2, objet: 'Visite', jour: AUJ, heure: '15:00', creeLe: '2026-11-05T08:00:00Z', acceptation: acc('en_attente'), lotId: null, adresseBien: '' }),
  t({ id: 3, objet: 'État des lieux', jour: ajouterJours(AUJ, 2), creeLe: '2026-10-20T08:00:00Z', acceptation: acc('refusee'), confieeALibelle: 'Paul Test',
    contactsResume: [{ nom: 'DUPONT Jean', famille: 'locataire' }] }),
  t({ id: 4, objet: 'Clés', jour: ajouterJours(AUJ, 9), creeLe: '2026-11-08T08:00:00Z', adresseBien: '12 rue des Lilas, Paris' }),
  t({ id: 5, objet: 'Ancienne', etat: 'faite', faiteLe: '2026-11-09T08:00:00Z', creeLe: '2026-09-01T08:00:00Z' }),
  t({ id: 6, objet: 'Abandonnée', etat: 'annulee', annuleeLe: '2026-11-08T08:00:00Z', creeLe: '2026-09-15T08:00:00Z' }),
];
const ids = (l: readonly Tache[]) => l.map((x) => x.id);

describe('tris, chacun dans les deux sens', () => {
  it('par défaut : l’ordre du bloc (à faire par échéance, puis terminées, la plus récente d’abord)', () => {
    expect(ids(trierTachesPleinePage(T, { cle: 'defaut', sens: 'asc' }, MAINTENANT))).toEqual([1, 2, 3, 4, 5, 6]);
  });
  it.each([
    ['echeance', 'asc', [1, 5, 6, 2, 3, 4]], ['echeance', 'desc', [4, 3, 2, 5, 6, 1]],
    ['creation', 'asc', [5, 6, 1, 3, 2, 4]], ['creation', 'desc', [4, 2, 3, 1, 6, 5]],
    ['statut', 'asc', [2, 1, 3, 4, 5, 6]], ['statut', 'desc', [6, 5, 4, 3, 1, 2]],
  ] as const)('%s %s', (cle, sens, attendu) => {
    expect(ids(trierTachesPleinePage(T, { cle, sens }, MAINTENANT))).toEqual(attendu);
  });
});

describe('filtres cumulables', () => {
  const f = (o: Partial<typeof FILTRES_TACHES_VIDES>) => ids(filtrerTachesPleinePage(T, { ...FILTRES_TACHES_VIDES, ...o }, MAINTENANT));
  it('échéance (un ou plusieurs) : les terminées n’ont pas d’échéance', () => {
    expect(f({ echeances: ['retard'] })).toEqual([1]);
    expect(f({ echeances: ['jour', 'proche'] })).toEqual([2, 3]);
    expect(f({ echeances: ['plus_tard'] })).toEqual([4]);
  });
  it('statut : en attente, acceptée, refusée, à réattribuer, faite, annulée', () => {
    expect(f({ statuts: ['en_attente'] })).toEqual([2]);
    expect(f({ statuts: ['acceptee'] })).toEqual([1]);
    expect(f({ statuts: ['refusee'] })).toEqual([3]);
    expect(f({ statuts: ['a_reattribuer'] })).toEqual([3]);
    expect(f({ statuts: ['faite', 'annulee'] })).toEqual([5, 6]);
    expect(statutsDeLaTache(T[2])).toEqual(['refusee', 'a_reattribuer']);
  });
  it('collaborateur destinataire, avec ou sans bien, et les groupes se combinent', () => {
    expect(f({ collaborateur: 'Paul Test' })).toEqual([3]);
    expect(f({ bien: 'sans' })).toEqual([2]);
    expect(f({ bien: 'avec' })).toEqual([1, 3, 4, 5, 6]);
    expect(f({ echeances: ['retard', 'jour'], bien: 'avec' })).toEqual([1]);
    expect(collaborateursDesTaches(T)).toEqual(['Claire Test', 'Paul Test']);
  });
});

describe('recherche : intitulé, bien / adresse, locataire, collaborateur (sans accents ni casse)', () => {
  it.each([['plombier', [1]], ['LILAS', [4]], ['dupont', [3]], ['paul', [3]], ['etat des lieux', [3]], ['', [1, 2, 3, 4, 5, 6]]] as const)('« %s »', (q, attendu) => {
    expect(ids(chercherTaches(T, q))).toEqual(attendu);
  });
});

describe('préférences conservées', () => {
  it('relues telles qu’écrites ; tout ce qui n’est pas reconnu reprend la valeur par défaut', () => {
    const p = { tri: { cle: 'creation', sens: 'desc' }, filtres: { echeances: ['retard'], statuts: ['faite'], collaborateur: 'Paul Test', bien: 'sans' }, qui: 'confiees', statut: 'refusee', pastille: 'jour' };
    expect(lirePreferencesTaches(JSON.stringify(p))).toEqual(p);
    expect(lirePreferencesTaches(null)).toEqual(PREFERENCES_TACHES_DEFAUT);
    expect(lirePreferencesTaches('{"tri":{"cle":"x"},"filtres":{"echeances":["zzz"],"bien":"?"},"qui":"?"}')).toEqual(PREFERENCES_TACHES_DEFAUT);
    expect(lirePreferencesTaches('pas du json')).toEqual(PREFERENCES_TACHES_DEFAUT);
  });
});
