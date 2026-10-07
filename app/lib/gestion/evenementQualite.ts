/**
 * MODULE « GESTION » — LOT CONTACTS-ET-EVENEMENT : DE QUOI S'AGIT-IL, ET EST-CE URGENT ? Module PUR.
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * 🔴 POURQUOI CE FICHIER EXISTE À PART. Ces listes et ces mots sont lus des DEUX côtés de la frontière : par le geste
 * serveur qui écrit la carte (`gestes.ts`, qui tire `pg`) ET par le bloc « Événement rattaché », qui est un
 * composant de NAVIGATEUR. Les laisser dans `gestes.ts` obligeait le navigateur à importer un module qui remonte
 * jusqu'à `pg`, donc jusqu'à `dns` — et webpack refuse alors de construire TOUTE l'application, page de connexion
 * comprise. C'est l'incident du 24/09/2026, et le garde `clientBoundary.guard.test.ts` l'a rattrapé ici même
 * pendant l'écriture de ce lot.
 *
 * ⚠️ AUCUN IMPORT, AUCUNE BASE, AUCUN React. Des constantes et quatre fonctions pures.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   ══ 🔴🔴 LOT CAPSULE-TYPE-EVENEMENT, POINT 2 — LA LISTE DES TYPES, ÉCRITE UNE SEULE FOIS ═══════════════════════

   ARNO (07/10/2026) : « Il faut UNE seule source de vérité pour la liste des types, lue par TOUS ces endroits.
   Ainsi, un type créé plus tard apparaît automatiquement partout (listes de choix, filtres, capsule) sans toucher
   au code de chaque écran. »

   ═══ CE QUI ÉTAIT RECOPIÉ, ET QUI NE L'EST PLUS ═════════════════════════════════════════════════════════════════
   La liste vivait à TROIS endroits :
     ① `CATEGORIES_EVENEMENT`, un tableau de CLÉS — juste en dessous, et il reste, mais DÉRIVÉ ;
     ② `motCategorie()`, une chaîne de `if` qui réécrivait les mêmes quatre clés pour leur donner un LIBELLÉ. Une
        clé ajoutée en ① sans ligne en ② rendait « Non précisée » — un type invisible, et personne pour le dire ;
     ③ la contrainte `gestion_evenement_categorie_chk`, en base (migration 268).

   ⇒ UNE SEULE DÉCLARATION, `TYPES_EVENEMENT`. ① et ② en SORTENT ; ③ est régénérée depuis elle par la migration
   317, et une épreuve compare le SQL de cette migration à ce tableau — c'est ce qui rend l'accord vérifiable au
   lieu d'être promis.

   ═══ AJOUTER UN TYPE PLUS TARD ══════════════════════════════════════════════════════════════════════════════════
   Une ligne ici, et une migration qui rejoue la contrainte. AUCUN écran à toucher : le formulaire de création, le
   formulaire de modification et la capsule de la carte lisent tous ce tableau. La couleur, elle, n'est même pas à
   choisir — voir `tonDuType`.
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

/** Un type d'événement : sa clé (celle qui s'écrit en base) et le mot qui s'affiche. Rien d'autre à déclarer. */
export interface TypeEvenement {
  cle: string;
  mot: string;
}

/**
 * LA LISTE, ET LA SEULE. Les quatre types d'Arno, mot pour mot.
 *
 * ⚠️ UNE CLÉ NE SE RENOMME PAS : elle est écrite dans `gestion_evenement.categorie` sur les cartes existantes, et
 * dans la contrainte de la base. Changer un MOT est sans danger ; changer une CLÉ demande une migration de données.
 */
export const TYPES_EVENEMENT: readonly TypeEvenement[] = [
  { cle: 'travaux', mot: 'Travaux' },
  { cle: 'fuite_eau', mot: 'Fuite d’eau' },
  { cle: 'administratif', mot: 'Administratif' },
  { cle: 'litige', mot: 'Litige' },
];

