import { normaliserTelephone } from './annuaire';
// LOT ANNOTATIONS-TEL — le lien « appeler » s'ecrit une seule fois, et il vit deja la, avec ses epreuves.
import { lienTelephone } from './ficheBien';

/**
 * LOT FICHES-RETOUCHES — DES NUMÉROS LISIBLES, ET UNE NOMENCLATURE UNIQUE. Module PUR : aucune base, aucun React.
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * 🔴🔴 LA RÈGLE D'ARNO, MOT POUR MOT : « Tout numéro affiché PAR L'APP est groupé par deux chiffres :
 * “06 59 08 82 56”. Format international : “+33 6 59 08 82 56”. Un numéro étranger non français est affiché tel
 * quel, avec ses espaces. »
 *
 * 🔴 AFFICHAGE SEULEMENT. Rien de ce qui est écrit ici ne touche au STOCKAGE ni aux COMPARAISONS : la base garde sa
 * forme canonique E.164 (`+33659088256`), et la recherche comme le rapprochement mail ↔ fiche continuent de
 * travailler sur les CHIFFRES. C'est cette séparation qui garantit qu'un espace ne crée jamais un doublon, ni une
 * fausse divergence dans le rapport de l'import WIPPIMMO.
 *
 * 🔴 ON NE TOUCHE PAS AU TEXTE DES MAILS. Un numéro cité dans le corps d'un message est le texte de son expéditeur :
 * le reformater serait réécrire ce que quelqu'un a écrit. Ce module ne sert QUE l'affichage de nos propres fiches.
 *
 * ⚠️ ON NE PRÉTEND PAS CONNAÎTRE LE PLAN DE NUMÉROTATION DE 200 PAYS. Un numéro étranger est rendu TEL QU'IL A ÉTÉ
 * ÉCRIT — 78 des 803 numéros de la base en sont (mesuré le 29/09/2026 : +212, +216, +237, +34, +39, +351, +1…).
 * Les regrouper par deux à l'aveugle produirait « +2 12 66 16 54 06 7 », qui n'est la convention d'aucun pays.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */

/** L'indicatif français, écrit une seule fois. */
const FR = '33';

/**
 * LES CHIFFRES D'UN NUMÉRO, ET RIEN D'AUTRE. C'est la forme sur laquelle on COMPARE.
 *
 * 🔴 POURQUOI ELLE EXISTE. Demande d'Arno : « Stockage et comparaisons (recherche, rapprochement mail ↔ fiche,
 * divergences de l'import WIPPIMMO) : sur les CHIFFRES seulement, pour qu'un espace ne crée jamais de fausse
 * divergence ni de doublon. » Deux écritures d'un même numéro (« 06 59 08 82 56 », « 0659088256 »,
 * « +33 6 59 08 82 56 ») rendent ici la même chose à l'indicatif près — et la forme canonique, elle, les rend
 * STRICTEMENT identiques.
 */
export function chiffresTelephone(brut: string | null | undefined): string {
  return (brut ?? '').replace(/\D/g, '');
}

/**
 * ══ 🔴🔴 LE NUMÉRO TEL QU'ON L'AFFICHE ════════════════════════════════════════════════════════════════════════════
 *
 * `canonique` est la forme E.164 de la base (`+33659088256`) ; `brut` est ce qui avait été ÉCRIT — par WIPPIMMO ou
 * par Arno. Les deux comptent, et pour des raisons différentes :
 *   · le CANONIQUE dit quel numéro c'est, donc comment le découper ;
 *   · le BRUT dit comment il était présenté — national ou international — et c'est ce choix qu'on respecte.
 *
 * 🔴 NATIONAL OU INTERNATIONAL : ON SUIT L'ÉCRITURE D'ORIGINE. Un numéro saisi « +33 6 59… » a été voulu
 * international (on le donne à l'étranger, on l'a lu sur une carte de visite) ; le ramener à « 06 59… » effacerait
 * une information. Un numéro saisi « 06 59… » reste national, parce que c'est ainsi qu'on le compose ici.
 *
 * ⚠️ UN NUMÉRO ILLISIBLE N'EST JAMAIS AVALÉ : faute de canonique, on rend le brut tel quel. Mesuré dans la base :
 * une ligne porte deux numéros collés (« +351932472464351934722745 », importée d'une cellule « … - … ») — elle
 * s'affiche telle quelle plutôt que découpée en paires qui ne voudraient rien dire.
 */
