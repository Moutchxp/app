import { describe, it, expect } from 'vitest';
import { genererSaisineCada, IdentiteIncompleteError, AucunDossierNonSatisfaitError, type EntreeSaisine } from './saisineCada';
import { piecesDepuisConfig, type CandidatDossier, type ConfigDemandeur, type Lot } from '../sitadel/demande';

/**
 * X2 — texte PUR de la saisine CADA. On vérifie : liste des dossiers dus + mention de la pièce jointe ; identité société vs
 * personne ; refus d'un profil incomplet ; SOCLE JURIDIQUE = uniquement les articles autorisés ; AUCUN motif/usage exposé.
 */
const DOSSIER = (over: Partial<CandidatDossier> = {}): CandidatDossier => ({
  dossierId: 1, codeInsee: '92004', communeNom: 'Asnières-sur-Seine', canal: 'email', numDau: 'PC0920042500001',
  dateReelleAutorisation: '2025-06-15', adresse: '12 rue de la Paix', codePostal: '92600', cadastre: ['AB 12'],
  etatDau: null, absentDuDernierMillesime: false, ...over,
});
const D1 = DOSSIER();
const D2 = DOSSIER({ dossierId: 2, numDau: 'PC0920042500002', adresse: '5 avenue des Tilleuls' });
const LOT: Lot = { codeInsee: '92004', communeNom: 'Asnières-sur-Seine', canal: 'email', dossiers: [D1, D2] };
const PIECES = piecesDepuisConfig('PC2,PC3'); // PC2 porte la désignation R.431-9 (code de l'urbanisme)
const CONF_ENT: ConfigDemandeur = {
  raisonSociale: 'Criterimmo', formeJuridique: 'SARL', siegeAdresse: '191 avenue Charles de Gaulle 92200 Neuilly-sur-Seine',
  representantNom: 'Arnaud JOREL', representantQualite: 'gérant', emailContact: 'a.jorel@sansvisavis.com', telephone: '0760201010',
};
const CONF_PERS: ConfigDemandeur = {
  raisonSociale: '', formeJuridique: '', siegeAdresse: '191 avenue Charles de Gaulle 92200 Neuilly-sur-Seine',
  representantNom: 'Arnaud JOREL', representantQualite: '', emailContact: 'arnaud.jorel@gmail.com', telephone: '',
};
const BASE = {
  reference: 'SVAV-DEM-2026-000042', communeNom: 'Asnières-sur-Seine', lot: LOT, dossiersSatisfaitsIds: [] as number[],
  pieces: PIECES, envoyeeLe: new Date('2026-03-14T10:00:00Z'), refusTaciteLe: new Date('2026-04-14T10:00:00Z'),
};
const ent = (over: Partial<EntreeSaisine> = {}): EntreeSaisine => ({ ...BASE, profil: 'entreprise', config: CONF_ENT, ...over });
const pers = (over: Partial<EntreeSaisine> = {}): EntreeSaisine => ({ ...BASE, profil: 'personne', config: CONF_PERS, ...over });

/** Références d'articles présentes dans un texte, normalisées (sans points ni espaces). */
function articles(texte: string): string[] {
  return (texte.match(/[LR]\.?\s?\d{3}-\d+/g) ?? []).map((a) => a.replace(/[.\s]/g, ''));
}
const AUTORISES = new Set(['L311-1', 'L311-9', 'L311-2', 'R311-12', 'R311-13', 'R343-1', 'R431-9']);

describe('X2 — genererSaisineCada : contenu R343-1', () => {
  it('liste CHAQUE dossier dû (num_dau) et cite la PIÈCE JOINTE (copie de la demande initiale)', () => {
    const { corps } = genererSaisineCada(ent());
    expect(corps).toContain('PC0920042500001');
    expect(corps).toContain('PC0920042500002');
    expect(corps).toContain('Dossiers concernés :');
    expect(corps).toContain('copie de la demande initiale');
    expect(corps).toMatch(/jointe/i);
  });

  it('ne réclame QUE les dossiers dus (un dossier satisfait n’apparaît pas)', () => {
    const { corps } = genererSaisineCada(ent({ dossiersSatisfaitsIds: [2] })); // D2 satisfait
    expect(corps).toContain('PC0920042500001');
    expect(corps).not.toContain('PC0920042500002');
  });

  it('rappel FACTUEL du contexte : commune, date d’envoi, écoulement du délai (refus), référence', () => {
    const { corps } = genererSaisineCada(ent());
    expect(corps).toContain('Asnières-sur-Seine');   // commune
    expect(corps).toContain('14 mars 2026');          // date d'envoi de la demande initiale
    expect(corps).toContain('14 avril 2026');         // date du refus tacite
    expect(corps).toContain('SVAV-DEM-2026-000042');  // référence (entreprise : dans l'objet ET le corps)
  });
});

