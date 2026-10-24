import { describe, expect, it } from 'vitest';
import { CONDITIONS_VIDES, manquesConditions, verifierConditions, versEnvoiConditions, versSaisieConditions, type ConditionsEntree, type SaisieConditions } from './conditionsEntree';
import { refusDossier, type LectureDossier, type SaisieDossier } from './dossierLocation';
import {
  bandeauGli, htmlNouvelleLocation, lignesBailMail, lignesSousLoyer, lotDuMail, statutProprietaires, texteNouvelleLocation,
  type DonneesNouvelleLocation, type LotSource,
} from './mailNouvelleLocation';

/**
 * 🔴 Arno (25/10/2026) — LE DOSSIER COMPLET de « Nouveau locataire » et du Dossier de location :
 *   · loyer principal, provision pour charges, dépôt de garantie, honoraires agence : 0 ACCEPTÉ, seul un champ VIDE manque — à l'écran
 *     (`manquesConditions`) comme au serveur (`verifierConditions`) ;
 *   · « Paiement des charges » obligatoire (la donnée du bien) ; l'indice exigé par le serveur quand la base l'a ;
 *   · la fiche de la Gestion (« Modifier », sans option) garde la règle d'avant ; un dossier ancien incomplet s'OUVRE, seul l'enregistrement
 *     l'exige ;
 *   · le mail ADHOC & MONGA : « Indice de révision » et « Paiement des charges » juste sous le loyer (HTML et texte), sans ligne vide.
 * Données fictives.
 */
const PLEIN: SaisieConditions = {
  ...CONDITIONS_VIDES, depot: 'agence', prelevement: false, garant: false, assurance: 'aucune', honorairesLocataire: 'agence', honorairesProprietaire: 'gestion',
  reglement: 'cheque', loyer: { principal: '1 180', provisions: '90' }, sommes: { prorataLoyer: '', prorataCharges: '', depotGarantie: '1 180', honorairesAgence: '850' },
  chargesCopro: 'agence', indice: { type: 'irl', reference: '2026-2', revision: '2027-10-15' },
};
const COMPLET = { complet: true } as const;
const CHAMPS = [
  ['loyer-principal', (s: SaisieConditions, v: string) => ({ ...s, loyer: { ...s.loyer, principal: v } })],
  ['loyer-provisions', (s: SaisieConditions, v: string) => ({ ...s, loyer: { ...s.loyer, provisions: v } })],
  ['somme-depotGarantie', (s: SaisieConditions, v: string) => ({ ...s, sommes: { ...s.sommes, depotGarantie: v } })],
  ['somme-honorairesAgence', (s: SaisieConditions, v: string) => ({ ...s, sommes: { ...s.sommes, honorairesAgence: v } })],
] as const;

describe('🔴 les champs obligatoires : 0 accepté, vide refusé (écran et serveur)', () => {
  for (const [cle, poser] of CHAMPS) {
    it(`${cle} : « 0 » passe, « » manque (écran) et est refusé (serveur)`, () => {
      expect(manquesConditions(versEnvoiConditions(poser(PLEIN, '0')), COMPLET)).toEqual({});
      expect(verifierConditions(versEnvoiConditions(poser(PLEIN, '0')), COMPLET).ok).toBe(true);
      expect(Object.keys(manquesConditions(versEnvoiConditions(poser(PLEIN, '')), COMPLET))).toEqual([cle]);
      const v = verifierConditions(versEnvoiConditions(poser(PLEIN, '  ')), COMPLET);
      expect(v.ok).toBe(false);
      expect(!v.ok && v.motif).toMatch(/0 si aucun/);
    });
  }
  it('les proratas restent facultatifs (ils se calculent) ; un montant illisible reste refusé comme avant', () => {
    expect(manquesConditions(versEnvoiConditions({ ...PLEIN, sommes: { ...PLEIN.sommes, prorataLoyer: '', prorataCharges: '' } }), COMPLET)).toEqual({});
    expect(Object.keys(manquesConditions(versEnvoiConditions({ ...PLEIN, loyer: { ...PLEIN.loyer, principal: '12,345' } }), COMPLET))).toEqual(['loyer-principal']);
  });
  it('sans l’option (la fiche de la Gestion, « Modifier ») : la règle d’avant — montants facultatifs', () => {
    const vide = { ...PLEIN, loyer: { principal: '', provisions: '' }, sommes: { prorataLoyer: '', prorataCharges: '', depotGarantie: '', honorairesAgence: '' } };
    expect(manquesConditions(versEnvoiConditions(vide))).toEqual({});
  });
});

