import { describe, it, expect } from 'vitest';
import {
  parserBornesCheck, parserListeCheck, parserListeArrayCheck, validerReglages, bandeauIdentite, colonneDepuisProbleme,
  PARAMS_VEILLE, PARAMS_DEMANDES, COLONNES_PARAMS_DEMANDES, CHAMPS_IDENTITE,
  COLONNES_THEME_PREPARATION, COLONNES_THEME_CADA, PARAMS_THEME_TELESERVICE,
  COLONNES_THEME_ENVOI, COLONNES_THEME_REPONSES, COLONNES_THEME_ALERTES, COLONNES_THEME_RATTACHEMENT, COLONNES_THEME_TELESERVICE,
} from './reglagesVeille';

describe('N7-E — parserListeCheck : liste fermée depuis le CHECK', () => {
  it('extrait la liste de la forme = ANY (ARRAY[...]) rendue par Postgres', () => {
    const def = `CHECK ((nature_projet = ANY (ARRAY['habitation'::text, 'bureaux'::text, 'commerce'::text, 'mixte'::text, 'equipement'::text, 'autre'::text])))`;
    expect(parserListeCheck([def], 'nature_projet')).toEqual(['habitation', 'bureaux', 'commerce', 'mixte', 'equipement', 'autre']);
  });
  it('tolère la forme IN (...) et ignore les CHECK d’une autre colonne', () => {
    const defs = [`CHECK ((surface_plancher_m2 >= 0))`, `CHECK (nature_projet IN ('a', 'b'))`];
    expect(parserListeCheck(defs, 'nature_projet')).toEqual(['a', 'b']);
  });
  it('colonne absente → liste vide', () => {
    expect(parserListeCheck([`CHECK ((x >= 0))`], 'nature_projet')).toEqual([]);
  });
});

describe('N13 — parserListeArrayCheck : liste fermée depuis un CHECK « col <@ ARRAY[…] »', () => {
  it('extrait les littéraux de la forme <@ ARRAY[...] (tableau text[])', () => {
    const def = `CHECK (((destinations IS NULL) OR (destinations <@ ARRAY['Bureau'::text, 'Restauration'::text, 'Artisanat et commerce de détail'::text])))`;
    expect(parserListeArrayCheck([def], 'destinations')).toEqual(['Bureau', 'Restauration', 'Artisanat et commerce de détail']);
  });
  it('ignore un CHECK d’une autre colonne et un CHECK sans <@ ARRAY', () => {
    const defs = [`CHECK ((surface_plancher_m2 >= 0))`, `CHECK (destinations_origine = ANY (ARRAY['saisie'::text, 'extraite'::text]))`];
    expect(parserListeArrayCheck(defs, 'destinations')).toEqual([]); // le seul def « destinations » n'a pas <@ ARRAY
  });
});
import { problemesIdentite, type ConfigDemandeur } from './demande';

/**
 * S7d — réglages de la veille permis. Bornes tirées des CHECK de la base (jamais recopiées), validation server-side
 * réutilisant `problemesIdentite`. `DEFS_BASE` reproduit EXACTEMENT la sortie de `pg_get_constraintdef` sur
 * `config_veille` (relevée en base, migrations 048 + 054 + 070 + 074 + 075) : c'est l'oracle des bornes affichées.
 */
