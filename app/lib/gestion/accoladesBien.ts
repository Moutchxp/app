import { nbMailsCouverts } from './repereFenetre';
import { projeter, type Classement, type Periode } from './periodesConversation';
import { changementsDuFil, libelleSuiviModifie, type PeriodeAncienne } from './changementsSuivi';

/**
 * ══ 🔴🔴 LOT ACCOLADE-PARTOUT — LES ACCOLADES D'UN BIEN, DANS SON HISTORIQUE. Module PUR ════════════════════════════
 *
 * DEMANDE D'ARNO (11/10/2026) : « Dans l'historique d'un bien, l'accolade ne s'affiche que si la période concerne ce
 * bien (ajout ou retrait de ce bien à partir de ce mail). Libellé adapté : “À partir d'ici : suivi aussi par ce bien”
 * / “À partir d'ici : sorti du suivi de ce bien”. […] Plusieurs périodes successives : une accolade par changement,
 * dans l'ordre chronologique. »
 *
 * 🔴 LA MÊME LECTURE QUE LA VUE CONVERSATION : une accolade par fenêtre « la suite » (jamais celle du premier mail,
 * qui ne sépare rien — `reperesDuFil`), et l'« avant » est la fenêtre qui couvrait le mail précédent
 * (`comparatifRepere`). On ne garde que celles où CE bien entre ou sort.
 */

export const LIBELLE_AJOUT = 'suivi aussi par ce bien';
export const LIBELLE_RETRAIT = 'sorti du suivi de ce bien';

/**
 * ══ 🔴🔴 LOT ACCOLADE-AU-MAIL-DECLENCHEUR-ET-LIBELLES — LA RÈGLE S'ÉLARGIT (Arno, 12/10/2026) ═══════════════════════════
 * « TOUT changement de portée “Ce mail + futurs échanges” (et “Toute la conversation”) affiche l'accolade complète,
 * ancrée au mail déclencheur, dans l'historique de CHAQUE bien concerné (avant ou après), que le bien entre, sorte ou
 * reste suivi. Quand le bien reste suivi : “À partir d'ici : suivi modifié — N biens rattachés”. »
 * L'ancienne règle (« seulement si CE bien entre ou sort ») taisait le cas du 25 rue Edith Cavell, resté suivi.
 * Les changements sont ceux de `changementsDuFil` (le premier mail compris quand c'est un geste).
 */

export interface AccoladeDuBien {
  filId: number;
  /** Le mail À PARTIR duquel le changement vaut. */
  depuisMessageId: number;
  /** 🔴 `modif` : le bien RESTE suivi, le changement porte sur les autres biens (« suivi modifié — N biens rattachés »). */
  sens: 'ajout' | 'retrait' | 'modif';
  libelle: string;
  parLibelle: string | null;
  le: string | null;
  /**
   * 🔴 LOT MODALE-AVANT-APRES-DEUX-COLONNES — l'avant (fenêtre du mail précédent) et l'après de ce changement, pour la
   * fenêtre en deux colonnes du « i ». `null` = on ne sait pas les composer : la pastille ne s'affiche pas.
   */
  detail: { avant: Classement | null; interneEchangeAvant: boolean; apres: Classement } | null;
  nbMails: number;
  /** 🔴 Les autres changements posés sur ce même mail, pour la fenêtre du « i » (Arno). */
  autres?: PeriodeAncienne[];
}

const contient = (c: Classement | null | undefined, cle: string): boolean =>
  c !== null && c !== undefined && c.sorte === 'biens' && c.biens.some((b) => b.cle === cle);

/** Les accolades d'UNE conversation pour UN bien, dans l'ordre chronologique. PUR. */
export function accoladesDuBienDansLeFil(o: {
  filId: number;
  mails: readonly number[];
  periodes: readonly Periode[];
  /** Les fenêtres refermées : l'« avant » d'un changement et les autres changements du même mail. */
  anciennes?: readonly PeriodeAncienne[];
  cle: string;
  interneDeLEchange?: boolean;
}): AccoladeDuBien[] {
  const out: AccoladeDuBien[] = [];
  for (const c of changementsDuFil({ mails: o.mails, periodes: o.periodes, anciennes: o.anciennes })) {
    const dedans = contient(c.avant, o.cle);
    const apres = contient(c.apres, o.cle);
    /* 🔴 CE BIEN N'EST CONCERNÉ NI AVANT NI APRÈS : l'accolade n'a rien à faire dans SON historique. */
    if (!dedans && !apres) continue;
    const sens: AccoladeDuBien['sens'] = dedans === apres ? 'modif' : (apres ? 'ajout' : 'retrait');
    out.push({
      filId: o.filId,
      depuisMessageId: c.depuisMessageId,
      sens,
      libelle: sens === 'ajout' ? LIBELLE_AJOUT : sens === 'retrait' ? LIBELLE_RETRAIT : libelleSuiviModifie(c.apres),
      parLibelle: c.periode.parLibelle ?? null,
      le: c.periode.le ?? null,
      detail: { avant: c.avant, apres: c.apres, interneEchangeAvant: o.interneDeLEchange === true },
      nbMails: nbMailsCouverts({ mails: o.mails, periodes: o.periodes, periodeId: c.periode.id }),
      autres: c.autres,
    });
  }
  return out;
}

/**
 * 🔴 LA MARQUE « INTERNE » POSÉE « POUR LA SUITE » (portée `suite`, migration 342). Elle commence au premier mail du
 * geste ; son « avant » est le classement que les fenêtres donnaient à ce mail, son « après » est Interne. PUR.
 */
