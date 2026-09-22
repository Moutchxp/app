/**
 * IDENTIFICATION DU CLIENT pour la limitation de cadence.
 *
 * ── Le piège ────────────────────────────────────────────────────────────────────────────────────
 * Derrière le tunnel cloudflared (et demain derrière Cloudflare), toutes les requêtes arrivent de la
 * BOUCLE LOCALE : l'adresse de transport ne distingue plus personne. La vraie adresse du visiteur n'est
 * que dans un EN-TÊTE (`CF-Connecting-IP`, `X-Forwarded-For`) — or un en-tête est écrit par le client.
 * Faire confiance à un en-tête sans savoir d'où vient la requête, c'est offrir à un robot le moyen de se
 * forger une adresse DIFFÉRENTE À CHAQUE REQUÊTE, donc de n'être jamais compté. La limitation
 * deviendrait décorative.
 *
 * ── La contrainte ───────────────────────────────────────────────────────────────────────────────
 * Next 16 n'expose PAS l'adresse du socket : `NextRequest.ip` et `geo` ont été RETIRÉS en v15
 * (`node_modules/next/dist/docs/01-app/03-api-reference/04-functions/next-request.md:123`). Le code
 * applicatif ne peut donc pas VÉRIFIER lui-même que la requête vient d'un mandataire de confiance.
 *
 * ── La règle retenue ────────────────────────────────────────────────────────────────────────────
 * La confiance est DÉCLARÉE PAR L'EXPLOITANT, jamais déduite : l'en-tête n'est lu que si la variable
 * `CADENCE_ENTETE_IP` le nomme (ex. `CADENCE_ENTETE_IP=cf-connecting-ip` une fois le trafic passé
 * derrière un tunnel Cloudflare NOMMÉ, qui réécrit cet en-tête et écrase celui du client).
 * Variable ABSENTE (cas actuel, développement et tunnel rapide) → AUCUN en-tête n'est cru, et tous les
 * visiteurs sans compte partagent un seau commun (`SUJET_PARTAGE`). C'est plus strict que nécessaire,
 * et c'est le bon sens de la sécurité : à défaut de savoir qui parle, on ne laisse pas l'inconnu
 * choisir son identité. Un titulaire de compte, lui, est toujours compté par son COMPTE — jamais par
 * une adresse — et n'est donc pas concerné par ce repli.
 *
 * ⚠️ Ne jamais remplacer cette règle par « lire X-Forwarded-For si présent » : c'est exactement
 * l'usurpation que le test `ip.test.ts` interdit.
 */

/** Sujet de repli quand aucune adresse ne peut être établie de façon sûre. */
export const SUJET_PARTAGE = 'partage:sans-mandataire-de-confiance';

/** Nom de l'en-tête à croire, déclaré par l'exploitant. Vide/absent = on ne croit AUCUN en-tête. */
function enteteDeConfiance(): string | null {
  const v = (process.env.CADENCE_ENTETE_IP ?? '').trim().toLowerCase();
  return v === '' ? null : v;
}

/**
 * Première valeur utile d'un en-tête d'adresse. `X-Forwarded-For` est une LISTE « client, proxy1, … » :
 * le premier élément est le client tel que vu par le mandataire le plus proche de lui.
 */
function premiereAdresse(valeur: string): string | null {
  const brut = valeur.split(',')[0]?.trim() ?? '';
  if (brut === '' || brut.length > 45) return null; // 45 = longueur max d'une IPv6 textuelle
  // On n'accepte QUE ce qui ressemble à une adresse : chiffres, lettres hexa, points, deux-points, crochets.
  return /^[0-9a-fA-F.:[\]%]+$/.test(brut) ? brut.toLowerCase() : null;
}

/**
 * Sujet de comptage d'un visiteur SANS compte. Rend l'adresse déclarée par le mandataire de confiance,
 * ou `SUJET_PARTAGE` si aucune confiance n'est établie.
 */
export function sujetVisiteur(requete: Request): string {
  const entete = enteteDeConfiance();
  if (entete === null) return SUJET_PARTAGE; // aucun mandataire déclaré → aucun en-tête n'est cru
  const valeur = requete.headers.get(entete);
  if (valeur === null) return SUJET_PARTAGE; // mandataire déclaré mais en-tête absent → on ne devine pas
  return premiereAdresse(valeur) ?? SUJET_PARTAGE;
}