const DEFS_BASE = [
  'CHECK (((annees_par_defaut >= 1) AND (annees_par_defaut <= 20)))',
  'CHECK (((demandes_par_commune_par_mois >= 1) AND (demandes_par_commune_par_mois <= 10)))',
  'CHECK (((dossiers_par_demande >= 1) AND (dossiers_par_demande <= 20)))',
  'CHECK ((id = 1))',
  'CHECK (((rang_construction_neuve >= 1) AND (rang_construction_neuve <= 99)))',
  'CHECK (((rang_demolition >= 1) AND (rang_demolition <= 99)))',
  'CHECK (((rang_extension >= 1) AND (rang_extension <= 99)))',
  'CHECK (((rang_immeuble_neuf >= 1) AND (rang_immeuble_neuf <= 99)))',
  'CHECK (((rang_surelevation >= 1) AND (rang_surelevation <= 99)))',
  'CHECK (((seuil_logements_immeuble >= 1) AND (seuil_logements_immeuble <= 500)))',
  'CHECK (((seuil_surface_immeuble_m2 >= 100) AND (seuil_surface_immeuble_m2 <= 100000)))',
  'CHECK (((anciennete_max_demande_annees >= 1) AND (anciennete_max_demande_annees <= 20)))',
  // S37 — caps d'envoi (migration 070)
  'CHECK (((envois_max_par_run >= 1) AND (envois_max_par_run <= 200)))',
  'CHECK (((envois_max_par_jour >= 1) AND (envois_max_par_jour <= 500)))',
  // R7 — relève automatique (migration 074) : Postgres rend `BETWEEN 15 AND 1440` sous cette forme `>= AND <=`
  'CHECK (((releve_intervalle_minutes >= 15) AND (releve_intervalle_minutes <= 1440)))',
  // R6 — échéance + fraîcheur (migration 075)
  'CHECK (((echeance_alerte_jours >= 1) AND (echeance_alerte_jours <= 30)))',
  'CHECK (((releve_fraicheur_heures >= 1) AND (releve_fraicheur_heures <= 720)))',
  // R8 — heure d'envoi des alertes (migration 078)
  'CHECK (((alerte_heure_locale >= 0) AND (alerte_heure_locale <= 23)))',
  // R4 — borne de taille des pièces entrantes (migration 079)
  'CHECK (((piece_taille_max_mo >= 1) AND (piece_taille_max_mo <= 200)))',
  // R3e — plafond de références de recherche (migration 080)
  'CHECK (((recherche_references_max >= 1) AND (recherche_references_max <= 500)))',
  // V2 — profondeur d'examen des candidats (migration 081)
  'CHECK (((nb_candidats_examines >= 100) AND (nb_candidats_examines <= 50000)))',
  // Q1 — plafond mensuel en permis (migration 087) : BETWEEN 1 AND 200 → forme `>= AND <=`
  'CHECK (((permis_par_commune_par_mois >= 1) AND (permis_par_commune_par_mois <= 200)))',
  // LOT B — jours avant l'échéance à partir desquels un rappel est préparé (migration 128) : BETWEEN 1 AND 30 → forme `>= AND <=`
  'CHECK (((relance_jours_avant_echeance >= 1) AND (relance_jours_avant_echeance <= 30)))',
  // Cascade lot 2 — les 3 délais de la cascade (migration 136) : BETWEEN 1 AND 30 → forme `>= AND <=`
  'CHECK (((relance_rappel_jours_avant >= 1) AND (relance_rappel_jours_avant <= 30)))',
  'CHECK (((relance_avis_jours_avant >= 1) AND (relance_avis_jours_avant <= 30)))',
  'CHECK (((relance_saisine_delai_jours >= 1) AND (relance_saisine_delai_jours <= 30)))',
  // CASC-2 — délai avant saisine CADA sur dossier partiel (migration 178) : mois [0;12], jours [0;90]
  'CHECK (((cada_partiel_delai_mois >= 0) AND (cada_partiel_delai_mois <= 12)))',
  'CHECK (((cada_partiel_delai_jours >= 0) AND (cada_partiel_delai_jours <= 90)))',
  // RELANCE — fenêtre horaire d'envoi automatique (migration 140) : BETWEEN 0 AND 23 → forme `>= AND <=`
  'CHECK (((envoi_heure_debut >= 0) AND (envoi_heure_debut <= 23)))',
  'CHECK (((envoi_heure_fin >= 0) AND (envoi_heure_fin <= 23)))',
  // ATT-BATI — seuil du rappel « en attente de bâti » (migration 155) : BETWEEN 30 AND 1095 → forme `>= AND <=`
  'CHECK (((attente_bati_alerte_jours >= 30) AND (attente_bati_alerte_jours <= 1095)))',
  // D4 — réglages téléservice (migration 159) : BETWEEN rendus par pg_get_constraintdef en `>= AND <=`
  'CHECK (((teleservice_dossiers_par_depot >= 1) AND (teleservice_dossiers_par_depot <= 20)))',
  'CHECK (((teleservice_alerte_non_depose_jours >= 1) AND (teleservice_alerte_non_depose_jours <= 90)))',
  // D4-bis — surcharge NULLABLE « permis par commune et par mois (téléservice) » (migration 160) : BETWEEN 1 AND 50
  'CHECK (((teleservice_permis_par_commune_par_mois >= 1) AND (teleservice_permis_par_commune_par_mois <= 50)))',
  // PHASE-1 — les deux délais du verdict à trois phases (migration 170) : BETWEEN 30 AND 1825 → forme `>= AND <=`
  'CHECK (((delai_bascule_jours >= 30) AND (delai_bascule_jours <= 1825)))',
  'CHECK (((duree_message_jours >= 30) AND (duree_message_jours <= 1825)))',
  // SURV-1 — surveillance des polygones après validation (migration 171) : tolérance [0;100] %, fenêtre [30;3650] jours
  'CHECK (((surveillance_tolerance_contour_pct >= 0) AND (surveillance_tolerance_contour_pct <= 100)))',
  'CHECK (((surveillance_fenetre_jours >= 30) AND (surveillance_fenetre_jours <= 3650)))',
];
const BORNES = parserBornesCheck(DEFS_BASE);