export function accoladeInterneSuite(o: {
  filId: number;
  mails: readonly number[];
  periodes: readonly Periode[];
  /** Les mails marqués par CE geste (même pose), dans n'importe quel ordre. */
  marques: readonly number[];
  parLibelle: string | null;
  le: string | null;
  libelle: string;
  sens?: 'ajout' | 'retrait';
}): AccoladeDuBien | null {
  const rang = new Map(o.mails.map((m, i) => [m, i]));
  const premiers = o.marques.filter((m) => rang.has(m)).sort((a, b) => (rang.get(a) as number) - (rang.get(b) as number));
  const depuis = premiers[0];
  if (depuis === undefined || (rang.get(depuis) as number) <= 0) return null;
  const avant = projeter(o.mails, o.periodes, []).get(depuis);
  return {
    filId: o.filId, depuisMessageId: depuis, sens: o.sens ?? 'retrait', libelle: o.libelle,
    parLibelle: o.parLibelle, le: o.le,
    detail: { avant: avant ?? null, interneEchangeAvant: false, apres: { sorte: 'interne', biens: [] } },
    nbMails: premiers.length,
  };
}

/**
 * ══ OÙ POSER CHAQUE ACCOLADE DANS UNE LISTE DE MAILS. PUR. ═════════════════════════════════════════════════════════
 *
 * La liste de l'historique ne contient que les mails DU BIEN : le mail qui ouvre un retrait n'y est pas. L'accolade se
 * pose donc à SA PLACE DANS LE TEMPS : juste avant (chronologiquement) le premier mail affiché qui lui est postérieur
 * ou égal. Dans une liste « plus récent en haut », « avant » veut dire EN DESSOUS — c'est `coteDuRepere`, la règle de
 * la vue conversation : au-dessus du mail visé en ordre croissant (`dessus`), en dessous en ordre décroissant
 * (`dessous`).
 */
export type ElementListe<L, A> = { sorte: 'mail'; ligne: L } | { sorte: 'accolade'; accolade: A; cote: 'dessus' | 'dessous' };

export function placerAccolades<L extends { messageId: number; recuLe: string }, A extends { depuisMessageId: number; recuLe: string }>(
  lignes: readonly L[], accolades: readonly A[],
): ElementListe<L, A>[] {
  const t = (recuLe: string, id: number): [number, number] => [new Date(recuLe).getTime(), id];
  const avantQue = (a: [number, number], b: [number, number]): boolean => a[0] < b[0] || (a[0] === b[0] && a[1] < b[1]);
  /* L'ordre d'affichage : décroissant si le premier mail est plus récent que le dernier. */
  const desc = lignes.length >= 2
    && avantQue(t(lignes[lignes.length - 1].recuLe, lignes[lignes.length - 1].messageId), t(lignes[0].recuLe, lignes[0].messageId));
  const chrono = [...accolades].sort((x, y) => (avantQue(t(x.recuLe, x.depuisMessageId), t(y.recuLe, y.depuisMessageId)) ? -1 : 1));
  const ordre = desc ? [...chrono].reverse() : chrono;
  /* Pour chaque accolade : l'indice d'affichage AVANT lequel elle se pose. */
  const indiceDe = (a: A): number => {
    const ta = t(a.recuLe, a.depuisMessageId);
    const p = lignes.filter((l) => avantQue(t(l.recuLe, l.messageId), ta)).length;
    return desc ? lignes.length - p : p;
  };
  const out: ElementListe<L, A>[] = [];
  const cote: 'dessus' | 'dessous' = desc ? 'dessous' : 'dessus';
  for (let i = 0; i <= lignes.length; i += 1) {
    for (const a of ordre) if (indiceDe(a) === i) out.push({ sorte: 'accolade', accolade: a, cote });
    if (i < lignes.length) out.push({ sorte: 'mail', ligne: lignes[i] });
  }
  return out;
}

/**
 * ══ LES ACCOLADES QUI ONT LEUR PLACE SUR CETTE PAGE. PUR. ══════════════════════════════════════════════════════════
 * L'historique est paginé par le serveur. Une accolade est gardée si sa date tombe DANS la page ; au-delà d'un bout,
 * seulement si ce bout est celui de toute la liste (première page pour le début d'affichage, dernière pour la fin) —
 * sans quoi elle serait collée au bord d'une page qui ne la concerne pas.
 */
export function accoladesDeLaPage<A extends { recuLe: string }>(o: {
  lignes: readonly { recuLe: string }[];
  accolades: readonly A[];
  premierePage: boolean;
  dernierePage: boolean;
}): A[] {
  if (o.lignes.length === 0) return [];
  const ts = o.lignes.map((l) => new Date(l.recuLe).getTime());
  const min = Math.min(...ts);
  const max = Math.max(...ts);
  const desc = ts.length >= 2 && ts[ts.length - 1] < ts[0];
  /* Le bout d'AFFICHAGE du haut est le plus récent en ordre décroissant, le plus ancien en ordre croissant. */
  const recentAutorise = desc ? o.premierePage : o.dernierePage;
  const ancienAutorise = desc ? o.dernierePage : o.premierePage;
  return o.accolades.filter((a) => {
    const t = new Date(a.recuLe).getTime();
    if (t > max) return recentAutorise;
    if (t < min) return ancienAutorise;
    return true;
  });
}
