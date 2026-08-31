import { describe, it, expect } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { BandeauIdentite, PlageParam, CarteReglageEntier, CarteParamVestigial, CarteSection, TITRE_PARAMS_DEMANDES, TITRE_PARAMS_DOSSIERS, AIDE_PARAMS_DOSSIERS, TITRE_PARAMS_SOURCES, AIDE_PARAMS_SOURCES, TITRE_PARAMS_MENTIONS, AIDE_PARAMS_MENTIONS, TITRE_THEME_PREPARATION, TITRE_THEME_ENVOI, TITRE_THEME_REPONSES, TITRE_THEME_ALERTES, TITRE_THEME_CADA } from './ReglagesRendu';
import { parserBornesCheck, PARAMS_VEILLE, PARAMS_DEMANDES, PARAMS_DOSSIERS, PARAMS_SOURCES, PARAMS_MENTIONS, PARAMS_THEME_PREPARATION, PARAMS_THEME_ENVOI, PARAMS_THEME_REPONSES, PARAMS_THEME_ALERTES, PARAMS_THEME_CADA, PARAMS_THEME_TELESERVICE, PARAMS_THEME_RATTACHEMENT } from '../../../../lib/sitadel/reglagesVeille';
import { problemesIdentite } from '../../../../lib/sitadel/demande';

/**
 * S7d — rendu STATIQUE (aucun DOM) des pièces sensibles de l'écran Réglages :
 *  (a) le bandeau d'identité bascule complète/incomplète (vert vs rouge, message nommant le champ) ;
 *  (b) la plage affichée d'un paramètre correspond aux bornes issues des CHECK de la base.
 */
const DEFS_BASE = [
  'CHECK (((seuil_surface_immeuble_m2 >= 100) AND (seuil_surface_immeuble_m2 <= 100000)))',
  'CHECK (((anciennete_max_demande_annees >= 1) AND (anciennete_max_demande_annees <= 20)))',
];
const BORNES = parserBornesCheck(DEFS_BASE);

describe('S7d — BandeauIdentite', () => {
  it('identité complète → message « peuvent passer en « prête » » en vert', () => {
    const h = renderToStaticMarkup(createElement(BandeauIdentite, { problemes: [] }));
    expect(h).toContain('complète');
    expect(h).toContain('prête');
    expect(h).toContain('var(--color-svv-green-ink)');
  });

  it('identité incomplète → nomme le champ fautif, en rouge', () => {
    const problemes = problemesIdentite({
      raisonSociale: 'Criterimmo', formeJuridique: 'SARL', siegeAdresse: '', representantNom: 'A. Jorel',
      representantQualite: 'gérant', emailContact: 'contact@x.fr', telephone: '',
    });
    const h = renderToStaticMarkup(createElement(BandeauIdentite, { problemes }));
    expect(h).toContain('adresse du siège');
    expect(h).toContain('var(--color-svv-red)');
  });
});

