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

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════
   🔴🔴 LOT RANGER-ET-NOM-FIABLES — LA LIGNE QUI DISPARAISSAIT APRÈS ÊTRE APPARUE
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════

   CONSTAT D'ARNO (01/10/2026) : « une pièce renommée puis rangée dans “Test” affiche ✓ Rangée sur la carte de
   gauche, mais la ligne n'apparaît PAS dans le dossier de l'arbre. Il faut fermer puis rouvrir la fenêtre. Au
   second essai, tout a marché. »

   🔴 LA CAUSE, ET ELLE EXPLIQUE L'INTERMITTENCE. Le lot précédent posait bien la ligne dans les trois listes —
   puis lançait AUSSITÔT une revalidation silencieuse du dossier cible. Cette revalidation REMPLACE la liste par
   ce que Google rend… et Google ne rend pas encore le fichier.

   MESURÉ LE 30/09/2026 sur le vrai Drive « Test » (lot précédent, banc de cohérence) : un fichier créé met
   3,8 SECONDES à apparaître dans `files.list`. La revalidation, elle, part dans la seconde. Elle rendait donc
   une liste SANS le fichier, et effaçait la ligne qu'on venait de poser. Au second essai, Google avait rattrapé
   son retard — d'où « au second essai, tout a marché ».

   🔴 CE QUI LE CORRIGE : un dépôt CONFIRMÉ par Google est une vérité qu'aucune liste plus ancienne n'a le droit
   de défaire. On garde donc, quelques secondes, la trace des dépôts confirmés, et TOUTE liste qui arrive pour ce
   dossier se voit réinjecter ce qu'elle ne sait pas encore. Le jour où Google rattrape, la ligne y est déjà : la
   réinjection ne fait alors rien du tout.

   ⚠️ ET ÇA COUVRE AUSSI LE DOSSIER QU'ON N'AFFICHAIT PAS ENCORE. Si le dossier cible n'était ni ouvert, ni
   déplié, ni en mémoire au moment du lâcher, il n'y avait aucune liste à retoucher. La trace, elle, est posée
   quand même — et la ligne paraît au premier affichage de ce dossier. */

/** Un dépôt confirmé par Google, qu'aucune liste plus ancienne n'a le droit d'effacer. */
export interface DepotConfirme {
  dossierId: string;
  ligne: EntreeDrive;
  /** Au-delà, on n'insiste plus : voir `FENETRE_REINJECTION_MS`. */
  jusqua: number;
}

/**
 * ⚠️ COMBIEN DE TEMPS ON TIENT TÊTE À GOOGLE. 30 secondes : huit fois le retard mesuré (3,8 s), donc large, et
 * assez court pour qu'un fichier VRAIMENT disparu (supprimé dans Drive dans la foulée) cesse d'être affiché.
 *
 * 🔴 CE N'EST PAS UN CACHE. On ne réinvente aucune ligne : on empêche seulement une liste PÉRIMÉE d'effacer un
 * fait qu'on a vu arriver. Passé ce délai, c'est Google qui a raison, quoi qu'il dise.
 */
export const FENETRE_REINJECTION_MS = 30_000;

/**
 * RÉINJECTE dans une liste fraîchement reçue les dépôts confirmés qu'elle ne porte pas encore. PUR.
 *
 * ⚠️ EN TÊTE, comme la ligne provisoire : c'est celle qu'on vient de créer, c'est celle qu'on cherche des yeux.
 * ⚠️ ET JAMAIS EN DOUBLE : dès que Google la rend, la sienne fait foi et la nôtre ne s'ajoute pas.
 */
