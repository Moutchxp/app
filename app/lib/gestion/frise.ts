/**
 * ══ 🔴🔴 LOT MONGA-2, POINT 3 — COMMENT LA FRISE SE RANGE. MODULE PUR ════════════════════════════════════════════
 *
 * Aucune base, aucun réseau, aucun React — il est importé par un composant `'use client'`, et c'est la règle du
 * dépôt depuis l'incident du 24/09/2026.
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * RÈGLE D'ARNO (06/10/2026) : « Les ÉTAPES MAJEURES, bien visibles, dans l'ordre chronologique : Ouverture →
 * Prise de rendez-vous → Devis 1, 2, 3… (montant) → Acceptation du devis → Rendez-vous d'intervention →
 * Intervention → Clôture. […] Les étapes attendues mais pas encore atteintes s'affichent en pointillé. Les
 * COMMENTAIRES Monga et les rappels : simples petits repères discrets sur la frise. Ce ne sont pas des étapes. »
 *
 * 🔴 POURQUOI UN MODULE À PART DE `mongaEtape`. Celui-là dit ce qu'un MAIL raconte ; celui-ci dit comment un
 * ÉCRAN le range. Les mêler aurait fait dépendre la lecture d'un mail de choix d'affichage — et c'est la lecture
 * qu'on veut pouvoir éprouver sans rien savoir de la frise.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */

import {
  ETAPES_ATTENDUES, estRepere, motEtape, rangEtape, type TypeEtape,
} from './mongaEtape';

/**
 * Ce que la frise a besoin de savoir d'une étape. STRUCTUREL, et non le type du dépôt : `mongaEtapeRepo` tire
 * `pg`, et ce module-ci est lu par un composant client. Décrire la forme ici est ce qui garde la frontière.
 */
export interface EtapeAAfficher {
  id: number;
  /** La référence MNG dont vient l'étape. `null` = étape manuelle, posée sur l'événement. */
  reference: string | null;
  type: TypeEtape;
  survenuLe: string;
  heureConnue: boolean;
  heureFin: string | null;
  numero: string | null;
  rang: number | null;
  montantCents: number | null;
  texte: string | null;
  auteur: string | null;
  source: 'monga' | 'manuelle';
  certitude: 'fiable' | 'a_confirmer' | 'confirmee' | 'ecartee';
  messageId: number | null;
  /** `false` = cette étape n'a JAMAIS eu de mail (ouverture déduite) — ce n'est pas un mail supprimé. */
  aEuUnMail: boolean;
  filId: number | null;
  creeParLibelle: string | null;
  rangDevis: number | null;
}

/** Une case de la frise : une étape atteinte, ou une étape attendue en pointillé. */
export interface CaseFrise {
  cle: string;
  type: TypeEtape;
  /** Le mot affiché — « Devis 2 » quand le rang le demande, sinon le mot du type. */
  mot: string;
  /** `null` = attendue, pas encore atteinte : elle s'affiche en pointillé. */
  etape: EtapeAAfficher | null;
}

/**
 * ══ 🔴🔴 LE MOT D'UNE ÉTAPE SUR LA FRISE ═════════════════════════════════════════════════════════════════════════
 *
 * 🔴 « Devis 1, 2, 3… » EST UNE DEMANDE EXPLICITE D'ARNO, et le rang vient du module pur `rangsDesDevis` — qui
 * sait que deux mails portant le MÊME numéro ne font qu'un seul devis (cas mesuré sur la référence 23449).
 *
 * ⚠️ PAS DE « Devis 1 » QUAND IL N'Y EN A QU'UN. Numéroter un ensemble d'un seul élément fait croire qu'il en
 * manque d'autres — exactement l'inverse de ce que la frise doit dire.
 */
export function motDeLaCase(e: EtapeAAfficher | null, type: TypeEtape, nbDevisDeSaReference: number): string {
  if (type !== 'devis_recu') return motEtape(type);
  if (e === null || e.rangDevis === null || nbDevisDeSaReference <= 1) return motEtape(type);
  return `Devis ${e.rangDevis}`;
}

