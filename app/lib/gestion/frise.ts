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
