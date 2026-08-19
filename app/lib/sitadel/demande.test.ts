import { describe, it, expect } from 'vitest';
import type { CanalContact } from './mairieContact';
import {
  type CandidatDossier, type ConfigDemandeur, type Lot, type DiagnosticProposition, type ParamsLot,
  problemesIdentite, proposerLots, genererTexte, piecesDepuisConfig, formaterReferenceDemande,
  dateEnFrancais, ancreDetail, peutPasserLot, expliquerProposition, resumeDiagnostic, configAvecSignataire,
  validerIdsLot, problemeCorpsDemande, gabaritsPresents, referenceDiscrete,
  cleLot, compterSelection, apparierSelection, validerLotsSelection, profilEffectifLot,
  estCandidatEligible, raisonInexploitable, bornerAncienneteMois,
} from './demande';
import { resoudreDestination } from './destinataire';

let seq = 0;
function cand(over: Partial<CandidatDossier> = {}): CandidatDossier {
  seq += 1;
  return {
    dossierId: seq, codeInsee: '92050', communeNom: 'Nanterre', canal: 'email' as CanalContact,
    numDau: `PC${seq}`, dateReelleAutorisation: '2025-03-10', adresse: '10 RUE X', codePostal: '92000', cadastre: ['AB 0012'],
    etatDau: '2', absentDuDernierMillesime: false, ...over,
  };
}
const HIST_VIDE = { dejaRattaches: new Set<number>(), permisCeMoisParCommune: new Map<string, number>() };
// dateMin: null = pas de borne d'ancienneté (les tests d'ancienneté la fixent explicitement).
const P: ParamsLot = { dossiersParDemande: 5, permisParCommuneParMois: 1, dateMin: null };

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
  const params: ParamsLot = { dossiersParDemande: 5, permisParCommuneParMois: 5, dateMin: '2023-01-01' };

  it('un dossier trop ancien (avant dateMin) n’est JAMAIS proposé', () => {
    expect(proposerLots([cand({ dateReelleAutorisation: '2019-05-01' })], params, HIST_VIDE)).toHaveLength(0);
    // un dossier dans la fenêtre passe
    expect(proposerLots([cand({ dateReelleAutorisation: '2024-05-01' })], params, HIST_VIDE)).toHaveLength(1);
  });

  it('un dossier SANS date d’autorisation n’est JAMAIS proposé (pertinence non jugeable)', () => {
    expect(proposerLots([cand({ dateReelleAutorisation: null })], params, HIST_VIDE)).toHaveLength(0);
    // même sans borne d'ancienneté, l'absence de date exclut
    expect(proposerLots([cand({ dateReelleAutorisation: null })], { ...P, permisParCommuneParMois: 5 }, HIST_VIDE)).toHaveLength(0);
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
    // Q1 — plafond mensuel généreux (10 permis ≥ 7) pour isoler le DÉCOUPAGE par `dossiers_par_demande` (5) : 7 → 5 + 2.
    const lots = proposerLots(c, { ...P, permisParCommuneParMois: 10 }, HIST_VIDE);
    expect(lots).toHaveLength(2);          // 7 dossiers, 5/demande → 5 + 2
    expect(lots[0].dossiers).toHaveLength(5);
    expect(lots[1].dossiers).toHaveLength(2);
  });

  it('respecte le plafond MENSUEL par commune (1/mois → 1 seul lot même avec beaucoup de dossiers)', () => {
    const c = Array.from({ length: 12 }, () => cand());
    expect(proposerLots(c, P, HIST_VIDE)).toHaveLength(1);
    // déjà 1 demande ce mois → quota épuisé → aucun lot
    expect(proposerLots(c, P, { ...HIST_VIDE, permisCeMoisParCommune: new Map([['92050', 1]]) })).toHaveLength(0);
  });

  it('un dossier déjà rattaché (demande active) n’est jamais reproposé ; après annulation il redevient proposable', () => {
    const a = cand(); const b = cand();
    const lots = proposerLots([a, b], { ...P, permisParCommuneParMois: 5 }, { ...HIST_VIDE, dejaRattaches: new Set([a.dossierId]) });
    expect(lots).toHaveLength(1);
    expect(lots[0].dossiers.map((d) => d.dossierId)).toEqual([b.dossierId]);
    // annulation → le dossier n'est plus dans dejaRattaches (index partiel actif) → il redevient proposable
    const apres = proposerLots([a], { ...P, permisParCommuneParMois: 5 }, HIST_VIDE);
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
    const fige = genererTexte(lot, cfgMut, 'SVAV-DEM-2026-000003', pieces, 'entreprise', 'demandes@sansvisavis.com').corps;
    cfgMut.raisonSociale = 'SOCIETE MUTÉE ZZZ'; // modif du « registre » après génération
    expect(fige).toContain('Criterimmo');       // l'identité reste l'instantané figé
    expect(fige).not.toContain('SOCIETE MUTÉE ZZZ');
    // S39 (B) — l'adresse de réponse vient de config_veille (paramètre), figée au gel ; plus l'e-mail de contact identité
    expect(fige).toContain('Adresse de réponse : demandes@sansvisavis.com');
  });

  it('formaterReferenceDemande : SVAV-DEM-AAAA-NNNNNN', () => {
    expect(formaterReferenceDemande(2026, 42)).toBe('SVAV-DEM-2026-000042');
  });

  it('S39 (B) — l’adresse de réponse du corps vient du paramètre (config_veille), pas de config_demandeur.email_contact', () => {
    const c = genererTexte(lot, CONFIG, 'SVAV-DEM-2026-000009', pieces, 'entreprise', 'demandes@svav.fr').corps;
    expect(c).toContain('Adresse de réponse : demandes@svav.fr');
    expect(c).not.toContain('contact@sansvisavis.com'); // plus de doublon avec l'e-mail de contact identité
  });

  it('S40 — mentions : DÉSACTIVÉES par défaut (rien ajouté) ; ACTIVÉES → insérées aux 2 profils, à leur place', () => {
    // par défaut (mentions vides) : aucune des deux n'apparaît
    const off = genererTexte(lot, CONFIG, 'SVAV-DEM-2026-000300', pieces, 'entreprise', 'r@svav.fr');
    expect(off.corps).not.toContain('service de l’urbanisme');
    expect(off.corps).not.toContain('silence vaudra');
    // activées + texte : la mention service est EN TÊTE (avant « Madame, Monsieur »), la mention délai près de la clôture
    const men = { serviceActive: true, serviceTexte: 'À l’attention du service de l’urbanisme', delaiActive: true, delaiTexte: 'À défaut de réponse dans le délai d’un mois, votre silence vaudra décision de refus.' };
    const soc = genererTexte(lot, CONFIG, 'SVAV-DEM-2026-000301', pieces, 'entreprise', 'r@svav.fr', men);
    expect(soc.corps.indexOf('service de l’urbanisme')).toBeLessThan(soc.corps.indexOf('Madame, Monsieur'));
    expect(soc.corps).toContain('votre silence vaudra décision de refus');
    const per = genererTexte(lot, CONFIG, 'SVAV-DEM-2026-000302', pieces, 'personne', 'r@svav.fr', men);
    expect(per.corps.indexOf('service de l’urbanisme')).toBeLessThan(per.corps.indexOf('Madame, Monsieur'));
    expect(per.corps).toContain('votre silence vaudra décision de refus');
    // active mais texte VIDE → rien ajouté (garde-fou de cohérence)
    const videActif = genererTexte(lot, CONFIG, 'SVAV-DEM-2026-000303', pieces, 'entreprise', 'r@svav.fr', { serviceActive: true, serviceTexte: '', delaiActive: true, delaiTexte: '   ' });
    expect(videActif.corps).not.toContain('service de l’urbanisme');
  });

  it('S40 (point 4) — la référence est présente dans le CORPS du profil Personne, en forme DISCRÈTE (sans marque)', () => {
    expect(referenceDiscrete('SVAV-DEM-2026-000099')).toBe('2026-000099');
    const per = genererTexte(lot, CONFIG, 'SVAV-DEM-2026-000099', pieces, 'personne', 'r@svav.fr');
    expect(per.corps).toContain('rappeler la référence 2026-000099'); // rattachement possible
    expect(per.corps).not.toContain('SVAV-DEM');   // discrétion : ni marque ni préfixe système
    expect(per.corps).not.toContain('SVAV');
    expect(per.objet).not.toContain('2026-000099'); // l'objet reste totalement générique (point 4 préservé)
  });

  it('S39 (A) — problemeCorpsDemande : détecte les gabarits FIGÉS et nomme les champs ; null si exploitable', () => {
    // corps réel généré avec une identité complète → aucun gabarit → null
    const propre = genererTexte(lot, CONFIG, 'SVAV-DEM-2026-000007', pieces, 'entreprise', 'demandes@svav.fr');
    expect(problemeCorpsDemande(propre.objet, propre.corps)).toBeNull();
    // corps figé avec des gabarits (cas SVAV-DEM-2026-000099 : identité jamais renseignée)
    const corpsGabarit = 'RAISON SOCIALE EXACTE, FORME JURIDIQUE, dont le siège est ADRESSE COMPLETE DU SIEGE, représentée par PRENOM NOM, QUALITE.';
    const msg = problemeCorpsDemande('Demande', corpsGabarit);
    expect(msg).not.toBeNull();
    expect(msg).toMatch(/RAISON SOCIALE/);
    expect(msg).toMatch(/QUALITE/);
    expect(msg).toMatch(/complétez l’identité/i);
    // gabaritsPresents renvoie les marqueurs distincts trouvés
    expect(gabaritsPresents(corpsGabarit)).toEqual(expect.arrayContaining(['RAISON SOCIALE', 'FORME JURIDIQUE', 'QUALITE']));
    expect(gabaritsPresents(propre.corps)).toEqual([]);
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
    expect(peutPasserLot('annulee', { ...CONFIG, siegeAdresse: '' })).toEqual({ ok: true, champs: [] }); // annulation jamais bloquée
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
  const PP = { ...P, permisParCommuneParMois: 5 };
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

  it('contient le NOM du collaborateur ET la raison sociale (invariant) ; S39(B) réponse = boîte config_veille, PAS l’e-mail du collaborateur', () => {
    const cfg = configAvecSignataire(CONFIG, collab);
    const { corps } = genererTexte(lot, cfg, 'SVAV-DEM-2026-000200', pieces, 'entreprise', 'demandes@svav.fr');
    expect(corps).toContain('représentée par Claire Martin, chargée de recherche.'); // chaîne EXACTE (fonction renseignée → figé)
    expect(corps).toContain('Criterimmo');                     // TOUJOURS la raison sociale de la société (invariant S8a)
    expect(corps).toContain('Adresse de réponse : demandes@svav.fr'); // S39(B) : source unique (boîte relue), pas le collaborateur
    expect(corps).not.toContain('claire.martin@exemple.fr');   // l'e-mail du collaborateur n'est PLUS l'adresse de réponse
    expect(corps).not.toContain('A. Jorel');                   // le représentant société est remplacé par le signataire
    expect(corps).not.toContain('contact@sansvisavis.com');    // l'e-mail société n'apparaît pas non plus
  });

  it('collaborateur SANS fonction (facultative) : phrase EXACTE sans virgule orpheline ; raison sociale toujours présente', () => {
    const cfg = configAvecSignataire(CONFIG, { nom: 'Martin', prenom: 'Lucas', fonction: '', email: 'lucas.martin@exemple.fr' });
    const { corps } = genererTexte(lot, cfg, 'SVAV-DEM-2026-000201', pieces, 'entreprise', 'demandes@svav.fr');
    expect(corps).toContain('représentée par Lucas Martin.');     // chaîne EXACTE : point directement après le nom
    expect(corps).not.toContain('représentée par Lucas Martin,'); // AUCUNE virgule orpheline
    expect(corps).not.toMatch(/représentée par[^\n]*,\s*\./);     // ni « , . » ni double espace terminal
    expect(corps).toContain('Criterimmo');                        // invariant S8a : raison sociale toujours mentionnée
    expect(corps).not.toContain('lucas.martin@exemple.fr');       // S39(B) : réponse = boîte config_veille, pas le collaborateur
  });

  it('sans collaborateur (null) → identité société INCHANGÉE (instantané figé préservé)', () => {
    expect(configAvecSignataire(CONFIG, null)).toBe(CONFIG); // même objet → texte strictement identique
  });
});

