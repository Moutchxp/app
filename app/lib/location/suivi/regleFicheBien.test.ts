import { describe, expect, it } from 'vitest';
import { caLigne, gestionDuMois, honorairesGestionMensuels, loyerChargesComprises, natureBienLoue, primeDe, primeSaisieALaMain, type ActiviteCalcul, type LigneGestion } from './tableauBord';

/**
 * 🔴 Arno (26/10/2026) — RÈGLE A : LA FICHE DU BIEN FAIT FOI pour le badge « Nouvelle gestion » ; la colonne « Loyer (cc) » ; la prime saisie
 * à la main. Les cas de septembre 2026 constatés en production (diagnostic `.captures/ecart-gestions/`), avec des données fictives.
 */
const REGLES = [{ depuis: '2019-01-01', tauxNegociateur: 0.15, primeLogement: 150, primeParking: 15 }];
const ligne = (o: Partial<ActiviteCalcul>): ActiviteCalcul => ({
  id: 1, type: 'bail', dateSignature: '2026-09-01', libelleProprietaire: 'P', libelleLocataire: 'L', honoProprietaireHt: 416.67, honoLocataireHt: 229.85,
  primeSaisie: 0, mandatGestion: false, categoriePrime: 'logement', apporteurId: null, apporteurNom: null, apporteurTaux: null, commissionSaisie: null, negociateurId: null,
  negociateurLibelle: 'x', avecGestion: true, origineProprietaire: null, origineLocataire: null, loyerHc: null, charges: null, assurance: null, parking: false,
  vacanceJours: null, rattachement: 'rattache', origineContact: 'apporteur', primeMode: 'aucune', ...o,
});

describe('badge « Nouvelle gestion » / « Relocation gestion » selon la fiche du bien', () => {
  it('bien entré en gestion le mois de la signature : « Nouvelle gestion » (DEMANGE, 18/09/2026)', () => {
    expect(natureBienLoue(ligne({ mandatGestion: true, entreeGestionBien: '2026-09-18' })).nature).toBe('nouveau_gestion');
  });
  it('bien entré le mois précédent : « Nouvelle gestion » (tolérance des lignes du fichier datées du 1er) — y compris décembre → janvier', () => {
    expect(natureBienLoue(ligne({ entreeGestionBien: '2026-08-27' })).nature).toBe('nouveau_gestion');
    expect(natureBienLoue(ligne({ dateSignature: '2026-01-01', entreeGestionBien: '2025-12-15' })).nature).toBe('nouveau_gestion');
  });
  it('bien en gestion depuis plus longtemps : « Relocation gestion », et pourquoi (BENTZ, en gestion depuis 2020)', () => {
    const r = natureBienLoue(ligne({ entreeGestionBien: '2020-08-28' }));
    expect(r).toEqual({ nature: 'relocation', raison: 'bien en gestion depuis le 28/08/2020 (fiche du bien)' });
    expect(natureBienLoue(ligne({ dateSignature: '2026-01-01', entreeGestionBien: '2025-11-30' })).nature).toBe('relocation');
    // « propriétaire déjà client » en gestion : la même règle
    expect(natureBienLoue(ligne({ origineContact: 'proprietaire_deja_client', entreeGestionBien: '2021-06-17' })).nature).toBe('relocation');
  });
  it('sans bien rattaché (ou bien jamais entré en gestion) : le badge d’avant (ZHIVULINA, CAUCHY 326)', () => {
    expect(natureBienLoue(ligne({ entreeGestionBien: null })).nature).toBe('nouveau_gestion');
    expect(natureBienLoue(ligne({})).nature).toBe('nouveau_gestion');
  });
  it('rien d’autre ne bouge : origine vide, « Relocation », sans gestion, annexe, statut validé à la main', () => {
    const vieux = { entreeGestionBien: '2017-03-09' };
    expect(natureBienLoue(ligne({ ...vieux, origineContact: null })).nature).toBe('a_qualifier');
    expect(natureBienLoue(ligne({ ...vieux, origineContact: 'relocation' })).raison).toBe('case « Relocation » cochée (portefeuille de gestion)');
    expect(natureBienLoue(ligne({ ...vieux, avecGestion: false })).nature).toBe('nouveau_sans_gestion');
    expect(natureBienLoue(ligne({ ...vieux, origineContact: 'proprietaire_deja_client', avecGestion: false })).nature).toBe('client_hors_gestion');
    expect(natureBienLoue(ligne({ ...vieux, annexe: { parentId: 1, libelle: 'Lot 1', principalEnGestion: false, mandat: null } })).nature).toBe('client_hors_gestion');
    expect(natureBienLoue(ligne({ ...vieux, natureManuelle: { nature: 'nouveau_gestion', par: 'Arno', le: '2026-10-26T10:00:00Z' } })).nature).toBe('nouveau_gestion');
  });
});

