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
  for (const def of defs) {
    const min = /([a-z_][a-z0-9_]*)\s*>=\s*(-?\d+(?:\.\d+)?)/i.exec(def);
    const max = /([a-z_][a-z0-9_]*)\s*<=\s*(-?\d+(?:\.\d+)?)/i.exec(def);
    if (min && max && min[1] === max[1]) {
      bornes[min[1]] = { min: Number(min[2]), max: Number(max[2]) };
    }
  }
  return bornes;
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
  { colonne: 'dossiers_par_demande', cle: 'dossiersParDemande', libelle: 'Dossiers par demande', unite: 'dossiers', type: 'entier',
    aide: 'Nombre maximum de dossiers regroupés dans une même demande adressée à une mairie. Borne le volume par courrier.' },
  { colonne: 'demandes_par_commune_par_mois', cle: 'demandesParCommuneParMois', libelle: 'Demandes par commune et par mois', unite: 'demandes / mois', type: 'entier',
    aide: 'Nombre maximum de demandes envoyées à une même commune par mois. Borne la sollicitation d’une même mairie.' },
  // V2 — profondeur d'examen des candidats (ex-const NB_CANDIDATS) : pilotable au runtime, invariant « pilotage sans code ».
  { colonne: 'nb_candidats_examines', cle: 'nbCandidatsExamines', libelle: 'Profondeur d’examen des dossiers', unite: 'dossiers', type: 'entier',
    aide: 'Combien de dossiers, tout en haut du classement, sont examinés pour préparer les demandes. Trop bas, des dossiers récents mais moins « gros » ne sont jamais atteints ; plus haut = davantage de dossiers proposés. Au-delà de la taille du fichier des permis, la préparation devient un peu plus lente.' },
  // V2 — ordre secondaire de tri des candidats (ex-const ORDRE_SECONDAIRE) : GARDE (liste fermée), libellés FR.
  { colonne: 'tri_candidats', cle: 'triCandidats', libelle: 'Ordre d’examen des dossiers', unite: '', type: 'enum',
    optionsEnum: ['surface_puis_date', 'date_puis_surface'],
    optionsEnumLabels: { surface_puis_date: 'Plus grands d’abord (surface, puis date)', date_puis_surface: 'Plus récents d’abord (date, puis surface)' },
    aide: 'Dans quel ordre les dossiers sont départagés à catégorie égale : « plus grands d’abord » remonte les gros projets (mais peut enterrer des dossiers récents plus petits) ; « plus récents d’abord » privilégie les permis récents. ⚠️ Ce choix change AUSSI l’ordre de la liste affichée dans l’onglet « Dossiers ».' },
  // S37 — CAPS D'ENVOI : le rempart contre un envoi accidentel en masse. À monter avec prudence.
  { colonne: 'envois_max_par_run', cle: 'envoisMaxParRun', libelle: 'Envois maximum par action', unite: 'e-mails', type: 'entier',
    aide: 'Nombre maximum d’e-mails envoyés aux mairies en UNE seule action d’envoi. C’est le rempart de sécurité : même en cas d’erreur, jamais plus que ce nombre ne part d’un coup. L’augmenter accélère la campagne mais accroît le risque qu’un envoi accidentel touche beaucoup de mairies à la fois.' },
  { colonne: 'envois_max_par_jour', cle: 'envoisMaxParJour', libelle: 'Envois maximum par jour', unite: 'e-mails / jour', type: 'entier',
    aide: 'Nombre maximum d’e-mails envoyés aux mairies sur une journée entière (toutes actions cumulées). L’augmenter raccourcit la durée de la campagne ; le garder bas protège contre un envoi de masse involontaire et évite d’être classé indésirable par la messagerie.' },
  // S38 — adresse de réponse (reply-to). Sans valeur par défaut : tant qu'elle est vide, l'envoi refuse de s'exécuter.
  { colonne: 'adresse_reponse', cle: 'adresseReponse', libelle: 'Adresse de réponse des mairies', unite: '', type: 'email',
    aide: 'Adresse e-mail à laquelle les mairies répondront à vos demandes — c’est là qu’arrive la réponse contenant la hauteur du bâtiment. Ce doit être une boîte réellement relevée. Tant qu’elle est vide, aucun envoi n’est possible : une demande partie sans adresse de réponse serait une demande à laquelle la mairie ne peut pas répondre.' },
  // R7 — RELÈVE AUTOMATIQUE des réponses des mairies (lecture de la boîte de réponse ci-dessus). Opt-in : désactivée par défaut.
  { colonne: 'releve_active', cle: 'releveActive', libelle: 'Relève automatique des réponses', unite: '', type: 'booleen',
    aide: 'Quand c’est activé, l’application relève seule la boîte de réponse à intervalle régulier, enregistre les réponses des mairies et les rattache aux demandes. Désactivé, rien n’est relevé tout seul : il faut lancer la relève à la main. La boîte est TOUJOURS lue sans jamais être modifiée.' },
  { colonne: 'releve_intervalle_minutes', cle: 'releveIntervalleMinutes', libelle: 'Intervalle de relève', unite: 'minutes', type: 'entier',
    aide: 'Durée minimale entre deux relèves automatiques : une relève n’est tentée que si la précédente réussie est plus ancienne que cette durée. Plus court = réponses vues plus vite ; plus long = moins de connexions à la boîte.' },
  { colonne: 'releve_profil', cle: 'releveProfil', libelle: 'Boîte relevée automatiquement', unite: '', type: 'enum', optionsEnum: ['entreprise', 'personne'],
    aide: 'Quel compte de messagerie est relevé automatiquement : celui de la société ou celui de la personne physique. La relève à la main peut toujours viser l’un ou l’autre indépendamment.' },
  // R6 — ÉCHÉANCE d'un mois : quand une demande est « proche » de l'échéance, et fraîcheur exigée pour se prononcer.
  { colonne: 'echeance_alerte_jours', cle: 'echeanceAlerteJours', libelle: 'Alerte « échéance proche »', unite: 'jours', type: 'entier',
    aide: 'Combien de jours avant la fin du délai d’un mois une demande est signalée « proche de l’échéance ». Le silence gardé un mois après l’envoi vaut refus tacite (voie CADA) : ce réglage sert à anticiper cette date, pas à la modifier.' },
  { colonne: 'releve_fraicheur_heures', cle: 'releveFraicheurHeures', libelle: 'Fraîcheur exigée de la relève', unite: 'heures', type: 'entier',
    aide: 'Si la dernière relève réussie de la boîte est plus ancienne que cette durée, l’échéance reste « indéterminée » : on n’affirme jamais qu’une mairie n’a pas répondu sans avoir regardé récemment. Plus court = exigence de vérification plus stricte.' },
  // R8 — ALERTES e-mail : un seul récapitulatif par jour, envoyé uniquement s'il y a quelque chose à dire. Opt-in.
  { colonne: 'alerte_active', cle: 'alerteActive', libelle: 'Alertes par e-mail', unite: '', type: 'booleen',
    aide: 'Quand c’est activé, vous recevez UN récapitulatif par jour — et seulement s’il y a du nouveau (réponses reçues, rebonds, échéances proches ou dépassées). Jamais un e-mail par événement. Désactivé, aucune alerte n’est envoyée.' },
  { colonne: 'alerte_email', cle: 'alerteEmail', libelle: 'Adresse où recevoir les alertes', unite: '', type: 'email',
    aide: 'Adresse e-mail qui reçoit le récapitulatif quotidien. Tant qu’elle est vide, aucune alerte n’est envoyée, même si les alertes sont activées.' },
  { colonne: 'alerte_heure_locale', cle: 'alerteHeureLocale', libelle: 'Heure d’envoi du récapitulatif', unite: 'heure locale', type: 'entier',
    aide: 'Heure locale (0 à 23) à partir de laquelle le récapitulatif du jour peut partir. Ex. 8 = pas avant 8 h du matin. Il n’y a qu’un envoi par jour.' },
  // R4 — borne de taille des pièces jointes ENTRANTES (déposées à la réception). Distincte de la borne des photos internaute.
  { colonne: 'piece_taille_max_mo', cle: 'pieceTailleMaxMo', libelle: 'Taille maximale des pièces reçues', unite: 'Mo', type: 'entier',
    aide: 'Taille maximale d’une pièce jointe reçue d’une mairie qui sera conservée. Au-delà, la pièce n’est pas stockée mais sa trace (nom, type, taille, motif) reste visible. Les plans d’urbanisme peuvent être lourds : 50 Mo par défaut.' },
  // R3e — plafond du nombre de références de dossier interrogées à chaque relève (recherche par numéro de permis).
  { colonne: 'recherche_references_max', cle: 'rechercheReferencesMax', libelle: 'Références interrogées par relève', unite: 'références', type: 'entier',
    aide: 'À chaque relève, l’application cherche aussi les messages citant le numéro de dossier des permis en attente — même venant d’un autre expéditeur que la mairie. Ce réglage borne combien de numéros sont interrogés (les plus urgents d’abord), pour maîtriser le coût de la recherche.' },
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
    aide: 'Codes des pièces sollicitées dans le courrier (ex. PC2, PC3), séparés par des virgules.' },
  { colonne: 'profil_demandeur_defaut', cle: 'profilDemandeurDefaut', libelle: 'Profil de demandeur par défaut', unite: '', type: 'enum', optionsEnum: ['entreprise', 'personne'],
    aide: 'Profil (société / personne physique) appliqué par défaut à la création de nouvelles demandes.' },
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
];

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
export const COLONNES_PARAMS_DEMANDES: readonly string[] = [
  'anciennete_max_demande_annees', 'dossiers_par_demande', 'demandes_par_commune_par_mois',
  'nb_candidats_examines', 'tri_candidats', // V2 — profondeur d'examen + ordre de tri des candidats
  'envois_max_par_run', 'envois_max_par_jour', // S37 — caps d'envoi (groupe « demandes »)
  'adresse_reponse',                            // S38 — adresse de réponse (reply-to)
  'releve_active', 'releve_intervalle_minutes', 'releve_profil', // R7 — relève automatique des réponses
  'echeance_alerte_jours', 'releve_fraicheur_heures', // R6 — échéance d'un mois + fraîcheur de la relève
  'alerte_active', 'alerte_email', 'alerte_heure_locale', // R8 — alertes e-mail quotidiennes
  'piece_taille_max_mo', // R4 — borne de taille des pièces entrantes
  'recherche_references_max', // R3e — plafond des références de dossier interrogées
  'pieces_demandees', 'profil_demandeur_defaut',
];
// S30 — 3e sous-bloc : SOURCES de données (annuaire DILA). Distinct des demandes et de la classification des dossiers.
export const COLONNES_PARAMS_SOURCES: readonly string[] = ['dila_url'];
// S40 — 4e sous-bloc : MENTIONS ajoutées au corps (phrases de pratique, activables + éditables).
export const COLONNES_PARAMS_MENTIONS: readonly string[] = [
  'mention_service_active', 'mention_service_texte', 'mention_delai_active', 'mention_delai_texte',
];
export const PARAMS_DEMANDES: ParamVeille[] = PARAMS_VEILLE.filter((p) => COLONNES_PARAMS_DEMANDES.includes(p.colonne));
export const PARAMS_SOURCES: ParamVeille[] = PARAMS_VEILLE.filter((p) => COLONNES_PARAMS_SOURCES.includes(p.colonne));
export const PARAMS_MENTIONS: ParamVeille[] = PARAMS_VEILLE.filter((p) => COLONNES_PARAMS_MENTIONS.includes(p.colonne));
export const PARAMS_DOSSIERS: ParamVeille[] = PARAMS_VEILLE.filter(
  (p) => !COLONNES_PARAMS_DEMANDES.includes(p.colonne) && !COLONNES_PARAMS_SOURCES.includes(p.colonne) && !COLONNES_PARAMS_MENTIONS.includes(p.colonne),
);

