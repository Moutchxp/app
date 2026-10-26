import { describe, expect, it } from 'vitest';
import { manquesSuiviCommercial, suiviDeDepart, suiviTouche, suiviValide, suiviVide, type CourantSuivi } from './suiviLocataire';
import { changementsDossier, changementsSuivi, type LectureDossier, type NomsDossier, type SuiviDossier } from './dossierLocation';

/**
 * 🔴 Arno (26/10/2026) — « SUIVI COMMERCIAL » DANS LA FICHE LOCATAIRE : les règles pures. Pré-rempli si le bloc a été validé (origine
 * renseignée), vide sinon (« À qualifier », bail sans ligne) ; un bloc vide ne compte qu'une fois touché ; « Mandat de gestion seul » posé
 * d'office ; « Reste à renseigner » = ce que « Nouveau locataire » exige ; le calcul des changements est celui du Dossier de location.
 */
const NOMS: NomsDossier = { negociateur: (id) => (id === 3 ? 'Jean-Baptiste Pons' : `n° ${id}`), collegue: (id) => `c${id}`, apporteur: (id) => `a${id}` };
const VALIDE: SuiviDossier = {
  type: 'bail', dateSignature: '2026-09-01', honoProprietaireHt: '567,38', honoLocataireHt: '567,38', negociateurId: 3, apporteurId: null, apporteurTaux: '',
  mandatGestion: false, avecGestion: true, origineProprietaire: null, origineLocataire: null, origineContact: 'relocation', collegueId: null, commissionApporteur: '',
  primeMode: 'aucune', primeMontant: '', origineContactPrecision: '', apporteurMode: null, apporteurTauxGestion: '', categoriePrime: 'logement',
};
const A_QUALIFIER: SuiviDossier = { ...VALIDE, origineContact: null, avecGestion: false, negociateurId: null, honoProprietaireHt: '416,67', honoLocataireHt: '226,95', type: 'avenant' };
const ligne = (suivi: SuiviDossier, o: Partial<Extract<CourantSuivi, { sorte: 'ligne' }>> = {}): CourantSuivi => ({
  sorte: 'ligne', activiteId: 100, bailId: 70, lotId: 51, titre: 'x', version: 'v1', suivi, valide: suiviValide(suivi), locataireIds: [230], conversion: null, enPlace: null, ...o,
});

describe('pré-rempli si validé, vide sinon', () => {
  it('validé = l’origine du contact est renseignée (la règle « À qualifier » du Suivi du mois)', () => {
    expect(suiviValide(VALIDE)).toBe(true);
    expect(suiviValide(A_QUALIFIER)).toBe(false);
  });
  it('une ligne validée : le bloc part de ses valeurs, telles quelles', () => {
    expect(suiviDeDepart(ligne(VALIDE))).toEqual(VALIDE);
  });
  it('une ligne « À qualifier » : le bloc est VIDE (rien n’est repris : date, honoraires, négociateur) — la nature reste celle de la ligne', () => {
    const d = suiviDeDepart(ligne(A_QUALIFIER));
    expect(d).toEqual({ ...suiviVide({ type: 'avenant', categoriePrime: 'logement' }) });
    expect([d?.dateSignature, d?.honoProprietaireHt, d?.honoLocataireHt, d?.negociateurId, d?.origineContact]).toEqual(['', '', '', null, null]);
  });
  it('un bail sans ligne : le bloc est vide', () => {
    expect(suiviDeDepart({ sorte: 'sans_ligne', bailId: 70, lotId: 51, titre: 'x', locataireIds: [230], enPlace: null })).toEqual(suiviVide());
  });
  it('🔴 locataire en place : « Mandat de gestion seul », daté du mandat, honoraires 0 — posés d’office, même sur un bloc vide', () => {
    const conv = suiviDeDepart(ligne({ ...A_QUALIFIER, type: 'gestion_seule', dateSignature: '2026-10-20' }, { enPlace: { dateMandat: '2026-10-20' } }));
    expect([conv?.type, conv?.dateSignature, conv?.honoProprietaireHt, conv?.honoLocataireHt]).toEqual(['gestion_seule', '2026-10-20', '0', '0']);
  });
  it('non rattachée, sans bail : aucun bloc', () => {
    expect(suiviDeDepart({ sorte: 'non_rattache' })).toBeNull();
    expect(suiviDeDepart({ sorte: 'sans_bail' })).toBeNull();
  });
});

