import { projeter, type ChoixSuivi, type Classement, type ExceptionMail, type Periode } from './periodesConversation';
import { definitionDe, modificationEnCours, positionAffichee, type PositionPortee } from './porteeSuivi';

/**
 * ══ 🔴🔴 LOT COMPOSEUR-FENETRE-COMPLETE (Arno, 13-14/10/2026) — LE RATTACHEMENT D'UN MAIL EN COURS D'ÉCRITURE. PUR ══
 *
 * DÉCISION D'ARNO : dans le composeur (Nouveau message, Répondre, Répondre à tous, Transférer — partout), la fenêtre
 * « Bien(s) rattaché(s) à ce mail » est IDENTIQUE à celle de « Modifier le rattachement » : biens actuellement suivis
 * (case à cocher), propositions et recherche, événement, PORTÉE DU SUIVI en quatre positions. « Rien n'est écrit avant
 * l'envoi. […] À l'envoi, une fois le mail réellement parti et enregistré, applique EXACTEMENT la même fonction que
 * “Modifier le rattachement” sur un mail existant, avec ces choix. »
 *
 * 🔴 CE MODULE DÉCIDE, UNE SEULE FOIS, POUR LES DEUX CÔTÉS : l'écran l'appelle pour placer la glissière et nommer le
 * bouton ; le serveur l'appelle, sur le mail capturé, pour savoir quoi passer à `poserClassement` — la fonction derrière
 * « Modifier le rattachement » (`POST /api/admin/gestion/suivi`). Les règles sont celles de la fenêtre, lues à leur
 * source (`porteeSuivi`) : premier rattachement, modification, position par défaut, « Origine » n'écrit rien.
 *
 * 🔴 LE « SUIVI DE FOND » D'UN MAIL QUI N'EXISTE PAS ENCORE est celui que la conversation donnera au prochain mail :
 * la projection des périodes vivantes sur un mail posé APRÈS tous les autres (une exception ne vaut que pour son mail).
 */

/** Ce que le brouillon garde de la fenêtre, en plus de ses biens (`cibles`). */
export interface RattachementBrouillon {
  /** La position de la glissière touchée à la main ; `null` = la position par défaut de la fenêtre pour ce mail. */
  position: PositionPortee | null;
  /** Les biens du suivi de fond DÉCOCHÉS dans le bloc « Biens actuellement suivis » (clés). */
  retires: string[];
}

const POSITIONS: readonly PositionPortee[] = ['origine', 'one_shot', 'suite', 'conversation'];

/** Ce qui arrive du navigateur ou de la base, rendu sûr ; `null` si ce n'est pas un rattachement. PUR. */
export function rattachementRecu(brut: unknown): RattachementBrouillon | null {
  if (typeof brut !== 'object' || brut === null || Array.isArray(brut)) return null;
  const r = brut as Record<string, unknown>;
  const position = typeof r.position === 'string' && (POSITIONS as readonly string[]).includes(r.position)
    ? (r.position as PositionPortee) : null;
  const retires = Array.isArray(r.retires)
    ? [...new Set(r.retires.filter((x): x is string => typeof x === 'string' && x.trim() !== '')
      .map((x) => x.trim().slice(0, 200)))].slice(0, 50)
    : [];
  return { position, retires };
}

/** Un rattachement qui ne dit rien (glissière jamais touchée, aucun bien décoché). PUR. */
export function rattachementVide(r: RattachementBrouillon | null): boolean {
  return r === null || (r.position === null && r.retires.length === 0);
}

/** Un identifiant qu'aucun mail réel ne porte : la place du mail en cours d'écriture, après tous les autres. */
const MAIL_A_VENIR = -1;

/**
 * LE SUIVI DE FOND QUE LE PROCHAIN MAIL DE LA CONVERSATION RECEVRA. `null` = aucune période vivante (rien ne suit).
 * C'est le bloc « Biens actuellement suivis » d'une réponse. PUR.
 */
export function fondDuProchainMail(mails: readonly number[], periodes: readonly Periode[]): Classement | null {
  return projeter([...mails, MAIL_A_VENIR], periodes, []).get(MAIL_A_VENIR) ?? null;
}