describe('S14d — destinataire PRADA : adressabilité en amont + texte inchangé', () => {
  const pieces = piecesDepuisConfig('PC2,PC3');

  it('commune en canal INCONNU mais PRADA au courriel non vide → canal résolu « email » → n’est PLUS exclue de proposerLots', () => {
    // canal résolu par la MÊME fonction que la prod (versCandidat) : inconnu + presume + PRADA → email
    const canalResolu = resoudreDestination({
      contactCanal: 'inconnu', contactStatut: 'presume', contactEmail: null, contactUrlFormulaire: null, contactAdressePostale: null,
      pradaCourriel: 'prada@ville.fr', pradaImportId: 3, pradaNom: 'Jean Dupont',
    }).canal;
    expect(canalResolu).toBe('email');
    const lots = proposerLots([cand({ canal: canalResolu })], { ...P, permisParCommuneParMois: 5 }, HIST_VIDE);
    expect(lots).toHaveLength(1); // adressable → un lot est proposé

    // témoin : une commune restée 'inconnu' (aucune PRADA) demeure exclue
    expect(proposerLots([cand({ canal: 'inconnu' as CanalContact })], { ...P, permisParCommuneParMois: 5 }, HIST_VIDE)).toHaveLength(0);
  });

  it('le TEXTE généré est byte-identique quel que soit le destinataire/canal (genererTexte ne le reçoit pas)', () => {
    const dossiers = [cand({ dossierId: 1, numDau: 'PC0001' }), cand({ dossierId: 2, numDau: 'PC0002' })];
    const lotEmail: Lot = { codeInsee: '92050', communeNom: 'Nanterre', canal: 'email', dossiers };
    const lotInconnu: Lot = { ...lotEmail, canal: 'inconnu' as CanalContact };
    const a = genererTexte(lotEmail, CONFIG, 'SVAV-DEM-2026-000900', pieces);
    const b = genererTexte(lotInconnu, CONFIG, 'SVAV-DEM-2026-000900', pieces);
    expect(b.corps).toBe(a.corps);   // instantané figé du corps : indépendant du destinataire
    expect(b.objet).toBe(a.objet);
  });
});

