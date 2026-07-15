/**
 * Module INTERNAUTE — LOT 2 (ingestion) : validation PURE du corps reçu + porte de consentement.
 *
 * Pur, sans accès base, AUCUN import `app/lib/analytics/*` → cloisonnement M2 trivial. Seule dépendance moteur :
 * la fonction PURE `hauteurVision` (config.ts), importée en LECTURE SEULE pour le garde-fou preuve de la hauteur de
 * vision (aucun calcul de score/verdict, aucun accès base, config.ts jamais modifié). La partie base (transaction
 * A+B+C) est dans `socle.ts` (serveur only). Ici : uniquement la validation d'entrée et les gardes, testables sans base.
 */
import { FINALITE_SERVICE, texteExiste, type CleFinalite } from './textesConsentement';
import { hauteurVision } from '../svv/config';

/** Un choix de consentement ACCEPTÉ (le front n'envoie que les cases cochées). */
export interface ChoixConsentement {
  finalite: CleFinalite;
  version: number;
}

/** Données de projet capturées en fin de tunnel (moteur en LECTURE SEULE + saisies). Toutes stables sont optionnelles. */
export interface ProjetIngestion {
  versionTunnel: number;
  payload: Record<string, unknown>;
  verdict: string | null;
  score: number | null;
  etage: number | null;
  dernierEtage: boolean | null;
  residencePrincipale: boolean | null;
  communeInsee: string | null;
  lat: number | null;
  lon: number | null;
  adresseSaisie: string | null;
  adresseNormalisee: string | null;
  // Grandeurs de visée (migration 026) — colonnes stables nullable, snapshot preuve, aucun arrondi.
  azimutDeg: number | null;
  hauteurSousPlafondM: number | null;
  hauteurVisionM: number | null;
  // Mode d'origine réellement employé (ModeOrigine, migration 033) — entrée du pipeline nécessaire à un re-jeu
  // serveur FIDÈLE. LENIENT : toute valeur hors liste fermée ou absente → null (jamais une erreur, jamais inventée).
  modeOrigine: string | null;
}

export interface CorpsIngestion {
  identite: { prenom: string; nom: string; email: string; telephone: string | null };
  consentements: ChoixConsentement[];
  projet: ProjetIngestion;
}

const VERDICTS = new Set(['SANS_VIS_A_VIS', 'VIS_A_VIS', 'INDETERMINE']);
/** Liste FERMÉE des valeurs de ModeOrigine (app/lib/svv/config.ts) — miroir du CHECK `internaute_projet.mode_origine` (033). */
const MODES_ORIGINE = new Set(['semi_auto', 'manuel']);

/** Tolérance de revérification de la hauteur de vision (flottant), en mètres. */
const EPS_HAUTEUR_VISION_M = 1e-6;

/**
 * GARDE-FOU PREUVE — la hauteur de vision est une DÉRIVÉE déterministe de (etage, sous_plafond) via la formule
 * moteur `hauteurVision` (config.ts, LECTURE SEULE). Comme le dossier peut servir de preuve en litige, la FORMULE
 * fait foi : si les deux intrants sont présents, on recalcule et on SUBSTITUE la valeur recalculée à la valeur
 * reçue du front (défense contre un front altéré / une divergence de version de tunnel). Un écart > epsilon est
 * journalisé côté serveur (avertissement, non bloquant). Si un intrant manque, on conserve le snapshot reçu tel
 * quel (rien à revérifier). Aucun arrondi.
 */
function hauteurVisionFiable(recue: number | null, etage: number | null, sousPlafond: number | null): number | null {
  if (etage === null || sousPlafond === null) return recue;
  const recalc = hauteurVision(etage, sousPlafond);
  if (recue !== null && Math.abs(recue - recalc) > EPS_HAUTEUR_VISION_M) {
    console.warn(
      `[internaute] hauteur_vision reçue ${recue} ≠ recalcul ${recalc} (etage=${etage}, sousPlafond=${sousPlafond}) → valeur recalculée retenue (source = formule)`,
    );
  }
  return recalc;
}

