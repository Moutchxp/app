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

/**
 * ══ 🔴🔴 LOT FRISE-CONSTRUCTIBLE (06/10/2026) — CE QUE CE MODULE NE FAIT PLUS, ET CE QU'IL FAIT MAINTENANT ══════
 *
 * DEMANDE D'ARNO : « la frise d'avancement n'impose plus aucune suite d'étapes. Elle se CONSTRUIT avec les vraies
 * étapes, dans l'ordre réel (ex. rendez-vous → devis refusé → nouveau rendez-vous → nouveau devis…). ACCORD
 * D'ARNO : les carrés “attendue” en pointillé sont supprimés. »
 *
 * CE QUI DISPARAÎT : le tissage des `ETAPES_ATTENDUES`. La frise promettait une suite — une ouverture, un devis,
 * une acceptation, une intervention, une clôture, une fois chacun, dans cet ordre — et le dossier réel ne marche
 * pas ainsi. Un pointillé n'était pas seulement encombrant : il AFFIRMAIT un chemin qui n'existe pas, et ne
 * laissait aucune place à celui qui existe.
 *
 * CE QUI RESTE INTACT : `construireFrise` trie toujours par date puis par rang de dossier, les repères restent
 * des repères, les devis se comptent toujours PAR RÉFÉRENCE, « étape déduite — aucun mail » se dit toujours, et
 * aucune étape enregistrée n'est perdue. La permanence Monga n'est pas effleurée.
 *
 * CE QUI S'AJOUTE : une carte d'OUVERTURE dérivée de la date de l'événement quand aucune étape d'ouverture n'est
 * enregistrée ; la numérotation de TOUT type répété (« Devis 1, Devis 2… ») ; les « + » INTERCALAIRES entre deux
 * carrés, avec une date proposée entre celles des voisins.
 */

import {
  estRepere, motEtape, rangEtape, type TypeEtape,
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
  /**
   * 🔴 LOT FRISE-CONSTRUCTIBLE — QUAND LA CARTE A ÉTÉ POSÉE, ET PAR QUI. Arno, point 3 : « Chaque carte enregistre
   * aussi la date et l'heure de sa création et son auteur (“ajoutée le 06/10 à 22:31 par Arnaud”), visibles au
   * survol. » À ne pas confondre avec `survenuLe`, qui est la date de ce qui S'EST PASSÉ : les deux diffèrent dès
   * qu'on rattrape un oubli, et c'est justement là qu'on a besoin de les distinguer.
   */
  creeLe: string | null;
  /** 🔴 LE TITRE D'UNE CARTE LIBRE (Arno : « un carré LIBRE (titre à saisir) »). `null` partout ailleurs. */
  titre: string | null;
  /**
   * 🔴 LOT FRISE-BULLE-ET-ENREGISTRER — LE NOM DE LA PIÈCE JOINTE. Le dépôt le rendait déjà (`EtapeEcran`), mais
   * cette vue-ci ne le déclarait pas : la donnée arrivait jusqu'à l'écran et s'y perdait, faute d'être nommée.
   * Arno demande que le formulaire de modification porte « TOUTES les valeurs actuelles de la carte […] pièce
   * jointe » ; il faut donc d'abord pouvoir la lire.
   */
  pieceNom: string | null;
  /**
   * ══ 🔴🔴 LOT FRISE-ORDRE-POSE-ET-GLISSER — L'ORDRE DE POSE, ET C'EST LUI QUI RANGE LA FRISE ═══════════════
   *
   * ARNO (08/10/2026) : « Une carte ajoutée se place TOUJOURS au bout à droite de la frise. La date saisie à la
   * main est PUREMENT INFORMATIVE : elle s'affiche dans la carte mais n'a AUCUNE influence sur la place des
   * cartes entre elles. »
   *
   * 🔴 `null` = CARTE D'AVANT LA MIGRATION 321, et elle se range alors comme avant ce lot (date, rang de type,
   * identifiant). La migration remplit la colonne pour toutes les cartes existantes, dans l'ordre EXACT où
   * l'écran les montrait : au lendemain de son application, plus aucune carte n'est à `null`.
   */
  rangPose: number | null;
}

/**
 * Une case de la frise.
 *
 * 🔴 LOT FRISE-CONSTRUCTIBLE — `etape: null` NE VEUT PLUS DIRE « ATTENDUE ». Les carrés en pointillé sont
 * supprimés (accord d'Arno) ; la seule case sans étape enregistrée est désormais l'OUVERTURE DÉRIVÉE, celle qui
 * porte la date d'ouverture de l'événement tant qu'aucune étape d'ouverture n'existe. `sorte` le dit en toutes
 * lettres plutôt que de le laisser deviner à un `null`.
 */
export interface CaseFrise {
  cle: string;
  type: TypeEtape;
  /** Le mot affiché — « Devis 2 » quand le type est répété, le titre d'une carte libre, sinon le mot du type. */
  mot: string;
  /** L'étape enregistrée. `null` UNIQUEMENT pour la carte d'ouverture dérivée (`sorte: 'ouverture'`). */
  etape: EtapeAAfficher | null;
  /** `reelle` = une étape enregistrée · `ouverture` = la date d'ouverture de l'événement, dérivée. */
  sorte: 'reelle' | 'ouverture';
  /** La date de la case, toujours renseignée : celle de l'étape, ou celle de l'ouverture de l'événement. */
  survenuLe: string;
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
 * ══ 🔴🔴 LOT FRISE-CONSTRUCTIBLE — NUMÉROTER TOUT TYPE RÉPÉTÉ. PUR. ══════════════════════════════════════════════
 *
 * Arno, point 2 : « Chaque type est réutilisable autant de fois que nécessaire (Devis 1, Devis 2… numérotés par
 * ordre de date). » Ce n'était vrai que des devis ; ça l'est maintenant de tout : deux rendez-vous d'intervention
 * sur un même dossier doivent se distinguer, sans quoi on relit deux fois la même ligne sans savoir laquelle.
 *
 * 🔴 ON NUMÉROTE **DANS SA RÉFÉRENCE**, et c'est la règle mesurée du lot MONGA-2, pas une précaution. Un événement
 * peut porter plusieurs interventions Monga ; compter sur l'événement entier faisait écrire « Devis 1 / 2 / 3 »
 * sur trois devis de TROIS interventions différentes — lu de bonne foi, cela raconte un devis refusé deux fois.
 *
 * ⚠️ RIEN N'EST NUMÉROTÉ QUAND IL N'Y EN A QU'UN : numéroter un ensemble d'un seul élément fait croire qu'il en
 * manque d'autres — exactement l'inverse de ce que la frise doit dire.
 *
 * ⚠️ `devis_recu` GARDE SON PROPRE RANG (`rangDevis`), et il ne faut pas le remplacer par ce compteur-ci : lui
 * seul sait que deux mails portant le MÊME numéro DEV- ne font qu'un seul devis (cas mesuré sur la référence
 * 23449). Un comptage naïf y aurait écrit « Devis 1 » et « Devis 2 » pour un unique devis envoyé en double.
 */
