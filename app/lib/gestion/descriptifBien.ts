/**
 * ══ 🔴🔴 LOT MODALE-RATTACHER-PROPRE — CE QUE LA PASTILLE « i » MONTRE D'UN BIEN. PUR. ═════════════════════════
 *
 * DEMANDE D'ARNO (01/10/2026) : « une petite fenêtre flottante ancrée au bien, avec TOUT le descriptif connu du
 * bien : type, nature, étage, surface, nombre de pièces, annexes (parking, cave inclus), bâtiment ou escalier,
 * numéro de lot, immeuble, propriétaire(s), locataire en place, date d'entrée, en gestion depuis, dossier Drive,
 * et tout autre champ de la fiche bien. Un champ vide n'est pas affiché ; s'il ne reste presque rien, la fenêtre
 * l'indique (“descriptif à compléter dans la fiche du bien”). »
 *
 * ═══ 🔴🔴 CE QUE L'IMPORT WIPPIMMO PORTE RÉELLEMENT, MESURÉ LE 01/10/2026 ═══════════════════════════════════════
 *
 * `gestion_annuaire_lot` a EXACTEMENT ces colonnes descriptives : `nature`, `type_bien`, `immeuble`, `adresse`,
 * `code_postal`, `commune`, `gestion_debut`, `gestion_fin`. Il n'y a NI étage, NI surface, NI nombre de pièces,
 * NI annexes, NI escalier — ces champs n'existent nulle part dans la base, et aucune lecture ne peut les
 * inventer. Le reste du descriptif vient des tables voisines : propriétaires, occupations, dossier Drive.
 *
 * 🔴 C'EST EXACTEMENT POURQUOI LA RÈGLE « un champ vide n'est pas affiché » COMPTE ICI. Elle n'est pas une
 * politesse d'affichage : elle est ce qui permet d'écrire la liste COMPLÈTE qu'Arno demande sans mentir sur ce
 * que la base sait. Le jour où l'import portera l'étage, il suffira de l'ajouter à `LIGNES` — et il apparaîtra.
 *
 * ⚠️ AUCUNE E/S : l'appelant lit la fiche, ce module décide de ce qui s'affiche et dans quel ordre.
 */

/** Une ligne du descriptif : un libellé, une valeur. Jamais de valeur vide — c'est la règle du module. */
export interface LigneDescriptif {
  libelle: string;
  valeur: string;
}

/** Ce qu'on sait d'un bien. Tout est facultatif : on affiche ce qui est là, et rien d'autre. */
export interface BienDecrit {
  cle?: string | null;
  nature?: string | null;
  typeBien?: string | null;
  /** L'étage, la surface, le nombre de pièces, les annexes, l'escalier : ABSENTS de la base aujourd'hui. */
  etage?: string | null;
  surface?: string | null;
  pieces?: string | null;
  annexes?: string | null;
  escalier?: string | null;
  immeuble?: string | null;
  adresse?: string | null;
  codePostal?: string | null;
  commune?: string | null;
  gestionDebut?: string | null;
  gestionFin?: string | null;
  /** Les propriétaires, déjà nommés par l'appelant (l'annuaire sait les composer, pas nous). */
  proprietaires?: readonly string[] | null;
  /** Le ou les occupants EN PLACE, avec leur date d'entrée telle que la fiche la donne. */
  occupants?: readonly { nom: string; depuis?: string | null }[] | null;
  /** L'identifiant du dossier Drive du lot, quand l'arbre le connaît. */
  driveDossierId?: string | null;
}

const propre = (x: string | null | undefined): string => (x ?? '').trim();

/** Une date ISO écrite à la française, ou la chaîne telle quelle si elle n'en est pas une. PUR. */
function dateLisible(brut: string | null | undefined): string {
  const t = propre(brut);
  if (!/^\d{4}-\d{2}-\d{2}/.test(t)) return t;
  const [a, m, j] = t.slice(0, 10).split('-');
  return `${j}/${m}/${a}`;
}

