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

export interface CertificatPublic {
  numero: string;
  emisLe: string; // ISO 8601 (date d'émission)
  verdict: string; // SANS_VIS_A_VIS (seul verdict émis)
  adresse: string | null;
  etage: number | null;
}

export type ResultatVerification =
  | { statut: 'numero_invalide' } // format du numéro non conforme → rejet propre, sans toucher la base
  | { statut: 'inexistant' } // numéro bien formé mais absent
  | { statut: 'sans_compte' } // numéro réel MAIS certificat one-shot (non rattaché à un compte) → JAMAIS authentifiable en ligne
  | { statut: 'existe' } // numéro réel, jeton absent ou faux → on ne révèle QUE l'existence
  | { statut: 'verifie'; certificat: CertificatPublic }; // bon jeton → contenu minimal de comparaison

interface LigneVerif {
  numero: string;
  emis_le: Date;
  verdict: string;
  adresse: string | null;
  etage: number | null;
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

  // Lecture seule réelle. On ne lit QUE les 5 champs publics + le jeton (comparaison) + un booléen d'appartenance à un
  // compte (jamais aucune donnée du compte : seul l'EXISTS binaire sort). SELECT sur UNE ligne (routage de test inchangé).
  const ligne = await withTransaction(async (q) => {
    await q('SET TRANSACTION READ ONLY'); // 1re instruction : verrouille la transaction en lecture seule
    const r = await q<LigneVerif>(
      `SELECT numero, emis_le, verdict, adresse, etage, jeton_verification, EXISTS (SELECT 1 FROM internaute_auth ia JOIN internaute_projet ip ON ip.internaute_id = ia.internaute_id WHERE ip.id = certificat.projet_id) AS a_un_compte FROM certificat WHERE numero = $1`,
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

  // Bon jeton → CONTENU MINIMAL (5 champs). Le jeton n'est JAMAIS recopié dans la sortie.
  return {
    statut: 'verifie',
    certificat: {
      numero: ligne.numero,
      emisLe: ligne.emis_le.toISOString(),
      verdict: ligne.verdict,
      adresse: ligne.adresse,
      etage: ligne.etage,
    },
  };
}
