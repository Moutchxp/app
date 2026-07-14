/**
 * Pont « fiche internaute → Banc de test M5 » (LOT B).
 *
 * POINT DE CORRESPONDANCE UNIQUE entre un dossier `internaute_projet` (bloc C, RGPD, nominatif) et les
 * paramètres d'entrée du Banc de test M5 (`ParametresSaisie` de `BancSaisie`). Toute la connaissance
 * « quel champ du projet alimente quel intrant du banc » vit ICI et NULLE PART AILLEURS : le jour où le
 * dossier stockera de nouvelles grandeurs (p. ex. paysage/photo), on enrichit `SaisieBanc` + le mapping
 * dans CE fichier, sans retoucher la chaîne UI ni la route.
 *
 * MODULE PUR & CLIENT-SAFE : aucune dépendance serveur, aucun accès BDD, aucun IA. Les fonctions de
 * transport (localStorage, clé JETABLE) sont des enveloppes gardées `typeof window` autour du mapping pur.
 * localStorage (et NON sessionStorage) est OBLIGATOIRE : le bouton « Test » ouvre le banc dans un NOUVEL
 * onglet (`window.open`), or sessionStorage est cloisonné par onglet (l'onglet ouvert ne le verrait pas) ;
 * localStorage est partagé même-origine entre onglets. La clé est PURGÉE dès sa lecture côté banc (jetable) ;
 * une clé résiduelle (onglet jamais monté) est de toute façon écrasée au prochain clic. Jamais d'URL/historique.
 *
 * INVARIANTS respectés :
 *  • Le point stocké (`lat`/`lon`) est BRUT (pré-snap). La prod snappe la façade en `semi_auto` ; c'est donc
 *    `semi_auto` qui reproduit l'origine réellement analysée. Le rejeu force TOUJOURS `semi_auto` (jamais
 *    `manuel`, qui utiliserait le point brut sans snap → géométrie différente du calcul d'origine).
 *  • `azimut_deg` et `hauteur_sous_plafond_m` sont des `numeric` PostgreSQL → renvoyés en CHAÎNES par le
 *    driver `pg`. Le banc EXIGE des `number` (une chaîne sur l'azimut = 400 ; sur la hauteur = repli
 *    silencieux au défaut). On COERCE donc en nombre fini ici, une fois pour toutes.
 *  • Dossier antérieur à la migration 026 (`azimut_deg` NULL) = analyse NON REJOUABLE → `null` (l'appelant
 *    désactive le bouton, aucun 400 déclenché).
 *  • La photo n'entre JAMAIS dans le verdict (Famille 2 du score seulement). Ce pont ne transporte AUCUNE
 *    donnée photo aujourd'hui ; le point d'extension ci-dessous ne doit jamais ouvrir de porte photo→verdict.
 */
import { HAUTEUR_SOUS_PLAFOND_DEFAUT_M, type ModeOrigine } from "../svv/config";

/** Clé de handoff JETABLE en localStorage (versionnée : un changement de forme incrémente le suffixe). */
export const CLE_HANDOFF_BANC = "svv.banc.rejeu.v1";

/**
 * Intrants GÉOMÉTRIQUES d'une analyse rejouable — sous-ensemble de `ParametresSaisie` (banc) : point,
 * azimut, étage, hauteur sous plafond, dernier étage, mode. Volontairement SANS photo/paysage (cf. en-tête).
 *
 * EXTENSION FUTURE (documentée, NON câblée) : quand `internaute_projet` stockera des données de paysage/photo,
 * ajouter le(s) champ(s) ICI, les remplir dans `projetVersSaisieBanc`, puis les consommer côté `BancSaisie`.
 * Tant qu'un consommateur ne lit pas un champ, il est ignoré sans erreur (compat ascendante par construction).
 */
export interface SaisieBanc {
  point: { lat: number; lon: number };
  azimutPrincipalDeg: number;
  etage: number;
  hauteurSousPlafondM: number;
  dernierEtage: boolean;
  mode: ModeOrigine;
}

