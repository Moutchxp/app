import { describe, expect, it } from 'vitest';
import { syndicsQuiRepondent, type SyndicResume } from './syndics';
import { normaliserTexte } from './annuaire';

/** 🔴 Arno (17/11/2026) — « la recherche des syndics existants (nom, e-mail, téléphone, résultats au fil de la frappe, accents et majuscules ignorés) ». PUR. */
const S = (id: number, nom: string, email: string, telephones: string[]): SyndicResume => ({ id, nom, email, telephone: null, ville: 'Asnières', nbCoproprietes: 0, nbBiens: 0,
  cherchable: normaliserTexte([nom, 'Asnières', email, email.split('@')[1]].join(' ')), telephones });
const LISTE = [S(1, '_TEST SYNDIC Élysée', 'contact@test-syndic.invalid', ['0140000001']), S(2, 'Autre Cabinet', 'autre@exemple.invalid', ['0611223344'])];
const ids = (q: string) => syndicsQuiRepondent(q, LISTE).map((s) => s.id);

describe('🔴 la recherche des syndics : nom, e-mail, téléphone', () => {
  it('le nom, accents et majuscules ignorés ; l’e-mail', () => {
    expect(ids('_test syndic elysee')).toEqual([1]);
    expect(ids('ÉLYSÉE')).toEqual([1]);
    expect(ids('CONTACT@TEST-SYNDIC')).toEqual([1]);
  });
  it('le téléphone, tapé avec espaces, points ou +33 (au moins 4 chiffres)', () => {
    expect(ids('01 40 00 00 01')).toEqual([1]);
    expect(ids('+33 6 11 22')).toEqual([2]);
    expect(ids('06.11.22.33.44')).toEqual([2]);
    expect(ids('014')).toEqual([]); // trop court pour un téléphone, et ne figure dans aucun nom
  });
  it('rien tapé : tous ; un texte qui ne répond à rien : aucun', () => {
    expect(ids('')).toEqual([1, 2]);
    expect(ids('_TEST SYNDIC INCONNU')).toEqual([]);
  });
});
