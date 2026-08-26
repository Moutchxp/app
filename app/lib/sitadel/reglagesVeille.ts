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
  // Q1 — NOUVEAU paramètre VIVANT : le plafond mensuel se compte désormais en PERMIS (dossiers), indépendamment du regroupement.
  { colonne: 'permis_par_commune_par_mois', cle: 'permisParCommuneParMois', libelle: 'Permis par commune et par mois', unite: 'permis / mois', type: 'entier',
    aide: 'Nombre maximum de PERMIS (dossiers) demandés à une même commune par mois — quel que soit le nombre de courriers ou de dépôts que cela représente (une commune à un ticket par dossier n’en consomme pas plus qu’une commune à courrier groupé).' },
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
  { colonne: 'envois_max_par_run', cle: 'envoisMaxParRun', libelle: 'Envois maximum par action', unite: 'e-mails', type: 'entier',
    aide: 'Nombre maximum d’e-mails envoyés aux mairies en UNE seule action d’envoi. C’est le rempart de sécurité : même en cas d’erreur, jamais plus que ce nombre ne part d’un coup. L’augmenter accélère la campagne mais accroît le risque qu’un envoi accidentel touche beaucoup de mairies à la fois.' },
  { colonne: 'envois_max_par_jour', cle: 'envoisMaxParJour', libelle: 'Envois maximum par jour', unite: 'e-mails / jour', type: 'entier',
    aide: 'Nombre maximum d’e-mails envoyés aux mairies sur une journée entière (toutes actions cumulées). L’augmenter raccourcit la durée de la campagne ; le garder bas protège contre un envoi de masse involontaire et évite d’être classé indésirable par la messagerie.' },
  // S38 — adresse de réponse (reply-to). Sans valeur par défaut : tant qu'elle est vide, l'envoi refuse de s'exécuter.
  { colonne: 'adresse_reponse', cle: 'adresseReponse', libelle: 'Adresse de réponse des mairies', unite: '', type: 'email',
    aide: 'Adresse e-mail à laquelle les mairies répondront à vos demandes — c’est là qu’arrive la réponse contenant la hauteur du bâtiment. Ce doit être une boîte réellement relevée. Tant qu’elle est vide, aucun envoi n’est possible : une demande partie sans adresse de réponse serait une demande à laquelle la mairie ne peut pas répondre.' },
  // LOT B — RELANCES : le duo « à partir de quand un rappel est préparé » + « les relances partent-elles toutes seules ». Rangés
  //   dans « Envoi aux mairies » (thème ENVOI). ⚠️ relance_auto_active est STOCKÉ et AFFICHÉ, mais LU PAR AUCUN CODE D'ENVOI dans
  //   ce lot (l'envoi automatique est un lot ultérieur) — l'aide le dit sans détour puisque le thème s'appelle « Envoi aux mairies ».
  // Cascade lot 2 — DOUBLON transitoire de « Rappel — jours avant l’échéance » (migration 136 : COMMENT vestigial en base, valeur
  //   reportée dans le successeur). Laissé ÉDITABLE ici : marquer le descripteur vestigial (écran lecture seule) relève de l’affichage (lot 4).
  { colonne: 'relance_jours_avant_echeance', cle: 'relanceJoursAvantEcheance', libelle: 'Nombre de jours avant l’échéance', unite: 'jours', type: 'entier',
    aide: 'À partir de ce nombre de jours avant l’échéance, un rappel est préparé pour les demandes restées sans réponse. La préparation a toujours lieu et n’envoie rien.' },
  { colonne: 'relance_auto_active', cle: 'relanceAutoActive', libelle: 'Envoyer les relances automatiquement', unite: '', type: 'booleen',
    aide: 'Si cette case est cochée, les relances partiront vers les mairies sans relecture. Tant qu’elle est décochée, rien ne part sans un clic.' },
  // Cascade lot 2 — les 3 délais de la cascade, dans l’ordre chronologique (rappel J-10, avis J-3, saisine J+délai). Bornes 1..30
  //   lues au runtime depuis les CHECK (migration 136). Aides en conséquences concrètes : ce qui part, quand.
  { colonne: 'relance_rappel_jours_avant', cle: 'relanceRappelJoursAvant', libelle: 'Rappel — jours avant l’échéance', unite: 'jours', type: 'entier',
    aide: 'Combien de jours AVANT la fin du délai d’un mois le premier RAPPEL est préparé. Ce rappel est courtois : il ne parle NI de refus tacite NI de la CADA, car la mairie est encore dans son délai.' },
  { colonne: 'relance_avis_jours_avant', cle: 'relanceAvisJoursAvant', libelle: 'Avis d’échéance — jours avant l’échéance', unite: 'jours', type: 'entier',
    aide: 'Combien de jours AVANT l’échéance l’AVIS est préparé. Il prévient la mairie que l’échéance approche et qu’à défaut de réponse vous pourrez saisir la CADA — sans encore la saisir. Une réponse de sa part rend la démarche sans objet.' },
  { colonne: 'relance_saisine_delai_jours', cle: 'relanceSaisineDelaiJours', libelle: 'Saisine CADA — délai après l’échéance', unite: 'jours', type: 'entier',
    aide: 'Combien de jours APRÈS l’échéance la saisine de la CADA sera déposée. Le jour de l’échéance, un message l’annonce à la mairie ; ce délai lui laisse une dernière chance de transmettre les pièces avant le dépôt.' },
  // RELANCE — fenêtre HORAIRE d'envoi automatique (matin, jours ouvrés). Un rappel expédié un dimanche soir « fait robot » ; en semaine le matin, il « fait une personne ».
  { colonne: 'envoi_heure_debut', cle: 'envoiHeureDebut', libelle: 'Envoi automatique — heure de début', unite: 'heure locale', type: 'entier',
    aide: 'Les relances automatiques ne partent qu’entre cette heure et l’heure de fin ci-dessous, du lundi au vendredi. Les jours fériés ne sont pas pris en compte. Un brouillon préparé un week-end attend le lundi matin. (L’envoi que VOUS déclenchez à la main n’est jamais bridé.)' },
  { colonne: 'envoi_heure_fin', cle: 'envoiHeureFin', libelle: 'Envoi automatique — heure de fin', unite: 'heure locale', type: 'entier',
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
  { colonne: 'releve_profil', cle: 'releveProfil', libelle: 'Boîte relevée automatiquement', unite: '', type: 'enum', optionsEnum: ['entreprise', 'personne'],
    aide: 'Quel compte de messagerie est relevé automatiquement : celui de la société ou celui de la personne physique. La relève à la main peut toujours viser l’un ou l’autre indépendamment.' },
  // R6 — ÉCHÉANCE d'un mois : quand une demande est « proche » de l'échéance, et fraîcheur exigée pour se prononcer.
  { colonne: 'echeance_alerte_jours', cle: 'echeanceAlerteJours', libelle: 'Seuil « échéance proche » (jours)', unite: 'jours', type: 'entier',
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
  // S-DWG — 3e tiret OPTIONNEL de la liste des pièces (après PC3) : les fichiers sources (DWG, DXF). Défaut ACTIF (opt-out) et
  //   texte pré-rédigé (arbitré par le porteur), là où les mentions ci-dessus sont opt-in/vides.
  { colonne: 'mention_sources_active', cle: 'mentionSourcesActive', libelle: 'Demander aussi les fichiers sources (DWG, DXF)', unite: '', type: 'booleen',
    aide: 'Quand c’est activé, un dernier point est ajouté à la liste des pièces demandées : les fichiers sources des plans (DWG, DXF), s’ils existent. La phrase précise que leur absence ne doit pas retarder l’envoi des autres pièces — elle n’oblige donc la mairie à rien. Uniquement dans les demandes ; jamais dans les relances ni les saisines CADA.' },
  { colonne: 'mention_sources_texte', cle: 'mentionSourcesTexte', libelle: 'Texte de la demande des fichiers sources', unite: '', type: 'texte_libre',
    aide: 'Le texte exact du point « fichiers sources » ajouté en fin de liste des pièces. Commencez-le par un tiret « — » pour rester aligné avec les autres pièces. S’il est vide, rien n’est ajouté même si l’option est activée.' },
  // RATT-AUTO — interrupteur du rejeu automatique du suivi de rattachement (thème « Rattachement au bâti »). Modèle relance_auto_active.
  { colonne: 'rattachement_suivi_auto_active', cle: 'rattachementSuiviAutoActive', libelle: 'Re-détecter le bâti automatiquement', unite: '', type: 'booleen',
    aide: 'Quand c’est activé, la veille rejoue seule, à chaque passage, le suivi des permis « en attente de bâti » : dès qu’une mise à jour BD TOPO fait apparaître le bâtiment attendu, le permis passe tout seul en « arbitrage demandé » (une décision de rattachement vous est alors demandée). Aucune altitude n’est jamais écrite automatiquement — la décision reste la vôtre. Tant que c’est décoché, il faut relancer le suivi à la main. Sans effet visible tant qu’aucune édition BD TOPO plus récente n’a été ingérée : il n’y a alors rien de neuf à détecter.' },
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
  // LOT B — duo « relances » : à partir de quand un rappel est préparé, puis part-il tout seul (adjacents, sans sous-titre :
  //   l'écran Réglages ne rend pas de sous-groupe dans un thème — non inventé pour ce lot).
  'relance_jours_avant_echeance', 'relance_auto_active',
  // Cascade lot 2 — les 3 délais, à la suite du réglage de relance existant, dans l'ordre chronologique (rappel → avis → saisine).
  'relance_rappel_jours_avant', 'relance_avis_jours_avant', 'relance_saisine_delai_jours',
  // RELANCE — fenêtre horaire d'envoi automatique (matin, jours ouvrés).
  'envoi_heure_debut', 'envoi_heure_fin',
];
export const COLONNES_THEME_REPONSES: readonly string[] = [
  'releve_active', 'releve_profil', 'releve_intervalle_minutes', 'releve_fraicheur_heures',
  'recherche_references_max', 'piece_taille_max_mo', 'echeance_alerte_jours',
  'depot_adresses_connues', // N1-A — versement automatique en GED (adresses reconnues)
  'nature_accuse_motifs',   // FUS-4 — motifs d'objet reconnaissant un accusé de réception
];
export const COLONNES_THEME_ALERTES: readonly string[] = [
  'alerte_active', 'alerte_email', 'alerte_heure_locale',
];
export const COLONNES_THEME_CADA: readonly string[] = [
  'proposition_cada_active', 'cada_email', 'cada_url_formulaire',
  'saisine_cada_auto_active', // Cascade lot 2 — auto-saisine (sans effet tant que cada_email vide)
];
// RATT-AUTO — thème PROPRE (ni demande, ni envoi) : automatisation du rattachement des permis à leur futur bâti. Un seul réglage.
export const COLONNES_THEME_RATTACHEMENT: readonly string[] = [
  'rattachement_suivi_auto_active',
];
export const COLONNES_PARAMS_DEMANDES: readonly string[] = [
  ...COLONNES_THEME_PREPARATION, ...COLONNES_THEME_ENVOI, ...COLONNES_THEME_REPONSES, ...COLONNES_THEME_ALERTES, ...COLONNES_THEME_CADA,
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
export const PARAMS_THEME_RATTACHEMENT: ParamVeille[] = paramsDuTheme(COLONNES_THEME_RATTACHEMENT);
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
