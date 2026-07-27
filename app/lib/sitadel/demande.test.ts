import { describe, it, expect } from 'vitest';
import type { CanalContact } from './mairieContact';
import {
  type CandidatDossier, type ConfigDemandeur, type Lot, type DiagnosticProposition, type ParamsLot,
  problemesIdentite, proposerLots, genererTexte, piecesDepuisConfig, formaterReferenceDemande,
  dateEnFrancais, ancreDetail, peutPasserLot, expliquerProposition,
} from './demande';

let seq = 0;
function cand(over: Partial<CandidatDossier> = {}): CandidatDossier {
  seq += 1;
  return {
    dossierId: seq, codeInsee: '92050', communeNom: 'Nanterre', canal: 'email' as CanalContact,
    numDau: `PC${seq}`, dateReelleAutorisation: '2025-03-10', adresse: '10 RUE X', codePostal: '92000', cadastre: ['AB 0012'], ...over,
  };
}
const HIST_VIDE = { dejaRattaches: new Set<number>(), demandesCeMoisParCommune: new Map<string, number>() };
// dateMin: null = pas de borne d'ancienneté (les tests d'ancienneté la fixent explicitement).
const P: ParamsLot = { dossiersParDemande: 5, demandesParCommuneParMois: 1, dateMin: null };

const CONFIG: ConfigDemandeur = {
  raisonSociale: 'Criterimmo', formeJuridique: 'SARL', siegeAdresse: '191 av. Charles de Gaulle, 92200 Neuilly',
  representantNom: 'A. Jorel', representantQualite: 'gérant', emailContact: 'contact@sansvisavis.com', telephone: '',
};

describe('Sitadel S7c — plausibilité de l’identité du demandeur', () => {
  it('identité plausible → aucun problème', () => { expect(problemesIdentite(CONFIG)).toEqual([]); });

  it('champ vide → nommé « requis » (hors telephone, jamais requis)', () => {
    expect(problemesIdentite({ ...CONFIG, siegeAdresse: '' })).toEqual(['adresse du siège : requis']);
    expect(problemesIdentite({ ...CONFIG, telephone: '' })).toEqual([]); // telephone optionnel
    expect(problemesIdentite({ ...CONFIG, raisonSociale: '', emailContact: '' }))
      .toEqual(['raison sociale : requis', 'e-mail de contact : requis']);
  });

  it('valeur ENTIÈREMENT EN CAPITALES refusée pour raison sociale, nom et adresse du siège — champ + raison', () => {
    expect(problemesIdentite({ ...CONFIG, raisonSociale: 'CRITERIMMO' }))
      .toEqual(['raison sociale : entièrement en capitales (valeur de substitution ?)']);
    expect(problemesIdentite({ ...CONFIG, representantNom: 'JOREL' }))
      .toEqual(['nom du représentant : entièrement en capitales (valeur de substitution ?)']);
    expect(problemesIdentite({ ...CONFIG, siegeAdresse: '191 AV CHARLES DE GAULLE, NEUILLY' }))
      .toEqual(['adresse du siège : entièrement en capitales (valeur de substitution ?)']);
    // forme juridique / qualité : les capitales sont normales (SARL, SAS…) → tolérées
    expect(problemesIdentite({ ...CONFIG, formeJuridique: 'SARL' })).toEqual([]);
  });

  it('e-mail au format invalide refusé, longueur invraisemblable refusée', () => {
    expect(problemesIdentite({ ...CONFIG, emailContact: 'pas-un-email' }))
      .toEqual(['e-mail de contact : format invalide']);
    expect(problemesIdentite({ ...CONFIG, representantNom: 'X' }))
      .toEqual(['nom du représentant : trop court pour être crédible']);
  });
});

describe('Sitadel S7c — fenêtre d’ancienneté (pure)', () => {
  const params: ParamsLot = { dossiersParDemande: 5, demandesParCommuneParMois: 5, dateMin: '2023-01-01' };

  it('un dossier trop ancien (avant dateMin) n’est JAMAIS proposé', () => {
    expect(proposerLots([cand({ dateReelleAutorisation: '2019-05-01' })], params, HIST_VIDE)).toHaveLength(0);
    // un dossier dans la fenêtre passe
    expect(proposerLots([cand({ dateReelleAutorisation: '2024-05-01' })], params, HIST_VIDE)).toHaveLength(1);
  });

  it('un dossier SANS date d’autorisation n’est JAMAIS proposé (pertinence non jugeable)', () => {
    expect(proposerLots([cand({ dateReelleAutorisation: null })], params, HIST_VIDE)).toHaveLength(0);
    // même sans borne d'ancienneté, l'absence de date exclut
    expect(proposerLots([cand({ dateReelleAutorisation: null })], { ...P, demandesParCommuneParMois: 5 }, HIST_VIDE)).toHaveLength(0);
  });
});