export function formaterTelephone(
  canonique: string | null | undefined, brut?: string | null,
): string {
  /**
   * ══ 🔴🔴 LOT ANNOTATIONS-TEL — L'ANNOTATION SORT AVANT TOUT LE RESTE ════════════════════════════════════════
   *
   * Demande d'Arno : « à l'affichage et à la comparaison, l'annotation est retirée du numéro ». C'est ici qu'elle
   * sort : ce qui suit ne voit plus qu'un numéro, et le formate comme n'importe quel autre.
   *
   * 🔴 ET LA FORME STOCKÉE N'EST PLUS CRUE SUR PAROLE. Mesuré le 30/09/2026 : 16 des 804 téléphones portent dans
   * `valeur` autre chose qu'un E.164 — un repli de l'import (« 0684711817 », « 06828316740682831674 »), parce que
   * l'annotation empêchait la normalisation. On renormalise donc le numéro NETTOYÉ, et on ne retombe sur la forme
   * stockée que si elle est déjà bonne. Rien n'est écrit en base : c'est une lecture, et elle est réversible.
   */
  const decort = decortiquerNumero(brut);
  const ecrit = decort.numero !== '' ? decort.numero : (brut ?? '').trim();
  const propose = (canonique ?? '').trim();
  const e164 = propose.startsWith('+') ? propose : normaliserTelephone(ecrit) ?? (propose !== '' ? propose : null);
  if (e164 === null || e164 === '') return ecrit;

  if (e164.startsWith(`+${FR}`)) {
    const national = e164.slice(1 + FR.length);
    if (/^[1-9]\d{8}$/.test(national)) {
      // « 6 59 08 82 56 » : le premier chiffre seul, puis des paires. C'est la convention des deux écritures.
      const paires = national.slice(1).replace(/(\d{2})(?=\d)/g, '$1 ');
      const international = ecrit.startsWith('+') || ecrit.replace(/[\s.\-()]/g, '').startsWith('00');
      return international
        ? `+${FR} ${national[0]} ${paires}`
        : `0${national[0]} ${paires}`;
    }
  }

  // ÉTRANGER — tel qu'il a été écrit, avec ses espaces. À défaut d'écriture, la forme canonique, inchangée.
  return ecrit !== '' ? ecrit : e164;
}

/**
 * ══ 🔴🔴 LE LIEN « appeler » D'UNE COORDONNÉE AFFICHÉE ════════════════════════════════════════════════════════════
 *
 * 🔴 DÉFAUT MESURÉ LE 30/09/2026, ET C'EST CE LOT QUI L'A RÉVÉLÉ. Les écrans construisaient le lien sur la colonne
 * `valeur`, sous un commentaire affirmant qu'elle porte « la forme canonique (+33…), qui compose partout ». C'est
 * faux pour 16 lignes sur 804 : l'annotation ayant fait échouer la normalisation à l'import, `valeur` y porte un
 * REPLI — « 0684711817 », et même « 06688073220629617981 », les DEUX numéros d'une cellule collés. Le lien de la
 * fiche DUBOIS composait vingt chiffres, c'est-à-dire rien.
 *
 * 🔴 ON REPART DONC DE L'AFFICHAGE, QUI A DÉJÀ ÉTÉ DÉCORTIQUÉ, et on le RENORMALISE : le lien porte l'E.164 quand
 * le numéro est français (« +33603050703 »), parce qu'un lien international compose aussi bien d'ici que de
 * l'étranger — c'est l'invariant que le lot FICHES-RETOUCHES avait posé, et il est conservé.
 *
 * ⚠️ UN NUMÉRO ÉTRANGER GARDE SON ÉCRITURE, faute de savoir le normaliser : « +1 949 933-9479 » devient
 * « tel:+19499339479 », sans ses espaces — un lien n'en porte jamais.
 * ⚠️ ET CE QUI N'EST PAS UN NUMÉRO N'EST PAS UN LIEN : « poste 42 » rendrait « tel:42 », qui appelle n'importe
 * qui. `lienTelephone` rend `null`, et l'écran affiche alors un texte simple.
 */