const CONF_OK: ConfigDemandeur = {
  raisonSociale: 'Criterimmo', formeJuridique: 'SARL', siegeAdresse: '191 av. Charles de Gaulle, 92200 Neuilly',
  representantNom: 'A. Jorel', representantQualite: 'gérant', emailContact: 'contact@sansvisavis.com', telephone: '',
};

describe('D4-ter (étanche) — classement par rail (e-mail / téléservice / transverse)', () => {
  const par = (col: string) => PARAMS_VEILLE.find((p) => p.colonne === col)!;

  it('rail e-mail : préparation e-mail (dossiers/permis/profil) + caps + relance auto + heures + 3 délais', () => {
    for (const c of ['dossiers_par_demande', 'permis_par_commune_par_mois', 'profil_demandeur_defaut',
      'envois_max_par_run', 'envois_max_par_jour', 'relance_auto_active', 'envoi_heure_debut', 'envoi_heure_fin',
      'relance_rappel_jours_avant', 'relance_avis_jours_avant', 'relance_saisine_delai_jours']) {
      expect(par(c).rail, c).toBe('email');
    }
  });
  it('rail téléservice : les 5 réglages du thème Téléservice (préparation propre + alertes)', () => {
    for (const c of ['teleservice_dossiers_par_depot', 'teleservice_permis_par_commune_par_mois', 'teleservice_profil_demandeur_defaut', 'teleservice_alerte_non_depose_active', 'teleservice_alerte_non_depose_jours']) {
      expect(par(c).rail, c).toBe('teleservice');
    }
    expect(PARAMS_THEME_TELESERVICE.map((p) => p.colonne)).toEqual([
      'teleservice_dossiers_par_depot', 'teleservice_permis_par_commune_par_mois', 'teleservice_profil_demandeur_defaut', 'teleservice_alerte_non_depose_active', 'teleservice_alerte_non_depose_jours',
    ]);
  });
  it('transverse : ancienneté, examen, pièces, adresse de réponse, CADA, relève N’ONT PAS de rail', () => {
    for (const c of ['anciennete_max_demande_annees', 'nb_candidats_examines', 'tri_candidats', 'pieces_demandees', 'adresse_reponse',
      'proposition_cada_active', 'cada_email', 'releve_active', 'echeance_alerte_jours', 'alerte_email']) {
      expect(par(c).rail, c).toBeUndefined();
    }
  });
  it('les réglages téléservice sont éditables (dans COLONNES_PARAMS_DEMANDES) et validés', () => {
    for (const c of ['teleservice_dossiers_par_depot', 'teleservice_permis_par_commune_par_mois', 'teleservice_profil_demandeur_defaut', 'teleservice_alerte_non_depose_active', 'teleservice_alerte_non_depose_jours']) {
      expect(COLONNES_PARAMS_DEMANDES).toContain(c);
    }
    expect(validerReglages({ veille: { teleservice_dossiers_par_depot: 3 } }, BORNES).ok).toBe(true);
    expect(validerReglages({ veille: { teleservice_dossiers_par_depot: 0 } }, BORNES).ok).toBe(false);
    expect(validerReglages({ veille: { teleservice_dossiers_par_depot: 21 } }, BORNES).ok).toBe(false);
    expect(validerReglages({ veille: { teleservice_alerte_non_depose_active: true } }, BORNES).ok).toBe(true);
  });
  // D4-ter (étanche) — les valeurs de rail téléservice sont des ENTIERS PLEINS (plus de NULL « suit le commun ») ; le profil
  //   téléservice est un enum { entreprise, personne } (absorbe P).
  it('étanche : valeur téléservice pleine (null refusé), profil téléservice enum validé', () => {
    expect(validerReglages({ veille: { teleservice_permis_par_commune_par_mois: 25 } }, BORNES).ok).toBe(true);
    expect(validerReglages({ veille: { teleservice_permis_par_commune_par_mois: 0 } }, BORNES).ok).toBe(false);
    expect(validerReglages({ veille: { teleservice_permis_par_commune_par_mois: null } }, BORNES).ok).toBe(false); // plus de « suit le commun »
    expect(validerReglages({ veille: { teleservice_profil_demandeur_defaut: 'personne' } }, BORNES).ok).toBe(true);
    expect(validerReglages({ veille: { teleservice_profil_demandeur_defaut: 'entreprise' } }, BORNES).ok).toBe(true);
    expect(validerReglages({ veille: { teleservice_profil_demandeur_defaut: 'autre' } }, BORNES).ok).toBe(false);
  });
});

