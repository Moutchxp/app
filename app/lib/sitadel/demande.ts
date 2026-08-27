/**
 * Constitution des demandes de communication (chantier S7) — logique PURE et testable. ⚠️ CE MODULE N'ENVOIE RIEN :
 * il compose des lots et le TEXTE d'une demande. Aucune I/O réseau, aucun e-mail.
 *
 * ⚠️ RÈGLE JURIDIQUE (à ne pas « améliorer ») : le droit d'accès (CRPA L311-1/L311-9) s'exerce SANS avoir à justifier
 * d'un motif. Le texte n'énonce donc AUCUN motif, aucune justification d'intérêt, aucune mention de l'usage prévu —
 * en exposer un AFFAIBLIRAIT la demande. Les libellés de pièces viennent de la config (`pieces_demandees`), pas du dur.
 */
import { type CanalContact, emailValide } from './mairieContact';
import { formaterReferencePermis, composerAdressePermis } from './referencePermis';

export interface ConfigDemandeur {
  raisonSociale: string;
  formeJuridique: string;
  siegeAdresse: string;
  representantNom: string;
  representantQualite: string;
  emailContact: string;
  telephone: string;
}

/** Profil du demandeur — deux identités possibles pour exercer le droit d'accès CRPA (cf. migration 055). */
export type ProfilDemandeur = 'entreprise' | 'personne';

/** Libellés d'affichage des profils (UI + journal + messages). */
export const ETIQUETTE_PROFIL: Record<ProfilDemandeur, string> = { entreprise: 'Société', personne: 'Personne physique' };

/** Normalise une valeur libre en profil sûr (défaut 'entreprise' si inconnue). */
export function profilValide(v: unknown): ProfilDemandeur {
  return v === 'personne' ? 'personne' : 'entreprise';
}

interface ControleChamp { cle: keyof ConfigDemandeur; libelle: string; min: number }

/**
 * Contrôles de PLAUSIBILITÉ de l'identité (hors telephone) requis pour qu'une demande quitte 'brouillon'. Au-delà du
 * simple non-vide (S7), on refuse aussi : e-mail au format invalide, longueur invraisemblable, et — pour les champs
 * marqués — une valeur ENTIÈREMENT EN CAPITALES (souvent un texte de substitution non renseigné). Les champs REQUIS
 * DIFFÈRENT par profil (S7e) :
 *  - « entreprise » : identité de société complète (inchangé depuis S7c) ;
 *  - « personne » : nom + adresse postale + e-mail SEULEMENT (raison sociale / forme juridique / qualité ni requis ni
 *    utilisés — voir `genererTexte`). Ce n'est PAS anonyme : le demandeur reste identifié (exigence CADA).
 * Chaque problème NOMME le champ ET la raison. Vide = identité plausible.
 */
const CONTROLES_ENTREPRISE: ControleChamp[] = [
  { cle: 'raisonSociale', libelle: 'raison sociale', min: 2 },
  { cle: 'formeJuridique', libelle: 'forme juridique', min: 2 },
  { cle: 'siegeAdresse', libelle: 'adresse du siège', min: 8 },
  { cle: 'representantNom', libelle: 'nom du représentant', min: 3 },
  { cle: 'representantQualite', libelle: 'qualité du représentant', min: 2 },
];
const CONTROLES_PERSONNE: ControleChamp[] = [
  { cle: 'representantNom', libelle: 'nom', min: 3 },
  { cle: 'siegeAdresse', libelle: 'adresse postale', min: 8 },
];
function controlesIdentite(profil: ProfilDemandeur): ControleChamp[] {
  return profil === 'personne' ? CONTROLES_PERSONNE : CONTROLES_ENTREPRISE;
}

/**
 * PRINCIPE (correctif S8a) : BLOQUER SUR LA CERTITUDE, AVERTIR SUR LE SOUPÇON. Un motif qui se terminerait par « ? » (un
 * doute) ne doit JAMAIS empêcher d'enregistrer — il deviendrait un avertissement affiché à côté du champ. Ici, tous les
 * refus sont des CERTITUDES (champ vide, longueur invraisemblable, chaîne-témoin de gabarit non rempli).
 *
 * ⚠️ On ne refuse PLUS une valeur « tout en capitales » : « CRITERIMMO » (raison sociale au RCS) ou « DUPONT » (nom de
 * famille) sont légitimes — la casse n'est pas un gabarit. On détecte à la place une LISTE FERMÉE de chaînes-témoins
 * (comparées sans casse ni accents) qu'un vrai renseignement ne contiendrait jamais.
 */
const GABARITS_TEMOINS = [
  'RAISON SOCIALE', 'FORME JURIDIQUE', 'ADRESSE COMPLETE', 'ADRESSE DU SIEGE', 'PRENOM NOM', 'NOM PRENOM',
  'QUALITE', 'EXACTE', 'A REMPLIR', 'XXX', 'LOREM',
] as const;
function sansCasseNiAccents(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '');
}
/** Chaîne-témoin de gabarit RECONNUE dans la valeur (insensible casse/accents, par SOUS-CHAÎNE), ou `null`. */
function gabaritReconnu(v: string): string | null {
  const n = sansCasseNiAccents(v);
  return GABARITS_TEMOINS.find((g) => n.includes(sansCasseNiAccents(g))) ?? null;
}

/** Toutes les chaînes-témoins de gabarit ENCORE présentes dans un/des textes (objet + corps FIGÉS), distinctes. */
export function gabaritsPresents(...textes: string[]): string[] {
  const n = sansCasseNiAccents(textes.join('\n'));
  return GABARITS_TEMOINS.filter((g) => n.includes(sansCasseNiAccents(g)));
}

/**
 * S39 — GARDE-FOU d'ENVOI : un corps de demande FIGÉ qui contient encore un gabarit non renseigné (identité non complétée
 * au moment du gel) ne doit JAMAIS partir. Renvoie un message NOMMANT précisément les gabarits trouvés, ou `null` si le
 * corps est exploitable. PUR — appliqué au corps réellement stocké (pas à la config courante, qui a pu être complétée
 * depuis, laissant un corps figé périmé).
 */