describe('X2 — socle juridique : liste CLOSE d’articles, aucune autre référence', () => {
  it('entreprise : contient les articles attendus et AUCUN article hors liste', () => {
    const { corps } = genererSaisineCada(ent());
    for (const a of ['L311-1', 'L311-9', 'L311-2', 'R311-12', 'R311-13', 'R343-1', 'R431-9']) expect(articles(corps)).toContain(a);
    for (const a of articles(corps)) expect(AUTORISES.has(a), `article non autorisé : ${a}`).toBe(true);
  });

  it('personne : idem — uniquement des articles autorisés', () => {
    for (const a of articles(genererSaisineCada(pers()).corps)) expect(AUTORISES.has(a), `article non autorisé : ${a}`).toBe(true);
  });
});

describe('X2 — RÈGLE DU PROJET : ni motif ni usage prévu exposés', () => {
  it('le corps n’expose aucun motif/usage (hauteur, vis-à-vis, certificat, plus-value, estimation…)', () => {
    for (const e of [ent(), pers()]) {
      const { corps } = genererSaisineCada(e);
      expect(corps).not.toMatch(/hauteur|vis-à-vis|vis-a-vis|certificat|plus-value|estimation|revente|prospection|usage prévu|afin de vendre/i);
    }
  });
});

describe('X2 — identité : société vs personne physique, blocs distincts et corrects', () => {
  it('entreprise : forme + dénomination + siège + représentant ; objet avec commune + référence', () => {
    const { objet, corps } = genererSaisineCada(ent());
    expect(corps).toContain('Criterimmo');
    expect(corps).toContain('SARL');
    expect(corps).toContain('dont le siège est 191 avenue Charles de Gaulle 92200 Neuilly-sur-Seine');
    expect(corps).toContain('représentée par Arnaud JOREL, gérant');
    expect(objet).toContain('Asnières-sur-Seine');
    expect(objet).toContain('SVAV-DEM-2026-000042');
  });

  it('personne : nom + adresse + e-mail ; objet GÉNÉRIQUE (sans référence), référence DISCRÈTE dans le corps ; pas de société', () => {
    const { objet, corps } = genererSaisineCada(pers());
    expect(corps).toContain('Arnaud JOREL');
    expect(corps).toContain('arnaud.jorel@gmail.com');
    expect(corps).not.toContain('Criterimmo');            // aucune société pour une personne physique
    expect(corps).not.toContain('SARL');
    expect(objet).not.toContain('SVAV-DEM-2026-000042');  // objet générique, sans référence sérialisée
    expect(corps).toMatch(/rappeler la référence/i);       // référence discrète dans le corps
  });
});

describe('X2 — garde-fous', () => {
  it('profil incomplet → IdentiteIncompleteError (aucun texte)', () => {
    expect(() => genererSaisineCada(ent({ config: { ...CONF_ENT, siegeAdresse: '' } }))).toThrow(IdentiteIncompleteError);
    expect(() => genererSaisineCada(pers({ config: { ...CONF_PERS, representantNom: '' } }))).toThrow(IdentiteIncompleteError);
  });

  it('plus aucun dossier dû → AucunDossierNonSatisfaitError', () => {
    expect(() => genererSaisineCada(ent({ dossiersSatisfaitsIds: [1, 2] }))).toThrow(AucunDossierNonSatisfaitError);
  });

  it('FUS — saisine CADA entreprise SIGNÉE du nom + qualité en fin de lettre (comme la demande et la relance)', () => {
    const { corps } = genererSaisineCada(ent());
    expect(corps.trimEnd().endsWith('ma considération distinguée.\n\nArnaud JOREL\ngérant')).toBe(true);
    expect(corps).toContain('représentée par Arnaud JOREL, gérant.'); // clause d'identité (personne morale) toujours présente
  });
});
