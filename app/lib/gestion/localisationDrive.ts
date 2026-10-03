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
export function motCompteur(n: number): string {
  if (n <= 0) return 'Aucun emplacement connu';
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
 * Masqué si 0. Bulle au survol : “Rangé N fois dans le Drive”. »
 *
 * 🔴 VERT, ET C'EST UN ÉTAT D'ARRIVÉE. Il ne dit pas « à faire » : il dit « c'est déjà quelque part ». C'est la
 * même grammaire que la capsule « Classé » du module — le vert y signifie toujours « c'est traité ».
 *
 * ⚠️ MASQUÉ À ZÉRO, et c'est une règle, pas un détail d'affichage : un « 0 » vert se lirait comme une bonne
 * nouvelle alors qu'il dit exactement le contraire (ce document n'est rangé nulle part).
 */
export function bulleCompteurRange(n: number): string {
  return n > 1 ? `Rangé ${n} fois dans le Drive` : 'Rangé 1 fois dans le Drive';
}