describe('S14e — validerIdsLot (action groupée : jamais 0 ligne en silence)', () => {
  it('aucun id fourni (vide / non-tableau) → erreur explicite « aucun identifiant fourni »', () => {
    expect(validerIdsLot([])).toEqual({ ok: false, erreur: 'aucun identifiant fourni' });
    expect(validerIdsLot(undefined)).toEqual({ ok: false, erreur: 'aucun identifiant fourni' });
  });
  it('des id présents mais TOUS invalides (ex. bigint sérialisé en chaîne) → erreur explicite, pas un succès à 0', () => {
    expect(validerIdsLot(['99', '100'])).toEqual({ ok: false, erreur: 'identifiants invalides (entiers attendus)' });
  });
  it('entiers valides → ok ; les invalides sont écartés mais un id valide suffit', () => {
    expect(validerIdsLot([1, 2, 3])).toEqual({ ok: true, ids: [1, 2, 3] });
    expect(validerIdsLot([1, '2', 3.5])).toEqual({ ok: true, ids: [1] });
  });
});

describe('S16 — e-mail ET formulaire produisent des lots ; courrier/inconnu exclus', () => {
  it('email → lot (canal email) ; formulaire → lot (canal formulaire, dépôt manuel) ; courrier/inconnu → aucun lot', () => {
    const email = proposerLots([cand({ codeInsee: '93066', communeNom: 'Saint-Denis', canal: 'email' })], { ...P, permisParCommuneParMois: 5 }, HIST_VIDE);
    expect(email).toHaveLength(1);
    expect(email[0].canal).toBe('email');

    const formulaire = proposerLots([cand({ codeInsee: '75056', communeNom: 'Paris', canal: 'formulaire' as CanalContact })], { ...P, permisParCommuneParMois: 5 }, HIST_VIDE);
    expect(formulaire).toHaveLength(1);
    expect(formulaire[0].canal).toBe('formulaire'); // séparable de l'e-mail par le canal du lot

    expect(proposerLots([cand({ canal: 'courrier' as CanalContact })], { ...P, permisParCommuneParMois: 5 }, HIST_VIDE)).toHaveLength(0);
    expect(proposerLots([cand({ canal: 'inconnu' as CanalContact })], { ...P, permisParCommuneParMois: 5 }, HIST_VIDE)).toHaveLength(0);
  });
});