describe('S7d — bornes issues des CHECK de la base', () => {
  it('parse min/max depuis pg_get_constraintdef, ignore la contrainte non bornée (id = 1)', () => {
    expect(BORNES.seuil_surface_immeuble_m2).toEqual({ min: 100, max: 100000 });
    expect(BORNES.anciennete_max_demande_annees).toEqual({ min: 1, max: 20 });
    expect(BORNES.demandes_par_commune_par_mois).toEqual({ min: 1, max: 10 });
    expect(BORNES.id).toBeUndefined(); // « id = 1 » n'a pas de plage → pas de borne inventée
  });

  it('AUCUN paramètre entier n’a de plage recopiée : chacun est adossé à un CHECK de la base', () => {
    for (const p of PARAMS_VEILLE.filter((x) => x.type === 'entier')) {
      expect(BORNES[p.colonne], `borne manquante pour ${p.colonne}`).toBeDefined();
    }
  });

  it('N3-C — lit les DEUX formes de CHECK : entière NUE et numeric PARENTHÉSÉE/CASTÉE (borne négative comprise)', () => {
    const b = parserBornesCheck([
      // forme integer NUE (nb_etages, nb_niveaux_sous_sol)
      'CHECK (((nb_etages >= 0) AND (nb_etages <= 70)))',
      // forme numeric : (N)::numeric
      'CHECK (((hauteur_relative_m >= (0)::numeric) AND (hauteur_relative_m <= (300)::numeric)))',
      // forme numeric avec borne NÉGATIVE double-castée : ('-50'::integer)::numeric
      "CHECK (((altitude_sommet_ngf >= ('-50'::integer)::numeric) AND (altitude_sommet_ngf <= (500)::numeric)))",
    ]);
    expect(b.nb_etages).toEqual({ min: 0, max: 70 });
    expect(b.hauteur_relative_m).toEqual({ min: 0, max: 300 });
    expect(b.altitude_sommet_ngf).toEqual({ min: -50, max: 500 });
  });
});