export function problemeCorpsDemande(objet: string, corps: string): string | null {
  const g = gabaritsPresents(objet, corps);
  if (g.length === 0) return null;
  return `le corps contient encore ${g.length > 1 ? 'des gabarits non renseignés' : 'un gabarit non renseigné'} (${g.map((x) => `« ${x} »`).join(', ')}) : complétez l’identité du demandeur dans Réglages, puis régénérez la demande`;
}

/**
 * Contrôle de PLAUSIBILITÉ d'UN champ (partagé identité S7c ↔ collaborateur S8a) : requis / longueur crédible / refus
 * d'un GABARIT non rempli (chaîne-témoin). Retourne le problème nommé (champ + raison) ou `null` si plausible. Aucun
 * refus fondé sur la seule casse (cf. principe ci-dessus).
 */
export function problemeChamp(valeur: string | null | undefined, libelle: string, min: number): string | null {
  const v = (valeur ?? '').trim();
  if (v === '') return `${libelle} : requis`;
  return problemeChampRenseigne(v, libelle, min);
}

/** Contrôles applicables SEULEMENT si le champ est renseigné (longueur crédible, gabarit) — factorisé. */
function problemeChampRenseigne(v: string, libelle: string, min: number): string | null {
  if (v.length < min) return `${libelle} : trop court pour être crédible`;
  const g = gabaritReconnu(v);
  if (g !== null) return `${libelle} : ressemble à un gabarit non rempli (« ${g} »)`;
  return null;
}

/**
 * Variante FACULTATIVE : un champ vide est ACCEPTÉ (null). Les autres contrôles (longueur, gabarit) ne s'appliquent QUE
 * s'il est renseigné. Pour les champs informatifs et non obligatoires (ex. la fonction d'un collaborateur — S8a).
 */
export function problemeChampFacultatif(valeur: string | null | undefined, libelle: string, min: number): string | null {
  const v = (valeur ?? '').trim();
  if (v === '') return null;
  return problemeChampRenseigne(v, libelle, min);
}

/** Problème de plausibilité d'un e-mail (partagé) : requis + format. `libelle` nomme le champ. */
export function problemeEmail(valeur: string | null | undefined, libelle: string): string | null {
  const v = (valeur ?? '').trim();
  if (v === '') return `${libelle} : requis`;
  if (!emailValide(v)) return `${libelle} : format invalide`;
  return null;
}

/** Problèmes d'identité (champ + raison) pour le profil donné ; vide si plausible. Défaut 'entreprise' (compat S7c/S7d). */
export function problemesIdentite(c: ConfigDemandeur, profil: ProfilDemandeur = 'entreprise'): string[] {
  const p: string[] = [];
  for (const ctl of controlesIdentite(profil)) {
    const e = problemeChamp(c[ctl.cle], ctl.libelle, ctl.min);
    if (e) p.push(e);
  }
  const e = problemeEmail(c.emailContact, 'e-mail de contact');
  if (e) p.push(e);
  return p;
}

// ── Pièces demandées (libellés depuis la config, jamais en dur) ──────────────
export interface Piece { code: string; description: string }
/** Descriptions RÉGLEMENTAIRES connues (le CHOIX des pièces vient de `pieces_demandees` ; ici seulement leur libellé). */
const LIBELLES_PIECES: Record<string, string> = {
  PC2: 'plan de masse coté dans les trois dimensions, prévue à l’article R.431-9 du code de l’urbanisme',
  PC3: 'plan en coupe du terrain et de la construction',
};
export function piecesDepuisConfig(piecesDemandees: string): Piece[] {
  return piecesDemandees.split(',').map((s) => s.trim()).filter((s) => s !== '')
    .map((code) => ({ code, description: LIBELLES_PIECES[code] ?? '' }));
}

// ── Constitution des lots (pure) ─────────────────────────────────────────────
export interface CandidatDossier {
  dossierId: number;
  codeInsee: string;
  communeNom: string | null;
  canal: CanalContact | null;
  type?: 'PC' | 'PD';                   // U2 : type d'autorisation Sitadel (PC/PD) → référence téléservice « <type><num_dau> ». Optionnel : posé sur les chemins formulaire (versCandidat / régénération) ; absent ailleurs (relance, tests hors formulaire).
  numDau: string;
  dateReelleAutorisation: string | null;
  adresse: string;
  codePostal: string | null;
  cadastre: string[];
  etatDau: string | null;               // S12 : 2=Autorisé 4=Annulé 5=Commencé 6=Terminé (null = jamais revu → proposable)
  absentDuDernierMillesime: boolean;    // S12 : dossier RÉELLEMENT retiré du fichier Sitadel (état futur inconnu)
  arbitragePrada?: boolean;             // S14d : PRADA au courriel non vide mais contact 'confirme' conservé → à arbitrer
  destOrigine?: 'mairie_contact' | 'prada'; // S14e : origine du destinataire résolu (affichage)
  destNom?: string | null;              // S14e : nom de la PRADA quand origine = 'prada'
  maxDossiersParDemande?: number | null;    // P3 : contrainte téléservice de la commune (mairie_contact) ; null = limite globale
  profilImpose?: ProfilDemandeur | null;    // P3 : profil imposé par le téléservice de la commune ; null = libre
}
export interface HistoriqueDemandes {
  /** dossier_id déjà rattachés à une demande NON annulée → jamais reproposés. */
  dejaRattaches: ReadonlySet<number>;
  /** nombre de demandes déjà créées CE MOIS-CI, par code_insee (plafond mensuel). */
  permisCeMoisParCommune: ReadonlyMap<string, number>;
}
export interface ParamsLot {
  dossiersParDemande: number;
  permisParCommuneParMois: number;
  /** Date d'autorisation minimale ('AAAA-MM-JJ', = aujourd'hui − anciennete_max). `null` = pas de borne (jamais en prod). */
  dateMin: string | null;
}
export interface Lot {
  codeInsee: string; communeNom: string; canal: CanalContact; dossiers: CandidatDossier[];
  destOrigine?: 'mairie_contact' | 'prada'; // S14e : origine du destinataire résolu du lot (affichage)
  destNom?: string | null;
  profilImpose?: ProfilDemandeur | null;    // P3 : profil imposé par le téléservice de la commune du lot (affichage + création)
}

