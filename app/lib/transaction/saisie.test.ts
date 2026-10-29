import { describe, expect, it } from 'vitest';
import { lireDossier, lireGestion, lireModification, lireRetro, lireVente, montant } from './saisie';

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

describe('🔴 LOT I — lireDossier : l’unité de la rétrocession et les commissions versées', () => {
  const dossier = (o: Record<string, unknown> = {}) => ({ societe: 'criterimmo', statut: 'compromis', honorairesTtc: '12 000', retroApporteurTtc: '500', ...o });
  it('sans unité (une saisie d’avant) : TTC, comme avant ; aucune commission (rien à toucher)', () => {
    const r = lireDossier(dossier());
    expect(r.ok && r.valeur.retroUnite).toBe('ttc');
    expect(r.ok && 'commissions' in r.valeur).toBe(false);
  });
  it('HT ou TTC par montant ; un montant vide : rien pour ce côté ; une unité inconnue ou un montant négatif : refusés', () => {
    const r = lireDossier(dossier({ retroApporteurUnite: 'ht', commissions: { entree: { montant: '1 000', unite: 'ht' }, sortie: { montant: '', unite: 'ttc' } } }));
    expect(r.ok && r.valeur.retroUnite).toBe('ht');
    expect(r.ok && r.valeur.commissions).toEqual({ entree: { montant: 1000, unite: 'ht' }, sortie: null, taux: { entree: null, sortie: null }, mode: { entree: null, sortie: null } });
    expect(lireDossier(dossier({ retroApporteurUnite: 'eur' })).ok).toBe(false);
    expect(lireDossier(dossier({ commissions: { entree: { montant: '-5', unite: 'ht' } } })).ok).toBe(false);
    expect(lireDossier(dossier({ commissions: { entree: { montant: '5', unite: 'HTT' } } })).ok).toBe(false);
  });
});

describe('🔴 LOT O — une commission proposée à l’écran (« 3 750,00 », espace insécable des milliers) se lit telle quelle', () => {
  it('3 750,00 et 3 750,00 valent 3 750', () => {
    const r = lireDossier({ societe: 'criterimmo', statut: 'compromis', honorairesTtc: '7500', commissions: { entree: { montant: '3 750,00', unite: 'ttc' }, sortie: { montant: '3 750,00', unite: 'ttc' } } });
    expect(r.ok && r.valeur.commissions).toEqual({ entree: { montant: 3750, unite: 'ttc' }, sortie: { montant: 3750, unite: 'ttc' }, taux: { entree: null, sortie: null }, mode: { entree: null, sortie: null } });
  });
});

describe('🔴 LOT R — le taux de rémunération de chaque côté', () => {
  it('lu en % (« 62,5 » compris) ; vide : le défaut ; négatif ou illisible : refusé', () => {
    const base = { societe: 'criterimmo', statut: 'compromis', honorairesTtc: '4000', personnes: [], parties: [] };
    const r = lireDossier({ ...base, commissions: { entree: { montant: '1000', unite: 'ttc', taux: '62,5' }, sortie: { montant: '', unite: 'ttc', taux: null } } });
    expect(r.ok && r.valeur.commissions?.taux).toEqual({ entree: 62.5, sortie: null });
    expect(lireDossier({ ...base, commissions: { entree: { montant: '1000', unite: 'ttc', taux: '-5' }, sortie: null } }).ok).toBe(false);
    expect(lireDossier({ ...base, commissions: { entree: { montant: '1000', unite: 'ttc', taux: 'abc' }, sortie: null } }).ok).toBe(false);
  });
});

describe('🔴 LOT V — le mode de chaque commission', () => {
  it('« calculee » ou « manuelle » ; absent ou inconnu : null (le montant envoyé, comme avant)', () => {
    const base = { societe: 'criterimmo', statut: 'compromis', honorairesTtc: '7500', personnes: [], parties: [] };
    const r = lireDossier({ ...base, commissions: { entree: { montant: '650', unite: 'ttc', mode: 'calculee' }, sortie: { montant: '1625', unite: 'ttc', mode: 'manuelle' } } });
    expect(r.ok && r.valeur.commissions?.mode).toEqual({ entree: 'calculee', sortie: 'manuelle' });
    const x = lireDossier({ ...base, commissions: { entree: { montant: '650', unite: 'ttc', mode: 'auto' }, sortie: null } });
    expect(x.ok && x.valeur.commissions?.mode).toEqual({ entree: null, sortie: null });
  });
});