describe('S7d — validation de l’identité (réutilise problemesIdentite)', () => {
  it('identité incomplète REFUSÉE, message nommant le champ fautif, sous la bonne colonne', () => {
    const res = validerReglages({ demandeur: { ...CONF_OK, siegeAdresse: '' } }, BORNES);
    expect(res.ok).toBe(false);
    if (!res.ok) {
      const e = res.erreurs.find((x) => x.message.includes('adresse du siège'));
      expect(e).toBeDefined();
      expect(e!.message).toContain('requis');
      expect(e!.colonne).toBe('siege_adresse');
    }
  });

  it('casse NON bloquante : « CRITERIMMO » (raison sociale au RCS) est ACCEPTÉE (correctif S8a)', () => {
    expect(validerReglages({ demandeur: { ...CONF_OK, raisonSociale: 'CRITERIMMO' } }, BORNES).ok).toBe(true);
  });

  it('GABARIT non rempli REFUSÉ, message nommant la chaîne reconnue', () => {
    const res = validerReglages({ demandeur: { ...CONF_OK, raisonSociale: 'RAISON SOCIALE EXACTE' } }, BORNES);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.erreurs.some((e) => e.colonne === 'raison_sociale' && /gabarit/.test(e.message))).toBe(true);
  });

  it('identité valide ACCEPTÉE (valeurs nettoyées, colonnes snake) et le bandeau bascule', () => {
    const res = validerReglages({ demandeur: { ...CONF_OK, raisonSociale: '  Criterimmo  ' } }, BORNES);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.demandeur.raison_sociale).toBe('Criterimmo'); // trim appliqué
      expect(res.veille).toEqual({});
    }
    expect(bandeauIdentite(problemesIdentite(CONF_OK)).complete).toBe(true);
    expect(bandeauIdentite(problemesIdentite({ ...CONF_OK, emailContact: '' })).complete).toBe(false);
  });

  it('chaque problème d’identité se replace sous une colonne connue (garde anti-divergence des libellés)', () => {
    const vide: ConfigDemandeur = { raisonSociale: '', formeJuridique: '', siegeAdresse: '', representantNom: '', representantQualite: '', emailContact: '', telephone: '' };
    for (const p of problemesIdentite(vide)) {
      expect(CHAMPS_IDENTITE.some((c) => c.libelle === p.split(' : ')[0]), `libellé non mappé: ${p}`).toBe(true);
      expect(colonneDepuisProbleme(p)).not.toBe('');
    }
  });
});