describe('Sitadel S7c — date en toutes lettres', () => {
  it('rend le mois en français (janvier, février, août, décembre)', () => {
    expect(dateEnFrancais('2020-01-15')).toBe('15 janvier 2020');
    expect(dateEnFrancais('2021-02-01')).toBe('1 février 2021');
    expect(dateEnFrancais('2019-08-09')).toBe('9 août 2019');
    expect(dateEnFrancais('2022-12-31')).toBe('31 décembre 2022');
  });
  it('date absente/invalide → « date inconnue »/valeur brute', () => {
    expect(dateEnFrancais(null)).toBe('date inconnue');
    expect(dateEnFrancais('')).toBe('date inconnue');
    expect(dateEnFrancais('2020-13-01')).toBe('2020-13-01'); // mois hors plage → brut
  });
});

describe('Sitadel S7 — constitution des lots (pure)', () => {
  it('respecte le plafond de dossiers par demande', () => {
    const c = Array.from({ length: 7 }, () => cand());
    const lots = proposerLots(c, { ...P, demandesParCommuneParMois: 3 }, HIST_VIDE);
    expect(lots).toHaveLength(2);          // 7 dossiers, 5/demande → 5 + 2
    expect(lots[0].dossiers).toHaveLength(5);
    expect(lots[1].dossiers).toHaveLength(2);
  });

  it('respecte le plafond MENSUEL par commune (1/mois → 1 seul lot même avec beaucoup de dossiers)', () => {
    const c = Array.from({ length: 12 }, () => cand());
    expect(proposerLots(c, P, HIST_VIDE)).toHaveLength(1);
    // déjà 1 demande ce mois → quota épuisé → aucun lot
    expect(proposerLots(c, P, { ...HIST_VIDE, demandesCeMoisParCommune: new Map([['92050', 1]]) })).toHaveLength(0);
  });

  it('un dossier déjà rattaché (demande active) n’est jamais reproposé ; après abandon il redevient proposable', () => {
    const a = cand(); const b = cand();
    const lots = proposerLots([a, b], { ...P, demandesParCommuneParMois: 5 }, { ...HIST_VIDE, dejaRattaches: new Set([a.dossierId]) });
    expect(lots).toHaveLength(1);
    expect(lots[0].dossiers.map((d) => d.dossierId)).toEqual([b.dossierId]);
    // abandon → le dossier n'est plus dans dejaRattaches (index partiel actif) → il redevient proposable
    const apres = proposerLots([a], { ...P, demandesParCommuneParMois: 5 }, HIST_VIDE);
    expect(apres).toHaveLength(1);
    expect(apres[0].dossiers.map((d) => d.dossierId)).toEqual([a.dossierId]);
  });

  it('commune en canal « inconnu » (ou orpheline) → aucune demande', () => {
    expect(proposerLots([cand({ canal: 'inconnu' })], P, HIST_VIDE)).toHaveLength(0);
    expect(proposerLots([cand({ canal: null })], P, HIST_VIDE)).toHaveLength(0);
    expect(proposerLots([cand({ communeNom: null })], P, HIST_VIDE)).toHaveLength(0);
  });
});