describe('S7d — PlageParam (bornes = base)', () => {
  it('affiche exactement la plage du CHECK', () => {
    const surface = PARAMS_VEILLE.find((p) => p.colonne === 'seuil_surface_immeuble_m2')!;
    const h = renderToStaticMarkup(createElement(PlageParam, { param: surface, bornes: BORNES.seuil_surface_immeuble_m2 }));
    expect(h).toContain('100');
    expect(h).toContain('100000');
    expect(h).toContain('m²');
  });

  it('paramètre texte → rappel de format, pas de plage numérique', () => {
    const pieces = PARAMS_VEILLE.find((p) => p.colonne === 'pieces_demandees')!;
    const h = renderToStaticMarkup(createElement(PlageParam, { param: pieces, bornes: undefined }));
    expect(h).toContain('virgules');
  });

  it('F-N1 — le rappel de format d’un « texte » est PROPRE au paramètre (formatHint), jamais le hint « pièces » pour tous', () => {
    const pieces = PARAMS_VEILLE.find((p) => p.colonne === 'pieces_demandees')!;
    const depot = PARAMS_VEILLE.find((p) => p.colonne === 'depot_adresses_connues')!;
    const hPieces = renderToStaticMarkup(createElement(PlageParam, { param: pieces, bornes: undefined }));
    const hDepot = renderToStaticMarkup(createElement(PlageParam, { param: depot, bornes: undefined }));
    // pieces_demandees GARDE son propre hint (codes PC2/PC3)
    expect(hPieces).toContain('codes de pièces');
    expect(hPieces).toContain('PC2');
    // depot_adresses_connues a le SIEN (adresses e-mail), et JAMAIS celui des pièces
    expect(hDepot).toContain('adresses e-mail séparées par des virgules');
    expect(hDepot).not.toContain('codes de pièces');
    expect(hDepot).not.toContain('PC2');
  });

  it('borne absente (contrainte introuvable) → le signale, n’invente aucune plage', () => {
    const anc = PARAMS_VEILLE.find((p) => p.colonne === 'anciennete_max_demande_annees')!;
    const h = renderToStaticMarkup(createElement(PlageParam, { param: anc, bornes: undefined }));
    expect(h).toContain('introuvable');
  });

  it('paramètre enum (profil par défaut) → liste les choix, pas de plage numérique', () => {
    const prof = PARAMS_VEILLE.find((p) => p.colonne === 'profil_demandeur_defaut')!;
    const h = renderToStaticMarkup(createElement(PlageParam, { param: prof, bornes: undefined }));
    expect(h).toContain('entreprise');
    expect(h).toContain('personne');
    expect(h).not.toContain('Plage autorisée');
  });
});