describe('S7d — validation des paramètres moteur (plage = CHECK base)', () => {
  it('valeur HORS PLAGE refusée, RIEN à écrire', () => {
    const trop = validerReglages({ veille: { anciennete_max_demande_annees: 99 } }, BORNES);
    expect(trop.ok).toBe(false);
    if (!trop.ok) expect(trop.erreurs[0].message).toMatch(/maximum 20/);
    const sous = validerReglages({ veille: { seuil_surface_immeuble_m2: 10 } }, BORNES);
    expect(sous.ok).toBe(false);
    if (!sous.ok) expect(sous.erreurs[0].message).toMatch(/minimum 100/);
  });

  it('valeur DANS la plage acceptée ; non entier / colonne inconnue refusés', () => {
    const ok = validerReglages({ veille: { dossiers_par_demande: 8 } }, BORNES);
    expect(ok.ok).toBe(true);
    if (ok.ok) expect(ok.veille).toEqual({ dossiers_par_demande: 8 });
    expect(validerReglages({ veille: { dossiers_par_demande: 3.5 } }, BORNES).ok).toBe(false);
    expect(validerReglages({ veille: { colonne_bidon: 1 } }, BORNES).ok).toBe(false);
  });

  it('pièces demandées : liste de codes normalisée, vide refusée', () => {
    const ok = validerReglages({ veille: { pieces_demandees: ' PC2 , PC3 ' } }, BORNES);
    expect(ok.ok).toBe(true);
    if (ok.ok) expect(ok.veille.pieces_demandees).toBe('PC2,PC3');
    expect(validerReglages({ veille: { pieces_demandees: '  ,  ' } }, BORNES).ok).toBe(false);
  });

  it('patch vide → refus explicite, rien écrit', () => {
    const res = validerReglages({}, BORNES);
    expect(res.ok).toBe(false);
  });

  it('S40 — mention : booléen (oui/non attendu) et texte libre (vide autorisé, trimé)', () => {
    const on = validerReglages({ veille: { mention_service_active: true } }, BORNES);
    expect(on.ok).toBe(true);
    if (on.ok) expect(on.veille.mention_service_active).toBe(true);
    expect(validerReglages({ veille: { mention_service_active: 'oui' } }, BORNES).ok).toBe(false); // pas un booléen
    const txt = validerReglages({ veille: { mention_delai_texte: '  À défaut de réponse…  ' } }, BORNES);
    expect(txt.ok).toBe(true);
    if (txt.ok) expect(txt.veille.mention_delai_texte).toBe('À défaut de réponse…'); // trimé
    const vide = validerReglages({ veille: { mention_delai_texte: '' } }, BORNES);
    expect(vide.ok).toBe(true); // vide autorisé (= rien ajouté)
    if (vide.ok) expect(vide.veille.mention_delai_texte).toBe('');
  });

  it('S38 — adresse de réponse : e-mail valide accepté (trimé), VIDE accepté (non configurée), invalide refusé', () => {
    const ok = validerReglages({ veille: { adresse_reponse: '  demandes@sansvisavis.com ' } }, BORNES);
    expect(ok.ok).toBe(true);
    if (ok.ok) expect(ok.veille.adresse_reponse).toBe('demandes@sansvisavis.com');
    // '' est ACCEPTÉ (c'est le chemin d'envoi qui refuse, pas les réglages)
    const vide = validerReglages({ veille: { adresse_reponse: '' } }, BORNES);
    expect(vide.ok).toBe(true);
    if (vide.ok) expect(vide.veille.adresse_reponse).toBe('');
    // formes invalides → refus (zéro écriture)
    for (const mauvais of ['pas-un-email', 'a@b', 'a b@c.fr']) {
      expect(validerReglages({ veille: { adresse_reponse: mauvais } }, BORNES).ok).toBe(false);
    }
  });

  it('LOT B — réglages de relance : entier borné 1..30 (plage des CHECK) + booléen strict, refus hors bornes / mauvais type', () => {
    // relance_jours_avant_echeance : entier accepté dans [1, 30] (bornes tirées du CHECK 128), refusé hors plage ou non entier.
    const ok = validerReglages({ veille: { relance_jours_avant_echeance: 10 } }, BORNES);
    expect(ok.ok).toBe(true);
    if (ok.ok) expect(ok.veille.relance_jours_avant_echeance).toBe(10);
    expect(validerReglages({ veille: { relance_jours_avant_echeance: 0 } }, BORNES).ok).toBe(false);  // < min 1
    expect(validerReglages({ veille: { relance_jours_avant_echeance: 31 } }, BORNES).ok).toBe(false); // > max 30
    expect(validerReglages({ veille: { relance_jours_avant_echeance: 2.5 } }, BORNES).ok).toBe(false); // pas un entier
    // relance_auto_active : booléen strict (STOCKÉ ; aucun code d'envoi ne le lit dans ce lot).
    const on = validerReglages({ veille: { relance_auto_active: true } }, BORNES);
    expect(on.ok).toBe(true);
    if (on.ok) expect(on.veille.relance_auto_active).toBe(true);
    expect(validerReglages({ veille: { relance_auto_active: 'oui' } }, BORNES).ok).toBe(false); // pas un booléen
  });

  it('S30 — URL DILA : http(s) accepté (trimé), forme invalide refusée (zéro écriture)', () => {
    const ok = validerReglages({ veille: { dila_url: '  https://data.gouv.fr/x  ' } }, BORNES);
    expect(ok.ok).toBe(true);
    if (ok.ok) expect(ok.veille.dila_url).toBe('https://data.gouv.fr/x'); // trimé
    expect(validerReglages({ veille: { dila_url: 'http://ok.example/a' } }, BORNES).ok).toBe(true);
    // refus : pas d'http, espaces, vide, mauvais schéma → aucune écriture
    for (const mauvais of ['pas-une-url', 'ftp://x', 'https://a b', '', 'www.data.gouv.fr']) {
      const r = validerReglages({ veille: { dila_url: mauvais } }, BORNES);
      expect(r.ok).toBe(false);
    }
  });
});

describe('S7e — validation par profil + profil par défaut', () => {
  const PERS = { representantNom: 'Jean Dupont', siegeAdresse: '12 rue des Lilas, 92000 Nanterre', emailContact: 'jean.dupont@exemple.fr' };

  it('« personne » : identité nom+adresse+e-mail acceptée SANS raison sociale', () => {
    const res = validerReglages({ demandeur: PERS }, BORNES, 'personne');
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.demandeur.representant_nom).toBe('Jean Dupont');
      expect(res.demandeur.email_contact).toBe('jean.dupont@exemple.fr');
    }
  });

  it('« personne » : nom manquant refusé, nommé « nom »', () => {
    const res = validerReglages({ demandeur: { ...PERS, representantNom: '' } }, BORNES, 'personne');
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.erreurs.some((e) => e.colonne === 'representant_nom' && /nom : requis/.test(e.message))).toBe(true);
  });

  it('« entreprise » : la même saisie (sans raison sociale) est refusée', () => {
    const res = validerReglages({ demandeur: PERS }, BORNES, 'entreprise');
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.erreurs.some((e) => e.colonne === 'raison_sociale')).toBe(true);
  });

  it('profil_demandeur_defaut : valeur de la liste acceptée, hors-liste refusée', () => {
    const ok = validerReglages({ veille: { profil_demandeur_defaut: 'personne' } }, BORNES);
    expect(ok.ok).toBe(true);
    if (ok.ok) expect(ok.veille.profil_demandeur_defaut).toBe('personne');
    expect(validerReglages({ veille: { profil_demandeur_defaut: 'anonyme' } }, BORNES).ok).toBe(false);
  });
});