describe('Sitadel S7 — texte de la demande', () => {
  const lot: Lot = { codeInsee: '92050', communeNom: 'Nanterre', canal: 'email', dossiers: [cand({ numDau: 'PC0001' }), cand({ numDau: 'PC0002' })] };
  const pieces = piecesDepuisConfig('PC2,PC3');
  const { objet, corps } = genererTexte(lot, CONFIG, 'SVAV-DEM-2026-000001', pieces);

  it('contient les DEUX pièces, la référence, et TOUS les dossiers du lot', () => {
    expect(corps).toContain('la pièce PC2');
    expect(corps).toContain('la pièce PC3');
    expect(corps).toContain('SVAV-DEM-2026-000001');
    expect(objet).toContain('SVAV-DEM-2026-000001');
    expect(corps).toContain('PC0001');
    expect(corps).toContain('PC0002');
    expect(corps).toContain('L311-1');
  });

  it('date d’autorisation en toutes lettres et code postal + commune sur chaque ligne', () => {
    const un = genererTexte(
      { ...lot, dossiers: [cand({ numDau: 'PC7', dateReelleAutorisation: '2017-03-14', adresse: '5 RUE Y', codePostal: '92000', communeNom: 'Nanterre' })] },
      CONFIG, 'SVAV-DEM-2026-000010', pieces,
    );
    expect(un.corps).toContain('autorisé le 14 mars 2017');
    expect(un.corps).toContain('92000 Nanterre');
  });

  it('dossier SANS adresse : la ligne s’appuie sur les parcelles (pas de tiret orphelin ni de vide)', () => {
    const un = genererTexte(
      { ...lot, dossiers: [cand({ numDau: 'PC8', adresse: '', codePostal: '92000', communeNom: 'Nanterre', cadastre: ['AB 0012', 'AB 0013'] })] },
      CONFIG, 'SVAV-DEM-2026-000011', pieces,
    );
    expect(un.corps).toContain('parcelle(s) AB 0012, AB 0013');
    expect(un.corps).not.toMatch(/— *—/); // aucun séparateur doublé (segment vide)
    expect(un.corps).not.toMatch(/— *$/m); // aucune ligne se terminant par un tiret orphelin
  });

  it('ne contient AUCUN motif / justification d’intérêt / usage prévu', () => {
    const interdits = /\b(motif|parce que|afin de|en vue de|pour (notre|nos|mon|mes|le compte)|justif|intérêt|usage|raison de la demande)\b/i;
    expect(corps).not.toMatch(interdits);
  });

  it('les libellés de pièces viennent de la config (PC2 seule)', () => {
    const un = genererTexte(lot, CONFIG, 'SVAV-DEM-2026-000002', piecesDepuisConfig('PC2'));
    expect(un.corps).toContain('la pièce PC2');
    expect(un.corps).not.toContain('la pièce PC3');
  });

  it('destinataire/texte FIGÉ : muter la source après coup ne change pas le texte déjà généré (instantané figé)', () => {
    const cfgMut: ConfigDemandeur = { ...CONFIG };
    const fige = genererTexte(lot, cfgMut, 'SVAV-DEM-2026-000003', pieces).corps;
    cfgMut.emailContact = 'autre@ailleurs.fr'; // modif du « registre » après génération
    expect(fige).toContain('contact@sansvisavis.com'); // le texte produit reste l'instantané
    expect(fige).not.toContain('autre@ailleurs.fr');
  });

  it('formaterReferenceDemande : SVAV-DEM-AAAA-NNNNNN', () => {
    expect(formaterReferenceDemande(2026, 42)).toBe('SVAV-DEM-2026-000042');
  });
});

describe('Sitadel S7b — interface (détail cliquable, action groupée, explication chiffrée)', () => {
  it('ancreDetail : cible RÉELLE et NON VIDE pour un id valide (aurait attrapé le lien mort)', () => {
    expect(ancreDetail(42)).toBe('demande-42');
    expect(ancreDetail(1).length).toBeGreaterThan(0);
    // id absent/invalide → cible vide (jamais un lien qui pointe « quelque part » par erreur)
    for (const mauvais of [0, -1, NaN, 1.5]) expect(ancreDetail(mauvais)).toBe('');
  });

  it('action groupée « prête » : appliquée à TOUTES ou à AUCUNE selon l’identité (nomme les champs + raisons)', () => {
    expect(peutPasserLot('prete', CONFIG)).toEqual({ ok: true, champs: [] });
    const incomplet = peutPasserLot('prete', { ...CONFIG, siegeAdresse: '', emailContact: '' });
    expect(incomplet.ok).toBe(false);
    expect(incomplet.champs).toEqual(['adresse du siège : requis', 'e-mail de contact : requis']); // → 0 transition
    expect(peutPasserLot('abandonnee', { ...CONFIG, siegeAdresse: '' })).toEqual({ ok: true, champs: [] }); // abandon jamais bloqué
  });

  it('explication du « 0 lot » : reflète les COMPTEURS RÉELS, pas un texte figé', () => {
    const diag: DiagnosticProposition = { candidatsExamines: 340, dossiersHorsFenetre: 0, dossiersDejaRattaches: 495, communesSansCanal: 3, communesPlafondMensuel: 41 };
    const m = expliquerProposition(0, diag);
    expect(m).toContain('340');
    expect(m).toContain('495 dossier(s) déjà rattaché(s)');
    expect(m).toContain('plafond mensuel atteint pour 41 commune(s)');
    expect(m).toContain('3 commune(s) sans canal');
    // la fenêtre d'ancienneté apparaît quand elle exclut des dossiers
    expect(expliquerProposition(0, { ...diag, dossiersHorsFenetre: 12 })).toContain("12 dossier(s) hors fenêtre d'ancienneté");
    // des chiffres différents → message différent (pas figé)
    expect(expliquerProposition(0, { ...diag, communesPlafondMensuel: 7 })).toContain('7 commune(s)');
    // des lots existent → aucun message
    expect(expliquerProposition(2, diag)).toBe('');
  });
});