/**
 * ══ 🔴🔴 COMBIEN DE DEVIS DANS **SA** RÉFÉRENCE — défaut trouvé à l'écran le 06/10/2026 ═════════════════════════
 *
 * Un événement peut porter plusieurs interventions Monga. Compter les devis sur l'événement entier faisait
 * écrire « Devis 1 / Devis 2 / Devis 3 » sur trois devis appartenant à trois interventions différentes : lu de
 * bonne foi, cela raconte un devis refusé deux fois.
 */
export function devisParReference(etapes: readonly EtapeAAfficher[]): Map<string, number> {
  const out = new Map<string, number>();
  for (const e of etapes) {
    if (e.type !== 'devis_recu') continue;
    const cle = e.reference ?? '(manuelle)';
    out.set(cle, Math.max(out.get(cle) ?? 0, e.rangDevis ?? 1));
  }
  return out;
}

/**
 * ══ 🔴🔴 L'ÉVÉNEMENT PORTE-T-IL PLUSIEURS INTERVENTIONS ? ════════════════════════════════════════════════════════
 *
 * 🔴 DÉFAUT TROUVÉ À L'ÉCRAN, ET IL SE VOYAIT TOUT DE SUITE : trois références reliées à l'événement 1, et la
 * frise affichait **trois « Ouverture »** identiques, sans dire laquelle appartenait à quoi. L'événement avait
 * l'air de s'ouvrir trois fois.
 *
 * Quand il y en a plusieurs, chaque case Monga doit donc porter SA référence. Quand il n'y en a qu'une — le cas
 * ordinaire — l'écrire partout serait du bruit : on la connaît déjà, elle est en tête de la carte.
 */
export function referencesDeLaFrise(etapes: readonly EtapeAAfficher[]): string[] {
  return [...new Set(etapes.map((e) => e.reference).filter((r): r is string => r !== null))].sort();
}