export function lienAppel(affichage: string | null | undefined): string | null {
  const vu = (affichage ?? '').trim();
  if (vu === '') return null;
  return lienTelephone(normaliserTelephone(vu) ?? vu);
}

/**
 * ══ 🔴 LE FORMATAGE PENDANT LA FRAPPE ═════════════════════════════════════════════════════════════════════════════
 *
 * Demande d'Arno : « le champ formate pendant la frappe (un espace tous les deux chiffres) et accepte 06…, +33…,
 * 0033…, les points et les tirets ».
 *
 * 🔴 ON NE FORMATE QUE CE QU'ON RECONNAÎT. Un numéro français en cours de frappe est mis en paires ; tout le reste
 * — un indicatif étranger, une note, un champ à demi effacé — est rendu INCHANGÉ. Reformater ce qu'on ne comprend
 * pas, c'est empêcher quelqu'un de taper ce qu'il veut, et c'est le plus sûr moyen de rendre un champ inutilisable.
 *
 * ⚠️ CETTE FONCTION NE VALIDE RIEN. « 06 5 » est un numéro incomplet, pas un numéro faux : le refus, lui, vient
 * de `verifierCoordonnees`, à l'enregistrement, avec son motif en français.
 */
export function formaterSaisieTelephone(frappe: string): string {
  const s = frappe ?? '';
  if (s.trim() === '') return s;
  const compact = s.replace(/[\s.\-()]/g, '');

  // « 0033… » est un « + » déguisé : la même écriture internationale, à la française.
  const inter = compact.replace(/^00(?=\d)/, '+');

  if (inter.startsWith(`+${FR}`)) {
    const national = inter.slice(1 + FR.length).replace(/\D/g, '').slice(0, 9);
    if (national === '') return `+${FR}`;
    return `+${FR} ${national[0]}${national.length > 1 ? ` ${paires(national.slice(1))}` : ''}`;
  }
  // Un autre indicatif : on n'y touche pas. On ne connaît pas son découpage, et l'inventer serait pire que rien.
  if (inter.startsWith('+')) return s;
  if (!/^\d+$/.test(compact)) return s;
  // National : « 06 59 08 82 56 ». Au-delà de 10 chiffres on laisse filer — c'est à la vérification de trancher.
  return paires(compact);
}

/**
 * ⚠️ `decortiquerNumero` EST DÉFINIE PLUS BAS, et c'est volontaire : elle appartient au chapitre des annotations,
 * et la remonter ici couperait le fil de la lecture. Une fonction nommée est hissée — l'appel est donc valide.
 */

/** Des chiffres regroupés par deux, séparés d'une espace. PUR. */
function paires(chiffres: string): string {
  return chiffres.replace(/(\d{2})(?=\d)/g, '$1 ');
}

