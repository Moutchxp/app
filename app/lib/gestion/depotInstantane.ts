import type { EntreeDrive } from './finderDrive';

/**
 * ══ 🔴🔴 LOT RANGER-INSTANTANE-ET-NOM — LA LIGNE QUI APPARAÎT AU LÂCHER. Module PUR. ═══════════════════════════
 *
 * CAS RÉEL D'ARNO (fil 36575, pièce `0836_001.pdf`, 30/09/2026) : « la fenêtre affiche “✓ Rangée dans Test ·
 * ouvrir”, mais le dossier Test ouvert dans l'arbre ne montre PAS le fichier. Il n'apparaît qu'environ 1 minute
 * plus tard. »
 *
 * ═══ 🔴🔴 LA CAUSE, MESURÉE — ET LA PREMIÈRE EXPLICATION, RÉFUTÉE ═══════════════════════════════════════════
 *
 * CE QUE J'AVAIS CRU D'ABORD : Google. Un fichier tout juste créé dans un Drive partagé n'apparaîtrait pas tout
 * de suite dans l'index `user`, qui est celui que le listage interroge ; il aurait fallu `corpora=drive`.
 * L'explication était séduisante — elle expliquait « une minute » sans rien changer chez nous.
 *
 * 🔴 MESURÉ LE 30/09/2026 SUR LE VRAI DRIVE « Test », ET FAUX. Un fichier créé y est vu par `files.list` en
 * 3,8 s SANS `corpora=drive`, et en 6,2 s AVEC. L'index `user` n'était pas en retard — il était même en avance.
 * La modification a donc été retirée : garder un correctif qui ne corrige rien, c'est garder une explication
 * fausse à l'endroit où quelqu'un la relira comme un fait.
 *
 * ═══ 🔴🔴 LA VRAIE CAUSE EST CHEZ NOUS, ET ELLE EST DANS LE MOT « ARBRE » ═══════════════════════════════════
 *
 * Arno écrit « le dossier Test OUVERT DANS L'ARBRE ». La fenêtre tient TROIS listes pour un même dossier : la
 * mémoire des listings (`cache`), les sous-niveaux dépliés (`enfants`), et la vue courante. Le dépôt n'en
 * touchait que deux — il effaçait la mémoire et rechargeait la vue SI l'on y était. Un dossier déplié dans
 * l'arbre garde le contenu lu à son dépliage (`chargerEnfantsSiBesoin` ne relit rien s'il connaît déjà le
 * dossier) : la ligne n'y paraissait donc JAMAIS, jusqu'à ce qu'un autre geste — replier / redéplier, une
 * revalidation venue d'ailleurs, la réouverture de la fenêtre — la rafraîchisse. D'où « environ une minute » :
 * ce n'était pas un délai, c'était le prochain hasard.
 *
 * 🔴 D'OÙ LA RÈGLE : ce lot pose la ligne dans LES TROIS listes (`majListesDu`), et jamais dans deux.
 *
 * ⚠️ « OPTIMISTE » NE VEUT PAS DIRE « MENTEUR ». La ligne provisoire est marquée « en cours », elle porte un
 * identifiant qui ne peut pas être confondu avec un identifiant Drive, et elle DISPARAÎT si le serveur refuse.
 * C'est exactement la règle du déplacement optimiste (`mouvementOptimiste.ts`), appliquée au dépôt.
 *
 * 🔴 ET « ✓ RANGÉE » N'EST PAS DIT PAR ELLE. La marque de la pièce n'est posée qu'une fois l'identifiant reçu de
 * Google : la ligne provisoire montre ce qui est EN TRAIN d'arriver, la marque affirme que c'est arrivé. Les
 * confondre, c'était annoncer un rangement dont on n'avait encore aucune preuve.
 */

/**
 * 🔴 UN IDENTIFIANT QUI NE PEUT PAS ÊTRE PRIS POUR CELUI D'UN FICHIER. Les identifiants Drive ne contiennent ni
 * espace ni deux-points, et aucun ne commence par ce préfixe : un clic sur une ligne provisoire ne partira donc
 * jamais demander à Google un fichier qui n'existe pas encore.
 */
const PREFIXE = 'depot-en-cours:';

/** Vrai pour une ligne qui n'existe encore que chez nous. PUR. */
export function estProvisoire(id: string): boolean {
  return id.startsWith(PREFIXE);
}