/**
 * Les clés seules — DÉRIVÉES, et plus écrites à la main. Le nom ne change pas : une quinzaine d'appels le lisent,
 * et le renommer aurait fait un lot de renommage là où il n'y avait qu'une source à unifier.
 */
export const CATEGORIES_EVENEMENT: readonly string[] = TYPES_EVENEMENT.map((t) => t.cle);

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   ══ 🔴🔴 LOT CAPSULE-TYPE-EVENEMENT, POINT 2 — LA COULEUR D'UN TYPE, SANS LA CHOISIR ═══════════════════════════

   ARNO : « La couleur d'un nouveau type est attribuée automatiquement et de façon stable (le même type garde
   toujours la même couleur), prise dans une palette tamisée du thème. Les 4 types actuels ont chacun une couleur
   fixe et distincte. »

   🔴 ELLE NE DÉPEND QUE DE LA CLÉ, et jamais du RANG dans la liste. C'est ce qui la rend stable pour de bon :
   insérer un type au milieu ne décale la couleur de personne, et le même type gardera la sienne même si la liste
   est réordonnée, dédoublée ou vidée autour de lui. Un index de tableau aurait fait l'inverse — tout le monde
   changerait de couleur au premier ajout, et l'œil aurait dû tout réapprendre.

   🔴 SEPT TONS, ET CE NOMBRE N'EST PAS ARBITRAIRE : c'est le PLUS PETIT qui donne quatre tons DISTINCTS aux quatre
   types d'aujourd'hui (mesuré : à cinq et à six, deux types tombent sur le même). L'épreuve le vérifie, pour que
   la propriété ne tienne pas à un souvenir.

   ⚠️ UN HUITIÈME TYPE POURRAIT PARTAGER UN TON AVEC UN AUTRE, et c'est assumé : avec une palette finie, l'unicité
   ne se promet pas. Elle n'est pas nécessaire non plus — LE MOT EST TOUJOURS ÉCRIT DANS LA CAPSULE, la couleur
   n'est qu'un appui. C'est la règle de tout le module : jamais une couleur seule pour porter une information.

   ⚠️ AUCUN CODE COULEUR ICI : on rend un NOM DE TON, et la feuille de style le traduit en jetons `--color-svv-*`,
   qui portent chacun leur variante Sombre. Écrire un `#rrggbb` dans ce module l'aurait rendu faux en thème sombre.
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

/** Les tons disponibles, dans l'ordre. Chacun a sa paire de jetons (fond pâle + texte foncé) dans `globals.css`. */
export const TONS_TYPE_EVENEMENT = [
  'vert', 'rouge', 'ambre', 'bleu', 'violet', 'sarcelle', 'rose',
] as const;

export type TonType = (typeof TONS_TYPE_EVENEMENT)[number];

/**
 * Le ton d'une clé. PUR, et totalement déterminé par la clé.
 *
 * ⚠️ LE CALCUL EST VOLONTAIREMENT BANAL (polynomial en base 31, le hachage des chaînes le plus courant) : il doit
 * être lisible et reproductible à la main, pas cryptographique. Le `>>> 0` garde l'entier NON SIGNÉ — sans lui,
 * un débordement rendrait un négatif et le modulo un index hors palette.
 */
export function tonDuType(cle: string): TonType {
  let n = 0;
  for (const c of cle) n = (Math.imul(n, 31) + (c.codePointAt(0) ?? 0)) >>> 0;
  return TONS_TYPE_EVENEMENT[n % TONS_TYPE_EVENEMENT.length];
}

/**
 * Ce que la capsule écrit quand l'événement n'a pas de type. ARNO : « Événement SANS type : la capsule est quand
 * même là, en gris neutre, avec “Type à définir”. »
 *
 * 🔴 CETTE RÈGLE EN REMPLACE UNE AUTRE, et il faut le dire : le lot CARTE-EVENEMENT-EPUREE avait tranché « pas de
 * type → rien du tout ». Arno revient dessus le 07/10/2026 : « Arno veut toujours voir l'information. » Un vide ne
 * se distingue pas d'un oubli d'affichage ; un « Type à définir » se clique.
 */
