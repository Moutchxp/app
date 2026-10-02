'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { CurseurBoite, LigneBoite } from '../../../../lib/gestion/boiteRepo';
// 🔴 `rechercheTermes` et NON `rechercheBoite` : le second contient le SQL et tire `pg` → `dns`, que le navigateur
//   n'a pas. L'importer ici a fait tomber TOUTE l'application le 24/09/2026, page de connexion comprise.
import {
  decouperTermes, filtresAvancesActifs, LISTES_TOUTES, normaliser, rechercheUtile,
  type CritereRecherche, type FiltrePiece, type SorteListe,
} from '../../../../lib/gestion/rechercheTermes';
import { listePeutSeRecharger, mentionCourrierNouveau } from '../../../../lib/gestion/rafraichir';
import {
  autoImposeParEtiquette, ETIQUETTE_RECEPTION, etiquetteDepuisTexte, texteEtiquette, type Etiquette,
} from '../../../../lib/gestion/ecranUrl';
import { dateHeureComplete, dateHeureCourte } from '../../../../lib/gestion/ecran';
import { corpsLisible, etatTrombone, motTrombone } from '../../../../lib/gestion/lisibilite';
// 🔴 LOT LISTE-PAGINATION — la barre est un composant PARTAGÉ par les quatre listes du module (voir son encadré).
import { BarrePages, CSS_BARRE_PAGES } from './BarrePages';
/**
 * 🔴 LOT RATTACHER-EN-ECRIVANT — LE CACHE COURT DES PAGES et la règle de préchargement. Module PUR : aucun `pg`,
 * donc importable depuis un `'use client'` (voir l'incident du 24/09/2026 consigné dans AGENTS.md).
 */
import { CachePages, cleDePage, pagesAPrecharger } from '../../../../lib/gestion/cachePages';
import { nettoyerObjet } from '../../../../lib/gestion/objet';
import {
  bulleCapsule, capsuleStatut, motCapsule, motMotifHorsGestion, type CapsuleStatut,
} from '../../../../lib/gestion/statutClassement';

/**
 * 🔴 LOT STATUT-HORS-GESTION — LE STATUT D'UNE LIGNE DE LISTE, calculé EN UN SEUL ENDROIT.
 *
 * La capsule affichée et le bouton de fin de barre doivent dire la MÊME chose : les calculer séparément, c'est
 * garantir qu'un jour l'un des deux oubliera le gris. `capsuleStatut` (module PUR) tient la priorité —
 * Classé > Auto > Hors gestion > À classer.
 */
function capsuleDeLaLigne(l: {
  classement: { nbActifs: number; parUnHumain: boolean } | null; horsGestion?: boolean; interne?: boolean;
}): CapsuleStatut {
  return capsuleStatut({
    nbActifs: l.classement?.nbActifs ?? 0,
    parUnHumain: l.classement?.parUnHumain === true,
    horsGestion: l.horsGestion === true,
    // 🔴 LOT RATTACHER-EN-ECRIVANT — la marque de l'ÉCHANGE. `capsuleStatut` la range entre Auto et Hors gestion.
    interne: l.interne === true,
  });
}
// LOT BARRE-STATUT — la fenêtre « Visualiser / Modifier », ouverte par-dessus la liste.
import { RattachementsDuFil } from './RattachementsDuFil';
import { CSS_MENU_LIGNE, MenuLigne } from './MenuLigne';
import { BarreLigne, CSS_BARRE_LIGNE, Etoile } from './BarreLigne';
// 🔴 LOT LISTE-PAGINATION — un TRACÉ et non un emoji : lui seul suit la couleur du texte (voir son encadré).
import { Trombone } from './Trombone';
// 🔴🔴 LOT BROUILLONS-APERCU — l'œil des lignes de brouillon, et le mot qu'il porte.
import { Oeil } from './Oeil';
import { AIDE_OEIL } from '../../../../lib/gestion/apercuBrouillon';
import type { ActionLigne } from '../../../../lib/gestion/menuLigne';

/**
 * LOT 5a — LA BOÎTE MAIL. Le second mode du module : tout le courrier, du plus récent au plus ancien, comme on lit sa
 * messagerie. Le poste de tri (« À classer ») n'est pas touché — les deux répondent à deux questions différentes :
 * « qu'ai-je à traiter ? » et « qu'est-ce qui existe ? ».
 *
 * CE QUE CE LOT NE FAIT PAS, et qu'il ne faut pas chercher ici : la recherche (5c), l'affichage des messages écartés
 * DANS leur échange (5b), la vue conversation dépliable (5b), l'affichage HTML (5d), l'envoi (5e). Un clic ouvre
 * l'échange avec la lecture qui existe AUJOURD'HUI.
 *
 * MOBILE D'ABORD : une ligne = un bouton pleine largeur d'au moins 44 px, l'objet et l'adresse cassent en fin de ligne,
 * aucun débordement horizontal, aucune interaction au survol seul. Couleurs : jetons `--color-svv-*` uniquement, et
 * chaque information portée par un MOT ou une FORME — jamais par la couleur seule.
 */

interface ComptesBoite { lisibles: number; automatiques: number }

/**
 * LOT 5c, étendu par le LOT RECHERCHE-AVANCEE — ce que le champ de recherche et son panneau demandent. Vide = on
 * affiche la liste ordinaire.
 *
 * ⚠️ LES NOMS DIFFÈRENT DE CEUX DU MODULE PUR (`q` ici, `saisie` là-bas) parce que ce sont AUSSI les noms des
 * paramètres de l'adresse. `enCritereRecherche` est le seul passage entre les deux — une seule traduction, donc
 * jamais deux façons de lire le même champ.
 */
export interface Critere {
  q: string;
  /** « Ne contient pas » : les mails portant l'UN de ces mots sont écartés. */
  sansMots: string;
  du: string;
  au: string;
  de: string;
  pj: FiltrePiece;
  /** Les listes où chercher. TOUTES par défaut — une recherche ne doit jamais oublier une liste en silence. */
  listes: readonly SorteListe[];
}
export const CRITERE_VIDE: Critere = {
  q: '', sansMots: '', du: '', au: '', de: '', pj: 'indifferent', listes: LISTES_TOUTES,
};

/**
 * Les quatre listes cherchables, avec le mot qui les désigne à l'écran — LES MÊMES que la colonne de gauche. Une
 * liste nommée autrement ici ferait douter qu'il s'agisse de la même.
 */
export const LISTES_CHERCHABLES: readonly (readonly [SorteListe, string])[] = [
  ['reception', 'Réception'], ['envoyes', 'Envoyés'],
  ['automatique', 'Courrier automatique'], ['brouillons', 'Brouillons'],
  // LOT ERGO-BOITE-3 — cochée par défaut comme les autres (elle est dans `LISTES_TOUTES`). Le spam ne sort de nulle
  //   part ailleurs : si la recherche l'excluait aussi par défaut, un mail qu'on cherche et que Gmail a mal classé
  //   serait introuvable PARTOUT — exactement le défaut qu'une recherche ne doit pas avoir.
  ['spam', 'Spam'],
];

/**
 * Coche ou décoche une liste, en gardant l'ORDRE de référence. Sans cet ordre, décocher puis recocher « Réception »
 * la renverrait en fin de liste et l'adresse changerait sans que rien n'ait changé. PUR.
 */
export function basculerListe(
  listes: readonly SorteListe[], cle: SorteListe, coche: boolean,
): readonly SorteListe[] {
  const voulues = new Set(listes);
  if (coche) voulues.add(cle); else voulues.delete(cle);
  return LISTES_TOUTES.filter((l) => voulues.has(l));
}

/** Le même critère, dans la forme que comprennent le module pur et la route. PUR. */
export function enCritereRecherche(c: Critere): CritereRecherche {
  return { saisie: c.q, sansMots: c.sansMots, du: c.du, au: c.au, expediteur: c.de, piece: c.pj, listes: c.listes };
}

/**
 * Y a-t-il quelque chose à chercher ? Un champ vide n'envoie AUCUNE requête. On délègue au module PUR, qui sert
 * aussi la route : la question « faut-il chercher ? » ne peut pas recevoir deux réponses selon le côté. PUR.
 */
export function critereActif(c: Critere): boolean {
  return rechercheUtile(enCritereRecherche(c));
}

/**
 * LOT RECHERCHE-AVANCEE — UN FILTRE AUTRE QUE LES MOTS EST-IL POSÉ ? C'est ce que la pastille de l'engrenage
 * signale, panneau fermé : un filtre oublié qui cache des mails est exactement ce qu'on ne veut pas laisser
 * invisible. PUR.
 */
export function filtresPoses(c: Critere): boolean {
  return filtresAvancesActifs(enCritereRecherche(c));
}

/**
 * LOT 5c — DÉCOUPE UN EXTRAIT autour des mots trouvés, pour les mettre en évidence. Rend une suite de morceaux dont
 * certains sont marqués : l'écran les rend en GRAISSE, jamais par une couleur seule — une mise en évidence invisible
 * en niveaux de gris ou pour un daltonien ne met rien en évidence.
 *
 * La comparaison se fait sur le texte NORMALISÉ (accents retirés, minuscules) tout en rendant le texte D'ORIGINE :
 * chercher « fenetre » doit souligner « Fenêtre » tel qu'il est écrit. PUR.
 */
export function morceauxMisEnEvidence(texte: string, saisie: string): { t: string; fort: boolean }[] {
  const termes = decouperTermes(saisie).map((x) => x.texte).filter((x) => x.length >= 2);
  if (termes.length === 0) return [{ t: texte, fort: false }];
  // On normalise une COPIE pour chercher, et on découpe l'ORIGINAL aux mêmes positions : les deux ont la même longueur
  //   (`translate` remplace caractère par caractère, il ne change jamais le nombre de lettres).
  const repere = normaliser(texte); // la MÊME normalisation que la base, caractère par caractère
  const marques = new Array<boolean>(texte.length).fill(false);
  for (const t of termes) {
    let i = repere.indexOf(t);
    while (i !== -1) {
      for (let k = i; k < i + t.length; k++) marques[k] = true;
      i = repere.indexOf(t, i + t.length);
    }
  }
  const out: { t: string; fort: boolean }[] = [];
  let debut = 0;
  for (let i = 1; i <= texte.length; i++) {
    if (i === texte.length || marques[i] !== marques[debut]) {
      out.push({ t: texte.slice(debut, i), fort: marques[debut] });
      debut = i;
    }
  }
  return out;
}

/**
 * LOT RECHERCHE-AVANCEE — une ligne, telle que l'écran la reçoit. `provenance` n'existe QUE sur un résultat de
 * recherche (la liste ordinaire sait déjà de quelle étiquette elle vient) : elle est donc facultative, et son
 * absence ne change rien à l'affichage d'avant ce lot.
 */
type LigneEcran = LigneBoite & { provenance?: SorteListe };

interface ReponseBoite {
  lignes: LigneEcran[];
  suivant: CurseurBoite | null;
  total: number | null;
  /**
   * ══ 🔴🔴 LOT SOMBRE-ET-RECHERCHE — `undefined` EST UNE RÉPONSE POSSIBLE, ET ELLE FAISAIT TOMBER L'ÉCRAN ═══
   *
   * DÉFAUT REPRODUIT LE 01/10/2026, en cherchant « scan » puis en cliquant la croix « Effacer la recherche » :
   * `Cannot read properties of undefined (reading 'automatiques')`. L'écran tombait — c'est-à-dire, pour qui le
   * regarde, « la liste ne se met pas à jour » ou « l'écran est bloqué ».
   *
   * 🔴 LA CAUSE : la route de RECHERCHE ne rend pas `comptes` du tout (elle n'a pas d'étiquette à compter), là où
   * la route de la boîte rend `null` ou un objet. Le champ était déclaré `ComptesBoite | null` — donc TypeScript
   * ne voyait rien, et le garde `etat.comptes !== null` laissait passer `undefined`, qui n'est pas `null`.
   *
   * 🔴 LE CHAMP DIT DÉSORMAIS LA VÉRITÉ (`?`), et l'état le NORMALISE à `null` en entrant : le garde redevient
   * juste, et le compilateur attrapera le prochain oubli. C'est le seul genre de correctif qui tienne — celui
   * qui fait rougir la compilation plutôt que l'écran.
   */
  comptes?: ComptesBoite | null;
  /**
   * LOT 5-BOITE — les échanges portant au moins un message reçu NON LU PAR MOI. Rendus par le serveur, calculés pour
   * la personne de la session : le navigateur ne décide pas de ce qui est lu. Absent (migration 250 non appliquée,
   * ou accès sans compte personnel) ⇒ rien n'est en gras, et l'écran est celui d'avant ce lot.
   */
  nonLus?: number[];
  /** Combien d'échanges restent non lus. `null` = on ne sait pas (pas de connexion Google) : on n'affiche rien. */
  nonLusTotal?: number | null;
  /** LOT 5-BOITE-2 — vrai quand Gmail en avait plus à donner que le plafond : le compte est un MINIMUM, et le dit. */
  nonLusPartiel?: boolean;
  /** LOT 5c — présent sur une réponse de recherche : `false` quand la migration 237 n'est pas appliquée. */
  pleinTexte?: boolean;
  automatiquesMasques?: number | null;
  /** LOT RECHERCHE-AVANCEE — les brouillons trouvés, cherchés à part (ils ne vivent pas dans la même table). */
  brouillons?: { lignes: BrouillonTrouveEcran[]; tronque: boolean };
}

/** Un brouillon trouvé, tel que la route le rend. Type recopié : importer le dépôt tirerait `pg` dans le navigateur. */
export interface BrouillonTrouveEcran {
  brouillonId: number;
  filId: number | null;
  objet: string | null;
  destinataire: string | null;
  majLe: string;
  extrait: string | null;
  aPiece: boolean;
}

type Etat =
  | { v: 'charge' }
  | {
      /**
       * 🔴 LOT LISTE-PAGINATION — `total` EST DÉSORMAIS `number | null`, et `null` veut dire « on ne l'a pas
       * compté », jamais « zéro ». Il valait auparavant `r.total ?? r.lignes.length`, ce qui faisait passer un
       * NOMBRE DE LIGNES pour un total : au-dessus d'une liste paginée, cela aurait écrit « 1–25 sur 25 » sur une
       * Réception de 8 546 échanges, et éteint le chevron « › » dès la première page.
       */
      v: 'ok'; lignes: LigneEcran[]; suivant: CurseurBoite | null; total: number | null; comptes: ComptesBoite | null;
      pleinTexte: boolean; automatiquesMasques: number | null;
      brouillons: { lignes: BrouillonTrouveEcran[]; tronque: boolean };
      nonLus: Set<number>; nonLusTotal: number | null; nonLusPartiel: boolean;
    }
  | { v: 'erreur'; m: string };

/**
 * Va chercher une page — de la LISTE, ou des RÉSULTATS quand un critère est posé. Une seule fonction pour les deux :
 * les deux rendent la même forme de ligne, et l'écran ne doit pas avoir deux façons d'afficher la même chose.
 * Rapporte, ne décide pas.
 */
/**
 * 🔴 LE PLAFOND D'ATTENTE D'UNE LECTURE DE BOÎTE. Voir l'encadré dans `chargerPage` : ce n'est pas une cible de
 * performance (la boîte répond en 100 à 300 ms), c'est la limite au-delà de laquelle une lecture n'est plus lente
 * mais perdue — et où un écran figé sur « Chargement… » devient un mensonge.
 */
export const DELAI_MAX_LECTURE_MS = 20_000;