/* ══════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   LA NOMENCLATURE DES COORDONNÉES — MOBILE, FIXE, E-MAIL
   ══════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

/**
 * ══ 🔴🔴 TROIS TYPES, ET TROIS SEULEMENT ══════════════════════════════════════════════════════════════════════════
 *
 * Demande d'Arno : « Supprime la 3e case (libellé en texte libre). La 1re case devient le TYPE, avec une liste
 * courte : “Mobile”, “Fixe”, “E-mail”. »
 *
 * 🔴 UNE LISTE FERMÉE PLUTÔT QU'UN CHAMP LIBRE. Mesuré dans la base le 29/09/2026, les libellés d'origine sont
 * « Mobile », « Mobile 1 » à « Mobile 4 », « Email », « Email 1 » à « Email 4 » — et RIEN D'AUTRE, sur les
 * 1 793 coordonnées. Le champ libre ne servait donc qu'à inventer une quatrième façon d'écrire « Mobile », que
 * personne ne retrouverait ensuite.
 *
 * ⚠️ LE TYPE PORTE AUSSI LA SORTE : un « E-mail » est un e-mail, un « Mobile » et un « Fixe » sont des téléphones.
 * Les tenir séparés aurait permis un « Mobile » de sorte e-mail, c'est-à-dire un état impossible.
 */
export type TypeCoordonnee = 'mobile' | 'fixe' | 'email';

export const TYPES_COORDONNEE: readonly { type: TypeCoordonnee; mot: string; sorte: 'telephone' | 'email' }[] = [
  { type: 'mobile', mot: 'Mobile', sorte: 'telephone' },
  { type: 'fixe', mot: 'Fixe', sorte: 'telephone' },
  { type: 'email', mot: 'E-mail', sorte: 'email' },
];

/** Le mot affiché d'un type. Écrit UNE fois : l'écran, la capsule et les épreuves doivent dire la même chose. */
export function motType(type: TypeCoordonnee): string {
  return TYPES_COORDONNEE.find((t) => t.type === type)?.mot ?? 'Mobile';
}

export function sorteDuType(type: TypeCoordonnee): 'telephone' | 'email' {
  return type === 'email' ? 'email' : 'telephone';
}

/**
 * ══ 🔴🔴 LE LIBELLÉ IMPORTÉ, RANGÉ DANS UN TYPE — À L'AFFICHAGE SEULEMENT ════════════════════════════════════════
 *
 * Demande d'Arno : « Libellés existants importés de WIPPIMMO (Mobile 1, Téléphone 2, Email 1…) : Mobile* → Mobile,
 * Téléphone* / Fixe* → Fixe, Email* → E-mail. Seulement à l'affichage : ne réécris rien en base sans me demander.
 * Un libellé qui ne se range dans aucun type reste affiché tel quel. »
 *
 * 🔴 AUCUNE ÉCRITURE. Cette fonction ne rend qu'un MOT. `libelle_source` et `libelle` restent intacts en base :
 * c'est la trace de ce que l'import disait, et la réécrire nous priverait du seul moyen de savoir d'où vient une
 * coordonnée le jour où deux exports se contredisent.
 *
 * ⚠️ « TÉLÉPHONE » DEVIENT « FIXE », ET C'EST UN CHOIX D'ARNO, pas une déduction : rien dans l'export ne dit qu'un
 * numéro nommé « Téléphone 2 » est un poste fixe. On suit la consigne, et on la nomme ici pour qu'on sache d'où
 * elle vient si elle se révèle fausse un jour.
 *
 * ⚠️ MESURÉ LE 29/09/2026 : aucun libellé de la base ne tombe hors des trois types (631 « Mobile », 172 « Mobile
 * 1..4 », 637 « Email », 355 « Email 1..4 », 2 sans libellé). Le repli « tel quel » est donc écrit pour l'avenir,
 * et non pour un cas connu.
 */