export const MOT_TYPE_A_DEFINIR = 'Type à définir';

/** Les trois degrés d'urgence. Le MOT est toujours écrit à l'écran, jamais une couleur seule. */
export const URGENCES_EVENEMENT = ['normale', 'haute', 'critique'] as const;

/**
 * La catégorie retenue, ou `null`. PUR.
 *
 * ⚠️ ON N'INVENTE JAMAIS UNE CATÉGORIE QU'ON N'A PAS COMPRISE. Une valeur hors liste vaut « non précisé » — et la
 * contrainte de la base la refuserait de toute façon : deux gardes pour la même règle, parce qu'un garde applicatif
 * se contourne au prochain script et une contrainte non.
 */
export function categorieValide(brut: unknown): string | null {
  /* ⚠️ ON CONSULTE `TYPES_EVENEMENT`, ET NON `CATEGORIES_EVENEMENT` : cette dernière est une PHOTO prise au
     chargement du module. La différence ne se voit jamais en production, où la source est figée — elle se voit à
     l'épreuve, qui ajoute un type pour vérifier qu'il paraît partout, et c'est exactement le cas qu'on veut
     servir. Lire la source plutôt que sa copie, c'est une indirection de moins et une vérité de plus. */
  return typeof brut === 'string' && TYPES_EVENEMENT.some((t) => t.cle === brut) ? brut : null;
}

/** L'urgence retenue, ou `null`. PUR. */
export function urgenceValide(brut: unknown): string | null {
  return typeof brut === 'string' && (URGENCES_EVENEMENT as readonly string[]).includes(brut) ? brut : null;
}

/**
 * Le mot d'une catégorie, tel qu'il s'affiche. PUR.
 *
 * ══ 🔴🔴 RÉÉCRIT LE 07/10/2026 — LOT CAPSULE-TYPE-EVENEMENT, POINT 2 ═══════════════════════════════════════════
 * C'ÉTAIT UNE CHAÎNE DE QUATRE `if`, c'est-à-dire la liste des types écrite une SECONDE fois. Un type ajouté au
 * tableau sans sa ligne ici tombait sur « Non précisée » : il existait en base, il passait la contrainte, le
 * `<select>` le proposait — et la carte affichait « Non précisée ». Le défaut le plus silencieux qui soit.
 *
 * ⚠️ « Non précisée » RESTE LE REPLI, et il le faut : une valeur hors liste (une vieille carte, un script) doit se
 * lire pour ce qu'elle est plutôt que de rendre une chaîne vide.
 */
export function motCategorie(c: string | null | undefined): string {
  return TYPES_EVENEMENT.find((t) => t.cle === c)?.mot ?? 'Non précisée';
}

/** Le mot d'une urgence, tel qu'il s'affiche. PUR. */
export function motUrgence(u: string | null | undefined): string {
  if (u === 'critique') return 'Critique';
  if (u === 'haute') return 'Haute';
  if (u === 'normale') return 'Normale';
  return 'Non précisée';
}

/**
 * L'ÉVÉNEMENT EFFECTIF D'UN MAIL, tel que l'écran le reçoit. Le type vit ici, du côté PUR, pour que le composant
 * de navigateur n'ait aucune raison d'importer le dépôt qui le produit.
 */