async function chargerPage(
  curseur: CurseurBoite | null, auto: boolean, critere: Critere, etiquette: Etiquette,
  filtre: 'non-lus' | null = null, etoile = false,
): Promise<ReponseBoite | { erreur: string }> {
  const p = new URLSearchParams();
  if (curseur) { p.set('depuis', curseur.dernierLe); p.set('avant', curseur.filId); }
  if (auto) p.set('auto', '1');
  // LOT ERGO-BOITE-3 — le sélecteur « non lus » de Réception. Seul `non-lus` s'écrit : « tous » est le défaut, et
  //   l'écrire ferait une seconde adresse pour la même demande. Il ne part PAS avec une recherche : celle-ci
  //   traverse les étiquettes et n'a pas de notion de « non lu » (voir la note sur l'étiquette ci-dessous).
  if (filtre === 'non-lus' && !critereActif(critere)) p.set('filtre', 'non-lus');
  // LOT FILTRE-ETOILE — il se COMBINE avec tout le reste, recherche comprise : c'est une restriction de plus, pas
  //   un mode à part. Seul `1` s'écrit — « tous » est le défaut, et un défaut écrit n'est plus un défaut.
  if (etoile) p.set('etoile', '1');
  const cherche = critereActif(critere);
  // 🔴 L'ÉTIQUETTE NE VA PAS À LA RECHERCHE, et c'est voulu : le lot 5c promet de chercher dans TOUT le courrier de
  //   gestion. La restreindre à l'étiquette ouverte ferait rater le mail qu'on cherche pour la seule raison qu'on
  //   regardait ailleurs — le défaut le plus pénible qu'une recherche puisse avoir. L'écran le DIT en toutes lettres.
  if (!cherche && etiquette.sorte !== 'reception') p.set('etiquette', texteEtiquette(etiquette));
  if (cherche) {
    if (critere.q.trim() !== '') p.set('q', critere.q);
    if (critere.du !== '') p.set('du', critere.du);
    if (critere.au !== '') p.set('au', critere.au);
    if (critere.de.trim() !== '') p.set('de', critere.de);
    // LOT RECHERCHE-AVANCEE — les réglages du panneau. ⚠️ `listes` n'est écrit que s'il DIFFÈRE du défaut : une
    //   adresse sans ce paramètre garde exactement le sens qu'elle avait avant ce lot (cf. la route).
    if (critere.sansMots.trim() !== '') p.set('sans', critere.sansMots);
    if (critere.pj !== 'indifferent') p.set('pj', critere.pj);
    if (critere.listes.length !== LISTES_TOUTES.length) p.set('listes', critere.listes.join(','));
  }
  /**
   * ══ 🔴🔴 LOT SOMBRE-ET-RECHERCHE — UNE LECTURE QUI N'ABOUTIT PAS SE DIT, ELLE NE FIGE PAS ═══════════════════
   *
   * CONSTAT D'ARNO (01/10/2026) : « l'écran est resté bloqué sur “Chargement de la boîte…” ».
   *
   * 🔴 LA CAUSE PREMIÈRE ÉTAIT LA LENTEUR DE LA RECHERCHE (41,7 s mesurées, corrigée dans `rechercheBoite`), et
   * elle n'est plus. Mais une lecture qui ne revient pas ne doit JAMAIS laisser l'écran sur son mot d'attente :
   * le réseau peut tomber, un serveur peut se taire, et « Chargement… » pour toujours se lit comme une panne de
   * l'application alors qu'il suffirait de réessayer.
   *
   * ⚠️ VINGT SECONDES, ET C'EST UN PLAFOND, PAS UNE CIBLE. La boîte répond en 100 à 300 ms ; une lecture qui
   * dépasse vingt secondes n'est plus lente, elle est perdue. On coupe, on le DIT, et l'écran redevient utilisable.
   *
   * ⚠️ `AbortSignal.timeout` N'EXISTE PAS PARTOUT (vieux navigateurs, rendu serveur) : on retombe alors sur le
   * comportement d'avant ce lot plutôt que de faire échouer la lecture pour une question de compatibilité.
   */
  const minuteur = typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function'
    ? AbortSignal.timeout(DELAI_MAX_LECTURE_MS)
    : undefined;
  try {
    const url = cherche ? '/api/admin/gestion/boite/recherche' : '/api/admin/gestion/boite';
    const res = await fetch(`${url}?${p.toString()}`, { cache: 'no-store', signal: minuteur });
    if (!res.ok) {
      return { erreur: res.status === 403 ? 'Droit retiré : reconnectez-vous.' : 'Lecture impossible.' };
    }
    return (await res.json()) as ReponseBoite;
  } catch (e) {
    /* 🔴 LE MOTIF DIT CE QUI S'EST PASSÉ, et les deux ne se réparent pas pareil : un serveur muet se réessaie,
       une lecture trop longue se signale. Dans les deux cas l'écran SORT de « Chargement… ». */
    const coupe = (e as { name?: string })?.name === 'TimeoutError'
      || (e as { name?: string })?.name === 'AbortError';
    return {
      erreur: coupe
        ? 'Lecture interrompue : elle a pris trop de temps. Réessayez.'
        : 'Lecture impossible : le serveur n’a pas répondu.',
    };
  }
}

/**
 * L'APERÇU d'une ligne. On retire l'historique cité AVANT de couper : sans ça, un échange de dix réponses afficherait
 * dix fois le même aperçu — celui du tout premier message, recopié en bas de chaque réponse. PUR.
 */
export function apercu(extrait: string | null, max = 140): string {
  if (extrait === null) return '';
  const visible = corpsLisible(extrait).visible.replace(/\s+/g, ' ').trim();
  return visible.length <= max ? visible : `${visible.slice(0, max - 1).trimEnd()}…`;
}

/** Le nom à afficher pour le correspondant. Jamais vide : une ligne sans nom reste identifiable. PUR. */
export function nomCorrespondant(l: Pick<LigneBoite, 'interlocuteur'>): string {
  const n = (l.interlocuteur ?? '').trim();
  return n === '' ? '(correspondant inconnu)' : n;
}

/**
 * Met en évidence les mots cherchés. En GRAISSE (`<strong>`), donc perceptible en niveaux de gris et pour un
 * daltonien — une mise en évidence portée par la seule couleur n'en est pas une. Le texte reste du TEXTE : il n'est
 * jamais interprété comme du HTML.
 */
export function Evidence({ texte, saisie }: { texte: string; saisie: string }) {
  const morceaux = morceauxMisEnEvidence(texte, saisie);
  if (morceaux.length === 1 && !morceaux[0].fort) return <>{texte}</>;
  return <>{morceaux.map((m, i) => (m.fort ? <strong key={i} className="bte-trouve">{m.t}</strong> : <span key={i}>{m.t}</span>))}</>;
}

