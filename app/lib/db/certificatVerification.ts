import { createHash, timingSafeEqual } from 'node:crypto';
import { withTransaction } from './client';

/**
 * VÉRIFICATION PUBLIQUE d'un certificat (cœur sémantique, SANS écran ni route HTTP — ceux-ci viennent après).
 *
 * Entrée : un numéro (obligatoire) + un jeton (optionnel). Sortie : ce que le PUBLIC a le droit de savoir, et RIEN
 * de plus. Deux niveaux d'information, séparés par le jeton de la 038 :
 *  - SANS jeton, ou jeton FAUX → on ne révèle QUE l'EXISTENCE (« ce numéro existe / n'existe pas »). Le numéro est
 *    SÉQUENTIEL donc énumérable : tout ce qu'on rend à ce niveau, un scrapeur le récolte sur TOUTE la série → on
 *    ne rend donc rien d'autre que le fait binaire.
 *  - AVEC le bon jeton (= en tenant le document) → un CONTENU MINIMAL de comparaison avec le papier, arbitré par
 *    Arno : numéro, date d'émission, verdict, adresse, étage. RIEN d'autre. Pas de nom (la table n'en porte pas ;
 *    on vérifie un LOGEMENT, pas une personne), pas de lat/lon, pas de score, pas de distance, pas de snapshot.
 *    Minimisation : on rend ce qui sert à détecter une FRAUDE, pas ce qu'on a sous la main.
 *
 * MINIMISATION JUSQU'À LA REQUÊTE : le SELECT ne lit QUE les 5 champs publics + le jeton (pour comparer). lat/lon,
 * score, distance, resultat… ne QUITTENT JAMAIS la base — garantie de non-fuite au niveau le plus fort.
 *
 * LECTURE SEULE RÉELLE : `SET TRANSACTION READ ONLY` (convention du projet, cf. analytics/lecture/requete.ts) →
 * ce module ne peut écrire, même par accident. Aucun log : ni le jeton, ni la ligne, n'apparaissent nulle part.
 */

/** Format du numéro — MIROIR du CHECK `certificat.numero` (031). Un numéro mal formé est rejeté AVANT tout accès base. */
const REGEXP_NUMERO = /^SAVV-[0-9]{4}-[0-9]{6}$/;

/** Format de la référence publique — MIROIR du CHECK `certificat.reference` (039, Crockford SANS I/L/O/U). Rejetée AVANT base. */
const REGEXP_REFERENCE = /^SVAV-[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}$/;

export interface CertificatPublic {
  numero: string;
  emisLe: string; // ISO 8601 (date d'émission)
  verdict: string; // SANS_VIS_A_VIS (seul verdict émis)
  adresse: string | null; // RÉSERVÉE à ce statut `verifie` (jeton) — jamais dans `visuel_verifie`
  etage: number | null;
  score: number | null; // score de vue /100 (comme la voie référence)
  descriptif: DescriptifVisuel; // MÊME descriptif que le set visuel (le détenteur voit AU MOINS autant que le public)
}

/** Descriptif NON NOMINATIF du bien pour le SET VISUEL (jamais d'adresse, ni lat/lon, ni nom). `ville` et `exterieur` sont
 *  lus du snapshot `certificat.resultat.visuel` (figés à l'émission, Commit 1) → NULL pour les certificats émis AVANT ce
 *  figement (tolérance). Les autres champs viennent des colonnes directes du snapshot. Pas de « chambres » (aucune source). */
export interface DescriptifVisuel {
  ville: string | null;
  typeBien: string | null;
  surfaceM2: number | null;
  pieces: number | null;
  anneeOuEpoque: string | null;
  etage: number | null;
  dernierEtage: boolean | null;
  exterieur: string | null;
}

/** SET VISUEL : ce que le VISUEL d'annonce révèle, débloqué par la RÉFÉRENCE SEULE (clé publique 40 bits non énumérable).
 *  JAMAIS d'adresse. Minimisation identique à la voie numéro : seul ce qui sert au visuel sort de la base. */