describe('V2 — sélection des candidats : cap (bornes CHECK) + tri (liste fermée)', () => {
  it('les deux paramètres sont dans le sous-bloc « demandes » (rendus dans l’onglet Réglages), thème « Préparation » (E1)', () => {
    for (const col of ['nb_candidats_examines', 'tri_candidats']) {
      expect(COLONNES_PARAMS_DEMANDES).toContain(col);
      expect(PARAMS_DEMANDES.some((p) => p.colonne === col)).toBe(true);
      expect(COLONNES_THEME_PREPARATION).toContain(col); // E1 — rangés dans « Préparation des demandes »
    }
  });

  it('nb_candidats_examines : entier accepté dans la plage, refusé hors bornes (plage = CHECK)', () => {
    expect(validerReglages({ veille: { nb_candidats_examines: 5000 } }, BORNES).ok).toBe(true);
    expect(validerReglages({ veille: { nb_candidats_examines: 99 } }, BORNES).ok).toBe(false);     // < 100
    expect(validerReglages({ veille: { nb_candidats_examines: 50001 } }, BORNES).ok).toBe(false);  // > 50000
    expect(validerReglages({ veille: { nb_candidats_examines: 1000.5 } }, BORNES).ok).toBe(false); // non entier
  });

  it('tri_candidats : les trois valeurs de la liste acceptées, une valeur inconnue REFUSÉE', () => {
    for (const v of ['surface_puis_date', 'date_puis_surface', 'date_ancienne_puis_surface']) {
      const ok = validerReglages({ veille: { tri_candidats: v } }, BORNES);
      expect(ok.ok).toBe(true);
      if (ok.ok) expect(ok.veille.tri_candidats).toBe(v);
    }
    expect(validerReglages({ veille: { tri_candidats: 'au_hasard' } }, BORNES).ok).toBe(false);
  });

  it('tri_candidats porte trois libellés d’affichage en français', () => {
    const tri = PARAMS_DEMANDES.find((p) => p.colonne === 'tri_candidats')!;
    expect(tri.type).toBe('enum');
    expect(tri.optionsEnumLabels?.surface_puis_date).toMatch(/grands/i);
    expect(tri.optionsEnumLabels?.date_puis_surface).toMatch(/récents/i);
    expect(tri.optionsEnumLabels?.date_ancienne_puis_surface).toMatch(/anciens/i);
  });
});

describe('X1 — canal CADA : cada_email (e-mail, vide autorisé) + cada_url_formulaire (URL)', () => {
  it('les deux paramètres sont dans le sous-bloc « demandes », thème « Saisine CADA » (E1)', () => {
    for (const col of ['cada_email', 'cada_url_formulaire']) {
      expect(COLONNES_PARAMS_DEMANDES).toContain(col);
      expect(PARAMS_DEMANDES.some((p) => p.colonne === col)).toBe(true);
      expect(COLONNES_THEME_CADA).toContain(col); // E1 — rangés dans « Saisine CADA »
    }
  });

  it('cada_email (type email) : vide ACCEPTÉ (= formulaire en ligne), adresse valide ACCEPTÉE, invalide REFUSÉE', () => {
    const vide = validerReglages({ veille: { cada_email: '' } }, BORNES);
    expect(vide.ok).toBe(true);
    if (vide.ok) expect(vide.veille.cada_email).toBe(''); // '' n'est pas une erreur : c'est le mode formulaire
    expect(validerReglages({ veille: { cada_email: '  cada@cada.fr ' } }, BORNES).ok).toBe(true); // trim + valide
    expect(validerReglages({ veille: { cada_email: 'pas-une-adresse' } }, BORNES).ok).toBe(false);
  });

  it('cada_url_formulaire (type url) : http(s) ACCEPTÉE, non-URL et vide REFUSÉES', () => {
    expect(validerReglages({ veille: { cada_url_formulaire: 'https://www.cada.fr/formulaire-de-saisine' } }, BORNES).ok).toBe(true);
    expect(validerReglages({ veille: { cada_url_formulaire: 'cada.fr' } }, BORNES).ok).toBe(false); // pas de schéma http(s)
    expect(validerReglages({ veille: { cada_url_formulaire: '' } }, BORNES).ok).toBe(false);        // une URL de formulaire est requise
  });

  it('l’aide de cada_email explique le mode « formulaire en ligne » quand l’adresse est vide', () => {
    const p = PARAMS_DEMANDES.find((x) => x.colonne === 'cada_email')!;
    expect(p.type).toBe('email');
    expect(p.aide).toMatch(/formulaire en ligne/i);
  });
});

