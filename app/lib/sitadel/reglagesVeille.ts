/**
 * Réglages de la veille permis (chantier S7d) — logique PURE et testable, partagée par l'écran « Réglages » et sa route
 * d'écriture. ⚠️ AUCUNE I/O ici (pas de DB, pas de `server-only`) : ce module est importé aussi bien côté serveur que
 * côté client. Il porte les MÉTADONNÉES d'affichage (libellés, unités, aides) et la VALIDATION, mais JAMAIS les bornes
 * numériques : celles-ci viennent EXCLUSIVEMENT des contraintes CHECK de `config_veille` (cf. `parserBornesCheck`), pour
 * qu'aucune liste recopiée ne puisse diverger de la base.
 *
 * La validation d'identité RÉUTILISE `problemesIdentite` (S7c) — elle n'est pas redéfinie ici.
 */
import { problemesIdentite, type ConfigDemandeur, type ProfilDemandeur } from './demande';
import type { ConfigVeille } from './veilleConfig';

// ── Bornes issues des CHECK SQL (source unique) ──────────────────────────────
export interface Bornes { min: number; max: number }
export type BornesParColonne = Record<string, Bornes>;

/**
 * Parse les bornes `min`/`max` à partir des définitions de contraintes CHECK renvoyées par
 * `pg_get_constraintdef` (ex. `CHECK (((annees_par_defaut >= 1) AND (annees_par_defaut <= 20)))`). Une contrainte est
 * retenue si elle porte un `>=` et un `<=` sur LA MÊME colonne ; les autres (ex. `id = 1`) sont ignorées. La source des
 * bornes est ainsi la base elle-même — jamais une liste maintenue à la main.
 */