/**
 * Q2a — motif pour lequel un dossier candidat n'est PAS exploitable en demande, ou `null` s'il l'est. UNE SEULE définition des
 * critères d'éligibilité (partagée par `proposerLots` et `diagnostiquer` — plus de duplication). Ordre des tests = celui,
 * historique, de `diagnostiquer` : le PREMIER critère qui échoue donne la raison (chaque compteur d'écran en dépend). Les six
 * critères, INCHANGÉS :
 *   'annule'        — état 4 (permis annulé) : demander ses plans est un courrier perdu (S12).
 *   'absent'        — retiré du dernier millésime Sitadel (état futur inconnu).
 *   'hors_fenetre'  — sans date d'autorisation OU trop ancien (date < dateMin = today − ancienneté max).
 *   'deja_rattache' — déjà rattaché à une demande active (demande_dossier.actif).
 *   'sans_canal'    — commune inconnue (communeNom null) ou canal null/'inconnu' (pas d'adresse).
 *   'courrier'      — canal postal seul : non adressable par e-mail/formulaire.
 * `null` = exploitable (canal 'email' ou 'formulaire', commune connue, tous les autres critères OK). PURE.
 */
export type RaisonInexploitable = 'annule' | 'absent' | 'hors_fenetre' | 'deja_rattache' | 'sans_canal' | 'courrier';
export function raisonInexploitable(d: CandidatDossier, dateMin: string | null, dejaRattaches: ReadonlySet<number>): RaisonInexploitable | null {
  if (d.etatDau === '4') return 'annule';
  if (d.absentDuDernierMillesime) return 'absent';
  if (d.dateReelleAutorisation === null || (dateMin !== null && d.dateReelleAutorisation < dateMin)) return 'hors_fenetre';
  if (dejaRattaches.has(d.dossierId)) return 'deja_rattache';
  if (d.communeNom === null || d.canal === null || d.canal === 'inconnu') return 'sans_canal';
  if (d.canal === 'courrier') return 'courrier';
  return null; // exploitable : email ou formulaire
}

/** Q2a — un dossier candidat est ÉLIGIBLE (produit un lot) ssi il est exploitable (aucun motif d'inexploitabilité). PURE. */
export function estCandidatEligible(d: CandidatDossier, dateMin: string | null, dejaRattaches: ReadonlySet<number>): boolean {
  return raisonInexploitable(d, dateMin, dejaRattaches) === null;
}

/**
 * Q4 — BORNE une ancienneté SAISIE (en mois) dans ce que le réglage autorise : entier de 1 à 12 × `maxAnnees`. Toute valeur
 * ABSENTE, non numérique, < 1 ou SUPÉRIEURE au maximum retombe sur le MAXIMUM (jamais d'erreur) : l'écran s'ouvre, et le
 * serveur se rabat toujours sur « tout ce que le réglage permet ». Le maximum DÉRIVE de la config lue au runtime (jamais figé).
 * PURE : partagée par la saisie côté écran ET le bornage côté route — une seule définition de la fenêtre autorisée. Ne
 * PERSISTE rien : ce n'est pas un réglage, c'est un état d'écran.
 */
export function bornerAncienneteMois(valeur: unknown, maxAnnees: number): number {
  const max = Math.max(1, Math.trunc(12 * maxAnnees));
  const n = typeof valeur === 'number' ? valeur : Number(valeur);
  if (!Number.isFinite(n) || n < 1) return max;   // absente / non numérique / < 1 → maximum
  return Math.min(Math.trunc(n), max);            // au-delà du maximum → ramené au maximum
}

/**
 * Propose des lots à partir de candidats DÉJÀ ORDONNÉS par priorité (cf. priorite.ts — on ne réordonne pas ici).
 * Exclut : dossiers HORS FENÊTRE d'ancienneté (date < `dateMin`) ou SANS DATE d'autorisation (pertinence non jugeable —
 * la cible d'une demande est un bâtiment que le LiDAR ne voit pas encore ; au-delà, la hauteur est déjà mesurée) ;
 * dossiers déjà rattachés ; communes en canal 'inconnu'/absent ou orphelines (communeNom null). Groupe par commune,
 * ≤ `dossiersParDemande` par demande, au plus `quota` demandes/commune (= plafond mensuel − demandes du mois). PURE.
 */
export function proposerLots(candidats: CandidatDossier[], params: ParamsLot, hist: HistoriqueDemandes): Lot[] {
  const parCommune = new Map<string, CandidatDossier[]>();
  for (const d of candidats) {
    // Q2a — éligibilité = UNE SEULE définition (`estCandidatEligible`, partagée avec diagnostiquer). Byte-identique à
    // l'ancien filtre inline (mêmes dossiers exclus, même ordre de parcours → mêmes lots). Détail des 6 critères : cf.
    // `raisonInexploitable`. Seuls 'email' et 'formulaire' passent (les deux produisent des lots — S16).
    if (!estCandidatEligible(d, params.dateMin, hist.dejaRattaches)) continue;
    (parCommune.get(d.codeInsee) ?? parCommune.set(d.codeInsee, []).get(d.codeInsee)!).push(d);
  }
  const lots: Lot[] = [];
  for (const [code, dossiers] of parCommune) {
    // Q1 — le plafond mensuel se compte en PERMIS (dossiers), pas en demandes/courriers : `quota` = permis restants du mois.
    const quota = Math.max(0, params.permisParCommuneParMois - (hist.permisCeMoisParCommune.get(code) ?? 0));
    if (quota <= 0) continue;
    const commune = dossiers[0].communeNom!;
    const canal = dossiers[0].canal!;
    const destOrigine = dossiers[0].destOrigine;   // S14e : origine résolue de la commune (identique pour tous ses dossiers)
    const destNom = dossiers[0].destNom;
    const profilImpose = dossiers[0].profilImpose ?? null; // P3 : contrainte téléservice identique pour tous les dossiers de la commune
    // P3 — taille de tranche = limite globale, OU la limite PROPRE à la commune si plus petite (ex. téléservice Paris = 1).
    // ⚠️ SEULE la taille de tranche et le PLAFOND (en permis) agissent ici : le FILTRE d'éligibilité (ci-dessus) et l'ORDRE des
    // candidats (amont) sont inchangés → la SÉLECTION reste BYTE-IDENTIQUE, seul le DÉCOUPAGE diffère.
    const maxCommune = dossiers[0].maxDossiersParDemande;
    const taille = typeof maxCommune === 'number' && maxCommune > 0 ? Math.min(params.dossiersParDemande, maxCommune) : params.dossiersParDemande;
    // `i` = permis déjà placés ce mois. On découpe en lots de `taille`, sans jamais dépasser `quota` PERMIS (dernière tranche
    // écrêtée à `quota`). Défaut (taille = dossiersParDemande, quota multiple) → mêmes lots qu'avant Q1 (byte-identique).
    for (let i = 0; i < dossiers.length && i < quota; i += taille) {
      lots.push({ codeInsee: code, communeNom: commune, canal, destOrigine, destNom, profilImpose, dossiers: dossiers.slice(i, Math.min(i + taille, quota)) });
    }
  }
  return lots;
}