describe('Q1 — paramètre VESTIGIAL : l’API refuse toute modification (le grisé écran ne suffit pas)', () => {
  it('modifier demandes_par_commune_par_mois (vestigial) → REFUSÉ (« n’agit plus »), rien écrit', () => {
    const res = validerReglages({ veille: { demandes_par_commune_par_mois: 3 } }, BORNES);
    expect(res.ok).toBe(false);
    if (!res.ok) {
      const e = res.erreurs.find((x) => x.colonne === 'demandes_par_commune_par_mois');
      expect(e).toBeDefined();
      expect(e!.message).toMatch(/n['’]agit plus/);
      expect(e!.message).toContain('Permis par commune et par mois');
    }
  });

  it('le NOUVEAU permis_par_commune_par_mois reste éditable (non-régression sur le voisin vivant)', () => {
    const res = validerReglages({ veille: { permis_par_commune_par_mois: 8 } }, BORNES);
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.veille.permis_par_commune_par_mois).toBe(8);
  });
});

describe('CASC-2b — GARDE-FOU : toute colonne d’un thème a un ParamVeille (sinon paramsDuTheme casse TOUTE l’interface admin au chargement)', () => {
  // Régression réelle : une colonne listée dans un COLONNES_THEME_* sans définition ParamVeille fait LEVER paramsDuTheme au chargement
  //   du module → /admin/permis (et tous les écrans qui l'importent) ne rendent plus. Ce test nomme le défaut au lieu d'un crash obscur.
  const NOMS_PARAMS = new Set(PARAMS_VEILLE.map((p) => p.colonne));
  const THEMES: [string, readonly string[]][] = [
    ['PREPARATION', COLONNES_THEME_PREPARATION], ['ENVOI', COLONNES_THEME_ENVOI], ['REPONSES', COLONNES_THEME_REPONSES],
    ['ALERTES', COLONNES_THEME_ALERTES], ['CADA', COLONNES_THEME_CADA], ['RATTACHEMENT', COLONNES_THEME_RATTACHEMENT],
    ['TELESERVICE', COLONNES_THEME_TELESERVICE], ['PARAMS_DEMANDES (union)', COLONNES_PARAMS_DEMANDES],
  ];
  for (const [nom, cols] of THEMES) {
    it(`chaque colonne du thème ${nom} a une définition ParamVeille`, () => {
      const manquantes = cols.filter((c) => !NOMS_PARAMS.has(c));
      expect(manquantes, `colonnes sans ParamVeille dans ${nom} : ${manquantes.join(', ')}`).toEqual([]);
    });
  }

  it('CASC-2c : cada_partiel_delai_* sont câblées des DEUX côtés (thème CADA + ParamVeille), migration 178 appliquée', () => {
    // Cohérence stricte : présentes dans le thème CADA ET définies comme ParamVeille (bornes = CHECK live 178). Câblage complet.
    expect(COLONNES_THEME_CADA).toContain('cada_partiel_delai_mois');
    expect(COLONNES_THEME_CADA).toContain('cada_partiel_delai_jours');
    expect(NOMS_PARAMS.has('cada_partiel_delai_mois')).toBe(true);
    expect(NOMS_PARAMS.has('cada_partiel_delai_jours')).toBe(true);
  });
});