export function parserBornesCheck(defs: string[]): BornesParColonne {
  const bornes: BornesParColonne = {};
  // N3-C — le littéral comparé à une colonne peut être NU (`>= 0`, colonnes integer) OU parenthésé/quoté/CASTÉ par Postgres pour
  //   les colonnes numeric : `>= (0)::numeric`, `<= (300)::numeric`, `>= ('-50'::integer)::numeric`. On tolère donc, ENTRE
  //   l'opérateur et le nombre, une parenthèse ouvrante et/ou une apostrophe optionnelles (`\(?\s*'?`). Le nombre reste capturé
  //   à l'identique (les casts qui suivent sont ignorés). Additif : les formes nues précédentes matchent toujours.
  for (const def of defs) {
    const min = /([a-z_][a-z0-9_]*)\s*>=\s*\(?\s*'?\s*(-?\d+(?:\.\d+)?)/i.exec(def);
    const max = /([a-z_][a-z0-9_]*)\s*<=\s*\(?\s*'?\s*(-?\d+(?:\.\d+)?)/i.exec(def);
    if (min && max && min[1] === max[1]) {
      bornes[min[1]] = { min: Number(min[2]), max: Number(max[2]) };
    }
  }
  return bornes;
}

/**
 * N7-E — LISTE FERMÉE d'une colonne depuis ses CHECK `IN (...)`. Postgres rend `col IN ('a','b')` comme
 * `((col = ANY (ARRAY['a'::text, 'b'::text])))` : on repère la définition qui cite la colonne ET porte `= ANY`/`IN (`, puis on
 * extrait les littéraux quotés dans l'ordre. `[]` si absente. Source = la base, jamais une constante recopiée.
 */
export function parserListeCheck(defs: string[], colonne: string): string[] {
  const nomCol = new RegExp(`\\b${colonne.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`);
  for (const def of defs) {
    if (!nomCol.test(def) || !/=\s*ANY|IN\s*\(/i.test(def)) continue;
    const casts = [...def.matchAll(/'([^']*)'::/g)].map((m) => m[1]);     // 'x'::text (forme = ANY(ARRAY[...]))
    if (casts.length) return casts;
    const nus = [...def.matchAll(/'([^']*)'/g)].map((m) => m[1]);          // repli IN ('a','b')
    if (nus.length) return nus;
  }
  return [];
}

/**
 * N13 — LISTE FERMÉE d'une colonne TABLEAU depuis son CHECK `col <@ ARRAY['a'::text, 'b'::text, …]`. Même principe que
 * `parserListeCheck` (source = la base, jamais une constante recopiée), pour l'opérateur d'inclusion de tableau `<@`. On repère la
 * définition qui cite la colonne ET porte `<@ ARRAY`, puis on extrait les littéraux quotés dans l'ordre. `[]` si absente.
 */
export function parserListeArrayCheck(defs: string[], colonne: string): string[] {
  const nomCol = new RegExp(`\\b${colonne.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`);
  for (const def of defs) {
    if (!nomCol.test(def) || !/<@\s*ARRAY/i.test(def)) continue;
    const casts = [...def.matchAll(/'([^']*)'::/g)].map((m) => m[1]);       // 'x'::text
    if (casts.length) return casts;
    const nus = [...def.matchAll(/'([^']*)'/g)].map((m) => m[1]);
    if (nus.length) return nus;
  }
  return [];
}

// ── Identité du demandeur (config_demandeur) ─────────────────────────────────
export interface ChampIdentite {
  cle: keyof ConfigDemandeur;
  colonne: string;
  libelle: string; // DOIT coïncider avec le libellé employé par `problemesIdentite` (mapping des erreurs par champ).
  aide: string;
  multiligne?: boolean;
}

/**
 * Les 7 champs de `config_demandeur`, dans l'ordre d'affichage. Chaque aide explique ce que le champ DEVIENT dans le
 * courrier. ⚠️ Les `libelle` reproduisent exactement ceux de `problemesIdentite` (S7c) : c'est ce qui permet de replacer
 * chaque message d'erreur sous le bon champ (`colonneDepuisProbleme`). Un test verrouille cette correspondance.
 */
export const CHAMPS_IDENTITE: ChampIdentite[] = [
  { cle: 'raisonSociale', colonne: 'raison_sociale', libelle: 'raison sociale',
    aide: 'Nom LÉGAL de la structure au registre (RCS), et non la marque commerciale. Apparaît en signature de la demande.' },
  { cle: 'formeJuridique', colonne: 'forme_juridique', libelle: 'forme juridique',
    aide: 'Forme de la société (ex. SARL, SAS). Complète la dénomination dans la demande.' },
  { cle: 'siegeAdresse', colonne: 'siege_adresse', libelle: 'adresse du siège', multiligne: true,
    aide: 'Adresse du siège social. Figure dans le corps de la demande comme domicile de la personne morale.' },
  { cle: 'representantNom', colonne: 'representant_nom', libelle: 'nom du représentant',
    aide: 'Personne physique signataire. Apparaît comme représentant de la personne morale dans la demande.' },
  { cle: 'representantQualite', colonne: 'representant_qualite', libelle: 'qualité du représentant',
    aide: 'Fonction du signataire (ex. gérant). Établit la qualité pour agir au nom de la personne morale — et donc l’accès au recours en cas de silence de l’administration.' },
  { cle: 'emailContact', colonne: 'email_contact', libelle: 'e-mail de contact',
    aide: 'Adresse de réponse indiquée à la mairie : c’est là que la commune renverra les pièces communiquées.' },
  { cle: 'telephone', colonne: 'telephone', libelle: 'téléphone',
    aide: 'Téléphone de contact (facultatif). Ajouté à l’adresse de réponse uniquement s’il est renseigné.' },
];

/**
 * Champs du profil « personne physique » (S7e) : nom + adresse postale + e-mail SEULEMENT. Les colonnes sont partagées
 * avec `config_demandeur` (representant_nom / siege_adresse / email_contact) mais les LIBELLÉS diffèrent (« nom »,
 * « adresse postale ») et coïncident avec ceux de `problemesIdentite('personne')`. Raison sociale / forme / qualité :
 * NI requis NI affichés pour ce profil.
 */
export const CHAMPS_PERSONNE: ChampIdentite[] = [
  { cle: 'representantNom', colonne: 'representant_nom', libelle: 'nom',
    aide: 'Votre nom (personne physique) : il identifie le demandeur et signe la demande. Aucune société n’est mentionnée.' },
  { cle: 'siegeAdresse', colonne: 'siege_adresse', libelle: 'adresse postale', multiligne: true,
    aide: 'Votre adresse postale : figure en tête de la demande comme domicile du demandeur.' },
  { cle: 'emailContact', colonne: 'email_contact', libelle: 'e-mail de contact',
    aide: 'Adresse de réponse : la mairie renverra les pièces à cette adresse (elle figure en tête de la demande).' },
];

/** Champs affichés/écrits pour un profil donné. */
export function champsPourProfil(profil: ProfilDemandeur): ChampIdentite[] {
  return profil === 'personne' ? CHAMPS_PERSONNE : CHAMPS_IDENTITE;
}

const TOUS_CHAMPS: ChampIdentite[] = [...CHAMPS_IDENTITE, ...CHAMPS_PERSONNE];

/** Retrouve la colonne d'un message `problemesIdentite` (« libellé : raison ») via son libellé — tous profils. */
export function colonneDepuisProbleme(probleme: string): string {
  const libelle = probleme.split(' : ')[0];
  return TOUS_CHAMPS.find((c) => c.libelle === libelle)?.colonne ?? '';
}

/** État du bandeau permanent : l'identité est-elle complète (→ les demandes peuvent passer en « prête ») ? */
export function bandeauIdentite(problemes: string[]): { complete: boolean; message: string } {
  if (problemes.length === 0) {
    return { complete: true, message: 'Identité du demandeur complète — les demandes peuvent passer en « prête ».' };
  }
  return {
    complete: false,
    message: `Identité du demandeur incomplète — ${problemes.join(' ; ')}. Aucune demande ne peut passer en « prête » tant que ce n’est pas corrigé.`,
  };
}

// ── Paramètres du moteur (config_veille) ─────────────────────────────────────
export interface ParamVeille {
  colonne: string;
  cle: keyof ConfigVeille;
  libelle: string;
  unite: string;
  type: 'entier' | 'texte' | 'enum' | 'url' | 'email' | 'booleen' | 'texte_libre';
  aide: string;
  optionsEnum?: string[]; // pour type 'enum' : liste fermée des valeurs admises
  optionsEnumLabels?: Record<string, string>; // libellés d'affichage FR des options 'enum' (repli = la valeur brute)
  formatHint?: string; // F-N1 : rappel de format PROPRE au paramètre (type 'texte') — sinon un défaut générique est affiché
  /**
   * Q1 — motif VESTIGIAL porté sur la veille (miroir de `StatutColonne`/`editable:false` de config_scoring) : un paramètre
   * marqué N'AGIT PLUS. Il reste EN BASE (lu par l'historique), mais devient NON éditable (écran lecture seule + refus API).
   * `remplacePar` = libellé du paramètre qui l'a remplacé (pour la mention « remplacé par … »).
   */
  vestigial?: boolean;
  remplacePar?: string;
  /**
   * D4-ter (ÉTANCHE) — RAIL du réglage, qui détermine son SEUL espace d'affichage : `'email'` = uniquement l'onglet « Envoi
   * e-mail auto » ; `'teleservice'` = uniquement l'onglet « Téléservice ». ABSENT = TRANSVERSE (uniquement l'onglet « Transverse »,
   * valeur commune aux deux process). Trois périmètres ÉTANCHES : un réglage n'appartient qu'à UN espace, aucune valeur partagée
   * rendue des deux côtés. Purement un classement d'AFFICHAGE : n'affecte NI la lecture NI l'écriture. Voir `espaceReglage`.
   */
  rail?: 'email' | 'teleservice';
}

/** Forme minimale d'une URL http(s) — MIROIR APPLICATIF du CHECK `config_veille_dila_url_check` (migration 069). */
export const FORME_URL = /^https?:\/\/\S+$/i;
/** Forme minimale d'une adresse e-mail — MIROIR APPLICATIF du CHECK `config_veille_adresse_reponse_check` (migration 071). */
export const FORME_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Les paramètres éditables de `config_veille`, dans l'ordre d'affichage. ⚠️ AUCUN min/max ici : la plage vient des CHECK
 * de la base (`parserBornesCheck`). Chaque aide dit ce que le paramètre change concrètement.
 */
export const PARAMS_VEILLE: ParamVeille[] = [
  { colonne: 'anciennete_max_demande_annees', cle: 'ancienneteMaxDemandeAnnees', libelle: 'Ancienneté maximale des demandes', unite: 'années', type: 'entier',
    aide: 'Au-delà de cet âge, le bâtiment est déjà mesuré par le LiDAR (MNS) : la demande de pièces devient inutile et n’est plus proposée.' },
  { colonne: 'dossiers_par_demande', cle: 'dossiersParDemande', libelle: 'Dossiers par demande', unite: 'dossiers', type: 'entier', rail: 'email',
    aide: 'Nombre maximum de dossiers regroupés dans une même demande adressée à une mairie PAR E-MAIL. Borne le volume par courrier. (Le téléservice a sa propre valeur.)' },
  // Q1 — NOUVEAU paramètre VIVANT : le plafond mensuel se compte désormais en PERMIS (dossiers), indépendamment du regroupement.
  { colonne: 'permis_par_commune_par_mois', cle: 'permisParCommuneParMois', libelle: 'Permis par commune et par mois', unite: 'permis / mois', type: 'entier', rail: 'email',
    aide: 'Nombre maximum de PERMIS (dossiers) demandés PAR E-MAIL à une même commune par mois — quel que soit le nombre de courriers que cela représente. (Le téléservice a sa propre valeur.)' },
  // Q1 — VESTIGIAL : ce paramètre comptait des DEMANDES (courriers) ; il n'agit plus (remplacé par « Permis par commune et par
  // mois »). Conservé en base (lu par l'historique), rendu en lecture seule + refusé par la route (validerReglages).
  { colonne: 'demandes_par_commune_par_mois', cle: 'demandesParCommuneParMois', libelle: 'Demandes par commune et par mois', unite: 'demandes / mois', type: 'entier',
    vestigial: true, remplacePar: 'Permis par commune et par mois',
    aide: 'Comptait le nombre de demandes (courriers) envoyées à une même commune par mois.' },
  // V2 — profondeur d'examen des candidats (ex-const NB_CANDIDATS) : pilotable au runtime, invariant « pilotage sans code ».
  { colonne: 'nb_candidats_examines', cle: 'nbCandidatsExamines', libelle: 'Profondeur d’examen des dossiers', unite: 'dossiers', type: 'entier',
    aide: 'Combien de dossiers, tout en haut du classement, sont examinés pour préparer les demandes. Trop bas, des dossiers récents mais moins « gros » ne sont jamais atteints ; plus haut = davantage de dossiers proposés. Au-delà de la taille du fichier des permis, la préparation devient un peu plus lente.' },
  // V2 — ordre secondaire de tri des candidats (ex-const ORDRE_SECONDAIRE) : GARDE (liste fermée), libellés FR.
  { colonne: 'tri_candidats', cle: 'triCandidats', libelle: 'Ordre d’examen des dossiers', unite: '', type: 'enum',
    optionsEnum: ['surface_puis_date', 'date_puis_surface', 'date_ancienne_puis_surface'],
    optionsEnumLabels: { surface_puis_date: 'Plus grands d’abord (surface, puis date)', date_puis_surface: 'Plus récents d’abord (date, puis surface)', date_ancienne_puis_surface: 'Plus anciens d’abord (date, puis surface)' },
    aide: 'Dans quel ordre les dossiers sont départagés à catégorie égale : « plus grands d’abord » remonte les gros projets (mais peut enterrer des dossiers récents plus petits) ; « plus récents d’abord » privilégie les permis récents ; « plus anciens d’abord » traite d’abord les permis les plus vieux de la fenêtre (rattraper le retard). ⚠️ Ce choix change AUSSI l’ordre de la liste affichée dans l’onglet « Dossiers ».' },
  // S37 — CAPS D'ENVOI : le rempart contre un envoi accidentel en masse. À monter avec prudence.
  { colonne: 'envois_max_par_run', cle: 'envoisMaxParRun', libelle: 'Envois maximum par action', unite: 'e-mails', type: 'entier', rail: 'email',
    aide: 'Nombre maximum d’e-mails envoyés aux mairies en UNE seule action d’envoi. C’est le rempart de sécurité : même en cas d’erreur, jamais plus que ce nombre ne part d’un coup. L’augmenter accélère la campagne mais accroît le risque qu’un envoi accidentel touche beaucoup de mairies à la fois.' },
  { colonne: 'envois_max_par_jour', cle: 'envoisMaxParJour', libelle: 'Envois maximum par jour', unite: 'e-mails / jour', type: 'entier', rail: 'email',
    aide: 'Nombre maximum d’e-mails envoyés aux mairies sur une journée entière (toutes actions cumulées). L’augmenter raccourcit la durée de la campagne ; le garder bas protège contre un envoi de masse involontaire et évite d’être classé indésirable par la messagerie.' },
  // PLAFOND ANTI-CUMUL — au plus N e-mails AUTO par demande et par PASSAGE, tous émetteurs confondus (rempart contre deux relances à la même mairie dans un même run). Défaut 1.
  { colonne: 'envois_auto_max_par_demande_run', cle: 'envoisAutoMaxParDemandeRun', libelle: 'Envois automatiques maximum par demande et par passage', unite: 'e-mails', type: 'entier', rail: 'email',
    aide: 'Nombre maximum d’e-mails AUTOMATIQUES qu’une même demande peut recevoir en UN seul passage de la veille (toutes les 15 min), tous types confondus : relance ordinaire, relance de dossier partiel, relance sur réponse, saisine CADA. Le défaut 1 garantit qu’une mairie ne reçoit jamais deux relances automatiques d’un coup. Ce n’est PAS une limite par jour : à chaque passage suivant, le compte repart à zéro (une nouvelle réponse d’une mairie peut donc toujours être relancée). L’envoi que VOUS déclenchez à la main n’est jamais bridé.' },
  // S38 — adresse de réponse (reply-to). Sans valeur par défaut : tant qu'elle est vide, l'envoi refuse de s'exécuter.
  // D4-ter (R2) — TRANSVERSE (ni rail, ni partagé). ⚠️ Ce N'EST PAS le Reply-To technique : depuis S43, le from/reply-to réel est
  //   l'e-mail du PROFIL de la demande (config_demandeur.email_contact, société/personne — envoiDemande.ts:84,187). Ce réglage-ci
  //   pilote seulement (i) la ligne « Adresse de réponse » IMPRIMÉE dans le corps (demande.ts:700) et (ii) la boîte RELEVÉE
  //   (reponsesSuivi.ts:275). Libellé honnête pour ne pas laisser croire qu'il est « le retour » (le retour dépend du profil).
  //   [DETTE connue : corps et Reply-To peuvent diverger — lot dédié après la série R, cf. mémoire.]
  { colonne: 'adresse_reponse', cle: 'adresseReponse', libelle: 'Adresse de réponse (corps du courrier + boîte relevée)', unite: '', type: 'email',
    aide: 'Cette adresse sert à DEUX choses : (1) elle est imprimée dans le corps de chaque demande comme « Adresse de réponse » ; (2) c’est la boîte que la relève interroge pour lire les réponses des mairies. ⚠️ Ce n’est PAS le « Reply-To » technique de l’e-mail : celui-ci est l’e-mail du PROFIL de la demande (Société / Personne physique), défini dans « Identités du demandeur ». Gardez les deux cohérents. Tant qu’elle est vide, aucun envoi n’est possible.' },
  // LOT B — RELANCES : le duo « à partir de quand un rappel est préparé » + « les relances partent-elles toutes seules ». Rangés
  //   dans « Envoi aux mairies » (thème ENVOI). ⚠️ relance_auto_active est STOCKÉ et AFFICHÉ, mais LU PAR AUCUN CODE D'ENVOI dans
  //   ce lot (l'envoi automatique est un lot ultérieur) — l'aide le dit sans détour puisque le thème s'appelle « Envoi aux mairies ».
  // Cascade lot 2 — DOUBLON transitoire de « Rappel — jours avant l’échéance » (migration 136 : COMMENT vestigial en base, valeur
  //   reportée dans le successeur). Laissé ÉDITABLE ici : marquer le descripteur vestigial (écran lecture seule) relève de l’affichage (lot 4).
  { colonne: 'relance_jours_avant_echeance', cle: 'relanceJoursAvantEcheance', libelle: 'Nombre de jours avant l’échéance', unite: 'jours', type: 'entier',
    aide: 'À partir de ce nombre de jours avant l’échéance, un rappel est préparé pour les demandes restées sans réponse. La préparation a toujours lieu et n’envoie rien.' },
  { colonne: 'relance_auto_active', cle: 'relanceAutoActive', libelle: 'Envoyer les relances automatiquement', unite: '', type: 'booleen', rail: 'email',
    aide: 'Si cette case est cochée, les relances partiront vers les mairies sans relecture. Tant qu’elle est décochée, rien ne part sans un clic.' },
  // AUTO-PARTIEL — interrupteur d'arrêt d'urgence de la cascade PARTIELLE (relances de dossier incomplet + annonce CADA). Modèle relance_auto_active.
  { colonne: 'cascade_partiel_auto_active', cle: 'cascadePartielAutoActive', libelle: 'Envoyer la cascade partielle automatiquement', unite: '', type: 'booleen', rail: 'email',
    aide: 'Si cette case est cochée, les relances de dossier incomplet (relances, annonce CADA) partent seules aux dates de la cascade, sans clic. Décochée, rien ne part sans un clic (arrêt d’urgence). Le délai de saisine CADA n’est jamais modifié par ce réglage.' },
  // Cascade lot 2 — les 3 délais de la cascade, dans l’ordre chronologique (rappel J-10, avis J-3, saisine J+délai). Bornes 1..30
  //   lues au runtime depuis les CHECK (migration 136). Aides en conséquences concrètes : ce qui part, quand.
  // D4-ter (R1) — RAIL E-MAIL : ces 3 délais DÉTERMINENT quand une relance/saisine part TOUTE SEULE, ce qui n'existe QU'en e-mail
  //   (le sélecteur de relance est borné `dest_canal='email'`, envoiRelance.ts:170). Critère « un réglage vit là où il détermine
  //   un geste » → espace E-mail. ⚠️ À REDEVENIR `partage` (commun aux deux rails) le jour où le téléservice aura sa propre relance
  //   (déposée à la main) : ce sont des délais LÉGAUX CRPA, pas des préférences d'envoi — l'aide le dit à l'écran.
  { colonne: 'relance_rappel_jours_avant', cle: 'relanceRappelJoursAvant', libelle: 'Rappel — jours avant l’échéance', unite: 'jours', type: 'entier', rail: 'email',
    aide: 'Combien de jours AVANT la fin du délai d’un mois le premier RAPPEL est préparé. Ce rappel est courtois : il ne parle NI de refus tacite NI de la CADA, car la mairie est encore dans son délai. C’est un délai LÉGAL (CRPA), pas une préférence d’envoi ; il n’agit aujourd’hui que sur le rail e-mail, seul à envoyer des relances automatiquement.' },
  { colonne: 'relance_avis_jours_avant', cle: 'relanceAvisJoursAvant', libelle: 'Avis d’échéance — jours avant l’échéance', unite: 'jours', type: 'entier', rail: 'email',
    aide: 'Combien de jours AVANT l’échéance l’AVIS est préparé. Il prévient la mairie que l’échéance approche et qu’à défaut de réponse vous pourrez saisir la CADA — sans encore la saisir. Une réponse de sa part rend la démarche sans objet. C’est un délai LÉGAL (CRPA), pas une préférence d’envoi ; il n’agit aujourd’hui que sur le rail e-mail, seul à envoyer des relances automatiquement.' },
  { colonne: 'relance_saisine_delai_jours', cle: 'relanceSaisineDelaiJours', libelle: 'Saisine CADA — délai après l’échéance', unite: 'jours', type: 'entier', rail: 'email',
    aide: 'Combien de jours APRÈS l’échéance la saisine de la CADA sera déposée. Le jour de l’échéance, un message l’annonce à la mairie ; ce délai lui laisse une dernière chance de transmettre les pièces avant le dépôt. C’est un délai LÉGAL (CRPA), pas une préférence d’envoi ; il n’agit aujourd’hui que sur le rail e-mail, seul à envoyer des relances automatiquement.' },
  // LOT 20 — MULTI-ADRESSE des 2 dernières relances (opt-in strict, décoché par défaut → le déploiement ne change rien). Rail e-mail (n'agit que sur les relances auto e-mail).
  { colonne: 'relance_multi_adresse_active', cle: 'relanceMultiAdresseActive', libelle: 'Adresser les 2 dernières relances à toutes les adresses connues de la commune', unite: '', type: 'booleen', rail: 'email',
    aide: 'Si cette case est cochée, les DEUX DERNIÈRES relances d’un parcours (ordinaire : avis d’échéance + saisine ; dossier partiel : dernière relance + annonce CADA) partent vers TOUTES les adresses connues de la mairie — destinataire figé, contact confirmé, PRADA, et interlocuteurs ayant déjà répondu — au lieu du seul destinataire. Les relances antérieures restent adressées au seul destinataire. Décochée par défaut : rien ne change.' },
  { colonne: 'relance_multi_adresse_nb_dernieres', cle: 'relanceMultiAdresseNbDernieres', libelle: 'Multi-adresse — nombre des dernières relances concernées', unite: 'relances', type: 'entier', rail: 'email',
    aide: 'Combien des DERNIÈRES relances d’un parcours partent à toutes les adresses connues (2 par défaut). 0 désactive. N’a d’effet que si la case ci-dessus est cochée.' },
  // CASC-2 — délai avant saisine CADA sur DOSSIER PARTIEL (mairie a répondu, pièces manquantes) : compté depuis la 1re réclamation.
  //   Bornes tirées des CHECK de la base (migration 178), jamais écrites en dur — comme tous les autres paramètres entiers.
  { colonne: 'cada_partiel_delai_mois', cle: 'cadaPartielDelaiMois', libelle: 'Saisine CADA (dossier partiel) — mois avant qu’elle redevienne possible', unite: 'mois', type: 'entier',
    aide: 'Quand une mairie a répondu mais qu’il MANQUE des pièces et que vous les avez réclamées, vous gardez le droit de saisir la CADA — mais on repousse la date à partir de laquelle la saisine redevient proposable. Ce nombre de MOIS (plus les jours ci-dessous) est ajouté à la date de la PREMIÈRE réclamation de pièces (jamais la dernière). Ne concerne QUE les dossiers partiels ; la relance des demandes restées sans réponse est inchangée.' },
  { colonne: 'cada_partiel_delai_jours', cle: 'cadaPartielDelaiJours', libelle: 'Saisine CADA (dossier partiel) — jours ajoutés en plus des mois', unite: 'jours', type: 'entier',
    aide: 'Jours ajoutés APRÈS les mois ci-dessus pour fixer la date à partir de laquelle la saisine CADA redevient proposable sur un dossier partiel. Défaut : 1 mois + 4 jours. Compté depuis la première réclamation de pièces.' },
  // CASC-3 — rythme de la CASCADE de relances sur DOSSIER PARTIEL (mairie a répondu, pièces manquantes). Depuis la 1re réclamation ;
  //   ne concerne QUE les dossiers partiels, jamais les demandes restées sans réponse. Bornes tirées des CHECK de la base (migration 179).
  { colonne: 'cascade_partiel_relance_jours', cle: 'cascadePartielRelanceJours', libelle: 'Cascade dossier partiel — jours entre chaque relance', unite: 'jours', type: 'entier',
    aide: 'Sur un dossier PARTIEL, intervalle entre deux relances envoyées à la mairie pour les pièces encore manquantes. Le compte part de la PREMIÈRE réclamation de pièces (jamais la dernière). Ne concerne QUE les dossiers partiels ; les demandes restées sans réponse suivent la relance ordinaire, inchangée.' },
  { colonne: 'cascade_partiel_nb_relances', cle: 'cascadePartielNbRelances', libelle: 'Cascade dossier partiel — nombre de relances avant l’annonce CADA', unite: 'relances', type: 'entier',
    aide: 'Combien de relances courtoises sont envoyées avant d’ANNONCER une saisine de la CADA. Défaut : 2 relances (à J+10 et J+20), puis l’annonce.' },
  { colonne: 'cascade_partiel_annonce_jours', cle: 'cascadePartielAnnonceJours', libelle: 'Cascade dossier partiel — jours avant l’annonce CADA', unite: 'jours', type: 'entier',
    aide: 'Délai entre la dernière relance et le message qui ANNONCE la saisine de la CADA à la mairie. Défaut : 10 jours après la dernière relance.' },
  { colonne: 'cascade_partiel_saisine_jours', cle: 'cascadePartielSaisineJours', libelle: 'Cascade dossier partiel — jours après l’annonce avant saisine possible', unite: 'jours', type: 'entier',
    aide: 'Délai laissé à la mairie APRÈS l’annonce avant que la saisine CADA devienne proposable. La date retenue est la plus tardive entre ce délai et le délai prolongé CASC-2 (1 mois + 4 jours) : on n’ouvre jamais un recours avant qu’il soit réellement possible.' },
  // RELANCE — fenêtre HORAIRE d'envoi automatique (matin, jours ouvrés). Un rappel expédié un dimanche soir « fait robot » ; en semaine le matin, il « fait une personne ».
  { colonne: 'envoi_heure_debut', cle: 'envoiHeureDebut', libelle: 'Envoi automatique — heure de début', unite: 'heure locale', type: 'entier', rail: 'email',
    aide: 'Les relances automatiques ne partent qu’entre cette heure et l’heure de fin ci-dessous, du lundi au vendredi. Les jours fériés ne sont pas pris en compte. Un brouillon préparé un week-end attend le lundi matin. (L’envoi que VOUS déclenchez à la main n’est jamais bridé.)' },
  { colonne: 'envoi_heure_fin', cle: 'envoiHeureFin', libelle: 'Envoi automatique — heure de fin', unite: 'heure locale', type: 'entier', rail: 'email',
    aide: 'Fin (exclue) de la fenêtre d’envoi automatique. Doit être PLUS GRANDE que l’heure de début ; sinon, par sécurité, rien ne part automatiquement (et le compte rendu le signale). La veille passe toutes les 15 min : une fenêtre de deux heures suffit largement à ce qu’un envoi tombe dedans.' },
  // X1 — CANAL CADA (saisine quand une mairie reste silencieuse plus d’un mois). L’adresse VIDE n’est PAS une erreur : c’est le mode « formulaire en ligne ».
  { colonne: 'cada_email', cle: 'cadaEmail', libelle: 'Adresse e-mail de la CADA', unite: '', type: 'email',
    aide: 'Adresse e-mail où saisir la CADA (Commission d’accès aux documents administratifs) quand une mairie n’a pas répondu. Si vous la renseignez, la saisine part par e-mail avec, en pièce jointe, une copie de votre demande initiale. Laissée VIDE, ce n’est PAS bloquant : la saisine se fait alors à la main sur le formulaire en ligne de la CADA (adresse ci-dessous).' },
  { colonne: 'cada_url_formulaire', cle: 'cadaUrlFormulaire', libelle: 'Formulaire de saisine en ligne de la CADA', unite: '', type: 'url',
    aide: 'Adresse web du formulaire de saisine de la CADA. C’est là que vous déposez la saisine à la main quand l’adresse e-mail ci-dessus est laissée vide. À ne changer que si l’adresse officielle du formulaire change.' },
  // Cascade lot 2 — auto-saisine CADA (thème CADA). ⚠️ Sans effet tant que cada_email est vide (dépôt manuel sur le formulaire).
  { colonne: 'saisine_cada_auto_active', cle: 'saisineCadaAutoActive', libelle: 'Saisir la CADA automatiquement', unite: '', type: 'booleen',
    aide: 'Si cette case est cochée, la saisine de la CADA part TOUTE SEULE, sans relecture de votre part, une fois le délai écoulé. ⚠️ Tant que l’adresse e-mail de la CADA (ci-dessus) n’est pas renseignée, ce réglage reste SANS EFFET : la saisine est alors seulement préparée pour un dépôt à la main sur le formulaire en ligne. Décochée, rien ne part sans un clic.' },
  // R7 — RELÈVE AUTOMATIQUE des réponses des mairies (lecture de la boîte de réponse ci-dessus). Opt-in : désactivée par défaut.
  { colonne: 'releve_active', cle: 'releveActive', libelle: 'Relève automatique des réponses', unite: '', type: 'booleen',
    aide: 'Quand c’est activé, l’application relève seule la boîte de réponse à intervalle régulier, enregistre les réponses des mairies et les rattache aux demandes. Désactivé, rien n’est relevé tout seul : il faut lancer la relève à la main. La boîte est TOUJOURS lue sans jamais être modifiée.' },
  { colonne: 'releve_intervalle_minutes', cle: 'releveIntervalleMinutes', libelle: 'Intervalle de relève', unite: 'minutes', type: 'entier',
    aide: 'Durée minimale entre deux relèves automatiques : une relève n’est tentée que si la précédente réussie est plus ancienne que cette durée. Plus court = réponses vues plus vite ; plus long = moins de connexions à la boîte.' },
  // LOT 34 — délai avant la relève DÉCLENCHÉE par le clic « copier » d'un dépôt téléservice (lecture seule, aucun envoi). Transverse (une seule boîte).
  { colonne: 'depot_releve_delai_secondes', cle: 'depotReleveDelaiSecondes', libelle: 'Délai avant relève après un dépôt téléservice', unite: 'secondes', type: 'entier',
    aide: 'Quand vous cliquez « copier » sur une carte de dépôt téléservice, la boîte est relevée après ce délai (le temps que l’accusé de réception de la mairie arrive), sans attendre la relève ordinaire. Cette relève ne fait que LIRE la boîte : elle n’envoie jamais rien. Défaut 60 s.' },
  { colonne: 'releve_profil', cle: 'releveProfil', libelle: 'Boîte relevée automatiquement', unite: '', type: 'enum', optionsEnum: ['entreprise', 'personne'],
    aide: 'Quel compte de messagerie est relevé automatiquement : celui de la société ou celui de la personne physique. La relève à la main peut toujours viser l’un ou l’autre indépendamment.' },
  // R6 — ÉCHÉANCE d'un mois : quand une demande est « proche » de l'échéance, et fraîcheur exigée pour se prononcer.
  { colonne: 'echeance_alerte_jours', cle: 'echeanceAlerteJours', libelle: 'Seuil « échéance proche » (jours)', unite: 'jours', type: 'entier',
    aide: 'Combien de jours avant la fin du délai d’un mois une demande est signalée « proche de l’échéance ». Le silence gardé un mois après l’envoi vaut refus tacite (voie CADA) : ce réglage sert à anticiper cette date, pas à la modifier.' },
  { colonne: 'releve_fraicheur_heures', cle: 'releveFraicheurHeures', libelle: 'Fraîcheur exigée de la relève', unite: 'heures', type: 'entier',
    aide: 'Si la dernière relève réussie de la boîte est plus ancienne que cette durée, l’échéance reste « indéterminée » : on n’affirme jamais qu’une mairie n’a pas répondu sans avoir regardé récemment. Plus court = exigence de vérification plus stricte.' },
  // PART-D — PÉREMPTION présumée des liens de téléchargement (hypothèse, jamais affichée comme un fait). Bornes lues du CHECK (migration 181).
  { colonne: 'lien_validite_presumee_jours', cle: 'lienValiditePresumeeJours', libelle: 'Durée de validité présumée d’un lien de téléchargement', unite: 'jours', type: 'entier',
    aide: 'Combien de jours on SUPPOSE qu’un lien de téléchargement envoyé par une mairie reste valable. C’est une HYPOTHÈSE de travail (le lien ne dit pas toujours sa vraie durée, et les mairies varient) : elle sert seulement à décider quand vous prévenir qu’un lien risque d’expirer. Elle n’est JAMAIS affichée comme une certitude — l’écran montre le fait mesuré « reçu il y a N jours ». Défaut 7.' },
  { colonne: 'lien_alerte_avant_jours', cle: 'lienAlerteAvantJours', libelle: 'Alerte « lien bientôt périmé » — jours avant le terme présumé', unite: 'jours', type: 'entier',
    aide: 'Combien de jours AVANT le terme présumé ci-dessus vous êtes prévenu par e-mail qu’un lien en attente approche de sa péremption (pensez à télécharger avant qu’il expire). Avec les valeurs par défaut (7 et 3), vous êtes alerté quand un lien a « reçu il y a 4 jours » ou plus. Une seule alerte par lien, jamais de répétition. Ce courrier vous est adressé, jamais à une mairie.' },
  // PART-C — CALME avant de vérifier les pièces reçues, quand une mairie répond en PLUSIEURS envois. Bornes lues du CHECK (migration 180).
  { colonne: 'vague_calme_minutes', cle: 'vagueCalmeMinutes', libelle: 'Délai de calme avant de vérifier les pièces reçues', unite: 'minutes', type: 'entier',
    aide: 'Quand une mairie envoie les documents en PLUSIEURS mails d’affilée, l’application attend que le dernier mail reçu ait au moins cet âge avant de vérifier si le dossier est complet — pour ne pas réclamer une pièce qui arrive quelques minutes plus tard. Le compte se fait sur l’heure d’ENVOI du mail, pas sur l’heure de la relève : comme la relève passe toutes les quelques heures, le plus souvent le calme est déjà écoulé et la vérification est immédiate. Quand VOUS relevez la boîte à la main, la vérification se fait tout de suite, sans attendre. Défaut 10 minutes ; 0 = vérifier immédiatement.' },
  // R8 — ALERTES e-mail : un seul récapitulatif par jour, envoyé uniquement s'il y a quelque chose à dire. Opt-in.
  { colonne: 'alerte_active', cle: 'alerteActive', libelle: 'Alertes par e-mail', unite: '', type: 'booleen',
    aide: 'Quand c’est activé, vous recevez UN récapitulatif par jour — et seulement s’il y a du nouveau (réponses reçues, rebonds, échéances proches ou dépassées). Jamais un e-mail par événement. Désactivé, aucune alerte n’est envoyée.' },
  { colonne: 'alerte_email', cle: 'alerteEmail', libelle: 'Adresse où recevoir les alertes', unite: '', type: 'email',
    aide: 'Adresse e-mail qui reçoit le récapitulatif quotidien. Tant qu’elle est vide, aucune alerte n’est envoyée, même si les alertes sont activées.' },
  { colonne: 'alerte_heure_locale', cle: 'alerteHeureLocale', libelle: 'Heure d’envoi du récapitulatif', unite: 'heure locale', type: 'entier',
    aide: 'Heure locale (0 à 23) à partir de laquelle le récapitulatif du jour peut partir. Ex. 8 = pas avant 8 h du matin. Il n’y a qu’un envoi par jour.' },
  // ALERTE obstacle disparu — rappel e-mail quand un bâtiment qui fondait un certificat a disparu de BD TOPO. Opt-in, à l'adresse d'alerte.
  { colonne: 'obstacle_disparu_alerte_active', cle: 'obstacleDisparuAlerteActive', libelle: 'M’alerter si un bâtiment d’un certificat disparaît', unite: '', type: 'booleen',
    aide: 'Quand c’est activé, vous recevez un e-mail (à l’adresse d’alerte ci-dessus) dès qu’un bâtiment qui faisait obstacle pour un certificat disparaît des données BD TOPO et que son emplacement n’est plus construit. C’est un simple signal « à revérifier » : aucun certificat n’est recalculé ni modifié. Un seul rappel par certificat. ⚠️ Le décocher retire seulement le SIGNAL, pas le problème : si un bâtiment disparaît, un nouveau calcul pourrait certifier une vue dégagée à tort — vous n’en seriez simplement pas prévenu.' },
  // X5 — PROPOSITION de saisine CADA par e-mail. Opt-in. Le destinataire est l'adresse d'alerte ci-dessus (pas un second champ).
  { colonne: 'proposition_cada_active', cle: 'propositionCadaActive', libelle: 'Proposer la saisine CADA par e-mail', unite: '', type: 'booleen',
    aide: 'Quand c’est activé, dès qu’une demande devient saisissable devant la CADA (silence d’un mois vérifié, délai non forclos), vous recevez UN e-mail — à l’adresse d’alerte ci-dessus — détaillant le dossier, avec un lien pour lancer la saisine. Une seule proposition par demande, jamais de rappel. Rien n’est jamais envoyé à une mairie ni à la CADA sans votre clic.' },
  // R4 — borne de taille des pièces jointes ENTRANTES (déposées à la réception). Distincte de la borne des photos internaute.
  { colonne: 'piece_taille_max_mo', cle: 'pieceTailleMaxMo', libelle: 'Taille maximale des pièces reçues', unite: 'Mo', type: 'entier',
    aide: 'Taille maximale d’une pièce jointe reçue d’une mairie qui sera conservée. Au-delà, la pièce n’est pas stockée mais sa trace (nom, type, taille, motif) reste visible. Les plans d’urbanisme peuvent être lourds : 50 Mo par défaut.' },
  // R3e — plafond du nombre de références de dossier interrogées à chaque relève (recherche par numéro de permis).
  { colonne: 'recherche_references_max', cle: 'rechercheReferencesMax', libelle: 'Références interrogées par relève', unite: 'références', type: 'entier',
    aide: 'À chaque relève, l’application cherche aussi les messages citant le numéro de dossier des permis en attente — même venant d’un autre expéditeur que la mairie. Ce réglage borne combien de numéros sont interrogés (les plus urgents d’abord), pour maîtriser le coût de la recherche.' },
  // N1-A — adresses reconnues pour le VERSEMENT AUTOMATIQUE en GED (union, au runtime, avec les adresses des collaborateurs).
  { colonne: 'depot_adresses_connues', cle: 'depotAdressesConnues', libelle: 'Adresses de versement automatique en GED', unite: 'e-mails', type: 'texte',
    formatHint: 'adresses e-mail séparées par des virgules.',
    aide: 'Adresses e-mail (séparées par des virgules) reconnues pour le versement automatique en GED : un mail dont l’objet est le seul mot « permis », venant d’une de ces adresses, avec des pièces jointes, voit ses pièces versées sur le permis identifié. Les adresses des collaborateurs sont TOUJOURS reconnues en plus (même désactivés). Mettez ici votre adresse pro et votre adresse perso. Vide = seuls les collaborateurs sont reconnus.' },
  { colonne: 'nature_accuse_motifs', cle: 'natureAccuseMotifs', libelle: 'Motifs d’objet « accusé de réception »', unite: 'motifs', type: 'texte',
    formatHint: 'formules séparées par des virgules ou des retours à la ligne.',
    aide: 'Formules (séparées par des virgules ou des retours à la ligne) qui, trouvées dans l’OBJET d’un message, le classent comme accusé de réception — SEULEMENT s’il ne porte ni pièce jointe ni lien de téléchargement (un vrai envoi de documents n’est jamais requalifié). Insensible aux accents et à la casse. Chaque téléservice a sa formule : Paris écrit « Accusé de réception ». Vide = seul l’en-tête technique Auto-Submitted déclenche l’accusé.' },
  // PART-1 — deux listes d'exclusion pour ne plus prendre notre propre signature citée pour du contenu de mairie.
  { colonne: 'liens_hotes_non_fort', cle: 'liensHotesNonFort', libelle: 'Hôtes de liens jamais considérés comme téléchargement', unite: 'hôtes', type: 'texte',
    formatHint: 'noms d’hôtes séparés par des virgules (ex. googleusercontent.com).',
    aide: 'Noms d’hôtes (séparés par des virgules) qui ne peuvent JAMAIS être pris pour un lien de téléchargement de mairie : les nôtres et les hébergeurs de nos propres images (une signature Gmail citée dans la réponse d’une mairie renvoie souvent une URL googleusercontent). La comparaison se fait par fin de domaine. Sans effet sur les vrais liens de mairie. Vide = aucun hôte écarté.' },
  { colonne: 'pieces_hachages_exclus', cle: 'piecesHachagesExclus', libelle: 'Empreintes de pièces à ne jamais verser en GED', unite: 'sha256', type: 'texte',
    formatHint: 'empreintes sha256 (64 caractères) séparées par des virgules.',
    aide: 'Empreintes sha256 (séparées par des virgules) d’images qui vous appartiennent — typiquement le logo de votre signature — et qui reviennent citées dans les réponses des mairies. Une pièce dont l’empreinte figure ici n’est jamais versée en GED comme document du permis. Le critère porte sur le CONTENU du fichier, pas sur son nom. Si votre logo de signature change, ajoutez sa nouvelle empreinte. Vide = aucune pièce écartée.' },
  // PART-2 — les 4 familles ATTENDUES du diagnostic de complétude des pièces d'un permis (cochables). Décocher → jamais signalé manquant.
  { colonne: 'famille_attendue_masse', cle: 'familleAttendueMasse', libelle: 'Attendre un plan de masse (PC2)', unite: '', type: 'booleen',
    aide: 'Quand c’est activé, le diagnostic de complétude d’un permis (onglet « Analyse et projection ») signale le plan de masse comme MANQUANT s’il n’en trouve aucun. Le plan est reconnu par son CONTENU, pas seulement par son nom. Décoché, le plan de masse n’est jamais réclamé. Activé par défaut.' },
  { colonne: 'famille_attendue_coupe', cle: 'familleAttendueCoupe', libelle: 'Attendre un plan de coupe (PC3)', unite: '', type: 'booleen',
    aide: 'Quand c’est activé, le diagnostic de complétude signale le plan de coupe comme MANQUANT s’il n’en trouve aucun (reconnu par son contenu). Décoché, il n’est jamais réclamé. Activé par défaut.' },
  { colonne: 'famille_attendue_etage', cle: 'familleAttendueEtage', libelle: 'Attendre des plans d’étages', unite: '', type: 'booleen',
    aide: 'Quand c’est activé, le diagnostic de complétude signale les plans d’étages comme MANQUANTS s’il n’en trouve aucun (reconnus par leur contenu). Décoché, ils ne sont jamais réclamés. Activé par défaut.' },
  { colonne: 'famille_attendue_cerfa', cle: 'familleAttendueCerfa', libelle: 'Attendre le formulaire Cerfa', unite: '', type: 'booleen',
    aide: 'Quand c’est activé, le diagnostic de complétude signale le formulaire Cerfa comme MANQUANT s’il n’en trouve aucun. Le Cerfa est reconnu par son CONTENU (formulaire 13409), jamais par son nom. Décoché, il n’est jamais réclamé. Activé par défaut.' },
  { colonne: 'seuil_logements_immeuble', cle: 'seuilLogementsImmeuble', libelle: 'Seuil de logements « immeuble »', unite: 'logements', type: 'entier',
    aide: 'À partir de ce nombre de logements, un projet est classé « immeuble ». Joue en OU avec la surface (pas en ET).' },
  { colonne: 'seuil_surface_immeuble_m2', cle: 'seuilSurfaceImmeubleM2', libelle: 'Seuil de surface « immeuble »', unite: 'm²', type: 'entier',
    aide: 'À partir de cette surface créée, un projet est classé « immeuble ». Joue en OU avec le nombre de logements (pas en ET).' },
  { colonne: 'annees_par_defaut', cle: 'anneesParDefaut', libelle: 'Profondeur d’affichage par défaut', unite: 'années', type: 'entier',
    aide: 'Nombre d’années récentes affichées par défaut dans la liste des dossiers avant d’élargir à tout l’historique.' },
  { colonne: 'rang_immeuble_neuf', cle: 'rangImmeubleNeuf', libelle: 'Rang — immeuble neuf', unite: 'rang', type: 'entier',
    aide: 'Ordre d’affichage de la catégorie (plus petit = affiché en premier). Réordonnable.' },
  { colonne: 'rang_surelevation', cle: 'rangSurelevation', libelle: 'Rang — surélévation', unite: 'rang', type: 'entier',
    aide: 'Ordre d’affichage de la catégorie (plus petit = affiché en premier). Réordonnable.' },
  { colonne: 'rang_construction_neuve', cle: 'rangConstructionNeuve', libelle: 'Rang — construction neuve', unite: 'rang', type: 'entier',
    aide: 'Ordre d’affichage de la catégorie (plus petit = affiché en premier). Réordonnable.' },
  { colonne: 'rang_extension', cle: 'rangExtension', libelle: 'Rang — extension', unite: 'rang', type: 'entier',
    aide: 'Ordre d’affichage de la catégorie (plus petit = affiché en premier). Réordonnable.' },
  { colonne: 'rang_demolition', cle: 'rangDemolition', libelle: 'Rang — démolition', unite: 'rang', type: 'entier',
    aide: 'Ordre d’affichage de la catégorie (plus petit = affiché en premier). Réordonnable.' },
  { colonne: 'pieces_demandees', cle: 'piecesDemandees', libelle: 'Pièces demandées', unite: 'codes', type: 'texte',
    formatHint: 'codes de pièces séparés par des virgules (ex. PC2, PC3).',
    aide: 'Codes des pièces sollicitées dans le courrier (ex. PC2, PC3), séparés par des virgules.' },
  { colonne: 'profil_demandeur_defaut', cle: 'profilDemandeurDefaut', libelle: 'Profil de demandeur par défaut', unite: '', type: 'enum', optionsEnum: ['entreprise', 'personne'], rail: 'email',
    aide: 'Profil (société / personne physique) appliqué par défaut à la création des demandes PAR E-MAIL. (Le téléservice a sa propre valeur — « personne physique » pour FranceConnect.)' },
  // S30 — source de l'annuaire des mairies (téléphones/adresses des mairies importés par `dila:ingest`).
  { colonne: 'dila_url', cle: 'dilaUrl', libelle: 'Adresse de l’annuaire des mairies (DILA)', unite: '', type: 'url',
    aide: 'Adresse web où l’application télécharge l’annuaire officiel des mairies (service-public.gouv.fr). Elle sert à mettre à jour les téléphones et adresses des mairies. À ne changer que si l’adresse officielle change : une adresse erronée fera échouer la prochaine mise à jour de l’annuaire (les données déjà en place ne sont pas perdues).' },
  // S40 — MENTIONS de PRATIQUE ajoutées au corps (activables + texte éditable). Le fondement juridique reste EN DUR.
  { colonne: 'mention_service_active', cle: 'mentionServiceActive', libelle: 'Ajouter la mention du service destinataire', unite: '', type: 'booleen',
    aide: 'Quand c’est activé, la phrase ci-dessous est ajoutée en tête du courrier, avant « Madame, Monsieur ». Utile pour orienter la demande vers le bon service.' },
  { colonne: 'mention_service_texte', cle: 'mentionServiceTexte', libelle: 'Texte de la mention du service', unite: '', type: 'texte_libre',
    aide: 'Le texte exact ajouté en tête (ex. « À l’attention du service de l’urbanisme »). Rédigez-le vous-même. S’il est vide, rien n’est ajouté même si l’option est activée.' },
  { colonne: 'mention_delai_active', cle: 'mentionDelaiActive', libelle: 'Ajouter le rappel du délai d’un mois', unite: '', type: 'booleen',
    aide: 'Quand c’est activé, la phrase ci-dessous est ajoutée près de la fin du courrier. Elle rappelle que sans réponse sous un mois, le silence vaut refus. Le délai s’applique de toute façon par la loi ; cette phrase ne fait que le rappeler.' },
  { colonne: 'mention_delai_texte', cle: 'mentionDelaiTexte', libelle: 'Texte du rappel de délai', unite: '', type: 'texte_libre',
    aide: 'Le texte exact du rappel de délai (ex. « À défaut de réponse dans le délai d’un mois, votre silence vaudra décision de refus. »). Rédigez-le vous-même. Vide = rien n’est ajouté.' },
  // S-DWG — 3e tiret OPTIONNEL de la liste des pièces (après PC3) : les fichiers sources (DWG, DXF). Défaut ACTIF (opt-out) et
  //   texte pré-rédigé (arbitré par le porteur), là où les mentions ci-dessus sont opt-in/vides.
  { colonne: 'mention_sources_active', cle: 'mentionSourcesActive', libelle: 'Demander aussi les fichiers sources (DWG, DXF)', unite: '', type: 'booleen',
    aide: 'Quand c’est activé, un dernier point est ajouté à la liste des pièces demandées : les fichiers sources des plans (DWG, DXF), s’ils existent. La phrase précise que leur absence ne doit pas retarder l’envoi des autres pièces — elle n’oblige donc la mairie à rien. Uniquement dans les demandes ; jamais dans les relances ni les saisines CADA.' },
  { colonne: 'mention_sources_texte', cle: 'mentionSourcesTexte', libelle: 'Texte de la demande des fichiers sources', unite: '', type: 'texte_libre',
    aide: 'Le texte exact du point « fichiers sources » ajouté en fin de liste des pièces. Commencez-le par un tiret « — » pour rester aligné avec les autres pièces. S’il est vide, rien n’est ajouté même si l’option est activée.' },
  // RATT-AUTO — interrupteur du rejeu automatique du suivi de rattachement (thème « Rattachement au bâti »). Modèle relance_auto_active.
  { colonne: 'rattachement_suivi_auto_active', cle: 'rattachementSuiviAutoActive', libelle: 'Re-détecter le bâti automatiquement', unite: '', type: 'booleen',
    aide: 'Quand c’est activé, la veille rejoue seule, à chaque passage, le suivi des permis « en attente de bâti » : dès qu’une mise à jour BD TOPO fait apparaître le bâtiment attendu, le permis passe tout seul en « arbitrage demandé » (une décision de rattachement vous est alors demandée). Aucune altitude n’est jamais écrite automatiquement — la décision reste la vôtre. Tant que c’est décoché, il faut relancer le suivi à la main. Sans effet visible tant qu’aucune édition BD TOPO plus récente n’a été ingérée : il n’y a alors rien de neuf à détecter.' },
  // ATT-BATI — rappel e-mail quand un permis attend le bâti depuis trop longtemps (même thème). Interrupteur + seuil éditable.
  { colonne: 'attente_bati_alerte_active', cle: 'attenteBatiAlerteActive', libelle: 'M’alerter si un permis attend trop longtemps', unite: '', type: 'booleen',
    aide: 'Quand c’est activé, vous recevez un e-mail de RAPPEL (à l’adresse d’alerte configurée plus haut) dès qu’un permis reste « en attente de bâti » au-delà du seuil ci-dessous. C’est un simple rappel pour qu’un dossier ne soit pas oublié — JAMAIS une détection : il ne dit pas que le bâtiment est arrivé et n’appelle aucune action. Un seul rappel par dossier. Décoché, aucun rappel n’est envoyé.' },
  { colonne: 'attente_bati_alerte_jours', cle: 'attenteBatiAlerteJours', libelle: 'Seuil d’alerte « en attente de bâti »', unite: 'jours', type: 'entier',
    aide: 'Nombre de jours d’attente au-delà duquel le rappel ci-dessus se déclenche pour un dossier. Un bâtiment neuf met en général 1 à 3 ans à apparaître dans BD TOPO : un seuil court vous noierait sous des rappels alors que l’attente est normale. Défaut : 365 jours (1 an).' },
  // PHASE-1 — les deux délais du verdict à trois phases (même thème « Rattachement au bâti »). Bornes lues du CHECK (migration 170).
  { colonne: 'delai_bascule_jours', cle: 'delaiBasculeJours', libelle: 'Délai avant bascule sur le cadastre officiel', unite: 'jours', type: 'entier',
    aide: 'Après l’accord d’un permis dans l’axe de la vue, le certificat continue pendant ce délai de décrire la vue TELLE QU’ELLE EST aujourd’hui (l’ancienne parcelle), et un verdict « projeté » — qui tient compte de la future construction — reste proposé en option. Une fois ce délai écoulé ET les nouveaux contours publiés au cadastre ET le rattachement validé, le certificat bascule sur la configuration officielle. Défaut : 548 jours (environ 1 an et demi).' },
  { colonne: 'duree_message_jours', cle: 'dureeMessageJours', libelle: 'Durée du message « construction récente »', unite: 'jours', type: 'entier',
    aide: 'Après la bascule, le certificat affiche pendant cette durée un message prévenant que le verdict tient compte d’une construction récente dans l’axe de la vue. Le décompte part du JOUR DE LA BASCULE (pas de l’accord du permis). Passé ce délai, le message disparaît et le bâtiment est considéré comme définitivement en place. Défaut : 548 jours (environ 1 an et demi).' },
  // SURV-2 — interrupteur dédié de la surveillance des polygones (même thème « Rattachement au bâti »). Opt-OUT : défaut activé.
  { colonne: 'surveillance_active', cle: 'surveillanceActive', libelle: 'Surveiller les polygones après validation', unite: '', type: 'booleen',
    aide: 'Quand c’est activé, après la validation d’un rattachement les polygones du permis sont surveillés : l’apparition, la disparition ou la modification d’un contour déclenche une alerte à vérifier (sans jamais remettre en cause la validation). Décoché, plus aucune alerte de surveillance des polygones n’est envoyée ni calculée. N’affecte NI la validation des rattachements, NI l’alerte « obstacle disparu ». Activé par défaut.' },
  // SURV-1 — surveillance des polygones APRÈS validation (même thème « Rattachement au bâti »). Bornes lues du CHECK (migration 171).
  { colonne: 'surveillance_fenetre_jours', cle: 'surveillanceFenetreJours', libelle: 'Durée de surveillance des polygones après validation', unite: 'jours', type: 'entier',
    aide: 'Après la validation d’un rattachement, la géométrie des polygones peut continuer de bouger : un bâtiment neuf apparaît à côté, un polygone validé disparaît d’une édition, un contour est redessiné. Pendant cette durée, comptée depuis le JOUR DE LA VALIDATION, ces changements déclenchent une alerte à vérifier. Passé ce délai, plus aucune alerte. L’alerte n’annule jamais la validation : elle demande seulement un contrôle. Défaut : 730 jours (environ 2 ans).' },
  { colonne: 'surveillance_tolerance_contour_pct', cle: 'surveillanceToleranceContourPct', libelle: 'Tolérance avant alerte « contour modifié »', unite: '%', type: 'entier',
    aide: 'Part de la surface d’un polygone validé qui peut changer sans déclencher d’alerte. En dessous de ce pourcentage, un contour redessiné est considéré comme du simple bruit de re-numérisation et ignoré ; au-delà, il est signalé. Un réglage à 0 signale le moindre écart (beaucoup d’alertes, surtout au premier import) ; l’augmenter ne garde que les changements francs. Ne concerne QUE la modification de contour, pas l’apparition ni la disparition d’un polygone. Défaut : 0 %.' },
  // D4/D4-bis — RÉGLAGES TÉLÉSERVICE (rail 'teleservice' seul). Thème PROPRE « Téléservice (dépôt manuel) ». Les deux surcharges de
  //   PRÉPARATION sont NULLABLE (vide = suivre le commun). Bornes lues des CHECK (migrations 159/160).
  { colonne: 'teleservice_dossiers_par_depot', cle: 'teleserviceDossiersParDepot', libelle: 'Dossiers par demande', unite: 'dossiers', type: 'entier', rail: 'teleservice',
    aide: 'Sur un téléservice, chaque dossier se dépose à la main : une demande à plusieurs dossiers exige autant de dépôts. Valeur PROPRE au téléservice (indépendante de l’e-mail). Si une commune impose sa propre limite (Paris n’accepte qu’un dossier par dépôt), c’est SA limite qui s’applique.' },
  { colonne: 'teleservice_permis_par_commune_par_mois', cle: 'teleservicePermisParCommuneParMois', libelle: 'Permis par commune et par mois', unite: 'permis / mois', type: 'entier', rail: 'teleservice',
    aide: 'Plafond mensuel de permis demandés par commune, PROPRE au rail téléservice (indépendant de l’e-mail). Côté téléservice — peu de communes, dépôt manuel — le frein est votre temps, pas la saturation de la mairie.' },
  // D4-ter (étanche, absorbe P) — profil de demandeur PROPRE au téléservice. Prévu pour « personne physique » (FranceConnect) ; livré à 'entreprise'.
  { colonne: 'teleservice_profil_demandeur_defaut', cle: 'teleserviceProfilDemandeurDefaut', libelle: 'Profil de demandeur par défaut', unite: '', type: 'enum', optionsEnum: ['entreprise', 'personne'], rail: 'teleservice',
    aide: 'Profil (société / personne physique) appliqué par défaut aux demandes déposées par téléservice. Les téléservices exigent souvent une identification FranceConnect (personne physique) : c’est ici qu’on le règle, indépendamment de l’e-mail.' },
  { colonne: 'teleservice_alerte_non_depose_active', cle: 'teleserviceAlerteNonDeposeActive', libelle: 'M’alerter si une demande préparée n’est pas déposée', unite: '', type: 'booleen', rail: 'teleservice',
    aide: 'Côté téléservice, rien ne part tout seul : une demande préparée attend que vous la déposiez à la main. Quand c’est activé, vous recevez un rappel (à l’adresse d’alerte configurée plus haut) dès qu’une demande téléservice reste préparée sans être déposée au-delà du seuil ci-dessous. Décoché, aucun rappel. Ne concerne QUE le rail téléservice.' },
  { colonne: 'teleservice_alerte_non_depose_jours', cle: 'teleserviceAlerteNonDeposeJours', libelle: 'Seuil « préparée non déposée » (jours)', unite: 'jours', type: 'entier', rail: 'teleservice',
    aide: 'Nombre de jours au-delà duquel une demande téléservice préparée mais non déposée déclenche le rappel ci-dessus. Défaut : 7 jours.' },
];

/**
 * Q4 — libellé FR d'une valeur de `tri_candidats` (« ordre d'examen »), depuis `optionsEnumLabels` — SOURCE UNIQUE : les
 * écrans Réglages ET Demandes (et toute vue future) affichent le MÊME libellé, y compris la 3e valeur livrée en Q3. Valeur
 * inconnue → valeur brute (repli sûr). PURE.
 */
export function libelleTriCandidats(valeur: string): string {
  const p = PARAMS_VEILLE.find((x) => x.colonne === 'tri_candidats');
  return p?.optionsEnumLabels?.[valeur] ?? valeur;
}

/**
 * Partition PRÉSENTATIONNELLE de `PARAMS_VEILLE`. `COLONNES_PARAMS_DEMANDES` règlent les DEMANDES aux mairies (rendues dans
 * l'onglet Réglages). `PARAMS_DOSSIERS` (seuils « immeuble », rangs des catégories, profondeur d'affichage) classent et
 * affichent les DOSSIERS.
 *
 * ✅ S33 (dette S13 résorbée) — `PARAMS_DOSSIERS` sont désormais rendus dans l'onglet **Automatisation** (groupe « Mise à
 * jour des dossiers »), et non plus dans l'onglet Réglages (groupe « Demandes aux mairies ») où ils étaient mal placés. Le
 * PROPRIÉTAIRE reste la route `/reglages` (validation, allowlist `PARAMS_VEILLE`, bornes des CHECK) : seul le RENDU a migré
 * (cf. `ClassificationDossiers`), tous les invariants de l'écran Réglages sont conservés.
 */
// E1 — les 24 réglages « demandes » sont désormais rangés en 5 THÈMES présentationnels (l'ex-groupe unique « Paramètres des
//   demandes » était un fourre-tout). ⚠️ Chantier PUREMENT présentationnel : aucune colonne, aucune valeur, aucune route ne
//   change. La casse des colonnes reprend EXACTEMENT config_veille. L'ordre DANS chaque thème est l'ordre d'AFFICHAGE voulu
//   (pas celui de PARAMS_VEILLE). `COLONNES_PARAMS_DEMANDES` reste la CONCATÉNATION des 5 (même ENSEMBLE qu'avant E1) → le
//   complément `PARAMS_DOSSIERS` et la validation (`validerReglages` contre `PARAMS_VEILLE`) sont strictement inchangés.
export const COLONNES_THEME_PREPARATION: readonly string[] = [
  'anciennete_max_demande_annees', 'nb_candidats_examines', 'tri_candidats',
  'dossiers_par_demande', 'permis_par_commune_par_mois', 'pieces_demandees',
  'profil_demandeur_defaut', 'demandes_par_commune_par_mois', // vestigial → EN DERNIER
];
export const COLONNES_THEME_ENVOI: readonly string[] = [
  'adresse_reponse', 'envois_max_par_run', 'envois_max_par_jour',
  'envois_auto_max_par_demande_run', // PLAFOND ANTI-CUMUL — 1 e-mail auto/demande/passage (rempart anti-cumul, adjacent aux caps d'envoi)
  // LOT B — duo « relances » : à partir de quand un rappel est préparé, puis part-il tout seul (adjacents, sans sous-titre :
  //   l'écran Réglages ne rend pas de sous-groupe dans un thème — non inventé pour ce lot).
  'relance_jours_avant_echeance', 'relance_auto_active',
  // AUTO-PARTIEL — l'interrupteur de la cascade partielle, adjacent à celui des relances ordinaires (même thème « Envoi aux mairies »).
  'cascade_partiel_auto_active',
  // Cascade lot 2 — les 3 délais, à la suite du réglage de relance existant, dans l'ordre chronologique (rappel → avis → saisine).
  'relance_rappel_jours_avant', 'relance_avis_jours_avant', 'relance_saisine_delai_jours',
  // RELANCE — fenêtre horaire d'envoi automatique (matin, jours ouvrés).
  'envoi_heure_debut', 'envoi_heure_fin',
  // LOT 20 — multi-adresse des 2 dernières relances (opt-in, défaut décoché) + nombre concerné.
  'relance_multi_adresse_active', 'relance_multi_adresse_nb_dernieres',
];
export const COLONNES_THEME_REPONSES: readonly string[] = [
  'releve_active', 'releve_profil', 'releve_intervalle_minutes', 'depot_releve_delai_secondes', 'releve_fraicheur_heures',
  'vague_calme_minutes', // PART-C — calme d'une vague de pièces avant le diagnostic de complétude (migration 180, bornes = CHECK live)
  'lien_validite_presumee_jours', 'lien_alerte_avant_jours', // PART-D — péremption présumée des liens + délai d'alerte (migration 181, bornes = CHECK live)
  'recherche_references_max', 'piece_taille_max_mo', 'echeance_alerte_jours',
  'depot_adresses_connues', // N1-A — versement automatique en GED (adresses reconnues)
  'nature_accuse_motifs',   // FUS-4 — motifs d'objet reconnaissant un accusé de réception
  'liens_hotes_non_fort', 'pieces_hachages_exclus', // PART-1 — exclusions (liens jamais fort / signatures non versées)
  'famille_attendue_masse', 'famille_attendue_coupe', 'famille_attendue_etage', 'famille_attendue_cerfa', // PART-2 — familles attendues (complétude)
];
export const COLONNES_THEME_ALERTES: readonly string[] = [
  'alerte_active', 'alerte_email', 'alerte_heure_locale',
  'obstacle_disparu_alerte_active', // ALERTE « obstacle disparu » — signal à revérifier (opt-in, même adresse d'alerte)
];
export const COLONNES_THEME_CADA: readonly string[] = [
  'proposition_cada_active', 'cada_email', 'cada_url_formulaire',
  'saisine_cada_auto_active', // Cascade lot 2 — auto-saisine (sans effet tant que cada_email vide)
  'cada_partiel_delai_mois', 'cada_partiel_delai_jours', // CASC-2 — délai prolongé avant saisine sur dossier partiel (migration 178, bornes = CHECK live)
  'cascade_partiel_relance_jours', 'cascade_partiel_annonce_jours', 'cascade_partiel_saisine_jours', 'cascade_partiel_nb_relances', // CASC-3 — rythme de la cascade partielle (migration 179, bornes = CHECK live)
];
// RATT-AUTO + ATT-BATI — thème PROPRE (ni demande, ni envoi) : automatisation du rattachement des permis à leur futur bâti.
export const COLONNES_THEME_RATTACHEMENT: readonly string[] = [
  'rattachement_suivi_auto_active',   // RATT-AUTO — re-détection automatique du bâti
  'attente_bati_alerte_active', 'attente_bati_alerte_jours', // ATT-BATI — rappel si l'attente dure trop (interrupteur + seuil)
  'delai_bascule_jours', 'duree_message_jours', // PHASE-1 — les deux délais du verdict à trois phases
  'surveillance_active', // SURV-2 — interrupteur (opt-OUT) en tête du groupe surveillance
  'surveillance_fenetre_jours', 'surveillance_tolerance_contour_pct', // SURV-1 — surveillance des polygones après validation (fenêtre + tolérance)
];
// D4 — thème PROPRE au process TÉLÉSERVICE (dépôt manuel). Groupe ses réglages 'teleservice' sans casser les 5 thèmes existants.
export const COLONNES_THEME_TELESERVICE: readonly string[] = [
  'teleservice_dossiers_par_depot', 'teleservice_permis_par_commune_par_mois', 'teleservice_profil_demandeur_defaut', // D4-ter (étanche) — valeurs de préparation PROPRES au téléservice
  'teleservice_alerte_non_depose_active', 'teleservice_alerte_non_depose_jours', // alerte « non déposée » : interrupteur + seuil
];
export const COLONNES_PARAMS_DEMANDES: readonly string[] = [
  ...COLONNES_THEME_PREPARATION, ...COLONNES_THEME_ENVOI, ...COLONNES_THEME_REPONSES, ...COLONNES_THEME_ALERTES, ...COLONNES_THEME_CADA,
  ...COLONNES_THEME_TELESERVICE,
];
// S30 — 3e sous-bloc : SOURCES de données (annuaire DILA). Distinct des demandes et de la classification des dossiers.
export const COLONNES_PARAMS_SOURCES: readonly string[] = ['dila_url'];
// S40 — 4e sous-bloc : MENTIONS ajoutées au corps (phrases de pratique, activables + éditables).
export const COLONNES_PARAMS_MENTIONS: readonly string[] = [
  'mention_service_active', 'mention_service_texte', 'mention_delai_active', 'mention_delai_texte',
  'mention_sources_active', 'mention_sources_texte', // S-DWG — 3e tiret optionnel « fichiers sources (DWG/DXF) »
];
/** E1 — liste ORDONNÉE de ParamVeille d'un thème (ordre = la constante, PAS celui de PARAMS_VEILLE). Lève si une colonne est
 *  inconnue de PARAMS_VEILLE → un thème mal saisi casse le build plutôt que d'oublier silencieusement un paramètre. */
function paramsDuTheme(colonnes: readonly string[]): ParamVeille[] {
  return colonnes.map((c) => {
    const p = PARAMS_VEILLE.find((x) => x.colonne === c);
    if (!p) throw new Error(`reglagesVeille: colonne de thème inconnue « ${c} »`);
    return p;
  });
}
// E1 — les 5 thèmes, dans l'ordre d'affichage voulu (rendus par ReglagesVue, un <section> chacun).
export const PARAMS_THEME_PREPARATION: ParamVeille[] = paramsDuTheme(COLONNES_THEME_PREPARATION);
export const PARAMS_THEME_ENVOI: ParamVeille[] = paramsDuTheme(COLONNES_THEME_ENVOI);
export const PARAMS_THEME_REPONSES: ParamVeille[] = paramsDuTheme(COLONNES_THEME_REPONSES);
export const PARAMS_THEME_ALERTES: ParamVeille[] = paramsDuTheme(COLONNES_THEME_ALERTES);
export const PARAMS_THEME_CADA: ParamVeille[] = paramsDuTheme(COLONNES_THEME_CADA);
export const PARAMS_THEME_TELESERVICE: ParamVeille[] = paramsDuTheme(COLONNES_THEME_TELESERVICE); // D4 — process téléservice (dépôt manuel)
export const PARAMS_THEME_RATTACHEMENT: ParamVeille[] = paramsDuTheme(COLONNES_THEME_RATTACHEMENT);

// ── D4-ter (ÉTANCHE) — APPARTENANCE DE RAIL : trois espaces ÉTANCHES. Un réglage n'appartient qu'à UN espace ; aucune valeur
//   « partagée » rendue des deux côtés. `espaceReglage` classe chaque réglage dans EXACTEMENT une des trois classes. ───────────
export type EspaceRail = 'email' | 'teleservice' | 'transverse';
/**
 * Classe UN réglage dans exactement UNE des trois catégories de rail (fonction PURE, totale sur ParamVeille) :
 *  · 'email'      → uniquement l'onglet « Envoi e-mail auto » (rail:'email' : caps d'envoi, relance auto, heures, ET les valeurs
 *                   de préparation propres à l'e-mail — dossiers/demande, permis/commune·mois, profil).
 *  · 'teleservice'→ uniquement l'onglet « Téléservice » (rail:'teleservice' : valeurs de préparation propres au téléservice +
 *                   alertes « non déposée »).
 *  · 'transverse' → uniquement l'onglet « Transverse » (aucun rail : valeur commune aux deux process — ancienneté, profondeur/
 *                   ordre d'examen, pièces, relève, alertes, CADA, rattachement, mentions, sources, identités, vestigiaux).
 */
export function espaceReglage(p: ParamVeille): EspaceRail {
  if (p.rail === 'email') return 'email';
  if (p.rail === 'teleservice') return 'teleservice';
  return 'transverse';
}
/** Un réglage appartient-il à l'espace d'un rail donné ? ÉTANCHE : seulement celui de son propre rail (jamais les deux). */
export function reglageDansEspace(p: ParamVeille, rail: 'email' | 'teleservice'): boolean {
  return espaceReglage(p) === rail;
}
/** Les trois espaces ÉTANCHES, dérivés de l'appartenance de rail (ordre = celui de PARAMS_VEILLE). Disjoints et couvrants. */
export const PARAMS_ESPACE_EMAIL: ParamVeille[] = PARAMS_VEILLE.filter((p) => espaceReglage(p) === 'email');
export const PARAMS_ESPACE_TELESERVICE: ParamVeille[] = PARAMS_VEILLE.filter((p) => espaceReglage(p) === 'teleservice');
export const PARAMS_TRANSVERSE: ParamVeille[] = PARAMS_VEILLE.filter((p) => espaceReglage(p) === 'transverse');
// Conservé (même ENSEMBLE qu'avant E1, ordre = concaténation des thèmes). Sert au complément PARAMS_DOSSIERS et à la compat.
export const PARAMS_DEMANDES: ParamVeille[] = paramsDuTheme(COLONNES_PARAMS_DEMANDES);
export const PARAMS_SOURCES: ParamVeille[] = PARAMS_VEILLE.filter((p) => COLONNES_PARAMS_SOURCES.includes(p.colonne));
export const PARAMS_MENTIONS: ParamVeille[] = PARAMS_VEILLE.filter((p) => COLONNES_PARAMS_MENTIONS.includes(p.colonne));
export const PARAMS_DOSSIERS: ParamVeille[] = PARAMS_VEILLE.filter(
  (p) => !COLONNES_PARAMS_DEMANDES.includes(p.colonne) && !COLONNES_PARAMS_SOURCES.includes(p.colonne)
    && !COLONNES_PARAMS_MENTIONS.includes(p.colonne) && !COLONNES_THEME_RATTACHEMENT.includes(p.colonne), // RATT-AUTO : rendu par SON thème (Réglages), jamais dans « classification des dossiers »
);

// ── Validation server-side (identique à l'écran) ─────────────────────────────
export interface ErreurReglage { colonne: string; message: string }
export type ResultatReglages =
  | { ok: true; demandeur: Record<string, string>; veille: Record<string, number | string | boolean | null> } // D4-bis : null = surcharge « suivre le commun »
  | { ok: false; erreurs: ErreurReglage[] };

/**
 * Valide un patch de réglages contre les bornes issues des CHECK. Un refus ne produit AUCUN `set` (rien n'est écrit).
 * - Identité : réutilise `problemesIdentite` (S7c) ; chaque manque devient une erreur nommant le champ ET la raison.
 * - Paramètres : allowlist `PARAMS_VEILLE`, type strict, plage tirée des `bornes` (donc des CHECK de la base).
 */
export function validerReglages(
  patch: { demandeur?: Record<string, unknown>; veille?: Record<string, unknown> },
  bornes: BornesParColonne,
  profil: ProfilDemandeur = 'entreprise',
): ResultatReglages {
  const erreurs: ErreurReglage[] = [];
  const demandeur: Record<string, string> = {};
  const veille: Record<string, number | string | boolean | null> = {}; // D4-bis : null = surcharge NULLABLE « suivre le commun »

  if (patch.demandeur === undefined && patch.veille === undefined) {
    return { ok: false, erreurs: [{ colonne: '', message: 'aucun réglage à modifier' }] };
  }

  // ── Identité (champs REQUIS selon le profil) ────────────────────────────────
  if (patch.demandeur !== undefined) {
    const cand: ConfigDemandeur = {
      raisonSociale: '', formeJuridique: '', siegeAdresse: '',
      representantNom: '', representantQualite: '', emailContact: '', telephone: '',
    };
    for (const ch of champsPourProfil(profil)) {
      const v = patch.demandeur[ch.cle];
      if (v === undefined) continue;
      if (typeof v !== 'string') { erreurs.push({ colonne: ch.colonne, message: `${ch.libelle} : texte attendu` }); continue; }
      cand[ch.cle] = v;
      demandeur[ch.colonne] = v.trim();
    }
    for (const probleme of problemesIdentite(cand, profil)) {
      erreurs.push({ colonne: colonneDepuisProbleme(probleme), message: probleme });
    }
  }

  // ── Paramètres moteur ───────────────────────────────────────────────────────
  if (patch.veille !== undefined) {
    for (const [cle, valeur] of Object.entries(patch.veille)) {
      const param = PARAMS_VEILLE.find((p) => p.colonne === cle);
      if (!param) { erreurs.push({ colonne: cle, message: `paramètre inconnu « ${cle} »` }); continue; }
      // Q1 — un paramètre VESTIGIAL n'agit plus : l'API le REFUSE (le grisé à l'écran ne suffit pas — l'API ne doit pas
      // accepter ce que l'interface interdit). Rien n'est écrit pour lui.
      if (param.vestigial) { erreurs.push({ colonne: cle, message: `${param.libelle} : ce réglage n’agit plus${param.remplacePar ? ` (remplacé par « ${param.remplacePar} »)` : ''} — non modifiable` }); continue; }
      if (param.type === 'enum') {
        const options = param.optionsEnum ?? [];
        if (typeof valeur !== 'string' || !options.includes(valeur)) {
          erreurs.push({ colonne: cle, message: `${param.libelle} : valeur hors liste fermée {${options.join(', ')}}` }); continue;
        }
        veille[cle] = valeur;
        continue;
      }
      if (param.type === 'texte') {
        if (typeof valeur !== 'string') { erreurs.push({ colonne: cle, message: `${param.libelle} : texte attendu` }); continue; }
        const codes = valeur.split(',').map((s) => s.trim()).filter((s) => s !== '');
        if (codes.length === 0) { erreurs.push({ colonne: cle, message: `${param.libelle} : au moins un code de pièce requis` }); continue; }
        veille[cle] = codes.join(',');
        continue;
      }
      if (param.type === 'url') {
        if (typeof valeur !== 'string') { erreurs.push({ colonne: cle, message: `${param.libelle} : texte attendu` }); continue; }
        const u = valeur.trim();
        if (!FORME_URL.test(u)) { erreurs.push({ colonne: cle, message: `${param.libelle} : adresse http(s):// attendue` }); continue; }
        veille[cle] = u;
        continue;
      }
      if (param.type === 'email') {
        if (typeof valeur !== 'string') { erreurs.push({ colonne: cle, message: `${param.libelle} : texte attendu` }); continue; }
        const e = valeur.trim();
        // '' est ACCEPTÉ (= non configurée : c'est le send qui refusera, pas les réglages) ; sinon adresse valide exigée.
        if (e !== '' && !FORME_EMAIL.test(e)) { erreurs.push({ colonne: cle, message: `${param.libelle} : adresse e-mail invalide` }); continue; }
        veille[cle] = e;
        continue;
      }
      if (param.type === 'booleen') { // S40 — interrupteur d'une mention
        if (typeof valeur !== 'boolean') { erreurs.push({ colonne: cle, message: `${param.libelle} : oui/non attendu` }); continue; }
        veille[cle] = valeur;
        continue;
      }
      if (param.type === 'texte_libre') { // S40 — texte d'une mention (vide autorisé = rien ajouté)
        if (typeof valeur !== 'string') { erreurs.push({ colonne: cle, message: `${param.libelle} : texte attendu` }); continue; }
        veille[cle] = valeur.trim();
        continue;
      }
      if (typeof valeur !== 'number' || !Number.isFinite(valeur) || !Number.isInteger(valeur)) {
        erreurs.push({ colonne: cle, message: `${param.libelle} : valeur entière attendue` }); continue;
      }
      const b = bornes[cle];
      if (!b) { erreurs.push({ colonne: cle, message: `${param.libelle} : plage indisponible en base (contrainte absente)` }); continue; }
      if (valeur < b.min) { erreurs.push({ colonne: cle, message: `${param.libelle} : minimum ${b.min}` }); continue; }
      if (valeur > b.max) { erreurs.push({ colonne: cle, message: `${param.libelle} : maximum ${b.max}` }); continue; }
      veille[cle] = valeur;
    }
  }

  if (erreurs.length > 0) return { ok: false, erreurs };
  return { ok: true, demandeur, veille };
}

// ── Réglages d'AUTOMATISATION (chantier S11b) ────────────────────────────────
export interface PatchAutomatisation {
  autoActive?: unknown; autoIntervalleHeures?: unknown; csvRetentionJours?: unknown;
  alerteMillesimeFigeJours?: unknown; alerteEchecsConsecutifs?: unknown; recomptageHeureLocale?: unknown; lancerMaintenant?: unknown;
}
export type ResultatAutomatisation =
  | { ok: true; colonnes: Record<string, number | boolean>; lancer: boolean }
  | { ok: false; erreurs: ErreurReglage[] };

type CleAuto = 'autoIntervalleHeures' | 'csvRetentionJours' | 'alerteMillesimeFigeJours' | 'alerteEchecsConsecutifs' | 'recomptageHeureLocale';
const PARAMS_AUTO: { cle: CleAuto; colonne: string; libelle: string }[] = [
  { cle: 'autoIntervalleHeures', colonne: 'auto_intervalle_heures', libelle: 'intervalle (heures)' },
  { cle: 'csvRetentionJours', colonne: 'csv_retention_jours', libelle: 'rétention des CSV (jours)' },
  { cle: 'alerteMillesimeFigeJours', colonne: 'alerte_millesime_fige_jours', libelle: 'seuil millésime figé (jours)' },
  { cle: 'alerteEchecsConsecutifs', colonne: 'alerte_echecs_consecutifs', libelle: 'seuil échecs consécutifs' },
  { cle: 'recomptageHeureLocale', colonne: 'recomptage_heure_locale', libelle: 'heure du recomptage des compteurs' }, // PASTILLES (0..23)
];

/**
 * Valide un patch de l'écran Automatisation. `auto_active` = booléen ; `auto_intervalle_heures` et `csv_retention_jours`
 * = entiers dans les bornes tirées des CHECK (jamais recopiées). `lancerMaintenant` = action (pose du drapeau). Un refus
 * ne produit aucune colonne (rien n'est écrit).
 */
export function validerAutomatisation(patch: PatchAutomatisation, bornes: BornesParColonne): ResultatAutomatisation {
  const erreurs: ErreurReglage[] = [];
  const colonnes: Record<string, number | boolean> = {};

  if (patch.autoActive !== undefined) {
    if (typeof patch.autoActive !== 'boolean') erreurs.push({ colonne: 'auto_active', message: 'automatisation : booléen attendu' });
    else colonnes.auto_active = patch.autoActive;
  }
  for (const p of PARAMS_AUTO) {
    const v = patch[p.cle];
    if (v === undefined) continue;
    if (typeof v !== 'number' || !Number.isFinite(v) || !Number.isInteger(v)) { erreurs.push({ colonne: p.colonne, message: `${p.libelle} : valeur entière attendue` }); continue; }
    const b = bornes[p.colonne];
    if (!b) { erreurs.push({ colonne: p.colonne, message: `${p.libelle} : plage indisponible en base (contrainte absente)` }); continue; }
    if (v < b.min) { erreurs.push({ colonne: p.colonne, message: `${p.libelle} : minimum ${b.min}` }); continue; }
    if (v > b.max) { erreurs.push({ colonne: p.colonne, message: `${p.libelle} : maximum ${b.max}` }); continue; }
    colonnes[p.colonne] = v;
  }
  const lancer = patch.lancerMaintenant === true;
  if (Object.keys(colonnes).length === 0 && !lancer) erreurs.push({ colonne: '', message: 'aucun réglage à modifier' });
  if (erreurs.length > 0) return { ok: false, erreurs };
  return { ok: true, colonnes, lancer };
}