// ── V3 : sélection lot-par-lot (helpers PURS) ────────────────────────────────
describe('V3 — cleLot : clé stable = ensemble TRIÉ des dossierId (indépendante de l’ordre)', () => {
  const lot = (ids: number[]) => ({ dossiers: ids.map((dossierId) => ({ dossierId })) });
  it('même ensemble de dossiers → même clé, quel que soit l’ordre', () => {
    expect(cleLot(lot([3, 1, 2]))).toBe(cleLot(lot([1, 2, 3])));
    expect(cleLot(lot([1, 2, 3]))).toBe('1-2-3');
  });
  it('ensembles différents → clés différentes', () => {
    expect(cleLot(lot([1, 2]))).not.toBe(cleLot(lot([1, 2, 3])));
  });
});

describe('V3 — compterSelection : décompte sur l’ENSEMBLE des lots (jamais la page)', () => {
  const lots = Array.from({ length: 20 }, (_, i) => ({ dossiers: [{ dossierId: i * 10 }, { dossierId: i * 10 + 1 }] }));
  it('compte lots ET dossiers cochés, même hors de la page affichée', () => {
    // On coche un lot de « page 1 » (index 0) et un de « page 2 » (index 19).
    const sel = new Set([cleLot(lots[0]), cleLot(lots[19])]);
    expect(compterSelection(lots, sel)).toEqual({ nbLots: 2, nbDossiers: 4 }); // 2 lots × 2 dossiers → survit au changement de page
  });
  it('sélection vide → 0 / 0', () => {
    expect(compterSelection(lots, new Set())).toEqual({ nbLots: 0, nbDossiers: 0 });
  });
  it('une clé qui ne correspond à aucun lot n’est pas comptée', () => {
    expect(compterSelection(lots, new Set(['999-998'])).nbLots).toBe(0);
  });
});

describe('V3 — apparierSelection : n’apparie QUE les lots frais, liste les invalidés', () => {
  const l1 = { dossiers: [{ dossierId: 1 }, { dossierId: 2 }] };
  const l2 = { dossiers: [{ dossierId: 3 }] };
  it('sélection présente dans les lots frais → aCreer ; absente → invalides', () => {
    const { aCreer, invalides } = apparierSelection([l1, l2], [cleLot(l1), '7-8']);
    expect(aCreer).toEqual([l1]);            // seul l1 est frais
    expect(invalides).toEqual(['7-8']);      // '7-8' n’existe plus → invalidé (listé)
  });
  it('une clé forgée (jamais proposée) n’est JAMAIS créée', () => {
    const { aCreer, invalides } = apparierSelection([l1], ['forge']);
    expect(aCreer).toHaveLength(0);
    expect(invalides).toEqual(['forge']);
  });
  it('sélection vide → rien à créer, rien d’invalide', () => {
    expect(apparierSelection([l1, l2], [])).toEqual({ aCreer: [], invalides: [] });
  });
});

describe('V3 — validerLotsSelection : clé requise, dédup, erreurs explicites', () => {
  it('non-tableau / vide → « aucun lot sélectionné »', () => {
    expect(validerLotsSelection(undefined)).toEqual({ ok: false, erreur: 'aucun lot sélectionné' });
    expect(validerLotsSelection([])).toEqual({ ok: false, erreur: 'aucun lot sélectionné' });
  });
  it('des entrées présentes mais TOUTES invalides → erreur explicite (jamais un succès à 0)', () => {
    expect(validerLotsSelection([{ communeNom: 'X' }, { cle: '' }, 42]).ok).toBe(false);
  });
  it('clés valides → dédupliquées, communeNom conservé comme libellé (null si absent)', () => {
    const v = validerLotsSelection([{ cle: '1-2', communeNom: 'Asnières' }, { cle: '1-2', communeNom: 'Asnières' }, { cle: '3' }]);
    expect(v.ok).toBe(true);
    if (v.ok) expect(v.lots).toEqual([{ cle: '1-2', communeNom: 'Asnières' }, { cle: '3', communeNom: null }]);
  });
});

/**
 * P3 — DÉCOUPAGE par contrainte de commune. 🔒 INVARIANT : la SÉLECTION (mêmes dossiers, même ORDRE) est byte-identique ;
 * seul le regroupement change (modèle ORDRE_HISTORIQUE). `permisParCommuneParMois` généreux ici pour isoler le découpage.
 */
