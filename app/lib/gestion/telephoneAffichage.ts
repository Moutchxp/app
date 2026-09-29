import { normaliserTelephone } from './annuaire';

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
  const ecrit = (brut ?? '').trim();
  const e164 = (canonique ?? '').trim() !== '' ? (canonique as string).trim() : normaliserTelephone(ecrit);
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
    const { mot } = typeDeLibelle(c.libelle, c.sorte === 'email' ? 'email' : 'telephone');
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