/**
 * ══ 🔴 L'ORDRE DES LIGNES, ET IL EST CELUI D'ARNO ═══════════════════════════════════════════════════════════════
 *
 * Il part de ce qui qualifie le bien (ce qu'il EST), passe à ce qui le situe (où il est, dans quel bâtiment),
 * puis à qui il appartient et qui l'occupe, et finit par l'administratif (gestion, dossier). C'est l'ordre dans
 * lequel on lit une fiche quand on cherche à reconnaître un bien, et c'est celui de sa demande.
 *
 * ⚠️ LE NUMÉRO DE LOT EST ICI, ET SEULEMENT ICI (avec la recherche). C'est la contrepartie exacte du titre, d'où
 * il vient d'être retiré : on ne le cache pas, on le range là où l'on va quand on veut l'identité du lot.
 */
export function descriptifDuBien(b: BienDecrit): LigneDescriptif[] {
  const out: LigneDescriptif[] = [];
  const ajouter = (libelle: string, valeur: string | null | undefined): void => {
    const v = propre(valeur);
    if (v !== '') out.push({ libelle, valeur: v });
  };

  // ① CE QUE LE BIEN EST.
  ajouter('Nature', b.nature);
  ajouter('Type', b.typeBien);
  ajouter('Nombre de pièces', b.pieces);
  ajouter('Surface', b.surface);
  ajouter('Annexes', b.annexes);
  // ② OÙ IL EST.
  ajouter('Adresse', adresseEntiere(b));
  ajouter('Étage', b.etage);
  ajouter('Escalier', b.escalier);
  // ⚠️ LE BÂTIMENT N'EST ÉCRIT QUE S'IL APPREND QUELQUE CHOSE : 283 lots sur 365 portent `immeuble` = `adresse`.
  if (!immeubleRepeteLAdresse(b)) ajouter('Bâtiment', b.immeuble);
  // ③ QUI.
  ajouter('Propriétaire', (b.proprietaires ?? []).map(propre).filter((x) => x !== '').join(', '));
  for (const o of b.occupants ?? []) {
    const nom = propre(o.nom);
    if (nom === '') continue;
    /**
     * 🔴 LOT PROPOSITIONS-EMAILS-MULTIPLES — LE NOM ET LA DATE SONT DEUX LIGNES, et c'est la condition pour tenir
     * la règle d'Arno (« elle n'affiche que ce qui n'est PAS déjà sur la ligne […] ni le locataire en place s'il
     * est déjà visible ; elle garde le reste, dont la date d'entrée »). Collés en une seule ligne, ils étaient
     * indissociables : cacher le nom déjà visible emportait la date, que personne n'avait vue.
     */
    ajouter('Locataire en place', nom);
    ajouter('Date d’entrée', dateLisible(o.depuis));
  }
  // ④ L'ADMINISTRATIF.
  ajouter('N° de lot', b.cle);
  ajouter('En gestion depuis', dateLisible(b.gestionDebut));
  ajouter('Gestion terminée le', dateLisible(b.gestionFin));
  ajouter('Dossier Drive', propre(b.driveDossierId) === '' ? '' : 'ouvert dans le Drive');
  return out;
}

/** L'adresse complète, composée ici et nulle part ailleurs dans ce module. PUR. */
export function adresseEntiere(b: BienDecrit): string {
  const lieu = [propre(b.codePostal), propre(b.commune)].filter((x) => x !== '').join(' ');
  return [propre(b.adresse), lieu].filter((x) => x !== '').join(', ');
}