function estObjet(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}
function chaineNonVide(v: unknown): v is string {
  return typeof v === 'string' && v.trim() !== '';
}
function nombreOuNull(v: unknown): v is number | null {
  return v === null || (typeof v === 'number' && Number.isFinite(v));
}
function entierOuNull(v: unknown): v is number | null {
  return v === null || (typeof v === 'number' && Number.isInteger(v));
}
function booleenOuNull(v: unknown): v is boolean | null {
  return v === null || typeof v === 'boolean';
}
function chaineOuNull(v: unknown): v is string | null {
  return v === null || typeof v === 'string';
}
/** Code commune INSEE (5 car : dept ou 2A/2B + 3) ou null. Miroir du CHECK `internaute_projet.commune_insee` (023). */
const INSEE = /^(2[AB]|[0-9]{2})[0-9]{3}$/;
function communeOuNull(v: unknown): boolean {
  return v == null || (typeof v === 'string' && INSEE.test(v));
}

/**
 * Valide et NORMALISE le corps d'ingestion. Renvoie `{ ok: true, corps }` (normalisé, trims appliqués) ou
 * `{ ok: false, erreurs }`. Ne throw jamais. La validation est stricte sur l'identité (nécessaire au service) et
 * tolérante sur les colonnes stables du projet (nullable — le moteur peut renvoyer INDÉTERMINÉ).
 */
export function validerCorpsIngestion(
  body: unknown,
): { ok: true; corps: CorpsIngestion } | { ok: false; erreurs: string[] } {
  const erreurs: string[] = [];
  if (!estObjet(body)) return { ok: false, erreurs: ['corps invalide'] };

  // Identité (bloc A) — prénom, nom, email requis ; téléphone optionnel (nullable, loi démarchage).
  const identiteBrut = body.identite;
  const identite = { prenom: '', nom: '', email: '', telephone: null as string | null };
  if (!estObjet(identiteBrut)) {
    erreurs.push('identite manquante');
  } else {
    if (!chaineNonVide(identiteBrut.prenom)) erreurs.push('prenom requis');
    if (!chaineNonVide(identiteBrut.nom)) erreurs.push('nom requis');
    if (!chaineNonVide(identiteBrut.email) || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test((identiteBrut.email as string).trim())) {
      erreurs.push('email invalide');
    }
    if (identiteBrut.telephone != null && typeof identiteBrut.telephone !== 'string') erreurs.push('telephone invalide');
    if (erreurs.length === 0) {
      identite.prenom = (identiteBrut.prenom as string).trim();
      identite.nom = (identiteBrut.nom as string).trim();
      identite.email = (identiteBrut.email as string).trim();
      identite.telephone = chaineNonVide(identiteBrut.telephone) ? (identiteBrut.telephone as string).trim() : null;
    }
  }

  // Consentements (bloc B) — liste des cases ACCEPTÉES ; chaque (finalite, version) doit exister (anti-forge).
  const consentements: ChoixConsentement[] = [];
  const consentBrut = body.consentements;
  if (!Array.isArray(consentBrut)) {
    erreurs.push('consentements doit être une liste');
  } else {
    for (const c of consentBrut) {
      if (!estObjet(c) || typeof c.finalite !== 'string' || typeof c.version !== 'number') {
        erreurs.push('consentement mal formé');
        continue;
      }
      if (!texteExiste(c.finalite, c.version)) {
        erreurs.push(`consentement inconnu: ${c.finalite} v${c.version}`);
        continue;
      }
      consentements.push({ finalite: c.finalite as CleFinalite, version: c.version });
    }
  }

  // Projet (bloc C) — payload jsonb + version_tunnel + colonnes stables nullable.
  const projetBrut = body.projet;
  let projet: ProjetIngestion | null = null;
  if (!estObjet(projetBrut)) {
    erreurs.push('projet manquant');
  } else {
    if (typeof projetBrut.versionTunnel !== 'number') erreurs.push('versionTunnel requis');
    if (!estObjet(projetBrut.payload)) erreurs.push('payload doit être un objet');
    if (projetBrut.verdict != null && !(typeof projetBrut.verdict === 'string' && VERDICTS.has(projetBrut.verdict)))
      erreurs.push('verdict invalide');
    if (!nombreOuNull(projetBrut.score ?? null)) erreurs.push('score invalide');
    if (!entierOuNull(projetBrut.etage ?? null)) erreurs.push('etage invalide');
    if (!booleenOuNull(projetBrut.dernierEtage ?? null)) erreurs.push('dernierEtage invalide');
    if (!booleenOuNull(projetBrut.residencePrincipale ?? null)) erreurs.push('residencePrincipale invalide');
    if (!communeOuNull(projetBrut.communeInsee ?? null)) erreurs.push('communeInsee invalide');
    if (!nombreOuNull(projetBrut.lat ?? null)) erreurs.push('lat invalide');
    if (!nombreOuNull(projetBrut.lon ?? null)) erreurs.push('lon invalide');
    if (!nombreOuNull(projetBrut.azimutDeg ?? null)) erreurs.push('azimutDeg invalide');
    if (!nombreOuNull(projetBrut.hauteurSousPlafondM ?? null)) erreurs.push('hauteurSousPlafondM invalide');
    if (!nombreOuNull(projetBrut.hauteurVisionM ?? null)) erreurs.push('hauteurVisionM invalide');
    if (erreurs.length === 0) {
      projet = {
        versionTunnel: projetBrut.versionTunnel as number,
        payload: projetBrut.payload as Record<string, unknown>,
        verdict: (projetBrut.verdict as string | undefined) ?? null,
        score: (projetBrut.score as number | undefined) ?? null,
        etage: (projetBrut.etage as number | undefined) ?? null,
        dernierEtage: (projetBrut.dernierEtage as boolean | undefined) ?? null,
        residencePrincipale: (projetBrut.residencePrincipale as boolean | undefined) ?? null,
        communeInsee: (projetBrut.communeInsee as string | undefined) ?? null,
        lat: (projetBrut.lat as number | undefined) ?? null,
        lon: (projetBrut.lon as number | undefined) ?? null,
        adresseSaisie: chaineOuNull(projetBrut.adresseSaisie ?? null) ? ((projetBrut.adresseSaisie as string) ?? null) : null,
        adresseNormalisee: chaineOuNull(projetBrut.adresseNormalisee ?? null) ? ((projetBrut.adresseNormalisee as string) ?? null) : null,
        azimutDeg: (projetBrut.azimutDeg as number | undefined) ?? null,
        hauteurSousPlafondM: (projetBrut.hauteurSousPlafondM as number | undefined) ?? null,
        // Snapshot revérifié : la formule fait foi si etage + sous_plafond sont présents (garde-fou preuve).
        hauteurVisionM: hauteurVisionFiable(
          (projetBrut.hauteurVisionM as number | undefined) ?? null,
          (projetBrut.etage as number | undefined) ?? null,
          (projetBrut.hauteurSousPlafondM as number | undefined) ?? null,
        ),
        // Mode d'origine : LENIENT (télémétrie du pipeline, PAS un champ requis du service). Vérifié contre la liste
        // FERMÉE de ModeOrigine AVANT écriture ; toute valeur inconnue ou absente → null, jamais une erreur remontée,
        // jamais une valeur inventée. Le CHECK 033 n'est que le filet ; la porte est ici. NULL = mode inconnu, admis.
        modeOrigine:
          typeof projetBrut.modeOrigine === 'string' && MODES_ORIGINE.has(projetBrut.modeOrigine)
            ? projetBrut.modeOrigine
            : null,
      };
    }
  }

  if (erreurs.length > 0 || projet === null) return { ok: false, erreurs: erreurs.length ? erreurs : ['projet invalide'] };
  return { ok: true, corps: { identite, consentements, projet } };
}

