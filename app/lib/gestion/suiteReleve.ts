/**
 * MODULE « GESTION » — LOT RATTACHEMENT-2 : CE QUE LA PASSE FAIT *APRÈS* AVOIR RELEVÉ LE COURRIER. Module PUR.
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * 🔴 LE DÉFAUT QUE CE LOT RÉPARE, MESURÉ LE 26/09/2026. Deux mails envoyés le jour même n'avaient AUCUNE adresse
 * relevée, et n'étaient donc rattachés que par la règle b — celle de leurs voisins de fil. La chaîne
 * `relever → adresses → rattachement` existait, mais il fallait la lancer à la main. Un historique qui ne se remplit
 * que quand on y pense n'est pas un historique.
 *
 * ═══ 🔴 CE QUI NE DOIT JAMAIS ARRIVER : QUE CETTE SUITE FASSE ÉCHOUER LA RELÈVE ══════════════════════════════════
 * Le courrier qui entre dans l'application est la fonction vitale ; le rattachement est un confort. Une erreur ici est
 * donc ATTRAPÉE, consignée, et rendue comme un verdict À PART — jamais propagée. La passe reste « ok » parce que le
 * courrier est bien arrivé, et une seconde ligne de bandeau dit que l'enchaînement, lui, a échoué. Mélanger les deux
 * verdicts ferait crier l'alerte de veille pour une raison qui n'est pas la sienne : la pire des alertes est celle
 * qu'on apprend à ignorer.
 *
 * ═══ 🔴 POURQUOI ON RÉEXAMINE DES FILS ENTIERS, ET PAS SEULEMENT LES MESSAGES NOUVEAUX ═══════════════════════════
 * La règle b du moteur de rattachement fait d'un mail de tiers un CANDIDAT à partir des adresses de son échange. Une
 * réponse qui arrive aujourd'hui peut donc lever l'ambiguïté d'un mail d'hier resté « proposé ». Réexaminer le fil
 * entier coûte une mise à jour qui ne change rien dans le cas ordinaire, et ne défait jamais une décision humaine —
 * les garde-fous sont ceux d'`ecrireLienMoteur`, les mêmes pour tous les chemins.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */

/**
 * COMBIEN DE MESSAGES AU PLUS par passe. Une passe ordinaire en rapporte zéro à quelques dizaines ; ce plafond ne
 * sert qu'au cas d'un rattrapage d'historique, qui en importe des milliers d'un coup.
 *
 * ⚠️ IL N'Y A RIEN À PERDRE À LE FRANCHIR EN PLUSIEURS FOIS : la relève continue repasse chaque minute, et le reste
 * est annoncé. Bloquer une passe dix minutes pour tout traiter d'un coup arrêterait, pendant ce temps, l'arrivée du
 * courrier — exactement ce que ce module s'interdit.
 */
export const PLAFOND_MESSAGES_SUITE = 2_000;

/**
 * JUSQU'OÙ REMONTER pour chercher un message sans adresses, en nombre d'identifiants sous le curseur.
 *
 * 🔴 POURQUOI UNE BORNE PLUTÔT QU'UN CURSEUR NU. Un simple `id > max(déjà relevé)` sauterait DÉFINITIVEMENT un message
 * que la capture aurait écrit hors ordre — et un trou silencieux dans la trace des adresses est précisément le défaut
 * que le lot DRIVE-2-bis a payé une fois. On regarde donc un peu en arrière à chaque passe.
 *
 * 🔴 POURQUOI PAS TOUTE LA TABLE. MESURÉ : l'anti-jointure sans borne coûte 124 ms et balaie séquentiellement les
 * 56 805 messages, une fois par minute, le plus souvent pour découvrir qu'il n'y a rien à faire. Bornée, la même
 * question coûte 4,8 ms.
 *
 * ⚠️ LA LIMITE, DITE PLUTÔT QUE DÉCOUVERTE : un message écrit plus de 1 000 identifiants derrière le curseur ne serait
 * pas vu par l'enchaînement. Le rattrapage existe et le couvre : `npm run gestion:adresses:relever -- --recalculer`.
 */
export const MARGE_RETOUR_SUITE = 1_000;

export type ResultatSuite = 'ok' | 'erreur' | 'ignore';