/**
 * P3 — profil EFFECTIF d'un lot : celui IMPOSÉ par le téléservice de la commune (`lot.profilImpose`) l'emporte sur le profil
 * choisi au batch, sinon on garde le profil du batch. PURE. C'est la substitution EXPLICITE (jamais silencieuse) de la Phase 4.
 */
export function profilEffectifLot(lot: Lot, profilBatch: ProfilDemandeur): ProfilDemandeur {
  return lot.profilImpose ?? profilBatch;
}

// ── Référence + texte ────────────────────────────────────────────────────────
/** Formate SVAV-DEM-AAAA-NNNNNN (6 chiffres). */
export function formaterReferenceDemande(annee: number, n: number): string {
  return `SVAV-DEM-${annee}-${String(n).padStart(6, '0')}`;
}

// ── Aides d'INTERFACE (pures, S7b) ───────────────────────────────────────────
/** Ancre/cible du détail d'une demande — NON VIDE pour un id réel (garde contre un lien mort/vide). */
export function ancreDetail(id: number): string {
  return Number.isInteger(id) && id > 0 ? `demande-${id}` : '';
}

/** Décision de transition d'un LOT : passer 'prete' exige une identité plausible (sinon champs+raisons → aucune écriture). */
export function peutPasserLot(statut: 'prete' | 'annulee', config: ConfigDemandeur): { ok: boolean; champs: string[] } {
  if (statut === 'prete') { const champs = problemesIdentite(config); return { ok: champs.length === 0, champs }; }
  return { ok: true, champs: [] };
}

/**
 * Valide la liste d'identifiants d'une action groupée (transition / bascule de profil). Validation STRICTE (entiers JS ;
 * une string n'est jamais un id valide — cf. bigint sérialisé). Distingue « aucun identifiant fourni » de « des id étaient
 * présents mais TOUS invalides » : ce second cas doit répondre une erreur EXPLICITE, jamais un succès silencieux à 0 ligne.
 */
export function validerIdsLot(brut: unknown): { ok: true; ids: number[] } | { ok: false; erreur: string } {
  if (!Array.isArray(brut) || brut.length === 0) return { ok: false, erreur: 'aucun identifiant fourni' };
  const ids = brut.filter((x): x is number => Number.isInteger(x));
  if (ids.length === 0) return { ok: false, erreur: 'identifiants invalides (entiers attendus)' };
  return { ok: true, ids };
}

// ── D1 : annulation des demandes NON ENVOYÉES (rendre les permis au réservoir) ────────────────────────
/**
 * D1 — VERDICT PUR d'annulation d'une demande, à partir de son statut. SOURCE DE VÉRITÉ unique, partagée par le serveur
 * (`annulerLot`, garde de `changerStatutLot`) et l'écran. 🔴 RÈGLES VERROUILLÉES PAR TEST :
 *  · `envoyee`/`close` → JAMAIS annulable (`envoyee_interdite`) : une démarche engagée ne se défait pas (preuve juridique).
 *  · `prete` → EXCLUE du geste de MASSE par défaut (`prete_exclue`) : elle part au prochain envoi, jamais emportée en silence.
 *    Le geste DÉDIÉ (autoriserPrete=true) la rend annulable explicitement.
 *  · `brouillon` → annulable. `annulee` → déjà annulée. Statut inconnu → refus PRUDENT (jamais annuler à l'aveugle).
 */
export type VerdictAnnulation = 'annulable' | 'prete_exclue' | 'envoyee_interdite' | 'deja_annulee' | 'introuvable';

export function verdictAnnulation(statut: string | null | undefined, autoriserPrete: boolean): VerdictAnnulation {
  if (statut == null) return 'introuvable';
  if (statut === 'envoyee' || statut === 'close') return 'envoyee_interdite';
  if (statut === 'annulee') return 'deja_annulee';
  if (statut === 'prete') return autoriserPrete ? 'annulable' : 'prete_exclue';
  if (statut === 'brouillon') return 'annulable';
  return 'envoyee_interdite'; // statut inattendu : refus prudent (ne jamais annuler un statut non prévu)
}

/** Raison LISIBLE d'un refus d'annulation (compte rendu chiffré). PURE. `annulable` n'a pas de raison (chaîne vide). */
export const RAISON_REFUS_ANNULATION: Record<VerdictAnnulation, string> = {
  annulable: '',
  prete_exclue: 'demande prête (sur le point de partir) — à annuler par le geste dédié',
  envoyee_interdite: 'demande déjà envoyée ou close — jamais annulable',
  deja_annulee: 'demande déjà annulée',
  introuvable: 'demande introuvable',
};

// ── V3 : sélection lot-par-lot avant création ─────────────────────────────────
/**
 * CLÉ STABLE d'un lot proposé : un lot n'a pas d'id (proposerLots regroupe par commune en tranches de `dossiersParDemande`).
 * Son identité robuste entre l'AFFICHAGE et la CRÉATION = l'ENSEMBLE de ses `dossierId`, TRIÉ (indépendant de l'ordre). Si la
 * proposition est re-calculée avant création et qu'un lot a exactement les mêmes dossiers, sa clé est identique ; si sa
 * composition a changé (un dossier rattaché ailleurs, un regroupement différent), la clé ne correspond plus → le lot est traité
 * comme invalidé (jamais créé de force). PURE.
 */