// ── Validation server-side (identique à l'écran) ─────────────────────────────
export interface ErreurReglage { colonne: string; message: string }
export type ResultatReglages =
  | { ok: true; demandeur: Record<string, string>; veille: Record<string, number | string | boolean> }
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
  const veille: Record<string, number | string | boolean> = {};

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
  alerteMillesimeFigeJours?: unknown; alerteEchecsConsecutifs?: unknown; lancerMaintenant?: unknown;
}
export type ResultatAutomatisation =
  | { ok: true; colonnes: Record<string, number | boolean>; lancer: boolean }
  | { ok: false; erreurs: ErreurReglage[] };

type CleAuto = 'autoIntervalleHeures' | 'csvRetentionJours' | 'alerteMillesimeFigeJours' | 'alerteEchecsConsecutifs';
const PARAMS_AUTO: { cle: CleAuto; colonne: string; libelle: string }[] = [
  { cle: 'autoIntervalleHeures', colonne: 'auto_intervalle_heures', libelle: 'intervalle (heures)' },
  { cle: 'csvRetentionJours', colonne: 'csv_retention_jours', libelle: 'rétention des CSV (jours)' },
  { cle: 'alerteMillesimeFigeJours', colonne: 'alerte_millesime_fige_jours', libelle: 'seuil millésime figé (jours)' },
  { cle: 'alerteEchecsConsecutifs', colonne: 'alerte_echecs_consecutifs', libelle: 'seuil échecs consécutifs' },
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
