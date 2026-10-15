/**
 * ══ AUDIT POINT 6 (15/10/2026) — UNE REQUÊTE QUI MODIFIE DOIT VENIR DE L'ADMIN ELLE-MÊME ════════════════════════════════
 *
 * Le cookie de session est SameSite=Strict : il n'est pas envoyé depuis un AUTRE site. Mais tous les sous-domaines de
 * sansvisavis.com sont, pour le navigateur, le « même site » : une faille sur l'un d'eux (un blog, une page de test) aurait
 * pu faire envoyer à l'admin des actions authentifiées. On exige donc la MÊME ORIGINE pour toute requête qui modifie.
 *
 * Règle (requêtes autres que GET / HEAD / OPTIONS) :
 *  · `Sec-Fetch-Site` présent (tous les navigateurs actuels) : seuls `same-origin` et `none` (saisie directe) passent ;
 *    `same-site` (un autre sous-domaine) et `cross-site` sont refusés ;
 *  · sinon `Origin` présent : son NOM D'HÔTE doit être celui de la requête (`Host`). Le protocole n'est pas comparé :
 *    derrière Caddy, l'application reçoit du http pour une page servie en https. `Origin: null` est refusé ;
 *  · ni l'un ni l'autre : ce n'est pas un navigateur (script, curl) — une requête forgée par un site suppose un navigateur,
 *    qui envoie toujours l'un des deux sur une requête qui modifie. La session décide, comme avant.
 * PUR : aucun import.
 */

const METHODES_LECTURE = new Set(['GET', 'HEAD', 'OPTIONS']);

export function origineAutorisee(methode: string, entetes: Headers): boolean {
  if (METHODES_LECTURE.has(methode.toUpperCase())) return true;
  const site = entetes.get('sec-fetch-site')?.trim().toLowerCase();
  if (site) return site === 'same-origin' || site === 'none';
  const origine = entetes.get('origin')?.trim();
  if (!origine) return true;
  const hote = entetes.get('host')?.trim().toLowerCase();
  if (!hote || origine === 'null') return false;
  try {
    return new URL(origine).host.toLowerCase() === hote;
  } catch {
    return false;
  }
}