export function numerosDesEtapes(etapes: readonly EtapeAAfficher[]): Map<number, number> {
  const groupes = new Map<string, EtapeAAfficher[]>();
  for (const e of etapes) {
    if (e.type === 'devis_recu') continue;
    const cle = `${e.reference ?? '(manuelle)'}|${e.type}`;
    groupes.set(cle, [...(groupes.get(cle) ?? []), e]);
  }
  const out = new Map<number, number>();
  for (const [, liste] of groupes) {
    if (liste.length <= 1) continue;
    const ordonne = [...liste].sort((a, b) => (a.survenuLe === b.survenuLe ? a.id - b.id
      : (a.survenuLe < b.survenuLe ? -1 : 1)));
    ordonne.forEach((e, i) => out.set(e.id, i + 1));
  }
  return out;
}

/**
 * ══ 🔴 LE MOT D'UNE CARTE, TOUT COMPRIS. PUR. ════════════════════════════════════════════════════════════════════
 *
 * Trois sources, dans cet ordre : le TITRE saisi d'une carte libre, le mot du type NUMÉROTÉ s'il se répète, le
 * mot du type seul.
 *
 * 🔴 LE TITRE L'EMPORTE, et seulement sur une carte libre. Arno : « plus un carré LIBRE (titre à saisir) ». Une
 * carte libre sans titre garderait « Carte libre », ce qui est honnête mais peu utile — l'écran rend donc le
 * titre obligatoire pour ce type-là, et la garde est ici autant que là-bas.
 */
export function motDeLaCarte(
  e: EtapeAAfficher, numero: number | undefined, nbDevisDeSaReference: number,
): string {
  if (e.type === 'autre' && e.titre !== null && e.titre.trim() !== '') return e.titre.trim();
  /**
   * ⚠️ PAS DE « Devis 1 » QUAND IL N'Y EN A QU'UN — règle de MONGA-2, et DÉFAUT VU À L'ÉCRAN sur lot-237 le
   * 06/10/2026 : en généralisant la numérotation, j'avais laissé tomber cette garde, et un devis unique
   * s'affichait « Devis 1 ». Numéroter un ensemble d'un seul élément fait croire qu'il en manque d'autres —
   * exactement l'inverse de ce que la frise doit dire. Le compteur générique (`numerosDesEtapes`) l'évite de
   * lui-même ; le rang des devis, qui vient du dépôt, demande cette garde explicite.
   */
  if (e.type === 'devis_recu') {
    return e.rangDevis === null || nbDevisDeSaReference <= 1 ? motEtape(e.type) : `Devis ${e.rangDevis}`;
  }
  return numero === undefined ? motEtape(e.type) : `${motEtape(e.type)} ${numero}`;
}

/**
 * ══ 🔴 « AJOUTÉE LE 06/10 À 22:31 PAR ARNAUD » (Arno, point 3). PUR. ═════════════════════════════════════════════
 *
 * ⚠️ AUCUN `Date` CONSTRUIT : on découpe la chaîne. Le fuseau du lecteur ne doit pas décaler l'heure à laquelle
 * quelqu'un a posé une carte — même règle que `motDateEtape`, et pour la même raison.
 *
 * ⚠️ ELLE NE MENT PAS QUAND L'AUTEUR EST INCONNU : elle dit « ajoutée le … », sans inventer un nom. Et elle rend
 * `null` quand on ne sait même pas quand — une mention vide vaut mieux qu'une mention fausse.
 */