export interface SetVisuel {
  reference: string;
  verdict: string;
  score: number | null;
  descriptif: DescriptifVisuel;
}

/** Colonnes du snapshot `certificat` qui composent le descriptif — PARTAGÉES par les deux voies (numéro + jeton ET
 *  référence). `visuel_*` viennent du jsonb `resultat.visuel` (figé à l'émission ; NULL pour les certificats antérieurs). */
interface ColonnesDescriptif {
  type_bien: string | null;
  surface_m2: string | null; // numeric → string (driver pg)
  nb_pieces: number | null;
  annee_batiment: number | null;
  epoque: string | null;
  etage: number | null;
  dernier_etage: boolean | null;
  visuel_exterieur: string | null;
  visuel_ville: string | null;
}

/** Descriptif → forme publique. UNE seule source de mapping pour `verifie` et `visuel_verifie` (aucune duplication). */
function mapDescriptif(l: ColonnesDescriptif): DescriptifVisuel {
  return {
    ville: l.visuel_ville, // figé à l'émission (jsonb) ; NULL pour les certificats antérieurs au figement (tolérance)
    typeBien: l.type_bien,
    surfaceM2: l.surface_m2 === null ? null : Number(l.surface_m2),
    pieces: l.nb_pieces,
    anneeOuEpoque: l.annee_batiment !== null ? String(l.annee_batiment) : l.epoque,
    etage: l.etage,
    dernierEtage: l.dernier_etage,
    exterieur: l.visuel_exterieur, // figé à l'émission (jsonb) ; NULL si absent (tolérance)
  };
}

export type ResultatVerification =
  | { statut: 'numero_invalide' } // format du numéro non conforme → rejet propre, sans toucher la base
  | { statut: 'reference_invalide' } // format de la référence non conforme → rejet propre, sans toucher la base
  | { statut: 'inexistant' } // numéro/référence bien formé(e) mais absent(e)
  | { statut: 'sans_compte' } // certificat one-shot (non rattaché à un compte) → JAMAIS authentifiable en ligne
  | { statut: 'existe' } // numéro réel, jeton absent ou faux → on ne révèle QUE l'existence
  | { statut: 'verifie'; certificat: CertificatPublic } // bon jeton → contenu minimal de comparaison (voie numéro)
  | { statut: 'visuel_verifie'; visuel: SetVisuel }; // référence valide d'un compte → set visuel (voie référence, sans jeton)

interface LigneVerif extends ColonnesDescriptif {
  numero: string;
  emis_le: Date;
  verdict: string;
  adresse: string | null;
  score: string | null; // numeric → string (driver pg)
  jeton_verification: string;
  a_un_compte: boolean; // EXISTS(internaute_auth via internaute_projet) — gate d'authentifiabilité en ligne (défense en profondeur)
}

/** SHA-256 d'une chaîne (UTF-8) → digest de 32 octets. Sert la comparaison à longueur fixe (voir `jetonEgal`). */
function sha256(s: string): Buffer {
  return createHash('sha256').update(s, 'utf8').digest();
}

/**
 * Normalise un jeton SAISI (le QR peut échouer, quelqu'un tapera l'URL à la main) → forme canonique de la 038 :
 * on retire espaces/tirets, on passe en MAJUSCULES, et on applique la lecture Crockford tolérante (I/L → 1, O → 0).
 * La base stocke la forme canonique majuscule ; la normalisation est ICI (le schéma ne s'en occupe pas, cf. 038).
 * Renvoie `null` pour une entrée non exploitable (le certificat ne sera alors pas dévoilé).
 */
function normaliserJeton(brut: unknown): string | null {
  if (typeof brut !== 'string') return null;
  const s = brut
    .replace(/[\s-]/g, '')
    .toUpperCase()
    .replace(/[IL]/g, '1')
    .replace(/O/g, '0');
  return s.length > 0 ? s : null;
}