describe('touché ?', () => {
  it('un bloc vide non touché n’est PAS une modification ; « 500 » = « 500,00 » ; un champ rempli l’est', () => {
    const v = suiviVide();
    expect(suiviTouche(v, { ...v })).toBe(false);
    expect(suiviTouche({ ...v, honoProprietaireHt: '500' }, { ...v, honoProprietaireHt: '500,00' })).toBe(false);
    expect(suiviTouche(v, { ...v, negociateurId: 3 })).toBe(true);
    expect(suiviTouche(v, { ...v, dateSignature: '2026-10-05' })).toBe(true);
  });
});

describe('« Reste à renseigner » du bloc 4', () => {
  it('un bloc vide : la date, l’origine, les deux honoraires', () => {
    expect(manquesSuiviCommercial(suiviVide(), { annuaire: true })).toEqual([
      'Suivi commercial : la date de signature', 'Suivi commercial : l’origine du contact',
      'Suivi commercial : honoraires propriétaire HT (0 si aucun)', 'Suivi commercial : honoraires locataire HT (0 si aucun)']);
  });
  it('l’origine qui exige un complément : le collègue, l’apporteur, le texte', () => {
    expect(manquesSuiviCommercial({ ...VALIDE, origineContact: 'collegue' }, { annuaire: true })).toEqual(['Suivi commercial : le collègue']);
    expect(manquesSuiviCommercial({ ...VALIDE, origineContact: 'apporteur' }, { annuaire: true })).toEqual(['Suivi commercial : l’apporteur']);
    expect(manquesSuiviCommercial({ ...VALIDE, origineContact: 'personnalise' }, { annuaire: true })).toEqual(['Suivi commercial : l’origine personnalisée']);
  });
  it('complet : rien ; locataire en place : aucun honoraire demandé ; un autre motif de la vérification commune est dit', () => {
    expect(manquesSuiviCommercial(VALIDE, { annuaire: true })).toEqual([]);
    expect(manquesSuiviCommercial({ ...VALIDE, honoProprietaireHt: '', honoLocataireHt: '' }, { annuaire: true, enPlace: true })).toEqual([]);
    expect(manquesSuiviCommercial({ ...VALIDE, mandatGestion: true }, { annuaire: true })).toHaveLength(1);
  });
});

describe('les changements : le calcul du Dossier de location, et la création', () => {
  it('le Dossier de location garde exactement ses changements du bloc 4 (même calcul partagé)', () => {
    const lu = { suivi: VALIDE, conditions: null, entretien: null, locataires: [] } as unknown as LectureDossier;
    const s = { version: 'v1', locataires: [], conditions: null, entretien: null, suivi: { ...VALIDE, negociateurId: 4 } };
    expect(changementsDossier(lu, s, NOMS)).toEqual([{ bloc: 4, champ: 'Négociateur', avant: 'Jean-Baptiste Pons', apres: 'n° 4' }]);
    expect(changementsSuivi(VALIDE, { ...VALIDE, negociateurId: 4 }, NOMS)).toEqual(changementsDossier(lu, s, NOMS));
  });
  it('création (aucune ligne) : chaque champ renseigné part de « (vide) »', () => {
    const c = changementsSuivi(null, VALIDE, NOMS);
    expect(c[0]).toEqual({ bloc: 4, champ: 'Date de signature du bail', avant: '(vide)', apres: '01/09/2026' });
    expect(c.find((x) => x.champ === 'Origine du contact')?.avant).toBe('(vide)');
    expect(c.every((x) => x.avant === '(vide)')).toBe(true);
  });
  it('une saisie illisible : aucun changement (l’enregistrement la refuse)', () => {
    expect(changementsSuivi(VALIDE, { ...VALIDE, dateSignature: '' }, NOMS)).toEqual([]);
  });
});