describe('P3 — découpage : max_dossiers commune, sélection byte-identique', () => {
  const PGROS: ParamsLot = { dossiersParDemande: 5, permisParCommuneParMois: 10, dateMin: null };
  const base = [
    cand({ dossierId: 101, numDau: 'PC101' }),
    cand({ dossierId: 102, numDau: 'PC102' }),
    cand({ dossierId: 103, numDau: 'PC103' }),
  ];
  const ids = (lots: Lot[]): number[] => lots.flatMap((l) => l.dossiers.map((d) => d.dossierId));

  it('commune à max = 1 → N lots d’UN dossier ; MÊMES dossiers, MÊME ordre qu’un lot de N (byte-identique)', () => {
    const sansMax = proposerLots(base.map((c) => ({ ...c })), PGROS, HIST_VIDE);
    const avecMax = proposerLots(base.map((c) => ({ ...c, maxDossiersParDemande: 1 })), PGROS, HIST_VIDE);
    expect(sansMax).toHaveLength(1);              // AVANT : un seul lot de 3
    expect(sansMax[0].dossiers).toHaveLength(3);
    expect(avecMax).toHaveLength(3);              // APRÈS : trois lots de 1
    expect(avecMax.every((l) => l.dossiers.length === 1)).toBe(true);
    expect(ids(avecMax)).toEqual(ids(sansMax));   // 🔒 même sélection, même ordre
    expect(ids(avecMax)).toEqual([101, 102, 103]);
  });

  it('commune SANS max → découpage INCHANGÉ (non-régression explicite : null ≡ absent)', () => {
    const sansMax = proposerLots(base.map((c) => ({ ...c })), PGROS, HIST_VIDE);
    const maxNull = proposerLots(base.map((c) => ({ ...c, maxDossiersParDemande: null })), PGROS, HIST_VIDE);
    // Le DÉCOUPAGE (nb de lots + dossiers par lot) est identique — qu'un max soit absent ou explicitement null.
    const structure = (lots: Lot[]) => lots.map((l) => l.dossiers.map((d) => d.dossierId));
    expect(structure(maxNull)).toEqual(structure(sansMax));
    expect(maxNull).toHaveLength(sansMax.length);
  });

  it('max plus GRAND que la limite globale → la limite globale prime (pas de découpage plus fin)', () => {
    const avec = proposerLots(base.map((c) => ({ ...c, maxDossiersParDemande: 99 })), PGROS, HIST_VIDE);
    expect(avec).toHaveLength(1); // min(5, 99) = 5 ≥ 3 → un seul lot
  });

  it('profilImpose de la commune est porté par CHAQUE lot', () => {
    const lots = proposerLots(base.map((c) => ({ ...c, profilImpose: 'personne' as const })), PGROS, HIST_VIDE);
    expect(lots.every((l) => l.profilImpose === 'personne')).toBe(true);
  });
});

describe('P3 — profil imposé (profilEffectifLot)', () => {
  const lotDe = (profilImpose: 'entreprise' | 'personne' | null): Lot => ({ codeInsee: '75056', communeNom: 'Paris', canal: 'formulaire', dossiers: [cand()], profilImpose });
  it('commune à profil imposé → la demande porte CE profil, quel que soit le batch', () => {
    expect(profilEffectifLot(lotDe('personne'), 'entreprise')).toBe('personne');
    expect(profilEffectifLot(lotDe('entreprise'), 'personne')).toBe('entreprise');
  });
  it('commune SANS profil imposé → le profil du batch est conservé', () => {
    expect(profilEffectifLot(lotDe(null), 'entreprise')).toBe('entreprise');
    expect(profilEffectifLot(lotDe(null), 'personne')).toBe('personne');
  });
});

/**
 * P3 — corps de la variante CANAL FORMULAIRE (téléservice), validé au mot près : un seul permis, aucune identité/adresse/
 * société, aucun rappel de la référence SVAV, socle juridique de la liste close (L311-1, L311-9 3°, R431-9) et rien d'autre.
 */
