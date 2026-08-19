import { describe, it, expect } from 'vitest';
import { genererRelance, IdentiteIncompleteError, AucunDossierNonSatisfaitError, type EntreeRelance } from './relance';
import type { Lot, CandidatDossier, ConfigDemandeur, Piece } from '../sitadel/demande';

/**
 * R6c — génération PURE du brouillon de relance : PARTIELLE (seuls les dossiers non satisfaits) et AUTOSUFFISANTE (fondement
 * + désignation complète des pièces). Discrétion par profil, références juridiques VÉRIFIÉES (liste close), aucun motif,
 * dates = faits passés, garde-fous (identité, plus rien à réclamer).
 */
const DOSSIER1: CandidatDossier = {
  dossierId: 1, codeInsee: '92004', communeNom: 'Asnieres', canal: 'email', numDau: 'PC0920042500001',
  dateReelleAutorisation: '2025-06-15', adresse: '12 rue de la Paix', codePostal: '92600', cadastre: ['AB 12'],
  etatDau: null, absentDuDernierMillesime: false,
};
const DOSSIER2: CandidatDossier = { ...DOSSIER1, dossierId: 2, numDau: 'PC0920042500002', adresse: '8 avenue des Fleurs' };
const LOT: Lot = { codeInsee: '92004', communeNom: 'Asnieres', canal: 'email', dossiers: [DOSSIER1, DOSSIER2] };

// Désignations RÉGLEMENTAIRES complètes (PC2 contient R.431-9, désormais AUTORISÉ dans la relance).
const PIECES: Piece[] = [
  { code: 'PC2', description: 'plan de masse coté dans les trois dimensions, prévue à l’article R.431-9 du code de l’urbanisme' },
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
    reference: 'SVAV-DEM-2026-000123', profil: 'entreprise', lot: LOT, dossiersSatisfaitsIds: [], config: CONFIG_ENT,
    pieces: PIECES, envoyeeLe: new Date('2026-03-14T10:00:00Z'), echeanceLe: new Date('2026-04-14T10:00:00Z'),
    adresseReponse: 'demandes@sansvisavis.com', ...over,
  };
}

// Liste CLOSE des références autorisées, normalisées (sans espaces ni points) — R6c.
const REFS_AUTORISEES = new Set(['L311-1', 'L311-9', 'R311-12', 'R311-13', 'R343-1', 'R431-9']);
function articlesCites(texte: string): string[] {
  return (texte.match(/[LR]\.?\s?\d{2,3}-\d+/g) ?? []).map((a) => a.replace(/[\s.]/g, '').toUpperCase());
}

describe('R6c — genererRelance : partielle (seuls les dossiers dus)', () => {
  it('un dossier SATISFAIT est ABSENT du corps ; le dossier restant est présent', () => {
    const { corps } = genererRelance(entree({ dossiersSatisfaitsIds: [1] }));
    expect(corps).not.toContain('PC0920042500001'); // dossier 1 satisfait → non réclamé
    expect(corps).toContain('PC0920042500002');      // dossier 2 dû → réclamé
  });

  it('TOUS les dossiers satisfaits → AucunDossierNonSatisfaitError (plus rien à réclamer)', () => {
    expect(() => genererRelance(entree({ dossiersSatisfaitsIds: [1, 2] }))).toThrow(AucunDossierNonSatisfaitError);
  });
});

describe('R6c — genererRelance : autosuffisante (fondement + désignation complète)', () => {
  it('rappelle le FONDEMENT L311-1 et L311-9 3°', () => {
    const { corps } = genererRelance(entree());
    expect(corps).toContain('L311-1 et L311-9 3°');
  });

  it('désignation COMPLÈTE de PC2 et PC3 (comme le courrier initial)', () => {
    const { corps } = genererRelance(entree());
    expect(corps).toContain('plan de masse coté dans les trois dimensions');
    expect(corps).toContain('plan en coupe du terrain et de la construction');
  });

  it('rappelle la DATE d’envoi de la demande initiale', () => {
    const { corps } = genererRelance(entree());
    expect(corps).toContain('14 mars 2026');
  });
});

describe('R6c — genererRelance : références (liste close) et neutralité', () => {
  it('cite les 6 références autorisées et AUCUNE autre', () => {
    const { corps } = genererRelance(entree());
    for (const ref of ['L311-1 et L311-9 3°', 'R. 311-13', 'R. 311-12', 'R. 343-1', 'R.431-9']) expect(corps).toContain(ref);
    // Test NÉGATIF : tout article cité doit appartenir à la liste close (aucun numéro d'article inventé).
    for (const a of articlesCites(corps)) expect(REFS_AUTORISEES.has(a), `article hors liste close : ${a}`).toBe(true);
  });

  it('AUCUN motif ni justification d’intérêt', () => {
    const { corps } = genererRelance(entree());
    expect(corps).not.toMatch(/afin de|en vue de|dans le but|pour les besoins|motif|justif/i);
  });

  it('la date de la relance elle-même est absente (genererRelance ne reçoit aucune date « du jour »)', () => {
    const { corps } = genererRelance(entree());
    expect(corps).not.toContain('20 avril 2026');
  });
});

describe('R6c — genererRelance : discrétion par profil', () => {
  it('PERSONNE : objet générique (ni svav, ni référence, ni sansvisavis, ni commune) ; réf discrète dans le corps', () => {
    const { objet, corps } = genererRelance(entree({ profil: 'personne', config: CONFIG_PERS }));
    const o = objet.toLowerCase();
    expect(o).not.toContain('svav');
    expect(o).not.toContain('sansvisavis');
    expect(o).not.toContain('asnieres');
    expect(corps).toContain('2026-000123');
    expect(corps).not.toContain('SVAV-DEM-2026-000123');
    // la discrétion n'empêche pas l'autosuffisance : références closes respectées aussi pour la personne
    for (const a of articlesCites(corps)) expect(REFS_AUTORISEES.has(a), `article hors liste close : ${a}`).toBe(true);
  });

  it('ENTREPRISE : référence complète dans l’objet ET le corps', () => {
    const { objet, corps } = genererRelance(entree());
    expect(objet).toContain('SVAV-DEM-2026-000123');
    expect(corps).toContain('SVAV-DEM-2026-000123');
  });
});

describe('R6c — genererRelance : garde-fou d’identité', () => {
  it('identité incomplète → IdentiteIncompleteError, aucun texte', () => {
    expect(() => genererRelance(entree({ config: { ...CONFIG_ENT, raisonSociale: '' } }))).toThrow(IdentiteIncompleteError);
  });

  it('FUS — relance entreprise SIGNÉE du nom + qualité en fin de lettre (comme la demande initiale)', () => {
    const { corps } = genererRelance(entree());
    expect(corps.trimEnd().endsWith('ma considération distinguée.\n\nA. Jorel\ngérant')).toBe(true);
    expect(corps).toContain('représentée par A. Jorel, gérant.'); // clause d'identité (personne morale) toujours présente
  });
});