/** Le bâtiment répète-t-il l'adresse ? (C'est le cas le plus fréquent de l'import.) PUR. */
export function immeubleRepeteLAdresse(b: BienDecrit): boolean {
  const i = propre(b.immeuble).toLowerCase();
  const a = propre(b.adresse).toLowerCase();
  return i === '' || i === a || a.includes(i) || i.includes(a);
}

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   🔴🔴 LOT PROPOSITIONS-EMAILS-MULTIPLES — LA FENÊTRE NE RÉPÈTE PAS LA LIGNE
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════

   DEMANDE D'ARNO (01/10/2026) : « Elle n'affiche que ce qui n'est PAS déjà sur la ligne : ni l'adresse, ni le
   type, ni le propriétaire, ni le locataire en place s'ils sont déjà visibles. Elle garde le reste (étage,
   surface, pièces, annexes, bâtiment, n° de lot, immeuble, date d'entrée, en gestion depuis, dossier Drive…). »

   🔴 ON COMPARE À CE QUI EST VRAIMENT AFFICHÉ, ET NON À UNE LISTE DE LIBELLÉS DEVINÉE. La version précédente
   supposait que le titre portait toujours « nature, type, adresse » : le jour où un écran titre autrement, la
   fenêtre se serait tue sur une information qu'on ne voyait nulle part, ou aurait répété ce qu'on avait sous les
   yeux. L'appelant passe le TEXTE de la ligne ; la règle suit toute seule.

   ⚠️ LE CODE POSTAL NE COMPTE PAS dans la comparaison : la ligne écrit « 10 rue Chateaubriand, CHATILLON » là où
   la fiche écrit « 10 rue Chateaubriand, 92320 CHATILLON ». L'exiger aurait fait répéter l'adresse partout.
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

/**
 * Minuscules, accents ôtés, ponctuation en espaces. PUR.
 *
 * ⚠️ ÉCRITE ICI, parce que ce module ne doit RIEN importer (un garde statique le vérifie) : il décide de ce qui
 * s'affiche, et doit pouvoir se rejouer tout seul.
 */
function aplatir(t: string | null | undefined): string {
  return (t ?? '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

/**
 * 🔴 LES SEULES LIGNES QU'ON ACCEPTE D'EFFACER, et c'est exactement la liste d'Arno.
 *
 * ⚠️ AUCUNE AUTRE, JAMAIS. « N° de lot » vaut « 360 » : un titre qui contiendrait ce nombre par hasard ferait
 * disparaître l'identité du lot — la seule ligne qu'on vient chercher quand on doute du bien.
 */
export const LIGNES_EFFACABLES: readonly string[] = [
  'Adresse', 'Nature', 'Type', 'Propriétaire', 'Locataire en place',
];

/**
 * CE QUI RESTE À MONTRER, UNE FOIS RETIRÉ CE QUE LA LIGNE DIT DÉJÀ. PUR.
 *
 * `surLaLigne` = tout ce qui est visible à côté de la pastille : le titre du bien, et les parties écrites
 * dessous. Vide ⇒ on ne retire rien (on ne sait pas ce qui est affiché, donc on n'enlève rien).
 */
export function descriptifHorsLigne(
  lignes: readonly LigneDescriptif[], surLaLigne: string | null | undefined,
): LigneDescriptif[] {
  const ligne = ` ${aplatir(surLaLigne)} `;
  if (ligne.trim() === '') return [...lignes];
  return lignes.filter((l) => {
    if (!LIGNES_EFFACABLES.includes(l.libelle)) return true;
    const mots = aplatir(l.valeur).split(' ').filter((m) => m !== '' && !/^\d{5}$/.test(m));
    // Tous les mots sur la ligne ⇒ la fenêtre ne ferait que répéter. Un seul manque ⇒ elle apprend quelque chose.
    return mots.length === 0 || !mots.every((m) => ligne.includes(` ${m} `));
  });
}

/**
 * 🔴 « S'IL NE RESTE RIEN : “Aucun détail supplémentaire — compléter la fiche du bien”, avec le lien » (Arno).
 *
 * Une seule formulation, un seul endroit. Elle remplace « Descriptif à compléter… », qui parlait d'un descriptif
 * pauvre alors qu'il s'agit maintenant d'un descriptif entièrement visible sur la ligne : ce n'est pas la même
 * chose, et la phrase ne devait pas laisser croire que la fiche est vide.
 */
export const AUCUN_DETAIL_SUPPLEMENTAIRE = 'Aucun détail supplémentaire — compléter la fiche du bien';