describe('🔴 « Paiement des charges » obligatoire', () => {
  it('le bloc là et sans réponse : il manque ; « Payées par l’agence » / « par le propriétaire » : il passe, et ses lignes le disent', () => {
    expect(Object.keys(manquesConditions(versEnvoiConditions({ ...PLEIN, chargesCopro: null }), COMPLET))).toEqual(['chargesCopro']);
    const v = verifierConditions(versEnvoiConditions({ ...PLEIN, chargesCopro: 'proprietaire' }), COMPLET);
    expect(v.ok && v.valeurs.chargesCopro).toBe('proprietaire');
  });
  it('le serveur l’exige même si la saisie ne le porte pas (base avec la 400) ; une valeur inconnue est refusée', () => {
    const { chargesCopro: _c, ...sans } = PLEIN;
    expect(verifierConditions(versEnvoiConditions(sans), { complet: true, charges: true })).toEqual({ ok: false, motif: expect.stringContaining('Paiement des charges') });
    expect(verifierConditions({ ...versEnvoiConditions(PLEIN), chargesCopro: 'syndic' }, COMPLET).ok).toBe(false);
  });
  it('l’indice exigé par le serveur quand la base a la 423, même absent de la saisie', () => {
    const { indice: _i, ...sans } = PLEIN;
    expect(verifierConditions(versEnvoiConditions(sans), { complet: true, indice: true })).toEqual({ ok: false, motif: expect.stringContaining('Indice des loyers') });
  });
});

describe('🔴 le Dossier de location : un dossier ancien incomplet s’ouvre ; seul l’enregistrement exige', () => {
  const ancien: ConditionsEntree = { depot: 'agence', prelevement: false, jour: null, garant: false, assurance: 'aucune', assurancePrecision: null,
    honorairesLocataire: 'agence', honorairesProprietaire: 'gestion', sommes: { prorataLoyer: null, prorataCharges: null, depotGarantie: null, honorairesAgence: null },
    reglement: 'cheque', reglementPrecision: null, commentaire: null, chargesCopro: null };
  const suivi = { type: 'bail' as const, dateSignature: '2024-09-01', honoProprietaireHt: '500', honoLocataireHt: '500', negociateurId: 3, apporteurId: null, apporteurTaux: '',
    mandatGestion: false, avecGestion: true, origineProprietaire: null, origineLocataire: null, origineContact: 'relocation' as const, collegueId: null,
    commissionApporteur: '', primeMode: 'aucune' as const, primeMontant: '', origineContactPrecision: '', apporteurMode: null, apporteurTauxGestion: '', categoriePrime: 'logement' as const };
  const lu: LectureDossier = { activiteId: 1, bailId: 2, lotId: 3, version: 'v', titre: 't', bien: { id: 3, titre: 'b', famille: 'logement' }, lots: [], entree: '2024-09-01',
    locataires: [], contacts: [], conditions: { occupationId: 9, valeurs: ancien, loyer: null, lignesHonoraires: [] }, entretien: null, suivi };
  it('la lecture d’un dossier ancien donne une saisie (rien ne casse) ; l’enregistrer tel quel est refusé, en disant quoi compléter', () => {
    const s = versSaisieConditions(ancien, null);
    expect(s.chargesCopro).toBeNull();
    const saisie: SaisieDossier = { version: 'v', locataires: [], conditions: s, entretien: null, suivi };
    expect(refusDossier(lu, saisie)).toMatch(/Loyer mensuel : le loyer principal.*Paiement des charges/);
    const complete = { ...s, loyer: { principal: '0', provisions: '0' }, sommes: { ...s.sommes, depotGarantie: '0', honorairesAgence: '0' }, chargesCopro: 'agence' as const };
    expect(refusDossier(lu, { ...saisie, conditions: complete })).toBeNull();
    expect(refusDossier(lu, { ...saisie, conditions: complete }, { indice: true })).toMatch(/Indice des loyers/);
  });
});