describe('P3 — corps FORMULAIRE (téléservice)', () => {
  const lotForm: Lot = {
    codeInsee: '75056', communeNom: 'Paris', canal: 'formulaire',
    // U2 : num_dau parisien RÉALISTE (0 + INSEE 75101 + année + V + 4 chiffres → 1er arrondissement) + type PC.
    dossiers: [cand({ type: 'PC', numDau: '07510124V0034', dateReelleAutorisation: '2024-06-15', adresse: '5 rue de Rivoli', codePostal: '75001', communeNom: 'Paris', cadastre: ['AB 0042'] })],
  };
  const { objet, corps } = genererTexte(lotForm, CONFIG, 'SVAV-DEM-2026-000119', piecesDepuisConfig('PC2,PC3'), 'personne', 'reponse@svav.com');

  it('U2 — UN SEUL permis, référence AU FORMAT téléservice (type + num_dau) + adresse complète + arrondissement', () => {
    expect(corps).toContain('Permis concerné : PC07510124V0034'); // référence formatée (formaterReferencePermis), pas le num_dau brut
    expect(corps).toContain('autorisé le 15 juin 2024');
    expect(corps).toContain('5 rue de Rivoli');                    // adresse complète
    expect(corps).toContain('arrondissement 1er');                 // arrondissement dérivé du num_dau
    expect(corps).toContain('parcelle(s) AB 0042');
    expect(corps).not.toContain('Dossiers concernés');
    expect((corps.match(/Permis concerné/g) ?? []).length).toBe(1);
  });

  it('U4 — adresse ABSENTE en base → la ligne DÉGRADE (commune + arrondissement), JAMAIS « adresse non renseignée » (cas demande 156)', () => {
    const lotVide: Lot = { codeInsee: '75056', communeNom: 'Paris', canal: 'formulaire',
      dossiers: [cand({ type: 'PC', numDau: '07511524V0006', dateReelleAutorisation: '2025-08-14', adresse: '', codePostal: null, communeNom: 'Paris', cadastre: [] })] };
    const { corps: c } = genererTexte(lotVide, CONFIG, 'SVAV-DEM-2026-000156', piecesDepuisConfig('PC2,PC3'), 'personne', 'reponse@svav.com');
    expect(c).toContain('Permis concerné : PC07511524V0006 — autorisé le 14 août 2025 — Paris, arrondissement 15e');
    expect(c).not.toMatch(/non renseign|adresse manquante|adresse indisponible/i); // dégradation SILENCIEUSE vers la mairie
    // U5 — le corps envoyé à la mairie ne porte JAMAIS la provenance d'un éventuel repli cross-type (info STRICTEMENT opérateur).
    expect(c).not.toMatch(/issue de la ligne|parcelle .* commune vérifiée|ligne sœur|ligne PD/i);
  });

  it('AUCUNE société, AUCUNE adresse de réponse, AUCUN rappel de la référence SVAV', () => {
    expect(corps).not.toContain('Criterimmo');          // nom de société (CONFIG)
    expect(corps).not.toContain('SARL');
    expect(corps).not.toContain('Adresse de réponse');
    expect(corps).not.toContain('reponse@svav.com');
    expect(corps).not.toContain('SVAV-DEM-2026-000119'); // référence complète
    expect(corps).not.toContain('2026-000119');          // forme discrète
    expect(corps).not.toMatch(/référence/i);             // aucun rappel de référence
  });

  it('les 3 articles attendus et AUCUN autre (liste close inchangée)', () => {
    // extrait TOUT article cité (L./R. num-num, éventuel « n° »), normalise l'espacement, vérifie l'appartenance à la liste.
    const cites = [...corps.matchAll(/\b([LR])\.?\s?(\d+)-(\d+)(?:\s+\d+°)?/g)].map((m) => m[0].replace(/[.\s]/g, ''));
    const AUTORISES = new Set(['L311-1', 'L311-93°', 'R431-9']);
    expect(cites.length).toBeGreaterThan(0);
    for (const a of cites) expect(AUTORISES.has(a)).toBe(true); // aucun article hors liste
    expect(corps).toContain('L. 311-1');
    expect(corps).toContain('L. 311-9 3°');
    expect(corps).toContain('R. 431-9');
  });

  it('en-tête « service de l’urbanisme » + clôture cordiale ; objet générique', () => {
    expect(corps).toContain('À l’attention du service de l’urbanisme');
    expect(corps).toContain('Je vous remercie par avance pour votre aide et vous souhaite une excellente journée.');
    expect(objet).toBe('Demande de communication de documents administratifs');
  });

  it('non-régression : le corps E-MAIL est INCHANGÉ (la branche formulaire n’a pas fui)', () => {
    const lotEmail: Lot = { codeInsee: '92050', communeNom: 'Nanterre', canal: 'email', dossiers: [cand({ numDau: 'PC0001' }), cand({ numDau: 'PC0002' })] };
    const { corps: cEnt } = genererTexte(lotEmail, CONFIG, 'SVAV-DEM-2026-000200', piecesDepuisConfig('PC2,PC3'), 'entreprise', 'rep@x.com');
    expect(cEnt).toContain('Dossiers concernés :');
    expect(cEnt).toContain('SVAV-DEM-2026-000200');       // rappel de la référence (e-mail)
    expect(cEnt).toContain('Criterimmo');                 // identité société (e-mail)
    expect(cEnt).toContain('PC0001');
    expect(cEnt).toContain('PC0002');
  });
});

/**
 * Q1 — le plafond mensuel par commune se compte en PERMIS (dossiers), pas en demandes/courriers. Byte-identique pour une
 * commune SANS max à demandes pleines ; Paris (max=1) → autant de lots que de permis ; une demande partielle laisse le mois
 * ouvert au prorata (comportement VOULU, fixé par test pour ne jamais être « corrigé » par erreur).
 */
describe('Q1 — plafond mensuel en PERMIS (dossiers)', () => {
  const COMMUNE = '92050';
  const params = (permis: number): ParamsLot => ({ dossiersParDemande: 5, permisParCommuneParMois: permis, dateMin: null });

  it('BYTE-IDENTIQUE : commune sans max, plafond PLEIN (défaut 5), 12 dossiers → 1 lot de 5 (comme avant Q1)', () => {
    const c = Array.from({ length: 12 }, () => cand());
    const lots = proposerLots(c, params(5), HIST_VIDE);
    expect(lots).toHaveLength(1);
    expect(lots[0].dossiers).toHaveLength(5);
  });

  it('Paris : max = 1, plafond 5 permis/mois → 5 lots d’UN dossier (mêmes dossiers, dans l’ordre)', () => {
    const c = Array.from({ length: 8 }, (_, i) => cand({ dossierId: 200 + i, maxDossiersParDemande: 1, canal: 'formulaire' as CanalContact }));
    const lots = proposerLots(c, params(5), HIST_VIDE);
    expect(lots).toHaveLength(5);
    expect(lots.every((l) => l.dossiers.length === 1)).toBe(true);
    expect(lots.flatMap((l) => l.dossiers.map((d) => d.dossierId))).toEqual([200, 201, 202, 203, 204]);
  });

  it('demande PARTIELLE → le mois reste OUVERT au prorata (2 permis déjà consommés sur 5 → 3 encore proposables, pas 0)', () => {
    const c = Array.from({ length: 10 }, () => cand());
    const hist = { dejaRattaches: new Set<number>(), permisCeMoisParCommune: new Map([[COMMUNE, 2]]) };
    const lots = proposerLots(c, params(5), hist);
    expect(lots.flatMap((l) => l.dossiers).length).toBe(3); // 5 − 2 = 3 permis restants (un mois n'est PAS gelé par une demande partielle)
  });

  it('plafond ÉPUISÉ (déjà 5 permis ce mois) → aucun lot pour la commune', () => {
    const c = Array.from({ length: 10 }, () => cand());
    const hist = { dejaRattaches: new Set<number>(), permisCeMoisParCommune: new Map([[COMMUNE, 5]]) };
    expect(proposerLots(c, params(5), hist)).toHaveLength(0);
  });
});