export function BoiteMail({
  onOuvrir, onRouvrirBrouillon, onApercuBrouillon, etiquette = ETIQUETTE_RECEPTION, titre, total, auto: autoPilote, onAuto, filSelectionne = null,
  dense = false, onNonLus, onTotalEtiquette, marquage, onActionLigne, corbeille = false, peutEcrire = false, piecesDisponibles = false,
  versionDonnees = 0, versionStatuts = 0, onListeRelue, onRelever, releveEnCours = false, filtre = null,
  etoile = false, onEtoileFiltre, selection,
}: {
  /**
   * ══ 🔴 LOT MESSAGE-CLIQUÉ — ON OUVRE L'ÉCHANGE **ET** LE MESSAGE DE LA LIGNE ══════════════════════════════════
   * Le second argument est le message que la ligne représentait : le dernier reçu sous « Réception », le dernier
   * envoyé sous « Envoyés », le message trouvé dans une recherche. La conversation le déplie et l'amène à l'écran.
   *
   * ⚠️ FACULTATIF, et `null` vaut « le défaut » — le dernier message lisible de l'échange, comportement d'avant ce
   * lot. C'est ce qui permet aux appelants qui ne savent PAS quel message montrer (un brouillon, le menu
   * « Répondre » d'une ligne) de continuer à n'ouvrir qu'un échange, sans rien inventer.
   */
  onOuvrir: (filId: number, messageId?: number | null) => void;
  /**
   * 🔴 LOT LIGNE-NON-ENVOYE — rouvre le brouillon d'un mail qui n'est pas parti. Absent ⇒ la ligne fabriquée
   * n'est pas cliquable, ce qui vaut mieux qu'un clic qui n'ouvre rien.
   */
  onRouvrirBrouillon?: (brouillonId: number | null) => void;
  /**
   * 🔴🔴 LOT BROUILLONS-APERCU — VOIR un brouillon trouvé, en lecture seule, sans l'ouvrir dans l'éditeur.
   *
   * ⚠️ FACULTATIF, ET SON ABSENCE REND LA CARTE D'AVANT CE LOT, à l'identique : pas d'œil, pas de colonne en
   * plus. Un appelant qui ne sait pas afficher la fenêtre d'aperçu ne doit pas proposer un bouton qui n'ouvre
   * rien — c'est la règle de `onRouvrirBrouillon`, juste au-dessus.
   */
  onApercuBrouillon?: (brouillonId: number) => void;
  /** LOT 5-FUSION — l'étiquette ouverte. Absente = la boîte entière, exactement le comportement du lot 5a. */
  etiquette?: Etiquette;
  /** Titre affiché au-dessus de la liste. Absent = « Boîte mail », comme avant. */
  titre?: string;
  /** Nombre porté par l'étiquette. Sous une étiquette, la colonne de gauche le connaît déjà : on ne le recompte pas. */
  total?: number | null;
  /** Interrupteur du courrier automatique, PILOTÉ par le parent quand il est fourni (sinon il reste interne). */
  auto?: boolean;
  onAuto?: (v: boolean) => void;
  /** L'échange ouvert à côté, pour que la liste dise LEQUEL on lit. */
  filSelectionne?: number | null;
  /**
   * LOT 5-GMAIL — présentation DENSE : sur ordinateur, une ligne par échange (correspondant · objet + début du
   * message · marques · date), comme dans une messagerie. Sur téléphone, RIEN NE CHANGE — la présentation sur
   * plusieurs lignes est conservée, parce que quatre colonnes sur 375 px ne sont pas quatre colonnes.
   */
  dense?: boolean;
  /**
   * LOT 5-BOITE — remonte au parent le nombre d'échanges NON LUS par la personne connectée, pour que l'étiquette
   * « Réception » l'affiche à côté de son total. `null` = on ne sait pas (migration 250 absente, ou accès sans
   * compte personnel) : le parent n'affiche alors rien plutôt qu'un zéro qui aurait l'air d'une bonne nouvelle.
   */
  onNonLus?: (n: number | null, partiel?: boolean) => void;
  /**
   * ══ 🔴🔴 LOT DOSSIER-A-CLASSER — LA LISTE DIT AU PARENT COMBIEN ELLE EN A, pour l'étiquette ouverte ═════════
   *
   * DEMANDE D'ARNO : « Le compteur se met à jour quand un mail est classé (il sort du dossier, avec la même mise
   * à jour optimiste que la Réception). »
   *
   * 🔴 C'EST EXACTEMENT LE MÉCANISME DE `onNonLus`, ET C'EST VOULU. La liste est la seule à savoir ce qu'elle
   * montre ; elle le dit, le parent l'écrit dans la colonne. Quand un mail est classé, la liste se relit (le
   * geste appelle `charger`), rapporte son nouveau total, et le nombre de la colonne baisse — sans seconde
   * requête, et sans que deux calculs puissent se contredire.
   *
   * ⚠️ `null` = LE TOTAL N'EST PAS CONNU (pages suivantes : il n'est demandé qu'à la première). Le parent garde
   * alors le nombre qu'il avait, plutôt que d'effacer un compteur juste parce qu'on a tourné la page.
   */
  onTotalEtiquette?: (sorte: string, total: number | null) => void;
  /**
   * LOT 5-BOITE — un marquage de lecture qui vient d'avoir lieu AILLEURS (la conversation ouverte à côté).
   *
   * 🔴 LA LISTE N'EST PAS RELUE POUR AUTANT, et c'est une garantie du lot 5-GMAIL qu'on ne casse pas : ouvrir un
   * échange ne doit perdre ni les pages déjà chargées (« voir plus »), ni la recherche en cours, ni la position de
   * défilement. On met donc à jour le gras SUR PLACE, sans un seul aller-retour réseau — le serveur a déjà écrit,
   * l'écran n'a plus qu'à dire la même chose que lui.
   */
  marquage?: { filId: number; nonLu: boolean; cle: number };
  /**
   * LOT 5-BOITE-3 — ce que le menu d'une ligne demande. `undefined` = aucun menu n'est rendu : la liste est alors
   * EXACTEMENT celle d'avant ce lot (c'est le cas de l'écran partagé, qui n'a pas d'éditeur à ouvrir).
   */
  onActionLigne?: (filId: number, action: ActionLigne) => void;
  /** La migration 251 est-elle là ? Sinon ni « Supprimer » ni « Restaurer » — cf. `menuLigne.ts`. */
  corbeille?: boolean;
  /** Le droit d'écrire au nom de gestion@. Sans lui, ni rédaction ni lu/non lu (qui écrit dans Gmail). */
  peutEcrire?: boolean;
  /** LOT 5-PJ-ENVOI — la migration 252 est-elle là ? Pilote « Transférer en tant que pièce jointe ». */
  piecesDisponibles?: boolean;
  /**
   * ══ 🔴 LOT ÉCRAN-VIVANT — LE SIGNAL DE FRAÎCHEUR ═════════════════════════════════════════════════════════════
   * Un nombre que l'écran parent INCRÉMENTE quand il a constaté du courrier nouveau. La liste se relit alors d'
   * elle-même — mais SEULEMENT si elle peut le faire sans rien détruire.
   *
   * ⚠️ CE QU'ON NE DÉTRUIT JAMAIS : une recherche tapée, des pages chargées par « Voir plus ». Dans ces cas la liste
   * ne bouge pas et l'écran ANNONCE le courrier, en laissant la personne décider. Écraser le travail de quelqu'un
   * pour lui montrer un mail de plus serait un mauvais échange.
   *
   * `0` (le défaut) = aucun battement : la liste se comporte exactement comme avant ce lot.
   */
  versionDonnees?: number;
  /**
   * ══ 🔴🔴 LOT STATUT-LIGNE-APRES-CLASSEMENT — LE BATTEMENT DU STATUT ═══════════════════════════════════════════
   *
   * Un nombre que l'écran parent INCRÉMENTE quand un classement vient d'être validé AILLEURS (dans la conversation
   * ouverte par-dessus : Rattacher, Interne, Hors gestion, étape 2 « nouveau contact »). La liste relit alors SA
   * PAGE COURANTE, et la capsule de la ligne redit ce qui est en base.
   *
   * 🔴 CE QU'IL NE FAIT PAS, ET C'EST TOUT SON INTÉRÊT : il ne revient PAS à la première page, ne vide PAS la
   * recherche tapée, et ne demande AUCUNE permission à `listePeutSeRecharger`. Ce garde-là protège le travail en
   * cours contre un rafraîchissement qu'on n'a pas demandé (du courrier qui arrive) ; ici, c'est l'inverse — on
   * vient de faire le geste soi-même, et c'est son RÉSULTAT qu'on veut voir. Lui appliquer le garde aurait laissé
   * « À classer » affiché précisément quand on regarde si le classement a pris.
   *
   * 🔴 ET LE STATUT N'EST PAS RECALCULÉ ICI. On relit la page : la capsule sort de `capsuleStatut`, nourrie par la
   * requête de la boîte, comme toujours. Poser le nouveau statut à la main dans l'état d'écran aurait fait une
   * seconde écriture de la règle de priorité — celle qui s'est déjà mise à mentir une fois (voir `sqlSortesBien`).
   *
   * `0` (le défaut) = aucun battement : la liste se comporte exactement comme avant ce lot.
   */
  versionStatuts?: number;
  /**
   * LOT ERGO-BOITE — UN SEUL GESTE : relever le courrier PUIS rafraîchir l'écran. Absent ⇒ aucune icône, et la liste
   * est exactement celle d'avant ce lot (c'est le cas de la recherche et des écrans qui n'ont rien à relever).
   */
  onRelever?: () => void;
  releveEnCours?: boolean;
  /**
   * LOT ERGO-BOITE-3 — le sélecteur de « Réception » : `'non-lus'` restreint la liste aux échanges portant un
   * message reçu non lu, `null` (le défaut) les montre tous. Il entre dans la CLÉ de rechargement, donc le
   * rafraîchissement automatique de 30 s et l'icône « Relever et actualiser » le respectent d'eux-mêmes.
   */
  filtre?: 'non-lus' | null;
  /**
   * LOT FILTRE-ETOILE — ne montrer que les échanges étoilés. Il entre dans la CLÉ de rechargement, donc le
   * rafraîchissement automatique de 30 s et « Relever et actualiser » le respectent d'eux-mêmes — et un échange
   * dont on retire l'étoile disparaît de la liste à la relecture suivante.
   */
  etoile?: boolean;
  /**
   * Bascule le filtre. ABSENT ⇒ aucun bouton n'est rendu : la liste est alors exactement celle d'avant ce lot
   * (c'est le cas de l'écran partagé, qui n'a pas d'adresse où inscrire le choix).
   */
  onEtoileFiltre?: (actif: boolean) => void;
  /** Prévient le parent que la liste vient de se relire — il peut oublier ce qu'il avait à annoncer. */
  onListeRelue?: () => void;
  /**
   * ══ 🔴 LOT BOITE-INTERNE-CORBEILLE — LA SÉLECTION PAR CASES ═══════════════════════════════════════════════════
   *
   * ABSENTE (le défaut, et toutes les autres étiquettes) ⇒ AUCUNE case n'est rendue : la liste est alors
   * EXACTEMENT celle d'avant ce lot, au pixel près. C'est la règle de ce composant depuis le lot 5-BOITE-3 pour le
   * menu d'une ligne, et elle vaut ici : une case à cocher sur chaque ligne de la Réception serait un ajout que
   * personne n'a demandé.
   *
   * 🔴 LA CASE PORTE L'ÉCHANGE, pas le mail — comme la ligne elle-même. Le geste, lui, ira chercher les mails
   * concernés côté serveur (`messagesDuFil`), là où la question se pose vraiment.
   *
   * ⚠️ `onPage` REMONTE LES LIGNES AFFICHÉES à chaque lecture. Sans lui, « tout sélectionner (la page) » devrait
   * deviner ce que la liste montre — or elle seule le sait, pagination et « Voir plus » compris.
   */
  selection?: {
    actives: ReadonlySet<number>;
    onBasculer: (filId: number, coche: boolean) => void;
    /** Les lignes AFFICHÉES, avec le nombre de mails que chacune porte à la corbeille (cf. `nbCorbeille`). */
    onPage: (lignes: { filId: number; nbCorbeille: number }[]) => void;
  };
}) {
  const [etat, setEtat] = useState<Etat>({ v: 'charge' });
  const [autoInterne, setAutoInterne] = useState(false);
  const [suite, setSuite] = useState(false);
  const [maintenant, setMaintenant] = useState<Date | null>(null);
  // LOT 5c — la SAISIE en cours, et le critère VALIDÉ. Les deux sont distincts à dessein : on ne lance pas une
  //   recherche sur 56 000 messages à chaque frappe, on la lance quand la personne a fini de taper.
  const [saisie, setSaisie] = useState<Critere>(CRITERE_VIDE);
  const [critere, setCritere] = useState<Critere>(CRITERE_VIDE);
  const [filtres, setFiltres] = useState(false);
  /**
   * ══ 🔴🔴 LOT LISTE-PAGINATION — OÙ L'ON EN EST, ET COMMENT ON REVIENT EN ARRIÈRE ═══════════════════════════════
   *
   * `page` est le rang affiché, à partir de 0. `curseurs` est la PILE des curseurs déjà employés : `curseurs[0]`
   * vaut toujours `null` (la première page n'en a pas), et `curseurs[n]` est celui qui a servi à lire la page n.
   *
   * 🔴 POURQUOI UNE PILE, ET PAS UN CALCUL. La boîte se pagine PAR CURSEUR, jamais par `OFFSET` — c'est une règle
   * écrite du dépôt (`boiteRepo`), et elle est ce qui permet au `LIMIT` d'arrêter le parcours au lieu de lire et
   * de jeter huit mille lignes. Un curseur ne se calcule pas : il se REÇOIT du serveur, page après page. Revenir
   * en arrière consiste donc à reprendre un curseur DÉJÀ VU, et la pile est exactement la mémoire de ceux-là.
   *
   * ⚠️ `useRef` ET NON `useState` : la pile ne s'affiche jamais, elle ne fait que se souvenir. En état, chaque
   * empilement provoquerait un rendu de plus, juste avant celui que la nouvelle page provoque de toute façon.
   *
   * 🔴 ET LA PAGE SURVIT À L'OUVERTURE D'UN ÉCHANGE, sans une ligne de plus : la liste n'est pas démontée quand on
   * ouvre un mail, elle est seulement MASQUÉE (`hidden` dans `PleinEcranBoite`). Son état vit donc jusqu'au
   * retour — c'est ce qui répond à « la page courante est conservée au retour depuis un fil ».
   */
  const [page, setPage] = useState(0);
  const curseurs = useRef<(CurseurBoite | null)[]>([null]);
  /**
   * ══ 🔴🔴 LOT RATTACHER-EN-ECRIVANT — LE CACHE COURT DES PAGES ════════════════════════════════════════════════
   *
   * MESURÉ le 30/09/2026 : un clic sur « › » coûtait 727 à 1 044 ms, dont 625 à 1 022 ms d'ATTENTE SERVEUR pour
   * 1 ms de transfert. Le temps n'est ni dans le réseau ni dans le rendu : il est dans la requête. On ne la
   * refait donc pas quand on peut l'éviter — et on la fait D'AVANCE quand on peut l'anticiper.
   *
   * ⚠️ `useRef` ET NON `useState` : le cache ne s'affiche jamais. En état, chaque page rangée provoquerait un
   * rendu de plus, juste avant celui que la page provoque de toute façon.
   */
  const cache = useRef(new CachePages<ReponseBoite>());
  /** Les curseurs préchargés, pour savoir de quoi partir sans attendre que la page soit affichée. */
  const curseursPrecharges = useRef<Map<number, CurseurBoite | null>>(new Map());
  /** Un préchargement est-il déjà en cours pour ce rang ? Deux requêtes pour la même page ne servent à rien. */
  const prechargeEnCours = useRef<Set<string>>(new Set());
  /**
   * ⚠️ UN RELAIS, ET IL EST NÉCESSAIRE. `premiere` est mémoïsée SANS dépendance (c'est ce qui l'empêche de
   * relancer l'effet de montage à chaque rendu) : elle ne peut donc pas appeler `precharger`, qui lit `auto`,
   * `critere` et l'étiquette du rendu courant. Le relais est une référence mise à jour à chaque rendu — la
   * fonction appelée est donc toujours la fraîche, sans que `premiere` change d'identité.
   */
  const cachePremiere = useRef<(r: ReponseBoite) => void>(() => {});
  /**
   * 🔴🔴 LOT STATUT-LIGNE-APRES-CLASSEMENT — LE MÊME RELAIS, POUR LA MÊME RAISON (voir l'encadré ci-dessus).
   * Relire la page COURANTE demande l'étiquette, le critère, les filtres, le rang de la page et son curseur — tout
   * ce que l'effet du battement n'a pas le droit de surveiller sans se redéclencher à chaque rendu. La référence
   * est remise à jour à CHAQUE rendu : la fonction appelée est donc toujours celle du rendu courant.
   */
  const relireSurPlace = useRef<() => void>(() => {});
  /**
   * Le haut de la liste, pour y revenir à chaque changement de page.
   *
   * ⚠️ CE N'EST PAS UN LUXE : les pages font 25 lignes, et arriver page 2 au milieu donne l'impression d'avoir
   * sauté des échanges. Demande explicite d'Arno (« changer de page remonte en haut de la liste »).
   */
  const hautDeListe = useRef<HTMLElement | null>(null);
  /**
   * ══ LOT LISTE-GMAIL — L'ÉTOILE DE L'ÉQUIPE ════════════════════════════════════════════════════════════════════
   * `etoiles` dit si le GESTE est possible (migration 264) ; `etoilees` porte l'état de la page, mis à jour SUR
   * PLACE après un clic. On ne relit pas la liste pour une étoile : relire perdrait les pages déroulées par « Voir
   * plus » et la position de défilement, pour un booléen que le serveur vient de confirmer.
   */
  const [etoiles, setEtoiles] = useState(false);
  const [etoilees, setEtoilees] = useState<Map<number, boolean>>(new Map());
  /**
   * ══ 🔴 RELU À CHAQUE LECTURE DE LA PREMIÈRE PAGE, ET NON UNE SEULE FOIS AU MONTAGE ════════════════════════════
   * DÉFAUT CONSTATÉ PAR ARNO le 27/09/2026 : la migration 264 appliquée, l'étoile restait grisée avec « mise à jour
   * de la base à appliquer ».
   *
   * 🔴 LA SONDE DE SCHÉMA N'Y ÉTAIT POUR RIEN, et c'est ce qu'il fallait vérifier avant de la toucher : elle ne
   * mémorise JAMAIS un « non » (règle posée le 24/09 après le même symptôme, `sondeSchema.ts`), elle le réessaie au
   * bout de cinq secondes. Mesuré ce jour-là : la route répondait bien `etoileDisponible: true`.
   *
   * C'était CE drapeau-ci, lu une seule fois au montage et jamais revu : une page ouverte AVANT la migration
   * gardait « absente » jusqu'au rechargement. On le relit donc à chaque première page — donc au rafraîchissement
   * automatique de 30 s et à « Relever et actualiser ». Une migration appliquée à chaud est prise en compte en
   * moins d'une minute, sans recharger la page et sans redémarrer le serveur.
   *
   * ⚠️ `cleRelecture` NE DÉPEND PAS de l'étiquette ni du critère : ce drapeau est une propriété de la BASE, pas de
   * ce qu'on regarde. Le relier à eux ferait une requête à chaque clic dans la colonne, pour une réponse identique.
   */
  const [cleRelecture, setCleRelecture] = useState(0);
  /**
   * 🔴 QUELLE LIGNE DEMANDE CONFIRMATION D'UNE MISE À LA CORBEILLE — au plus UNE, et c'est tout l'intérêt de la
   * tenir ici plutôt que dans chaque barre. La confirmation est le seul cas où une barre reste visible sans que la
   * souris soit dessus ; gardée par chaque barre, deux lignes pouvaient rester allumées en même temps.
   */
  const [confirmeSur, setConfirmeSur] = useState<number | null>(null);
  /**
   * LOT BARRE-STATUT — l'échange dont on regarde les rattachements. `null` = aucune fenêtre ouverte.
   * ⚠️ Gardé ICI, dans la liste, et non dans chaque barre : c'est ce qui garantit qu'il n'y en a jamais DEUX
   *    ouvertes — même règle que la confirmation de corbeille juste au-dessus.
   */
  const [rattachementsDe, setRattachementsDe] = useState<{ filId: number; objet: string | null } | null>(null);
  useEffect(() => {
    let annule = false;
    void (async () => {
      try {
        const res = await fetch('/api/admin/gestion/boite/comptes', { cache: 'no-store' });
        if (!res.ok || annule) return;
        const c = (await res.json()) as { etoileDisponible?: boolean };
        if (!annule) setEtoiles(c.etoileDisponible === true);
      } catch { /* étoile indisponible : le bouton le dira lui-même, en info-bulle */ }
    })();
    return () => { annule = true; };
  }, [cleRelecture]);
  /**
   * 🔴 L'ÉTAT DEMANDÉ EST ENVOYÉ, JAMAIS « L'INVERSE DE CE QUI EST LÀ » — et il est posé À L'ÉCRAN AVANT la
   * réponse, puis DÉFAIT si le serveur refuse. Une étoile qui met une seconde à apparaître donne l'impression que
   * le clic n'a pas porté ; une étoile qui reste allumée après un refus est un mensonge.
   */
  const basculerEtoile = async (filId: number, etoilee: boolean) => {
    setEtoilees((m) => new Map(m).set(filId, etoilee));
    try {
      const res = await fetch(`/api/admin/gestion/fils/${filId}/etoile`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ etoilee }),
      });
      if (!res.ok) setEtoilees((m) => new Map(m).set(filId, !etoilee));
    } catch {
      setEtoilees((m) => new Map(m).set(filId, !etoilee));
    }
  };

  const cherche = critereActif(critere);
  /**
   * LOT ÉCRAN-VIVANT — la liste peut-elle se relire sans détruire le travail en cours ? UNE seule définition, lue par
   * l'effet ET par la mention : deux conditions finiraient par diverger, et l'écran annoncerait du courrier qu'il
   * vient d'afficher.
   */
  const peutSeRecharger = listePeutSeRecharger({
    rechercheEnCours: cherche,
    /**
     * 🔴 LOT LISTE-PAGINATION — « on n'est plus sur la première page » REMPLACE « des pages ont été déroulées ».
     * La question posée est la même — « relire la première page détruirait-il le travail en cours ? » — et la
     * réponse aussi : page 12, une relecture silencieuse ramènerait sans prévenir aux vingt-cinq plus récents.
     */
    pagesSupplementaires: page > 0,
    selectionEnCours: false,   // la liste ne porte pas encore de sélection multiple
  });
  // L'interrupteur est PILOTÉ s'il l'est, interne sinon. Et l'étiquette peut l'imposer : voir `autoImposeParEtiquette`.
  //   ⚠️ Pas PENDANT une recherche : celle-ci traverse les étiquettes, donc l'étiquette n'a plus voix au chapitre et
  //   l'interrupteur redevient maître — un bouton qui ne fait rien est pire qu'un bouton absent.
  const impose = cherche ? null : autoImposeParEtiquette(etiquette);
  const auto = impose ?? autoPilote ?? autoInterne;
  const basculerAuto = (v: boolean) => { if (onAuto) onAuto(v); else setAutoInterne(v); };
  // L'étiquette sert de clé de rechargement : changer d'étiquette relit la première page, comme changer de critère.
  const cleEtiquette = texteEtiquette(etiquette);

  // La date de référence n'est posée qu'APRÈS le montage : la calculer au rendu serveur ferait diverger l'hydratation.
  useEffect(() => { setMaintenant(new Date()); }, []);

  const premiere = useCallback(async (
    avecAuto: boolean, c: Critere, e: Etiquette, f: 'non-lus' | null = null, et = false,
  ) => {
    setEtat({ v: 'charge' });
    // Une lecture de la première page = une occasion de revoir ce que la base sait faire (cf. l'encadré de
    //   `cleRelecture`). Cela ne coûte rien de plus : la route des comptes est déjà appelée ici.
    setCleRelecture((n) => n + 1);
    /**
     * 🔴 LOT LISTE-PAGINATION — ON REPART DE LA PREMIÈRE PAGE, ET LA PILE DE CURSEURS EST REMISE À PLAT.
     * Garder la pile d'une autre liste ferait reculer vers des échanges d'une étiquette qu'on a quittée : les
     * curseurs sont des repères DANS un parcours, ils n'ont aucun sens dans un autre.
     */
    setPage(0);
    curseurs.current = [null];
    /**
     * ══ 🔴 LE CACHE EST VIDÉ ICI, ET C'EST LE POINT DE PASSAGE DE TOUT CE QUI CHANGE LA LISTE ═════════════════
     *
     * `premiere` est appelée par la relève (« Relever et actualiser »), par le rafraîchissement automatique,
     * après un geste sur une ligne (classer, corbeille, lu — `versionDonnees`), et à chaque changement
     * d'étiquette, de filtre ou de recherche. Vider ICI couvre donc les trois familles qu'Arno nomme, sans avoir
     * à se souvenir de le faire à chaque appelant — et un appelant nouveau en hérite d'office.
     *
     * 🔴 ON VIDE TOUT plutôt que de deviner quelles pages sont touchées : un mail classé change la page où il
     * était, TOUTES celles qui la suivaient (les lignes remontent d'un cran) et les totaux. Deviner reviendrait à
     * réécrire la requête dans le navigateur.
     */
    cache.current.vider();
    curseursPrecharges.current.clear();
    const r = await chargerPage(null, avecAuto, c, e, f, et);
    if ('erreur' in r) { setEtat({ v: 'erreur', m: r.erreur }); return; }
    setEtat({
      // ⚠️ `r.total ?? r.lignes.length` A ÉTÉ RETIRÉ : voir l'encadré du champ `total` de `Etat`.
      // 🔴 `?? null` : la route de RECHERCHE ne rend aucun compte. Voir l'encadré du champ `comptes`.
      v: 'ok', lignes: r.lignes, suivant: r.suivant, total: r.total ?? null, comptes: r.comptes ?? null,
      pleinTexte: r.pleinTexte !== false, automatiquesMasques: r.automatiquesMasques ?? null,
      brouillons: r.brouillons ?? { lignes: [], tronque: false },
      nonLus: new Set(r.nonLus ?? []), nonLusTotal: r.nonLusTotal ?? null, nonLusPartiel: r.nonLusPartiel === true,
    });
    /**
     * 🔴 LA PREMIÈRE PAGE EST RANGÉE, ET LES SUIVANTES SONT DEMANDÉES D'AVANCE. C'est ici que le préchargement
     * commence vraiment : quand on ouvre une liste, on la lit — et pendant ce temps les deux pages suivantes
     * arrivent, de sorte que le premier « › » ne coûte rien.
     *
     * ⚠️ APRÈS `setEtat`, jamais avant : la page qu'on affiche passe en premier, toujours.
     */
    cachePremiere.current(r);
  }, []);

  // `cleEtiquette` plutôt que l'objet : deux objets égaux mais distincts relanceraient la lecture à chaque rendu.
  // `filtre` entre dans les dépendances : changer de sélecteur relit la première page, comme changer d'étiquette.
  useEffect(() => { void premiere(auto, critere, etiquetteDepuisTexte(cleEtiquette), filtre, etoile); },
    [premiere, auto, critere, cleEtiquette, filtre, etoile]);

  /**
   * ══ 🔴 LOT ÉCRAN-VIVANT — LA LISTE SE RELIT QUAND DU COURRIER ARRIVE, SI ELLE PEUT LE FAIRE SANS RIEN PERDRE ══
   *
   * ⚠️ `pagesSupplementaires` SE DÉDUIT DU NOMBRE DE LIGNES AFFICHÉES : au-delà d'une page, c'est que quelqu'un a
   * cliqué « Voir plus ». Relire la première page lui reprendrait tout ce qu'il a déroulé.
   *
   * 🔴 AUCUN RISQUE DE BOUCLE : cet effet ne dépend que de `versionDonnees` (un nombre qui ne change que sur décision
   * du parent) et de valeurs dérivées stables. Il n'écrit jamais `versionDonnees`, et `premiere` est mémoïsée sans
   * dépendance. La boucle qui a saturé la mémoire venait d'un état recréé à chaque rendu ; il n'y en a aucun ici.
   */
  useEffect(() => {
    if (!versionDonnees) return;                                  // 0 ou absent : comportement d'avant ce lot
    if (!peutSeRecharger) return;
    void premiere(auto, critere, etiquetteDepuisTexte(cleEtiquette), filtre, etoile).then(() => onListeRelue?.());
    // eslint-disable-next-line react-hooks/exhaustive-deps -- volontaire : SEUL `versionDonnees` déclenche ce
    //   rafraîchissement. Ajouter `critere`, `auto` ou `cleEtiquette` ferait doublon avec l'effet ci-dessus, qui les
    //   surveille déjà — et relirait deux fois la même page à chaque changement d'étiquette.
  }, [versionDonnees]);

  /**
   * ══ 🔴🔴 LOT STATUT-LIGNE-APRES-CLASSEMENT — LA LIGNE SUIT LE CLASSEMENT QU'ON VIENT DE VALIDER ════════════════
   *
   * `versionStatuts` ne change que sur décision du parent, après un geste de classement fait dans la conversation.
   * On relit alors la page courante (voir `relireSurPlace`) — pas la première, pas toute la liste.
   *
   * 🔴 AUCUN RISQUE DE BOUCLE : cet effet ne dépend QUE de `versionStatuts`, qu'il n'écrit jamais, et il passe par
   * une référence plutôt que par des valeurs du rendu. C'est la discipline posée après la boucle de rendu qui a
   * saturé la mémoire dans ce fichier (encadré de `rafraichir.ts`).
   */
  useEffect(() => {
    if (!versionStatuts) return;                                  // 0 ou absent : comportement d'avant ce lot
    relireSurPlace.current();
  }, [versionStatuts]);

  // LOT 5-BOITE — le gras suit le geste, SUR PLACE. `cle` change à chaque marquage ; le contenu, lui, peut être
  //   identique deux fois de suite (rouvrir le même échange), d'où une clé plutôt qu'une comparaison de valeurs.
  const cleMarquage = marquage?.cle ?? 0;
  useEffect(() => {
    if (!marquage || cleMarquage === 0) return;
    setEtat((e) => {
      if (e.v !== 'ok' || e.nonLus.has(marquage.filId) === marquage.nonLu) return e; // déjà dans cet état : rien à dire
      const nonLus = new Set(e.nonLus);
      if (marquage.nonLu) nonLus.add(marquage.filId); else nonLus.delete(marquage.filId);
      return {
        ...e, nonLus,
        // Le compteur bouge du même geste. Il sera de toute façon recalculé par le serveur au prochain changement
        //   d'étiquette, de filtre ou de recherche : il ne peut donc pas dériver longtemps.
        nonLusTotal: e.nonLusTotal === null ? null : Math.max(0, e.nonLusTotal + (marquage.nonLu ? 1 : -1)),
      };
    });
    // `marquage` est recréé à chaque rendu du parent : seule la CLÉ doit déclencher, sinon on rejouerait sans fin.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cleMarquage]);

  // Le total remonte au parent chaque fois qu'il change — d'où qu'il vienne : première page, ou marquage sur place.
  const totalNonLus = etat.v === 'ok' ? etat.nonLusTotal : null;
  const partielNonLus = etat.v === 'ok' && etat.nonLusPartiel;
  useEffect(() => { if (onNonLus) onNonLus(totalNonLus, partielNonLus); }, [onNonLus, totalNonLus, partielNonLus]);

  /**
   * 🔴🔴 LOT DOSSIER-A-CLASSER — LE TOTAL DE L'ÉTIQUETTE OUVERTE, REMONTÉ comme les non-lus juste au-dessus.
   *
   * ⚠️ IL NE REMONTE QUE SUR UN ÉTAT `ok` : pendant le chargement ou après une erreur, la liste ne sait rien, et
   * annoncer `null` ferait clignoter le compteur de la colonne à chaque relecture.
   */
  const totalAffiche = etat.v === 'ok' ? etat.total : undefined;
  useEffect(() => {
    if (onTotalEtiquette === undefined || totalAffiche === undefined) return;
    onTotalEtiquette(etiquette.sorte, totalAffiche);
  }, [onTotalEtiquette, etiquette.sorte, totalAffiche]);

  /**
   * ══ 🔴 LOT BOITE-INTERNE-CORBEILLE — LES LIGNES AFFICHÉES REMONTENT AU PARENT ═════════════════════════════════
   * Elle seule sait ce qu'elle montre : la page courante, plus tout ce que « Voir plus » a déroulé. Le parent en a
   * besoin pour « tout sélectionner (la page) » — et pour ÉLAGUER sa sélection quand la liste se relit : un
   * échange réintégré disparaît de la corbeille, et une case cochée sur une ligne absente ferait agir sur un mail
   * qu'on ne voit plus.
   *
   * ⚠️ LES LIGNES FABRIQUÉES SONT ÉCARTÉES (`filId > 0`) : un mail qui n'est pas parti n'est pas un échange, il
   * n'a pas de corbeille, et rien ne doit pouvoir le sélectionner.
   *
   * ⚠️ LA CLÉ EST LA CHAÎNE DES IDENTIFIANTS, et non le tableau : un tableau recréé à chaque rendu relancerait
   * l'effet sans fin — le même piège que `EncartAnnuaire` a déjà rencontré.
   */
  const cleAffiches = etat.v === 'ok'
    ? etat.lignes.filter((l) => l.filId > 0).map((l) => `${l.filId}:${l.nbCorbeille ?? 0}`).join(',')
    : '';
  /**
   * 🔴 LA FONCTION PASSE PAR UNE RÉFÉRENCE, ET L'EFFET NE DÉPEND QUE DE LA CLÉ — CORRECTIF MESURÉ.
   *
   * Première écriture : `useEffect(…, [onPage, cleAffiches])`. `selection` est un objet littéral, donc RECRÉÉ à
   * chaque rendu du parent ; `onPage` changeait donc d'identité à chaque rendu, l'effet repartait, il appelait le
   * parent, qui posait un état, qui re-rendait… Le test d'écran ne s'est pas contenté d'échouer : il a TOURNÉ SANS
   * FIN, ce qui est la forme la plus coûteuse de ce défaut — on ne la découvre pas en lisant un diff.
   *
   * La CLÉ (la chaîne des identifiants et de leurs comptes) est la seule chose qui doit déclencher l'appel : c'est
   * elle, et elle seule, qui dit que la liste montre autre chose qu'avant.
   */
  const onPageRef = useRef(selection?.onPage);
  /**
   * ⚠️ LA RÉFÉRENCE S'ÉCRIT DANS UN EFFET, jamais pendant le rendu : le compilateur React refuse d'y toucher au
   * rendu (« Cannot access refs during render »), et il a raison — une référence lue pendant le rendu rend le
   * résultat dépendant de l'ordre des rendus. Cet effet-ci est DÉCLARÉ AVANT celui qui la lit, et React les
   * exécute dans l'ordre de déclaration : la valeur est donc toujours à jour quand on s'en sert.
   */
  useEffect(() => { onPageRef.current = selection?.onPage; });
  useEffect(() => {
    const dire = onPageRef.current;
    if (dire === undefined) return;
    dire(cleAffiches === '' ? [] : cleAffiches.split(',').map((x) => {
      const [f, n] = x.split(':');
      return { filId: Number(f), nbCorbeille: Number(n) };
    }));
  }, [cleAffiches]);

  /**
   * ══ 🔴🔴 LOT LISTE-PAGINATION — CHANGER DE PAGE ═════════════════════════════════════════════════════════════
   *
   * CE QUE ÇA REMPLACE : `voirPlus()`, qui CONCATÉNAIT la page suivante sous les précédentes, derrière un bouton
   * « Voir les échanges plus anciens ». Arno demande sa suppression et une pagination façon Gmail. On REMPLACE
   * donc les lignes au lieu de les empiler — c'est la différence entre « la page 2 » et « les cinquante
   * premiers ».
   *
   * 🔴 AVANCER SUIT LE CURSEUR DU SERVEUR (`etat.suivant`), RECULER REPREND UN CURSEUR DÉJÀ VU. Aucun curseur
   * n'est jamais fabriqué ici : la pagination par curseur ne le permet pas, et c'est précisément ce qui la rend
   * exacte quand du courrier arrive pendant qu'on lit.
   *
   * ⚠️ UN CHANGEMENT DE PAGE RATÉ NE CHANGE PAS LA PAGE. On n'avance `page` qu'APRÈS une réponse valide : sinon
   * l'écran annoncerait « 26–50 » au-dessus des lignes de la page 1, ce qui est le genre de mensonge qu'on ne
   * remarque qu'une fois le mail cherché longtemps.
   *
   * ⚠️ LES BROUILLONS NE SONT RENDUS QU'À LA PREMIÈRE PAGE (règle d'avant ce lot, cf. `chercherDansLesBrouillons`)
   * : on GARDE donc ceux qu'on a plutôt que de les effacer en tournant la page — ils correspondent toujours.
   */
  /**
   * ══ 🔴 LA CLÉ D'UNE PAGE DANS LE CACHE ═══════════════════════════════════════════════════════════════════════
   * Tout ce qui décide du CONTENU d'une page y entre : l'étiquette, le rang, et chacun des filtres. En oublier un
   * servirait la page de « Réception » sous « Spam » — un cache qui se trompe de page est pire que pas de cache.
   */
  const cleListe = (rang: number) => cleDePage({
    etiquette: cleEtiquette, page: rang, auto, filtre, etoile,
    // ⚠️ LE CRITÈRE ENTIER : deux recherches différentes ne partagent jamais une page.
    recherche: cherche ? JSON.stringify(critere) : '',
  });

  /**
   * ══ 🔴 PRÉCHARGER, EN ARRIÈRE-PLAN ET SANS RIEN BLOQUER ══════════════════════════════════════════════════════
   *
   * Les rangs viennent du module PUR (`pagesAPrecharger`) : deux pages en avant, plus la précédente quand on
   * vient de reculer. Ils sont demandés EN SÉRIE et non en parallèle — chaque curseur se lit dans la réponse de
   * la page d'avant, et trois requêtes simultanées se disputeraient le serveur qu'on essaie justement de
   * soulager.
   *
   * ⚠️ ELLE NE LÈVE JAMAIS ET NE CHANGE AUCUN ÉTAT VISIBLE. Un préchargement raté n'est pas une panne : la page
   * sera simplement demandée quand on cliquera, comme avant ce lot.
   */
  async function precharger(depuisPage: number, versLArriere: boolean, curseurSuivant: CurseurBoite | null) {
    const rangs = pagesAPrecharger({ page: depuisPage, versLArriere, suite: curseurSuivant !== null });
    let curseur = curseurSuivant;
    for (const rang of rangs) {
      const cle = cleListe(rang);
      // Déjà là, ou déjà demandé : on ne redemande pas. Le second cas compte autant que le premier — sans lui,
      //   deux clics rapides lanceraient deux fois la même requête.
      if (cache.current.lire(cle, Date.now()) !== null || prechargeEnCours.current.has(cle)) {
        curseur = curseursPrecharges.current.get(rang + 1) ?? curseur;
        continue;
      }
      const depart = rang < depuisPage ? (curseurs.current[rang] ?? null) : curseur;
      if (rang > depuisPage && depart === null) break;   // plus de suite : rien à précharger au-delà
      prechargeEnCours.current.add(cle);
      try {
        const r = await chargerPage(depart, auto, critere, etiquette, filtre, etoile);
        if (!('erreur' in r)) {
          cache.current.ranger(cle, r, Date.now());
          curseursPrecharges.current.set(rang, depart);
          curseur = r.suivant;
        } else {
          break;   // le serveur n'a pas répondu : on n'insiste pas en arrière-plan
        }
      } catch {
        break;
      } finally {
        prechargeEnCours.current.delete(cle);
      }
    }
  }

  /**
   * Le relais, remis à jour à CHAQUE rendu : il range la première page et lance le préchargement, avec les
   * valeurs du rendu courant. Voir l'encadré de `cachePremiere`.
   */
  cachePremiere.current = (r) => {
    cache.current.ranger(cleListe(0), r, Date.now());
    void precharger(0, false, r.suivant);
  };

  /**
   * ══ 🔴🔴 LOT STATUT-LIGNE-APRES-CLASSEMENT — RELIRE LA PAGE COURANTE, SANS BOUGER DE PLACE ════════════════════
   *
   * Demande d'Arno : « la ligne se met à jour immédiatement au retour dans la liste (même mise à jour optimiste que
   * pour Rattacher) ». Le geste « Rattacher » depuis la liste passe, lui, par `premiere()` — c'est légitime là-bas :
   * on vient de cliquer DANS la liste, qu'on a sous les yeux. Ici le geste a eu lieu dans la conversation, et la
   * liste attend derrière avec sa page, sa recherche et son défilement : les lui reprendre serait payer la
   * correction d'un défaut par un autre.
   *
   * CE QUI EST FAIT, DONC, ET RIEN DE PLUS :
   *   · le CACHE est vidé — une page gardée porte l'état d'avant le geste, et c'est exactement ce qu'on répare ;
   *   · la page du rang COURANT est redemandée avec le curseur qui l'avait servie (`curseurs.current[page]`) ;
   *   · les lignes et le total sont remplacés ; le rang, la recherche et les filtres ne bougent pas.
   *
   * ⚠️ ON NE PASSE PAS PAR L'ÉTAT « chargement ». La liste est masquée derrière la conversation au moment où ce
   * battement part : un squelette rendrait l'écran vide le temps du retour, pour une page qui arrive en 1 ms.
   *
   * ⚠️ UN ÉCHEC NE DÉTRUIT RIEN. On garde les lignes qu'on a : une liste d'un instant trop vieille vaut mieux
   * qu'un écran d'erreur à la place d'une boîte mail — et le prochain chargement la corrigera de toute façon.
   *
   * ⚠️ `total` NE S'ÉCRASE PAS AVEC `null` : le serveur ne le rend qu'à la première page (règle d'`allerPage`).
   * Au-delà, on garde celui qu'on avait, sinon le « sur N » disparaîtrait au premier classement fait page 2.
   */
  relireSurPlace.current = () => {
    void (async () => {
      if (etat.v !== 'ok') return;          // en chargement ou en erreur : la lecture en cours dira la vérité
      cache.current.vider();
      curseursPrecharges.current.clear();
      const depart = curseurs.current[page] ?? null;
      const r = await chargerPage(depart, auto, critere, etiquette, filtre, etoile);
      if ('erreur' in r) return;
      cache.current.ranger(cleListe(page), r, Date.now());
      setEtat((e) => (e.v !== 'ok' ? e : {
        ...e, lignes: r.lignes, suivant: r.suivant,
        total: r.total ?? e.total, comptes: r.comptes ?? e.comptes,
        brouillons: r.brouillons ?? e.brouillons,
        // Les non-lus sont ceux de la page affichée : on REMPLACE, comme les lignes (règle d'`allerPage`).
        nonLus: new Set(r.nonLus ?? []),
      }));
    })();
  };

  async function allerPage(vers: number) {
    if (etat.v !== 'ok' || suite) return;
    if (vers < 0 || vers === page) return;
    // On n'avance que d'un cran à la fois (les chevrons ne proposent rien d'autre) : le curseur de la page
    //   suivante est celui que le serveur vient de rendre, et lui seul.
    const curseur = vers > page ? etat.suivant : (curseurs.current[vers] ?? null);
    if (vers > page && curseur === null) return;   // pas de suite : le chevron est éteint, mais on se garde aussi ici

    /**
     * ══ 🔴🔴 UNE PAGE DÉJÀ VUE SE ROUVRE SANS UN SEUL ALLER-RETOUR ═════════════════════════════════════════
     * Demande d'Arno, mot pour mot. On ne passe même pas par l'état « chargement » : il n'y a rien à attendre,
     * et un squelette qui clignote une image ferait paraître lent ce qui est instantané.
     */
    const garde = cache.current.lire(cleListe(vers), Date.now());
    if (garde !== null) {
      curseurs.current[vers] = curseur;
      setPage(vers);
      setEtat({
        ...etat, lignes: garde.lignes, suivant: garde.suivant, total: etat.total, comptes: etat.comptes,
        nonLus: new Set(garde.nonLus ?? []),
        nonLusTotal: etat.nonLusTotal, nonLusPartiel: etat.nonLusPartiel, brouillons: etat.brouillons,
      });
      hautDeListe.current?.scrollIntoView?.({ block: 'start' });
      void precharger(vers, vers < page, garde.suivant);
      return;
    }

    setSuite(true);
    const r = await chargerPage(curseur, auto, critere, etiquette, filtre, etoile);
    setSuite(false);
    if (!('erreur' in r)) cache.current.ranger(cleListe(vers), r, Date.now());
    if ('erreur' in r) { setEtat({ v: 'erreur', m: r.erreur }); return; }
    curseurs.current[vers] = curseur;
    setPage(vers);
    setEtat({
      ...etat, lignes: r.lignes, suivant: r.suivant,
      /**
       * 🔴 LE TOTAL NE SE RECOMPTE PAS D'UNE PAGE À L'AUTRE : le serveur ne le rend qu'à la première page, et le
       * redemander paierait pour rien un nombre qui n'a pas bougé. On garde donc celui qu'on a — `r.total` vaut
       * `null` ici, et l'écraser avec lui effacerait le « sur N » dès la page 2.
       */
      total: etat.total, comptes: etat.comptes,
      // Les non-lus sont ceux de la page affichée : on REMPLACE, comme les lignes.
      nonLus: new Set(r.nonLus ?? []),
      nonLusTotal: etat.nonLusTotal, nonLusPartiel: etat.nonLusPartiel,
      brouillons: etat.brouillons,
    });
    /**
     * ⚠️ REMONTER EN HAUT DE LA LISTE, demandé par Arno. `scrollIntoView` sur le haut de la section plutôt qu'un
     * `window.scrollTo` : la liste vit dans un conteneur qui défile (le plein écran), et remonter la FENÊTRE ne
     * remonterait pas le bon élément. Le `?.` couvre jsdom, qui ne l'implémente pas — un test ne doit pas tomber
     * pour un défilement.
     */
    hautDeListe.current?.scrollIntoView?.({ block: 'start' });

    /**
     * 🔴 LE PRÉCHARGEMENT PART **APRÈS** QUE LA PAGE EST RENDUE, jamais avant : la page qu'on est venu voir a la
     * priorité absolue. C'est la règle qu'Arno écrit, et c'est la même que l'amorce des voisins de la
     * visionneuse (lot PIECES-DE-LA-CONVERSATION) — pour la même raison : ne rien disputer à ce qu'on regarde.
     */
    void precharger(vers, vers < page, r.suivant);
  }

  if (etat.v === 'charge') return <p className="gst-info" role="status">Chargement de la boîte…</p>;
  if (etat.v === 'erreur') {
    return (
      <div>
        <p className="gst-erreur" role="status">{etat.m}</p>
        <button type="button" className="svv-btn svv-btn-outline gst-btn" onClick={() => void premiere(auto, critere, etiquette, filtre, etoile)}>Réessayer</button>
      </div>
    );
  }

  const ref = maintenant ?? new Date();
  /**
   * ══ 🔴🔴 LOT LISTE-PAGINATION — UN SEUL NOMBRE POUR LE TITRE ET POUR LES DEUX BARRES ══════════════════════════
   *
   * Demande d'Arno : « N = le nombre d'ÉCHANGES de la liste affichée, le même que le compteur de la catégorie ».
   * Il est donc calculé ICI, une fois, et les trois endroits qui l'affichent lisent la même variable. Trois
   * expressions « équivalentes » auraient fini par donner trois nombres — c'est exactement ce que la barre du haut
   * et le titre auraient vécu, séparés de quarante lignes de code.
   *
   * 🔴 IL VIENT DU SERVEUR, QUI L'A COMPTÉ AVEC LE PRÉDICAT DE CETTE LISTE (`sqlCompteBoite`,
   * `comptesDeLaRecherche`) — étiquette, filtre étoilé et sélecteur « non lus » compris. Le nombre porté par
   * l'étiquette (`total`, calculé par la colonne de gauche) ne sert plus que de repli quand le serveur n'a rien
   * compté : il ignore les filtres, et annonçait 8 546 au-dessus de deux lignes étoilées.
   */
  const nombreDeLaListe = etat.total ?? total ?? null;
  /**
   * La barre, rendue DEUX FOIS — au-dessus et au-dessous de la liste, comme Gmail et comme Arno le demande.
   * C'est le MÊME composant que les trois autres listes du module emploient (`BarrePages`) : « même pagination
   * partout » ne veut rien dire si chaque écran en écrit sa version.
   */
  const rendreBarre = (ou: 'haut' | 'bas') => (
    <BarrePages ou={ou} page={page} lignes={etat.lignes.length} total={nombreDeLaListe}
      // 🔴 LE SERVEUR DÉCIDE S'IL Y A UNE SUITE, jamais une soustraction : voir l'encadré de `barrePagination`.
      suite={etat.suivant !== null} occupe={suite} onPage={(v) => void allerPage(v)} />
  );
  return (
    <section aria-labelledby="bte-titre" ref={hautDeListe}>
      <h2 className="gst-titre" id="bte-titre">
        {cherche ? 'Résultats' : (titre ?? 'Boîte mail')}
        {/* 🔴 FILTRE ACTIF ⇒ LE COMPTE DE LA PAGE, PAS CELUI DE LA COLONNE. Voir `nombreDeLaListe` ci-dessus : le
            titre et les deux barres de pagination lisent désormais LE MÊME nombre, calculé une seule fois. */}
        {!cherche && nombreDeLaListe !== null && <span className="gst-compte">{nombreDeLaListe}</span>}
        {/* ══ LOT ERGO-BOITE — UNE SEULE ICÔNE À LA PLACE DE DEUX BOUTONS ═══════════════════════════════════════
            « Relever maintenant » et « Rafraîchir » faisaient deux choses qu'on veut toujours ensemble : aller
            chercher le courrier, puis montrer ce qu'on a trouvé. Relever sans rafraîchir laissait l'écran sur
            l'image d'avant — c'est exactement ce qui a fait croire, le 26/09, que la relève ne fonctionnait pas.
            🔴 L'ICÔNE N'EST PAS SEULE : `aria-label` et `title` portent la phrase « Relever et actualiser ». Une
            icône sans nom n'existe pas pour un lecteur d'écran, et ne s'apprend pas au survol sur un téléphone. */}
        {/* ══ 🔴 LOT FILTRE-ETOILE — L'ÉTOILE DU TITRE : montrer SEULEMENT les échanges étoilés ═══════════════
            Entre le compteur et l'icône de relève, dans le même bouton rond : c'est une bascule d'affichage, pas un
            geste sur un échange. Rouge et pleine quand elle filtre, grise et en contour sinon — deux marques, dont
            la FORME, qui survit aux niveaux de gris et au daltonisme.

            🔴 ELLE NE S'AFFICHE QUE SI L'ÉTOILE EXISTE (migration 264) : filtrer sur un état qu'on ne sait pas lire
            rendrait une liste vide sans raison compréhensible. Et `aria-pressed` dit l'état au clavier. */}
        {onEtoileFiltre && etoiles && (
          <button type="button" className={`bte-relever bte-filtre-etoile${etoile ? ' bte-filtre-etoile--actif' : ''}`}
            aria-pressed={etoile}
            aria-label={etoile ? 'Afficher tous les messages' : 'Afficher les messages étoilés'}
            title={etoile ? 'Afficher tous les messages' : 'Afficher les messages étoilés'}
            onClick={() => onEtoileFiltre(!etoile)}>
            <Etoile pleine={etoile} />
          </button>
        )}
        {onRelever && (
          <button type="button" className={`bte-relever${releveEnCours ? ' bte-relever--tourne' : ''}`}
            onClick={onRelever} disabled={releveEnCours}
            aria-label="Relever et actualiser" title="Relever et actualiser">
            <svg viewBox="0 0 24 24" width="17" height="17" aria-hidden="true"
              fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M20 12a8 8 0 1 1-2.34-5.66" />
              <path d="M20 4v4h-4" />
            </svg>
          </button>
        )}
        {/* ══ 🔴 LOT ERGO-BOITE-4 — CE QUE LA LISTE NE MONTRE PAS, SUR LA LIGNE DU TITRE ═══════════════════════
            La phrase occupait une ligne entière sous la recherche. Elle remonte ici, poussée à droite et en plus
            petit : elle reste lue, elle ne prend plus de hauteur. Le titre et l'icône, eux, ne bougent pas.

            🔴 ELLE N'EST PAS RACCOURCIE. Un outil qui cache sans le dire ment ; celui-ci dit COMBIEN il tait, et le
            ramène d'un clic. C'est la règle du module depuis le lot 4b, et la place ne la change pas.

            ⚠️ UN `span`, PAS UN `p` : ce bloc vit dans un `h2`, et un paragraphe dans un titre est du HTML
            invalide. Le bouton, lui, y est parfaitement légitime. */}
        {!cherche && impose === null && etat.comptes !== null && etat.comptes.automatiques > 0 && (
          <span className="bte-tait">
            {auto
              ? <>Le courrier automatique est inclus : {etat.comptes.automatiques} échange{etat.comptes.automatiques > 1 ? 's' : ''} ne contien{etat.comptes.automatiques > 1 ? 'nent' : 't'} que des messages tenus hors de la file par une règle.</>
              : <>{etat.comptes.automatiques} échange{etat.comptes.automatiques > 1 ? 's' : ''} ne contien{etat.comptes.automatiques > 1 ? 'nent' : 't'} que du courrier automatique et {etat.comptes.automatiques > 1 ? 'ne sont pas affichés' : 'n’est pas affiché'} ici. Rien n’est supprimé.</>}
            {' '}
            <button type="button" className="gst-lien-bouton" aria-pressed={auto} onClick={() => basculerAuto(!auto)}>
              {auto ? 'Masquer le courrier automatique' : 'Afficher aussi le courrier automatique'}
            </button>
          </span>
        )}
      </h2>
      {/* La recherche traverse les étiquettes : le dire ÉVITE de croire qu'un mail n'existe pas parce qu'on regardait
          ailleurs. C'est la promesse du lot 5c — chercher dans TOUT le courrier de gestion — et elle tient ici. */}
      {/* ══ 🔴 LOT ÉCRAN-VIVANT — DU COURRIER EST ARRIVÉ, MAIS ON NE PEUT PAS RECHARGER SANS RIEN PERDRE ═════════
          Une recherche tapée ou des pages déroulées par « Voir plus » disparaîtraient d'un rechargement de la
          première page. On l'ANNONCE donc, et on laisse la personne décider — ce qui est aussi utile, et jamais
          brutal. Le bouton fait exactement ce que « Rafraîchir » fait, ni plus ni moins. */}
      {versionDonnees > 0 && !peutSeRecharger && (
        <p className="gst-tronc" role="status">
          {mentionCourrierNouveau(1).replace('Un message est', 'Du courrier est')}{' '}
          <button type="button" className="gst-lien-bouton"
            onClick={() => { void premiere(auto, critere, etiquetteDepuisTexte(cleEtiquette), filtre, etoile).then(() => onListeRelue?.()); }}>
            Afficher la liste à jour
          </button>
        </p>
      )}
      {cherche && titre !== undefined && (
        <p className="gst-tronc">La recherche porte sur tout le courrier de gestion, pas seulement sur « {titre} ».</p>
      )}

      {/* ══ LA RECHERCHE ══════════════════════════════════════════════════════════════════════════════════════════
          Un formulaire, donc « Entrée » cherche et le clavier des téléphones affiche « Rechercher ». La recherche ne
          part PAS à chaque frappe : sur 56 000 messages, ce serait une requête par lettre. */}
      {/* ÉCHAP REFERME LE PANNEAU, où qu'on soit dedans : c'est le geste qu'on essaie d'abord, et il ne doit jamais
          effacer ce qui est saisi — il replie, il n'annule pas. `stopPropagation` parce que l'écran qui nous
          contient écoute lui aussi Échap (pour fermer la conversation) : replier le panneau ne doit pas, du même
          coup, fermer le mail qu'on lisait. */}
      <form className="bte-recherche" role="search"
        onSubmit={(e) => { e.preventDefault(); setCritere(saisie); }}
        onKeyDown={(e) => { if (e.key === 'Escape' && filtres) { e.stopPropagation(); setFiltres(false); } }}>
        <div className="bte-champ-ligne">
          {/* ══ LOT RECHERCHE-AVANCEE — L'ENGRENAGE VIT DANS LE CHAMP, à droite, juste avant « Chercher » ═══════
              Le lien rouge « Filtres (période, expéditeur) » qu'il remplace disait sa fonction mais prenait une
              ligne entière sous le champ, et n'annonçait rien quand un filtre était resté posé. L'icône, elle,
              porte une PASTILLE dès qu'un réglage autre que les mots est actif : un filtre oublié cache des
              mails, et c'est le pire silence d'une recherche.
              🔴 L'ICÔNE N'EST PAS SEULE : `aria-label` et `title` portent « Recherche avancée », et
              `aria-expanded` dit si le panneau est ouvert. Une icône sans nom n'existe pas pour un lecteur
              d'écran et ne s'apprend pas au survol sur un téléphone. */}
          <span className="bte-champ-boite">
            <input type="search" className="bte-champ bte-champ--q" value={saisie.q}
              placeholder="Chercher dans le courrier" aria-label="Chercher dans le courrier"
              onChange={(e) => setSaisie({ ...saisie, q: e.target.value })} />
            <button type="button" className={`bte-engrenage${filtresPoses(saisie) ? ' bte-engrenage--pose' : ''}`}
              aria-label="Recherche avancée" title="Recherche avancée"
              aria-expanded={filtres} aria-controls="bte-avancee"
              onClick={() => setFiltres((v) => !v)}>
              <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"
                fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="3" />
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6h.09A1.65 1.65 0 0 0 10 3.09V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9v.09a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
              </svg>
              {/* La pastille est DOUBLÉE d'un mot lu par les lecteurs d'écran : une forme seule n'informe personne
                  qui ne la voit pas. */}
              {filtresPoses(saisie) && <span className="bte-pastille" aria-hidden="true" />}
              {filtresPoses(saisie) && <span className="bte-sr">— des filtres sont actifs</span>}
            </button>
          </span>
          <button type="submit" className="svv-btn svv-btn-primary gst-btn">Chercher</button>
        </div>
        {cherche && (
          <div className="bte-outils">
            <button type="button" className="gst-lien-bouton"
              onClick={() => { setSaisie(CRITERE_VIDE); setCritere(CRITERE_VIDE); }}>
              Effacer la recherche
            </button>
          </div>
        )}
        {filtres && (
          <div className="bte-avancee" id="bte-avancee">
            <div className="bte-avancee-ligne">
              {/* 🔴 « CONTIENT LES MOTS » EST LE MÊME CHAMP QUE CELUI DU HAUT — pas une copie qu'on recopierait au
                  bon moment. Les deux lisent et écrivent `saisie.q` : taper dans l'un met l'autre à jour à la
                  frappe, dans les deux sens, et le panehau s'ouvre déjà rempli. Deux états auraient fini par
                  diverger, et on aurait cherché autre chose que ce qu'on lisait. */}
              <label className="bte-f bte-f--large">
                <span className="bte-f-nom">Contient les mots</span>
                <input type="text" className="bte-champ" value={saisie.q}
                  onChange={(e) => setSaisie({ ...saisie, q: e.target.value })} />
              </label>
              <label className="bte-f bte-f--large">
                <span className="bte-f-nom">Ne contient pas</span>
                <input type="text" className="bte-champ" value={saisie.sansMots}
                  onChange={(e) => setSaisie({ ...saisie, sansMots: e.target.value })} />
              </label>
            </div>
            <div className="bte-avancee-ligne">
              <label className="bte-f bte-f--moyen">
                <span className="bte-f-nom">Expéditeur</span>
                <input type="text" className="bte-champ" value={saisie.de} placeholder="nom ou adresse"
                  onChange={(e) => setSaisie({ ...saisie, de: e.target.value })} />
              </label>
              <label className="bte-f bte-f--date">
                <span className="bte-f-nom">Du</span>
                <input type="date" className="bte-champ" value={saisie.du}
                  onChange={(e) => setSaisie({ ...saisie, du: e.target.value })} />
              </label>
              <label className="bte-f bte-f--date">
                <span className="bte-f-nom">Au</span>
                <input type="date" className="bte-champ" value={saisie.au}
                  onChange={(e) => setSaisie({ ...saisie, au: e.target.value })} />
              </label>
              <label className="bte-f bte-f--court">
                <span className="bte-f-nom">Pièce jointe</span>
                <select className="bte-champ" value={saisie.pj}
                  onChange={(e) => setSaisie({ ...saisie, pj: e.target.value as FiltrePiece })}>
                  <option value="indifferent">Indifférent</option>
                  <option value="avec">Avec</option>
                  <option value="sans">Sans</option>
                </select>
              </label>
            </div>
            <div className="bte-avancee-ligne bte-avancee-ligne--bas">
              <fieldset className="bte-listes">
                <legend className="bte-f-nom">Chercher dans</legend>
                {LISTES_CHERCHABLES.map(([cle, mot]) => (
                  <label key={cle} className="bte-case">
                    <input type="checkbox" checked={saisie.listes.includes(cle)}
                      onChange={(e) => setSaisie({ ...saisie, listes: basculerListe(saisie.listes, cle, e.target.checked) })} />
                    <span>{mot}</span>
                  </label>
                ))}
              </fieldset>
              <span className="bte-avancee-boutons">
                {/* « Effacer les filtres » remet TOUT par défaut, y compris les mots : c'est ce que dit le mot
                    « effacer ». Il ne relance pas la recherche — on efface pour recommencer, pas pour partir. */}
                <button type="button" className="svv-btn svv-btn-outline gst-btn"
                  onClick={() => setSaisie(CRITERE_VIDE)}>
                  Effacer les filtres
                </button>
                <button type="submit" className="svv-btn svv-btn-primary gst-btn">Chercher</button>
              </span>
            </div>
          </div>
        )}
        {/* La recherche marche SANS la migration, en plus lent — et elle le DIT plutôt que de faire semblant. */}
        {cherche && !etat.pleinTexte && (
          <p className="gst-tronc">
            Recherche en mode réduit : elle balaie le courrier au lieu d’utiliser un index, et ne reconnaît pas les
            formes fléchies (« fuites » ne trouvera pas « fuite »). Elle sera complète une fois la mise à jour de la
            base appliquée.
          </p>
        )}
      </form>

      {/* ══ 🔴 LOT LISTE-PAGINATION — LA BARRE DU HAUT, ENTRE LA RECHERCHE ET LA LISTE ═════════════════════════
          « Une ligne fine entre le champ de recherche et le début de la liste. À DROITE de cette ligne :
          “1–25 sur N ‹ ›”. » La ligne est la BORDURE de cette barre, pas un élément de plus : un filet qui
          n'existerait que pour séparer se décalerait du contenu au premier ajustement de marge.
          ⚠️ ELLE EST AU-DESSUS DE TOUT CE QUE LA LISTE PEUT DIRE (mode réduit, courrier automatique masqué,
          brouillons trouvés) : c'est le repère de position, il doit être à la même place sur tous les écrans. */}
      {rendreBarre('haut')}

      {/* EN RECHERCHE : combien de résultats la règle du courrier automatique écarte. Même phrase, même bouton. */}
      {cherche && etat.automatiquesMasques !== null && etat.automatiquesMasques > 0 && (
        <p className="gst-tronc">
          {etat.automatiquesMasques} résultat{etat.automatiquesMasques > 1 ? 's' : ''}
          {' '}ne contien{etat.automatiquesMasques > 1 ? 'nent' : 't'} que du courrier automatique et
          {' '}{etat.automatiquesMasques > 1 ? 'ne sont pas affichés' : 'n’est pas affiché'} ici. Rien n’est supprimé.
          {' '}
          <button type="button" className="gst-lien-bouton" aria-pressed={auto} onClick={() => basculerAuto(!auto)}>
            Afficher aussi le courrier automatique
          </button>
        </p>
      )}
      {cherche && auto && (
        <p className="gst-tronc">
          Le courrier automatique est inclus dans les résultats.{' '}
          <button type="button" className="gst-lien-bouton" aria-pressed onClick={() => basculerAuto(false)}>
            Masquer le courrier automatique
          </button>
        </p>
      )}

      {/* LÀ OÙ L'ÉTIQUETTE DÉCIDE À LA PLACE DE L'INTERRUPTEUR, on le DIT. L'interrupteur lui-même n'a rien perdu : il
          reste où il a toujours été — sur la boîte entière — et il commande en plus « Envoyés », « Sans suite » et les
          cartes. (L'étiquette « À classer » n'arrive jamais ici : le plein écran y affiche le poste de tri lui-même.) */}
      {/* ══ 🔴 LOT BOITE-INTERNE-CORBEILLE — DEUX ÉTIQUETTES IMPOSENT L'INTERRUPTEUR, ET POUR DEUX RAISONS
          OPPOSÉES. Vu à l'écran le 29/09/2026 : la Corbeille affichait « cette étiquette ne rassemble QUE les
          échanges dont aucun message n'est lisible » — la phrase du Courrier automatique, parfaitement fausse ici.
          Les deux passaient par le même `impose === true`, qui dit seulement « l'interrupteur ne décide pas »,
          jamais POURQUOI. La Corbeille impose l'inverse : elle montre TOUT ce qu'elle contient, courrier
          automatique compris — sans quoi un échange entièrement automatique qu'on vient de jeter ne serait visible
          NULLE PART. Même mécanisme, deux phrases. */}
      {!cherche && impose === true && (
        <p className="gst-tronc">
          {etiquette.sorte === 'corbeille'
            ? 'Cette liste montre TOUT ce qui est à la corbeille, courrier automatique compris — d’où l’absence '
              + 'd’interrupteur ici. Rien n’est caché : ce que vous y avez mis s’y retrouve.'
            : 'Cette étiquette ne rassemble QUE les échanges dont aucun message n’est lisible — d’où l’absence '
              + 'd’interrupteur ici. Le reste du courrier est sous les autres étiquettes, rien n’est supprimé.'}
        </p>
      )}

      {/* ══ 🔴 LOT RECHERCHE-AVANCEE — LES BROUILLONS TROUVÉS, DANS LEUR PROPRE BLOC ═══════════════════════════
          Pourquoi à part et pas mêlés aux résultats : un brouillon n'est pas un échange. Il peut n'appartenir à
          AUCUNE conversation, il n'a ni expéditeur ni date de réception, et la liste des résultats se pagine sur
          la date de réception — deux horloges différentes se mêleraient mal, et la pagination mentirait.

          ⚠️ UN BROUILLON HORS CONVERSATION N'EST PAS CLIQUABLE ICI : il n'y a pas d'échange à rouvrir, exactement
          comme dans la liste « Brouillons » (qui se comporte ainsi depuis le lot 5e). On le MONTRE quand même — le
          cacher reviendrait à dire qu'il n'existe pas — et on dit où le retrouver. */}
      {cherche && etat.brouillons.lignes.length > 0 && (
        <div className="bte-brouillons">
          <p className="bte-brouillons-titre">
            Brouillons ({etat.brouillons.lignes.length}{etat.brouillons.tronque ? ' affichés, il y en a d’autres' : ''})
          </p>
          <ul className="gst-liste">
            {etat.brouillons.lignes.map((b) => {
              const mot = `${nettoyerObjet(b.objet ?? '') || '(sans objet)'}${b.destinataire ? ` — à ${b.destinataire}` : ''}`;
              return (
                <li key={b.brouillonId} className="bte-brouillon-ligne">
                  {b.filId === null ? (
                    <span className="bte-brouillon bte-brouillon--muet">
                      <Evidence texte={mot} saisie={critere.q} />
                      {' · '}courrier neuf, à rouvrir dans « Brouillons »
                      {b.aPiece && <span className="bte-marque"> <Trombone /> pièce jointe</span>}
                    </span>
                  ) : (
                    <button type="button" className="bte-brouillon" onClick={() => onOuvrir(b.filId as number)}>
                      <Evidence texte={mot} saisie={critere.q} />
                      {b.aPiece && <span className="bte-marque"> <Trombone /> pièce jointe</span>}
                    </button>
                  )}
                  {/* ══ 🔴🔴 LOT BROUILLONS-APERCU — L'ŒIL, SUR CHAQUE LIGNE SANS EXCEPTION ═══════════════════
                      CONSTAT D'ARNO : « la carte liste les brouillons, sans moyen de les voir ».

                      🔴 Y COMPRIS SUR UN COURRIER NEUF, et c'est là qu'il sert le plus : cette ligne-là n'est
                      cliquable nulle part (il n'y a pas de conversation à rouvrir), et son contenu était donc
                      parfaitement invisible depuis les résultats. Le libellé « à rouvrir dans "Brouillons" »
                      reste mot pour mot — il dit où MODIFIER, l'œil dit comment VOIR. */}
                  {onApercuBrouillon !== undefined && (
                    <button type="button" className="bte-oeil" aria-label={AIDE_OEIL} title={AIDE_OEIL}
                      onClick={() => onApercuBrouillon(b.brouillonId)}>
                      <Oeil />
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {etat.lignes.length === 0 && !(cherche && etat.brouillons.lignes.length > 0)
        ? <p className="gst-vide">{
            /* LOT FILTRE-ETOILE — le filtre passe AVANT les autres messages : « aucun échange sous Réception »
               serait faux et inquiétant alors qu'il y en a 8 471, dont aucun d'étoilé. */
            etoile ? 'Aucun message étoilé dans cette liste.'
              : cherche ? 'Aucun échange ne correspond à cette recherche.'
                : titre === undefined ? 'Aucun échange dans la boîte.' : `Aucun échange sous « ${titre} ».`}</p>
        : suite ? (
          /* ══ 🔴🔴 LOT RATTACHER-EN-ECRIVANT — LE SQUELETTE, JAMAIS UN ÉCRAN FIGÉ ═══════════════════════════
             Demande d'Arno : « pendant le chargement : squelette de lignes, jamais d'écran figé ».

             🔴 CE QUE ÇA REMPLACE : les lignes de la page PRÉCÉDENTE restaient affichées, immobiles, pendant les
             800 ms de la requête. Rien ne bougeait — et on recliquait, croyant avoir manqué le bouton. Le
             squelette dit « ça travaille » sans mentir sur le contenu : il ne montre AUCUNE donnée.

             ⚠️ IL N'APPARAÎT QUE SUR UNE PAGE QU'ON N'A PAS : une page rangée en cache s'affiche sans passer par
             ici (voir `allerPage`), et un squelette qui clignote une image ferait paraître lent l'instantané.

             ⚠️ `aria-hidden` ET UN `role="status"` À CÔTÉ : le squelette est une image, il n'a rien à faire lire.
             C'est la phrase qui porte l'information pour qui n'y voit pas. */
          <>
            <p className="gst-info bte-sr" role="status">Chargement de la page…</p>
            <ul className={`gst-liste bte-liste${dense ? ' bte-liste--dense' : ''}`} aria-hidden="true">
              {Array.from({ length: Math.min(Math.max(etat.lignes.length, 6), 25) }, (_, i) => (
                <li key={`sq-${i}`} className="bte-ligne bte-squelette">
                  <span className="bte-sq bte-sq--qui" />
                  <span className="bte-sq bte-sq--objet" />
                  <span className="bte-sq bte-sq--date" />
                </li>
              ))}
            </ul>
          </>
        ) : (
          <ul className={`gst-liste bte-liste${dense ? ' bte-liste--dense' : ''}`}>
            {etat.lignes.map((l) => {
              // LOT 5-BOITE — « non lu » = au moins un message REÇU que JE n'ai pas ouvert. Le serveur l'a calculé
              //   pour ma session ; la liste ne fait que l'afficher.
              const nonLu = etat.nonLus.has(l.filId);
              return (
              <li key={l.filId} className="bte-li">
                {/* 🔴 LA CASE EST HORS DU BOUTON DE LIGNE, et c'est obligatoire : un `<input>` dans un `<button>`
                    est du HTML invalide, et le clic sur la case ouvrirait l'échange au lieu de la cocher. Elle est
                    posée AVANT le menu, donc avant la ligne, pour que la tabulation la rencontre d'abord.
                    ⚠️ `stopPropagation` sur le clic : `MenuLigne` enveloppe la ligne et écoute le clic droit ;
                    sans lui, cocher ouvrirait aussi le menu contextuel sur certains navigateurs. */}
                {selection !== undefined && l.filId > 0 && (
                  <input type="checkbox" className="bte-choix"
                    checked={selection.actives.has(l.filId)}
                    aria-label={`Sélectionner « ${nettoyerObjet(l.objet) || '(sans objet)'} »`}
                    onClick={(e) => e.stopPropagation()}
                    onChange={(e) => selection.onBasculer(l.filId, e.target.checked)} />
                )}
                {/* LOT 5-BOITE-3 — LE MENU ENVELOPPE LA LIGNE : c'est sur ELLE que se posent le clic droit et
                    l'appui long. Mesuré à l'écran : posés sur le seul bouton « ⋯ », ils n'ouvraient rien. Sans
                    entrée à proposer, `MenuLigne` rend la ligne telle quelle — l'écran d'avant, à l'identique. */}
                <MenuLigne
                  titre={`Actions sur l’échange « ${nettoyerObjet(l.objet) || '(sans objet)'} »`}
                  etat={{
                    nonLu, enCorbeille: etiquette.sorte === 'corbeille',
                    corbeilleDisponible: corbeille, peutEcrire: peutEcrire && onActionLigne !== undefined,
                    piecesDisponibles,
                  }}
                  onAction={(a) => onActionLigne?.(l.filId, a)}
                >
                {/* L'échange OUVERT est marqué — par un mot pour les lecteurs d'écran (`aria-current`) autant que par
                    la forme. Le CONTENU de la ligne est le même dans les deux présentations : c'est la feuille de
                    style qui, sur ordinateur, la remet sur une seule ligne. Aucune information n'est retirée. */}
                {/* 🔴 LE GRAS NE PORTE JAMAIS L'INFORMATION À LUI SEUL. Il se perd en niveaux de gris, sur un écran
                    mal réglé, et n'existe pas du tout pour un lecteur d'écran. La marque « non lu » est donc écrite
                    EN TOUTES LETTRES parmi les autres marques de la ligne, et le bouton l'annonce dans son libellé
                    accessible. Le gras n'est qu'un raccourci pour l'œil. */}
                <button type="button"
                  className={`bte-ligne${filSelectionne === l.filId ? ' bte-ligne--ouverte' : ''}${nonLu ? ' bte-ligne--non-lu' : ''}`}
                  aria-current={filSelectionne === l.filId ? 'true' : undefined}
                  aria-label={nonLu ? `Non lu — ${nomCorrespondant(l)} — ${nettoyerObjet(l.objet) || '(sans objet)'}` : undefined}
                  /* 🔴 LOT MESSAGE-CLIQUÉ — ON OUVRE LE MESSAGE DE CETTE LIGNE, pas le dernier du fil. `l`
                     répond déjà à la question : `messageAffiche` EST le message dont la ligne montre la date,
                     l'expéditeur et l'extrait. `?? null` parce qu'une réponse plus ancienne que ce lot ne porte
                     pas le champ — la conversation retombe alors sur son dernier message, comme avant. */
                  /**
                   * 🔴 LOT LIGNE-NON-ENVOYE — UNE LIGNE FABRIQUÉE NE DÉSIGNE AUCUN ÉCHANGE (`filId` négatif) :
                   * c'est un message NEUF qui n'est pas parti, et qui n'a donc pas de conversation. Le clic ouvre
                   * son BROUILLON, là où le travail est retourné — ouvrir une conversation inexistante donnerait
                   * un écran vide, et l'on chercherait le mail perdu.
                   */
                  onClick={() => (l.filId < 0
                    ? onRouvrirBrouillon?.(l.nonEnvoye?.brouillonId ?? null)
                    : onOuvrir(l.filId, l.messageAffiche ?? null))}>
                  {/* 🔴 L'ÉTOILE POSÉE, AU DÉBUT DE LA LIGNE ET EN PERMANENCE — lot LISTE-GMAIL. Une étoile
                      ÉTEINTE ne s'affiche nulle part hors survol : elle ne dirait rien et alourdirait chaque
                      ligne. Celle qui est posée, elle, doit se voir sans survoler — c'est tout son intérêt.

                      ⚠️ ELLE VIT DANS LA CELLULE DU CORRESPONDANT, pas à côté. Posée en voisine, elle prenait une
                      COLONNE de la grille dense : l'adresse du correspondant se retrouvait dans une colonne d'un
                      caractère de large et descendait sur vingt lignes. Vu à l'écran le 27/09/2026. */}
                  <span className="bte-qui">
                    {(etoilees.get(l.filId) ?? l.etoilee) && (
                      <span className="bte-etoile" title="Échange étoilé par l’équipe" aria-label="Échange étoilé">
                        <Etoile pleine />
                      </span>
                    )}
                    {nomCorrespondant(l)}
                  </span>
                  <span className="bte-sujet">
                    <span className="bte-objet"><Evidence texte={nettoyerObjet(l.objet) || '(sans objet)'} saisie={critere.q} /></span>
                    {apercu(l.extrait) !== '' && (
                      <span className="bte-apercu">
                        {/* Le tiret ne sépare que sur ORDINATEUR, où l'objet et l'aperçu se suivent sur la même
                            ligne ; sur téléphone ils restent l'un sous l'autre et il n'a rien à séparer. */}
                        <span className="bte-tiret" aria-hidden="true"> — </span>
                        {l.dernierSens === 'envoye' && <span className="bte-vous">Vous : </span>}
                        <Evidence texte={apercu(l.extrait)} saisie={critere.q} />
                      </span>
                    )}
                  </span>
                  <span className="bte-bas">
                    {/* ⚠️ LE NOMBRE DE MESSAGES A QUITTÉ CETTE PLACE — lot LISTE-GMAIL. Il vit dans la barre
                        d'actions, tout à droite, à l'endroit où Gmail le met. Le laisser ici aussi l'afficherait
                        deux fois. */}
                    {l.reference && <span className="bte-ref">{l.reference}</span>}
                    {l.sansSuite && <span className="bte-marque">classé sans suite</span>}
                    {l.nbLisibles === 0 && <span className="bte-marque">courrier automatique</span>}
                    {/* ══ 🔴🔴 RETIRÉ (lot RECHERCHE-LIGNES, 30/09/2026) — LA MENTION DE CATÉGORIE ═════════════
                        Le lot RECHERCHE-AVANCEE affichait ici « Réception », « Envoyés »… sur chaque résultat,
                        « seulement si plusieurs listes sont cochées ». Constat d'Arno : ce mot occupait la place
                        des repères qu'on cherche vraiment en parcourant une liste — le trombone et la capsule —
                        et faisait d'un résultat de recherche une ligne d'un autre genre. Demande : « Supprime la
                        mention de catégorie sur les lignes. Un seul composant de ligne pour toutes les listes. »
                        🔴 L'INFORMATION N'EST PAS PERDUE POUR AUTANT : le champ `provenance` reste rendu par la
                        route (il dit de quel côté le message a fait mouche), et le panneau de recherche avancée
                        continue de dire QUELLES listes sont interrogées. Ce qui disparaît est son affichage sur
                        la ligne, où il n'avait pas d'équivalent dans les autres listes. */}
                    {/* ══ LOT ENVOI-DIAG — UN MESSAGE DE CET ÉCHANGE N'EST PAS ARRIVÉ ═══════════════════════════
                        🔴 SUR LA LIGNE, pas seulement dans l'échange ouvert : sinon il faudrait ouvrir les 6 580
                        échanges d'Envoyés pour espérer tomber dessus. La marque porte le MOTIF, parce que « échec »
                        seul ne dit pas s'il faut corriger une adresse ou rappeler quelqu'un.

                        🔴 RETOUCHE CAPSULE-STATUT — ELLE PASSE AVANT LE COUPLE TROMBONE + CAPSULE, jamais entre
                        eux ni entre la capsule et l'heure.
                        Elle reste ENTIÈREMENT VISIBLE tant qu'il y a la place, et se TRONQUE d'un « … » quand il
                        n'y en a plus — c'est elle qui cède, parce qu'elle est la seule marque assez longue pour
                        chasser la capsule de la fin de ligne. Le texte complet reste lu dans l'info-bulle. */}
                    {l.nonRemise && (
                      <span className={`bte-marque bte-marque--echec${
                        l.nonRemise.sorte === 'permanent' ? ' bte-marque--echec-definitif' : ''}`}
                        title={l.nonRemise.phrase}>
                        <span aria-hidden="true">⚠ </span>
                        <span className="bte-echec-texte">{l.nonRemise.phrase}</span>
                      </span>
                    )}
                    {/* ══ 🔴 LOT LIGNE-NON-ENVOYE — CE MAIL N'EST PAS PARTI ════════════════════════════════════
                        Demande d'Arno. Même raison que l'avertissement de non-remise juste au-dessus : c'est une
                        chose qu'on ne peut pas apprendre en ouvrant l'échange plus tard, et il faudrait sinon
                        ouvrir les 6 580 échanges d'« Envoyés » pour espérer tomber dessus.

                        🔴 SA PLACE : dans le bloc de fin de ligne, À GAUCHE DE L'HEURE comme les autres capsules,
                        mais AVANT le trombone — la règle écrite ci-dessous vaut aussi pour elle : rien ne
                        s'intercale entre le trombone et la capsule de classement, qui sont les deux repères qu'on
                        balaie du regard et qui doivent rester à la même place sur toutes les lignes.

                        🔴 LE MOT PORTE L'INFORMATION, jamais la couleur seule : « Non envoyé » se lit en niveaux
                        de gris comme il se lit par un daltonien. L'info-bulle donne la CAUSE, en français.

                        ⚠️ ELLE DISPARAÎT D'ELLE-MÊME au renvoi réussi : la règle est dans la requête, pas ici. */}
                    {l.nonEnvoye && (
                      <span className="bte-capsule bte-capsule--non-envoye"
                        title={l.nonEnvoye.cause ?? 'Ce message n’est pas parti ; il est retourné en brouillon.'}>
                        Non envoyé
                      </span>
                    )}
                    {/* ══ 🔴 LE TROMBONE, COLLÉ À LA CAPSULE — retouche demandée par Arno ════════════════════════
                        LOT LISTE-GMAIL — le trombone porte le NOMBRE, sans le mot : « 📎 2 » se lit d'un coup
                        d'œil, là où « pièce jointe » prenait la moitié de la ligne sans dire combien. Le nombre
                        EST le mot : il reste lisible en niveaux de gris et pour un lecteur d'écran (le titre).

                        🔴 IL A QUITTÉ LE DÉBUT DE LA RANGÉE pour venir JUSTE À GAUCHE DE LA CAPSULE : les deux
                        repères qu'on cherche des yeux en parcourant la liste — « y a-t-il une pièce ? » et « est-ce
                        rangé ? » — sont maintenant côte à côte, à la même place sur toutes les lignes. Les marques
                        VARIABLES (référence, « classé sans suite », « courrier automatique », provenance,
                        avertissement) restent devant : ce sont elles qui bougent d'une ligne à l'autre, et c'est
                        pour cela qu'elles ne doivent pas s'intercaler dans ce bloc de fin. */}
                    {/* ══ 🔴 LOT LECTURE-HTML-FIL-TROMBONE — NOIR ICI, GRIS AILLEURS, ABSENT SI RIEN ═══════════
                        Le trombone comptait TOUT l'échange : une conversation de douze messages dont un seul
                        portait un bail affichait « 📎 1 » sur la ligne du dernier, qui n'a rien. On ouvrait pour
                        ne rien trouver — et l'inverse arrivait aussi.
                        ⚠️ LA COULEUR NE PORTE PAS L'INFORMATION SEULE : l'infobulle dit LEQUEL des deux cas
                        (« dans ce message » / « ailleurs dans la conversation »), et le nombre est celui de
                        l'état affiché, jamais le total. */}
                    {/* ══ 🔴🔴 LOT LISTE-PAGINATION — L'ICÔNE ET LE CHIFFRE, DE LA MÊME COULEUR ═══════════════
                        CE QUI ÉTAIT ÉCRIT ICI : <span aria-hidden="true">{'\u{1F4CE}'}</span>, c'est-à-dire un EMOJI.
                        Il est rendu par une police EN COULEUR qui IGNORE `color` : le trombone restait argenté
                        pendant que le chiffre juste à côté obéissait, gris ou noir. Constat d'Arno, et aucune
                        retouche de feuille de style ne pouvait y répondre — voir l'encadré de `Trombone`.
                        Le tracé, lui, suit `currentColor` : les deux moitiés de la marque ont la même couleur
                        dans les deux cas, et dans les deux thèmes. */}
                    {(() => {
                      const t = etatTrombone(l.piecesDuMessage ?? 0, l.piecesAilleurs ?? 0);
                      if (t.ou === 'aucune') return null;
                      return (
                        <span className={`bte-marque bte-marque--pieces${t.ou === 'ailleurs' ? ' bte-marque--pieces-loin' : ''}`}
                          title={motTrombone(t) ?? undefined}>
                          <Trombone /> {t.nombre}
                        </span>
                      );
                    })()}
                    {/* ══ 🔴 LOT CAPSULE-STATUT — LA CAPSULE, TOUJOURS COLLÉE À GAUCHE DE L'HEURE ═══════════════
                        Elle répond à la question qu'on se pose en parcourant la liste : « ce courrier est-il
                        rangé ? ». Trois réponses, trois mots ÉCRITS — la couleur ne fait que les appuyer, elle ne
                        dit rien toute seule.

                        🔴 RETOUCHE (demandes d'Arno) : ELLE EST LA DERNIÈRE MARQUE DE LA LIGNE, SANS EXCEPTION, ET
                        LE TROMBONE LUI EST COLLÉ. L'ordre de bout de ligne est, sur TOUTES les lignes :

                            [avertissement de non-remise éventuel, tronqué] · [📎 n] · [capsule] · [heure] · [⋯]

                        La capsule était d'abord posée avant l'avertissement, qui s'intercalait donc entre elle et
                        l'heure sur les seules lignes qui en portent un : on la cherchait à deux endroits selon la
                        ligne. Puis le trombone est venu se coller à elle, pour que les deux repères qu'on balaie du
                        regard tiennent ensemble. TOUTE marque nouvelle s'ajoute DONC AU-DESSUS du trombone, jamais
                        entre le trombone et la capsule, et jamais après la capsule.

                        🔴 « non lu » A QUITTÉ CETTE PLACE (retrait autorisé par Arno). L'information n'est PAS
                        perdue : la ligne d'un échange non lu reste en GRAS, comme dans toute messagerie, et le
                        libellé accessible du bouton l'écrit toujours en toutes lettres pour les lecteurs d'écran.

                        ⚠️ NI DANS BROUILLONS NI DANS SPAM : un brouillon n'est pas rattachable, et un spam n'a
                        rien à classer. `classement === null` couvre aussi la migration 257 absente — aucune
                        capsule, plutôt qu'une capsule rouge qui accuserait à tort. */}
                    {/* ⚠️ `l.classement ?` ET NON `!== null`. Une réponse plus ancienne que ce lot ne porte pas
                        du tout le champ : `undefined !== null` est VRAI, et la liste ENTIÈRE tombait sur
                        « Cannot read properties of undefined ». Un écran ne doit jamais s'écrouler parce qu'un
                        serveur lui parle un langage d'hier — c'est la règle qui vaut déjà pour `nonLus` et
                        `pleinTexte`. Attrapé par la suite de tests avant livraison. */}
                    {/* 🔴 LOT STATUT-HORS-GESTION — la capsule GRISE apparaît ici comme les trois autres. La
                        priorité est tenue par `capsuleStatut` (module PUR) : Classé > Auto > Hors gestion >
                        À classer. Un mail marqué hors gestion PUIS rattaché à un bien reste donc vert. */}
                    {l.classement && etiquette.sorte !== 'spam' && etiquette.sorte !== 'brouillons' && (
                      <span className={`bte-capsule bte-capsule--${capsuleDeLaLigne(l)}`}
                        title={bulleCapsule(capsuleDeLaLigne(l),
                          capsuleDeLaLigne(l) === 'hors_gestion'
                            ? motMotifHorsGestion(l.motifHorsGestion)
                            : l.classement.detail)}>
                        {motCapsule(capsuleDeLaLigne(l))}
                      </span>
                    )}
                  </span>
                  {/* LOT 5-DIRECT — la DATE ET L'HEURE de réception, en heure de Paris : « il y a 3 h » ne disait pas
                      si un mail était arrivé à 9 h ou à 14 h. La date complète reste dans l'infobulle. */}
                  <span className="bte-quand" title={dateHeureComplete(l.dernierLe)}>{dateHeureCourte(l.dernierLe, ref)}</span>
                </button>
                {/* ══ 🔴 LOT LISTE-GMAIL — LA BARRE D'ACTIONS, VOISINE DE LA LIGNE ET NON SON ENFANT ═══════════
                    La ligne EST un bouton, et la barre en contient cinq : un bouton dans un bouton est invalide et
                    injouable au clavier. Elle est donc posée À CÔTÉ, et la feuille de style la place par-dessus la
                    date. C'est la même solution que pour le menu « ⋯ » et pour le coin d'un message.
                    ⚠️ ELLE N'APPARAÎT QUE SI L'ÉCRAN SAIT AGIR (`onActionLigne` fourni) : sur l'écran partagé, qui
                    n'a pas d'éditeur ni de panneau de classement, la liste est exactement celle d'avant ce lot. */}
                {onActionLigne && (
                  <BarreLigne
                    etat={{
                      nbMessages: l.nbMessages, etoilee: etoilees.get(l.filId) ?? l.etoilee,
                      etoileDisponible: etoiles,
                      nonLu, corbeilleDisponible: corbeille,
                      /* LOT BARRE-STATUT — la capsule décide du dernier bouton : « Classer » en rouge quand rien
                         n'est rattaché, « Visualiser / Modifier » en vert sinon. Pas de capsule (Brouillons, Spam,
                         réponse de serveur d'hier) ⇒ `undefined`, et la barre garde « Classer ». */
                      statut: l.classement && etiquette.sorte !== 'spam' && etiquette.sorte !== 'brouillons'
                        ? capsuleDeLaLigne(l) : undefined,
                    }}
                    confirme={confirmeSur === l.filId}
                    onConfirmer={(ouvrir) => setConfirmeSur(ouvrir ? l.filId : null)}
                    onEtoile={(e) => void basculerEtoile(l.filId, e)}
                    onLecture={(lu) => onActionLigne(l.filId, lu ? 'lu' : 'non_lu')}
                    onCorbeille={() => onActionLigne(l.filId, 'corbeille')}
                    onClasser={() => onActionLigne(l.filId, 'classer')}
                    /* 🔴 VISUALISER N'EST PAS CLASSER : on n'ouvre pas l'échange, on ouvre une fenêtre de
                       CONSULTATION par-dessus la liste. Ouvrir l'échange ferait perdre la place dans la liste
                       pour une question à laquelle on répond en deux secondes. */
                    onVisualiser={() => setRattachementsDe({ filId: l.filId, objet: l.objet })} />
                )}
                </MenuLigne>
              </li>
              );
            })}
          </ul>
        )}

      {/* ══ 🔴 LOT LISTE-PAGINATION — LA BARRE DU BAS, ET LA FIN DU BOUTON « VOIR PLUS » ════════════════════════
          CE QUI ÉTAIT ICI, ET QU'ARNO A DEMANDÉ DE SUPPRIMER :
              <button className="… bte-plus">Voir les échanges plus anciens</button>
          Il EMPILAIT les pages les unes sous les autres. Empiler ne dit jamais où l'on en est : après quatre clics
          on a cent lignes et aucune idée du reste — et la position de défilement devenait le seul repère.
          La même barre qu'en haut le remplace, alignée à droite elle aussi. */}
      {rendreBarre('bas')}
      {/* ⚠️ LA MENTION DE FIN RESTE, et elle n'est PAS redondante avec « 8 526–8 546 sur 8 546 » : elle dit que le
          plus ancien message de la boîte est atteint, c'est-à-dire qu'il n'en existe pas d'autre en base — ce que
          le nombre, lui, ne dit pas (il pourrait rester des pages qu'un filtre écarte). */}
      {etat.suivant === null && etat.lignes.length > 0 && (
        <p className="gst-tronc">Vous avez atteint le plus ancien message de la boîte.</p>
      )}

      {/* ══ 🔴 LOT BARRE-STATUT — « VISUALISER / MODIFIER » ════════════════════════════════════════════════════
          Une fenêtre PAR-DESSUS la liste : on ne quitte pas sa place pour aller voir où un échange est rangé.
          Elle liste TOUS les rattachements vivants de l'échange, et passe la main à la fenêtre « Modifier »
          existante — laquelle garde sa validation obligatoire. */}
      {rattachementsDe !== null && (
        <RattachementsDuFil filId={rattachementsDe.filId} titre={nettoyerObjet(rattachementsDe.objet ?? '') || null}
          onFerme={() => setRattachementsDe(null)}
          /* Un rattachement vient de changer : la CAPSULE de la ligne n'est plus à jour. On relit la première
             page — c'est le seul endroit qui la calcule, et la recalculer à la main ici donnerait deux vérités. */
          onGeste={() => { setRattachementsDe(null); void premiere(auto, critere, etiquette, filtre, etoile); }} />
      )}

      <style>{CSS_BOITE}</style>
      <style>{CSS_BARRE_LIGNE}</style>
    </section>
  );
}

const CSS_BOITE = `
/* ══ LOT ERGO-BOITE — L'ICÔNE « RELEVER ET ACTUALISER » ════════════════════════════════════════════════════════
   Elle remplace « Relever maintenant » et « Rafraîchir », qui faisaient deux choses qu'on veut toujours ensemble.
   🔴 ELLE TOURNE PENDANT L'OPÉRATION : c'est le seul retour visuel qu'un geste est en cours, et sans lui on
   reclique. L'animation est coupée pour qui a demandé moins de mouvement (prefers-reduced-motion) — l'icône reste
   alors simplement estompée, donc l'information passe quand même.
   (Aucun accent grave dans ce commentaire : il vit DANS un littéral gabarit, qu'un seul terminerait.) */
.bte-relever{display:inline-flex;align-items:center;justify-content:center;width:30px;height:30px;margin-left:.4rem;
  vertical-align:middle;border:1px solid var(--color-svv-line);border-radius:999px;background:transparent;
  color:var(--color-svv-ink);cursor:pointer}
.bte-relever:hover{background:var(--color-svv-field)}
.bte-relever:disabled{opacity:.55;cursor:default}
.bte-relever--tourne svg{animation:bte-tourne 1s linear infinite}
@keyframes bte-tourne{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}
@media (prefers-reduced-motion: reduce){.bte-relever--tourne svg{animation:none}}
.bte-liste{display:flex;flex-direction:column;gap:0;border-top:1px solid var(--color-svv-line)}
/* LOT 5-BOITE-3 — la ligne et son menu sont CÔTE À CÔTE. Le menu ne peut pas être dans le bouton d'ouverture (un
   bouton dans un bouton est invalide, et le clic ouvrirait l'échange), d'où cette rangée. */
.bte-li{display:flex;border-bottom:1px solid var(--color-svv-line)}
.bte-li>.bte-ligne{border-bottom:0;flex:1 1 auto;min-width:0}
.bte-ligne{display:flex;flex-direction:column;gap:3px;width:100%;min-height:44px;padding:10px 4px;text-align:left;
  background:none;border:0;border-bottom:1px solid var(--color-svv-line);color:inherit;font:inherit;cursor:pointer}
/* ══ 🔴 LOT FIL-LECTURE-2 — UNE LIGNE, UN SEUL FOND ══════════════════════════════════════════════════════════════
   Le fond de survol était posé sur le BOUTON de la ligne, qui n'en occupe pas toute la largeur : le « ⋯ » de droite
   restait blanc pendant que le reste devenait gris. Deux fonds sur une même ligne donnent à voir deux objets là où
   il n'y en a qu'un. Il passe donc sur la RANGÉE entière, boutons compris.
   focus-within plutôt que focus-visible : tabuler jusqu'au menu de droite allume la même rangée qu'un survol. */
.bte-li:hover,.bte-li:focus-within{background:var(--color-svv-field)}
.bte-ligne:focus-visible{outline:2px solid var(--color-svv-red);outline-offset:-2px}
/* L'échange OUVERT : une BARRE à gauche et un fond, jamais la couleur seule ; aria-current le dit aux lecteurs
   d'écran. Le fond est porté par la rangée — même règle que le survol, pour que la ligne sélectionnée ne soit pas,
   elle non plus, grise à moitié. */
.bte-li:has(>.bte-ligne--ouverte),.bte-li:has(.bte-ligne--ouverte){background:var(--color-svv-field)}
.bte-ligne--ouverte{border-left:3px solid var(--color-svv-red);padding-left:8px}
/* ── LOT 5-BOITE — LE GRAS DIT « NON LU », comme dans toute messagerie ──
   Le correspondant était TOUJOURS en gras : le gras ne distinguait donc rien. Il devient le repère du non-lu, et le
   poids par défaut redevient normal — c'est la convention que tout le monde connaît, et elle ne s'apprend pas.
   ⚠️ Le gras ne porte JAMAIS l'information à lui seul : la ligne écrit aussi « non lu » en toutes lettres parmi ses
   marques, et son libellé accessible commence par ce mot. Aucune couleur n'entre dans ce repère. */
.bte-qui{font-weight:500;font-size:.95rem;color:var(--color-svv-ink);overflow-wrap:anywhere}
.bte-ligne--non-lu .bte-qui,.bte-ligne--non-lu .bte-objet{font-weight:700}
/* La marque écrite : même forme que « pièce jointe » ou « classé sans suite », donc lisible en niveaux de gris. */
.bte-marque--non-lu{font-weight:700;color:var(--color-svv-ink)}
/* LOT ENVOI-DIAG — la marque « non distribué ». La COULEUR n'est qu'un renfort : le texte porte déjà le motif, et il
   reste lisible en niveaux de gris. Un échec DÉFINITIF passe en gras ; un retard garde le poids ordinaire, parce que
   le message peut encore arriver. */
.bte-marque--echec{color:var(--color-svv-red);min-width:0;flex:0 1 auto}
.bte-marque--echec-definitif{font-weight:700}
/* 🔴 RETOUCHE CAPSULE-STATUT — C'EST L'AVERTISSEMENT QUI CÈDE LA PLACE, PAS LA CAPSULE. Il est la seule marque assez
   longue pour repousser la capsule loin de l'heure ; il se tronque donc d'un « … », et son info-bulle (posée sur la
   marque entière) dit le texte complet. L'ellipsis exige un bloc : le texte vit dans son propre span, parce qu'un
   nœud de texte nu dans un conteneur flex ne se tronque pas. Sur téléphone, .bte-bas passe à la ligne et il n'y a
   rien à tronquer — la troncature ne vaut que dans la ligne dense, plus bas. */
.bte-echec-texte{min-width:0}
.bte-quand{font-size:.8rem;color:var(--color-svv-muted);white-space:nowrap}
.bte-objet{font-size:.9rem;color:var(--color-svv-ink);overflow-wrap:anywhere}
.bte-apercu{font-size:.85rem;color:var(--color-svv-muted);overflow-wrap:anywhere;
  display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.bte-vous{font-weight:600;color:var(--color-svv-ink)}
.bte-bas{display:flex;flex-wrap:wrap;align-items:center;gap:6px 10px;font-size:.78rem;color:var(--color-svv-muted)}
/* SUR TÉLÉPHONE, l'objet et l'aperçu restent l'un SOUS l'autre : le tiret qui les relie n'a alors rien à relier. */
.bte-sujet{display:contents}
.bte-tiret{display:none}
/* ── LOT 5-GMAIL : UNE LIGNE PAR ÉCHANGE, SUR ORDINATEUR ────────────────────────────────────────────────────────
   Quatre colonnes : correspondant · objet + début du message (tronqué d'un « … ») · marques · date. Le MÊME contenu
   que sur téléphone, à la même place dans le DOM — seule la mise en page change, jamais ce qui est dit.
   Le point de rupture est celui de la barre de l'administration (768 px) : au-dessous, rien ne bouge. */
@media (min-width:768px){
  .bte-liste--dense .bte-ligne{display:grid;align-items:baseline;gap:4px 12px;padding:8px 6px;
    grid-template-columns:minmax(7rem,12rem) minmax(0,1fr) auto auto}
  .bte-liste--dense .bte-sujet{display:block;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  /* display:inline : l'objet et l'aperçu coulent dans la MÊME ligne, et le conteneur tronque les deux d'un coup. */
  .bte-liste--dense .bte-objet,.bte-liste--dense .bte-apercu{display:inline;-webkit-line-clamp:none;overflow:visible}
  .bte-liste--dense .bte-tiret{display:inline;color:var(--color-svv-line-strong)}
  .bte-liste--dense .bte-bas{flex-wrap:nowrap;white-space:nowrap;min-width:0}
  /* 🔴 L'AVERTISSEMENT EST BORNÉ, pour que la capsule et l'heure restent à leur place quel que soit le motif renvoyé
     par le serveur distant (certains tiennent deux lignes). Au-delà, il se tronque ; l'info-bulle dit tout. */
  .bte-liste--dense .bte-marque--echec{max-width:20rem}
  .bte-liste--dense .bte-echec-texte{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .bte-liste--dense .bte-quand{text-align:right}
}
/* ══ LOT ERGO-BOITE-4 — LA MENTION « COURRIER AUTOMATIQUE », SUR LA LIGNE DU TITRE ═══════════════════════════════
   margin-left:auto la colle à droite ; la taille descend à .72rem pour qu'elle tienne à côté du titre. Elle garde
   sa graisse normale — c'est une note, pas un titre — et le lien qu'elle porte reste un vrai bouton.
   ⚠️ ELLE PEUT PASSER À LA LIGNE. Sur un écran étroit, le titre garde sa place et la mention descend dessous
   (le h2 a flex-wrap:wrap) : mieux vaut deux lignes qu'un texte écrasé ou tronqué.
   ⚠️⚠️ AUCUN ACCENT GRAVE DANS CE COMMENTAIRE : il vit dans un littéral gabarit. Septième fois sur ce module. */
/* LOT FILTRE-ETOILE — le MÊME bouton rond que la relève ; seule la couleur change quand il filtre. La forme de
   l'étoile (pleine / en contour) porte l'information autant que la couleur. */
/* ══ LOT CAPSULE-STATUT — TROIS CAPSULES, UN SEUL GABARIT ═══════════════════════════════════════════════════════
   Même forme, même taille, même graisse : seul le ton change. Le MOT est toujours écrit — « À classer », « Classé »,
   « Auto » — donc la capsule reste lisible en niveaux de gris, pour un daltonien, et pour un lecteur d'écran.
   white-space:nowrap : « À classer » ne doit pas se couper en deux au milieu d'une ligne dense. */
   flex:0 0 auto : la capsule NE RÉTRÉCIT JAMAIS. Quand la ligne manque de place, c'est l'avertissement de non-remise
   qui se tronque — la capsule garde sa taille et sa place, juste à gauche de l'heure. */
.bte-capsule{display:inline-flex;align-items:center;padding:.05rem .4rem;border-radius:999px;flex:0 0 auto;
  font-size:.7rem;font-weight:700;line-height:1.5;white-space:nowrap;border:1px solid transparent}
.bte-capsule--a_classer{color:var(--color-svv-red);border-color:var(--color-svv-red);background:transparent}
/* 🔴 LOT LIGNE-NON-ENVOYE — « Non envoyé » : la seule capsule à fond ROUGE PLEIN de la liste, parce que c'est la
   seule qui dise qu'un geste a ÉCHOUÉ. « À classer » est un travail qui reste à faire, et son cadre rouge suffit ;
   un mail qui n'est pas parti est un fait accompli, et il doit se distinguer d'un travail en attente. Le MOT porte
   l'information dans les deux cas — la couleur ne fait que hiérarchiser.

   ⚠️ LE TEXTE PREND LE JETON DE SURFACE, PAS UN BLANC EN DUR. En theme SOMBRE le rouge de la charte est CLAIR :
   du blanc dessus tomberait a environ 2,1:1, illisible. La surface, elle, y est sombre — on remonte vers 7:1 — et
   en clair elle EST blanche, donc le rendu ne bouge pas. Meme regle que la surbrillance de selection
   (lot COULEUR-ROUGE). C'est aussi pourquoi ce fichier n'ecrit AUCUNE couleur en dur, pas meme en commentaire :
   le garde ci-contre ne sait pas distinguer une valeur d'une explication, et il a raison de ne pas essayer. */
.bte-capsule--non-envoye{color:var(--color-svv-surface);border-color:var(--color-svv-red);
  background:var(--color-svv-red);font-weight:700}
.bte-capsule--classe{color:var(--color-svv-green-ink);border-color:var(--color-svv-green-ink);background:transparent}
/* « Auto » est vert lui aussi — c'est rangé — mais en aplat plus discret : le geste humain doit rester le plus
   visible des deux, sans pour autant faire passer l'automatique pour un problème. */
.bte-capsule--auto{color:var(--color-svv-green-ink);border-color:transparent;background:var(--color-svv-green-soft)}
/* LOT RATTACHER-EN-ECRIVANT — « Interne » : VERT, comme « Classe », parce que c'est un etat d'ARRIVEE et non une
   mise a l'ecart. Il se distingue de « Classe » par son MOT (toujours ecrit) et par son aplat, comme « Auto » se
   distingue de « Classe » : la couleur ne porte jamais l'information seule. */
.bte-capsule--interne{color:var(--color-svv-green-ink);border-color:var(--color-svv-green-ink);
  background:var(--color-svv-green-soft)}
/* LOT STATUT-HORS-GESTION — le GRIS : une decision prise, pas un travail en attente. Le MOT est ecrit. */
.bte-capsule--hors_gestion{color:var(--color-svv-muted);border-color:var(--color-svv-line-strong)}
.bte-filtre-etoile--actif{color:var(--color-svv-red)}
.bte-tait{margin-left:auto;text-align:right;font-size:.72rem;font-weight:400;line-height:1.35;
  color:var(--color-svv-muted);flex:0 1 auto;min-width:0}
.bte-marque{display:inline-flex;align-items:center;gap:.25rem}
/* 🔴 LE TROMBONE NE RÉTRÉCIT PAS, comme la capsule à laquelle il est collé : quand la ligne manque de place, c'est
   l'avertissement de non-remise qui se tronque. Un « 📎 12 » réduit à « 📎 1 » mentirait. */
/* ══ 🔴 LE TROMBONE : NOIR QUAND LA PIECE EST SUR CE MESSAGE, GRIS QUAND ELLE EST AILLEURS ══════════════════════
   NOIR = la couleur du TEXTE PRINCIPAL, donc blanche en theme Sombre : le jeton suit le theme, et l'on n'ecrit
   aucune couleur en dur. GRIS = la couleur des mentions secondaires, celle des autres marques de la ligne.
   La couleur ne porte JAMAIS l'information seule : l'infobulle dit lequel des deux cas, en toutes lettres. */
.bte-marque--pieces{flex:0 0 auto;color:var(--color-svv-ink);font-weight:600}
.bte-marque--pieces-loin{color:var(--color-svv-muted);font-weight:400}
.bte-ref{font-weight:700;color:var(--color-svv-green-ink)}
.bte-recherche{display:flex;flex-direction:column;gap:8px;margin:0 0 12px}
.bte-champ-ligne{display:flex;flex-wrap:wrap;gap:8px}
/* 16 px MINIMUM : en dessous, iOS zoome à chaque fois qu'on clique dans le champ, et l'écran part de travers. */
.bte-champ{flex:1 1 12rem;min-width:0;min-height:44px;padding:.5rem .7rem;font-size:16px;
  border:1px solid var(--color-svv-line);border-radius:.6rem;background:var(--color-svv-surface);color:var(--color-svv-ink)}
.bte-champ:focus-visible{outline:2px solid var(--color-svv-red);outline-offset:2px}
.bte-outils{display:flex;flex-wrap:wrap;gap:6px 14px}

/* ══ LOT RECHERCHE-AVANCEE — L'ENGRENAGE DANS LE CHAMP, ET LE PANNEAU SOUS LUI ═══════════════════════════════════
   ⚠️ LES CHAMPS SONT COMPACTS, chacun à la largeur de ce qu'il attend : une date n'a pas besoin de la place d'une
   phrase. C'est la demande d'Arno, et c'est ce qui permet de tenir sur trois lignes au lieu de huit.
   ⚠️ 16 px MINIMUM sur tout champ de saisie, y compris ici : en dessous, iOS zoome au premier clic et l'écran part
   de travers. La compacité se gagne sur la LARGEUR et les marges, jamais sur la taille du texte.
   ⚠️ 44 px de haut sur l'engrenage : c'est la cible tactile minimale. Le bouton reste dans le champ. */
.bte-champ-boite{position:relative;display:flex;flex:1 1 14rem;min-width:0}
.bte-champ--q{padding-right:2.6rem}
.bte-engrenage{position:absolute;right:.25rem;top:50%;transform:translateY(-50%);display:inline-flex;
  align-items:center;justify-content:center;width:36px;height:36px;padding:0;border:0;border-radius:.5rem;
  background:transparent;color:var(--color-svv-muted);cursor:pointer}
.bte-engrenage:hover{background:var(--color-svv-field);color:var(--color-svv-ink)}
.bte-engrenage[aria-expanded="true"]{background:var(--color-svv-field);color:var(--color-svv-ink)}
.bte-engrenage:focus-visible{outline:2px solid var(--color-svv-red);outline-offset:2px}
.bte-engrenage--pose{color:var(--color-svv-red)}
/* La pastille DOUBLE un mot lu par les lecteurs d'écran : une forme seule n'informe pas qui ne la voit pas. */
.bte-pastille{position:absolute;top:4px;right:4px;width:7px;height:7px;border-radius:50%;
  background:var(--color-svv-red);border:1px solid var(--color-svv-surface)}
.bte-sr{position:absolute;width:1px;height:1px;margin:-1px;padding:0;overflow:hidden;clip:rect(0 0 0 0);
  white-space:nowrap;border:0}
.bte-avancee{display:flex;flex-direction:column;gap:8px;padding:10px;border:1px solid var(--color-svv-line);
  border-radius:.6rem;background:var(--color-svv-field)}
.bte-avancee-ligne{display:flex;flex-wrap:wrap;align-items:flex-end;gap:8px}
.bte-avancee-ligne--bas{justify-content:space-between}
.bte-f{display:flex;flex-direction:column;gap:2px;min-width:0;font-size:.78rem;color:var(--color-svv-muted)}
/* 🔴 flex:0 0 auto EST LE CORRECTIF, PAS UNE COQUETTERIE. La classe .bte-champ porte flex:1 1 12rem pour la ligne
   de recherche, où l'axe principal est HORIZONTAL : 12rem y est une largeur. Dans .bte-f, qui est une COLONNE, le
   même flex-basis devient une HAUTEUR — chaque champ du panneau faisait 12rem de haut. Vu à l'écran avant
   livraison : six champs géants là où on demandait des champs d'une ligne. On rend donc la base au contenu, et la
   hauteur reste celle d'une ligne de texte.
   ⚠️ LA TAILLE DU TEXTE NE BAISSE PAS : .bte-champ garde ses 16 px, sans quoi iOS zoome au premier clic. La
   compacité se gagne sur la largeur et les marges, jamais sur la lisibilité.
   ⚠️⚠️ AUCUN ACCENT GRAVE DANS CE COMMENTAIRE : il vit dans un littéral gabarit, qu'un seul backtick refermerait.
   Le piège s'est refermé SIX fois sur ce module — ici même, entre un tsc au vert et le rechargement de la page. */
.bte-f .bte-champ{flex:0 0 auto;min-height:34px;height:34px;padding:.2rem .5rem}
.bte-f--large{flex:1 1 13rem}
.bte-f--moyen{flex:1 1 10rem}
.bte-f--date{flex:0 1 9.5rem}
.bte-f--court{flex:0 1 8.5rem}
.bte-f-nom{font-size:.78rem;color:var(--color-svv-muted)}
.bte-listes{display:flex;flex-wrap:wrap;align-items:center;gap:4px 12px;margin:0;padding:0;border:0;min-width:0}
/* LOT BOITE-INTERNE-CORBEILLE — la case de SÉLECTION d'une ligne.

   Nom DISTINCT de .bte-case, qui existait déjà pour les cases du panneau de recherche : deux règles sous le même
   nom se seraient écrasées en silence, et la plus tardive aurait gagné sans que rien ne le signale.

   AUCUN ACCENT GRAVE ICI : ce commentaire vit DANS un littéral gabarit, qu'un seul accent grave terminerait. Le
   piège s'est refermé une septième fois en écrivant ces lignes — et, comme la fois précédente, dans le
   commentaire même qui met en garde contre autre chose.

   La CIBLE tactile vient du padding de la ligne (44 px de haut) : la case elle-même reste petite pour ne pas
   pousser le correspondant hors de sa colonne dans la grille dense. */
.bte-choix{flex:0 0 auto;align-self:center;width:18px;height:18px;margin:0 2px 0 4px;min-height:auto;
  accent-color:var(--color-svv-red);cursor:pointer}
.bte-choix:focus-visible{outline:2px solid var(--color-svv-red);outline-offset:2px}
.bte-case{display:inline-flex;align-items:center;gap:.3rem;font-size:.82rem;color:var(--color-svv-ink);
  min-height:32px;cursor:pointer}
.bte-avancee-boutons{display:flex;flex-wrap:wrap;gap:8px;margin-left:auto}
.bte-brouillons{margin:0 0 10px;padding:8px 10px;border:1px solid var(--color-svv-line);border-radius:.6rem}
.bte-brouillons-titre{margin:0 0 6px;font-size:.82rem;font-weight:700;color:var(--color-svv-ink)}
/* 🔴 LOT BROUILLONS-APERCU — la ligne porte son libellé À GAUCHE et son œil À DROITE, et l'œil ne rétrécit
   jamais : c'est une cible tactile, elle garde ses 44 px quelle que soit la longueur de l'objet. */
.bte-brouillon-ligne{display:flex;align-items:center;gap:6px;min-width:0}
.bte-brouillon-ligne>.bte-brouillon{flex:1 1 auto;min-width:0}
.bte-oeil{flex:0 0 auto;display:inline-flex;align-items:center;justify-content:center;min-width:44px;
  min-height:44px;color:var(--color-svv-ink-soft);background:transparent;border:1px solid transparent;
  border-radius:.5rem;cursor:pointer}
.bte-oeil:hover{color:var(--color-svv-ink);background:var(--color-svv-field);border-color:var(--color-svv-line)}
.bte-oeil:focus-visible{outline:2px solid var(--color-svv-red);outline-offset:2px}
.bte-brouillon{display:block;width:100%;text-align:left;padding:.35rem 0;font-size:.85rem;
  background:transparent;border:0;color:var(--color-svv-ink)}
.bte-brouillon--muet{cursor:default;color:var(--color-svv-muted)}
.bte-trouve{font-weight:800;text-decoration:underline;text-underline-offset:2px}
${CSS_BARRE_PAGES}
/* ══ LOT RATTACHER-EN-ECRIVANT — LE SQUELETTE DE CHARGEMENT ═════════════════════════════════════════════════════
   Trois blocs gris qui occupent la place d'une ligne : le correspondant, l'objet, la date. Ils ne montrent AUCUNE
   donnee — c'est tout l'interet : on voit que ca travaille, sans croire lire la page qui arrive.
   ⚠️ AUCUN ACCENT GRAVE ICI : litteral de gabarit. */
.bte-squelette{display:flex;align-items:center;gap:12px;padding:10px 6px;pointer-events:none}
.bte-sq{display:block;height:11px;border-radius:999px;background:var(--color-svv-line);
  animation:bte-sq-pulse 1.1s ease-in-out infinite}
.bte-sq--qui{flex:0 0 140px}
.bte-sq--objet{flex:1 1 auto;min-width:0}
.bte-sq--date{flex:0 0 46px}
@keyframes bte-sq-pulse{0%,100%{opacity:.55}50%{opacity:1}}
/* 🔴 EXIGENCE TRANSVERSE DU PROJET : qui demande moins d'animation n'en a pas. Le squelette reste, immobile —
   il dit la meme chose, il ne clignote plus. */
@media (prefers-reduced-motion:reduce){.bte-sq{animation:none;opacity:.7}}
/* La phrase que seul un lecteur d'ecran entend : le squelette, lui, porte aria-hidden.
   (Aucun accent grave : ce commentaire vit DANS un litteral de gabarit — piege qui s'est referme trois fois
    pendant ces lots.) */
.bte-sr{position:absolute;width:1px;height:1px;margin:-1px;padding:0;overflow:hidden;clip-path:inset(50%);
  white-space:nowrap;border:0}

${CSS_MENU_LIGNE}
`;