export function typeDeLibelle(
  libelle: string | null | undefined, sorte: 'telephone' | 'email',
): { type: TypeCoordonnee | null; mot: string } {
  const s = (libelle ?? '').trim();
  const sansAccent = s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

  if (/^mobile\b/.test(sansAccent) || sansAccent === 'portable') return { type: 'mobile', mot: 'Mobile' };
  if (/^(telephone|fixe|tel)\b/.test(sansAccent)) return { type: 'fixe', mot: 'Fixe' };
  if (/^(e-?mail|courriel|mail)\b/.test(sansAccent)) return { type: 'email', mot: 'E-mail' };

  // Pas de libellé du tout : le type se déduit de la sorte, qui, elle, ne ment pas.
  if (s === '') {
    return sorte === 'email' ? { type: 'email', mot: 'E-mail' } : { type: 'mobile', mot: 'Mobile' };
  }
  // Un libellé qu'aucun type ne couvre reste AFFICHÉ TEL QUEL — on ne le range pas de force dans une case fausse.
  return { type: null, mot: s };
}

/* ══════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   LES LIGNES D'UNE TUILE DE CONTACT
   ══════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

/** Une coordonnée telle que les écrans la reçoivent, quel que soit le dépôt qui l'a produite. */
export interface CoordonneeAffichable {
  sorte: 'telephone' | 'email' | string;
  libelle: string | null;
  /**
   * 🔴 LOT ANNOTATIONS-TEL — LE TYPE QUE L'ANNOTATION DU NUMÉRO IMPOSE, quand il y en a une. Il l'emporte sur le
   * libellé importé : « (F) » est écrit à côté du numéro lui-même, l'intitulé de colonne ne parle, lui, que de la
   * colonne. Absent ⇒ on retombe sur le libellé, comme avant ce lot.
   */
  typeAnnotation?: 'mobile' | 'fixe' | null;
}

/** Une ligne de tuile : la coordonnée, et le TITRE — écrit une seule fois par groupe. */
export interface LigneContact<T> {
  contact: T;
  /** « Mobile », « Fixe », « E-mail »… ou `null` quand la ligne est la SUITE d'un groupe déjà titré. */
  titre: string | null;
}

/** L'ordre de lecture des groupes. Ce qui n'est dans aucun type passe après, dans son ordre d'arrivée. */
const ORDRE_TYPES: readonly TypeCoordonnee[] = ['mobile', 'fixe', 'email'];

/**
 * ══ 🔴🔴 LOT CONTACT-LIGNES — LE TYPE PASSE DANS LE TITRE, ET NE S'ÉCRIT QU'UNE FOIS ═══════════════════════════════
 *
 * Constat d'Arno : « les petites capsules grises “Mobile” / “E-mail” sont en doublon avec le titre de la ligne ».
 * Elles l'étaient : la ligne disait « TÉLÉPHONE » à gauche et « Mobile » en capsule à droite de la valeur — deux
 * fois la même information, et deux fois l'occasion de se contredire.
 *
 * 🔴 LE TITRE DEVIENT LE TYPE : « MOBILE », « FIXE », « E-MAIL ». Il porte donc ce que la capsule disait, et la
 * capsule disparaît. Rien n'est perdu — c'est la même information, écrite une fois, à l'endroit qui lui revient.
 *
 * 🔴 « Plusieurs numéros du même type : le titre n'apparaît qu'une fois, en face du premier. » D'où le
 * REGROUPEMENT : les lignes d'un même type se suivent, et seule la première porte son titre. Sans le regroupement,
 * une liste mobile / fixe / mobile écrirait « MOBILE » deux fois, ce qui se lirait comme deux blocs distincts.
 *
 * ⚠️ L'ORDRE INTERNE D'UN GROUPE EST CONSERVÉ : c'est celui du rang, réglé à la main dans le mode Modifier (lot
 * FICHES-ANNUAIRE). On range les groupes, jamais les numéros d'un même groupe.
 *
 * ⚠️ UN LIBELLÉ HORS NOMENCLATURE FAIT SON PROPRE GROUPE, sous son intitulé d'origine : on ne le range pas de
 * force dans une case fausse, et deux libellés différents ne se fondent pas l'un dans l'autre. PUR.
 */