describe('🔴 CHEKROUNE (ligne 823, lot 364) : exactement comme avant', () => {
  const chekroune = ligne({ origineContact: null, mandatGestion: true, primeMode: 'regle', primeSaisie: 150, honoProprietaireHt: 375, honoLocataireHt: 0, entreeGestionBien: '2026-01-30' });
  it('« À qualifier », 150 € en GESTION, sans trait (prime de la règle) — avec ou sans la date de la fiche du bien', () => {
    expect(natureBienLoue(chekroune)).toEqual(natureBienLoue({ ...chekroune, entreeGestionBien: undefined }));
    expect(natureBienLoue(chekroune).nature).toBe('a_qualifier');
    expect(primeDe(chekroune, REGLES)).toBe(150);
    expect(primeSaisieALaMain(chekroune)).toBe(false);
  });
});

describe('aucun montant, aucun autre mois ne change', () => {
  it('prime, CA et nouvelles gestions du mois ne lisent pas la date de la fiche du bien', () => {
    const a = ligne({ mandatGestion: true, primeMode: 'regle', primeSaisie: null });
    const b = { ...a, entreeGestionBien: '2020-08-28' };
    expect([primeDe(b, REGLES), caLigne(b)]).toEqual([primeDe(a, REGLES), caLigne(a)]);
    const l: LigneGestion = { lotId: 9, libelle: 'x', proprietaire: 'y', effetLe: '2026-09-11', avant: null, apres: 'en_gestion', loyerHc: null, provisions: null, base: null, tauxHt: null };
    expect(gestionDuMois([l], '2026-09').nbNouvelles).toBe(1);
  });
});

describe('colonne « Loyer (cc) » des nouvelles gestions', () => {
  it('loyer + charges, une seule valeur (CHALAH 579,63 + 80 = 659,63 ; COHEN 700 + 50 = 750) ; inconnu : null (« à saisir »)', () => {
    expect(loyerChargesComprises({ loyerHc: 579.63, provisions: 80 })).toBeCloseTo(659.63, 10);
    expect(loyerChargesComprises({ loyerHc: 700, provisions: 50 })).toBe(750);
    expect(loyerChargesComprises({ loyerHc: 700, provisions: null })).toBe(700);
    expect(loyerChargesComprises({ loyerHc: null, provisions: 80 })).toBeNull();
  });
  it('les honoraires gardent leur calcul (base cc : loyer + provisions ; base hc : loyer seul)', () => {
    expect(honorairesGestionMensuels({ loyerHc: 579.63, provisions: 80, base: 'cc', tauxHt: 4.5 })).toBeCloseTo(659.63 * 0.045, 10);
    expect(honorairesGestionMensuels({ loyerHc: 700, provisions: 50, base: 'hc', tauxHt: 4 })).toBe(28);
  });
});

describe('prime saisie à la main', () => {
  it('« Personnalisé » seulement ; la règle (même recopiée du fichier) et « Aucune » non', () => {
    expect(primeSaisieALaMain({ primeMode: 'personnalise' })).toBe(true);
    expect(primeSaisieALaMain({ primeMode: 'regle' })).toBe(false);
    expect(primeSaisieALaMain({ primeMode: 'aucune' })).toBe(false);
    expect(primeSaisieALaMain({ primeMode: null })).toBe(false);
  });
});