describe('S13 — deux sous-blocs de paramètres (demandes vs dossiers)', () => {
  it('intitulés EXACTS, et plus aucune mention « moteur de veille »', () => {
    expect(TITRE_PARAMS_DEMANDES).toBe('Paramètres des demandes');
    expect(TITRE_PARAMS_DOSSIERS).toBe('Classification et affichage des dossiers');
    expect(TITRE_PARAMS_DEMANDES).not.toContain('moteur de veille');
    expect(TITRE_PARAMS_DOSSIERS).not.toContain('moteur de veille');
  });

  it('E1 — les 5 thèmes portent les intitulés EXACTS attendus', () => {
    expect(TITRE_THEME_PREPARATION).toBe('Préparation des demandes');
    expect(TITRE_THEME_ENVOI).toBe('Envoi aux mairies');
    expect(TITRE_THEME_REPONSES).toBe('Réponses et échéances');
    expect(TITRE_THEME_ALERTES).toBe('Alertes par e-mail');
    expect(TITRE_THEME_CADA).toBe('Saisine CADA');
  });

  it('l’aide du 2e bloc dit qu’il ne concerne PAS les demandes mais la mise à jour/affichage des dossiers', () => {
    expect(AIDE_PARAMS_DOSSIERS).toContain('ne concernent pas les demandes');
    expect(AIDE_PARAMS_DOSSIERS).toContain('dossiers');
    expect(AIDE_PARAMS_DOSSIERS).toContain('Mise à jour des dossiers');
  });

  // E1 — les 5 thèmes affichent CHACUN ses colonnes dans l'ORDRE d'affichage voulu (celui de la constante, pas de PARAMS_VEILLE).
  it('E1 — ordre d’affichage EXACT de chaque thème', () => {
    expect(PARAMS_THEME_PREPARATION.map((p) => p.colonne)).toEqual([
      'anciennete_max_demande_annees', 'nb_candidats_examines', 'tri_candidats',
      'dossiers_par_demande', 'permis_par_commune_par_mois', 'pieces_demandees',
      'profil_demandeur_defaut', 'demandes_par_commune_par_mois', // vestigial en dernier
    ]);
    expect(PARAMS_THEME_ENVOI.map((p) => p.colonne)).toEqual([
      'adresse_reponse', 'envois_max_par_run', 'envois_max_par_jour',
      'relance_jours_avant_echeance', 'relance_auto_active', // LOT B — duo « relances » (à partir de quand + part-il tout seul)
      'relance_rappel_jours_avant', 'relance_avis_jours_avant', 'relance_saisine_delai_jours', // cascade lot 2 — 3 délais (rappel/avis/saisine)
      'envoi_heure_debut', 'envoi_heure_fin', // ENVOI OUVRÉ — fenêtre horaire d'envoi automatique
      'relance_multi_adresse_active', 'relance_multi_adresse_nb_dernieres', // LOT 20 — multi-adresse des 2 dernières relances (opt-in)
    ]);
    expect(PARAMS_THEME_REPONSES.map((p) => p.colonne)).toEqual([
      'releve_active', 'releve_profil', 'releve_intervalle_minutes', 'releve_fraicheur_heures',
      'vague_calme_minutes', // PART-C — calme d'une vague de pièces avant diagnostic
      'lien_validite_presumee_jours', 'lien_alerte_avant_jours', // PART-D — péremption présumée des liens + délai d'alerte
      'recherche_references_max', 'piece_taille_max_mo', 'echeance_alerte_jours',
      'depot_adresses_connues', // N1-A — versement automatique en GED
      'nature_accuse_motifs',   // FUS-4 — motifs d'objet « accusé de réception »
      'liens_hotes_non_fort', 'pieces_hachages_exclus', // PART-1 — exclusions (liens jamais fort / signatures non versées)
      'famille_attendue_masse', 'famille_attendue_coupe', 'famille_attendue_etage', 'famille_attendue_cerfa', // PART-2 — familles attendues
    ]);
    expect(PARAMS_THEME_ALERTES.map((p) => p.colonne)).toEqual(['alerte_active', 'alerte_email', 'alerte_heure_locale', 'obstacle_disparu_alerte_active']);
    expect(PARAMS_THEME_CADA.map((p) => p.colonne)).toEqual(['proposition_cada_active', 'cada_email', 'cada_url_formulaire', 'saisine_cada_auto_active', 'cada_partiel_delai_mois', 'cada_partiel_delai_jours', 'cascade_partiel_relance_jours', 'cascade_partiel_annonce_jours', 'cascade_partiel_saisine_jours', 'cascade_partiel_nb_relances']);
  });

  // E1/N1-A — PREUVE « aucun paramètre perdu » : les 5 thèmes sont DISJOINTS et couvrent EXACTEMENT les clés « demandes »
  //   (liste littérale figée, comparée en ENSEMBLE — pas en ordre). N1-A a ajouté `depot_adresses_connues` au thème Réponses.
  it('les thèmes « demandes » partitionnent les clés (disjoints, couvrants, sans perte ni doublon) — D4 : + thème Téléservice', () => {
    const themes = [PARAMS_THEME_PREPARATION, PARAMS_THEME_ENVOI, PARAMS_THEME_REPONSES, PARAMS_THEME_ALERTES, PARAMS_THEME_CADA, PARAMS_THEME_TELESERVICE];
    const clesThemes = themes.flatMap((t) => t.map((p) => p.colonne));
    expect(PARAMS_THEME_PREPARATION.length + PARAMS_THEME_ENVOI.length + PARAMS_THEME_REPONSES.length + PARAMS_THEME_ALERTES.length + PARAMS_THEME_CADA.length + PARAMS_THEME_TELESERVICE.length).toBe(57);
    expect(new Set(clesThemes).size).toBe(57); // disjoints ; CASC-2c +2 (CADA) ; CASC-3b +4 (CADA) ; PART-C +1 (Réponses) ; PART-D +2 (Réponses)
    // liste LITTÉRALE figée des clés « demandes » — comparée en ENSEMBLE à la concaténation des thèmes ET à COLONNES_PARAMS_DEMANDES.
    const CLES_DEMANDES = [
      'anciennete_max_demande_annees', 'dossiers_par_demande', 'permis_par_commune_par_mois', 'demandes_par_commune_par_mois',
      'nb_candidats_examines', 'tri_candidats', 'envois_max_par_run', 'envois_max_par_jour', 'adresse_reponse',
      'cada_email', 'cada_url_formulaire', 'releve_active', 'releve_intervalle_minutes', 'releve_profil',
      'echeance_alerte_jours', 'releve_fraicheur_heures', 'alerte_active', 'alerte_email', 'alerte_heure_locale',
      'vague_calme_minutes', // PART-C — calme d'une vague de pièces (thème Réponses)
      'lien_validite_presumee_jours', 'lien_alerte_avant_jours', // PART-D — péremption présumée des liens (thème Réponses)
      'obstacle_disparu_alerte_active', // ALERTE obstacle disparu — thème « Alertes par e-mail »
      'proposition_cada_active', 'piece_taille_max_mo', 'recherche_references_max', 'pieces_demandees', 'profil_demandeur_defaut',
      'depot_adresses_connues', // N1-A
      'nature_accuse_motifs',   // FUS-4
      'liens_hotes_non_fort', 'pieces_hachages_exclus', // PART-1 — exclusions (thème Réponses)
      'famille_attendue_masse', 'famille_attendue_coupe', 'famille_attendue_etage', 'famille_attendue_cerfa', // PART-2 — familles attendues (thème Réponses)
      'relance_jours_avant_echeance', 'relance_auto_active', // LOT B — duo « relances » rangé dans « Envoi aux mairies »
      'relance_rappel_jours_avant', 'relance_avis_jours_avant', 'relance_saisine_delai_jours', // cascade lot 2 — 3 délais (Envoi)
      'envoi_heure_debut', 'envoi_heure_fin', // ENVOI OUVRÉ — fenêtre horaire (Envoi)
      'relance_multi_adresse_active', 'relance_multi_adresse_nb_dernieres', // LOT 20 — multi-adresse (Envoi)
      'saisine_cada_auto_active', // cascade lot 2 — auto-saisine (CADA)
      'cada_partiel_delai_mois', 'cada_partiel_delai_jours', // CASC-2c — délai CADA prolongé sur dossier partiel (thème CADA)
      'cascade_partiel_relance_jours', 'cascade_partiel_annonce_jours', 'cascade_partiel_saisine_jours', 'cascade_partiel_nb_relances', // CASC-3b — rythme de la cascade partielle (thème CADA)
      'teleservice_dossiers_par_depot', 'teleservice_permis_par_commune_par_mois', 'teleservice_profil_demandeur_defaut', // D4-ter (étanche) — préparation PROPRE au téléservice
      'teleservice_alerte_non_depose_active', 'teleservice_alerte_non_depose_jours', // D4 — thème Téléservice
    ];
    expect(new Set(clesThemes)).toEqual(new Set(CLES_DEMANDES));
    expect(new Set(PARAMS_DEMANDES.map((p) => p.colonne))).toEqual(new Set(CLES_DEMANDES)); // COLONNES_PARAMS_DEMANDES = concat des thèmes, même ENSEMBLE
  });

  // E1 — PREUVE GLOBALE : les CLÉS RENDUES par l'écran Réglages (les 5 thèmes + mentions + sources, dans l'ordre où ReglagesVue
  //   les mappe) + les dossiers (rendus ailleurs) === EXACTEMENT l'ensemble de PARAMS_VEILLE. Aucun paramètre perdu ni dupliqué.
  it('E1 — partition globale : 5 thèmes + mentions + sources + dossiers === PARAMS_VEILLE (aucune clé perdue)', () => {
    // Ordre EXACT des sections rendues par ReglagesVue (cf. ReglagesVue.tsx, Section B puis Mentions puis Sources).
    const CLES_RENDUES_REGLAGES = [
      ...PARAMS_THEME_PREPARATION, ...PARAMS_THEME_ENVOI, ...PARAMS_THEME_REPONSES, ...PARAMS_THEME_ALERTES, ...PARAMS_THEME_CADA,
      ...PARAMS_THEME_TELESERVICE, // D4-ter (étanche) — thème « Téléservice » : dossiers + permis + profil (préparation propre) + alerte non déposée (2) = 5 réglages
      ...PARAMS_THEME_RATTACHEMENT, // 6e thème « Rattachement au bâti » : RATT-AUTO (1) + ATT-BATI (2) + PHASE-1 délais (2) + SURV-1 (2) + SURV-2 interrupteur (1) = 8 réglages
      ...PARAMS_MENTIONS, ...PARAMS_SOURCES,
    ].map((p) => p.colonne);
    // Snapshot : 50 + PHASE-1 (2 délais) + SURV-1 (2 réglages) + SURV-2 (1 interrupteur) + PART-1 (2 exclusions, thème Réponses) = 57 clés
    //   distinctes ; + PART-C (vague_calme_minutes) = 68 ; + PART-D (validité + délai d'alerte des liens, thème Réponses) = 70.
    expect(CLES_RENDUES_REGLAGES).toHaveLength(72);
    expect(new Set(CLES_RENDUES_REGLAGES).size).toBe(72);
    // Partition globale de PARAMS_VEILLE (dossiers rendus dans l'onglet Automatisation, inchangés).
    const toutes = new Set([...CLES_RENDUES_REGLAGES, ...PARAMS_DOSSIERS.map((p) => p.colonne)]);
    expect(toutes).toEqual(new Set(PARAMS_VEILLE.map((p) => p.colonne)));
    expect(toutes.size).toBe(PARAMS_VEILLE.length);
    // les 3 groupes préservés à l'identique (non touchés par E1).
    expect(PARAMS_DOSSIERS.map((p) => p.colonne)).toEqual([
      'seuil_logements_immeuble', 'seuil_surface_immeuble_m2', 'annees_par_defaut',
      'rang_immeuble_neuf', 'rang_surelevation', 'rang_construction_neuve', 'rang_extension', 'rang_demolition',
    ]);
    expect(PARAMS_SOURCES.map((p) => p.colonne)).toEqual(['dila_url']);
    expect(PARAMS_MENTIONS.map((p) => p.colonne)).toEqual([
      'mention_service_active', 'mention_service_texte', 'mention_delai_active', 'mention_delai_texte',
      'mention_sources_active', 'mention_sources_texte', // S-DWG — 3e tiret optionnel « fichiers sources (DWG/DXF) »
    ]);
  });

  it('S37 — les 2 caps d’envoi sont des entiers du groupe « demandes », plage lue des CHECK, aide anti-salve', () => {
    for (const col of ['envois_max_par_run', 'envois_max_par_jour']) {
      const p = PARAMS_VEILLE.find((x) => x.colonne === col)!;
      expect(p.type).toBe('entier');
      expect(PARAMS_DEMANDES.some((x) => x.colonne === col)).toBe(true);          // rendu dans « Paramètres des demandes »
      expect(PARAMS_DOSSIERS.some((x) => x.colonne === col)).toBe(false);
      // la plage s'affiche à partir des bornes (des CHECK), jamais recopiée
      const h = renderToStaticMarkup(createElement(PlageParam, { param: p, bornes: { min: 1, max: 200 } }));
      expect(h).toContain('Plage autorisée');
      expect(h).toContain('e-mails');
    }
    // l'aide dit pour un non-développeur que c'est le rempart contre un envoi accidentel en masse
    const run = PARAMS_VEILLE.find((x) => x.colonne === 'envois_max_par_run')!;
    expect(run.aide).toMatch(/rempart|jamais plus/i);
    expect(run.aide).toMatch(/mairies/i);
  });

  it('S38 — adresse de réponse : type email dans le groupe « demandes », aide dit que sans elle aucun envoi', () => {
    const p = PARAMS_VEILLE.find((x) => x.colonne === 'adresse_reponse')!;
    expect(p.type).toBe('email');
    expect(PARAMS_DEMANDES.some((x) => x.colonne === 'adresse_reponse')).toBe(true);
    expect(p.aide).toMatch(/aucun envoi|réponse/i);
    const h = renderToStaticMarkup(createElement(PlageParam, { param: p, bornes: undefined }));
    expect(h).toMatch(/adresse e-mail/i);          // format annoncé
    expect(h).not.toContain('introuvable');         // pas d'erreur « plage introuvable »
  });

  it('LOT B — duo « relances » dans « Envoi aux mairies » : entier borné + booléen, libellés/aides EXACTS, rendu sans « introuvable »', () => {
    const jours = PARAMS_VEILLE.find((p) => p.colonne === 'relance_jours_avant_echeance')!;
    const auto = PARAMS_VEILLE.find((p) => p.colonne === 'relance_auto_active')!;
    // types
    expect(jours.type).toBe('entier');
    expect(auto.type).toBe('booleen');
    // rangés dans le thème ENVOI (« Envoi aux mairies »), pas dans les dossiers
    for (const col of ['relance_jours_avant_echeance', 'relance_auto_active']) {
      expect(PARAMS_THEME_ENVOI.some((x) => x.colonne === col)).toBe(true);
      expect(PARAMS_DOSSIERS.some((x) => x.colonne === col)).toBe(false);
    }
    // libellés EXACTS demandés
    expect(jours.libelle).toBe('Nombre de jours avant l’échéance');
    expect(auto.libelle).toBe('Envoyer les relances automatiquement');
    // aides EXACTES demandées (le compteur de jours lève l'ambiguïté « la préparation n'envoie rien »)
    expect(jours.aide).toBe('À partir de ce nombre de jours avant l’échéance, un rappel est préparé pour les demandes restées sans réponse. La préparation a toujours lieu et n’envoie rien.');
    expect(auto.aide).toBe('Si cette case est cochée, les relances partiront vers les mairies sans relecture. Tant qu’elle est décochée, rien ne part sans un clic.');
    // rendu : entier → plage tirée des CHECK ; booléen → « activé/désactivé » ; jamais l'erreur « introuvable »
    const hJours = renderToStaticMarkup(createElement(PlageParam, { param: jours, bornes: { min: 1, max: 30 } }));
    expect(hJours).toContain('Plage autorisée');
    expect(hJours).toContain('jours');
    const hAuto = renderToStaticMarkup(createElement(PlageParam, { param: auto, bornes: undefined }));
    expect(hAuto).toMatch(/activé|désactivé/i);
    expect(hAuto).not.toContain('introuvable');
  });

  it('S40 — sous-bloc MENTIONS : intitulé + aide disent que le fondement juridique reste fixe ; interrupteur + texte libre', () => {
    expect(TITRE_PARAMS_MENTIONS).toMatch(/courrier/i);
    expect(AIDE_PARAMS_MENTIONS).toMatch(/juridique|fondement/i);
    const bool = PARAMS_VEILLE.find((p) => p.colonne === 'mention_service_active')!;
    const txt = PARAMS_VEILLE.find((p) => p.colonne === 'mention_service_texte')!;
    expect(bool.type).toBe('booleen');
    expect(txt.type).toBe('texte_libre');
    // PlageParam rend une aide de format adaptée, jamais l'erreur « plage introuvable »
    const hBool = renderToStaticMarkup(createElement(PlageParam, { param: bool, bornes: undefined }));
    expect(hBool).toMatch(/activé|désactivé/i);
    expect(hBool).not.toContain('introuvable');
    const hTxt = renderToStaticMarkup(createElement(PlageParam, { param: txt, bornes: undefined }));
    expect(hTxt).toMatch(/texte libre|vide/i);
    expect(hTxt).not.toContain('introuvable');
  });

  it('S30 — sous-bloc SOURCES : intitulé + aide, et PlageParam d’une URL rappelle le format http(s)://', () => {
    expect(TITRE_PARAMS_SOURCES).toContain('annuaire des mairies');
    expect(AIDE_PARAMS_SOURCES).toMatch(/mairies/i);
    const dila = PARAMS_VEILLE.find((p) => p.colonne === 'dila_url')!;
    expect(dila.type).toBe('url');
    const h = renderToStaticMarkup(createElement(PlageParam, { param: dila, bornes: undefined }));
    expect(h).toContain('http');                 // format annoncé
    expect(h).not.toContain('introuvable');       // PAS l'erreur « plage introuvable » (une URL n'a pas de bornes)
  });
});

