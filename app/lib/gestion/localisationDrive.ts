/**
 * ══ 🔴🔴 LOT DRIVE-MENU-SUPPRIMER-DUPLIQUER-LOUPE — « OÙ EST CE DOCUMENT ? ». Module PUR ═════════════════════════
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * DEMANDE D'ARNO (03/10/2026) : « Sur chaque vignette de la colonne de gauche, un picto loupe (aria-label
 * “Localiser dans le Drive”). Clic = active ou désactive la localisation pour cette vignette (une seule active à
 * la fois). Surlignage, à chaque niveau de l'arbre : chaque dossier qui contient (directement ou plus bas) une
 * occurrence du document est surligné. On l'ouvre : le sous-dossier concerné est surligné, et ainsi de suite
 * jusqu'à la ligne du fichier, surlignée elle aussi. »
 *
 * ═══ 🔴🔴 CE QUE « MÊME DOCUMENT » VEUT DIRE, ET CE QUE ÇA NE VEUT PAS DIRE ══════════════════════════════════════
 *
 * Deux sources, et AUCUNE des deux n'est un balayage du Drive :
 *
 *   ① LE REGISTRE DE L'APPLI (`gestion_drive_mouvement`). Chaque copie faite par cette application y a laissé une
 *      ligne portant la SOURCE et la COPIE. On remonte donc les copies d'un document, et les copies de ses
 *      copies, par une fermeture BORNÉE (voir `fermetureCopies`). C'est de la lecture en base : zéro appel Google,
 *      et c'est EXACT — on ne devine pas, on relit ce qu'on a fait.
 *
 *   ② L'EMPREINTE DE CONTENU (`md5Checksum`), quand Google la fournit. Deux fichiers de même empreinte sont le
 *      même document, quel que soit leur nom. Elle rattrape ce que le registre ignore : les copies faites À LA
 *      MAIN dans Google Drive, qui n'ont laissé aucune trace chez nous.
 *
 * ═══ 🔴🔴 LES LIMITES, ÉCRITES ICI PARCE QU'ELLES DOIVENT SE LIRE À L'ÉCRAN ══════════════════════════════════════
 *
 * ⚠️ L'API DRIVE NE SAIT PAS CHERCHER PAR EMPREINTE. `files.list` accepte `name`, `mimeType`, `parents`,
 * `fullText`… mais PAS `md5Checksum` : il n'existe aucune requête « rends-moi les fichiers de cette empreinte ».
 * La comparaison ne peut donc porter que sur des fichiers DÉJÀ LUS. On les prend là où ils ne coûtent rien : dans
 * les dossiers que la fenêtre a déjà listés — l'empreinte voyage avec chaque ligne, dans le même appel.
 *
 * ⚠️ CONSÉQUENCE, ET IL FAUT LA DIRE : une copie manuelle rangée dans un dossier QU'ON N'A PAS OUVERT ne sera pas
 * trouvée. Le compteur annonce donc « N emplacement(s) connu(s) », jamais « N emplacements ». Promettre
 * l'exhaustivité ferait conclure « il n'est nulle part ailleurs » d'un balayage qui n'a pas eu lieu.
 *
 * ⚠️ UN DOCUMENT GOOGLE NATIF (Doc, Sheet) N'A PAS D'EMPREINTE : Google n'en calcule pas. Pour eux, seul le
 * registre répond — et l'écran le dit.
 *
 * 🔒 TOUT CECI EST EN LECTURE SEULE. Aucune écriture Drive, jamais. Les ancêtres de « Documents clients scannés »
 * peuvent être LUS (des métadonnées : un nom, un parent), jamais modifiés — c'est déjà ce que fait le fil
 * d'Ariane de la fenêtre.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */

/** Une occurrence : un fichier, et la chaîne de ses dossiers — du plus proche à la racine. */
export interface Occurrence {
  /** L'identifiant Drive du fichier trouvé. */
  id: string;
  nom: string;
  /**
   * Les dossiers qui le contiennent, du parent IMMÉDIAT vers la racine. Vide = on n'a pas su remonter : le
   * fichier est alors compté, mais il ne surligne aucun chemin (on ne devine pas un emplacement).
   */
  chemin: readonly { id: string; nom: string }[];
  /** Comment on l'a trouvé. Il se dit à l'écran : les deux voies n'ont pas la même certitude. */
  voie: 'registre' | 'empreinte';
}

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   ① LA FERMETURE DU REGISTRE — LES COPIES, ET LES COPIES DES COPIES
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