export function cleLot(lot: { dossiers: { dossierId: number }[] }): string {
  return lot.dossiers.map((d) => d.dossierId).sort((a, b) => a - b).join('-');
}

/** Décompte de la sélection sur l'ENSEMBLE des lots proposés (jamais la seule page) : lots ET dossiers cochés. PURE. */
export function compterSelection(lots: { dossiers: { dossierId: number }[] }[], selection: ReadonlySet<string>): { nbLots: number; nbDossiers: number } {
  let nbLots = 0, nbDossiers = 0;
  for (const l of lots) {
    if (selection.has(cleLot(l))) { nbLots += 1; nbDossiers += l.dossiers.length; }
  }
  return { nbLots, nbDossiers };
}

/**
 * Apparie une sélection de CLÉS (venue du client) aux lots FRAIS re-calculés côté serveur. `aCreer` = lots frais dont la clé
 * est demandée (le serveur ne crée QUE ceux qu'il a lui-même re-dérivés, jamais un lot forgé) ; `invalides` = clés demandées
 * SANS lot frais correspondant (dossiers pris, plafond atteint, ou composition changée depuis l'affichage). PURE.
 */
export function apparierSelection<T extends { dossiers: { dossierId: number }[] }>(lotsFrais: T[], cles: readonly string[]): { aCreer: T[]; invalides: string[] } {
  const demandees = new Set(cles);
  const clesFraiches = new Set(lotsFrais.map((l) => cleLot(l)));
  const aCreer = lotsFrais.filter((l) => demandees.has(cleLot(l)));
  const invalides = [...demandees].filter((c) => !clesFraiches.has(c));
  return { aCreer, invalides };
}

/**
 * Valide la sélection de lots reçue par la route de création. Chaque entrée doit porter une `cle` (string non vide) ; le
 * `communeNom` optionnel n'est qu'un LIBELLÉ D'AFFICHAGE pour le compte rendu (jamais utilisé pour décider quoi créer — le
 * serveur ré-apparie par clé sur ses propres lots frais). Dédupe les clés. « aucun lot » et « lots tous invalides » sont deux
 * erreurs EXPLICITES (jamais un succès silencieux à 0).
 */
export function validerLotsSelection(brut: unknown): { ok: true; lots: { cle: string; communeNom: string | null }[] } | { ok: false; erreur: string } {
  if (!Array.isArray(brut) || brut.length === 0) return { ok: false, erreur: 'aucun lot sélectionné' };
  const lots: { cle: string; communeNom: string | null }[] = [];
  const vus = new Set<string>();
  for (const x of brut) {
    if (typeof x !== 'object' || x === null) continue;
    const cle = (x as { cle?: unknown }).cle;
    if (typeof cle !== 'string' || cle.trim() === '' || vus.has(cle)) continue;
    vus.add(cle);
    const communeNom = (x as { communeNom?: unknown }).communeNom;
    lots.push({ cle, communeNom: typeof communeNom === 'string' ? communeNom : null });
  }
  if (lots.length === 0) return { ok: false, erreur: 'lots invalides (clé attendue)' };
  return { ok: true, lots };
}

/** Compteurs expliquant l'absence de lots (mesurés, jamais figés). */
export interface DiagnosticProposition {
  candidatsExamines: number;
  dossiersAnnules: number;      // S12 : etat_dau = 4
  dossiersAbsents: number;      // S12 : retirés du fichier Sitadel
  dossiersHorsFenetre: number;
  dossiersDejaRattaches: number;
  communesSansCanal: number;
  communesPlafondMensuel: number;
  /** D2/Part 5 — communes au PLAFOND mensuel, NOMMÉES (fin du décompte anonyme « N communes au plafond » — la douleur « soirée
   *  Paris »). `consomme`/`plafond` en permis ; la date de libération du quota (1er du mois suivant) est calculée au rendu. */
  communesAuPlafond?: { codeInsee: string; nom: string | null; consomme: number; plafond: number; canal: string | null }[];
  /** D2/Part 5 — communes sans canal de contact connu, NOMMÉES (jamais un décompte anonyme). `nom` peut être null (inconnu). */
  communesSansCanalNoms?: { codeInsee: string; nom: string | null }[];
  /** S16 : communes en canal 'formulaire' — ADRESSABLES mais dépôt MANUEL sur téléservice. Elles PRODUISENT des lots (file
   *  « à déposer à la main »). Nommées. Optionnel : absent = aucune (compat des littéraux). */
  communesFormulaire?: string[];
  /** S16 : communes ÉCARTÉES faute d'adresse e-mail (canal 'courrier') — ne produisent PAS de lot. Nommées. Optionnel. */
  communesCourrier?: string[];
  /** S14d : communes où une PRADA au courriel non vide existe mais le contact 'confirme' est conservé → arbitrage à
   *  rendre (jamais de bascule silencieuse). Optionnel : absent = aucun arbitrage (compat des littéraux existants). */
  arbitragesPrada?: string[];
}

/**
 * D2/Part 5 — date de LIBÉRATION du quota mensuel = 1er jour du mois SUIVANT `maintenant`, en JJ/MM/AAAA. PURE (prend l'instant
 * en paramètre, jamais `new Date()` implicite). Le plafond mensuel se remet à zéro au changement de mois.
 */
export function dateLiberationQuota(maintenant: Date): string {
  const prochain = new Date(maintenant.getFullYear(), maintenant.getMonth() + 1, 1);
  const mm = String(prochain.getMonth() + 1).padStart(2, '0');
  return `01/${mm}/${prochain.getFullYear()}`;
}

/**
 * Message expliquant POURQUOI 0 lot, à partir des compteurs RÉELS (jamais un texte générique). '' si des lots existent.
 */