describe('S33 — les 8 réglages « dossiers » migrent, CarteReglageEntier les rend', () => {
  it('les 8 paramètres de PARAMS_DOSSIERS sont TOUS des entiers (rendus par CarteReglageEntier)', () => {
    expect(PARAMS_DOSSIERS.map((p) => p.colonne)).toEqual([
      'seuil_logements_immeuble', 'seuil_surface_immeuble_m2', 'annees_par_defaut',
      'rang_immeuble_neuf', 'rang_surelevation', 'rang_construction_neuve', 'rang_extension', 'rang_demolition',
    ]);
    expect(PARAMS_DOSSIERS.every((p) => p.type === 'entier')).toBe(true);
  });

  it('CarteReglageEntier : input number borné (min/max des CHECK), libellé, plage, bouton — sans couleur seule', () => {
    const surface = PARAMS_DOSSIERS.find((p) => p.colonne === 'seuil_surface_immeuble_m2')!;
    const h = renderToStaticMarkup(createElement(CarteReglageEntier, {
      param: surface, bornes: { min: 100, max: 100000 }, valeur: '1500',
      onValeur: () => {}, onEnregistrer: () => {}, message: '', erreur: '',
    }));
    expect(h).toContain('type="number"');
    expect(h).toContain('min="100"');
    expect(h).toContain('max="100000"');
    expect(h).toContain('value="1500"');
    expect(h).toContain(surface.libelle);        // libellé lisible
    expect(h).toContain('Plage autorisée');       // plage tirée des CHECK
    expect(h).toContain('Enregistrer');
  });

  it('CarteReglageEntier : une erreur est un TEXTE avec role="alert" (jamais une couleur seule)', () => {
    const anc = PARAMS_DOSSIERS[0];
    const h = renderToStaticMarkup(createElement(CarteReglageEntier, {
      param: anc, bornes: { min: 1, max: 500 }, valeur: '0',
      onValeur: () => {}, onEnregistrer: () => {}, message: '', erreur: 'minimum 1',
    }));
    expect(h).toContain('role="alert"');
    expect(h).toContain('minimum 1');
  });
});

