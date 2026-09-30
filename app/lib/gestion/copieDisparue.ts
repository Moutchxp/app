/**
 * ══ 🔴🔴 UNE COPIE DU REGISTRE A DISPARU DU DRIVE. Module PUR (aucune base, aucun réseau). ═══════════════════
 *
 * 🔴 ARNO (01/10/2026) : « l'app ne doit pas trébucher quand une copie de son registre a disparu du Drive (404 à
 * la relecture de nom, au rangement ou à l'aperçu) : marque la copie “disparue” dans le registre, cesse de la
 * relire, utilise les autres copies, et n'affiche jamais d'erreur à Arno pour ça. »
 *
 * ═══ 🔴 CE QUI COMPTE COMME « DISPARUE », ET CE QUI N'EN EST PAS ════════════════════════════════════════════
 *
 * · **404** — le fichier n'existe plus. C'est le cas d'Arno : il supprime ses fichiers d'essai à la main.
 * · **403** — le fichier existe, mais nous n'avons plus le droit de le lire. Pour nous, le résultat est le même
 *   (cette copie ne sert plus à rien), et laisser l'application la relire éternellement ne la ferait pas
 *   revenir. On la marque donc aussi, AVEC SON MOTIF : les deux ne se réparent pas pareil, et le journal doit
 *   permettre de les distinguer.
 * · **429, 500, 503, un réseau coupé** — NE SONT PAS des disparitions. Google est occupé ou muet ; le fichier,
 *   lui, est probablement là. Marquer sur un 503 effacerait du registre une copie parfaitement vivante, et on ne
 *   la retrouverait plus jamais : c'est la faute à ne pas commettre, et c'est pour cela que cette fonction ne
 *   rend `true` que sur deux codes, nommés.
 *
 * 🔴 SEULE LA LECTURE EST ÉCARTÉE, JAMAIS LA LIGNE. Une ligne de `gestion_piece_drive` dit un fait daté : « nous
 * avons déposé une copie ici, ce jour-là ». Ce fait reste vrai après la suppression du fichier — c'est même le
 * seul moment où l'on a envie de le relire.
 */

/** Les deux seuls codes qui valent « cette copie ne sert plus ». Voir l'encadré : un 503 n'en est PAS un. PUR. */
export function estDisparition(statut: number): boolean {
  return statut === 404 || statut === 403;
}

/** Le mot gardé au registre. Court, en français, et il distingue les deux causes. PUR. */
export function motifDisparition(statut: number): string {
  if (statut === 404) return 'introuvable dans le Drive (supprimé, ou mis à la corbeille)';
  if (statut === 403) return 'plus lisible : droits retirés sur ce fichier';
  return `Google a répondu ${statut}`;
}

/**
 * ══ 🔴 LE FRAGMENT « CETTE COPIE EXISTE-T-ELLE ENCORE ? », ÉCRIT UNE SEULE FOIS ══════════════════════════════
 *
 * `gestion_piece_drive` est jointe à sept endroits du module pour trouver « la copie de cette pièce ». Recopier
 * `disparu_le IS NULL` à la main aurait donné sept occasions d'en oublier un — et un seul oubli fait servir un
 * identifiant mort, c'est-à-dire une erreur à l'écran sur un document qui existe ailleurs.
 *
 * 🔴 LA COLONNE N'EST NOMMÉE QUE SI ELLE EXISTE. Sans la migration 288 le fragment rend `true` : les requêtes
 * sont alors mot pour mot celles d'avant ce lot. Nommer une colonne absente ferait échouer la lecture des pièces
 * ENTIÈRE — donc l'affichage de tout le courrier. Règle du module depuis le lot 4a.
 *
 * ⚠️ REÇU EN PARAMÈTRE : c'est le patron du module (`personneVivanteAvec`, `nomsCherchablesAvec`). Un module pur
 * qui sonderait lui-même cesserait d'être éprouvable sans base.
 */
export function copieVivanteAvec(avecColonne: boolean, alias: string): string {
  return avecColonne ? `${alias}.disparu_le IS NULL` : 'true';
}

/**
 * ⚠️ CE QU'ON NE DIT PAS À ARNO. « n'affiche jamais d'erreur à Arno pour ça » : une copie disparue ne produit
 * aucun message à l'écran. Ce mot-ci sert au JOURNAL du serveur et au rapport d'une passe — jamais à une carte,
 * jamais à un bandeau.
 */
export function phraseJournalDisparition(driveFileId: string, statut: number): string {
  return `copie Drive ${driveFileId} écartée du registre — ${motifDisparition(statut)}`;
}