export function expliquerProposition(nbLots: number, d: DiagnosticProposition): string {
  if (nbLots > 0) return '';
  const raisons: string[] = [];
  if (d.dossiersAnnules > 0) raisons.push(`${d.dossiersAnnules} dossier(s) annulé(s)`);
  if (d.dossiersAbsents > 0) raisons.push(`${d.dossiersAbsents} dossier(s) absent(s) du dernier millésime`);
  if (d.dossiersHorsFenetre > 0) raisons.push(`${d.dossiersHorsFenetre} dossier(s) hors fenêtre d'ancienneté (déjà mesurés au LiDAR) ou sans date`);
  if (d.dossiersDejaRattaches > 0) raisons.push(`${d.dossiersDejaRattaches} dossier(s) déjà rattaché(s) à une demande`);
  if (d.communesPlafondMensuel > 0) raisons.push(`plafond mensuel atteint pour ${d.communesPlafondMensuel} commune(s)`);
  if (d.communesSansCanal > 0) raisons.push(`${d.communesSansCanal} commune(s) sans canal de contact connu`);
  if (d.communesCourrier && d.communesCourrier.length > 0) raisons.push(`${d.communesCourrier.length} commune(s) écartée(s) faute d'adresse e-mail (courrier) : ${d.communesCourrier.join(', ')}`);
  const base = `Aucun lot à proposer sur ${d.candidatsExamines} dossier(s) examiné(s) en tête de classement`;
  return raisons.length ? `${base} : ${raisons.join(' ; ')}.` : `${base}.`;
}

/**
 * Décompte CHIFFRÉ du filtrage, TOUJOURS affichable (que des lots existent ou non) — jamais un texte figé. Rend lisible
 * depuis l'écran l'effet des réglages, notamment `anciennete_max_demande_annees` (dossiers écartés « hors fenêtre »).
 */
export function resumeDiagnostic(d: DiagnosticProposition): string {
  const base = `Sur ${d.candidatsExamines} dossier(s) examiné(s) en tête de classement : `
    + `${d.dossiersAnnules} annulé(s) · `
    + `${d.dossiersAbsents} absent(s) du dernier millésime · `
    + `${d.dossiersHorsFenetre} hors fenêtre d'ancienneté (déjà mesurés au LiDAR) ou sans date · `
    + `${d.dossiersDejaRattaches} déjà rattaché(s) · `
    + `${d.communesSansCanal} commune(s) sans canal · `
    + `${d.communesPlafondMensuel} commune(s) au plafond mensuel.`;
  // S16 : les catégories « à déposer à la main » (formulaire) et « écartées faute d'adresse » (courrier) n'apparaissent QUE
  // s'il y en a (compat des littéraux existants) — l'écran les NOMME, jamais de disparition silencieuse.
  const formulaire = d.communesFormulaire && d.communesFormulaire.length > 0
    ? ` · ${d.communesFormulaire.length} à déposer à la main (formulaire) : ${d.communesFormulaire.join(', ')}`
    : '';
  const courrier = d.communesCourrier && d.communesCourrier.length > 0
    ? ` · ⚠ ${d.communesCourrier.length} écartée(s) faute d'adresse e-mail (courrier) : ${d.communesCourrier.join(', ')}`
    : '';
  return base + formulaire + courrier;
}

/** Les 12 mois en français, index 0 = janvier. SOURCE UNIQUE (réutilisée par dateEnFrancais ET le parseur d'expiration L1, `extractionLiens.ts`). */
export const MOIS_FR = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
/** Date d'autorisation en toutes lettres : '2017-03-14' → « 14 mars 2017 ». `null`/invalide → « date inconnue »/valeur brute. */
export function dateEnFrancais(iso: string | null): string {
  if (!iso) return 'date inconnue';
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return iso;
  const mois = Number(m[2]) - 1;
  if (mois < 0 || mois > 11) return iso;
  return `${Number(m[3])} ${MOIS_FR[mois]} ${m[1]}`;
}

/** Signataire alternatif d'un courrier « entreprise » : un COLLABORATEUR (S8a) qui signe au nom de la société. */
export interface Signataire { nom: string; prenom: string; fonction: string; email: string }

/**
 * Applique un SIGNATAIRE collaborateur à l'identité de société : le représentant devient le collaborateur (prénom nom,
 * fonction) et l'adresse de réponse son e-mail — MAIS la raison sociale, la forme juridique et le siège restent CEUX DE
 * LA SOCIÉTÉ (config_demandeur). ⚠️ MOTIF : l'équipe se répartit la charge, elle ne se présente jamais comme des citoyens
 * indépendants → un courrier signé par un collaborateur porte TOUJOURS la raison sociale (invariant verrouillé par test).
 * `null` → config inchangée (repli figé, comportement historique). Pur.
 */
export function configAvecSignataire(config: ConfigDemandeur, s: Signataire | null): ConfigDemandeur {
  if (s === null) return config;
  return {
    ...config,
    representantNom: `${s.prenom.trim()} ${s.nom.trim()}`.trim(),
    representantQualite: s.fonction.trim(),
    emailContact: s.email.trim(),
  };
}

export interface TexteDemande { objet: string; corps: string }

/**
 * S40 — MENTIONS de PRATIQUE ajoutées au corps, pilotées depuis Réglages (config_veille). Chacune est activable et son
 * texte est ÉDITABLE (rédigé par l'admin, jamais en dur). ⚠️ FRONTIÈRE : ce sont des phrases de pratique, PAS le fondement
 * juridique — le socle (articles L311-1 / L311-9 3°, formules, salutations, gabarit de l'objet) reste EN DUR ci-dessous.
 */
export interface MentionsCorps {
  serviceActive?: boolean; serviceTexte?: string; // « À l'attention du service… » — en tête du corps
  delaiActive?: boolean; delaiTexte?: string;      // « À défaut de réponse dans un délai d'un mois… » — près de la clôture
  // S-DWG — 3e tiret OPTIONNEL de la LISTE des pièces (après PC3) : les fichiers sources (DWG, DXF). Phrase qui N'OBLIGE À
  // RIEN (les sources ne sont pas une pièce Cerfa). DEMANDES seules — jamais dans une relance ni une saisine CADA.
  sourcesActive?: boolean; sourcesTexte?: string;
}
/** Une mention retenue (active ET non vide, trimée) ou `null` — pour insertion conditionnelle propre. */
function mentionRetenue(active: boolean | undefined, texte: string | undefined): string | null {
  const t = (texte ?? '').trim();
  return active === true && t !== '' ? t : null;
}

