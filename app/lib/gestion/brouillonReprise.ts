import type { Brouillon, CibleBrouillon, VoieRedaction } from './redaction';
import { texteVersHtml } from './htmlMail';

/**
 * LOT APERCU-PAGE1 + BROUILLONS — ROUVRIR UN BROUILLON DANS L'ÉDITEUR.
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * 🔴🔴 LE DÉFAUT, DIT PAR ARNO : « Aujourd'hui les brouillons ne s'ouvrent pas. » Il avait raison, et pas à moitié :
 * RIEN dans l'application ne relisait un brouillon enregistré. La liste « Brouillons » ne proposait que de rouvrir la
 * CONVERSATION du brouillon — donc rien du tout pour un message neuf, qui n'a pas de conversation. La route savait
 * pourtant le rendre (`GET /api/admin/gestion/brouillons?fil=…`, écrite au lot 5e) : personne ne l'appelait.
 * On enregistrait donc scrupuleusement un travail qu'on ne savait plus reprendre.
 *
 * 🔴 CE MODULE EST LA TRADUCTION, et il est PUR : la base parle de `repondAMessageId`, l'éditeur de
 * `repondALeMessageId` ; la base garde `corps` ET `corps_html`, l'éditeur veut savoir lequel montrer. Un brouillon
 * mal traduit ne « plante » pas : il rouvre en perdant silencieusement des destinataires ou la mise en forme. C'est
 * exactement le genre de faute qui se prouve sans écran, et c'est pourquoi elle vit ici.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */

/** Un brouillon tel que la route le rend. Seuls les champs dont la reprise a besoin sont nommés. */
export interface BrouillonEnregistre {
  id: number;
  filId: number | null;
  repondAMessageId: number | null;
  voie: VoieRedaction;
  a: string[];
  cc: string[];
  cci: string[];
  objet: string;
  corps: string;
  corpsHtml: string | null;
  citation: string | null;
  majLe: string;
  /**
   * 🔴 LOT CLASSER-DEUX-BOUTONS — le classement décidé pendant la rédaction, retrouvé à la réouverture.
   * ⚠️ FACULTATIFS : une route d'avant ce lot (ou sans la migration 285) ne les rend pas, et l'éditeur repart
   * alors de l'état initial — les deux boutons — plutôt que d'un état inventé.
   */
  cibles?: CibleBrouillon[];
  interne?: boolean;
}

/** Le brouillon prêt pour l'éditeur : la forme de l'écran, plus son identifiant et la marque « repris ». */
export type BrouillonRepris = Brouillon & { id: number; repris: true };

/**
 * ══ LA TRADUCTION ══════════════════════════════════════════════════════════════════════════════════════════════
 *
 * 🔴 `repris: true` N'EST PAS DÉCORATIF. L'éditeur abandonne, à la fermeture, un brouillon que PERSONNE n'a touché
 * — c'est la règle du lot BROUILLON-SILENCIEUX, celle qui empêche de semer des lignes vides. Or un brouillon ROUVERT
 * part précisément de ce qu'il contient : l'écart avec « ce que l'éditeur a pré-rempli » est nul, et la règle, prise
 * au mot, l'abandonnerait pour l'avoir seulement REGARDÉ. La marque dit à l'éditeur : celui-là, tu ne l'as pas créé.
 *
 * 🔴 LA CITATION REPART AUSSI EN HTML. La base ne garde que sa version texte (il n'y a pas de colonne pour l'autre).
 * La reconvertir ici évite qu'un brouillon rouvert parte avec la citation pour qui lit en texte et SANS elle pour qui
 * lit en HTML — une moitié des destinataires verrait le message d'origine, l'autre non.
 *
 * ⚠️ `destinatairesApproximatifs` EST FAUX, et c'est un fait, pas un défaut : la mention avertit qu'on a DEVINÉ les
 * destinataires d'un message mal détaillé. Ceux d'un brouillon ont été enregistrés tels quels — les dire approximatifs
 * serait un avertissement mensonger, et un avertissement mensonger fait ignorer les vrais.
 */
export function reprendreBrouillon(b: BrouillonEnregistre): BrouillonRepris {
  const html = (b.corpsHtml ?? '').trim();
  const citation = (b.citation ?? '').trim() === '' ? null : b.citation;
  return {
    id: b.id,
    repris: true,
    voie: b.voie,
    a: [...b.a], cc: [...b.cc], cci: [...b.cci],
    objet: b.objet,
    corps: b.corps,
    corpsHtml: html === '' ? null : b.corpsHtml,
    citation,
    citationHtml: citation === null ? null : texteVersHtml(citation),
    destinatairesApproximatifs: false,
    filId: b.filId,
    repondALeMessageId: b.repondAMessageId,
    // 🔴 LOT CLASSER-DEUX-BOUTONS — le classement revient tel qu'il a été laissé.
    cibles: [...(b.cibles ?? [])],
    interne: b.interne === true,
  };
}

/**
 * LA CLÉ DE LA FENÊTRE qui porte un brouillon. Elle tient à l'IDENTIFIANT, et à rien d'autre : recliquer sur le même
 * brouillon doit RÉTABLIR sa fenêtre, jamais en ouvrir une seconde sur le même travail — on écrirait deux fois dans
 * la même ligne, et le dernier enregistrement mangerait l'autre.
 */
export function cleFenetreBrouillon(id: number): string {
  return `brouillon:${id}`;
}

/**
 * ══ L'ORDRE DE LA LISTE : DU PLUS RÉCEMMENT MODIFIÉ AU PLUS ANCIEN ═════════════════════════════════════════════
 *
 * La base rend déjà cet ordre (`ORDER BY maj_le DESC, id DESC`). On le REFAIT ici, et ce n'est pas de la méfiance :
 * l'ordre est une promesse faite à l'écran, et une promesse d'écran se tient dans du code qu'on peut éprouver sans
 * base. Le jour où la liste viendra d'un cache, d'une fusion ou d'une seconde source, elle sera encore triée.
 *
 * ⚠️ L'IDENTIFIANT DÉPARTAGE les dates égales — deux brouillons enregistrés dans la même seconde ne doivent pas
 * changer de place d'un affichage à l'autre. Un tri instable fait « sauter » des lignes sous le doigt.
 */
export function ordonnerBrouillons<T extends { id: number; majLe: string }>(liste: readonly T[]): T[] {
  return [...liste].sort((x, y) => (x.majLe === y.majLe ? y.id - x.id : (x.majLe < y.majLe ? 1 : -1)));
}