/**
 * Q2a — UNE SEULE définition de « dossier éligible » (extraite de proposerLots, partagée avec diagnostiquer). Un test par
 * critère d'exclusion, appelant la fonction extraite DIRECTEMENT ; puis proposerLots sur un jeu couvrant les 6 critères pour
 * prouver le comportement CONSTANT (mêmes dossiers retenus, même ordre).
 */
describe('Q2a — estCandidatEligible / raisonInexploitable (les 6 critères)', () => {
  const DMIN = '2025-01-01';
  const VIDE = new Set<number>();
  const base = (): CandidatDossier => cand({ dossierId: 1, etatDau: '2', absentDuDernierMillesime: false, dateReelleAutorisation: '2025-06-01', communeNom: 'Nanterre', canal: 'email' as CanalContact });

  it('base (email, tout OK) → éligible (raison null)', () => {
    expect(raisonInexploitable(base(), DMIN, VIDE)).toBeNull();
    expect(estCandidatEligible(base(), DMIN, VIDE)).toBe(true);
  });
  it('état 4 (annulé) → « annule », non éligible', () => {
    expect(raisonInexploitable({ ...base(), etatDau: '4' }, DMIN, VIDE)).toBe('annule');
    expect(estCandidatEligible({ ...base(), etatDau: '4' }, DMIN, VIDE)).toBe(false);
  });
  it('absent du dernier millésime → « absent »', () => {
    expect(raisonInexploitable({ ...base(), absentDuDernierMillesime: true }, DMIN, VIDE)).toBe('absent');
  });
  it('sans date OU trop ancien → « hors_fenetre »', () => {
    expect(raisonInexploitable({ ...base(), dateReelleAutorisation: null }, DMIN, VIDE)).toBe('hors_fenetre');
    expect(raisonInexploitable({ ...base(), dateReelleAutorisation: '2020-01-01' }, DMIN, VIDE)).toBe('hors_fenetre');
  });
  it('déjà rattaché (demande active) → « deja_rattache »', () => {
    expect(raisonInexploitable(base(), DMIN, new Set([1]))).toBe('deja_rattache');
  });
  it('commune inconnue / canal null|inconnu → « sans_canal »', () => {
    expect(raisonInexploitable({ ...base(), communeNom: null }, DMIN, VIDE)).toBe('sans_canal');
    expect(raisonInexploitable({ ...base(), canal: null }, DMIN, VIDE)).toBe('sans_canal');
    expect(raisonInexploitable({ ...base(), canal: 'inconnu' as CanalContact }, DMIN, VIDE)).toBe('sans_canal');
  });
  it('canal courrier → « courrier » (non adressable e-mail/formulaire)', () => {
    expect(raisonInexploitable({ ...base(), canal: 'courrier' as CanalContact }, DMIN, VIDE)).toBe('courrier');
    expect(estCandidatEligible({ ...base(), canal: 'courrier' as CanalContact }, DMIN, VIDE)).toBe(false);
  });
  it('formulaire → ÉLIGIBLE (produit un lot, comme email)', () => {
    expect(estCandidatEligible({ ...base(), canal: 'formulaire' as CanalContact }, DMIN, VIDE)).toBe(true);
  });
  it('ORDRE des critères : échec multiple → renvoie le PREMIER (garantit les compteurs de diagnostiquer)', () => {
    expect(raisonInexploitable({ ...base(), etatDau: '4', canal: 'courrier' as CanalContact, communeNom: null }, DMIN, new Set([1]))).toBe('annule');
  });

  it('proposerLots (comportement CONSTANT) : sur un jeu couvrant les 6 critères, ne retient QUE les éligibles, dans l’ordre', () => {
    const dossiers = [
      cand({ dossierId: 1, canal: 'email' as CanalContact }),        // éligible
      cand({ dossierId: 2, etatDau: '4' }),                          // annulé
      cand({ dossierId: 3, absentDuDernierMillesime: true }),        // absent
      cand({ dossierId: 4, dateReelleAutorisation: null }),          // hors fenêtre (sans date)
      cand({ dossierId: 5, canal: 'formulaire' as CanalContact }),   // éligible
      cand({ dossierId: 6, canal: 'courrier' as CanalContact }),     // courrier
      cand({ dossierId: 7, communeNom: null }),                      // sans commune
      cand({ dossierId: 8, canal: 'email' as CanalContact }),        // éligible
    ];
    const par = { dossiersParDemande: 10, permisParCommuneParMois: 10, dateMin: null };
    expect(proposerLots(dossiers, par, HIST_VIDE).flatMap((l) => l.dossiers.map((d) => d.dossierId))).toEqual([1, 5, 8]);
    // + un déjà rattaché est aussi écarté
    expect(proposerLots(dossiers, par, { ...HIST_VIDE, dejaRattaches: new Set([1]) }).flatMap((l) => l.dossiers.map((d) => d.dossierId))).toEqual([5, 8]);
  });
});