describe('V2 — rendu des réglages de sélection des candidats', () => {
  const BORNES_081 = parserBornesCheck(['CHECK (((nb_candidats_examines >= 100) AND (nb_candidats_examines <= 50000)))']);

  it('cap : PlageParam affiche la plage issue du CHECK (100 – 50000), jamais recopiée', () => {
    const cap = PARAMS_VEILLE.find((p) => p.colonne === 'nb_candidats_examines')!;
    expect(cap.type).toBe('entier');
    const h = renderToStaticMarkup(createElement(PlageParam, { param: cap, bornes: BORNES_081.nb_candidats_examines }));
    expect(h).toContain('Plage autorisée');
    expect(h).toContain('100');
    expect(h).toContain('50000');
  });

  it('tri : PlageParam liste les CHOIX en libellés FRANÇAIS (pas les valeurs brutes), pas de plage numérique', () => {
    const tri = PARAMS_VEILLE.find((p) => p.colonne === 'tri_candidats')!;
    expect(tri.type).toBe('enum');
    const h = renderToStaticMarkup(createElement(PlageParam, { param: tri, bornes: undefined }));
    expect(h).toContain('Plus grands d’abord (surface, puis date)');
    expect(h).toContain('Plus récents d’abord (date, puis surface)');
    expect(h).toContain('Plus anciens d’abord (date, puis surface)');
    expect(h).not.toContain('surface_puis_date'); // la valeur brute technique n'apparaît pas
    expect(h).not.toContain('Plage autorisée');
  });
});