/** Un lien de copie, tel que le journal l'a inscrit : une source, une copie. */
export interface LienCopie { source: string; copie: string }

/**
 * ⚠️ LA BORNE. Un document très recopié pourrait traîner des centaines de lignes, et la fenêtre doit répondre
 * tout de suite. Cinquante emplacements, c'est déjà bien au-delà de ce qu'on regarde des yeux — et au-delà, la
 * question n'est plus « où est-il ? » mais « pourquoi y en a-t-il tant ? ».
 */
export const OCCURRENCES_MAX = 50;
/** La profondeur de la fermeture : une copie d'une copie d'une copie suffit largement. */
export const SAUTS_MAX = 4;

/**
 * ══ 🔴 TOUS LES IDENTIFIANTS QUI DÉSIGNENT LE MÊME DOCUMENT, selon le registre. PUR. ═════════════════════════════
 *
 * On part d'un identifiant et l'on suit les liens DANS LES DEUX SENS : la copie d'un document est le même
 * document, et son original aussi. Une copie faite depuis une copie entre donc dans le lot, à `SAUTS_MAX` près.
 *
 * ⚠️ BORNÉE EN PROFONDEUR **ET** EN NOMBRE, et les deux comptent : une table abîmée par un cycle ne doit pas
 * figer le programme, et un document recopié mille fois ne doit pas remplir l'écran.
 *
 * ⚠️ LA SOURCE ELLE-MÊME EN FAIT PARTIE : c'est un emplacement comme un autre, et l'oublier ferait annoncer
 * « 1 emplacement » là où il y en a deux.
 */
export function fermetureCopies(depart: string, liens: readonly LienCopie[]): string[] {
  const vus = new Set<string>([depart.trim()]);
  let frontiere = [depart.trim()];
  for (let saut = 0; saut < SAUTS_MAX && frontiere.length > 0; saut += 1) {
    const suivante: string[] = [];
    for (const l of liens) {
      if (frontiere.includes(l.source) && !vus.has(l.copie)) { vus.add(l.copie); suivante.push(l.copie); }
      if (frontiere.includes(l.copie) && !vus.has(l.source)) { vus.add(l.source); suivante.push(l.source); }
      if (vus.size >= OCCURRENCES_MAX) break;
    }
    if (vus.size >= OCCURRENCES_MAX) break;
    frontiere = suivante;
  }
  return [...vus].filter((x) => x !== '').slice(0, OCCURRENCES_MAX);
}

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   ② CE QUE L'ARBRE DOIT SURLIGNER
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

/**
 * ══ 🔴🔴 LOT DRIVE-LOUPE-MENU-VITESSE — UN SEUL REPÈRE PAR CHEMIN ════════════════════════════════════════════════
 *
 * CONSTAT D'ARNO (03/10/2026) : la première version surlignait TOUS les ancêtres à la fois — « Test »,
 * « _MESURE dossier instantane », « _MESURE ligne arbre », le fichier… Trop de repères : l'arbre entier s'allume,
 * et un arbre tout surligné n'apprend plus rien.
 *
 * LA RÈGLE DEVIENT :
 *   · UN repère, et un seul, sur le nœud VISIBLE LE PLUS PROFOND du chemin vers chaque emplacement ;
 *   · dossier fermé → le repère est sur lui ; on l'ouvre → le repère QUITTE ce dossier et descend d'un cran,
 *     jusqu'au document lui-même ;
 *   · plusieurs emplacements qui passent par le même dossier fermé → UN SEUL repère, avec un petit nombre ;
 *     ils se séparent dès qu'on ouvre.
 *
 * 🔴 « VISIBLE » EST LA SEULE NOTION QUI COMPTE, et elle se lit à l'écran : une ligne est rendue, ou elle ne l'est
 * pas. Un dossier ouvert rend ses enfants ; un dossier fermé ne rend rien en dessous de lui. Le repère tombe donc
 * de lui-même sur le bon nœud, sans qu'il faille raisonner sur les dépliages — c'est l'affichage qui décide.
 */