describe('Q4 — bornerAncienneteMois (fenêtre d’ancienneté bornée par le réglage)', () => {
  it('absente / non numérique / < 1 → maximum (12 × ancienneté max), jamais d’erreur', () => {
    expect(bornerAncienneteMois(undefined, 1)).toBe(12);
    expect(bornerAncienneteMois(null, 1)).toBe(12);
    expect(bornerAncienneteMois('', 1)).toBe(12);
    expect(bornerAncienneteMois('abc', 1)).toBe(12);
    expect(bornerAncienneteMois(NaN, 1)).toBe(12);
    expect(bornerAncienneteMois(0, 1)).toBe(12);
    expect(bornerAncienneteMois(-5, 1)).toBe(12);
  });
  it('supérieure au maximum → ramenée au maximum', () => {
    expect(bornerAncienneteMois(13, 1)).toBe(12);
    expect(bornerAncienneteMois(9999, 2)).toBe(24);
    expect(bornerAncienneteMois('100', 1)).toBe(12);
  });
  it('valeur valide dans la plage → conservée (tronquée à l’entier)', () => {
    expect(bornerAncienneteMois(3, 2)).toBe(3);   // max 24
    expect(bornerAncienneteMois('7', 1)).toBe(7); // chaîne numérique acceptée
    expect(bornerAncienneteMois(3.7, 2)).toBe(3); // tronqué à l’entier
    expect(bornerAncienneteMois(1, 1)).toBe(1);   // borne basse
  });
  it('le maximum SUIT le réglage : 1 an → 12, 2 ans → 24, 3 ans → 36', () => {
    expect(bornerAncienneteMois(999, 1)).toBe(12);
    expect(bornerAncienneteMois(999, 2)).toBe(24);
    expect(bornerAncienneteMois(999, 3)).toBe(36);
  });
});

describe('Q4 — proposerLots : une fenêtre plus courte réduit STRICTEMENT l’ensemble (sous-ensemble)', () => {
  const dossiers = [
    cand({ dossierId: 1, dateReelleAutorisation: '2026-07-01' }),
    cand({ dossierId: 2, dateReelleAutorisation: '2026-05-01' }),
    cand({ dossierId: 3, dateReelleAutorisation: '2026-02-01' }),
    cand({ dossierId: 4, dateReelleAutorisation: '2025-10-01' }),
    cand({ dossierId: 5, dateReelleAutorisation: '2024-06-01' }),
  ];
  const ids = (lots: Lot[]): number[] => lots.flatMap((l) => l.dossiers.map((d) => d.dossierId)).sort((a, b) => a - b);
  const PARAMS: ParamsLot = { dossiersParDemande: 10, permisParCommuneParMois: 100, dateMin: null };

  it('la fenêtre courte ne retient qu’un SOUS-ENSEMBLE (strict) de la fenêtre large — seule la DATE change', () => {
    const large = ids(proposerLots(dossiers, { ...PARAMS, dateMin: '2024-01-01' }, HIST_VIDE));
    const court = ids(proposerLots(dossiers, { ...PARAMS, dateMin: '2026-04-01' }, HIST_VIDE));
    expect(large).toEqual([1, 2, 3, 4, 5]);
    expect(court).toEqual([1, 2]);                              // seuls les dossiers postérieurs à la borne courte
    expect(court.every((x) => large.includes(x))).toBe(true);  // SOUS-ENSEMBLE prouvé (pas seulement un compte différent)
    expect(court.length).toBeLessThan(large.length);           // STRICTEMENT plus petit
  });
});

describe('FUS — bloc-signature ENTREPRISE (une personne SIGNE, une personne morale demande)', () => {
  const lotSig: Lot = { codeInsee: '92050', communeNom: 'Nanterre', canal: 'email', dossiers: [cand({ numDau: 'PC0001' })] };
  const piecesSig = piecesDepuisConfig('PC2,PC3');

  it('demande entreprise : signée du NOM + QUALITÉ après la politesse ; la clause « représentée par » RESTE (rôles distincts)', () => {
    const { corps } = genererTexte(lotSig, CONFIG, 'SVAV-DEM-2026-000900', piecesSig, 'entreprise', 'demandes@svav.fr');
    expect(corps).toContain('représentée par A. Jorel, gérant.'); // clause d'identité (personne MORALE) conservée
    // signature (personne PHYSIQUE) = fin de lettre, APRÈS la politesse
    expect(corps.indexOf('A. Jorel\ngérant')).toBeGreaterThan(corps.indexOf('ma considération distinguée.'));
    expect(corps.trimEnd().endsWith('ma considération distinguée.\n\nA. Jorel\ngérant')).toBe(true);
  });

  it('qualité FACULTATIVE vide → signature = le NOM SEUL (aucune ligne de qualité vide, aucun résidu)', () => {
    const cfg = configAvecSignataire(CONFIG, { nom: 'Martin', prenom: 'Lucas', fonction: '', email: 'l@svav.fr' });
    const { corps } = genererTexte(lotSig, cfg, 'SVAV-DEM-2026-000901', piecesSig, 'entreprise', 'demandes@svav.fr');
    expect(corps.trimEnd().endsWith('ma considération distinguée.\n\nLucas Martin')).toBe(true);
  });

  it('téléservice (canal formulaire) : AUCUNE signature ajoutée (identité portée par FranceConnect) — se termine sur la politesse existante', () => {
    const { corps } = genererTexte({ ...lotSig, canal: 'formulaire' }, CONFIG, 'SVAV-DEM-2026-000902', piecesSig, 'entreprise', 'demandes@svav.fr');
    expect(corps).not.toContain('A. Jorel');                       // aucun nom de signataire dans le corps téléservice
    expect(corps.trimEnd().endsWith('excellente journée.')).toBe(true);
  });

  it('profil PERSONNE : signature nominative déjà là (nom SEUL), INCHANGÉE — jamais de qualité, jamais dédoublée', () => {
    const per = { ...CONFIG, representantNom: 'Camille Durand', representantQualite: 'gérant' };
    const { corps } = genererTexte(lotSig, per, 'SVAV-DEM-2026-000903', piecesSig, 'personne', 'demandes@svav.fr');
    expect(corps.trimEnd().endsWith('mes salutations distinguées.\n\nCamille Durand')).toBe(true);
    expect(corps).not.toContain('gérant'); // personne : aucune qualité (discrétion S7e)
  });
});
