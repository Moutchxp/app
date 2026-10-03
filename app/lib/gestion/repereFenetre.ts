import { motClassement, type Classement, type Periode } from './periodesConversation';

/**
 * ══ 🔴🔴 LOT VISUALISER-MAIL-ET-REPERE-FENETRE, POINT 2 — OÙ SE POSE LE REPÈRE, ET CE QU'IL EXPLIQUE ═════════════
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * CONSTAT D'ARNO (03/10/2026), fil 3490 : « le repère “À partir d'ici : aucun bien · jeudi 1 octobre 2026 à 20:12
 * · a.jorel@…” n'est pas placé au bon endroit. »
 *
 * ═══ 🔴🔴 LE DIAGNOSTIC, MESURÉ EN BASE PUIS À L'ÉCRAN ═══════════════════════════════════════════════════════════
 *
 * ① EN BASE. Le fil 3490 porte six mails — 5495 (23/09 15:25), 5499 (23/09 15:55), 57122 (28/09), 57368 (01/10
 *    12:46), 57472 (03/10 14:31), 57473 (03/10 15:00) — et deux fenêtres vivantes :
 *      · la 23836, depuis le mail 5495, « 2 Square Henri Régnault — lot 484 » ;
 *      · la 23812, depuis le mail 57368, « aucun bien », posée le 01/10 à 20:12 par a.jorel@.
 *    La première ne produit AUCUN repère (elle commence au premier mail : « À partir d'ici » en tête de
 *    conversation ne sépare rien). La seconde est celle qu'Arno voit, et elle commence bien au mail **57368**.
 *
 * ② À L'ÉCRAN. Relevé dans le navigateur, la liste étant en « Plus récent d'abord » :
 *      03/10 15:00 · 03/10 14:31 · **[REPÈRE]** · 01/10 12:46 · 28/09 · 23/09 15:55 · 23/09 15:25
 *    Le repère est donc rendu JUSTE AU-DESSUS du mail 57368 — ce qui est exact dans l'ordre ancien → récent, et
 *    FAUX dans celui-ci : au-dessus veut dire « plus tard ». La ligne paraît appartenir au mail du 03/10 14:31,
 *    alors qu'elle ouvre celui du 01/10 qui est en dessous.
 *
 * 🔴 LA CAUSE EST D'UNE LIGNE : le repère était rendu AVANT son mail dans le DOM, quel que soit le tri. Le mail
 * visé, lui, a toujours été le bon — ce n'est ni un problème de date de geste, ni un problème de calcul.
 *
 * RÈGLE D'ARNO : « le repère est attaché au MAIL QUI OUVRE LA FENÊTRE. Il est placé du côté qui le précède
 * chronologiquement, quel que soit l'ordre d'affichage (au-dessus en ordre ancien → récent, en dessous en ordre
 * récent → ancien). »
 *
 * 🔒 CE MODULE EST PUR : il décide d'un CÔTÉ et compose des MOTS. Aucune règle de fenêtre n'est touchée — ni la
 * création, ni la fermeture, ni la règle du dernier choix. C'est de l'affichage, et rien d'autre.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */

/** L'ordre d'affichage du fil, tel que l'écran le tient. */
export type OrdreAffichage = 'recent' | 'ancien';

/**
 * ══ 🔴🔴 DE QUEL CÔTÉ DU MAIL LE REPÈRE SE POSE. PUR. ════════════════════════════════════════════════════════════
 *
 * « Du côté qui le précède chronologiquement » (Arno). En ordre ancien → récent, ce qui précède est AU-DESSUS ; en
 * ordre récent → ancien, c'est EN DESSOUS. C'est tout le correctif, et il tient dans cette fonction.
 *
 * ⚠️ ON NE PARLE PAS DE « avant / après le mail dans la liste » MAIS DE CHRONOLOGIE : les deux coïncidaient dans
 * un seul des deux tris, et c'est précisément ce qui a fait croire que le repère était bien placé.
 */
export function coteDuRepere(ordre: OrdreAffichage): 'dessus' | 'dessous' {
  return ordre === 'ancien' ? 'dessus' : 'dessous';
}

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   🔴🔴 CE QUE LA PASTILLE « i » EXPLIQUE : UN AVANT / APRÈS
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

/** Un état de classement, mis en mots pour la comparaison. */
export interface EtatClassement {
  /** « Classé », « Interne », « Hors gestion ». */
  statut: string;
  /** « 2 Square Henri Régnault — lot 484 », ou « aucun bien ». */
  biens: string;
  /** Les personnes nommées par le classement. Vide = aucune. */
  personnes: string;
}

export const AUCUN_BIEN = 'aucun bien';
export const AUCUNE_PERSONNE = 'aucune personne nommée';

/** Le STATUT d'un classement, en un mot. PUR. */
export function motStatutClassement(c: Classement): string {
  if (c.sorte === 'interne') return 'Interne';
  if (c.sorte === 'hors_gestion') return 'Hors gestion';
  return 'Classé';
}