export function fusionnerDepots(
  liste: readonly EntreeDrive[], dossierId: string,
  depots: readonly DepotConfirme[], maintenant: number,
): EntreeDrive[] {
  const presents = new Set(liste.map((e) => e.id));
  const manquants = depots.filter((d) => d.dossierId === dossierId
    && d.jusqua > maintenant && !presents.has(d.ligne.id));
  return manquants.length === 0 ? [...liste] : [...manquants.map((d) => d.ligne), ...liste];
}

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   🔴🔴 LOT CORBEILLE-DRIVE-REELLE-ET-SCROLL — LE SYMÉTRIQUE : UN RETRAIT CONFIRMÉ
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════

   CONSTAT D'ARNO (04/10/2026) : « j'ai demandé “Mettre à la corbeille” et confirmé. Résultat : bandeau d'erreur,
   fichier TOUJOURS EN PLACE. »

   DIAGNOSTIC MESURÉ. La mise à la corbeille avait RÉUSSI — journal des mouvements, ligne 170, 03/10 à 23:56:27,
   non annulée, et le fichier est bien `trashed: true` chez Google. Ce qu'Arno a vu ensuite vient d'ici : l'écran
   lançait une revalidation silencieuse du dossier courant, et Google rendait encore l'ancienne liste, AVEC le
   fichier. La ligne restait donc à l'écran — et comme elle restait, le geste pouvait être REJOUÉ sur un fichier
   déjà à la corbeille, ce qui produisait précisément le message d'erreur qu'il a lu.

   🔴 C'EST EXACTEMENT LE DÉFAUT DES DÉPÔTS, DANS L'AUTRE SENS. Google met des secondes à faire PARAÎTRE un
   fichier neuf dans `files.list` (3,8 s mesurées le 30/09/2026) ; il met le même temps à cesser de rendre un
   fichier qu'on vient de jeter. Le remède est donc le même, renversé : un retrait CONFIRMÉ par Google est une
   vérité qu'aucune liste plus ancienne n'a le droit de défaire.

   ⚠️ LA FENÊTRE EST LA MÊME (`FENETRE_REINJECTION_MS`), et c'est voulu : les deux décrivent le même retard, celui
   de Google. En tenir deux aurait fait divulguer deux vérités sur la même chose.

   ⚠️ ET LE RETRAIT PORTE SUR L'IDENTIFIANT SEUL, pas sur un couple (fichier, dossier) : un fichier à la corbeille
   du Drive n'est plus dans AUCUN dossier. Le limiter à son ancien parent l'aurait laissé visible partout ailleurs
   où l'écran le montrait — et la même ligne peut être affichée à deux endroits. */

/** Un retrait confirmé par Google (mise à la corbeille), qu'aucune liste plus ancienne n'a le droit de ressusciter. */
export interface RetraitConfirme {
  id: string;
  /** Au-delà, c'est Google qui a raison, quoi qu'il dise — même règle que les dépôts. */
  jusqua: number;
}

/**
 * ÉCARTE d'une liste fraîchement reçue les fichiers dont le retrait est confirmé. PUR.
 *
 * 🔴 CE N'EST PAS UN FILTRE D'AFFICHAGE, c'est la correction d'un RETARD : passé la fenêtre, la trace meurt et la
 * liste de Google reprend toute son autorité. On n'efface rien qu'on n'ait vu partir.
 */
export function ecarterRetires(
  liste: readonly EntreeDrive[], retraits: readonly RetraitConfirme[], maintenant: number,
): EntreeDrive[] {
  const partis = new Set(retraits.filter((r) => r.jusqua > maintenant).map((r) => r.id));
  return partis.size === 0 ? [...liste] : liste.filter((e) => !partis.has(e.id));
}

/** Écarte les traces périmées. Même rôle que `depotsVivants`, pour les retraits. PUR. */
export function retraitsVivants(
  retraits: readonly RetraitConfirme[], maintenant: number,
): RetraitConfirme[] {
  return retraits.filter((r) => r.jusqua > maintenant);
}

/** Écarte les traces périmées. Appelé à chaque usage : rien ne doit survivre à sa fenêtre. */
export function depotsVivants(
  depots: readonly DepotConfirme[], maintenant: number,
): DepotConfirme[] {
  return depots.filter((d) => d.jusqua > maintenant);
}
