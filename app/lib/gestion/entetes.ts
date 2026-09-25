/**
 * MODULE « GESTION » — LOT 5-DEST : LIRE UN BLOC D'EN-TÊTES BRUT. Module PUR (aucune I/O, aucune base, aucun réseau).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * POURQUOI CE FICHIER EXISTE. La capture ordinaire télécharge la SOURCE du message et la confie à `simpleParser`
 * (mailparser), qui rend les en-têtes déjà rangés. La complétion, elle, ne télécharge RIEN de tout ça : elle demande au
 * serveur les quatre lignes `To` / `Cc` / `Bcc` / `Reply-To` et rien d'autre (`BODY.PEEK[HEADER.FIELDS (…)]`). Le
 * serveur rend alors un bloc d'en-têtes BRUT, tel qu'il est écrit dans le message — il faut donc le lire soi-même.
 *
 * ⚠️ LE REPLIEMENT (« folding ») N'EST PAS UN DÉTAIL. La norme autorise à couper une ligne d'en-tête longue et à
 * continuer à la suivante, pourvu que celle-ci commence par une espace ou une tabulation. Une liste de vingt
 * destinataires arrive presque toujours ainsi. Lire ligne à ligne sans recoller, c'est perdre dix-neuf destinataires
 * sur vingt — silencieusement, et en croyant avoir lu.
 *
 * ⚠️ DEUX LIGNES DE MÊME NOM : ON GARDE LA DERNIÈRE. C'est exactement ce que fait la capture ordinaire, où les en-têtes
 * sont rangés dans un objet (un nom → une valeur, cf. `adresses.ts`). Rarissime, et hors sujet ici : ce lot COMPLÈTE
 * l'existant, il ne doit surtout pas lire autrement que lui — deux lectures divergentes du même message seraient pires
 * que le trou qu'on comble.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */

/** Les quatre en-têtes demandés au serveur, et eux seuls. Le corps et les pièces ne sont JAMAIS téléchargés. */
export const CHAMPS_DESTINATAIRES = ['to', 'cc', 'bcc', 'reply-to'] as const;

/**
 * Analyse un bloc d'en-têtes brut en `{ nom minuscule → valeur }`.
 *
 * Les lignes de continuation (commençant par une espace ou une tabulation) sont RECOLLÉES à la précédente, en
 * remplaçant le saut de ligne par une espace — c'est ce que prescrit la norme, et c'est ce qui rend une longue liste de
 * destinataires lisible d'un seul tenant. Une ligne sans deux-points, hors continuation, est ignorée : mieux vaut
 * écarter une ligne incompréhensible que fabriquer un en-tête qui n'existe pas. PUR.
 */
export function analyserBlocEntetes(brut: string): Record<string, string> {
  const out: Record<string, string> = {};
  let nomCourant: string | null = null;
  let valeurCourante = '';

  const poser = (): void => {
    if (nomCourant !== null) out[nomCourant] = valeurCourante.trim();
    nomCourant = null;
    valeurCourante = '';
  };

  for (const ligne of brut.split(/\r?\n/)) {
    if (ligne === '') continue; // ligne vide : fin du bloc d'en-têtes (et le corps n'a jamais été demandé)
    if (/^[ \t]/.test(ligne)) {
      // CONTINUATION — elle appartient à l'en-tête précédent. Hors de tout en-tête, elle ne veut rien dire : on l'ignore.
      if (nomCourant !== null) valeurCourante += ` ${ligne.trim()}`;
      continue;
    }
    const sep = ligne.indexOf(':');
    if (sep <= 0) { poser(); continue; } // pas un en-tête : on ferme le précédent et on passe
    poser();
    nomCourant = ligne.slice(0, sep).trim().toLowerCase();
    valeurCourante = ligne.slice(sep + 1);
  }
  poser();
  return out;
}