/** Les BIENS d'un classement, écrits. PUR. */
export function motBiens(c: Classement): string {
  if (c.sorte !== 'biens') return '—';
  const noms = c.biens.map((b) => b.libelle.trim()).filter((l) => l !== '');
  return noms.length === 0 ? AUCUN_BIEN : noms.join(', ');
}

/** Les PERSONNES d'un classement, écrites. PUR. */
export function motPersonnes(c: Classement): string {
  const noms = (c.personnes ?? []).map((p) => p.libelle.trim()).filter((l) => l !== '');
  return noms.length === 0 ? AUCUNE_PERSONNE : noms.join(', ');
}

export function etatDuClassement(c: Classement): EtatClassement {
  return { statut: motStatutClassement(c), biens: motBiens(c), personnes: motPersonnes(c) };
}

/**
 * ══ 🔴 LE TYPE DE CHOIX QUI A PRODUIT CETTE FENÊTRE. PUR. ════════════════════════════════════════════════════════
 *
 * Les trois mots sont ceux du bloc « Suivi dans la conversation », repris à la lettre — on ne réinvente pas un
 * vocabulaire pour expliquer un geste que l'écran nomme déjà autrement.
 *
 * ⚠️ UNE FENÊTRE QUI COMMENCE AU PREMIER MAIL COUVRE TOUTE LA CONVERSATION, et c'est ce que le geste disait. Une
 * fenêtre qui commence plus loin ouvre « ce mail et la conversation à venir ». « Ce mail uniquement » ne produit
 * pas de fenêtre du tout — c'est une exception, et elle se marque sur le mail lui-même.
 */
export const CHOIX_CONVERSATION = 'toute la conversation';
export const CHOIX_SUITE = 'ce mail et la conversation à venir';
export const CHOIX_MAIL = 'ce mail uniquement';

export function motChoixFenetre(rangDuMail: number): string {
  return rangDuMail <= 0 ? CHOIX_CONVERSATION : CHOIX_SUITE;
}

export interface ComparatifRepere {
  /** `null` = rien avant : cette fenêtre est la première du fil. */
  avant: EtatClassement | null;
  apres: EtatClassement;
  choix: string;
  qui: string | null;
  quand: string | null;
}

/**
 * ══ 🔴🔴 L'AVANT / APRÈS D'UNE FENÊTRE. PUR. ═════════════════════════════════════════════════════════════════════
 *
 * « Elle explique le changement avec un comparatif AVANT / APRÈS : biens (adresse, lot), statut (Classé / Interne
 * / Hors gestion), personnes, type de choix, qui, quand » (Arno).
 *
 * 🔴 L'« AVANT » EST LA FENÊTRE QUI COUVRAIT LE MAIL PRÉCÉDENT, et non « la fenêtre créée juste avant dans le
 * temps ». C'est la seule lecture qui répond à la question posée : « qu'est-ce qui change À CET ENDROIT du fil ? ».
 * Deux fenêtres posées le même jour sur deux mails éloignés ne se succèdent pas pour autant.
 *
 * ⚠️ PLUSIEURS FENÊTRES PEUVENT COMMENCER AU MÊME MAIL (le fil 3490 en a eu trois sur le 57368) : on prend la
 * DERNIÈRE de celles qui commencent strictement avant, dans l'ordre des mails puis de la liste reçue — c'est
 * l'ordre dans lequel la projection les applique.
 */
export function comparatifRepere(o: {
  mails: readonly number[];
  periodes: readonly Periode[];
  periodeId: number;
}): ComparatifRepere | null {
  const rang = new Map(o.mails.map((m, i) => [m, i]));
  const moi = o.periodes.find((p) => p.id === o.periodeId);
  if (moi === undefined) return null;
  const monRang = rang.get(moi.depuisMessageId) ?? -1;

  /* 🔴 LA DERNIÈRE FENÊTRE QUI COMMENCE STRICTEMENT AVANT CE MAIL : c'est elle qui couvrait le mail d'avant. */
  const avant = o.periodes
    .filter((p) => p.id !== moi.id && (rang.get(p.depuisMessageId) ?? -1) >= 0
      && (rang.get(p.depuisMessageId) as number) < monRang)
    .sort((a, b) => (rang.get(a.depuisMessageId) as number) - (rang.get(b.depuisMessageId) as number))
    .at(-1) ?? null;

  return {
    avant: avant === null ? null : etatDuClassement(avant.classement),
    apres: etatDuClassement(moi.classement),
    choix: motChoixFenetre(monRang),
    qui: moi.parLibelle ?? null,
    quand: moi.le ?? null,
  };
}

/** La phrase du repère, celle qui s'affiche en rouge. PUR — c'est le texte d'avant ce lot, inchangé. */
export function phraseRepere(c: Classement): string {
  return `À partir d’ici : ${motClassement(c)}`;
}

/** Le nom de la pastille, pour les lecteurs d'écran. PUR. */
export const AIDE_PASTILLE_REPERE = 'Ce qui change à partir d’ici';