/**
 * Comparaison du jeton en TEMPS CONSTANT. Choix : `timingSafeEqual` sur les SHA-256 des deux jetons (idiome déjà
 * employé dans `admin/password.ts`), PAS un `===`. Raison : le jeton garde une décision de DIVULGATION sur un
 * endpoint keyé par numéro ; un `===` court-circuite au 1er caractère différent → un oracle de timing permettrait
 * de reconstruire le jeton caractère par caractère (80 bits ramenés à ~16×32 essais). Le hachage préalable donne
 * deux entrées de longueur fixe (32 o) → pas d'exception de longueur, et ne révèle NI la longueur NI le préfixe.
 * Ce n'est pas de la sécurité de façade (le risque est réel sur une surface publique), ni un excès (coût nul).
 */
function jetonEgal(recu: string, stocke: string): boolean {
  return timingSafeEqual(sha256(recu), sha256(stocke));
}

/**
 * Vérifie un certificat. Ne throw pas pour les cas métier (statuts). Lecture seule stricte. Le jeton reçu n'est
 * jamais journalisé ni renvoyé ; le jeton stocké non plus.
 */
export async function verifierCertificat(numeroBrut: unknown, jetonBrut?: unknown): Promise<ResultatVerification> {
  // Numéro : normalisé (majuscules, trim) puis validé AVANT toute requête — un numéro mal formé ne touche pas la base.
  const numero = typeof numeroBrut === 'string' ? numeroBrut.trim().toUpperCase() : '';
  if (!REGEXP_NUMERO.test(numero)) return { statut: 'numero_invalide' };

  // Lecture seule réelle. On lit les 5 champs publics (dont adresse, réservée à ce statut) + le jeton (comparaison) + le
  // score + les colonnes du descriptif (mêmes que la voie référence) + le booléen de compte. AUCUNE colonne nominative
  // (nom, e-mail, téléphone, lat, lon). SELECT sur UNE ligne (routage de test inchangé).
  const ligne = await withTransaction(async (q) => {
    await q('SET TRANSACTION READ ONLY'); // 1re instruction : verrouille la transaction en lecture seule
    const r = await q<LigneVerif>(
      `SELECT numero, emis_le, verdict, adresse, etage, jeton_verification, score, type_bien, surface_m2, nb_pieces, annee_batiment, epoque, dernier_etage, resultat->'visuel'->>'exterieur' AS visuel_exterieur, resultat->'visuel'->>'ville' AS visuel_ville, EXISTS (SELECT 1 FROM internaute_auth ia JOIN internaute_projet ip ON ip.internaute_id = ia.internaute_id WHERE ip.id = certificat.projet_id) AS a_un_compte FROM certificat WHERE numero = $1`,
      [numero],
    );
    return r.rows[0] ?? null;
  });

  if (!ligne) return { statut: 'inexistant' };

  // DÉFENSE EN PROFONDEUR : un certificat one-shot (non rattaché à un compte) n'est JAMAIS authentifiable en ligne — même
  // avec numéro + jeton corrects. On tranche AVANT toute comparaison de jeton et on ne renvoie AUCUN des 5 champs (ni le
  // jeton). `!== true` (pas seulement `=== false`) : fail-closed sur toute valeur non strictement true.
  if (ligne.a_un_compte !== true) return { statut: 'sans_compte' };

  // Jeton absent ou faux → on ne révèle QUE l'existence (jamais un détail).
  const jetonNormalise = normaliserJeton(jetonBrut);
  if (!jetonNormalise || !jetonEgal(jetonNormalise, ligne.jeton_verification)) {
    return { statut: 'existe' };
  }

  // Bon jeton → contenu du détenteur : les 5 champs (dont adresse) + score + descriptif complet. Le jeton n'est JAMAIS
  // recopié dans la sortie. Le détenteur voit AU MOINS ce que le public (visuel) voit — jamais moins.
  return {
    statut: 'verifie',
    certificat: {
      numero: ligne.numero,
      emisLe: ligne.emis_le.toISOString(),
      verdict: ligne.verdict,
      adresse: ligne.adresse,
      etage: ligne.etage,
      score: ligne.score === null ? null : Number(ligne.score),
      descriptif: mapDescriptif(ligne),
    },
  };
}