export function lignesParType<T extends CoordonneeAffichable>(contacts: readonly T[]): LigneContact<T>[] {
  /** Groupes dans leur ordre d'apparition, indexés par le MOT du titre — c'est lui qui distingue les groupes. */
  const groupes = new Map<string, T[]>();
  for (const c of contacts) {
    // 🔴 L'ANNOTATION DU NUMÉRO PASSE DEVANT LE LIBELLÉ DE LA COLONNE : elle est écrite à côté du numéro.
    const mot = c.typeAnnotation !== undefined && c.typeAnnotation !== null
      ? motType(c.typeAnnotation)
      : typeDeLibelle(c.libelle, c.sorte === 'email' ? 'email' : 'telephone').mot;
    groupes.set(mot, [...(groupes.get(mot) ?? []), c]);
  }

  const rang = (mot: string): number => {
    const i = ORDRE_TYPES.findIndex((t) => motType(t) === mot);
    // Un mot hors nomenclature passe après les trois types, dans son ordre d'arrivée.
    return i === -1 ? ORDRE_TYPES.length : i;
  };
  const mots = [...groupes.keys()].sort((a, b) => rang(a) - rang(b));

  const lignes: LigneContact<T>[] = [];
  for (const mot of mots) {
    for (const [i, contact] of (groupes.get(mot) ?? []).entries()) {
      lignes.push({ contact, titre: i === 0 ? mot : null });
    }
  }
  return lignes;
}

/* ══════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   🔴🔴 LOT ANNOTATIONS-TEL — CE QUI TRAÎNE À CÔTÉ D'UN NUMÉRO
   ══════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

/**
 * Ce qu'une cellule de téléphone porte vraiment : le numéro, ce que l'annotation dit de son TYPE, et ce qui reste
 * et mérite d'être lu.
 */
export interface NumeroDecortique {
  /** Le numéro SEUL, débarrassé de son annotation. C'est lui qu'on normalise, affiche et compare. */
  numero: string;
  /**
   * Le type que l'annotation impose : « (M) » → Mobile, « (F) », « Bureau » → Fixe. `null` = elle n'en dit rien.
   *
   * ⚠️ NI « email » NI RIEN D'AUTRE : une annotation collée à un NUMÉRO ne peut désigner qu'un téléphone. Le type
   * est donc volontairement plus étroit que `TypeCoordonnee` — un état impossible n'a pas à être représentable.
   */
  type: 'mobile' | 'fixe' | null;
  /** Ce qui reste et porte une information : « M.Moreau », un second numéro, un poste. Petite note grise. */
  note: string | null;
}

/**
 * Les annotations qui désignent un TYPE, et rien d'autre. Comparaison sur la forme réduite (sans accent, sans
 * ponctuation, en minuscules) et EXACTE.
 *
 * 🔴 EXACTE, ET C'EST LE POINT DÉLICAT. « M.Moreau » COMMENCE par « M » : une comparaison par préfixe en aurait
 * fait un mobile et aurait jeté le nom de la personne. Mesuré dans la base : c'est précisément le cas de la ligne
 * 944 (`0663219393 (M.Moreau)`), la seule annotation qui porte un vrai renseignement.
 */
const ANNOTATIONS_TYPE: Readonly<Record<string, 'mobile' | 'fixe'>> = {
  m: 'mobile', mob: 'mobile', mobile: 'mobile', port: 'mobile', portable: 'mobile', gsm: 'mobile',
  f: 'fixe', fixe: 'fixe', dom: 'fixe', domicile: 'fixe', bureau: 'fixe', bur: 'fixe', pro: 'fixe',
  tel: 'fixe', standard: 'fixe',
};

/** Au moins six chiffres : en deçà, ce n'est pas un numéro mais une note qui contient un nombre. */
const CHIFFRES_MINIMUM = 6;

const compteChiffres = (s: string): number => (s.match(/\d/g) ?? []).length;