/** Coerce une valeur (number | chaîne numérique `pg` | null | '' | garbage) en nombre fini, sinon `null`. */
function nombreFini(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

/**
 * Mapping PUR : une ligne `internaute_projet` (brute, telle que renvoyée par `lireProfilComplet`) → intrants
 * du banc. Renvoie `null` si l'analyse n'est pas rejouable (point ou axe manquant), auquel cas l'appelant
 * désactive le déclenchement (aucun appel banc, aucun 400).
 */
export function projetVersSaisieBanc(projet: Record<string, unknown>): SaisieBanc | null {
  const lat = nombreFini(projet.lat);
  const lon = nombreFini(projet.lon);
  const azimut = nombreFini(projet.azimut_deg); // numeric pg → chaîne ; NULL (pré-026) → null = non rejouable
  // Le banc EXIGE lat/lon/azimut en `number`. Sans l'un d'eux → non rejouable (fail-safe, pas d'appel).
  if (lat === null || lon === null || azimut === null) return null;
  const hsp = nombreFini(projet.hauteur_sous_plafond_m); // numeric pg → chaîne ; NULL → repli défaut moteur
  return {
    point: { lat, lon },
    azimutPrincipalDeg: azimut,
    etage: nombreFini(projet.etage) ?? 0,
    // NULL/≤0 (dossier ancien) → défaut 2,50 m (même repli que `config.hauteurVision`), jamais 0 m.
    hauteurSousPlafondM: hsp !== null && hsp > 0 ? hsp : HAUTEUR_SOUS_PLAFOND_DEFAUT_M,
    dernierEtage: projet.dernier_etage === true,
    mode: "semi_auto", // rejeu fidèle : point brut + snap façade = origine analysée (voir en-tête)
  };
}

/** Parse défensif d'un handoff sérialisé (localStorage) → `SaisieBanc` valide, sinon `null`. */
export function parseHandoff(raw: string | null): SaisieBanc | null {
  if (!raw) return null;
  let o: unknown;
  try {
    o = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!o || typeof o !== "object") return null;
  const r = o as Record<string, unknown>;
  const pt = r.point;
  if (!pt || typeof pt !== "object") return null;
  const lat = nombreFini((pt as Record<string, unknown>).lat);
  const lon = nombreFini((pt as Record<string, unknown>).lon);
  const az = nombreFini(r.azimutPrincipalDeg);
  const et = nombreFini(r.etage);
  const hsp = nombreFini(r.hauteurSousPlafondM);
  if (lat === null || lon === null || az === null || et === null || hsp === null) return null;
  return {
    point: { lat, lon },
    azimutPrincipalDeg: az,
    etage: et,
    hauteurSousPlafondM: hsp,
    dernierEtage: r.dernierEtage === true,
    mode: r.mode === "manuel" ? "manuel" : "semi_auto", // on n'écrit que semi_auto ; toléré en lecture par prudence
  };
}

/** Dépose les intrants de rejeu en localStorage, clé jetable (transport hors URL : aucune position en historique/logs).
 *  localStorage (pas sessionStorage) car le banc s'ouvre dans un NOUVEL onglet qui ne partage pas le sessionStorage. */
export function ecrireHandoffBanc(saisie: SaisieBanc): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(CLE_HANDOFF_BANC, JSON.stringify(saisie));
  } catch {
    /* quota / navigation privée : le banc s'ouvrira vierge, aucun crash */
  }
}

/** Lit (sans consommer) le handoff éventuel. `null` si absent/illisible. La purge est faite par l'appelant (jetable). */
export function lireHandoffBanc(): SaisieBanc | null {
  if (typeof window === "undefined") return null;
  try {
    return parseHandoff(window.localStorage.getItem(CLE_HANDOFF_BANC));
  } catch {
    return null;
  }
}

/** Vide la clé de handoff jetable (à appeler dès consommation côté banc : refresh/navigation directe → banc vierge). */
export function viderHandoffBanc(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(CLE_HANDOFF_BANC);
  } catch {
    /* no-op */
  }
}
