import { describe, expect, it } from 'vitest';
import { lireGestion, lireModification, lireRetro, lireVente, montant } from './saisie';

/** TUILE « TRANSACTION » — la lecture des saisies : refus en français, montants tels que saisis (aucun arrondi). */
describe('saisie d’une vente', () => {
  const base = { societe: 'macj', libelle: 'GAVEZ DE CAMPOS / ASMAR', honorairesTtc: '11 025', statut: 'vendue', annee: 2025, mois: 1,
    dateCompromis: '', apporteur: '', note: '', parts: [{ negociateur: 'MYLENE', role: 'negociateur', montantTtc: '3215' }, { negociateur: '', role: 'part', montantTtc: '' }] };
  it('lit une vente complète ; une ligne de part vide ne compte pas', () => {
    const r = lireVente(base);
    expect(r).toEqual({ ok: true, valeur: { societe: 'macj', libelle: 'GAVEZ DE CAMPOS / ASMAR', honorairesTtc: 11025, statut: 'vendue', annee: 2025, mois: 1,
      dateCompromis: null, apporteur: null, note: null, parts: [{ negociateur: 'MYLENE', role: 'negociateur', montantTtc: 3215 }] } });
  });
  it('mois vide = « mois à confirmer » ; montants décimaux à la virgule', () => {
    const r = lireVente({ ...base, mois: '', honorairesTtc: '8837,5' });
    expect(r.ok && r.valeur.mois).toBeNull();
    expect(r.ok && r.valeur.honorairesTtc).toBe(8837.5);
  });
  it('refuse : société, libellé, honoraires négatifs, mois 13, date illisible, rôle inconnu', () => {
    expect(lireVente({ ...base, societe: 'autre' })).toEqual({ ok: false, motif: 'Société inconnue.' });
    expect(lireVente({ ...base, libelle: '  ' }).ok).toBe(false);
    expect(lireVente({ ...base, honorairesTtc: '-5' }).ok).toBe(false);
    expect(lireVente({ ...base, mois: 13 }).ok).toBe(false);
    expect(lireVente({ ...base, dateCompromis: '12/03/2025' }).ok).toBe(false);
    expect(lireVente({ ...base, parts: [{ negociateur: 'X', role: 'patron', montantTtc: 1 }] }).ok).toBe(false);
  });
  it('une modification ne porte que ses champs ; vide = refus', () => {
    expect(lireModification({ mois: 4 })).toEqual({ ok: true, valeur: { mois: 4 } });
    expect(lireModification({ mois: '' })).toEqual({ ok: true, valeur: { mois: null } });
    expect(lireModification({})).toEqual({ ok: false, motif: 'Aucun champ à modifier.' });
  });
});

describe('saisie d’une rétrocession et de la gestion du mois', () => {
  it('rétrocession : négociateur et montant obligatoires ; venteId facultatif', () => {
    expect(lireRetro({ societe: 'criterimmo', annee: 2025, mois: 2, negociateur: 'CEDRIC', montantTtc: '1300' }))
      .toEqual({ ok: true, valeur: { societe: 'criterimmo', annee: 2025, mois: 2, negociateur: 'CEDRIC', montantTtc: 1300, apporteur: null, venteId: null } });
    expect(lireRetro({ societe: 'criterimmo', annee: 2025, mois: 2, negociateur: '', montantTtc: 1 }).ok).toBe(false);
  });
  it('gestion : champs vides = null, montants lus tels quels', () => {
    expect(lireGestion({ nbLots: '286', honorairesHt: '15345,12', adhocHt: '2767.2', salarieHt: '', resteHt: '', note: '' }))
      .toEqual({ ok: true, valeur: { nbLots: 286, honorairesHt: 15345.12, adhocHt: 2767.2, salarieHt: null, resteHt: null, note: null } });
    expect(lireGestion({ nbLots: '-1' }).ok).toBe(false);
  });
  it('montant : nombre, texte français, illisible', () => {
    expect(montant('1 234,56 €')).toBe(1234.56);
    expect(montant('')).toBeNull();
    expect(montant('douze')).toBeUndefined();
  });
});