/**
 * S40 (point 4) — Référence DISCRÈTE pour le profil « personne » : la référence sérialisée `SVAV-DEM-AAAA-NNNNNN` trahirait
 * la marque/le système (cf. S7e). On retire le préfixe `SVAV-DEM-` → `AAAA-NNNNNN` : la mairie peut la rappeler (rattachement
 * possible), sans révéler l'identité du système. L'objet, lui, reste totalement générique.
 */
export function referenceDiscrete(reference: string): string {
  return reference.replace(/^SVAV-DEM-/, '');
}

/**
 * FUS — bloc-signature du SIGNATAIRE (personne PHYSIQUE) d'une lettre profil ENTREPRISE : le nom, puis la qualité SI renseignée
 * (facultative, comme dans la clause « représentée par »). Lignes prêtes à insérer APRÈS la politesse. ⚠️ DISTINCT de la clause
 * d'identité « représentée par [nom] » : celle-ci porte l'identité de la personne MORALE demandeuse, la signature porte celle du
 * signataire — une personne écrit (« je »), une personne morale demande. JAMAIS VIDE : `representantNom` est un champ REQUIS
 * (`CONTROLES_ENTREPRISE`, min 3 → `problemesIdentite`). PUR. Réutilisé par la demande, la relance et la saisine CADA.
 */
export function signatureEntreprise(config: ConfigDemandeur): string[] {
  return [config.representantNom.trim(), config.representantQualite.trim()].filter((x) => x !== '');
}

/**
 * Génère l'objet + le corps d'une demande selon la trame CRPA imposée, en substituant les variables. AUCUN motif ni
 * justification, et AUCUNE date-calendrier dans le corps (la date est apposée à l'ENVOI — chantier ultérieur — car
 * c'est elle qui fait courir le délai de refus tacite ; une date figée à la création serait fausse). Les pièces
 * proviennent de la config. `profil` sélectionne le modèle : 'entreprise' (identité de société, INCHANGÉ depuis S7c)
 * ou 'personne' (en-tête Nom/adresse/e-mail, 1re personne, aucune société/qualité/marque).
 */