/**
 * ══ 🔴🔴 SÉPARER LE NUMÉRO DE CE QUI TRAÎNE AUTOUR ════════════════════════════════════════════════════════════════
 *
 * Demande d'Arno : « à l'affichage et à la comparaison, l'annotation est retirée du numéro ; si elle indique un
 * type (M = Mobile, F/Fixe/Bureau = Fixe), elle sert à classer la ligne sous MOBILE ou FIXE ; si elle porte une
 * info utile (poste, nom d'une personne), elle passe en petite note grise sous le numéro. »
 *
 * ═══ CE QUE LA BASE PORTE VRAIMENT, RECENSÉ LE 30/09/2026 SUR LES 804 TÉLÉPHONES ══════════════════════════════════
 *   · « (M) » ×3 et « M » nu ×1 — un type, déjà dit par le libellé « Mobile » : l'annotation ne faisait que le
 *     répéter, en rendant le numéro illisible ;
 *   · « (M.Moreau) » ×1 — un NOM. La seule annotation qui apprenne quelque chose ;
 *   · « ? » ×3 — une marque de doute, sans autre contenu ;
 *   · DEUX NUMÉROS dans une seule cellule ×9 (« 06 47 58 26 61 - 07 84 54 12 94 ») : ce n'est pas une annotation,
 *     mais cela produit exactement le même symptôme — un nombre de vingt chiffres que personne ne sait lire.
 *   · AUCUNE annotation dans les 995 e-mails.
 *
 * 🔴 RIEN N'EST JETÉ. Ce qui n'est ni le numéro ni un type devient une NOTE, verbatim : on ne décide pas à la
 * place d'Arno que « ? » ou « M.Moreau » ne valent pas d'être lus. PUR.
 */