/**
 * F1 (recontact interne) est-elle consentie ? = le profil est-il RECONTACTABLE par téléphone. Propriété
 * F1-SPÉCIFIQUE, DISTINCTE de la porte de création (désormais « au moins un consentement », cf.
 * `auMoinsUnConsentement`). N'ouvre NI le jeton de rectification NI la porte ; réservé à la recontactabilité F1.
 */
export function consentementServicePresent(consentements: ChoixConsentement[]): boolean {
  return consentements.some((c) => c.finalite === FINALITE_SERVICE);
}

/**
 * PORTE DE CRÉATION D'UN PROFIL — « au moins un des 3 consentements » (élargie depuis l'ancienne règle F1-only).
 * Chaque consentement reçu a déjà été VALIDÉ contre le catalogue par `validerCorpsIngestion` (anti-forge via
 * `texteExiste`) → une liste NON vide contient au moins un consentement RÉEL et connu. Le certificat reste délivré
 * SANS consentement (non-couplage) ; un PROFIL n'est créé que si au moins un consentement est donné (sinon
 * minimisation : aucune donnée nominative persistée). Ne généralise AUCUNE mécanique F1 (jeton, opposition_recontact).
 */
export function auMoinsUnConsentement(consentements: ChoixConsentement[]): boolean {
  return consentements.length > 0;
}
