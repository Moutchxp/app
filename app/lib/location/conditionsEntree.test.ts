import { describe, expect, it } from 'vitest';
import {
  CONDITIONS_VIDES, enCentimes, LIBELLE_JOUR, formaterCentimes, lignesConditions, manquesConditions, totalCentimes, verifierConditions,
  versEnvoiConditions, versSaisieConditions, type SaisieConditions,
} from './conditionsEntree';

/** Arno (20/10/2026) — bloc 3 « Conditions d'entrée » de « Nouveau locataire » : la règle pure (écran ET serveur). */
const COMPLET: SaisieConditions = {
  ...CONDITIONS_VIDES, depot: 'agence', prelevement: false, garant: true, assurance: 'visale',
  honorairesLocataire: 'agence', honorairesProprietaire: 'gestion', reglement: 'virement',
};

describe('🔴 conditions d’entrée — choix obligatoires', () => {
  it('rien de répondu : les six choix manquent, dans l’ordre de la fiche papier ; montants et commentaire jamais', () => {
    expect(Object.keys(manquesConditions(versEnvoiConditions(CONDITIONS_VIDES))))
      .toEqual(['depot', 'prelevement', 'garant', 'assurance', 'honorairesLocataire', 'honorairesProprietaire', 'reglement']);
    expect(manquesConditions(versEnvoiConditions(COMPLET))).toEqual({});
  });

  it('prélèvement Oui : « au 1er », « au 5 », « au 10 » ou « au 15 » exigé ; Non : le jour est vidé à l’envoi', () => {
    expect(manquesConditions(versEnvoiConditions({ ...COMPLET, prelevement: true }))).toEqual({ jour: 'Prélèvement : au 1er, au 5, au 10 ou au 15 ?' });
    for (const j of ['1', '5', '10', '15'] as const) {
      const v = verifierConditions(versEnvoiConditions({ ...COMPLET, prelevement: true, jour: j }));
      expect(v.ok && v.valeurs.jour).toBe(Number(j));
    }
    expect(verifierConditions({ ...versEnvoiConditions(COMPLET), prelevement: true, jour: '20' }).ok).toBe(false);
    expect(LIBELLE_JOUR).toEqual({ 1: 'au 1er', 5: 'au 5', 10: 'au 10', 15: 'au 15' });
    expect(manquesConditions(versEnvoiConditions({ ...COMPLET, prelevement: true, jour: '10' }))).toEqual({});
    expect(versEnvoiConditions({ ...COMPLET, prelevement: false, jour: '5' }).jour).toBeNull();
    const v = verifierConditions(versEnvoiConditions({ ...COMPLET, prelevement: true, jour: '5' }));
    expect(v.ok && v.valeurs.jour).toBe(5);
  });

  it('« préciser » : GLI et Autre exigent le texte ; Visale et Aucune non (le texte est vidé)', () => {
    expect(manquesConditions(versEnvoiConditions({ ...COMPLET, assurance: 'gli', assurancePrecision: '  ' }))).toEqual({ assurancePrecision: 'GLI : précisez laquelle.' });
    expect(manquesConditions(versEnvoiConditions({ ...COMPLET, assurance: 'autre' }))).toEqual({ assurancePrecision: 'Autre assurance : précisez laquelle.' });
    expect(manquesConditions(versEnvoiConditions({ ...COMPLET, reglement: 'autre' }))).toEqual({ reglementPrecision: 'Autre mode de règlement : précisez lequel.' });
    const gli = verifierConditions(versEnvoiConditions({ ...COMPLET, assurance: 'gli', assurancePrecision: ' Assureur X ' }));
    expect(gli.ok && gli.valeurs.assurancePrecision).toBe('Assureur X');
    const visale = verifierConditions(versEnvoiConditions({ ...COMPLET, assurance: 'visale', assurancePrecision: 'reste d’avant' }));
    expect(visale.ok && visale.valeurs.assurancePrecision).toBeNull();
  });

  it('le serveur refuse ce qui manque, avec les mêmes mots', () => {
    expect(verifierConditions({})).toEqual({ ok: false, motif: expect.stringContaining('Dépôt de garantie') });
    expect(verifierConditions({ ...versEnvoiConditions(COMPLET), depot: 'ailleurs' }).ok).toBe(false);
  });
});

describe('🔴 sommes dues à l’entrée — au centime, total calculé, jamais arrondi', () => {
  it('lecture en centimes exacts (français ou anglais, espaces, « € ») ; illisible ou 3 décimales refusé', () => {
    expect([enCentimes('1 180,50'), enCentimes('1180.5'), enCentimes('35 €'), enCentimes('0,07'), enCentimes(''), enCentimes(undefined)])
      .toEqual([118050, 118050, 3500, 7, null, null]);
    expect([enCentimes('12,345'), enCentimes('-5'), enCentimes('douze')]).toEqual([undefined, undefined, undefined]);
  });
  it('le total additionne les seules sommes saisies ; aucune → pas de total ; une illisible → pas de total', () => {
    expect(totalCentimes({ prorataLoyer: '412,26', prorataCharges: '33,33', depotGarantie: '1 180', honorairesAgence: '0,1' })).toBe(41226 + 3333 + 118000 + 10);
    expect(totalCentimes({ prorataLoyer: '0,1', prorataCharges: '0,2' })).toBe(30);
    expect(totalCentimes({})).toBeNull();
    expect(totalCentimes({ prorataLoyer: '10', depotGarantie: 'abc' })).toBeNull();
    expect(formaterCentimes(162569).replace(/\s/g, ' ')).toBe('1 625,69 €');
  });
  it('un montant mal écrit est un manque (jamais ignoré) ; les montants sont facultatifs', () => {
    expect(manquesConditions(versEnvoiConditions({ ...COMPLET, sommes: { ...COMPLET.sommes, depotGarantie: '12,345' } })))
      .toEqual({ 'somme-depotGarantie': 'Dépôt de garantie : un montant en euros, au centime (ex. 1 180,50).' });
  });
});

describe('🔴 relecture : encart et « Modifier »', () => {
  it('les lignes de l’encart (total compris) ; la saisie se rouvre à l’identique', () => {
    const v = verifierConditions(versEnvoiConditions({ ...COMPLET, prelevement: true, jour: '10', assurance: 'gli', assurancePrecision: 'Assureur X',
      sommes: { prorataLoyer: '412,26', prorataCharges: '', depotGarantie: '1 180', honorairesAgence: '' }, commentaire: 'clés remises' }));
    if (!v.ok) throw new Error(v.motif);
    expect(lignesConditions(v.valeurs).map((l) => `${l.mot} : ${l.valeur}`.replace(/\s/g, ' '))).toEqual([
      'Dépôt de garantie : Conservé par l’agence', 'Prélèvement : Oui, au 10', 'Garant personne physique : Oui',
      'Assurance loyers impayés : GLI — Assureur X', 'Honoraires du locataire : Compte bancaire agence',
      'Honoraires du propriétaire : Compte bancaire gestion', 'Prorata loyer : 412,26 €', 'Dépôt de garantie : 1 180,00 €',
      'Total dû à l’entrée : 1 592,26 €', 'Mode de règlement : Virement', 'Commentaires : clés remises',
    ]);
    const s = versSaisieConditions(v.valeurs);
    expect(s.sommes).toEqual({ prorataLoyer: '412,26', prorataCharges: '', depotGarantie: '1180', honorairesAgence: '' });
    expect(verifierConditions(versEnvoiConditions(s))).toEqual(v);
  });
});