export function decortiquerNumero(brut: string | null | undefined): NumeroDecortique {
  const s = (brut ?? '').replace(/\s+/g, ' ').trim();
  if (s === '') return { numero: '', type: null, note: null };

  const notes: string[] = [];
  let type: 'mobile' | 'fixe' | null = null;

  /**
   * ① LES MORCEAUX ENTRE PARENTHÈSES sortent en premier : c'est la forme la plus fréquente (« (M) »,
   *   « (M.Moreau) »), et la plus facile à isoler sans toucher aux chiffres.
   */
  let reste = s.replace(/\(([^)]*)\)/g, (_tout, dedans: string) => {
    const mot = String(dedans).trim();
    const reduit = mot.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z]/g, '');
    /* Une parenthèse qui ne porte QUE des chiffres est un INDICATIF, pas une annotation : « (33) 6 12… ».
       ⚠️ ELLE EST RENDUE AVEC SES PARENTHÈSES : un numéro étranger s'affiche « tel quel, avec ses espaces »
       (consigne d'Arno), et « (+39)3495816850 » écrit sans ses parenthèses n'est plus ce que la personne a
       écrit. La comparaison n'en souffre pas : `normaliserTelephone` retire déjà les parenthèses. */
    if (compteChiffres(mot) > 0 && /^[\d\s.+-]*$/.test(mot)) return `(${mot})`;
    if (mot !== '' && reduit === mot.toLowerCase().replace(/[^a-z]/g, '') && ANNOTATIONS_TYPE[reduit] !== undefined
      && mot.replace(/[^A-Za-zÀ-ÿ]/g, '').length === reduit.length) {
      type = ANNOTATIONS_TYPE[reduit];
      return ' ';
    }
    if (mot !== '') notes.push(mot);
    return ' ';
  }).trim();

  /**
   * ② DEUX NUMÉROS DANS UNE CELLULE. L'export les sépare par « - » ou « / ». Le premier est LE numéro ; les
   *   suivants deviennent une note — on ne les perd pas, et on n'invente pas une seconde ligne dans l'annuaire,
   *   qui aurait un identifiant, un rang et un libellé que la base ne porte pas.
   */
  const morceaux = reste.split(/\s*[-/]\s*/).map((x) => x.trim()).filter((x) => x !== '');
  const numeros = morceaux.filter((x) => compteChiffres(x) >= CHIFFRES_MINIMUM);
  /**
   * ⚠️ ON NE COUPE QUE SI LES DEUX CÔTÉS SONT DES NUMÉROS. DÉFAUT TROUVÉ PAR LE RECENSEMENT LUI-MÊME, le
   * 30/09/2026 : « +1 949 933-9479 » est UN numéro américain, dont le tiret sépare les groupes. La version
   * d'avant en gardait « +1 949 933 » et reléguait « 9479 » en note — elle mutilait un numéro valide pour
   * croire en trouver deux. Un seul morceau porteur de chiffres ⇒ la chaîne entière est le numéro, tirets
   * compris, et c'est la normalisation qui tranchera.
   */
  if (numeros.length > 1) {
    reste = numeros[0];
    const vus = new Set([normaliserTelephone(numeros[0]) ?? numeros[0]]);
    for (const autre of numeros.slice(1)) {
      // ⚠️ LE SECOND NUMÉRO EST NETTOYÉ LUI AUSSI : « 06 98 61 20 52? » porte le même « ? » que le premier.
      const propre = autre.replace(/[^\d\s.()+-]/g, '').replace(/\s+/g, ' ').trim();
      const cle = normaliserTelephone(propre) ?? propre;
      /* ⚠️ UN NUMÉRO RÉPÉTÉ N'EST PAS UN SECOND NUMÉRO. Mesuré : la ligne 402 porte « 0682831674 - 0682831674 »,
         deux fois le même. Le noter « aussi : … » ferait croire à un autre numéro qu'il n'y a pas. */
      if (vus.has(cle)) continue;
      vus.add(cle);
      notes.push(`aussi : ${formaterTelephone(null, propre)}`);
    }
    for (const m of morceaux) if (compteChiffres(m) < CHIFFRES_MINIMUM && m !== '') notes.push(m);
  }

  /**
   * ③ CE QUI RESTE COLLÉ AU NUMÉRO : un « M » en suffixe, un « ? » en tête ou en queue. On retire tout ce qui
   *   n'est ni un chiffre ni un séparateur, en gardant trace de ce qu'on retire.
   */
  const horsNumero = reste.replace(/[\d\s.()+-]/g, '');
  if (horsNumero !== '') {
    const reduit = horsNumero.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z]/g, '');
    if (reduit !== '' && ANNOTATIONS_TYPE[reduit] !== undefined && reduit.length === horsNumero.length) {
      type = type ?? ANNOTATIONS_TYPE[reduit];
    } else {
      notes.push(horsNumero);
    }
    reste = reste.replace(/[^\d\s.()+-]/g, '').replace(/\s+/g, ' ').trim();
  }

  /**
   * ══ 🔴🔴 SANS NUMÉRO, PAS D'ANNOTATION — ON NE DÉCOUPE RIEN ════════════════════════════════════════════════
   *
   * DÉFAUT ATTRAPÉ PAR UNE ÉPREUVE EXISTANTE, le 30/09/2026 : « poste 42 » ressortait comme numéro « 42 » et note
   * « poste ». Le mot était jeté du numéro, et la cellule ne disait plus ce qu'elle disait.
   *
   * 🔴 UNE ANNOTATION N'EXISTE QUE COLLÉE À UN NUMÉRO. Si ce qui reste n'en porte pas assez de chiffres pour en
   * être un, c'est que la cellule entière est autre chose — une note, un renvoi, un texte libre — et elle est
   * rendue TELLE QUELLE. C'est l'invariant du module depuis le premier lot : ce qui n'est pas un numéro n'est
   * jamais avalé.
   */
  if (compteChiffres(reste) < CHIFFRES_MINIMUM) {
    return { numero: s, type: null, note: null };
  }

  return {
    numero: reste,
    type,
    note: notes.length === 0 ? null : notes.join(' · '),
  };
}
