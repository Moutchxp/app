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
  type: 'entier' | 'texte' | 'enum';
  aide: string;
  optionsEnum?: string[]; // pour type 'enum' : liste fermée des valeurs admises
}

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
];

/**
 * S13 — partition PUREMENT PRÉSENTATIONNELLE de `PARAMS_VEILLE` en deux sous-blocs à l'écran Réglages (aucune route, aucune
 * requête, aucun déplacement d'onglet ne change). Les colonnes ci-dessous règlent les DEMANDES aux mairies ; toutes les
 * autres règlent la classification et l'affichage des DOSSIERS (seuils « immeuble », rangs des catégories, profondeur
 * d'affichage) — elles relèvent conceptuellement du groupe « Mise à jour des dossiers ». ⚠️ DETTE connue : ces dernières
 * gagneraient à migrer vers l'onglet Dossiers/Automatisation, mais ce déplacement touche les routes → chantier séparé.
 */
export const COLONNES_PARAMS_DEMANDES: readonly string[] = [
  'anciennete_max_demande_annees', 'dossiers_par_demande', 'demandes_par_commune_par_mois', 'pieces_demandees', 'profil_demandeur_defaut',
];
export const PARAMS_DEMANDES: ParamVeille[] = PARAMS_VEILLE.filter((p) => COLONNES_PARAMS_DEMANDES.includes(p.colonne));
export const PARAMS_DOSSIERS: ParamVeille[] = PARAMS_VEILLE.filter((p) => !COLONNES_PARAMS_DEMANDES.includes(p.colonne));

// ── Validation server-side (identique à l'écran) ─────────────────────────────
export interface ErreurReglage { colonne: string; message: string }
export type ResultatReglages =
  | { ok: true; demandeur: Record<string, string>; veille: Record<string, number | string> }
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
  const veille: Record<string, number | string> = {};

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
