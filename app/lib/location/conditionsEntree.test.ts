import { describe, expect, it } from 'vitest';
import {
  CONDITIONS_VIDES, enCentimes, eurosExacts, formuleProrata, LIBELLE_JOUR, montantDeuxDecimales, prorataEntree, totalLoyerCentimes, formaterCentimes, lignesConditions, manquesConditions, totalCentimes, verifierConditions,
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

describe('🔴 loyer mensuel à l’entrée (Arno, 20/10/2026) — facultatif, au centime exact', () => {
  it('total charges comprises : la somme exacte ; un seul des deux suffit ; rien → pas de total ; illisible → pas de total', () => {
    expect(totalLoyerCentimes({ principal: '1 180,10', provisions: '0,2' })).toBe(118030);
    expect(totalLoyerCentimes({ principal: '980', provisions: '' })).toBe(98000);
    expect(totalLoyerCentimes({ principal: '', provisions: '' })).toBeNull();
    expect(totalLoyerCentimes({ principal: '980', provisions: '9,999' })).toBeNull();
    expect(eurosExacts(118030)).toBe('1180.30');
  });
  it('facultatif, mais jamais mal écrit : un manque par champ illisible ; les lignes de l’encart (loyer, provisions, total)', () => {
    expect(manquesConditions(versEnvoiConditions({ ...COMPLET, loyer: { principal: 'abc', provisions: '1,234' } }))).toEqual({
      'loyer-principal': 'Loyer principal : un montant en euros, au centime (ex. 1 180,50).',
      'loyer-provisions': 'Provision pour charges : un montant en euros, au centime (ex. 90).' });
    const v = verifierConditions(versEnvoiConditions(COMPLET));
    if (!v.ok) throw new Error(v.motif);
    expect(lignesConditions(v.valeurs, null, { principal: 98000, provisions: 9050 }).filter((l) => ['Loyer principal', 'Provision pour charges', 'Total loyer charges comprises / mois'].includes(l.mot))
      .map((l) => `${l.mot} : ${l.valeur}`.replace(/\s/g, ' '))).toEqual(['Loyer principal : 980,00 €', 'Provision pour charges : 90,50 €', 'Total loyer charges comprises / mois : 1 070,50 €']);
    expect(versSaisieConditions(v.valeurs, { principal: 98000, provisions: 9050 }).loyer).toEqual({ principal: '980', provisions: '90,50' });
  });
});

describe('🔴 prorata du mois d’entrée (Arno, 20/10/2026) — jour d’entrée inclus, jours réels du mois, arrondi au centime à la fin', () => {
  it('entrée 20/10/2026, loyer 1 240 €, charges 180 € → 12/31 jours → 480,00 € et 69,68 €', () => {
    expect(prorataEntree(124000, '2026-10-20')).toEqual({ centimes: 48000, jours: 12, joursDuMois: 31, du: '20/10', au: '31/10' });
    expect(prorataEntree(18000, '2026-10-20')).toEqual({ centimes: 6968, jours: 12, joursDuMois: 31, du: '20/10', au: '31/10' });
    expect(montantDeuxDecimales(6968)).toBe('69,68');
    expect(formuleProrata(124000, prorataEntree(124000, '2026-10-20')!).replace(/\s/g, ' ')).toBe('1 240,00 € × 12/31 jours (du 20/10 au 31/10)');
  });
  it('01/11/2026 → 30/30 (mois entier) ; 15/02/2027 → 14/28 ; 15/02/2028 (bissextile) → 15/29 ; 31/10/2026 → 1/31', () => {
    expect(prorataEntree(124000, '2026-11-01')).toMatchObject({ centimes: 124000, jours: 30, joursDuMois: 30 });
    expect(prorataEntree(124000, '2027-02-15')).toMatchObject({ centimes: 62000, jours: 14, joursDuMois: 28 });
    expect(prorataEntree(124000, '2028-02-15')).toMatchObject({ centimes: 64138, jours: 15, joursDuMois: 29 }); // 641,379… → 641,38
    expect(prorataEntree(124000, '2026-10-31')).toMatchObject({ centimes: 4000, jours: 1, joursDuMois: 31, du: '31/10', au: '31/10' });
  });
  it('arrondi au centime le plus proche, à la FIN seulement (demi supérieur) ; jamais de flottant', () => {
    // 1,00 € × 1/31 = 3,2258… centimes → 3 centimes.
    expect(prorataEntree(100, '2026-10-31')!.centimes).toBe(3);
    expect(prorataEntree(1550, '2026-10-31')!.centimes).toBe(50); // 15,50 € / 31 = 0,50 € exact
    expect(prorataEntree(1551, '2026-10-31')!.centimes).toBe(50); // 50,03… → 50
    expect(prorataEntree(1566, '2026-10-31')!.centimes).toBe(51); // 50,516… → 51 (le plus proche)
    expect(prorataEntree(31, '2026-10-16')!.centimes).toBe(16); // 31 × 16/31 = 16 exact
  });
  it('date ou montant manquant (ou date impossible) : pas de prorata', () => {
    expect(prorataEntree(null, '2026-10-20')).toBeNull();
    expect(prorataEntree(124000, '')).toBeNull();
    expect(prorataEntree(124000, null)).toBeNull();
    expect(prorataEntree(124000, '2027-02-30')).toBeNull();
  });
});