export interface Surlignage {
  /**
   * Le nœud qui porte le repère → combien d'emplacements passent par lui. Un seul par chemin, par construction :
   * c'est une Map, et deux occurrences du même dossier fermé s'y additionnent au lieu de s'empiler.
   */
  reperes: ReadonlyMap<string, number>;
  /** Les FICHIERS trouvés qui sont eux-mêmes visibles : leur ligne est le bout du chemin, et se marque autrement. */
  fichiers: ReadonlySet<string>;
  /** Combien d'emplacements connus EN TOUT — y compris ceux dont aucun nœud n'est visible. */
  nombre: number;
}

export const SURLIGNAGE_VIDE: Surlignage = { reperes: new Map(), fichiers: new Set(), nombre: 0 };

/**
 * ══ 🔴🔴 LE REPÈRE D'UNE OCCURRENCE : SON NŒUD VISIBLE LE PLUS PROFOND. PUR. ════════════════════════════════════
 *
 * On descend la liste [le fichier, son parent, son grand-parent, … la racine] et l'on s'arrête au PREMIER élément
 * qui est affiché. Comme la liste part du plus profond, le premier affiché EST le plus profond affiché.
 *
 * ⚠️ `null` = RIEN N'EST VISIBLE sur ce chemin (l'emplacement est dans une branche qu'on ne regarde pas du tout).
 * L'occurrence reste COMPTÉE dans le total — elle existe — mais elle ne pose aucun repère : marquer une ligne au
 * hasard serait pire que n'en marquer aucune.
 */
export function repereDe(o: Occurrence, affichees: ReadonlySet<string>): string | null {
  if (o.id.trim() !== '' && affichees.has(o.id)) return o.id;
  for (const d of o.chemin) {
    if (d.id.trim() !== '' && affichees.has(d.id)) return d.id;
  }
  return null;
}

/**
 * ══ 🔴🔴 LES REPÈRES DE TOUTES LES OCCURRENCES. PUR. ════════════════════════════════════════════════════════════
 *
 * ⚠️ `affichees` EST L'ENSEMBLE DES LIGNES RENDUES à cet instant — pas les dossiers « ouverts », pas les chemins
 * « connus ». C'est ce qui fait descendre le repère tout seul quand on déplie : la ligne de l'enfant apparaît,
 * elle devient le nœud visible le plus profond, et le repère quitte le parent sans qu'on ait rien à calculer.
 *
 * ⚠️ DEUX OCCURRENCES DU MÊME DOSSIER FERMÉ COMPTENT POUR DEUX sur ce dossier (le petit nombre « 2 » d'Arno), et
 * se séparent dès qu'on l'ouvre : chacune trouve alors son propre sous-dossier.
 */
