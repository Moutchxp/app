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

/** Ce que l'écran consulte pour savoir s'il doit surligner une ligne. */
export interface Surlignage {
  /** Les FICHIERS trouvés : leur ligne est surlignée, c'est le bout du chemin. */
  fichiers: ReadonlySet<string>;
  /** Les DOSSIERS qui contiennent une occurrence, directement ou plus bas. Tous les niveaux y sont. */
  dossiers: ReadonlySet<string>;
  /** Combien d'emplacements connus. C'est le nombre du petit compteur, à côté de la loupe. */
  nombre: number;
}

export const SURLIGNAGE_VIDE: Surlignage = { fichiers: new Set(), dossiers: new Set(), nombre: 0 };

/**
 * ══ 🔴🔴 LE SURLIGNAGE, À CHAQUE NIVEAU. PUR. ═══════════════════════════════════════════════════════════════════
 *
 * Arno : « chaque dossier qui contient (directement ou plus bas) une occurrence du document est surligné. On
 * l'ouvre : le sous-dossier concerné est surligné, et ainsi de suite jusqu'à la ligne du fichier. »
 *
 * 🔴 C'EST LA CHAÎNE ENTIÈRE QUI ENTRE, pas seulement le dossier immédiat. Sans cela, un document rangé six
 * niveaux plus bas ne surlignerait RIEN tant qu'on ne serait pas déjà arrivé à côté de lui — c'est-à-dire que la
 * loupe ne servirait qu'à ceux qui savent déjà où chercher.
 *
 * ⚠️ PLUSIEURS EMPLACEMENTS ⇒ PLUSIEURS CHEMINS, et ils se mélangent sans se gêner : deux branches surlignées
 * côte à côte est exactement ce qu'Arno demande (« plusieurs emplacements → plusieurs chemins surlignés »).
 *
 * ⚠️ UNE OCCURRENCE SANS CHEMIN EST COMPTÉE MAIS NE SURLIGNE RIEN : on n'a pas su remonter ses parents, et
 * inventer un emplacement serait pire que de n'en montrer aucun.
 */
export function surlignageDe(occurrences: readonly Occurrence[]): Surlignage {
  const fichiers = new Set<string>();
  const dossiers = new Set<string>();
  for (const o of occurrences) {
    if (o.id.trim() === '') continue;
    fichiers.add(o.id);
    for (const d of o.chemin) if (d.id.trim() !== '') dossiers.add(d.id);
  }
  return { fichiers, dossiers, nombre: fichiers.size };
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
}): string {
  const debut = motCompteur(o.nombre);
  const voies: string[] = [];
  if (o.parRegistre > 0) voies.push(`${o.parRegistre} par le registre des copies de l’application`);
  if (o.parEmpreinte > 0) voies.push(`${o.parEmpreinte} par empreinte de contenu identique`);
  const comment = voies.length === 0 ? '' : ` — ${voies.join(', ')}`;
  /**
   * 🔴 LA LIMITE EST DITE DANS LES DEUX CAS, et elle n'est pas la même :
   *   · sans empreinte (un document Google natif), seul le registre a pu répondre ;
   *   · avec empreinte, la comparaison n'a porté que sur les dossiers déjà ouverts dans cette fenêtre.
   */
  const limite = !o.empreinteConnue
    ? ' Ce document n’a pas d’empreinte de contenu (document Google natif) : seules les copies faites par '
      + 'l’application sont connues.'
    : ` La comparaison par empreinte n’a porté que sur les ${o.dossiersLus} dossier${o.dossiersLus > 1 ? 's' : ''} `
      + 'déjà ouvert' + (o.dossiersLus > 1 ? 's' : '') + ' dans cette fenêtre : le Drive n’est pas balayé, et une '
      + 'copie rangée ailleurs à la main n’apparaît pas ici.';
  return `${debut}${comment}.${limite}`;
}