export interface EvenementDuMail {
  evenementId: number;
  reference: string;
  objet: string;
  etat: string;
  /** `mail` = posé sur ce message seul ; `conversation` = hérité de son échange. */
  portee: 'mail' | 'conversation';
  categorie: string | null;
  urgence: string | null;
}

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   🔴🔴 LOT RATTACHEMENT-PONCTUEL, POINT 0 — LES DATES ET LA NOTE D'UNE CARTE NEUVE
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════

   ACCORD D'ARNO (06/10/2026), mot pour mot : « ajoute au formulaire PARTAGÉ de création d'événement les trois
   champs “date d'ouverture” (préremplie à la date du mail quand on vient d'un mail, sinon aujourd'hui), “date de
   clôture” (facultative) et “note” (facultative), dans son unique chemin d'écriture ».

   🔴 AUCUNE MIGRATION N'A ÉTÉ NÉCESSAIRE, et c'est vérifié en base avant d'écrire une ligne : `gestion_evenement`
   porte DÉJÀ `ouvert_le` (NOT NULL, défaut `now()`), `traite_le` et `note`. Ce qui manquait n'était pas la place,
   c'était le chemin : la création ne nommait aucune de ces trois colonnes.

   🔴🔴 LA CONTRAINTE DE LA BASE DICTE LA RÈGLE, ET PAS L'INVERSE :
   `gestion_evenement_traite_chk :: CHECK ((etat = 'traite') = (traite_le IS NOT NULL))`. Donner une date de
   clôture à la création veut donc dire, en base comme en français, que la carte naît CLOSE — et son état doit
   être `traite`. Écrire l'une sans l'autre serait refusé par la base ; on l'écrit donc d'un seul geste.

   ⚠️ UNE CLÔTURE AVANT L'OUVERTURE EST REFUSÉE, et ce n'est pas un détail d'ergonomie : une carte close avant
   d'être ouverte fausse tous les comptes de durée, et personne ne la retrouverait pour la corriger.
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

/** Un jour civil `AAAA-MM-JJ`, ou `null` si ce n'en est pas un. PUR. */
export function jourCivil(brut: unknown): string | null {
  if (typeof brut !== 'string') return null;
  const j = brut.trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(j)) return null;
  /* ⚠️ ON VÉRIFIE QUE LA DATE EXISTE, pas seulement sa forme : « 2026-02-31 » a la bonne forme et n'existe pas. */
  const d = new Date(`${j}T12:00:00Z`);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10) === j ? j : null;
}

/** Ce que le refus dit, quand il y en a un. Une phrase, pas un code. */
export const MOT_CLOTURE_AVANT_OUVERTURE =
  'La date de clôture ne peut pas précéder la date d’ouverture.';

export interface BornesEvenement {
  /** Le jour d'ouverture retenu, ou `null` = « laisse la base poser aujourd'hui ». */
  ouvertLe: string | null;
  /** Le jour de clôture retenu, ou `null` = la carte reste à traiter. */
  closLe: string | null;
  /** `null` = rien à redire. Sinon, la phrase à afficher, et RIEN n'est écrit. */
  refus: string | null;
}

/**
 * LES DEUX BORNES D'UNE CARTE NEUVE, VALIDÉES. PUR.
 *
 * ⚠️ UNE SAISIE ILLISIBLE VAUT « NON RENSEIGNÉE », jamais une erreur : un champ de date vidé rend `''`, et
 * refuser le geste pour cela aurait bloqué la création sur un champ facultatif.
 */
export function bornesEvenement(ouvertLeBrut: unknown, closLeBrut: unknown): BornesEvenement {
  const ouvertLe = jourCivil(ouvertLeBrut);
  const closLe = jourCivil(closLeBrut);
  if (ouvertLe !== null && closLe !== null && closLe < ouvertLe) {
    return { ouvertLe, closLe, refus: MOT_CLOTURE_AVANT_OUVERTURE };
  }
  return { ouvertLe, closLe, refus: null };
}

/**
 * La note retenue : tronquée au plafond, ou `null`. PUR.
 *
 * ⚠️ LE PLAFOND EST NOMMÉ ET NON DEVINÉ. La colonne est un `text` sans borne ; c'est donc l'écran qui doit en
 * poser une, sans quoi un copier-coller de dix pages entrerait dans une carte et la rendrait illisible partout
 * où elle s'affiche.
 */
export const NOTE_EVENEMENT_MAX = 2000;

export function noteEvenement(brut: unknown): string | null {
  if (typeof brut !== 'string') return null;
  const n = brut.trim();
  return n === '' ? null : n.slice(0, NOTE_EVENEMENT_MAX);
}