/** Le montant, en euros, tel qu'il s'écrit. `null` = non renseigné — et c'est le cas ordinaire (voir l'audit). */
export function motMontant(cents: number | null): string | null {
  if (cents === null) return null;
  const euros = cents / 100;
  return `${euros.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;
}

/**
 * ══ 🔴🔴 CONSTRUIRE LA FRISE. PUR. ═══════════════════════════════════════════════════════════════════════════════
 *
 * ① les étapes ATTEINTES, dans l'ordre chronologique — et, à date égale, dans l'ordre du dossier (`rangEtape`),
 *    sans quoi deux étapes du même jour s'afficheraient au hasard de l'identifiant ;
 * ② les étapes ATTENDUES mais absentes, tissées à leur place logique, en pointillé ;
 * ③ les REPÈRES à part : commentaires, rappels, factures, contacts injoignables.
 *
 * 🔴 LES ÉCARTÉES NE SONT PLUS LÀ : le dépôt ne les rend pas (`statut = 'vif'`). Ce module n'a donc pas à les
 * filtrer — mais il le fait quand même, parce qu'un appelant futur pourrait les lui passer, et qu'une étape
 * écartée réapparue sur la frise serait un démenti silencieux du geste qui l'a écartée.
 */
export function construireFrise(
  etapes: readonly EtapeAAfficher[],
): { majeures: CaseFrise[]; reperes: EtapeAAfficher[] } {
  const vives = etapes.filter((e) => e.certitude !== 'ecartee');
  const reperes = vives.filter((e) => estRepere(e.type))
    .sort((a, b) => (a.survenuLe === b.survenuLe ? a.id - b.id : (a.survenuLe < b.survenuLe ? -1 : 1)));

  const atteintes = vives.filter((e) => !estRepere(e.type))
    .sort((a, b) => (a.survenuLe === b.survenuLe
      ? (rangEtape(a.type) - rangEtape(b.type)) || (a.id - b.id)
      : (a.survenuLe < b.survenuLe ? -1 : 1)));

  /* 🔴 LE RANG D'UN DEVIS N'A DE SENS QUE DANS SON INTERVENTION : voir `devisParReference`. */
  const parRef = devisParReference(atteintes);

  const cases: CaseFrise[] = atteintes.map((e) => ({
    cle: `e${e.id}`,
    type: e.type,
    mot: motDeLaCase(e, e.type, parRef.get(e.reference ?? '(manuelle)') ?? 0),
    etape: e,
  }));

  /**
   * ② LES ATTENDUES, TISSÉES À LEUR PLACE. On insère chaque type manquant AVANT la première case dont le rang
   * de dossier est plus avancé que le sien ; à défaut, à la fin.
   *
   * ⚠️ ON NE TRIE PAS LE RÉSULTAT PAR DATE APRÈS COUP : un pointillé n'a pas de date, et lui en inventer une
   * (aujourd'hui, ou la date de la suivante) le ferait glisser à chaque rendu. Sa place est LOGIQUE, pas
   * chronologique — et c'est ce que « étape attendue » veut dire.
   */
  for (const attendue of ETAPES_ATTENDUES) {
    if (cases.some((c) => c.etape !== null && c.etape.type === attendue)) continue;
    const i = cases.findIndex((c) => rangEtape(c.type) > rangEtape(attendue));
    const vide: CaseFrise = {
      cle: `attendue-${attendue}`, type: attendue, mot: motEtape(attendue), etape: null,
    };
    if (i === -1) cases.push(vide); else cases.splice(i, 0, vide);
  }

  return { majeures: cases, reperes };
}

/**
 * LA SOURCE D'UNE ÉTAPE, en toutes lettres (Arno : « pictogramme Monga ou “ajoutée par <collaborateur>” »).
 *
 * ⚠️ UNE ÉTAPE MANUELLE SANS AUTEUR CONNU NE MENT PAS : elle dit « ajoutée à la main », sans inventer un nom.
 */
export function motSource(e: EtapeAAfficher): string {
  if (e.source === 'monga') return 'Monga';
  return e.creeParLibelle === null || e.creeParLibelle.trim() === ''
    ? 'ajoutée à la main'
    : `ajoutée par ${e.creeParLibelle}`;
}

/**
 * 🔴🔴 CE QUE DIT UNE ÉTAPE MONGA DONT LE MAIL N'EXISTE PLUS (Arno) : « un clic sur une étape Monga ouvre le mail
 * d'origine s'il existe encore (sinon : “mail supprimé — étape conservée”) ».
 *
 * C'est la phrase qui justifie tout le point 2 : sans la table des étapes, il n'y aurait rien à conserver, et
 * l'étape aurait disparu avec le mail. 25 des 98 mails Monga étaient déjà à la corbeille au moment du lot.
 */
export function motMailDOrigine(e: EtapeAAfficher): string | null {
  if (e.source !== 'monga') return null;
  if (e.filId !== null) return 'Voir le mail d’origine';
  /**
   * 🔴🔴 « MAIL SUPPRIMÉ » NE SE DIT QUE D'UN MAIL QUI A EXISTÉ. Défaut trouvé à l'écran le 06/10/2026 : les 33
   * ouvertures de repli, qui sont DÉDUITES de la date du premier mail et n'en ont jamais eu, annonçaient toutes
   * « mail supprimé — étape conservée ». On annonçait une suppression qui n'avait pas eu lieu — et c'est le
   * genre de fausseté qui fait douter de tout le reste de la frise.
   */
  return e.aEuUnMail ? 'mail supprimé — étape conservée' : 'étape déduite — aucun mail';
}

/** Une étape Monga dont le mail vit encore est cliquable ; les autres ne le sont pas. */
export function etapeOuvrable(e: EtapeAAfficher): boolean {
  return e.source === 'monga' && e.filId !== null;
}

/**
 * LA DATE D'UNE ÉTAPE, telle qu'elle s'affiche. PUR — on ne construit aucun `Date` ici, le fuseau du lecteur ne
 * doit pas changer le jour affiché d'un rendez-vous.
 *
 * ⚠️ L'HEURE NE S'AFFICHE QUE SI ELLE EST CONNUE : `heure_connue` existe précisément pour cela. Sans ce drapeau,
 * tout rendez-vous sans heure se lirait « à 00h00 », ce qui est faux et se voit.
 */
export function motDateEtape(e: EtapeAAfficher): string {
  const [jour, reste] = e.survenuLe.split(/[T ]/);
  const [a, m, j] = jour.split('-');
  const date = `${j}/${m}/${a}`;
  if (!e.heureConnue) return date;
  const debut = (reste ?? '').slice(0, 5);
  return e.heureFin === null ? `${date} à ${debut}` : `${date} de ${debut} à ${e.heureFin}`;
}

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   ══ 🔴🔴 LOT FRISE-HORIZONTALE — CE QUE LA DISPOSITION EN LIGNE AJOUTE. PUR. ═══════════════════════════════════

   DEMANDE D'ARNO (06/10/2026) : « la frise d'avancement devient HORIZONTALE. La liste verticale actuelle
   disparaît. Données, règles et gestes du lot MONGA-2 inchangés (même module frise.ts, aucune perte de
   fonction). »

   🔴 TOUT CE QUI SUIT EST UN AJOUT. Pas une ligne de ce qui précède n'a changé : `construireFrise`, l'ordre, les
   pointillés, les mots, les devis par référence, « étape déduite — aucun mail » — tout est intact, et les
   épreuves du lot MONGA-2 continuent de le tenir. L'horizontale est une MISE EN PAGE, pas une autre vérité.
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

/**
 * ══ 🔴🔴 LA SUITE DE CE QUI S'AFFICHE SUR LA LIGNE ═══════════════════════════════════════════════════════════════
 *
 * Trois sortes de choses se succèdent de gauche à droite :
 *   · `carre`  — une vraie étape (atteinte, « à confirmer », ou attendue en pointillé) ;
 *   · `points` — les messages simplement informatifs, posés SUR LE TRAIT entre deux carrés, à leur place
 *                chronologique (Arno : « petits points discrets […] Ce ne sont pas des étapes ») ;
 *   · `plus`   — le carré « + », juste APRÈS le dernier carré réellement atteint.
 *
 * 🔴 POURQUOI UNE SEULE SUITE PLUTÔT QUE DEUX RANGÉES. Les points doivent tomber ENTRE les carrés, à leur place
 * dans le temps. Les rendre à part obligerait l'écran à calculer des positions absolues en pixels — donc à
 * refaire ce calcul à chaque redimensionnement, et à le refaire faux sur un écran étroit. Intercalés dans la
 * même suite, ils se placent tout seuls, et le défilement les emmène avec les carrés.
 */
export type SorteCase = 'carre' | 'points' | 'plus';

export interface ElementFrise {
  cle: string;
  sorte: SorteCase;
  /** Pour un `carre` : la case telle que `construireFrise` l'a bâtie. */
  case?: CaseFrise;
  /** Pour `points` : les messages informatifs de cet intervalle, dans l'ordre. */
  messages?: EtapeAAfficher[];
}

/**
 * ══ 🔴🔴 RANGER LA FRISE EN LIGNE. PUR. ══════════════════════════════════════════════════════════════════════════
 *
 * 🔴 LES POINTS SE PLACENT PAR LEUR DATE, ENTRE DEUX CARRÉS. Un message du 14/09 tombe après le carré du 14/09 et
 * avant celui du 16/09 — c'est ce que « à leur place chronologique » veut dire, et c'est la seule façon de lire
 * un dossier sans se demander quand le commentaire est arrivé.
 *
 * ⚠️ LES CARRÉS ATTENDUS (pointillés) N'ONT PAS DE DATE : ils sont tous à la fin, et aucun point ne se glisse
 * entre eux. Y ranger un message par sa date reviendrait à lui inventer une position dans un futur qui n'existe
 * pas encore.
 *
 * 🔴 LE « + » VIENT JUSTE APRÈS LE DERNIER CARRÉ RÉELLEMENT ATTEINT (Arno : « avant les carrés attendus en
 * pointillé »). Sur une frise entièrement vide — un événement sans Monga, le cas que le lot MONGA-2 a rendu
 * possible — il vient donc en PREMIER, ce qui est exactement ce qu'on veut : la première chose à faire est
 * d'ajouter quelque chose.
 */
export function rangerEnLigne(
  majeures: readonly CaseFrise[], reperes: readonly EtapeAAfficher[],
): ElementFrise[] {
  const out: ElementFrise[] = [];
  const restants = [...reperes].sort((a, b) => (a.survenuLe === b.survenuLe ? a.id - b.id : (a.survenuLe < b.survenuLe ? -1 : 1)));
  const atteints = majeures.filter((c) => c.etape !== null);
  const dernierAtteint = atteints.length === 0 ? null : atteints[atteints.length - 1].cle;

  /** Les messages dont la date est <= celle de ce carré, retirés de la file. */
  const avant = (borne: string | null): EtapeAAfficher[] => {
    const pris: EtapeAAfficher[] = [];
    while (restants.length > 0 && (borne === null || restants[0].survenuLe <= borne)) {
      pris.push(restants.shift() as EtapeAAfficher);
    }
    return pris;
  };

  for (const c of majeures) {
    /* ⚠️ RIEN AVANT UN CARRÉ ATTENDU : il n'a pas de date, voir l'encadré. */
    if (c.etape !== null) {
      const pris = avant(c.etape.survenuLe);
      if (pris.length > 0) out.push({ cle: `pts-avant-${c.cle}`, sorte: 'points', messages: pris });
    }
    out.push({ cle: c.cle, sorte: 'carre', case: c });
    if (c.cle === dernierAtteint) {
      /* 🔴 LES MESSAGES POSTÉRIEURS AU DERNIER CARRÉ ATTEINT se posent avant le « + » : ils sont arrivés, eux. */
      const apres = avant(null);
      if (apres.length > 0) out.push({ cle: 'pts-fin', sorte: 'points', messages: apres });
      out.push({ cle: 'plus', sorte: 'plus' });
    }
  }
  /* 🔴 FRISE SANS AUCUN CARRÉ ATTEINT : le « + » ouvre la marche. */
  if (dernierAtteint === null) {
    const restes = avant(null);
    const debut: ElementFrise[] = [{ cle: 'plus', sorte: 'plus' }];
    if (restes.length > 0) debut.push({ cle: 'pts-fin', sorte: 'points', messages: restes });
    out.unshift(...debut);
  }
  return out;
}

/**
 * ══ 🔴 SUR QUEL ÉLÉMENT LA FRISE S'OUVRE ═════════════════════════════════════════════════════════════════════════
 *
 * Arno : « À l'ouverture, la frise est positionnée pour montrer la dernière étape atteinte. »
 *
 * 🔴 LA DERNIÈRE ATTEINTE, ET NON LE « + » NI LE PREMIER POINTILLÉ. C'est l'état du dossier qu'on vient lire —
 * « où en est-on ? » — et non ce qu'il reste à faire. Rend `null` quand rien n'est atteint : l'écran reste alors
 * au début, où se trouve justement le « + ».
 */
export function cleDOuverture(majeures: readonly CaseFrise[]): string | null {
  const atteints = majeures.filter((c) => c.etape !== null);
  return atteints.length === 0 ? null : atteints[atteints.length - 1].cle;
}

/**
 * LE PICTOGRAMME DE SOURCE, en un caractère (Arno : « petit pictogramme de source (Monga / ajoutée à la main) »).
 *
 * ⚠️ IL NE PORTE JAMAIS L'INFORMATION SEUL : le mot de la source reste lisible dans la bulle et au lecteur
 * d'écran. Un losange et un crayon ne se distinguent pas en niveaux de gris pour tout le monde.
 */
export function pictoSource(e: EtapeAAfficher): string {
  return e.source === 'monga' ? '◆' : '✎';
}

/**
 * LE MOT D'UN GROUPE DE POINTS, pour l'infobulle du groupe et le lecteur d'écran.
 *
 * ⚠️ « 1 message » / « 3 messages » — accordé, parce qu'un « 1 messages » dans un écran soigné se remarque.
 */
export function motGroupeMessages(n: number): string {
  return n <= 1 ? `${n} message` : `${n} messages`;
}