export function genererTexte(
  lot: Lot, config: ConfigDemandeur, reference: string, pieces: Piece[], profil: ProfilDemandeur = 'entreprise',
  adresseReponse = '', mentions: MentionsCorps = {},
): TexteDemande {
  const n = lot.dossiers.length;

  // P3 — CANAL FORMULAIRE (dépôt manuel sur téléservice) : corps DÉDIÉ, validé AU MOT PRÈS. Branche PRÉCOCE → le code des
  // variantes e-mail (ci-dessous) est strictement INCHANGÉ. UN SEUL permis (le téléservice impose un dossier par dépôt),
  // AUCUNE identité / adresse de réponse / société (FranceConnect les impose et le récapitulatif du formulaire les reprend),
  // AUCUN rappel de la référence SVAV (une mairie n'adopte pas notre nomenclature ; le lien réponse↔permis se fera par la
  // référence de la MAIRIE — chantier P5). Socle juridique EN DUR : L311-1, L311-9 3°, R431-9 (liste close INCHANGÉE).
  if (lot.canal === 'formulaire') {
    const ligneDossierForm = (d: CandidatDossier): string => {
      // U2 — référence AU MÊME FORMAT que le champ « Numéro de dossier instruit » (formaterReferencePermis, source unique). À
      //   défaut de type (jamais en pratique — Sitadel garantit PC/PD), on retombe sur le num_dau BRUT : identifiant réel, pas un
      //   type inventé. U4 — adresse via composerAdressePermis (source UNIQUE, partagée avec la carte de dépôt) : voie + ville/CP
      //   + arrondissement quand l'adresse existe ; sinon DÉGRADATION propre (ville/CP + arrondissement), JAMAIS « non renseignée ».
      const ref = formaterReferencePermis(d.type, d.numDau);
      const refTexte = ref.ok ? ref.reference : d.numDau;
      const cad = d.cadastre.length ? `parcelle(s) ${d.cadastre.join(', ')}` : '';
      const segments = [refTexte, `autorisé le ${dateEnFrancais(d.dateReelleAutorisation)}`, composerAdressePermis(d).ligne, cad];
      return segments.filter((x) => x !== '').join(' — ');
    };
    const objet = 'Demande de communication de documents administratifs';
    const corps = [
      'À l’attention du service de l’urbanisme',
      '',
      'Madame, Monsieur,',
      '',
      'En application des articles L. 311-1 et L. 311-9 3° du code des relations entre le public et l’administration, pourriez-vous, s’il vous plaît, me communiquer par courrier électronique les pièces suivantes du permis ci-dessous :',
      '',
      '— la pièce PC2, plan de masse coté dans les trois dimensions, prévue à l’article R. 431-9 du code de l’urbanisme ;',
      '— la pièce PC3, plan en coupe du terrain et de la construction.',
      '',
      ...lot.dossiers.map((d) => `Permis concerné : ${ligneDossierForm(d)}`),
      '',
      'Je vous remercie par avance pour votre aide et vous souhaite une excellente journée.',
    ].join('\n');
    return { objet, corps };
  }

  // S40 — mentions de pratique (éditables) ; null si désactivées/vides. Insérées à leur place naturelle dans les 2 gabarits.
  const ligneService = mentionRetenue(mentions.serviceActive, mentions.serviceTexte);
  const ligneDelai = mentionRetenue(mentions.delaiActive, mentions.delaiTexte);
  // S-DWG — 3e tiret OPTIONNEL des pièces (fichiers sources DWG/DXF), APRÈS PC3. `ligneSources` porte déjà son propre tiret
  // cadratin et sa ponctuation finale (point = dernier item de la liste). Chaque ligne PC finit par « ; » (item non
  // terminal) → la liste reste cohérente. ⚠️ INACTIVE (null) : `lignesPieces` est byte-identique à l'existant (un test le
  // verrouille). Absente du canal 'formulaire' (branche précoce ci-dessus), des relances et des saisines CADA (autres modules).
  const ligneSources = mentionRetenue(mentions.sourcesActive, mentions.sourcesTexte);

  const lignesPieces = [
    ...pieces.map((p) => `— la pièce ${p.code}${p.description ? `, ${p.description}` : ''} ;`),
    ...(ligneSources ? [ligneSources] : []),
  ].join('\n');
  const lignesDossiers = lot.dossiers.map((d) => {
    // Commune + code postal, en plus de l'adresse. ⚠️ l'adresse (libellé de voie tronqué à 26 c par Sitadel) est
    // transmise TELLE QUELLE — on ajoute seulement les autres éléments d'identification autour.
    const villeCP = [d.codePostal, d.communeNom].filter((x) => x !== null && x.trim() !== '').map((x) => x!.trim()).join(' ');
    const adresse = d.adresse.trim();
    const cad = d.cadastre.length ? `parcelle(s) ${d.cadastre.join(', ')}` : '';
    const segments = [d.numDau, `autorisé le ${dateEnFrancais(d.dateReelleAutorisation)}`];
    if (adresse !== '') {
      segments.push([adresse, villeCP].filter((x) => x !== '').join(', '));
      if (cad) segments.push(cad);
    } else {
      // Pas d'adresse : la ligne s'appuie explicitement sur les parcelles (+ commune/CP), sans vide ni tiret orphelin.
      const secours = [villeCP, cad].filter((x) => x !== '').join(', ');
      if (secours) segments.push(secours);
    }
    return segments.join(' — ');
  }).join('\n');

  if (profil === 'personne') {
    // ⚠️ DISCRÉTION (S7e correctif) : objet GÉNÉRIQUE et banal, SANS référence ni aucune chaîne dérivée de la marque
    // (« SVAV », « Sans Vis-à-Vis »…). La référence sérialisée SVAV-DEM-… trahirait un traitement de masse et
    // l'identité du système — ce que le profil « personne » existe justement pour éviter. Le suivi reste INTERNE
    // (demande.reference inchangée en base / admin / journal). En-tête = Nom / adresse postale / e-mail uniquement,
    // 1re personne, AUCUNE société, qualité ni marque. Signature = le seul nom.
    const objet = 'Demande de communication de documents administratifs';
    const enTete = [config.representantNom, config.siegeAdresse, config.emailContact]
      .map((x) => x.trim()).filter((x) => x !== '').join('\n');
    const corps = [
      enTete,
      '',
      ...(ligneService ? [ligneService, ''] : []), // S40 — mention « service destinataire » (éditable), en tête
      'Madame, Monsieur,',
      '',
      // SOCLE JURIDIQUE — EN DUR (non éditable) : articles + formule de demande par voie électronique.
      'En application des articles L311-1 et L311-9 3° du code des relations entre le public et l’administration, je demande communication, par voie électronique, des pièces suivantes pour chacun des dossiers listés ci-dessous :',
      lignesPieces,
      '',
      'Dossiers concernés :',
      lignesDossiers,
      '',
      'Je vous remercie de bien vouloir m’adresser ces documents à l’adresse électronique figurant en tête de la présente.',
      '',
      // S40 (point 4) — RÉFÉRENCE DISCRÈTE (rattachement de la réponse), sans marque ; l'objet reste générique.
      `Merci de bien vouloir rappeler la référence ${referenceDiscrete(reference)} dans votre réponse.`,
      ...(ligneDelai ? ['', ligneDelai] : []),      // S40 — mention « délai d'un mois » (éditable), près de la clôture
      '',
      'Je vous prie d’agréer, Madame, Monsieur, l’expression de mes salutations distinguées.',
      '',
      config.representantNom.trim(),
    ].join('\n');
    return { objet, corps };
  }

  const objet = `Demande de communication de documents administratifs — ${lot.communeNom} — ${n} dossier(s) — réf. ${reference}`;
  const tel = config.telephone.trim() !== '' ? `, téléphone ${config.telephone.trim()}` : '';
  const corps = [
    ...(ligneService ? [ligneService, ''] : []), // S40 — mention « service destinataire » (éditable), en tête
    'Madame, Monsieur,',
    '',
    // SOCLE JURIDIQUE — EN DUR (non éditable) : articles + formule de demande par voie électronique.
    'En application des articles L311-1 et L311-9 3° du code des relations entre le public et l’administration, je vous demande communication, par voie électronique, des pièces suivantes pour chacun des dossiers listés ci-dessous :',
    '',
    lignesPieces,
    '',
    'Dossiers concernés :',
    lignesDossiers,
    '',
    // La qualité (fonction du signataire) est FACULTATIVE (S8a) : si vide, on l'omet SANS virgule orpheline ni double
    // espace. Non vide → « , qualité » exactement comme avant (instantané figé préservé pour l'identité société).
    `${config.raisonSociale}, ${config.formeJuridique}, dont le siège est ${config.siegeAdresse}, représentée par ${config.representantNom}${config.representantQualite.trim() !== '' ? `, ${config.representantQualite}` : ''}.`,
    // S39 (B) — SOURCE UNIQUE : l'adresse de réponse vient de config_veille.adresse_reponse (paramètre `adresseReponse`),
    // plus de doublon avec config_demandeur.email_contact. C'est la boîte relue vers laquelle la mairie répondra.
    `Adresse de réponse : ${adresseReponse.trim()}${tel}`,
    '',
    `Je vous remercie de bien vouloir rappeler la référence ${reference} dans votre réponse.`,
    ...(ligneDelai ? ['', ligneDelai] : []),      // S40 — mention « délai d'un mois » (éditable), près de la clôture
    '',
    'Je vous prie d’agréer, Madame, Monsieur, l’expression de ma considération distinguée.',
    '',
    ...signatureEntreprise(config), // FUS — la lettre au « je » est SIGNÉE par le représentant (nom + qualité si renseignée)
  ].join('\n');

  return { objet, corps };
}