export function surlignageDe(
  occurrences: readonly Occurrence[],
  affichees: ReadonlySet<string> = new Set(),
): Surlignage {
  const reperes = new Map<string, number>();
  const fichiers = new Set<string>();
  let nombre = 0;
  for (const o of occurrences) {
    if (o.id.trim() === '') continue;
    nombre += 1;
    const ou = repereDe(o, affichees);
    if (ou === null) continue;
    reperes.set(ou, (reperes.get(ou) ?? 0) + 1);
    // 🔴 LE BOUT DU CHEMIN SE MARQUE AUTREMENT : c'est le document, pas un dossier qui y mène.
    if (ou === o.id) fichiers.add(o.id);
  }
  return { reperes, fichiers, nombre };
}

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   ②-bis 🔴🔴 LOT DRIVE-ARBORESCENCE-PARENTS-ET-LOUPE — LE PARCOURS, CLIC APRÈS CLIC
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════

   ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   CONSTAT D'ARNO (09/10/2026) : « le bouton loupe doit de nouveau dessiner le parcours clic après clic jusqu'au
   document : des témoins numérotés (1, 2, 3…) devant chaque ligne à cliquer, du niveau affiché jusqu'au fichier. »

   ═══ 🔴🔴 CE QUE LA MESURE A TROUVÉ, ET QUI N'EST PAS CE QU'ON CROYAIT ═══════════════════════════════════════════

   Rejoué le 09/10/2026 sur la fiche lot-299 (« 1bis Rue Manessier — lot 432 »), pièce « Détail du mouvement
   VIR INST… » : la loupe appelle bien `/drive/localiser`, qui répond **2 occurrences**, toutes deux dans
   « Drive › Base de données locative › 00 Arrivée des mails › 2026 › 07 ». Et l'écran n'affiche **AUCUN repère** :
   `surlignage.reperes` est VIDE.

   🔴 LA RAISON EST DANS `repereDe` : il ne marque QUE les nœuds AFFICHÉS. La fenêtre, elle, montre le dossier du
   lot 432 et ses cinq sous-dossiers — et le chemin du document ne passe par AUCUN d'eux (il descend par
   « 00 Arrivée des mails », qui est un FRÈRE de « 2 Biens immobiliers », deux niveaux plus haut). Aucun nœud
   commun ⇒ aucun repère ⇒ la loupe ne dit rien du tout, alors qu'elle sait exactement où est le document.

   ⚠️ CE N'EST DONC PAS UNE RÉGRESSION D'UN COMMIT, et il faut le dire : la version d'AVANT
   `49c506f7` (« la loupe ne pose plus qu'UN repère par chemin ») ne peignait pas davantage cette situation — elle
   surlignait TOUS les ancêtres, mais seulement parmi les lignes affichées, et il n'y en avait aucune ici non plus.
   Les témoins NUMÉROTÉS, eux, n'ont jamais existé : recherche par `git log -S` sur six graphies, zéro commit.
   Ce qui a disparu avec `49c506f7`, c'est le surlignage de la CHAÎNE ENTIÈRE ; ce qui n'a jamais existé, c'est
   l'itinéraire numéroté — et c'est lui qui répond vraiment à la question « par où je clique ? ».

   ═══ 🔴 LA RÈGLE, DONC ═══════════════════════════════════════════════════════════════════════════════════════════

   On numérote la chaîne du document à partir du PREMIER nœud AFFICHÉ, de haut en bas : 1 sur la ligne à cliquer
   maintenant, 2 sur celle qui apparaîtra ensuite, et ainsi de suite jusqu'au fichier. Les rangs sont calculés sur
   la chaîne ENTIÈRE, donc ils ne bougent pas quand on déplie : le « 2 » reste le « 2 ».

   ⚠️ ET C'EST POURQUOI LES NIVEAUX PARENTS COMPTENT (point 1 du même lot) : tant que la fenêtre n'affiche que le
   dossier courant, un document rangé dans une branche voisine n'a aucun nœud commun avec l'écran, et aucun
   itinéraire ne peut partir. Les deux points de ce lot sont une seule et même chose.
   ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

/** Un itinéraire : quel nœud porte quel numéro, et où il mène. */
export interface Parcours {
  /** Nœud → son rang (1, 2, 3…) le long du chemin, en partant du plus haut niveau AFFICHÉ. */
  rangs: ReadonlyMap<string, number>;
  /**
   * Le fichier au bout, s'il est **AFFICHÉ**. `null` = on ne l'a pas encore atteint à l'écran.
   *
   * ⚠️ « AFFICHÉ », ET NON « NUMÉROTÉ » : tous les crans de la chaîne portent un rang dès le premier pas (c'est
   * ce qui empêche l'itinéraire de se renuméroter en descendant), mais la DESTINATION n'est atteinte que
   * lorsque sa ligne existe. Confondre les deux ferait écrire « le document est ici » sur une ligne que
   * personne ne voit.
   */
  fichier: string | null;
  /** Combien de pas en tout, du premier affiché jusqu'au fichier compris. 0 = aucun itinéraire possible. */
  pas: number;
}

export const PARCOURS_VIDE: Parcours = { rangs: new Map(), fichier: null, pas: 0 };

/**
 * ══ 🔴🔴 L'ITINÉRAIRE VERS **UNE** OCCURRENCE. PUR. ═════════════════════════════════════════════════════════════
 *
 * 🔴 UNE SEULE, ET C'EST VOULU. Deux itinéraires numérotés côte à côte donneraient deux « 1 » et deux « 2 » dans
 * le même arbre : on ne saurait plus lequel suivre. Quand le document est connu à plusieurs emplacements,
 * l'appelant choisit lequel on dessine (le premier par défaut) ; les AUTRES gardent la pastille 🔎 du repère,
 * qui n'a pas changé d'un trait.
 *
 * ⚠️ LES RANGS COUVRENT LA CHAÎNE ENTIÈRE, affichée ou non. Un nœud pas encore à l'écran n'est tout simplement
 * pas rendu ; mais le jour où il paraît, il porte DÉJÀ son numéro — l'itinéraire ne se renumérote pas sous les
 * yeux de celui qui le suit.
 *
 * ⚠️ `PARCOURS_VIDE` QUAND AUCUN NŒUD N'EST AFFICHÉ : on ne commence pas un itinéraire par un pas qu'on ne peut
 * pas faire. L'écran dit alors ce qu'il sait autrement (le bandeau « Ce document est ici : … »).
 */
export function parcoursDe(
  o: Occurrence | null | undefined, affichees: ReadonlySet<string>,
): Parcours {
  if (o === null || o === undefined || o.id.trim() === '') return PARCOURS_VIDE;
  /* La chaîne dans le SENS DE LA DESCENTE : la racine d'abord, le fichier en dernier. `chemin` est rangé du
     parent immédiat vers la racine — on le retourne, et le fichier ferme la marche. */
  const chaine = [...o.chemin].map((d) => d.id).filter((id) => id.trim() !== '').reverse();
  chaine.push(o.id);
  const depart = chaine.findIndex((id) => affichees.has(id));
  if (depart === -1) return PARCOURS_VIDE;
  const rangs = new Map<string, number>();
  for (let i = depart; i < chaine.length; i += 1) rangs.set(chaine[i], i - depart + 1);
  return { rangs, fichier: affichees.has(o.id) ? o.id : null, pas: chaine.length - depart };
}

/**
 * QUELLE OCCURRENCE L'ON DESSINE. PUR.
 *
 * Arno : « Si la pièce est connue à 2 emplacements (badge “2”), afficher l'emplacement choisi dans le menu, ou le
 * premier par défaut. » `choisi` est l'identifiant Drive venu du menu ; absent ou introuvable, c'est le premier.
 */
export function occurrenceChoisie(
  occurrences: readonly Occurrence[], choisi?: string | null,
): Occurrence | null {
  if (occurrences.length === 0) return null;
  const vise = (choisi ?? '').trim();
  return (vise === '' ? undefined : occurrences.find((o) => o.id === vise)) ?? occurrences[0];
}

/**
 * LE MOT D'UN TÉMOIN, écrit pour l'infobulle ET pour le lecteur d'écran — la couleur et le chiffre ne portent
 * jamais l'information seuls. PUR.
 */
export function motEtape(rang: number, pas: number, estLeFichier: boolean): string {
  if (estLeFichier) return `Étape ${rang} sur ${pas} : le document est ici`;
  return `Étape ${rang} sur ${pas} : ouvrez ce dossier pour continuer`;
}

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   ③ LES MOTS
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

export const AIDE_LOUPE = 'Localiser dans le Drive';

/**
 * LE PETIT COMPTEUR, à côté de la loupe. PUR.
 *
 * 🔴 IL DIT « CONNU(S) », ET CE MOT N'EST PAS UNE PRÉCAUTION DE STYLE. L'API Drive ne sait pas chercher par
 * empreinte : une copie manuelle rangée dans un dossier qu'on n'a pas ouvert reste invisible. « 2 emplacements »
 * ferait conclure « il n'est nulle part ailleurs » ; « 2 emplacements connus » dit la vérité, et exactement elle.
 */
/**
 * ══ 🔴🔴 LOT PASTILLE-COPIES-VIVANTES — « DOCUMENT INCONNU DU DRIVE » À ZÉRO ═════════════════════════════════════
 *
 * DÉCISION D'ARNO (07/10/2026) : « À 0 : pas de pastille verte, et la loupe affiche “Document inconnu du Drive”
 * (aucun lien). À 1 ou plus : “N emplacement(s) connu(s)”, avec la liste cliquable comme aujourd'hui. »
 *
 * 🔴 CE QUE LE NOUVEAU MOT RÉPARE. « Aucun emplacement connu » se lisait « je n'ai pas réussi à le situer » — une
 * phrase sur NOTRE savoir, qui laissait croire qu'il était peut-être là, ailleurs, et qu'on avait mal cherché.
 * « Document inconnu du Drive » dit ce qui a été VÉRIFIÉ : ce contenu n'existe dans aucune copie vivante que nous
 * connaissions. C'est une phrase sur le document, pas sur notre embarras.
 *
 * ⚠️ « CONNU(S) » RESTE AU-DESSUS DE ZÉRO, et ce mot n'est pas une précaution de style : l'API Drive ne sait pas
 * chercher par empreinte, et une copie rangée à la main dans un dossier jamais ouvert reste invisible.
 * « 2 emplacements » ferait conclure « il n'est nulle part ailleurs » ; « 2 emplacements connus » dit la vérité,
 * et exactement elle.
 */
export const MOT_INCONNU_DU_DRIVE = 'Document inconnu du Drive';

/**
 * ══ 🔴🔴 LOT PASTILLE-COPIES-VIVANTES — « UNE COPIE VIVANTE », ÉCRIT UNE SEULE FOIS ══════════════════════════════
 *
 * DÉCISION D'ARNO (07/10/2026) : « la pastille et la loupe ne comptent que les copies vivantes du Drive (hors
 * corbeille, hors fantômes) ».
 *
 * 🔴 DEUX TABLES RÉPONDENT À CETTE QUESTION — le registre des dépôts (`gestion_piece_drive`) et l'index des
 * empreintes (`gestion_drive_empreinte`) — et chacune écrivait sa propre condition. Deux écritures d'une même
 * règle finissent par ne plus dire la même chose, et c'est toujours celle qu'on relit le moins qui garde le faux.
 * Elles lisent donc ce fragment, et la pastille comme la loupe comptent le même ensemble PAR CONSTRUCTION.
 *
 * ⚠️ CE QUE CE FRAGMENT NE PEUT PAS DIRE, ET IL FAUT LE SAVOIR : la corbeille de Google. Une copie mise à la
 * corbeille APRÈS le dernier relevé de l'index est encore `disparu_le IS NULL` chez nous. La LOUPE l'écarte
 * quand même — elle demande le fichier à Google, et `lireMetadonnees` refuse un fichier à la corbeille ; la
 * PASTILLE, qui ne fait aucun appel Google (c'est ce qui la rend gratuite sur une colonne de dix vignettes), ne
 * le peut pas. L'écart se referme au relevé suivant, qui pose `disparu_le`. Mesuré le 07/10/2026 : **0** ligne
 * vive du registre (sur 26 553) pointe vers un fichier que l'index donne pour disparu, et **0** vers un fichier
 * qu'il ne connaît pas.
 */
export function sqlCopieVivante(alias: string): string {
  return `${alias}.disparu_le IS NULL`;
}

export function motCompteur(n: number): string {
  if (n <= 0) return MOT_INCONNU_DU_DRIVE;
  return n > 1 ? `${n} emplacements connus` : '1 emplacement connu';
}

/**
 * CE QUE LA RECHERCHE A FAIT, en une phrase lisible — et ce qu'elle n'a PAS fait. PUR.
 *
 * ⚠️ ELLE S'AFFICHE À CÔTÉ DU COMPTEUR, pas dans une aide qu'il faudrait aller chercher : la limite doit se lire
 * au moment où l'on regarde le nombre, sinon elle ne sert à rien.
 */
export function phraseMethode(o: {
  nombre: number; parRegistre: number; parEmpreinte: number; empreinteConnue: boolean; dossiersLus: number;
  /**
   * ══ 🔴🔴 LOT EMPREINTE-PIECES-DEJA-DANS-LE-DRIVE, NIVEAU 2 — L'ÉTENDUE RÉELLE DE LA COMPARAISON ══════════════
   *
   * Combien de fichiers du Drive nous connaissons l'empreinte, index compris. `null` ⇒ aucun index (migration 299
   * non appliquée) : la phrase reste CELLE D'AVANT, mot pour mot, parce que la limite est alors celle d'avant.
   *
   * 🔴 CE NOMBRE CHANGE CE QU'ON A LE DROIT DE DIRE. Sans index, « le Drive n'est pas balayé » est la vérité.
   * Avec un index de 181 000 fichiers, la dire encore ferait sous-estimer ce qu'on sait — et annoncer « nulle
   * part ailleurs » reste interdit, parce qu'un index a toujours une date.
   */
  fichiersIndexes?: number | null;
}): string {
  const debut = motCompteur(o.nombre);
  const voies: string[] = [];
  if (o.parRegistre > 0) voies.push(`${o.parRegistre} par le registre des copies de l’application`);
  if (o.parEmpreinte > 0) voies.push(`${o.parEmpreinte} par empreinte de contenu identique`);
  const comment = voies.length === 0 ? '' : ` — ${voies.join(', ')}`;
  const dossiers = `${o.dossiersLus} dossier${o.dossiersLus > 1 ? 's' : ''} `
    + `déjà ouvert${o.dossiersLus > 1 ? 's' : ''} dans cette fenêtre`;
  /**
   * 🔴 LA LIMITE EST DITE DANS TOUS LES CAS, et elle n'est pas la même :
   *   · sans empreinte (un document Google natif), seul le registre a pu répondre ;
   *   · avec empreinte et sans index, la comparaison porte sur ce qu'on a rangé et sur les dossiers ouverts ;
   *   · avec un index, elle porte sur les fichiers indexés — et l'index a une date, ce qui se dit aussi.
   */
  const indexes = o.fichiersIndexes ?? null;
  const limite = !o.empreinteConnue
    ? ' Ce document n’a pas d’empreinte de contenu (document Google natif) : seules les copies faites par '
      + 'l’application sont connues.'
    : indexes !== null && indexes > 0
      ? ` La comparaison par empreinte a porté sur les ${indexes.toLocaleString('fr-FR')} fichiers du Drive dont `
        + `nous connaissons l’empreinte, plus les ${dossiers} : un fichier ajouté depuis le dernier relevé de `
        + 'l’index n’y est pas encore.'
      : ' La comparaison par empreinte n’a porté que sur ce que l’application a elle-même rangé, plus les '
        + `${dossiers} : le Drive n’est pas balayé, et une copie rangée ailleurs à la main n’apparaît pas ici.`;
  return `${debut}${comment}.${limite}`;
}

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   ④ 🔴🔴 LOT DRIVE-LOUPE-MENU-VITESSE — LE COMPTEUR VERT D'UNE VIGNETTE
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

/**
 * LA BULLE DU COMPTEUR VERT. PUR.
 *
 * Arno : « Compteur VERT dans la vignette : nombre d'emplacements où ce document est déjà rangé dans le Drive.
 * Masqué si 0. »
 *
 * ══ 🔴 DÉCISION D'ARNO (07/10/2026) : « DÉJÀ DANS LE DRIVE (N) », ET PLUS « RANGÉ N FOIS » ═════════════════════
 *
 * Le libellé disait un GESTE RÉPÉTÉ (« rangé N fois »), là où le compteur dit un ÉTAT : ce document se trouve à N
 * endroits du Drive. « N fois » laissait entendre qu'on l'avait rangé N fois — y compris deux fois au même
 * endroit, ce que le compteur ne compte justement pas (il compte des EMPLACEMENTS).
 *
 * 🔴 UNE SEULE FORME, SANS SINGULIER NI PLURIEL. Le nombre est entre parenthèses, donc la phrase ne change pas
 * avec lui : plus de branche `n > 1` à tenir d'accord avec elle-même. C'est la seule définition du libellé, et
 * les deux endroits qui l'affichent (la pastille verte de la vignette, la loupe) la lisent tous les deux.
 *
 * 🔴 VERT, ET C'EST UN ÉTAT D'ARRIVÉE. Il ne dit pas « à faire » : il dit « c'est déjà quelque part ». C'est la
 * même grammaire que la capsule « Classé » du module — le vert y signifie toujours « c'est traité ».
 *
 * ⚠️ MASQUÉ À ZÉRO, et c'est une règle, pas un détail d'affichage : un « 0 » vert se lirait comme une bonne
 * nouvelle alors qu'il dit exactement le contraire (ce document n'est rangé nulle part).
 */
export function bulleCompteurRange(n: number): string {
  return `Déjà dans le Drive (${n})`;
}