/** L'identifiant provisoire d'une pièce en cours de dépôt. PUR. */
export function idProvisoire(pieceId: number): string {
  return `${PREFIXE}${pieceId}`;
}

/** Ce que l'écran dit de la ligne tant que Google n'a pas répondu. */
export const MOT_DEPOT_EN_COURS = 'Rangement en cours…';

/**
 * LA LIGNE PROVISOIRE, telle qu'elle s'affiche dans le dossier cible.
 *
 * ⚠️ ELLE PORTE LE NOM D'USAGE, celui sous lequel la copie PART — pas le nom d'origine. Afficher « 0836_001.pdf »
 * une seconde, puis « Recommandé M Ahmed KHARRAT.pdf », ferait croire que le renommage a échoué puis rattrapé.
 *
 * ⚠️ `modifieLe` VAUT `null` ET NON L'HEURE COURANTE : on ne connaît pas encore la date que Google donnera, et
 * l'inventer ferait sauter la ligne de place au premier tri par date.
 */
export function ligneProvisoire(
  p: { pieceId: number; nom: string; typeMime: string | null; tailleOctets: number | null }, cibleId: string,
): EntreeDrive {
  return {
    id: idProvisoire(p.pieceId),
    nom: p.nom,
    typeMime: p.typeMime ?? 'application/octet-stream',
    tailleOctets: p.tailleOctets,
    modifieLe: null,
    lien: null,
    dossier: false,
    parentId: cibleId,
  };
}

/**
 * POSE la ligne provisoire dans la liste du dossier cible. PUR.
 *
 * ⚠️ SANS DOUBLON, et en TÊTE : c'est la ligne qu'on vient de créer, c'est celle qu'on cherche des yeux. Un tri
 * par nom la remettra à sa place au prochain listage — et d'ici là, elle est là où le regard va.
 */
export function poser(liste: readonly EntreeDrive[], ligne: EntreeDrive): EntreeDrive[] {
  return [ligne, ...liste.filter((e) => e.id !== ligne.id)];
}

/**
 * REMPLACE la ligne provisoire par la ligne RÉELLE rendue par Google. PUR.
 *
 * 🔴 REMPLACER, ET NON « AJOUTER PUIS RETIRER » : entre les deux gestes, la liste aurait montré la pièce en double
 * ou pas du tout, et un rendu de React tombe exactement là où on ne l'attend pas.
 *
 * ⚠️ SI LA PROVISOIRE N'Y EST PLUS (on a changé de dossier, la liste a été rechargée), la réelle est simplement
 * posée — sans doublon. Ne rien faire laisserait un dossier fraîchement rechargé sans le fichier qu'on vient d'y
 * mettre, ce qui est précisément le défaut qu'on répare.
 */
export function remplacer(
  liste: readonly EntreeDrive[], pieceId: number, reelle: EntreeDrive,
): EntreeDrive[] {
  const cle = idProvisoire(pieceId);
  const dedans = liste.some((e) => e.id === cle);
  if (!dedans) return liste.some((e) => e.id === reelle.id) ? [...liste] : [reelle, ...liste];
  return liste.map((e) => (e.id === cle ? reelle : e)).filter((e, i, t) => t.findIndex((x) => x.id === e.id) === i);
}

/** RETIRE la ligne provisoire — le serveur a refusé, ou n'a pas répondu. PUR. */
export function retirer(liste: readonly EntreeDrive[], pieceId: number): EntreeDrive[] {
  const cle = idProvisoire(pieceId);
  return liste.filter((e) => e.id !== cle);
}

/**
 * LA LIGNE RÉELLE, construite à partir de ce que la route rend sur un dépôt réussi.
 *
 * ⚠️ LA TAILLE ET LE TYPE VIENNENT DE LA PIÈCE, pas de Google : la réponse du dépôt ne les porte pas, et les
 * redemander coûterait un aller-retour pour afficher une ligne qu'on sait déjà décrire.
 */
export function ligneReelle(
  p: { nom: string; typeMime: string | null; tailleOctets: number | null },
  o: { driveFileId: string; lien: string | null }, cibleId: string,
): EntreeDrive {
  return {
    id: o.driveFileId,
    nom: p.nom,
    typeMime: p.typeMime ?? 'application/octet-stream',
    tailleOctets: p.tailleOctets,
    modifieLe: null,
    lien: o.lien,
    dossier: false,
    parentId: cibleId,
  };
}
