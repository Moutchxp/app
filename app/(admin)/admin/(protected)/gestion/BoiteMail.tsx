'use client';

import { useCallback, useEffect, useState } from 'react';
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
import { corpsLisible } from '../../../../lib/gestion/lisibilite';
import { nettoyerObjet } from '../../../../lib/gestion/objet';
import { CSS_MENU_LIGNE, MenuLigne } from './MenuLigne';
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

/** Le mot qui désigne une liste à l'écran. Une seule table, lue par les cases à cocher ET par les résultats. PUR. */
export function motDeLaListe(l: SorteListe): string {
  return LISTES_CHERCHABLES.find(([cle]) => cle === l)?.[1] ?? l;
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
  comptes: ComptesBoite | null;
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
      v: 'ok'; lignes: LigneEcran[]; suivant: CurseurBoite | null; total: number; comptes: ComptesBoite | null;
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
async function chargerPage(
  curseur: CurseurBoite | null, auto: boolean, critere: Critere, etiquette: Etiquette,
  filtre: 'non-lus' | null = null,
): Promise<ReponseBoite | { erreur: string }> {
  const p = new URLSearchParams();
  if (curseur) { p.set('depuis', curseur.dernierLe); p.set('avant', curseur.filId); }
  if (auto) p.set('auto', '1');
  // LOT ERGO-BOITE-3 — le sélecteur « non lus » de Réception. Seul `non-lus` s'écrit : « tous » est le défaut, et
  //   l'écrire ferait une seconde adresse pour la même demande. Il ne part PAS avec une recherche : celle-ci
  //   traverse les étiquettes et n'a pas de notion de « non lu » (voir la note sur l'étiquette ci-dessous).
  if (filtre === 'non-lus' && !critereActif(critere)) p.set('filtre', 'non-lus');
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
  try {
    const url = cherche ? '/api/admin/gestion/boite/recherche' : '/api/admin/gestion/boite';
    const res = await fetch(`${url}?${p.toString()}`, { cache: 'no-store' });
    if (!res.ok) {
      return { erreur: res.status === 403 ? 'Droit retiré : reconnectez-vous.' : 'Lecture impossible.' };
    }
    return (await res.json()) as ReponseBoite;
  } catch {
    return { erreur: 'Lecture impossible : le serveur n’a pas répondu.' };
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
  onOuvrir, etiquette = ETIQUETTE_RECEPTION, titre, total, auto: autoPilote, onAuto, filSelectionne = null,
  dense = false, onNonLus, marquage, onActionLigne, corbeille = false, peutEcrire = false, piecesDisponibles = false,
  versionDonnees = 0, onListeRelue, onRelever, releveEnCours = false, filtre = null,
}: {
  onOuvrir: (filId: number) => void;
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
  /** Prévient le parent que la liste vient de se relire — il peut oublier ce qu'il avait à annoncer. */
  onListeRelue?: () => void;
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
   * LOT ÉCRAN-VIVANT — combien de pages ont été déroulées par « Voir plus ».
   *
   * ⚠️ ON COMPTE LE GESTE, PAS LE NOMBRE DE LIGNES. Déduire « il y a des pages en plus » d'un nombre de lignes
   * supposerait de connaître la taille d'une page — une constante qui vit dans `boiteRepo`, lequel tire `pg` et ne
   * peut donc PAS être importé par ce composant client (c'est l'incident du 24/09/2026 qui a fait tomber toute
   * l'application). Le geste, lui, est ici, et il ne mentira jamais.
   */
  const [dePlus, setDePlus] = useState(0);

  const cherche = critereActif(critere);
  /**
   * LOT ÉCRAN-VIVANT — la liste peut-elle se relire sans détruire le travail en cours ? UNE seule définition, lue par
   * l'effet ET par la mention : deux conditions finiraient par diverger, et l'écran annoncerait du courrier qu'il
   * vient d'afficher.
   */
  const peutSeRecharger = listePeutSeRecharger({
    rechercheEnCours: cherche,
    pagesSupplementaires: dePlus > 0,
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

  const premiere = useCallback(async (avecAuto: boolean, c: Critere, e: Etiquette, f: 'non-lus' | null = null) => {
    setEtat({ v: 'charge' });
    // LOT ÉCRAN-VIVANT — on repart de la première page : ce qui avait été déroulé par « Voir plus » ne l'est plus.
    setDePlus(0);
    const r = await chargerPage(null, avecAuto, c, e, f);
    if ('erreur' in r) { setEtat({ v: 'erreur', m: r.erreur }); return; }
    setEtat({
      v: 'ok', lignes: r.lignes, suivant: r.suivant, total: r.total ?? r.lignes.length, comptes: r.comptes,
      pleinTexte: r.pleinTexte !== false, automatiquesMasques: r.automatiquesMasques ?? null,
      brouillons: r.brouillons ?? { lignes: [], tronque: false },
      nonLus: new Set(r.nonLus ?? []), nonLusTotal: r.nonLusTotal ?? null, nonLusPartiel: r.nonLusPartiel === true,
    });
  }, []);

  // `cleEtiquette` plutôt que l'objet : deux objets égaux mais distincts relanceraient la lecture à chaque rendu.
  // `filtre` entre dans les dépendances : changer de sélecteur relit la première page, comme changer d'étiquette.
  useEffect(() => { void premiere(auto, critere, etiquetteDepuisTexte(cleEtiquette), filtre); },
    [premiere, auto, critere, cleEtiquette, filtre]);

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
    void premiere(auto, critere, etiquetteDepuisTexte(cleEtiquette), filtre).then(() => onListeRelue?.());
    // eslint-disable-next-line react-hooks/exhaustive-deps -- volontaire : SEUL `versionDonnees` déclenche ce
    //   rafraîchissement. Ajouter `critere`, `auto` ou `cleEtiquette` ferait doublon avec l'effet ci-dessus, qui les
    //   surveille déjà — et relirait deux fois la même page à chaque changement d'étiquette.
  }, [versionDonnees]);

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

  async function voirPlus() {
    if (etat.v !== 'ok' || etat.suivant === null || suite) return;
    setSuite(true);
    setDePlus((n) => n + 1);
    const r = await chargerPage(etat.suivant, auto, critere, etiquette, filtre);
    setSuite(false);
    if ('erreur' in r) { setEtat({ v: 'erreur', m: r.erreur }); return; }
    // On CONCATÈNE : « voir plus » allonge la liste, il ne la remplace pas — on ne perd jamais ce qu'on lisait.
    setEtat({
      ...etat, lignes: [...etat.lignes, ...r.lignes], suivant: r.suivant, total: etat.total, comptes: etat.comptes,
      // Les non-lus s'ajoutent comme les lignes : « voir plus » allonge, il ne remplace pas.
      nonLus: new Set([...etat.nonLus, ...(r.nonLus ?? [])]),
      nonLusTotal: etat.nonLusTotal, nonLusPartiel: etat.nonLusPartiel,
      // Les brouillons ne sont rendus qu'à la première page : on GARDE ceux qu'on a, sans quoi « voir plus » les
      //   ferait disparaître de l'écran alors qu'ils correspondent toujours.
      brouillons: etat.brouillons,
    });
  }

  if (etat.v === 'charge') return <p className="gst-info" role="status">Chargement de la boîte…</p>;
  if (etat.v === 'erreur') {
    return (
      <div>
        <p className="gst-erreur" role="status">{etat.m}</p>
        <button type="button" className="svv-btn svv-btn-outline gst-btn" onClick={() => void premiere(auto, critere, etiquette, filtre)}>Réessayer</button>
      </div>
    );
  }

  const ref = maintenant ?? new Date();
  return (
    <section aria-labelledby="bte-titre">
      <h2 className="gst-titre" id="bte-titre">
        {cherche ? 'Résultats' : (titre ?? 'Boîte mail')}
        {!cherche && <span className="gst-compte">{total ?? etat.total}</span>}
        {/* ══ LOT ERGO-BOITE — UNE SEULE ICÔNE À LA PLACE DE DEUX BOUTONS ═══════════════════════════════════════
            « Relever maintenant » et « Rafraîchir » faisaient deux choses qu'on veut toujours ensemble : aller
            chercher le courrier, puis montrer ce qu'on a trouvé. Relever sans rafraîchir laissait l'écran sur
            l'image d'avant — c'est exactement ce qui a fait croire, le 26/09, que la relève ne fonctionnait pas.
            🔴 L'ICÔNE N'EST PAS SEULE : `aria-label` et `title` portent la phrase « Relever et actualiser ». Une
            icône sans nom n'existe pas pour un lecteur d'écran, et ne s'apprend pas au survol sur un téléphone. */}
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
            onClick={() => { void premiere(auto, critere, etiquetteDepuisTexte(cleEtiquette), filtre).then(() => onListeRelue?.()); }}>
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
      {!cherche && impose === true && (
        <p className="gst-tronc">
          Cette étiquette ne rassemble QUE les échanges dont aucun message n’est lisible — d’où l’absence
          d’interrupteur ici. Le reste du courrier est sous les autres étiquettes, rien n’est supprimé.
        </p>
      )}

      {/* CE QUE LA LISTE NE MONTRE PAS, dit en toutes lettres — et ramené d'un geste. Jamais un masquage silencieux. */}
      {!cherche && impose === null && etat.comptes !== null && etat.comptes.automatiques > 0 && (
        <p className="gst-tronc">
          {auto
            ? <>Le courrier automatique est inclus : {etat.comptes.automatiques} échange{etat.comptes.automatiques > 1 ? 's' : ''} ne contien{etat.comptes.automatiques > 1 ? 'nent' : 't'} que des messages tenus hors de la file par une règle.</>
            : <>{etat.comptes.automatiques} échange{etat.comptes.automatiques > 1 ? 's' : ''} ne contien{etat.comptes.automatiques > 1 ? 'nent' : 't'} que du courrier automatique et {etat.comptes.automatiques > 1 ? 'ne sont pas affichés' : 'n’est pas affiché'} ici. Rien n’est supprimé.</>}
          {' '}
          <button type="button" className="gst-lien-bouton" aria-pressed={auto} onClick={() => basculerAuto(!auto)}>
            {auto ? 'Masquer le courrier automatique' : 'Afficher aussi le courrier automatique'}
          </button>
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
                <li key={b.brouillonId}>
                  {b.filId === null ? (
                    <span className="bte-brouillon bte-brouillon--muet">
                      <Evidence texte={mot} saisie={critere.q} />
                      {' · '}courrier neuf, à rouvrir dans « Brouillons »
                      {b.aPiece && <span className="bte-marque"> <span aria-hidden="true">📎</span> pièce jointe</span>}
                    </span>
                  ) : (
                    <button type="button" className="bte-brouillon" onClick={() => onOuvrir(b.filId as number)}>
                      <Evidence texte={mot} saisie={critere.q} />
                      {b.aPiece && <span className="bte-marque"> <span aria-hidden="true">📎</span> pièce jointe</span>}
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {etat.lignes.length === 0 && !(cherche && etat.brouillons.lignes.length > 0)
        ? <p className="gst-vide">{cherche
            ? 'Aucun échange ne correspond à cette recherche.'
            : titre === undefined ? 'Aucun échange dans la boîte.' : `Aucun échange sous « ${titre} ».`}</p>
        : (
          <ul className={`gst-liste bte-liste${dense ? ' bte-liste--dense' : ''}`}>
            {etat.lignes.map((l) => {
              // LOT 5-BOITE — « non lu » = au moins un message REÇU que JE n'ai pas ouvert. Le serveur l'a calculé
              //   pour ma session ; la liste ne fait que l'afficher.
              const nonLu = etat.nonLus.has(l.filId);
              return (
              <li key={l.filId} className="bte-li">
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
                  onClick={() => onOuvrir(l.filId)}>
                  <span className="bte-qui">{nomCorrespondant(l)}</span>
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
                    <span>{l.nbMessages} message{l.nbMessages > 1 ? 's' : ''}</span>
                    {/* Chaque marque porte un MOT : elle reste lisible en niveaux de gris et pour un daltonien. */}
                    {l.aPiece && <span className="bte-marque"><span aria-hidden="true">📎</span> pièce jointe</span>}
                    {l.reference && <span className="bte-ref">{l.reference}</span>}
                    {l.sansSuite && <span className="bte-marque">classé sans suite</span>}
                    {l.nbLisibles === 0 && <span className="bte-marque">courrier automatique</span>}
                    {/* ══ LOT RECHERCHE-AVANCEE — D'OÙ VIENT CE RÉSULTAT ══════════════════════════════════════
                        Seulement en recherche, et seulement si PLUSIEURS listes sont cochées : avec une seule,
                        la réponse est déjà écrite dans le panneau et la répéter sur chaque ligne serait du bruit.
                        C'est le MESSAGE trouvé qui la donne, pas l'échange — une conversation vit à la fois dans
                        « Réception » et dans « Envoyés ». */}
                    {cherche && l.provenance !== undefined && critere.listes.length > 1 && (
                      <span className="bte-marque bte-provenance">{motDeLaListe(l.provenance)}</span>
                    )}
                    {nonLu && <span className="bte-marque bte-marque--non-lu">non lu</span>}
                    {/* ══ LOT ENVOI-DIAG — UN MESSAGE DE CET ÉCHANGE N'EST PAS ARRIVÉ ═══════════════════════════
                        🔴 SUR LA LIGNE, pas seulement dans l'échange ouvert : sinon il faudrait ouvrir les 6 580
                        échanges d'Envoyés pour espérer tomber dessus. La marque porte le MOTIF, parce que « échec »
                        seul ne dit pas s'il faut corriger une adresse ou rappeler quelqu'un. */}
                    {l.nonRemise && (
                      <span className={`bte-marque bte-marque--echec${
                        l.nonRemise.sorte === 'permanent' ? ' bte-marque--echec-definitif' : ''}`}>
                        <span aria-hidden="true">⚠ </span>{l.nonRemise.phrase}
                      </span>
                    )}
                  </span>
                  {/* LOT 5-DIRECT — la DATE ET L'HEURE de réception, en heure de Paris : « il y a 3 h » ne disait pas
                      si un mail était arrivé à 9 h ou à 14 h. La date complète reste dans l'infobulle. */}
                  <span className="bte-quand" title={dateHeureComplete(l.dernierLe)}>{dateHeureCourte(l.dernierLe, ref)}</span>
                </button>
                </MenuLigne>
              </li>
              );
            })}
          </ul>
        )}

      {etat.suivant !== null && (
        <button type="button" className="svv-btn svv-btn-outline gst-btn bte-plus" disabled={suite} onClick={() => void voirPlus()}>
          {suite ? 'Chargement…' : 'Voir les échanges plus anciens'}
        </button>
      )}
      {etat.suivant === null && etat.lignes.length > 0 && (
        <p className="gst-tronc">Vous avez atteint le plus ancien message de la boîte.</p>
      )}

      <style>{CSS_BOITE}</style>
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
.bte-ligne:hover,.bte-ligne:focus-visible{background:var(--color-svv-field)}
.bte-ligne:focus-visible{outline:2px solid var(--color-svv-red);outline-offset:-2px}
/* L'échange ouvert : une BARRE à gauche et un fond, jamais la couleur seule ; aria-current le dit aux lecteurs d'écran. */
.bte-ligne--ouverte{background:var(--color-svv-field);border-left:3px solid var(--color-svv-red);padding-left:8px}
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
.bte-marque--echec{color:var(--color-svv-red)}
.bte-marque--echec-definitif{font-weight:700}
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
  .bte-liste--dense .bte-bas{flex-wrap:nowrap;white-space:nowrap}
  .bte-liste--dense .bte-quand{text-align:right}
}
.bte-marque{display:inline-flex;align-items:center;gap:.25rem}
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
.bte-case{display:inline-flex;align-items:center;gap:.3rem;font-size:.82rem;color:var(--color-svv-ink);
  min-height:32px;cursor:pointer}
.bte-avancee-boutons{display:flex;flex-wrap:wrap;gap:8px;margin-left:auto}
/* La provenance d'un résultat : discrète, mais un MOT — jamais une couleur seule. */
.bte-provenance{color:var(--color-svv-muted)}
.bte-brouillons{margin:0 0 10px;padding:8px 10px;border:1px solid var(--color-svv-line);border-radius:.6rem}
.bte-brouillons-titre{margin:0 0 6px;font-size:.82rem;font-weight:700;color:var(--color-svv-ink)}
.bte-brouillon{display:block;width:100%;text-align:left;padding:.35rem 0;font-size:.85rem;
  background:transparent;border:0;color:var(--color-svv-ink)}
.bte-brouillon--muet{cursor:default;color:var(--color-svv-muted)}
.bte-trouve{font-weight:800;text-decoration:underline;text-underline-offset:2px}
.bte-plus{margin-top:12px;width:100%}
@media (min-width:600px){.bte-plus{width:auto}}

${CSS_MENU_LIGNE}
`;
