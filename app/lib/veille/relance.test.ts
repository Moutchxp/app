import { describe, it, expect } from 'vitest';
import { genererRelance, IdentiteIncompleteError, type EntreeRelance } from './relance';
import type { Lot, CandidatDossier, ConfigDemandeur, Piece } from '../sitadel/demande';

/**
 * R6b — génération PURE du brouillon de relance. Discrétion par profil, références juridiques VÉRIFIÉES et AUCUNE autre,
 * aucun motif, dates (faits passés) présentes / date de la relance absente, garde-fou d'identité.
 */
const DOSSIER: CandidatDossier = {
  dossierId: 1, codeInsee: '92004', communeNom: 'Asnieres', canal: 'email',
  numDau: 'PC0920042500001', dateReelleAutorisation: '2025-06-15',
  adresse: '12 rue de la Paix', codePostal: '92600', cadastre: ['AB 12'],
  etatDau: null, absentDuDernierMillesime: false,
};
const LOT: Lot = { codeInsee: '92004', communeNom: 'Asnieres', canal: 'email', dossiers: [DOSSIER] };

// Les pièces portent EXPRÈS une description contenant R.431-9 : genererRelance ne doit garder que le CODE (pas la description).
const PIECES: Piece[] = [
  { code: 'PC2', description: 'plan de masse, prévue à l’article R.431-9 du code de l’urbanisme' },
  { code: 'PC3', description: 'plan en coupe du terrain et de la construction' },
];

const CONFIG_ENT: ConfigDemandeur = {
  raisonSociale: 'Criterimmo', formeJuridique: 'SARL', siegeAdresse: '191 av. Charles de Gaulle, 92200 Neuilly',
  representantNom: 'A. Jorel', representantQualite: 'gérant', emailContact: 'contact@sansvisavis.com', telephone: '',
};
const CONFIG_PERS: ConfigDemandeur = {
  raisonSociale: '', formeJuridique: '', siegeAdresse: '12 rue des Lilas, 92000 Nanterre',
  representantNom: 'Jean Dupont', representantQualite: '', emailContact: 'jean.dupont@exemple.fr', telephone: '',
};

function entree(over: Partial<EntreeRelance> = {}): EntreeRelance {
  return {
    reference: 'SVAV-DEM-2026-000123', profil: 'entreprise', lot: LOT, config: CONFIG_ENT, pieces: PIECES,
    envoyeeLe: new Date('2026-03-14T10:00:00Z'), echeanceLe: new Date('2026-04-14T10:00:00Z'), adresseReponse: 'demandes@sansvisavis.com',
    ...over,
  };
}

describe('R6b — genererRelance : discrétion par profil', () => {
  it('profil PERSONNE : objet générique — ni « svav », ni référence complète, ni « sansvisavis », ni commune', () => {
    const { objet, corps } = genererRelance(entree({ profil: 'personne', config: CONFIG_PERS }));
    const o = objet.toLowerCase();
    expect(o).not.toContain('svav');
    expect(o).not.toContain('sansvisavis');
    expect(o).not.toContain('svav-dem-2026-000123');
    expect(o).not.toContain('asnieres');           // pas de nom de commune dans l'objet
    expect(corps).toContain('2026-000123');         // référence DISCRÈTE, seulement dans le corps
    expect(corps).not.toContain('SVAV-DEM-2026-000123'); // jamais la référence complète pour une personne
  });

  it('profil ENTREPRISE : référence COMPLÈTE dans l’objet ET le corps', () => {
    const { objet, corps } = genererRelance(entree());
    expect(objet).toContain('SVAV-DEM-2026-000123');
    expect(corps).toContain('SVAV-DEM-2026-000123');
    expect(objet).toContain('Asnieres'); // entreprise : la commune peut figurer dans l'objet
  });
});

describe('R6b — genererRelance : fond juridique et neutralité', () => {
  it('AUCUN motif ni justification (comme le courrier initial)', () => {
    const { corps } = genererRelance(entree());
    expect(corps).not.toMatch(/afin de|en vue de|dans le but|pour les besoins|motif|justif/i);
  });

  it('cite R. 311-12, R. 311-13 et R. 343-1 — et AUCUN autre numéro d’article', () => {
    const { corps } = genererRelance(entree());
    expect(corps).toContain('R. 311-13'); // délai d'un mois à compter de la réception
    expect(corps).toContain('R. 311-12'); // le silence vaut refus
    expect(corps).toContain('R. 343-1');  // deux mois pour saisir la CADA
    // aucun autre article : ni le fondement du droit d'accès (L311-1 / L311-9 3°), ni R.431-9 (venu d'une description de pièce)
    expect(corps).not.toMatch(/L\.?\s?311/i);
    expect(corps).not.toContain('431-9');
    expect(corps).not.toMatch(/L\.?\s?311-9/i);
  });

  it('mentionne la CADA en une phrase neutre (délai de deux mois)', () => {
    const { corps } = genererRelance(entree());
    expect(corps).toMatch(/Commission d’accès aux documents administratifs/);
    expect(corps).toContain('deux mois');
  });

  it('pièces nommées par CODE (PC2, PC3), sans la description réglementaire', () => {
    const { corps } = genererRelance(entree());
    expect(corps).toContain('PC2');
    expect(corps).toContain('PC3');
    expect(corps).not.toContain('plan de masse'); // la description (qui portait R.431-9) est écartée
  });
});

describe('R6b — genererRelance : dates (faits passés) et absence de la date de relance', () => {
  it('mentionne la date d’envoi initiale et la date d’expiration du délai, PAS la date de la relance', () => {
    const { corps } = genererRelance(entree());
    expect(corps).toContain('14 mars 2026');   // envoi initial (fait passé)
    expect(corps).toContain('14 avril 2026');  // expiration du délai d'un mois (fait passé)
    // genererRelance ne reçoit AUCUNE date « aujourd'hui » : une date de relance ne peut donc pas figurer dans le corps.
    expect(corps).not.toContain('20 avril 2026');
  });
});

describe('R6b — genererRelance : garde-fou d’identité', () => {
  it('identité incomplète → IdentiteIncompleteError, aucun texte produit', () => {
    const incomplet: ConfigDemandeur = { ...CONFIG_ENT, raisonSociale: '' };
    expect(() => genererRelance(entree({ config: incomplet }))).toThrow(IdentiteIncompleteError);
  });

  it('profil personne : nom manquant → erreur', () => {
    const incomplet: ConfigDemandeur = { ...CONFIG_PERS, representantNom: '' };
    expect(() => genererRelance(entree({ profil: 'personne', config: incomplet }))).toThrow(IdentiteIncompleteError);
  });
});