describe('X1 — rendu des réglages CADA (types e-mail / URL : indice de format, pas de plage numérique recopiée)', () => {
  it('cada_email (type email) → indice de format e-mail, mention « vide = non configurée »', () => {
    const p = PARAMS_VEILLE.find((x) => x.colonne === 'cada_email')!;
    expect(p.type).toBe('email');
    const h = renderToStaticMarkup(createElement(PlageParam, { param: p, bornes: undefined }));
    expect(h).toMatch(/adresse e-mail/i);
    expect(h).not.toContain('Plage autorisée'); // pas de borne numérique (type format)
  });

  it('cada_url_formulaire (type url) → indice de format http(s)://', () => {
    const p = PARAMS_VEILLE.find((x) => x.colonne === 'cada_url_formulaire')!;
    expect(p.type).toBe('url');
    const h = renderToStaticMarkup(createElement(PlageParam, { param: p, bornes: undefined }));
    expect(h).toMatch(/http:\/\/ ou https:\/\//i);
    expect(h).not.toContain('introuvable'); // une URL n'a pas de bornes → pas l'erreur « plage introuvable »
  });
});

describe('Q1 — CarteParamVestigial : lecture seule + mention + a11y', () => {
  const vestigial = PARAMS_VEILLE.find((p) => p.colonne === 'demandes_par_commune_par_mois')!;

  it('le paramètre est bien marqué vestigial dans PARAMS_VEILLE (avec son remplaçant)', () => {
    expect(vestigial.vestigial).toBe(true);
    expect(vestigial.remplacePar).toBe('Permis par commune et par mois');
  });

  it('input NON MODIFIABLE (disabled + aria-disabled, pas seulement grisé), AUCUN bouton « Enregistrer », mention « n’agit plus »', () => {
    const h = renderToStaticMarkup(createElement(CarteParamVestigial, { param: vestigial, valeur: '1' }));
    expect(h).toContain('disabled');            // a11y : annoncé désactivé + hors tabulation
    expect(h).toContain('aria-disabled="true"');
    expect(h).not.toContain('Enregistrer');     // rien à envoyer
    expect(h).toContain('n’agit plus');
    expect(h).toContain('Permis par commune et par mois'); // remplaçant nommé
    expect(h).toContain('value="1"');           // valeur RÉELLE affichée
  });

  it('non-régression : un paramètre VIVANT (CarteReglageEntier) reste éditable (input + Enregistrer)', () => {
    const vivant = PARAMS_VEILLE.find((p) => p.colonne === 'permis_par_commune_par_mois')!;
    const h = renderToStaticMarkup(createElement(CarteReglageEntier, { param: vivant, bornes: { min: 1, max: 200 }, valeur: '5', onValeur: () => {}, onEnregistrer: () => {} }));
    expect(h).toContain('Enregistrer');
    expect(h).not.toContain('disabled');
    expect(h).not.toContain('n’agit plus');
  });
});

describe('E2 — CarteSection : carte à en-tête collant (visuel)', () => {
  it('rend le titre, l’icône en aria-hidden, un en-tête collant, et le corps (children) tel quel', () => {
    const h = renderToStaticMarkup(createElement(CarteSection, { titre: 'Alertes par e-mail', icone: '🔔' }, createElement('span', {}, 'CHAMP_TEST')));
    expect(h).toContain('Alertes par e-mail');
    expect(h).toContain('CHAMP_TEST');            // le corps rend les enfants inchangés
    expect(h).toContain('aria-hidden="true"');    // l'icône ne double pas la lecture d'écran
    expect(h).toContain('🔔');
    expect(h).toMatch(/position:\s*sticky/);      // en-tête collant en haut de la carte
    expect(h).toMatch(/top:\s*0/);
    expect(h).toContain('<h2');                    // le titre reste un h2 (structure de titres préservée)
  });

  it('sans icône : pas de glyphe, le titre reste rendu (repli si aucune icône)', () => {
    const h = renderToStaticMarkup(createElement(CarteSection, { titre: 'Sans icône' }, createElement('span', {}, 'X')));
    expect(h).toContain('Sans icône');
    expect(h).not.toContain('aria-hidden="true"');
  });
});