/** Les clés de biens d'un classement (`[]` hors classement par biens). PUR. */
export function clesDuFond(fond: Classement | null): string[] {
  return fond !== null && fond.sorte === 'biens' ? fond.biens.map((b) => b.cle) : [];
}

export interface DecisionRattachement {
  /** Le mail n'a jamais été classé : ni bien, ni suivi qui le couvre (« Origine » interdite, défaut « suite »). */
  premier: boolean;
  modification: boolean;
  /** La position affichée par la glissière — celle que la grande fenêtre aurait pour ce mail. */
  position: PositionPortee;
  /** Les biens qui seront rattachés si l'on valide : suivi de fond gardé, puis biens choisis. */
  voulus: { cle: string; libelle: string }[];
  /** Ce qu'il faut passer à `poserClassement`, ou `null` : rien à écrire (« Origine », aucun changement, aucun bien). */
  ecriture: { choix: ChoixSuivi; classement: Classement } | null;
}

/**
 * ══ LA DÉCISION DE LA FENÊTRE, POUR UN MAIL ÉCRIT DANS LE COMPOSEUR. PUR. ═══════════════════════════════════════════
 *
 *   · `fond` — le suivi de fond qui couvre ce mail (le prochain mail pour l'écran, le mail capturé pour le serveur) ;
 *     `null` = aucun suivi : c'est un PREMIER rattachement (règle de `premier` dans la fenêtre) ;
 *   · `biens` — les biens choisis dans les propositions et la recherche (les `cibles` du brouillon) ;
 *   · `rattachement` — la position touchée et les biens du fond décochés.
 *
 * 🔴 LES MÊMES RÈGLES QUE LA FENÊTRE (`RattachementsDuFil`, porte ponctuelle) : `modificationEnCours`,
 * `positionAffichee`, `definitionDe(...).choix` ; « Origine », ou aucune modification, n'écrit rien ; au premier
 * rattachement sans bien coché, rien non plus (le bouton y est « Sélectionner minimum un bien »). Les PERSONNES du fond
 * sont reposées telles quelles, comme `ecrire` le fait (`personnesEnVigueur`).
 */
export function decisionRattachement(o: {
  fond: Classement | null;
  biens: readonly { cle: string; libelle: string }[];
  rattachement: RattachementBrouillon | null;
}): DecisionRattachement {
  const r = o.rattachement ?? { position: null, retires: [] };
  const retires = new Set(r.retires);
  const fondBiens = o.fond !== null && o.fond.sorte === 'biens' ? o.fond.biens : [];
  const voulus: { cle: string; libelle: string }[] = [];
  const vus = new Set<string>();
  for (const b of [...fondBiens.filter((x) => !retires.has(x.cle)), ...o.biens.filter((x) => !retires.has(x.cle))]) {
    if (b.cle === '' || vus.has(b.cle)) continue;
    vus.add(b.cle);
    voulus.push({ cle: b.cle, libelle: b.libelle });
  }
  const premier = o.fond === null;
  const modification = modificationEnCours({
    avant: fondBiens.map((b) => b.cle), apres: voulus.map((b) => b.cle), evenementVoulu: false,
  });
  const position = positionAffichee(r.position, modification, premier);
  const choix = definitionDe(position).choix;
  const rien = !modification || position === 'origine' || choix === null || (premier && voulus.length === 0);
  const personnes = o.fond?.personnes ?? [];
  return {
    premier, modification, position, voulus,
    ecriture: rien ? null : {
      choix: choix as ChoixSuivi,
      classement: { sorte: 'biens', biens: voulus, ...(personnes.length > 0 && voulus.length > 0 ? { personnes: [...personnes] } : {}) },
    },
  };
}

/** Le suivi de fond qui couvre un mail DÉJÀ en base (côté serveur, après la capture). PUR. */
export function fondDuMail(
  mails: readonly number[], periodes: readonly Periode[], exceptions: readonly ExceptionMail[], messageId: number,
): Classement | null {
  return projeter(mails, periodes, exceptions).get(messageId) ?? null;
}