/** Ligne du SET VISUEL — colonnes DIRECTES du snapshot `certificat`. JAMAIS d'adresse, lat/lon, nom ni jeton (non lus). */
interface LigneVisuel extends ColonnesDescriptif {
  reference: string;
  verdict: string;
  score: string | null; // numeric → string (driver pg)
  a_un_compte: boolean;
}

/** Normalise une référence SAISIE → canonique 039 (trim, MAJUSCULES, lecture Crockford I/L→1, O→0). Les tirets sont
 *  CONSERVÉS (`SVAV-XXXX-XXXX`). `null` pour une entrée non exploitable. */
function normaliserReference(brut: unknown): string | null {
  if (typeof brut !== 'string') return null;
  const s = brut.trim().toUpperCase().replace(/[IL]/g, '1').replace(/O/g, '0');
  return s.length > 0 ? s : null;
}

/**
 * VÉRIFICATION PAR RÉFÉRENCE (voie du VISUEL d'annonce). Fonction sœur de `verifierCertificat`, SANS jeton : la référence
 * est une clé publique aléatoire 40 bits (NON énumérable) → elle suffit à débloquer un SET NON NOMINATIF (verdict, score,
 * descriptif — JAMAIS l'adresse). Ordre strict : reference_invalide → inexistant → sans_compte → visuel_verifie.
 * MÊME gate compte que la voie numéro (défense en profondeur : un one-shot n'est jamais authentifiable). Lecture seule.
 */
export async function verifierParReference(refBrut: unknown): Promise<ResultatVerification> {
  const reference = normaliserReference(refBrut);
  if (!reference || !REGEXP_REFERENCE.test(reference)) return { statut: 'reference_invalide' };

  // Minimisation à la requête : on ne lit QUE les colonnes du set visuel + le booléen de compte. AUCUNE colonne
  // nominative (adresse, lat, lon, nom, jeton_verification) n'est sélectionnée → non-fuite garantie au niveau le plus fort.
  const ligne = await withTransaction(async (q) => {
    await q('SET TRANSACTION READ ONLY');
    const r = await q<LigneVisuel>(
      // `visuel_*` lus du jsonb figé à l'émission (Commit 1). Sur un certificat émis AVANT, la clé `visuel` est absente →
      // `->>` renvoie NULL → tolérance (exterieur/ville = null), aucune erreur. AUCUNE colonne nominative. SELECT sur UNE
      // ligne (routage de test inchangé, comme la voie numéro).
      `SELECT reference, verdict, score, type_bien, surface_m2, nb_pieces, annee_batiment, epoque, etage, dernier_etage, resultat->'visuel'->>'exterieur' AS visuel_exterieur, resultat->'visuel'->>'ville' AS visuel_ville, EXISTS (SELECT 1 FROM internaute_auth ia JOIN internaute_projet ip ON ip.internaute_id = ia.internaute_id WHERE ip.id = certificat.projet_id) AS a_un_compte FROM certificat WHERE reference = $1`,
      [reference],
    );
    return r.rows[0] ?? null;
  });

  if (!ligne) return { statut: 'inexistant' };
  if (ligne.a_un_compte !== true) return { statut: 'sans_compte' }; // one-shot → jamais de set visuel (fail-closed)

  return {
    statut: 'visuel_verifie',
    visuel: {
      reference: ligne.reference,
      verdict: ligne.verdict,
      score: ligne.score === null ? null : Number(ligne.score),
      descriptif: mapDescriptif(ligne), // MÊME mapping que la voie numéro (aucune duplication) — comportement inchangé
    },
  };
}
