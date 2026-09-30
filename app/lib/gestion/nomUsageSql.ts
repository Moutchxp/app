import { nomUsageDisponible } from './schema';

/**
 * ══ 🔴🔴 LOT NOM-UNIQUE-DES-PIECES — LE REPLI « NOM D'USAGE, SINON NOM D'ORIGINE », ÉCRIT UNE FOIS ════════════
 *
 * `nom_fichier` est lu à SOIXANTE-CINQ endroits du module. Recopier le `coalesce` partout aurait donné
 * soixante-cinq occasions d'en oublier un — et un seul oubli suffit pour qu'une pièce renommée reparaisse sous
 * son ancien nom quelque part, ce qui est exactement le défaut que ce lot répare.
 *
 * 🔴 LA COLONNE N'EST NOMMÉE QUE SI ELLE EXISTE. Sans la migration 286, ce fragment rend `p.nom_fichier` tout
 * court : les requêtes sont alors mot pour mot celles d'avant ce lot. Nommer une colonne absente ferait échouer
 * la lecture des pièces ENTIÈRE, donc l'affichage de tout le courrier. Règle du module depuis le lot 4a.
 *
 * ⚠️ `nullif(btrim(…), '')` ET PAS UN SIMPLE `coalesce` : une chaîne blanche en base (un jour, par accident) ne
 * doit pas faire disparaître le nom d'une pièce à l'écran. Un nom vide n'est pas un nom.
 */
export async function sqlNomAffiche(alias = 'p'): Promise<string> {
  return (await nomUsageDisponible())
    ? `coalesce(nullif(btrim(${alias}.nom_usage), ''), ${alias}.nom_fichier)`
    : `${alias}.nom_fichier`;
}

/**
 * LE NOM D'ORIGINE, TOUJOURS DISPONIBLE. PUR (une chaîne de SQL).
 *
 * ⚠️ IL NE DÉPEND D'AUCUNE SONDE : `nom_fichier` existe depuis la création de la table, et c'est justement ce qui
 * en fait une valeur sûre. On le nomme explicitement pour que les écrans puissent dire « reçue sous : … » sans
 * avoir à savoir si la migration est là.
 */
export function sqlNomOrigine(alias = 'p'): string {
  return `${alias}.nom_fichier`;
}

/**
 * ══ 🔴 LA RECHERCHE TROUVE LA PIÈCE PAR SES DEUX NOMS ══════════════════════════════════════════════════════════
 *
 * Arno : « La recherche trouve la pièce par son nom d'usage ET par son nom d'origine. »
 *
 * 🔴 LES DEUX, ET C'EST LE POINT. On cherche une pièce sous le nom qu'on lui a donné (« Quittance juillet »),
 * mais aussi sous celui du correspondant (« scan_0042 ») quand c'est ce dont on se souvient — ou quand on l'a lu
 * dans le mail, qui n'a pas changé. N'en garder qu'un rendrait la pièce introuvable une fois sur deux.
 *
 * ⚠️ RENDU COMME UNE EXPRESSION DE TEXTE, pas comme un prédicat : l'appelant y applique sa propre comparaison
 * (`ILIKE`, `unaccent`, ce qu'il utilise déjà). Imposer la comparaison ici obligerait à la tenir à jour à deux
 * endroits.
 */
export async function sqlNomsCherchables(alias = 'p'): Promise<string> {
  return nomsCherchablesAvec(await nomUsageDisponible(), alias);
}

/**
 * LE MÊME FRAGMENT, SYNCHRONE, pour les modules PURS. PUR.
 *
 * ⚠️ `rechercheBoite.conditions` EST PUR ET DOIT LE RESTER : c'est ce qui permet d'éprouver tout le prédicat de
 * recherche sans base. Il reçoit donc la réponse de la sonde en paramètre, comme il reçoit déjà `spamConnu` et
 * `corbeilleConnue` — patron de ce module depuis le lot BOITE-INTERNE-CORBEILLE.
 */
export function nomsCherchablesAvec(avecNomUsage: boolean, alias = 'p'): string {
  return avecNomUsage
    ? `concat_ws(' ', ${alias}.nom_fichier, ${alias}.nom_usage)`
    : `${alias}.nom_fichier`;
}