describe('🔴 le mail ADHOC & MONGA : indice de révision et paiement des charges sous le loyer', () => {
  const LOT: LotSource = {
    id: 1, principal: true, categorie: 'logement', typeLibelle: 'Appartement', nombrePieces: 2, meuble: false, nomAnnexe: null, parkingSituation: null, parkingType: null,
    voie: '3 rue Fictive', codePostal: '92400', commune: 'Courbevoie', porte: null, numLotCopro: null, batiment: null, escalier: null, etage: null,
    precisionAcces: null, ascenseur: null, digicode: null, digicodeCode: null, surfaceHabitable: null, surfaceCarrez: null, surfaceExterieure: null, surface: null,
    construction: null, chauffage: null, dpeClasse: null, dpeDate: null, dpeNonSoumis: null, syndic: null, derniereAg: null, assurancePno: null, pnoAnniversaire: null,
    entretiens: [], annotation: null, commentaire: null,
  };
  const donnees = (sousLoyer: DonneesNouvelleLocation['bail']['sousLoyer']): DonneesNouvelleLocation => ({
    bailId: 9, entree: '2026-10-15', bien: { voie: '3 rue Fictive', codePostal: '92400', commune: 'Courbevoie' },
    statut: statutProprietaires({ proprietaires: [{ nom: 'M. FICTIF Jean', dejaEnGestion: false, depuis: null }], biensEnGestion: 1, mandats: [] }),
    proprietaires: [], lots: [lotDuMail(LOT, { voie: '3 rue Fictive', codePostal: '92400', commune: 'Courbevoie' })],
    gli: bandeauGli({ assurance: 'aucune', precision: null, garantPhysique: false }, []), locataires: [], garants: [],
    bail: { loyer: { principal: 118000, provisions: 9000 }, lignes: lignesBailMail('2026-10-15', null, null), sousLoyer }, driveUrl: null, expediteur: 'gestion@exemple.test',
  });
  const INDICE = { type: 'irl' as const, annee: 2026, trimestre: 2, revision: '2027-10-15', valeur: 146.68 };
  it('les deux lignes, au format demandé', () => {
    expect(lignesSousLoyer(INDICE, 'agence')).toEqual([
      { mot: 'Indice de révision', valeur: 'IRL T2 2026 — 146,68 · révision annuelle le 15/10' },
      { mot: 'Paiement des charges', valeur: 'payées par l’agence' }]);
    expect(lignesSousLoyer(null, 'proprietaire')).toEqual([{ mot: 'Paiement des charges', valeur: 'payées par le propriétaire' }]);
    expect(lignesSousLoyer(undefined, null)).toEqual([]);
  });
  it('HTML et texte : sous le total charges comprises, même mise en forme ; sans indice (423 absente) : aucune ligne, jamais une ligne vide', () => {
    const d = donnees(lignesSousLoyer(INDICE, 'agence'));
    const html = htmlNouvelleLocation(d);
    const total = html.indexOf('Total charges comprises');
    expect(total).toBeGreaterThan(0);
    expect(html.indexOf('Indice de révision')).toBeGreaterThan(total);
    expect(html).toContain('IRL T2 2026 — 146,68 · révision annuelle le 15/10');
    expect(html.indexOf('Paiement des charges')).toBeGreaterThan(html.indexOf('Indice de révision'));
    const texte = texteNouvelleLocation(d);
    expect(texte).toContain('Total charges comprises : 1 270,00 €\nIndice de révision : IRL T2 2026 — 146,68 · révision annuelle le 15/10\nPaiement des charges : payées par l’agence');
    const sans = donnees(lignesSousLoyer(null, 'agence'));
    expect(htmlNouvelleLocation(sans)).not.toContain('Indice de révision');
    expect(texteNouvelleLocation(sans)).not.toMatch(/Indice de révision/);
    expect(htmlNouvelleLocation(donnees([]))).not.toContain('data-sous-loyer');
  });
});
