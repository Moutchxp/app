import { describe, it, expect } from 'vitest';
import type { CanalContact } from './mairieContact';
import {
  type CandidatDossier, type ConfigDemandeur, type Lot, type DiagnosticProposition, type ParamsLot,
  problemesIdentite, proposerLots, genererTexte, piecesDepuisConfig, formaterReferenceDemande,
  dateEnFrancais, ancreDetail, peutPasserLot, expliquerProposition, resumeDiagnostic, configAvecSignataire,
} from './demande';

let seq = 0;
function cand(over: Partial<CandidatDossier> = {}): CandidatDossier {
  seq += 1;
  return {
    dossierId: seq, codeInsee: '92050', communeNom: 'Nanterre', canal: 'email' as CanalContact,
    numDau: `PC${seq}`, dateReelleAutorisation: '2025-03-10', adresse: '10 RUE X', codePostal: '92000', cadastre: ['AB 0012'],
    etatDau: '2', absentDuDernierMillesime: false, ...over,
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

  it('CASSE non bloquante (correctif S8a) : « CRITERIMMO », « SARL », « JOREL », adresse en capitales → ACCEPTÉS', () => {
    expect(problemesIdentite({ ...CONFIG, raisonSociale: 'CRITERIMMO' })).toEqual([]);
    expect(problemesIdentite({ ...CONFIG, representantNom: 'JOREL' })).toEqual([]);
    expect(problemesIdentite({ ...CONFIG, siegeAdresse: '191 AV CHARLES DE GAULLE, NEUILLY' })).toEqual([]);
    expect(problemesIdentite({ ...CONFIG, formeJuridique: 'SARL' })).toEqual([]);
  });

  it('GABARIT non rempli refusé, message nommant la chaîne-témoin reconnue (insensible casse/accents)', () => {
    expect(problemesIdentite({ ...CONFIG, raisonSociale: 'RAISON SOCIALE EXACTE' }))
      .toEqual(['raison sociale : ressemble à un gabarit non rempli (« RAISON SOCIALE »)']);
    expect(problemesIdentite({ ...CONFIG, representantNom: 'PRENOM NOM' }))
      .toEqual(['nom du représentant : ressemble à un gabarit non rempli (« PRENOM NOM »)']);
    expect(problemesIdentite({ ...CONFIG, siegeAdresse: 'ADRESSE COMPLETE DU SIEGE' }).some((m) => m.includes('gabarit'))).toBe(true);
    expect(problemesIdentite({ ...CONFIG, raisonSociale: 'raison sociale exacte' }).some((m) => m.includes('gabarit'))).toBe(true);
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
    const diag: DiagnosticProposition = { candidatsExamines: 340, dossiersAnnules: 0, dossiersAbsents: 0, dossiersHorsFenetre: 0, dossiersDejaRattaches: 495, communesSansCanal: 3, communesPlafondMensuel: 41 };
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

describe('Sitadel S7e — deux profils de demandeur', () => {
  // Identité « société » qui renseigne TOUS les champs distinctifs (pour prouver leur ABSENCE dans le corps personne).
  const CONF_SOC: ConfigDemandeur = {
    raisonSociale: 'CritérImmoZZZ', formeJuridique: 'SASU-XYZ', siegeAdresse: '191 av. Charles de Gaulle, 92200 Neuilly',
    representantNom: 'Alix Jorel', representantQualite: 'PrésidentQQ', emailContact: 'contact@sansvisavis.com', telephone: '01 23 45 67 89',
  };
  // Identité « personne physique » : nom + adresse + e-mail (e-mail SANS « sansvisavis »).
  const CONF_PERS: ConfigDemandeur = {
    raisonSociale: '', formeJuridique: '', siegeAdresse: '12 rue des Lilas, 92000 Nanterre',
    representantNom: 'Jean Dupont', representantQualite: '', emailContact: 'jean.dupont@exemple.fr', telephone: '',
  };
  const lot: Lot = { codeInsee: '92050', communeNom: 'Nanterre', canal: 'email', dossiers: [cand({ numDau: 'PC0001' }), cand({ numDau: 'PC0002' })] };
  const pieces = piecesDepuisConfig('PC2,PC3');
  const INTERDITS = /\b(motif|parce que|afin de|en vue de|pour (notre|nos|mon|mes|le compte)|justif|intérêt|usage|raison de la demande)\b/i;
  const DATE_FR = /\b\d{1,2}\s+(janvier|février|mars|avril|mai|juin|juillet|août|septembre|octobre|novembre|décembre)\s+\d{4}\b/i;

  it('corps « personne » : AUCUNE valeur de société (raison sociale / forme / qualité) ni « sansvisavis »', () => {
    const { corps } = genererTexte(lot, CONF_PERS, 'SVAV-DEM-2026-000100', pieces, 'personne');
    // même en fournissant une config qui les renseigne, le modèle personne ne doit pas les utiliser :
    const { corps: corpsAvecSoc } = genererTexte(lot, { ...CONF_PERS, raisonSociale: 'CritérImmoZZZ', formeJuridique: 'SASU-XYZ', representantQualite: 'PrésidentQQ' }, 'SVAV-DEM-2026-000101', pieces, 'personne');
    for (const c of [corps, corpsAvecSoc]) {
      expect(c).not.toContain('CritérImmoZZZ');
      expect(c).not.toContain('SASU-XYZ');
      expect(c).not.toContain('PrésidentQQ');
      expect(c.toLowerCase()).not.toContain('sansvisavis');
    }
    // en-tête présent (nom / adresse / e-mail) + signature = le nom
    expect(corps).toContain('Jean Dupont');
    expect(corps).toContain('jean.dupont@exemple.fr');
    expect(corps).toContain('12 rue des Lilas, 92000 Nanterre');
  });

  it('les deux modèles diffèrent sur les MÊMES dossiers', () => {
    const soc = genererTexte(lot, CONF_SOC, 'SVAV-DEM-2026-000102', pieces, 'entreprise').corps;
    const per = genererTexte(lot, CONF_PERS, 'SVAV-DEM-2026-000102', pieces, 'personne').corps;
    expect(soc).not.toBe(per);
    expect(soc).toContain('représentée par'); // marque du modèle société
    expect(per).not.toContain('représentée par');
    expect(soc).toContain('PC0001');
    expect(per).toContain('PC0001'); // mêmes dossiers dans les deux
  });

  it('AUCUN motif dans l’un ni l’autre modèle', () => {
    expect(genererTexte(lot, CONF_SOC, 'SVAV-DEM-2026-000103', pieces, 'entreprise').corps).not.toMatch(INTERDITS);
    expect(genererTexte(lot, CONF_PERS, 'SVAV-DEM-2026-000103', pieces, 'personne').corps).not.toMatch(INTERDITS);
  });

  it('AUCUNE date-calendrier dans le corps (la date est apposée à l’envoi) — les deux modèles', () => {
    // dossiers sans date d'autorisation → aucune date ne doit apparaître dans le corps généré.
    const lotSansDate: Lot = { ...lot, dossiers: [cand({ numDau: 'PCX', dateReelleAutorisation: null })] };
    expect(genererTexte(lotSansDate, CONF_SOC, 'SVAV-DEM-2026-000104', pieces, 'entreprise').corps).not.toMatch(DATE_FR);
    expect(genererTexte(lotSansDate, CONF_PERS, 'SVAV-DEM-2026-000104', pieces, 'personne').corps).not.toMatch(DATE_FR);
  });

  it('problemesIdentite : « personne » accepte une identité SANS raison sociale ; « entreprise » la refuse toujours', () => {
    expect(problemesIdentite(CONF_PERS, 'personne')).toEqual([]);
    const e = problemesIdentite(CONF_PERS, 'entreprise');
    expect(e).toContain('raison sociale : requis');
    // « personne » exige quand même nom + adresse + e-mail :
    expect(problemesIdentite({ ...CONF_PERS, representantNom: '' }, 'personne')).toContain('nom : requis');
    expect(problemesIdentite({ ...CONF_PERS, emailContact: 'pas-un-mail' }, 'personne')).toContain('e-mail de contact : format invalide');
  });

  it('« personne » : ni la référence SVAV, ni la marque, ne fuitent dans l’objet ou le corps (casse insensible)', () => {
    const ref = 'SVAV-DEM-2026-000123';
    const per = genererTexte(lot, CONF_PERS, ref, pieces, 'personne');
    for (const t of [per.objet, per.corps]) {
      const b = t.toLowerCase();
      expect(b).not.toContain('svav');
      expect(b).not.toContain(ref.toLowerCase());
      expect(b).not.toContain('sansvisavis');
      expect(b).not.toContain('sans vis-à-vis');
    }
    expect(per.objet).toBe('Demande de communication de documents administratifs'); // objet générique, banal
    // symétrie : le profil « entreprise » contient TOUJOURS la référence dans son objet
    const soc = genererTexte(lot, CONF_SOC, ref, pieces, 'entreprise');
    expect(soc.objet).toContain(ref);
    expect(soc.objet.toUpperCase()).toContain('SVAV');
  });

  it('l’instantané figé du modèle « entreprise » est INCHANGÉ (défaut = entreprise)', () => {
    // genererTexte sans profil == profil 'entreprise' (compat) — le texte société n'a pas bougé.
    const sansProfil = genererTexte(lot, CONF_SOC, 'SVAV-DEM-2026-000105', pieces).corps;
    const avecEntreprise = genererTexte(lot, CONF_SOC, 'SVAV-DEM-2026-000105', pieces, 'entreprise').corps;
    expect(sansProfil).toBe(avecEntreprise);
    expect(sansProfil).toContain('l’expression de ma considération distinguée.');
  });
});

describe('Sitadel S7f — décompte chiffré du filtrage (jamais un texte figé)', () => {
  const diag: DiagnosticProposition = { candidatsExamines: 600, dossiersAnnules: 8, dossiersAbsents: 157, dossiersHorsFenetre: 485, dossiersDejaRattaches: 0, communesSansCanal: 11, communesPlafondMensuel: 0 };
  const FIGES = ['Action impossible.', 'Proposition indisponible.', 'Création impossible.'];

  it('resumeDiagnostic : TOUJOURS chiffré (même avec des lots), inclut le hors-fenêtre d’ancienneté', () => {
    const m = resumeDiagnostic(diag);
    expect(m).toContain('600');
    expect(m).toContain('485');
    expect(m).toContain("hors fenêtre d'ancienneté");
    expect(m).toContain('11 commune(s) sans canal');
    expect(m).toContain('au plafond mensuel');
    for (const fige of FIGES) expect(m).not.toBe(fige); // jamais un libellé figé à deux mots
    // des chiffres différents → message différent (pas figé)
    expect(resumeDiagnostic({ ...diag, dossiersHorsFenetre: 12 })).toContain('12 hors fenêtre');
  });

  it('expliquerProposition (0 lot) reste chiffré et cite le hors-fenêtre — jamais figé', () => {
    const m = expliquerProposition(0, diag);
    expect(m).toContain('600');
    expect(m).toContain("485 dossier(s) hors fenêtre d'ancienneté");
    for (const fige of FIGES) expect(m).not.toBe(fige);
  });
});

describe('Sitadel S12 — exclusions d’état dans proposerLots', () => {
  const PP = { ...P, demandesParCommuneParMois: 5 };
  it('un dossier ANNULÉ (etat_dau=4) n’est JAMAIS proposé', () => {
    expect(proposerLots([cand({ etatDau: '4' })], PP, HIST_VIDE)).toHaveLength(0);
  });
  it('un dossier ABSENT du dernier millésime n’est JAMAIS proposé', () => {
    expect(proposerLots([cand({ absentDuDernierMillesime: true })], PP, HIST_VIDE)).toHaveLength(0);
  });
  it('un dossier COMMENCÉ (5) ou ACHEVÉ (6) RESTE proposable (le bâtiment existe → c’est sa hauteur qu’on cherche)', () => {
    expect(proposerLots([cand({ etatDau: '5' })], PP, HIST_VIDE)).toHaveLength(1);
    expect(proposerLots([cand({ etatDau: '6' })], PP, HIST_VIDE)).toHaveLength(1);
  });
  it('un dossier SANS etat_dau (null, jamais revu) reste proposable — l’ABSENCE d’état n’exclut jamais', () => {
    expect(proposerLots([cand({ etatDau: null })], PP, HIST_VIDE)).toHaveLength(1);
  });
  it('resumeDiagnostic expose les deux nouveaux compteurs chiffrés (annulés, absents)', () => {
    const m = resumeDiagnostic({ candidatsExamines: 600, dossiersAnnules: 8, dossiersAbsents: 157, dossiersHorsFenetre: 485, dossiersDejaRattaches: 0, communesSansCanal: 11, communesPlafondMensuel: 0 });
    expect(m).toContain('8 annulé(s)');
    expect(m).toContain('157 absent(s) du dernier millésime');
  });
});

describe('Sitadel S8a — courrier signé par un collaborateur', () => {
  const collab = { nom: 'Martin', prenom: 'Claire', fonction: 'chargée de recherche', email: 'claire.martin@exemple.fr' };
  const lot: Lot = { codeInsee: '92050', communeNom: 'Nanterre', canal: 'email', dossiers: [cand({ numDau: 'PC0001' })] };
  const pieces = piecesDepuisConfig('PC2,PC3');

  it('contient le NOM du collaborateur ET la raison sociale (invariant) ; adresse de réponse = e-mail du collaborateur', () => {
    const cfg = configAvecSignataire(CONFIG, collab);
    const { corps } = genererTexte(lot, cfg, 'SVAV-DEM-2026-000200', pieces, 'entreprise');
    expect(corps).toContain('Claire Martin');            // signataire = collaborateur
    expect(corps).toContain('chargée de recherche');     // sa fonction (qualité)
    expect(corps).toContain('Criterimmo');               // TOUJOURS la raison sociale de la société (invariant S8a)
    expect(corps).toContain('claire.martin@exemple.fr'); // adresse de réponse = collaborateur
    expect(corps).not.toContain('A. Jorel');             // le représentant société est remplacé
    expect(corps).not.toContain('contact@sansvisavis.com'); // l'e-mail société est remplacé
  });

  it('sans collaborateur (null) → identité société INCHANGÉE (instantané figé préservé)', () => {
    expect(configAvecSignataire(CONFIG, null)).toBe(CONFIG); // même objet → texte strictement identique
  });
});