export interface ComptesSuite {
  /** Messages dont les adresses ont été relevées pendant cette passe. */
  messagesReleves: number;
  adressesEcrites: number;
  /** Fils réexaminés : ceux des messages nouveaux, entiers. */
  filsReexamines: number;
  messagesExamines: number;
  liensPoses: number;
  candidatsPoses: number;
  /** Reste-t-il des messages pour la passe suivante (plafond atteint) ? */
  resteAFaire: number;
  /** Décisions humaines rencontrées et laissées intactes. */
  respectes: number;
}

export const COMPTES_SUITE_VIDES: ComptesSuite = {
  messagesReleves: 0, adressesEcrites: 0, filsReexamines: 0, messagesExamines: 0,
  liensPoses: 0, candidatsPoses: 0, resteAFaire: 0, respectes: 0,
};

export interface IssueSuite {
  resultat: ResultatSuite;
  /** Une phrase, lisible par quelqu'un qui n'a pas écrit le code. C'est elle qui va en base et au bandeau. */
  detail: string;
  /** Le temps AJOUTÉ à la passe, en millisecondes. */
  ms: number;
  comptes: ComptesSuite;
}

/** Le résumé d'un enchaînement réussi, en une phrase. PUR. */
export function resumeSuite(c: ComptesSuite): string {
  if (c.messagesReleves === 0 && c.filsReexamines === 0) return 'rien de nouveau à rattacher';
  const bouts = [
    `${c.messagesReleves} message(s) relevé(s)`,
    `${c.adressesEcrites} adresse(s)`,
    `${c.filsReexamines} échange(s) réexaminé(s)`,
    `${c.liensPoses} lien(s)`,
    `${c.candidatsPoses} candidat(s)`,
  ];
  if (c.respectes > 0) bouts.push(`${c.respectes} décision(s) humaine(s) respectée(s)`);
  if (c.resteAFaire > 0) bouts.push(`${c.resteAFaire} message(s) pour la passe suivante`);
  return bouts.join(', ');
}

/** Un motif d'erreur BORNÉ : il va dans une colonne de base et dans un bandeau, pas dans un fichier de trace. PUR. */
export function motifSuite(e: unknown): string {
  const brut = e instanceof Error ? e.message : String(e);
  const propre = brut.replace(/\s+/g, ' ').trim();
  return propre.length > 300 ? `${propre.slice(0, 299)}…` : propre;
}

// ── LE BANDEAU ──────────────────────────────────────────────────────────────────────────────────────────────────

/** Ce que la base sait du dernier enchaînement. `null` partout = migration 258 absente, ou aucune passe depuis. */
export interface SuiteVue {
  resultat: ResultatSuite | null;
  detail: string | null;
  ms: number | null;
}

export interface EtatSuite {
  niveau: 'ok' | 'echec' | 'muet';
  /** La phrase du bandeau. Vide quand il n'y a rien à dire. */
  texte: string;
  aide: string | null;
}

export const AIDE_SUITE = 'Relancer à la main : npm run gestion:adresses:relever '
  + '&& npm run gestion:rattachement:proposer -- --appliquer';

/**
 * FAUT-IL DIRE QUELQUE CHOSE DE L'ENCHAÎNEMENT, ET QUOI ? PUR.
 *
 * 🔴 IL SE TAIT QUAND TOUT VA BIEN, et c'est la règle du bandeau de veille dont il s'inspire : une ligne de plus qui
 * répète « tout va bien » chaque minute finit par cacher celle qui dit le contraire. Il ne parle donc que sur échec —
 * et alors il dit le motif ET le geste qui répare.
 *
 * ⚠️ « MUET » N'EST PAS « OK ». Migration 258 non appliquée, ou aucune passe depuis ce lot : on ne SAIT pas, et on ne
 * prétend pas le contraire. C'est le journal du module qui porte alors la trace.
 */
export function etatSuite(v: SuiteVue): EtatSuite {
  if (v.resultat === 'erreur') {
    return {
      niveau: 'echec',
      texte: `⚠ Le courrier est bien arrivé, mais son rattachement automatique a échoué : ${v.detail ?? 'motif inconnu'}`,
      aide: AIDE_SUITE,
    };
  }
  if (v.resultat === 'ok' || v.resultat === 'ignore') return { niveau: 'ok', texte: '', aide: null };
  return { niveau: 'muet', texte: '', aide: null };
}