export function motAjout(creeLe: string | null, creeParLibelle: string | null): string | null {
  if (creeLe === null || creeLe === '') return null;
  const [jour, reste] = creeLe.split(/[T ]/);
  const [, m, j] = jour.split('-');
  if (m === undefined || j === undefined) return null;
  const heure = (reste ?? '').slice(0, 5);
  const quand = heure === '' ? `le ${j}/${m}` : `le ${j}/${m} à ${heure}`;
  const qui = creeParLibelle === null || creeParLibelle.trim() === '' ? '' : ` par ${creeParLibelle.trim()}`;
  return `ajoutée ${quand}${qui}`;
}

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   ══ 🔴🔴 LOT FRISE-COULEURS-DATES (08/10/2026) — CE QU'UNE CARTE DIT PAR SA COULEUR ET PAR SA DATE ═══════════════

   DEMANDE D'ARNO, mot pour mot :
     · « Carte “Clôture” (et “Clôture Monga” une fois validée) : ENTIÈREMENT verte, contour ET fond (vert plein,
       texte blanc ou lisible), pour bien voir la clôture de l'événement. »
     · « Cartes “Ouverture” et “Réouverture” : contour ROUGE. »
     · « Toutes les autres cartes : contour VERT (comme aujourd'hui). »
     · « Cartes “Ouverture”, “Clôture” et “Réouverture” : leur date (date de la carte) est écrite en GRAS,
       CENTRÉE dans la carte. Pas de date de création en dessous. »
     · « Toutes les autres cartes : sous la carte […] la date à laquelle la carte a été CRÉÉE. »

   🔴 CES TROIS RÈGLES SONT **PURES**, ET C'EST POURQUOI ELLES VIVENT ICI. Dire « quelle couleur » et « quelle
   date » est une décision de DOMAINE — les trois cartes qui bornent une période (ouverture, clôture,
   réouverture) ne sont pas les autres. La feuille, elle, ne fait que peindre ce que ces fonctions tranchent.
   Les écrire dans le composant aurait mis la règle hors d'atteinte des épreuves, et l'aurait recopiée trois
   fois : la carte dérivée d'ouverture, la carte réelle, et la grille.

   ⚠️ LES TROIS CARTES DE BORNE SONT LES MÊMES DES DEUX CÔTÉS, et ce n'est pas une coïncidence : ce sont celles
   qui disent QUAND une période commence ou s'arrête. Leur date EST leur contenu — d'où le gras au centre — et
   c'est pour cela qu'elles n'ont pas besoin, en plus, de dire quand on les a saisies.
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

/**
 * LES TROIS CARTES QUI BORNENT UNE PÉRIODE : leur date s'écrit en gras, centrée, et rien ne vient sous elles.
 *
 * ⚠️ `ouverture` COUVRE LES DEUX FORMES : l'étape d'ouverture enregistrée (accusé Monga, repli de MONGA-2,
 * ouverture manuelle) ET la carte d'ouverture DÉRIVÉE de `gestion_evenement.ouvert_le`. La seconde n'a de toute
 * façon aucune date de création à montrer — elle n'est pas une ligne de la table des étapes.
 */
export const TYPES_BORNE: readonly TypeEtape[] = ['ouverture', 'cloture', 'reouverture'];

/** La date de cette carte s'écrit-elle en gras au centre (plutôt que sa date de création dessous) ? PUR. */
export function dateAuCentre(t: TypeEtape): boolean {
  return TYPES_BORNE.includes(t);
}

/**
 * ══ 🔴🔴 LA COULEUR D'UNE CARTE **POSÉE SUR LA FRISE** (Arno, point 2). PUR. ═════════════════════════════════════
 *
 * `debut`     — Ouverture, Réouverture : contour ROUGE. Ce sont les cartes d'où le dossier (re)part.
 * `cloture`   — Clôture : carte ENTIÈREMENT verte, contour et fond.
 * `ordinaire` — tout le reste : contour VERT, comme avant ce lot.
 *
 * 🔴 LE ROUGE NE VEUT PAS DIRE ICI CE QU'IL VEUT DIRE DANS LA GRILLE, et il faut le savoir : dans la grille,
 * ROUGE = « à poser ». Sur une carte POSÉE, il ne peut pas vouloir dire cela — il dit « une période commence
 * ici ». Les deux ne se croisent jamais : un carré de la grille n'est pas dans la frise, et réciproquement.
 *
 * ⚠️ LA COULEUR NE PORTE JAMAIS L'INFORMATION SEULE : le MOT de la carte (« Ouverture », « Clôture »,
 * « Réouverture ») est écrit dedans, et la source est lue dans la bulle et au lecteur d'écran.
 *
 * ⚠️ CETTE FONCTION NE SAIT RIEN DE « À CONFIRMER », et c'est voulu : l'ambre est un ÉTAT DE LECTURE (ce motif
 * n'a été vu que quelques fois), pas une sorte de carte. C'est l'écran qui le fait passer devant — voir la note
 * sur `aConfirmer` dans `FriseAvancement`.
 */
export function couleurDeLaCarte(t: TypeEtape): 'debut' | 'cloture' | 'ordinaire' {
  if (t === 'ouverture' || t === 'reouverture') return 'debut';
  if (t === 'cloture') return 'cloture';
  return 'ordinaire';
}

/** Ce qu'on écrit sous une carte : la mention, et si l'on sait vraiment quand elle a été créée. */
export interface MentionCreation {
  mot: string;
  /** `false` ⇒ on ne sait pas : la mention l'avoue, et l'écran la met en gris au lieu du vert. */
  connue: boolean;
}

/**
 * ══ 🔴🔴 « CRÉÉE LE 08/10/2026 », SOUS LA CARTE (Arno, point 3.b). PUR. ══════════════════════════════════════════
 *
 * 🔴 ELLE N'INVENTE JAMAIS DE DATE. Arno : « Vérifie que la date de création de chaque carte est bien
 * enregistrée. Si elle ne l'est pas pour les anciennes cartes, n'invente pas de date : affiche “date de création
 * inconnue” en gris. Pas de migration qui fabrique des dates. » Une date fabriquée se lirait comme une mesure.
 *
 * 🔴 MESURE DU 08/10/2026 : **0 carte** sur les 162 de la base est concernée — `gestion_monga_etape.cree_le` est
 * `NOT NULL DEFAULT now()` depuis sa création. La branche « inconnue » n'est donc pas un repli théorique posé
 * pour la forme : elle couvre le type `string | null` que le dépôt rend, et elle restera juste si une donnée
 * importée arrivait un jour sans date.
 *
 * ⚠️ AUCUN `Date` CONSTRUIT : on découpe la chaîne, exactement comme `motAjout` et `motDateEtape`. Le fuseau du
 * lecteur ne doit pas décaler d'un jour la date à laquelle quelqu'un a saisi une carte — à 23 h à Paris, un
 * `Date` rendrait déjà le lendemain.
 *
 * ⚠️ L'ANNÉE EN ENTIER, ET NON « le 08/10 » comme `motAjout` : cette mention-ci se lit sur la frise, à côté de
 * cartes qui peuvent avoir deux ans d'écart.
 *
 * ══ 🔴🔴 L'HEURE A ÉTÉ AFFICHÉE UNE JOURNÉE, PUIS RETIRÉE — ET LE CALCUL, LUI, N'A PAS BOUGÉ ══════════════════
 *
 * AU LOT FRISE-HORODATAGE-SECONDE-ET-PICTOS (08/10/2026), Arno a demandé « créée le JJ/MM/AAAA · HH:MM:SS », et
 * cette fonction rendait l'heure à la seconde. AU LOT FRISE-EPURE-ET-BANDE-BIEN, le même jour, il revient
 * dessus : « L'horodatage reste enregistré et utilisé à la seconde près pour l'ordre chronologique et la règle
 * vert/orange (rien ne change dans le calcul). Mais l'affichage sous chaque carte redevient : “créée le
 * JJ/MM/AAAA” — sans heure ni secondes. »
 *
 * 🔴 CE SONT DEUX CHOSES DISTINCTES, ET C'EST TOUT L'INTÉRÊT DE LA DÉCISION. La RÉFÉRENCE chronologique
 * (`cartesHorsChronologie`) continue de lire `creeLe` ENTIER, à la seconde : deux cartes posées dans la même
 * minute restent départagées, et le vert / l'orange disent toujours la même chose. Seul l'AFFICHAGE s'allège.
 * Rien dans le dépôt ni dans le calcul ne change — la seconde est lue, elle n'est plus écrite à l'écran.
 *
 * ⚠️ CONSÉQUENCE ASSUMÉE : deux cartes posées le même jour portent la même mention alors que leur ordre vient
 * de leurs secondes. La ligne ne justifie donc plus sa propre couleur à elle seule — c'est le prix de l'épure,
 * et c'est la décision d'Arno, prise en connaissance de ce qu'il venait de voir à l'écran.
 *
 * ⚠️ AUCUNE DATE CONSTRUITE, ICI NON PLUS : on découpe la chaîne. Le fuseau (Europe/Paris) est appliqué EN SQL,
 * là où la donnée est lue — `to_char(e.cree_le AT TIME ZONE 'Europe/Paris', …)`, `mongaEtapeRepo` —, et cela
 * reste nécessaire pour le JOUR : à 00 h 30 à Paris, l'UTC est encore la veille.
 *
 * ⚠️ SANS HEURE DANS LA CHAÎNE, ON N'EN INVENTE PAS : la mention s'arrête au jour. Le cas n'existe pas en base
 * (`cree_le` est `timestamptz NOT NULL`), mais une donnée importée pourrait n'avoir qu'un jour.
 */
export function mentionCreation(creeLe: string | null): MentionCreation {
  const inconnue: MentionCreation = { mot: 'date de création inconnue', connue: false };
  if (creeLe === null || creeLe === '') return inconnue;
  const [jour] = creeLe.split(/[T ]/);
  const [a, m, j] = jour.split('-');
  if (a === undefined || m === undefined || j === undefined) return inconnue;
  if (a.length !== 4 || m.length !== 2 || j.length !== 2) return inconnue;
  return { mot: `créée le ${j}/${m}/${a}`, connue: true };
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

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   ══ 🔴🔴 LOT FRISE-ORDRE-POSE-ET-GLISSER — CE QUI SE DÉPLACE, ET CE QUI EST HORS CHRONOLOGIE. PUR. ══════════════
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

/**
 * ══ 🔴 QUELLES CARTES SE GLISSENT (Arno, point 9) ═══════════════════════════════════════════════════════════════
 *
 * « Ouverture, Clôture, Réouverture et Clôture Monga NE se déplacent PAS (l'état de l'événement se lit sur la
 * frise) ; aucune carte ne peut être glissée avant l'Ouverture. »
 *
 * 🔴 LA RAISON EST ÉCRITE DANS SA PHRASE, et elle est juste : depuis le lot ETAT-PAR-LA-FRISE, l'état « ouvert /
 * clos » se DÉDUIT de l'ordre des cartes de borne. Glisser une Clôture derrière une Réouverture rouvrirait le
 * dossier d'un geste de souris, sans confirmation et sans trace. Les bornes sont donc fixes.
 *
 * ⚠️ `TYPES_BORNE` ET NON UNE LISTE RECOPIÉE : c'est la même liste que les cartes à date centrée et que les
 * bornes de l'état. Une quatrième borne ajoutée là-bas devient immobile ici, sans qu'on y pense.
 */
export function carteDeplacable(c: CaseFrise): boolean {
  /* ⚠️ L'OUVERTURE DÉRIVÉE NON PLUS : elle n'est pas une ligne de la table, il n'y a aucun rang à lui écrire. */
  if (c.etape === null) return false;
  return !TYPES_BORNE.includes(c.type);
}

/**
 * ══ 🔴🔴 LA LIGNE « CRÉÉE LE » PASSE À L'ORANGE QUAND LA CARTE N'EST PLUS À SA PLACE (Arno, point 10) ════════════
 *
 * « La carte qu'on a déplacée et qui n'est plus à sa place chronologique (selon sa date de création) voit sa
 * ligne “créée le …” passer de VERT à ORANGE. Si on la remet à sa place chronologique, elle redevient verte.
 * LES AUTRES CARTES NE CHANGENT PAS DE COULEUR. »
 *
 * ═══ 🔴 POURQUOI CE N'EST PAS « COMPARER CHAQUE CARTE À SON VOISIN » ════════════════════════════════════════════
 *
 * Soit trois cartes créées le 1er, le 2 et le 3, et l'on glisse la troisième en deuxième place : 1, 3, 2. Deux
 * cartes sont alors « après une carte plus récente » — la 3 et la 2 —, et une règle de voisinage les peindrait
 * TOUTES DEUX en orange. Arno dit l'inverse : « les autres cartes ne changent pas de couleur ». Une seule a
 * bougé, une seule doit le dire.
 *
 * 🔴 ON CHERCHE DONC LA PLUS LONGUE SUITE DE CARTES DÉJÀ EN ORDRE DE CRÉATION, et l'on marque exactement celles
 * qui n'en sont pas. C'est le plus petit ensemble de cartes qu'il faudrait déplacer pour rendre la frise
 * chronologique — autrement dit, celles qu'on a déplacées. Sur 1, 3, 2 : la suite la plus longue est 1, 2, et
 * c'est la carte 3 qui s'allume. Exactement celle qu'on a prise.
 *
 * ⚠️ LE DÉPARTAGE EST DÉTERMINISTE, et il garde la carte la PLUS ANCIENNE quand deux suites se valent : c'est ce
 * que fait l'algorithme classique (chaque date remplace la première borne supérieure ou égale). Sur 1, 3, 2, les
 * suites 1-2 et 1-3 ont la même longueur ; on garde 1-2, et c'est bien la carte avancée de force qui s'allume.
 *
 * ⚠️ UNE CARTE SANS DATE DE CRÉATION NE S'ALLUME JAMAIS. On ne sait pas où est sa place : la peindre en orange
 * serait affirmer qu'elle n'y est pas. Elle est simplement ignorée du calcul — ni gardée, ni marquée.
 *
 * ══ 🔴🔴 LOT FRISE-HORODATAGE-SECONDE-ET-PICTOS — LA RÉFÉRENCE EST L'HORODATAGE À LA SECONDE ════════════════
 *
 * ARNO : « L'ordre chronologique de référence = cet horodatage de création (à la seconde), CARRÉS ET POINTS
 * MÊLÉS. […] Quand plusieurs cartes existantes ont le même horodatage (ex. import du 06/10/2026), l'ordre
 * ACTUELLEMENT AFFICHÉ sert de départage. »
 *
 * 🔴 LES POINTS ENTRENT DANS LE CALCUL, et c'est un changement : ils en étaient exclus. Ils ne portent pas la
 * mention — ce sont des points de 11 px — mais ils occupent une place dans la suite, et les ignorer faisait
 * mentir le calcul des carrés qui les entourent : un carré glissé par-dessus un point paraissait à sa place.
 *
 * 🔴 L'ÉGALITÉ NE MARQUE JAMAIS RIEN, et c'est exactement le départage qu'Arno demande. Deux cartes nées dans
 * la MÊME SECONDE sont « en ordre » quel que soit leur sens : la comparaison est « strictement antérieure »
 * (`<=` dans la recherche de la suite), jamais « différente ». L'ordre affiché fait donc foi entre elles, sans
 * qu'aucune ne s'allume. Mesuré le 08/10/2026 : **2 cartes affichées** sont dans ce cas (GES-2026-900001), et
 * 133 cartes Monga orphelines qu'aucune frise ne montre.
 */
export function cartesHorsChronologie(cartes: readonly { cle: string; creeLe: string | null }[]): Set<string> {
  /* Les cartes dont on connaît la date de création, dans l'ordre de la frise. Les autres sont hors du calcul. */
  const datees = cartes.filter((c) => c.creeLe !== null && c.creeLe !== '');
  /* `tails[k]` = l'indice, dans `datees`, de la fin de la meilleure suite croissante de longueur k+1. */
  const tails: number[] = [];
  /* `parent[i]` = l'élément qui précède `i` dans la suite qui se termine en `i`. */
  const parent: (number | null)[] = datees.map(() => null);
  datees.forEach((c, i) => {
    /* Première borne STRICTEMENT supérieure : deux dates égales restent « en ordre » et ne s'évincent pas. */
    let bas = 0;
    let haut = tails.length;
    while (bas < haut) {
      const mid = (bas + haut) >> 1;
      if ((datees[tails[mid]].creeLe as string) <= (c.creeLe as string)) bas = mid + 1; else haut = mid;
    }
    parent[i] = bas > 0 ? tails[bas - 1] : null;
    tails[bas] = i;
  });
  /* On remonte la meilleure suite : ce qu'elle contient est à sa place, tout le reste a bougé. */
  const enPlace = new Set<string>();
  let k = tails.length === 0 ? null : tails[tails.length - 1];
  while (k !== null) {
    enPlace.add(datees[k].cle);
    k = parent[k];
  }
  return new Set(datees.filter((c) => !enPlace.has(c.cle)).map((c) => c.cle));
}

/**
 * ══ 🔴🔴 CONSTRUIRE LA FRISE. PUR. ═══════════════════════════════════════════════════════════════════════════════
 *
 * ① la carte d'OUVERTURE, toujours en tête — l'étape d'ouverture enregistrée s'il y en a une, sinon la DATE
 *    D'OUVERTURE DE L'ÉVÉNEMENT, dérivée (Arno, point 1) ;
 * ② les étapes RÉELLES, dans l'ordre chronologique — et, à date égale, dans l'ordre du dossier (`rangEtape`),
 *    sans quoi deux étapes du même jour s'afficheraient au hasard de l'identifiant ;
 * ③ les REPÈRES à part : commentaires, rappels, factures, contacts injoignables, notes.
 *
 * 🔴🔴 PLUS AUCUNE SUITE N'EST IMPOSÉE (Arno, lot FRISE-CONSTRUCTIBLE). Il n'y a ici que ce qui a eu lieu, trié
 * par la date de ce qui a eu lieu. Un dossier qui enchaîne rendez-vous → devis refusé → nouveau rendez-vous →
 * nouveau devis s'écrit donc tel quel, dans cet ordre, autant de fois que nécessaire.
 *
 * 🔴 L'OUVERTURE DÉRIVÉE N'EST PAS UNE ÉTAPE ENREGISTRÉE, et elle ne doit pas le devenir en silence : elle
 * AFFICHE `gestion_evenement.ouvert_le`, une donnée qui existe déjà et qui a sa propre vérité. En écrire une
 * copie dans la table des étapes aurait créé deux dates d'ouverture, libres de diverger.
 *
 * ⚠️ `ouvertLe` ABSENT ⇒ AUCUNE CARTE D'OUVERTURE INVENTÉE. Un appelant qui ne connaît pas la date de
 * l'événement (une épreuve, un écran partiel) obtient la frise des seules étapes réelles — jamais une ouverture
 * datée d'aujourd'hui, qui serait un fait faux.
 *
 * 🔴 LES ÉCARTÉES NE SONT PLUS LÀ : le dépôt ne les rend pas (`statut = 'vif'`). Ce module n'a donc pas à les
 * filtrer — mais il le fait quand même, parce qu'un appelant futur pourrait les lui passer, et qu'une étape
 * écartée réapparue sur la frise serait un démenti silencieux du geste qui l'a écartée.
 */
/**
 * ══ 🔴🔴 LOT FRISE-ORDRE-POSE-ET-GLISSER — L'ORDRE DE LA FRISE, ÉCRIT UNE SEULE FOIS. PUR. ══════════════════════
 *
 * ARNO (08/10/2026) : « Une carte ajoutée se place TOUJOURS au bout à droite de la frise. […] La date saisie à la
 * main est PUREMENT INFORMATIVE : elle s'affiche dans la carte mais n'a AUCUNE influence sur la place des cartes
 * entre elles. »
 *
 * ═══ CE QUE L'ORDRE ÉTAIT AVANT CE LOT, ET POURQUOI IL CHANGE ═══════════════════════════════════════════════════
 *
 * Il valait : DATE de l'étape, puis — à date égale — RANG DE TYPE, puis identifiant. Une carte « Devis reçu »
 * datée du 3 septembre posée aujourd'hui se glissait donc au MILIEU de la frise, entre des cartes posées la
 * semaine dernière. On croyait ranger un dossier, on le réécrivait.
 *
 * 🔴 L'ORDRE EST DÉSORMAIS CELUI DE LA POSE (`rang_pose`, migration 321) : ce qu'on vient d'ajouter est à droite,
 * et la date reste ce qu'elle dit — la date du FAIT, pas sa place dans le récit.
 *
 * ═══ ⚠️ LE REPLI, ET POURQUOI IL EST SÛR ════════════════════════════════════════════════════════════════════════
 *
 * `rangPose === null` ⇒ la carte se range comme AVANT ce lot (date, rang de type, identifiant). Deux états
 * seulement sont possibles en vrai, et le comparateur est juste dans les deux :
 *   · AUCUNE carte n'a de rang (migration 321 non appliquée) ⇒ toutes retombent sur l'ancienne clé, et l'écran
 *     est EXACTEMENT celui d'avant ;
 *   · TOUTES en ont un (la migration les remplit dans l'ordre affiché, et la route en pose un à chaque ajout).
 *
 * ⚠️ `Number.MAX_SAFE_INTEGER` POUR LES SANS-RANG, et non zéro : dans l'état mixte — qui ne peut survenir que si
 * l'on ajoutait une carte entre l'`ALTER TABLE` et l'`UPDATE` de la migration, c'est-à-dire à l'intérieur d'une
 * transaction — la carte neuve se range après les anciennes, ce qui est sa place.
 */
export function parOrdreDePose(a: EtapeAAfficher, b: EtapeAAfficher): number {
  const ra = a.rangPose ?? Number.MAX_SAFE_INTEGER;
  const rb = b.rangPose ?? Number.MAX_SAFE_INTEGER;
  if (ra !== rb) return ra - rb;
  if (a.survenuLe !== b.survenuLe) return a.survenuLe < b.survenuLe ? -1 : 1;
  return (rangEtape(a.type) - rangEtape(b.type)) || (a.id - b.id);
}

export function construireFrise(
  etapes: readonly EtapeAAfficher[], ouvertLe?: string | null,
): { majeures: CaseFrise[]; reperes: EtapeAAfficher[] } {
  const vives = etapes.filter((e) => e.certitude !== 'ecartee');
  const reperes = [...vives.filter((e) => estRepere(e.type))].sort(parOrdreDePose);
  const reelles = [...vives.filter((e) => !estRepere(e.type))].sort(parOrdreDePose);

  const numeros = numerosDesEtapes(reelles);
  /* 🔴 LE RANG D'UN DEVIS N'A DE SENS QUE DANS SON INTERVENTION : voir `devisParReference`. */
  const parRef = devisParReference(reelles);

  const cases: CaseFrise[] = reelles.map((e) => ({
    cle: `e${e.id}`,
    type: e.type,
    mot: motDeLaCarte(e, numeros.get(e.id), parRef.get(e.reference ?? '(manuelle)') ?? 0),
    etape: e,
    sorte: 'reelle',
    survenuLe: e.survenuLe,
  }));

  /**
   * ① LA CARTE D'OUVERTURE, EN TÊTE ET SANS DOUBLON. Arno, point 1 : « AU DÉPART : la frise montre seulement le
   * carré “Ouverture” (date d'ouverture de l'événement, modifiable), suivi d'un carré “+” rouge. »
   *
   * ⚠️ ELLE NE S'AJOUTE QUE S'IL N'Y A AUCUNE ÉTAPE D'OUVERTURE ENREGISTRÉE — accusé de réception Monga, repli
   * posé par `poserOuvertureDeRepli`, ou ouverture manuelle. Les 33 ouvertures de repli du lot MONGA-2 gardent
   * donc exactement la place et la date qu'elles avaient : rien n'est doublé, rien n'est remplacé.
   */
  if ((ouvertLe ?? null) !== null && !cases.some((c) => c.type === 'ouverture')) {
    /**
     * ══ 🔴🔴 LOT FRISE-ORDRE-POSE-ET-GLISSER — ELLE PASSE EN TÊTE, ET C'EST UN CHANGEMENT ═══════════════════
     *
     * ELLE S'INSÉRAIT À SA PLACE DANS LE TEMPS (`cases.findIndex((c) => c.survenuLe > ouvertLe)`), parce que la
     * frise était « TOUJOURS triée par date d'étape » — la règle d'alors. Elle ne l'est plus : l'ordre est celui
     * de la POSE, et la date n'y fait rien.
     *
     * 🔴 ARNO, POINT 9 : « aucune carte ne peut être glissée avant l'Ouverture ». Si rien ne peut passer devant
     * elle, elle est la première — il n'y a pas de place à chercher.
     *
     * ⚠️ CE QUE CELA CHANGE POUR LE CAS QUI MOTIVAIT L'ANCIENNE RÈGLE (un événement ouvert APRÈS l'arrivée du
     * premier mail Monga) : son ouverture passe maintenant devant ces mails au lieu de se glisser au milieu. Sa
     * DATE, elle, ne bouge pas d'un jour — elle est écrite dans la carte, et elle dit toujours la même chose.
     */
    const carte: CaseFrise = {
      cle: 'ouverture-evenement',
      type: 'ouverture',
      mot: motEtape('ouverture'),
      etape: null,
      sorte: 'ouverture',
      survenuLe: ouvertLe as string,
    };
    cases.unshift(carte);
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
export type SorteCase = 'carre' | 'points' | 'plus' | 'plus-entre';

export interface ElementFrise {
  cle: string;
  sorte: SorteCase;
  /** Pour un `carre` : la case telle que `construireFrise` l'a bâtie. */
  case?: CaseFrise;
  /** Pour `points` : les messages informatifs de cet intervalle, dans l'ordre. */
  messages?: EtapeAAfficher[];
  /**
   * 🔴 LOT FRISE-CONSTRUCTIBLE — pour un `plus-entre` : la date PROPOSÉE, calculée entre celles des deux voisins.
   * Arno, point 4 : « avec une date proposée entre celles des deux voisins (modifiable) ».
   */
  jourPropose?: string;
}

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   ══ 🔴🔴 LA DATE PROPOSÉE PAR UN « + » INTERCALAIRE. PUR, ET SANS UN SEUL `Date`. ═══════════════════════════════

   Arno, point 4 : « entre deux carrés consécutifs, un petit “+” encapsulé […] ouvre le même réservoir, avec une
   date proposée entre celles des deux voisins (modifiable). Il sert à ajouter une étape ou une information
   oubliée. »

   🔴 POURQUOI LE MILIEU, ET NON LA DATE DU VOISIN DE GAUCHE. Une carte posée au même jour que sa voisine de
   gauche se range à côté d'elle, mais l'ordre entre les deux dépend alors de `rangEtape` puis de l'identifiant :
   la carte qu'on vient d'insérer « entre » peut donc apparaître AVANT celle à droite de laquelle on a cliqué.
   Le milieu, lui, tombe strictement entre les deux dès que les voisines diffèrent d'au moins deux jours, et
   retombe sur l'une d'elles quand elles sont plus proches — ce qui est le mieux qu'on puisse faire sans heure.

   ⚠️ AUCUNE CONSTRUCTION DE `Date` — et l'épreuve de pureté de ce module le vérifie à la lettre, dans ce
   commentaire compris : elle refuse jusqu'à la mention littérale, ce qui est exactement ce qu'on veut d'un
   garde-fou. Une date construite au fuseau du lecteur décalerait le jour d'un
   rendez-vous d'un cran selon l'heure à laquelle on regarde l'écran. On compte donc en JOURS depuis une époque
   fixe, avec l'algorithme civil de Howard Hinnant — arithmétique entière, aucun fuseau, aucun calendrier à
   recopier (il tient les années bissextiles et les siècles tout seul).
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

/** « AAAA-MM-JJ » → jours depuis 1970-01-01. PUR. */
export function jourEnNombre(iso: string): number {
  const a = Number(iso.slice(0, 4));
  const m = Number(iso.slice(5, 7));
  const j = Number(iso.slice(8, 10));
  if (!Number.isFinite(a) || !Number.isFinite(m) || !Number.isFinite(j)) return 0;
  /* ⚠️ L'ANNÉE COMMENCE EN MARS dans cet algorithme : c'est ce qui met le 29 février en DERNIER jour de l'année
     et supprime tout cas particulier bissextile. Ne pas « simplifier » ce décalage. */
  const an = a - (m <= 2 ? 1 : 0);
  const ere = Math.floor(an / 400);
  const anDansLEre = an - ere * 400;
  const jourDeLAn = Math.floor((153 * (m + (m > 2 ? -3 : 9)) + 2) / 5) + j - 1;
  const jourDansLEre = anDansLEre * 365 + Math.floor(anDansLEre / 4) - Math.floor(anDansLEre / 100) + jourDeLAn;
  return ere * 146097 + jourDansLEre - 719468;
}

/** Jours depuis 1970-01-01 → « AAAA-MM-JJ ». PUR. L'exacte réciproque de `jourEnNombre`. */
export function nombreEnJour(n: number): string {
  const z = Math.floor(n) + 719468;
  const ere = Math.floor(z / 146097);
  const jourDansLEre = z - ere * 146097;
  const anDansLEre = Math.floor(
    (jourDansLEre - Math.floor(jourDansLEre / 1460) + Math.floor(jourDansLEre / 36524)
      - Math.floor(jourDansLEre / 146096)) / 365);
  const an = anDansLEre + ere * 400;
  const jourDeLAn = jourDansLEre - (365 * anDansLEre + Math.floor(anDansLEre / 4) - Math.floor(anDansLEre / 100));
  const mp = Math.floor((5 * jourDeLAn + 2) / 153);
  const j = jourDeLAn - Math.floor((153 * mp + 2) / 5) + 1;
  const m = mp + (mp < 10 ? 3 : -9);
  const a = an + (m <= 2 ? 1 : 0);
  return `${String(a).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(j).padStart(2, '0')}`;
}

/**
 * La date que propose un « + » intercalaire. PUR.
 *
 * ⚠️ `aujourdhui` EST PASSÉ EN ARGUMENT, il n'est pas lu ici : c'est ce qui rend cette fonction éprouvable, et
 * c'est la règle du dépôt pour tout module pur qui a besoin de « maintenant ».
 */
export function jourIntercalaire(avant: string | null, apres: string | null, aujourdhui: string): string {
  const a = avant === null ? null : avant.slice(0, 10);
  const b = apres === null ? null : apres.slice(0, 10);
  if (a === null && b === null) return aujourdhui;
  /* Pas de voisine à droite : on propose aujourd'hui, sauf si cela remonterait avant la voisine de gauche. */
  if (b === null) return aujourdhui >= (a as string) ? aujourdhui : (a as string);
  if (a === null) return b;
  return nombreEnJour(Math.floor((jourEnNombre(a) + jourEnNombre(b)) / 2));
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
  majeures: readonly CaseFrise[], reperes: readonly EtapeAAfficher[], aujourdhui: string,
): ElementFrise[] {
  const out: ElementFrise[] = [];
  /**
   * ══ 🔴🔴 LOT FRISE-ORDRE-POSE-ET-GLISSER — LES POINTS SE TISSENT PAR LA POSE, PLUS PAR LA DATE ═════════════
   *
   * Les points (messages simplement informatifs) se glissaient ENTRE les carrés par comparaison de DATES. Les
   * carrés n'étant plus rangés par date, cette comparaison n'avait plus de repère : un point du 14/09 pouvait
   * tomber avant un carré posé après lui.
   *
   * 🔴 CARRÉS ET POINTS SONT POSÉS DANS LA MÊME SUITE, et c'est pourquoi la migration 321 les numérote ENSEMBLE,
   * dans une seule séquence par événement. Le tissage compare donc des rangs de pose, comme la frise elle-même.
   *
   * ⚠️ LE REPLI VAUT ICI AUSSI : sans rang de pose (migration non appliquée), `parOrdreDePose` retombe sur la
   * date et le tissage est EXACTEMENT celui d'avant ce lot.
   */
  const restants = [...reperes].sort(parOrdreDePose);

  /** Les messages posés AVANT ce carré, retirés de la file. `null` = tout ce qui reste. */
  const avant = (borne: EtapeAAfficher | null): EtapeAAfficher[] => {
    const pris: EtapeAAfficher[] = [];
    while (restants.length > 0
      && (borne === null || parOrdreDePose(restants[0], borne) <= 0)) {
      pris.push(restants.shift() as EtapeAAfficher);
    }
    return pris;
  };

  majeures.forEach((c, i) => {
    /* ⚠️ L'OUVERTURE DÉRIVÉE N'A PAS D'ÉTAPE : rien ne peut être posé « avant » elle, et c'est juste — point 9
       d'Arno, « aucune carte ne peut être glissée avant l'Ouverture ». */
    const pris = c.etape === null ? [] : avant(c.etape);
    if (pris.length > 0) out.push({ cle: `pts-avant-${c.cle}`, sorte: 'points', messages: pris });
    out.push({ cle: c.cle, sorte: 'carre', case: c });

    /**
     * 🔴🔴 LE « + » INTERCALAIRE, ENTRE DEUX CARRÉS CONSÉCUTIFS (Arno, point 4). Il n'y en a pas après le dernier
     * carré : c'est le gros « + » rouge de fin qui y sert, et deux « + » collés l'un à l'autre n'apprendraient
     * rien de plus. Les messages du même intervalle se posent AVANT lui — ils ont eu lieu, le « + » non.
     */
    const suivant = majeures[i + 1];
    if (suivant !== undefined) {
      out.push({
        cle: `plus-entre-${c.cle}`,
        sorte: 'plus-entre',
        /* ⚠️ LA DATE PROPOSÉE RESTE CALCULÉE ENTRE LES DEUX VOISINES, et c'est encore utile : la date est
           désormais purement informative, mais elle reste une date, et la proposer juste évite de la ressaisir.
           Elle ne décide plus de RIEN quant à la place — c'est le « + » cliqué qui décide, et il pose au bout. */
        jourPropose: jourIntercalaire(c.survenuLe, suivant.survenuLe, aujourdhui),
      });
    }
  });

  /* 🔴 CE QUI EST ARRIVÉ APRÈS LE DERNIER CARRÉ se pose avant le gros « + » : eux aussi ont eu lieu. */
  const apres = avant(null);
  if (apres.length > 0) out.push({ cle: 'pts-fin', sorte: 'points', messages: apres });

  /**
   * 🔴 LE GROS « + » ROUGE FERME TOUJOURS LA MARCHE (Arno, point 1 : « suivi d'un carré “+” rouge »). Sur une
   * frise qui ne porte que son ouverture — le cas de départ — il est donc la seule autre chose à l'écran, et
   * c'est exactement ce qu'on veut : la prochaine chose à faire est d'ajouter.
   */
  out.push({ cle: 'plus', sorte: 'plus' });
  return out;
}

/**
 * ══ 🔴 SUR QUEL ÉLÉMENT LA FRISE S'OUVRE ═════════════════════════════════════════════════════════════════════════
 *
 * Arno : « À l'ouverture, la frise est positionnée pour montrer la dernière étape atteinte. »
 *
 * 🔴 LA DERNIÈRE CARTE RÉELLE, ET NON LE « + ». C'est l'état du dossier qu'on vient lire — « où en est-on ? » —
 * et non ce qu'il reste à faire. Rend `null` quand il n'y a aucune étape enregistrée : l'écran reste alors au
 * début, où se trouvent justement l'ouverture et le « + ».
 *
 * ⚠️ LA CARTE D'OUVERTURE DÉRIVÉE NE COMPTE PAS : elle n'est pas une étape atteinte, c'est la date de naissance
 * de l'événement. Caler dessus ferait croire que quelque chose s'y est passé.
 */
export function cleDOuverture(majeures: readonly CaseFrise[]): string | null {
  const reelles = majeures.filter((c) => c.sorte === 'reelle');
  return reelles.length === 0 ? null : reelles[reelles.length - 1].cle;
}

/**
 * ══ 🔴🔴 D'OÙ VIENT CETTE CARTE, EN TOUTES LETTRES — LOT FRISE-EPURE-ET-BANDE-BIEN (08/10/2026) ═══════════════
 *
 * ARNO, point 2 : « L'information “ajoutée à la main” / “venue de Monga” que portait le ✎ rouge (ou le ◆) n'est
 * pas perdue : elle s'affiche en tête de la bulle du “i” (ex. “Ajoutée à la main par …” / “Importée de Monga”),
 * avant le texte. »
 *
 * ══ 🔴🔴 CE QUI A ÉTÉ RETIRÉ ICI, ET CE QUI LE REMPLACE ══════════════════════════════════════════════════════
 *
 * `pictoSource(e)` VIVAIT À CETTE PLACE : un caractère, `'◆'` pour Monga et `'✎'` pour la main, rendu en rouge
 * à côté du titre de chaque carte. Son commentaire disait déjà la limite : « IL NE PORTE JAMAIS L'INFORMATION
 * SEUL […] un losange et un crayon ne se distinguent pas en niveaux de gris pour tout le monde. »
 *
 * 🔴 IL EST PARTI AVEC L'ACCORD EXPLICITE D'ARNO POUR CE RETRAIT, et pour une raison qu'il nomme : depuis le lot
 * FRISE-HORODATAGE-SECONDE-ET-PICTOS, la rangée du bas porte un VRAI crayon de modification. Deux ✎ sur la même
 * carte, l'un qui informe et l'autre qui agit, c'est une carte qui se contredit.
 *
 * 🔴 ET L'INFORMATION N'EST PAS PERDUE, ELLE EST DITE : cette fonction-ci rend la phrase, en tête de la bulle du
 * « i ». Un mot se lit en niveaux de gris, au lecteur d'écran, et ne demande pas d'avoir appris une légende.
 */
export function motOrigineCarte(e: EtapeAAfficher): string {
  if (e.source === 'monga') return 'Importée de Monga';
  const par = e.creeParLibelle === null || e.creeParLibelle.trim() === '' ? null : e.creeParLibelle.trim();
  return par === null ? 'Ajoutée à la main' : `Ajoutée à la main par ${par}`;
}

/**
 * LE MOT D'UN GROUPE DE POINTS, pour l'infobulle du groupe et le lecteur d'écran.
 *
 * ⚠️ « 1 message » / « 3 messages » — accordé, parce qu'un « 1 messages » dans un écran soigné se remarque.
 */
export function motGroupeMessages(n: number): string {
  return n <= 1 ? `${n} message` : `${n} messages`;
}

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   ══ 🔴🔴 LOT FRISE-BULLE-ET-ENREGISTRER (08/10/2026) — CE QUE LE FORMULAIRE AFFICHE QUAND IL S'OUVRE ════════════

   DEMANDE D'ARNO : « Le formulaire de modification doit être pré-rempli avec TOUTES les valeurs actuelles de la
   carte (forme, type, date, heure, montant, texte, pièce jointe), et le bouton s'active dès qu'une valeur
   change. […] Si une règle bloque l'enregistrement (champ requis, format), un message clair s'affiche à côté du
   bouton au lieu d'un bouton grisé muet. »

   ══ 🔴🔴 LE DÉFAUT QUE CELA FERME, ET IL EST STRUCTUREL ═════════════════════════════════════════════════════════

   Le préremplissage vivait dans un `useEffect` dont les dépendances étaient `[modifie?.id]`, sur un composant que
   rien ne remonte entre deux cartes. Tant que l'effet joue, tout va bien — et il joue, mesuré ce 08/10/2026 sur
   la carte même d'Arno. Mais le jour où il ne joue PAS (un remontage à chaud qui conserve l'état, un ordre de
   rendu inattendu), les champs gardent leurs valeurs de DÉPART : une date de réservoir, ou rien. Le bouton se
   désactive alors sur `jour === ''`, SANS un mot — les deux autres refus, eux, écrivent leur raison.

   🔴 LA RÉPONSE N'EST PAS DE RENFORCER L'EFFET, C'EST DE NE PLUS EN DÉPENDRE. Les valeurs de départ se DÉRIVENT
   ici, d'une fonction pure, et l'écran monte un formulaire NEUF par carte (une clé React). Le préremplissage
   cesse d'être un geste qui peut manquer : il devient ce que le formulaire EST.

   ⚠️ ET LA DATE NE PEUT PLUS ÊTRE VIDE : si `survenuLe` n'offre pas un jour lisible — ce qui n'arrive pas en base
   (`survenu_le` est NOT NULL, vérifié : 0 ligne sur 177 hors forme AAAA-MM-JJ), mais que le type du dépôt
   autorise — on retombe sur le jour proposé, jamais sur le vide.
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

export interface ValeursDeLaCarte {
  /** « etape » (un carré) ou « information » (un point) — la bascule du formulaire. */
  forme: 'etape' | 'information';
  type: TypeEtape;
  /** AAAA-MM-JJ, jamais vide. */
  jour: string;
  /** HH:MM, ou '' si l'heure n'est pas connue — ce qui est une information, pas une absence. */
  heure: string;
  texte: string;
  titre: string;
  /** Le montant en euros, tel qu'on le saisit : « 650 », « 1234,5 ». Vide s'il n'y en a pas. */
  montant: string;
  piece: string;
}

/** AAAA-MM-JJ si la chaîne en porte un, sinon `null`. Aucun `Date` construit : le fuseau du lecteur décalerait. */
function jourLisible(survenuLe: string | null | undefined): string | null {
  if (typeof survenuLe !== 'string') return null;
  const [jour] = survenuLe.split(/[T ]/);
  return /^\d{4}-\d{2}-\d{2}$/.test(jour) ? jour : null;
}

/**
 * Les valeurs d'ouverture du formulaire : celles de la carte qu'on modifie, ou celles d'une carte neuve.
 *
 * ⚠️ LE MONTANT EN CENTIMES REDEVIENT DES EUROS À VIRGULE, et c'est la forme qu'on saisit en français. Le
 * calcul se fait sur l'entier (`montantCents / 100`) : passer par un flottant afficherait 885,4999999.
 */
export function valeursDeLaCarte(
  carte: EtapeAAfficher | null, jourDefaut: string, typeDefaut: TypeEtape,
): ValeursDeLaCarte {
  if (carte === null) {
    return {
      forme: estRepere(typeDefaut) ? 'information' : 'etape',
      type: typeDefaut, jour: jourDefaut, heure: '', texte: '', titre: '', montant: '', piece: '',
    };
  }
  const jour = jourLisible(carte.survenuLe);
  return {
    forme: estRepere(carte.type) ? 'information' : 'etape',
    type: carte.type,
    jour: jour ?? jourDefaut,
    /* ⚠️ L'HEURE NE SE LIT QUE SI LE JOUR S'EST LU : sur une chaîne illisible, les positions 11 à 16 ne veulent
       rien dire, et « 26:10 » dans un champ `time` s'affiche vide — le piège qu'on vient de fermer. */
    heure: jour !== null && carte.heureConnue ? carte.survenuLe.slice(11, 16) : '',
    texte: carte.texte ?? '',
    titre: carte.titre ?? '',
    montant: carte.montantCents === null ? '' : String(carte.montantCents / 100).replace('.', ','),
    piece: carte.pieceNom ?? '',
  };
}

/**
 * Pourquoi l'enregistrement est refusé, en toutes lettres — ou `null` si rien ne s'y oppose.
 *
 * 🔴 ARNO : « un message clair s'affiche à côté du bouton au lieu d'un bouton grisé muet ». Le refus et sa
 * raison viennent donc du MÊME endroit : il ne peut plus exister de refus sans phrase, ce qui était exactement
 * le cas de la date vide — seule des trois conditions à n'en porter aucune.
 */
export function refusDEnregistrement(v: {
  jour: string; type: TypeEtape; titre: string; montantLisible: boolean;
}): string | null {
  if (v.jour === '') return 'La date manque : une carte se range à une date.';
  if (jourLisible(v.jour) === null) return 'La date ne se lit pas : attendu JJ/MM/AAAA.';
  if (v.type === 'autre' && v.titre.trim() === '') return 'Une carte libre demande un titre.';
  if (!v.montantLisible) return 'Le montant ne se lit pas : un nombre, en euros.';
  return null;
}
