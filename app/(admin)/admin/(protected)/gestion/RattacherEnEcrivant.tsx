'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { memeCibleBrouillon, type CibleBrouillon } from '../../../../lib/gestion/redaction';
import type { ContexteRedaction } from '../../../../lib/gestion/classementBien';
// 🔴 LE MOTEUR DE RECHERCHE DE BIENS, TEL QU'IL EXISTE : mêmes groupes, mêmes raisons, même route.
import { grouperResultats, messageAucunBien, motRaison } from '../../../../lib/gestion/rechercheBien';
import { ligneCompacteDuBien } from '../../../../lib/gestion/classementBoutons';
// 🔴 LOT AUCUNE-PROPOSITION-ET-ANIMATION-INVERSE — la phrase d'Arno quand le moteur ne trouve rien. Module PUR.
import { AUCUNE_PROPOSITION } from '../../../../lib/gestion/classementAvantEnvoi';
// 🔴 LOT CLASSER-SUR-CHAQUE-MAIL — la catégorie d'un lot, posée là où la nature est connue. Module PUR.
import { categorieDuBien, type CategorieBien } from '../../../../lib/gestion/categorieBien';
// 🔴 LOT MODALE-RATTACHER-PROPRE — le titre d'un bien (sans numéro de lot) et la pastille « i ».
import { titresDistincts } from '../../../../lib/gestion/titreBien';
import { CSS_INFO_BIEN, InfoBien } from './InfoBien';
// 🔴 LOT MODALE-SUIVI-ET-DEFILEMENT (point 2) — la pastille qui annonce le contenu en dessous d'une liste.
import { CSS_ZONE_DEFILANTE, ZoneDefilante } from './ZoneDefilante';
import type { BienTrouve, ResultatsBiens } from '../../../../lib/gestion/rechercheBienRepo';

/**
 * ══ 🔴🔴 LOT RATTACHER-EN-ECRIVANT — « RATTACHER CE MAIL À… », PENDANT QU'ON L'ÉCRIT ═══════════════════════════
 *
 * Demande d'Arno : « dès qu'une adresse est VALIDÉE dans À, Cc ou Cci […] une MODALE s'ouvre au centre de
 * l'écran ». Elle propose les biens que le moteur déduit des destinataires, on coche, on valide — et à l'envoi le
 * mail est rattaché à TOUS les biens cochés.
 *
 * ═══ 🔴 CE QUE ÇA RÉPARE ════════════════════════════════════════════════════════════════════════════════════════
 *
 * Le classement se faisait APRÈS COUP, sur un mail reçu, dans une file de plusieurs milliers de lignes. Un mail
 * qu'on écrit soi-même est pourtant le cas où l'on sait le MIEUX de quoi il parle — et c'est le seul moment où
 * cela ne coûte rien. Le faire à l'écriture, c'est retirer du travail à la file plutôt que lui en ajouter.
 *
 * ═══ 🔴 CE QU'ELLE NE FAIT PAS, ET C'EST DÉLIBÉRÉ ═══════════════════════════════════════════════════════════════
 *
 * ⚠️ ELLE N'ÉCRIT RIEN EN BASE. Elle ne fait que remplir le champ `cibles` du BROUILLON — la même liste que le
 * bloc « Classer ce mail », posée par la même porte au moment de l'envoi. Cocher puis fermer la fenêtre de
 * rédaction sans envoyer ne laisse aucune trace, ce qui est exactement ce qu'on attend d'un brouillon.
 *
 * ⚠️ FERMER LA MODALE N'EST PAS UNE ERREUR, et elle reste fermable par la croix comme par « Échap » : rien n'est
 * changé en sortant par là. Une modale qu'on ne peut pas fermer transforme un service en péage.
 *
 * ═══ 🔴🔴 LOT CLASSER-AVANT-ENVOI — CE QUI A CHANGÉ, ET CE QUI N'A PAS CHANGÉ ══════════════════════════════════
 *
 * CE QUI ÉTAIT ÉCRIT ICI, ET QUI NE VAUT PLUS :
 *   · « une MODALE s'ouvre dès qu'une adresse est validée » — Arno l'a retirée : « Saisir ou valider une adresse
 *     dans À / Cc / Cci n'ouvre PLUS la modale. On écrit son mail normalement. » Elle ne s'ouvre désormais qu'au
 *     clic sur le gros bouton rouge « Rattacher », ou sur la case verte pour modifier ;
 *   · « le mail part à classer » si on ferme sans choisir — il NE PART PLUS : « Envoyer » est inactif tant que le
 *     bloc « Classer ce mail » n'est pas une case verte. Fermer la fenêtre n'est donc plus une renonciation, mais
 *     un report : on revient aux deux boutons, et le geste reste à faire.
 *
 * 🔴 CE QUI N'A PAS CHANGÉ, ET QUI EST MAINTENANT CRUCIAL : les propositions sont CALCULÉES EN ARRIÈRE-PLAN à
 * partir des destinataires, pour être prêtes et pré-cochées au moment où l'on clique. Voir `precharge`.
 *
 * ⚠️ LA DÉCISION D'OUVRIR N'EST TOUJOURS PAS ICI : elle est chez l'appelant (`Redaction`). Ce composant, une fois
 * monté, est simplement visible.
 */
/**
 * 🔴 LA PRÉ-COCHE, ÉCRITE UNE SEULE FOIS — et c'est maintenant indispensable.
 *
 * Elle suit EXACTEMENT les règles du moteur, qui sont celles qu'Arno a écrites : locataire → son bien ;
 * propriétaire à bien unique → ce bien ; propriétaire à plusieurs biens → seulement si l'adresse ou le lot est
 * cité dans l'objet ou le texte. C'est le champ `recommande` qui les porte — on ne les réécrit pas ici, sans quoi
 * elles divergeraient du motif affiché juste à côté.
 *
 * ⚠️ ET LES CIBLES DÉJÀ RETENUES RESTENT COCHÉES : rouvrir la modale ne décoche jamais un choix fait.
 *
 * 🔴 POURQUOI UNE FONCTION DEPUIS LE LOT CLASSER-AVANT-ENVOI : elle est appelée à DEUX endroits — au premier
 * rendu quand les propositions sont déjà là, et à la fin d'une lecture. Deux copies de cette règle finiraient par
 * cocher deux choses différentes selon que la fenêtre a été pré-chargée ou non.
 */
function precocher(c: ContexteRedaction, cibles: readonly CibleBrouillon[]): Set<string> {
  const dejaLa = cibles.filter((x) => x.sorte === 'lot').map((x) => x.cle ?? '');
  return new Set([...c.biens.filter((b) => b.recommande).map((b) => b.cle), ...dejaLa]);
}

export function RattacherEnEcrivant({
  destinataires, objet, corps, pieces, cibles, precharge = null, messageId = null,
  piedSupplementaire = null, validationBloquee = null, selectionInitiale = null,
  onSelection, onChange, onFerme,
}: {
  /**
   * ══ 🔴🔴 LOT CLASSER-SUR-CHAQUE-MAIL — LA MÊME MODALE AU-DESSUS D'UN MAIL REÇU ════════════════════════════
   *
   * Demande d'Arno (point 4) : « Clic sur la case verte “Rattaché” → la modale “Rattacher ce mail à…” s'ouvre
   * avec les biens actuellement rattachés COCHÉS, plus les propositions et le moteur de recherche. » — et cette
   * phrase vaut « mails ET rédaction ».
   *
   * 🔴 UNE SEULE DIFFÉRENCE, ET ELLE TIENT EN UNE REQUÊTE. Pour un message qu'on écrit, le moteur déduit les
   * biens des DESTINATAIRES (`POST …/classement`) ; pour un message reçu, il les déduit du MESSAGE lui-même
   * (`GET …/classement?message=N`), qui est en base avec ses adresses analysées. Les deux routes rendent les
   * MÊMES `BienProposable`, avec les mêmes motifs et la même pré-coche : tout le reste de cette fenêtre est
   * rigoureusement identique.
   *
   * ⚠️ CE COMPOSANT N'ÉCRIT TOUJOURS RIEN EN BASE. Il rend la liste choisie par `onChange` ; c'est l'appelant
   * qui en tire les gestes — remplir un brouillon pour la rédaction, poser et retirer des liens pour un mail.
   * Mêler les deux ici ferait de cette fenêtre un second chemin d'écriture, à côté des routes existantes.
   */
  messageId?: number | null;
  /** Toutes les adresses VALIDÉES dans À, Cc et Cci. C'est d'elles que le moteur déduit les biens. */
  destinataires: readonly string[];
  objet?: string | null;
  corps?: string | null;
  /** Les noms des pièces déjà jointes : ils peuvent citer une adresse ou un n° de lot (cas c et d du moteur). */
  pieces?: readonly string[];
  /** Les cibles déjà retenues pour ce brouillon. La modale les coche d'avance : elle ne repart pas de zéro. */
  cibles: readonly CibleBrouillon[];
  /**
   * ══ 🔴🔴 LOT CLASSER-AVANT-ENVOI — LES PROPOSITIONS, DÉJÀ CALCULÉES EN ARRIÈRE-PLAN ══════════════════════
   *
   * Demande d'Arno : « Les propositions continuent d'être calculées en arrière-plan à partir des destinataires
   * (pour être PRÊTES et PRÉ-COCHÉES), mais la modale ne s'ouvre qu'au clic sur le gros bouton rouge. »
   *
   * 🔴 C'EST LA CONTREPARTIE DE L'OUVERTURE AUTOMATIQUE SUPPRIMÉE. Tant que la fenêtre surgissait toute seule,
   * elle avait le temps de charger pendant qu'on la lisait. Ouverte à la demande, un « Lecture des biens
   * possibles… » d'une seconde à chaque clic transformerait le geste principal en attente.
   *
   * ⚠️ LA CLÉ EST CELLE DES DESTINATAIRES, et elle est VÉRIFIÉE : des propositions calculées pour d'autres
   * adresses seraient pires que pas de propositions du tout. Si elle ne correspond pas, on charge normalement.
   *
   * ⚠️ ON RAFRAÎCHIT QUAND MÊME, EN SILENCE. L'objet et le texte ont pu changer depuis le pré-chargement (le
   * moteur cite les adresses et les n° de lot du corps : cas c et d). On montre donc tout de suite ce qu'on a,
   * et la liste se complète seule — sans jamais décocher ce que quelqu'un vient de cocher.
   */
  precharge?: { cle: string; contexte: ContexteRedaction } | null;
  /**
   * 🔴 LOT CLASSER-SUR-CHAQUE-MAIL — CE QUE L'APPELANT AJOUTE AU PIED, au-dessus du bouton de validation.
   *
   * Il sert à UN cas, et il faut qu'il serve : le bloc d'un mail reçu y remet la PORTÉE (« ce mail » / « toute
   * la conversation ») et l'entrée « Hors gestion, ou classer par pièce… », qui vivaient dans le panneau ouvert
   * par le lien rouge « Rattacher à un bien » — lien qu'Arno a fait supprimer au profit des deux cases.
   *
   * 🔴 RIEN N'EST PERDU, ET C'EST LA RAISON DE CETTE PROPRIÉTÉ. Ces deux gestes restent par ailleurs accessibles
   * depuis « Visualiser / Modifier » ; les reprendre ici leur garde le chemin le plus court — celui qu'on
   * empruntait avant ce lot.
   *
   * ⚠️ LA FENÊTRE NE SAIT RIEN DE CE QU'ELLE REND ICI : elle ne connaît ni la portée, ni les pièces. L'appelant
   * décide et affiche ; elle place. C'est ce qui lui permet de rester la même des deux côtés.
   */
  piedSupplementaire?: React.ReactNode;
  /**
   * ══ 🔴🔴 LOT MODALE-SUIVI-ET-DEFILEMENT — CE QUI EST COCHÉ EN CE MOMENT, REMONTÉ À L'ÉCRAN ════════════════════
   *
   * Demande d'Arno : le bloc « Suivi dans la conversation » ne doit apparaître QUE lorsque la sélection diffère du
   * rattachement validé. Or la sélection vit ICI, et le bloc est rendu par l'écran (il arrive en
   * `piedSupplementaire`). Il faut donc que la modale DISE ce qu'elle a sous les cases.
   *
   * ⚠️ ELLE REMONTE DES CLÉS, PAS UNE DÉCISION. La modale ne sait pas ce qu'est une fenêtre de conversation, et
   * elle n'a pas à le savoir : elle rend l'état de ses cases, l'écran le compare à ce qui est validé, et c'est un
   * module PUR (`blocSuiviVisible`) qui tranche. Absente ⇒ comportement d'avant ce lot.
   */
  onSelection?: (cles: readonly string[]) => void;
  /**
   * 🔴🔴 LOT SUIVI-CONVERSATION — « Sans confirmation, “Valider” reste bloqué » (Arno).
   *
   * Le pied que l'appelant ajoute peut porter une décision à confirmer — « Toute la conversation » reclasse des
   * mails passés. La fenêtre ne sait pas ce qu'est une période ; elle sait seulement qu'on lui a dit d'attendre.
   * Le motif est affiché à côté du bouton : un bouton gris sans explication se lit comme une panne.
   */
  validationBloquee?: string | null;
  /**
   * ══ 🔴🔴 LOT CONTACTS-EXTERNES — LA SÉLECTION EXACTE À REPRENDRE, PRÉ-COCHE DU MOTEUR COMPRISE ═══════════════
   *
   * `null` (le défaut) = comportement d'avant ce lot, sans une différence : la fenêtre pose sa PRÉ-COCHE, qui
   * réunit les biens recommandés par le moteur et les cibles déjà retenues (voir `precocher`).
   *
   * 🔴 UNE LISTE = CETTE LISTE, ET RIEN D'AUTRE. Elle sert à UN cas : « ← Retour » depuis la 2ᵉ étape, qui doit
   * rouvrir la fenêtre EXACTEMENT comme on l'a quittée.
   *
   * ⚠️ POURQUOI `cibles` NE SUFFISAIT PAS, ET C'EST UN DÉFAUT VU À L'ÉCRAN LE 02/10/2026. On rouvrait la fenêtre
   * en lui passant la sélection dans `cibles` ; la pré-coche y AJOUTAIT les quatre propositions du moteur, que
   * l'on venait justement de décocher. « Garde les cases cochées » (Arno) veut dire les deux : ce qui est coché
   * reste coché, ET ce qui est décoché reste décoché.
   *
   * ⚠️ UNE LISTE VIDE EST UNE SÉLECTION, PAS UNE ABSENCE : elle veut dire « aucun bien », et la fenêtre doit
   * rouvrir sur « Valider — aucun bien ». C'est pour cela que le défaut est `null` et non `[]`.
   */
  selectionInitiale?: readonly string[] | null;
  onChange: (c: CibleBrouillon[]) => void;
  onFerme: () => void;
}) {
  /**
   * 🔴 LA CLÉ DES DESTINATAIRES, calculée AVANT l'état : c'est elle qui décide si le pré-chargement vaut pour
   * cette ouverture-ci. Même forme des deux côtés (l'appelant la compose de la même liste, dans le même ordre).
   */
  const cle = messageId === null ? destinataires.join(',') : `message:${messageId}`;
  const pret = precharge !== null && precharge.cle === cle ? precharge.contexte : null;
  /**
   * 🔴 LOT CONTACTS-EXTERNES — LA SÉLECTION IMPOSÉE PAR L'APPELANT (« ← Retour »). `null` = il n'en impose
   * aucune, et la pré-coche d'origine s'applique — c'est-à-dire tout le comportement d'avant ce lot.
   */
  const imposee = selectionInitiale === null ? null : new Set(selectionInitiale);
  const [etat, setEtat] = useState<
    | { v: 'charge' }
    | { v: 'ok'; contexte: ContexteRedaction }
    | { v: 'erreur'; message: string }
  >(pret === null ? { v: 'charge' } : { v: 'ok', contexte: pret });
  /**
   * Les clés cochées. `null` = « pas encore décidé », et c'est ce qui permet de poser la PRÉ-COCHE une seule fois,
   * au chargement : la recalculer ferait recocher d'elle-même une case qu'on vient de décocher.
   */
  /**
   * ══ 🔴🔴 LOT MODALE-RATTACHER-PROPRE — LA SÉLECTION EST UN ENSEMBLE, PAS UNE LISTE ══════════════════════════
   *
   * Demande d'Arno : « La sélection est un ENSEMBLE de biens (clé = id du lot), jamais une liste qui empile des
   * doublons. » C'était un tableau de clés, tenu sans doublon par la discipline de `basculer`. Un `Set` ne le
   * tient pas par discipline mais PAR NATURE : il n'y a plus de chemin, présent ou futur, par lequel un même
   * bien pourrait être compté deux fois — ni le compteur, ni le bouton, ni le résumé de la case verte.
   */
  const [coches, setCoches] = useState<Set<string> | null>(
    // 🔴 LA PRÉ-COCHE EST POSÉE DÈS LE PREMIER RENDU quand les propositions sont déjà là : sans cela, la fenêtre
    //   s'ouvrirait avec les biens affichés mais aucune case cochée, puis les cases se cocheraient toutes seules
    //   sous les yeux — un mouvement qui se lit comme un défaut.
    // 🔴 LOT CONTACTS-EXTERNES — une sélection IMPOSÉE passe avant tout, et sans attendre les propositions :
    //   c'est « ← Retour », et il doit rendre la fenêtre telle qu'on l'a quittée, pas telle que le moteur la veut.
    imposee ?? (pret === null ? null : precocher(pret, cibles)),
  );
  /**
   * ══ 🔴🔴 LOT CLASSER-DEUX-BOUTONS — LE MOTEUR DE RECHERCHE EST DANS LA MODALE, TOUJOURS VISIBLE ══════════
   *
   * Il était derrière un lien « + Ajouter un autre bien » qui ouvrait une SECONDE fenêtre par-dessus celle-ci.
   * Demande d'Arno : le bloc « Moteur de recherche » prend sa place, juste sous les propositions, avec sa
   * légende au-dessus du champ.
   *
   * ⚠️ C'EST LE MOTEUR EXISTANT, pas un second : même route (`/api/admin/gestion/biens`), mêmes groupes
   * (« Par adresse » / « Par nom ou coordonnée »), mêmes raisons de correspondance. Seule la LIGNE change —
   * compacte, pour tenir dans une modale à côté des propositions.
   */
  const [saisie, setSaisie] = useState('');
  /** 🔴 LE CHAMP DE RECHERCHE : quand il n'y a aucune proposition, c'est là que va le curseur (voir plus bas). */
  const champRecherche = useRef<HTMLInputElement | null>(null);
  const [recherche, setRecherche] = useState<
    | { v: 'repos' }
    | { v: 'cherche' }
    | { v: 'ok'; resultats: ResultatsBiens }
    | { v: 'erreur' }
  >({ v: 'repos' });
  /** Les biens ajoutés à la main : ils ne viennent pas du moteur, mais ils se cochent et se valident pareil. */
  const [ajoutes, setAjoutes] = useState<CibleBrouillon[]>([]);

  const charger = useCallback(async () => {
    // ⚠️ ON NE REVIENT PAS À « Lecture des biens possibles… » quand on a déjà quelque chose à montrer : ce
    //   rafraîchissement-ci est silencieux (voir `precharge`). Il ne l'est pas la première fois.
    setEtat((e) => (e.v === 'ok' ? e : { v: 'charge' }));
    try {
      /**
       * ⚠️ UN `POST` POUR UNE LECTURE, et c'est voulu : la question porte sur des ADRESSES, un OBJET et un CORPS
       * en cours de frappe. Les mettre dans l'adresse de la requête y écrirait des données personnelles, et les
       * ferait entrer dans les journaux du serveur et l'historique du navigateur. Rien n'est écrit en base.
       */
      const res = messageId === null
        ? await fetch('/api/admin/gestion/classement', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ destinataires, objet, corps, pieces }),
        })
        // 🔴 LOT CLASSER-SUR-CHAQUE-MAIL — un mail REÇU : le moteur part du message, pas des destinataires.
        : await fetch(`/api/admin/gestion/classement?message=${messageId}`, { cache: 'no-store' });
      const d = (await res.json()) as {
        etat?: string; contexte?: Partial<ContexteRedaction>; message?: string;
      };
      if (d.etat !== 'ok' || d.contexte === undefined) {
        setEtat({ v: 'erreur', message: d.message ?? 'La lecture des biens n’a pas abouti.' });
        return;
      }
      /**
       * ⚠️ LES DEUX ROUTES NE RENDENT PAS EXACTEMENT LE MÊME OBJET : celle du mail reçu ne porte pas
       * `interneDabord` (il n'y a pas de destinataires à examiner). On COMPLÈTE au lieu de supposer — un champ
       * manquant lu comme `undefined` ferait disparaître la mention sans rien dire, ou pire, l'afficherait.
       */
      const recu: ContexteRedaction = {
        biens: d.contexte.biens ?? [],
        examen: d.contexte.examen ?? { issue: 'sans_candidat', motif: '' },
        proprietaire: d.contexte.proprietaire ?? null,
        interneDabord: d.contexte.interneDabord === true,
        disponible: d.contexte.disponible !== false,
      };
      setEtat({ v: 'ok', contexte: recu });
      // 🔴 LA PRÉ-COCHE, POSÉE UNE SEULE FOIS, et par la fonction `precocher` — la même que celle du premier
      //   rendu quand les propositions sont déjà là. Voir son encadré en tête de fichier.
      // ⚠️ `?? précoche` ET NON UNE AFFECTATION SÈCHE : un rafraîchissement silencieux ne doit JAMAIS recocher
      //   une case qu'on vient de décocher. La pré-coche n'a lieu qu'une fois, qu'elle vienne du pré-chargement
      //   ou de cette lecture-ci.
      const calcule = precocher(recu, cibles);
      // 🔴 LOT CONTACTS-EXTERNES — `imposee` d'abord : une sélection rendue par « ← Retour » ne doit pas se voir
      //   compléter par la pré-coche du moteur à la fin du chargement (défaut vu à l'écran le 02/10/2026).
      setCoches((prev) => prev ?? imposee ?? calcule);
    } catch {
      setEtat({ v: 'erreur', message: 'La lecture des biens n’a pas abouti.' });
    }
    // ⚠️ `cibles` HORS DES DÉPENDANCES : elles ne servent qu'à la pré-coche initiale. Les y mettre relancerait la
    //   requête à chaque case cochée — une lecture du serveur par clic.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cle, objet, corps, messageId]);

  useEffect(() => { void charger(); }, [charger]);

  const contexte = etat.v === 'ok' ? etat.contexte : null;

  /**
   * ══ 🔴🔴 LOT CLASSER-SUR-CHAQUE-MAIL — LE DÉFAUT D'ARNO : « LE COMPTEUR RESTE BLOQUÉ À 1 » ═════════════════
   *
   * CONSTAT : « il reste bloqué à “1” alors que rien n'est coché dans la liste visible ». LA CAUSE, trouvée en
   * relisant ce fichier, et elle est entièrement ici :
   *
   *   · la PRÉ-COCHE réunit les biens recommandés par le moteur ET les cibles DÉJÀ retenues (`dejaLa`) ;
   *   · la LISTE AFFICHÉE, elle, ne montrait que les propositions du moteur et les résultats de recherche.
   *
   * Un bien déjà rattaché que le moteur ne propose pas — le cas d'un rattachement posé à la main la semaine
   * dernière — était donc COCHÉ SANS CASE : compté par le bouton, invisible dans la liste, et hors d'atteinte
   * de « Tout désélectionner », qui ne parcourait lui aussi que les lignes visibles. Le compteur ne pouvait pas
   * redescendre.
   *
   * 🔴 ET IL Y AVAIT PIRE, SILENCIEUX : `valider` ne gardait que les clés présentes dans la liste visible. Ce
   * bien déjà rattaché aurait donc été RETIRÉ à la validation, sans que rien ne le dise.
   *
   * ═══ LE CORRECTIF : CE QUI EST COCHÉ EST VISIBLE, TOUJOURS ══════════════════════════════════════════════════
   *
   * Les cibles déjà retenues qui ne sont pas proposées rejoignent la liste, avec leur case et leur motif. C'est
   * aussi exactement ce qu'Arno demande au point 4 : « la modale s'ouvre avec les biens actuellement rattachés
   * COCHÉS, plus les propositions et le moteur de recherche ».
   */
  const clesProposees = new Set((contexte?.biens ?? []).map((b) => b.cle));
  /** Les biens montrés SOUS les propositions : trouvés à la recherche, ou déjà rattachés et non proposés. */
  const horsPropositions: { cible: CibleBrouillon; origine: 'recherche' | 'deja' }[] = [
    ...ajoutes.filter((a) => !clesProposees.has(a.cle ?? ''))
      .map((a) => ({ cible: a, origine: 'recherche' as const })),
    ...cibles
      .filter((c) => c.sorte === 'lot'
        && !clesProposees.has(c.cle ?? '')
        && !ajoutes.some((a) => (a.cle ?? '') === (c.cle ?? '')))
      .map((c) => ({ cible: c, origine: 'deja' as const })),
  ];
  /** Tous les biens montrés : ceux du moteur, puis les autres. C'est la liste que le compteur compte. */
  const tous: { cle: string; libelle: string }[] = [
    ...(contexte?.biens ?? []).map((b) => ({ cle: b.cle, libelle: b.libelle })),
    ...horsPropositions.map((x) => ({ cle: x.cible.cle ?? '', libelle: x.cible.libelle })),
  ];
  /** Ce qui est DÉJÀ montré en haut — propositions comprises. Sert à dire « déjà dans la sélection » en bas. */
  const clesEnHaut = new Set(tous.map((b) => b.cle).filter((c) => c !== ''));

  /**
   * ══ 🔴🔴 LOT MODALE-RATTACHER-PROPRE — LES TITRES, CALCULÉS UNE FOIS POUR TOUTE LA FENÊTRE ═════════════════
   *
   * Demande d'Arno : « le titre d'un bien devient “adresse — Type de bien” […]. Le numéro de lot n'apparaît plus
   * dans le titre. » Et : « Deux biens de même adresse et même type : départager par l'étage ou la mention utile
   * la plus courte. »
   *
   * 🔴 SUR L'UNION DES TROIS LISTES, et il le faut : deux homonymes peuvent être l'un dans les propositions et
   * l'autre dans les résultats de recherche. Les titrer liste par liste laisserait passer exactement le cas que
   * le départage existe pour résoudre — et c'est le cas le plus fréquent (deux lots du même immeuble).
   *
   * ⚠️ LA CLÉ RESTE LA CLÉ : le titre est un affichage, jamais une identité. Cocher, valider et compter se font
   * sur la clé WIPPIMMO, qui ne bouge pas d'un titre à l'autre.
   */
  const pourTitres = [
    ...(contexte?.biens ?? []).map((b) => ({
      cle: b.cle, adresse: [b.adresse ?? '', b.commune ?? ''].filter((x) => x.trim() !== '').join(', '),
      nature: b.nature, typeBien: b.typeBien, immeuble: null as string | null,
    })),
    ...horsPropositions.map((x) => ({
      cle: x.cible.cle ?? '', adresse: x.cible.libelle, nature: null, typeBien: null,
      immeuble: null as string | null,
    })),
    ...(recherche.v === 'ok' ? recherche.resultats.lignes : []).map((b) => ({
      cle: b.cle, adresse: [b.adresseVoie ?? '', b.commune ?? ''].filter((x) => x.trim() !== '').join(', '),
      nature: b.nature, typeBien: b.typeBien, immeuble: null as string | null,
    })),
  ];
  const parTitre = new Map(titresDistincts(pourTitres.filter((b) => b.cle !== '')).map((x) => [x.cle, x.titre]));
  /**
   * ⚠️ UN REPLI NOMMÉ : un bien déjà rattaché dont on n'a que le libellé enregistré (le texte figé en base, qui
   * porte encore « — lot N ») garde ce libellé plutôt que de perdre son nom. C'est le seul endroit où l'ancien
   * format peut encore apparaître, et il disparaît dès que le moteur ou la recherche rendent le bien.
   */
  const titre = (cle: string): string => parTitre.get(cle)
    ?? tous.find((b) => b.cle === cle)?.libelle ?? cle;
  const selection = coches ?? new Set<string>();
  /**
   * 🔴 ON REMONTE LA SÉLECTION À CHAQUE FOIS QU'ELLE CHANGE, et seulement alors. `coches` est un `Set` dont la
   * RÉFÉRENCE change à chaque bascule : la dépendance suffit, et l'effet ne tourne pas à chaque rendu.
   *
   * ⚠️ `null` TANT QUE LA PRÉ-COCHE N'A PAS EU LIEU : on ne remonte rien avant de savoir, sinon l'écran lirait
   * « aucun bien coché » pendant le chargement et croirait à un changement.
   */
  useEffect(() => {
    if (coches === null) return;
    onSelection?.([...coches]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [coches]);
  const basculer = (c: string) => setCoches((l) => {
    const v = new Set(l ?? []);
    if (v.has(c)) v.delete(c); else v.add(c);
    return v;
  });

  /**
   * ══ 🔴🔴 LOT MODALE-RATTACHER-PROPRE — UN SEUL LIEN QUI BASCULE, SUR TOUT CE QUI EST VISIBLE ════════════════
   *
   * Demande d'Arno : « “Tout sélectionner / Tout désélectionner” devient un seul lien qui bascule d'un clic :
   * “Sélectionner tous les biens” quand au moins un bien visible n'est pas coché, “Désélectionner tous les
   * biens” quand tous le sont. Il porte sur les biens proposés ET sur les résultats de recherche affichés. »
   *
   * 🔴 CE QU'IL NE FAISAIT PAS, ET QUI SE VOYAIT : il ne portait que sur la liste du HAUT. On cherchait trois
   * biens, on cliquait « Tout sélectionner », et les trois résultats restaient décochés — le mot disait « tout »
   * et le geste en laissait la moitié.
   *
   * ⚠️ « VISIBLE » EST LE MOT EXACT : ce qui n'est pas à l'écran n'est pas touché. Cocher d'un clic des biens
   * qu'on n'a pas vus serait exactement le défaut que ce lot répare du côté du compteur.
   */
  const clesVisibles = (): string[] => [...new Set([
    ...tous.map((b) => b.cle),
    ...(recherche.v === 'ok' ? recherche.resultats.lignes.map((b) => b.cle) : []),
  ])].filter((c) => c !== '');
  const toutesCochees = (() => {
    const v = clesVisibles();
    return v.length > 0 && v.every((c) => selection.has(c));
  })();

  /**
   * ══ 🔴🔴 LOT AUCUNE-PROPOSITION-ET-ANIMATION-INVERSE — « AUCUNE PROPOSITION » EST UN ÉTAT À PART ═══════════
   *
   * Rien à cocher, nulle part : ni proposition du moteur, ni bien déjà rattaché, ni résultat de recherche. C'est
   * alors la PHRASE qui remplace le compteur, et le curseur part dans le champ de recherche — le seul geste qui
   * reste à faire.
   *
   * ⚠️ IL SUFFIT D'UN RÉSULTAT DE RECHERCHE POUR EN SORTIR : les cases reviennent, et le compteur avec elles.
   */
  const aucuneProposition = clesVisibles().length === 0;

  /**
   * 🔴 LOT PROPOSITIONS-PAR-LE-CONTENU — LES BIENS AU-DELÀ DU CINQUIÈME D'UNE MÊME PERSONNE. Ils sont dans la
   * liste (ils se cochent, ils se valident) mais rangés derrière un lien tant qu'on ne les demande pas.
   */
  const [autresDeplies, setAutresDeplies] = useState(false);
  const replies = (contexte?.biens ?? []).filter((b) => b.replie).length;

  /**
   * 🔴 LE CURSEUR VA DANS LE CHAMP DE RECHERCHE (demande d'Arno). Une seule fois, à l'ouverture : le remettre à
   * chaque rendu arracherait le curseur des mains dès qu'on cliquerait ailleurs.
   */
  const dejaPlace = useRef(false);
  useEffect(() => {
    if (!aucuneProposition || dejaPlace.current || contexte === null || !contexte.disponible) return;
    dejaPlace.current = true;
    champRecherche.current?.focus();
  }, [aucuneProposition, contexte]);
  const toutBasculer = () => setCoches((l) => {
    const v = new Set(l ?? []);
    const visibles = clesVisibles();
    if (visibles.every((c) => v.has(c))) for (const c of visibles) v.delete(c);
    else for (const c of visibles) v.add(c);
    return v;
  });

  /**
   * ══ LA RECHERCHE, DIFFÉRÉE DE 250 ms ═══════════════════════════════════════════════════════════════════════
   *
   * ⚠️ LE MÊME DÉLAI QUE PARTOUT DANS LE MODULE : chercher à chaque lettre ferait une requête par caractère, et
   * la base répondrait à des questions que personne n'a fini de poser.
   *
   * ⚠️ DEUX CARACTÈRES AU MINIMUM, comme l'annuaire : une seule lettre rend la moitié du fichier.
   */
  useEffect(() => {
    const t = saisie.trim();
    if (t.length < 2) { setRecherche({ v: 'repos' }); return undefined; }
    setRecherche({ v: 'cherche' });
    let vivant = true;
    const minuteur = setTimeout(() => {
      void (async () => {
        try {
          const res = await fetch(`/api/admin/gestion/biens?q=${encodeURIComponent(t)}`, { cache: 'no-store' });
          const d = (await res.json()) as { etat?: string } & Partial<ResultatsBiens>;
          if (!vivant) return;
          if (d.etat === 'ok') {
            setRecherche({ v: 'ok', resultats: {
              lignes: d.lignes ?? [], tronque: d.tronque === true, disponible: d.disponible !== false,
            } });
          } else setRecherche({ v: 'erreur' });
        } catch { if (vivant) setRecherche({ v: 'erreur' }); }
      })();
    }, 250);
    return () => { vivant = false; clearTimeout(minuteur); };
  }, [saisie]);

  /**
   * 🔴 UN RÉSULTAT COCHÉ REJOINT LA LISTE DU HAUT, et le compteur bouge. Demande d'Arno, mot pour mot. Il entre
   * donc dans `ajoutes` — la même liste que les biens trouvés à la main avant ce lot — et se coche d'office :
   * on ne coche pas un résultat pour ne pas le prendre.
   *
   * ⚠️ DÉCOCHER UN RÉSULTAT NE LE RETIRE PAS DE LA LISTE : il reste visible, décoché, comme une proposition.
   * L'effacer ferait disparaître sous le doigt la ligne qu'on vient de toucher.
   */
  const basculerResultat = (b: BienTrouve) => {
    // 🔴 LOT CLASSER-SUR-CHAQUE-MAIL — LA CATÉGORIE EST POSÉE ICI, là où la nature du lot est connue. L'écran
    //   qui affichera la case verte, lui, ne connaît ni l'annuaire ni les natures : il place et peint.
    const n: CibleBrouillon = {
      sorte: 'lot', cle: b.cle, id: null, libelle: b.libelle,
      categorie: categorieDuBien({ nature: b.nature, typeBien: b.typeBien }),
    };
    if (!ajoutes.some((x) => memeCibleBrouillon(x, n))
      && !(contexte?.biens ?? []).some((x) => x.cle === b.cle)) {
      setAjoutes((a) => [...a, n]);
    }
    basculer(b.cle);
  };

  const valider = () => {
    // ⚠️ GARDE DE DERNIER RECOURS : le bouton est déjà désactivé, mais un bouton désactivé ne protège pas d'un
    //   « Entrée » ni d'un navigateur qui rejoue l'événement.
    if (validationBloquee !== null) return;
    /**
     * 🔴🔴 LOT CLASSER-SUR-CHAQUE-MAIL — LES CIBLES DÉJÀ RETENUES ENTRENT DANS CETTE TABLE, ET IL LE FAUT.
     *
     * Avant ce lot, elle ne contenait que les propositions du moteur et les résultats de recherche : une clé
     * cochée qui ne venait ni de l'un ni de l'autre — un bien rattaché à la main la semaine dernière — était
     * écartée par le `filter` ci-dessous, donc RETIRÉE à la validation, en silence. C'est la seconde moitié du
     * défaut « le compteur reste bloqué à 1 » (voir l'encadré de `horsPropositions`).
     *
     * ⚠️ L'ORDRE D'INSERTION COMPTE : les cibles déjà là d'abord, puis le moteur et la recherche, qui portent
     * un libellé et une CATÉGORIE fraîchement lus. Le plus récent gagne.
     */
    const parCle = new Map<string, { libelle: string; id: number | null; categorie?: CategorieBien }>();
    for (const c of cibles) {
      if (c.sorte === 'lot') parCle.set(c.cle ?? '', { libelle: c.libelle, id: c.id, categorie: c.categorie });
    }
    for (const b of contexte?.biens ?? []) {
      parCle.set(b.cle, {
        libelle: b.libelle, id: null,
        categorie: categorieDuBien({ nature: b.nature, typeBien: b.typeBien }),
      });
    }
    for (const a of ajoutes) parCle.set(a.cle ?? '', { libelle: a.libelle, id: a.id, categorie: a.categorie });
    const retenues: CibleBrouillon[] = [...selection]
      .filter((c) => parCle.has(c))
      .map((c) => ({
        sorte: 'lot' as const, cle: c, id: parCle.get(c)?.id ?? null,
        libelle: parCle.get(c)?.libelle ?? c,
        ...(parCle.get(c)?.categorie ? { categorie: parCle.get(c)?.categorie } : {}),
      }));
    /**
     * ⚠️ LES CIBLES QUI NE SONT PAS DES LOGEMENTS SONT CONSERVÉES TELLES QUELLES. Un événement choisi dans le
     * bloc « Classer ce mail » n'a rien à faire dans cette fenêtre, et valider ici ne doit pas l'effacer.
     */
    onChange([...cibles.filter((c) => c.sorte !== 'lot'), ...retenues]);
    onFerme();
  };

  /**
   * ══ 🔴 FERMER SANS CHOISIR : LA CROIX ET « ÉCHAP » NE CHANGENT RIEN ═══════════════════════════════════════
   *
   * Demande d'Arno : « Rien n'est changé et le bloc reste à l'état initial. » C'est déjà vrai par construction —
   * `onChange` n'est appelé QUE par « Valider » — et cette fonction ne fait que fermer. On l'écrit quand même à
   * un seul endroit : trois sorties qui appelleraient trois choses finiraient par ne plus faire la même.
   */
  const fermerSansRien = () => onFerme();

  return (
    <div className="mrt-voile rec-voile" role="presentation"
      onClick={(e) => { if (e.target === e.currentTarget) fermerSansRien(); }}>
      <style>{CSS_RATTACHER_EN_ECRIVANT}</style>
      {/* 🔴 LOT MODALE-RATTACHER-PROPRE — la feuille de la pastille « i » : la modale vit au-dessus de tout, et
          ne peut compter sur aucune feuille montée par l'écran qui l'ouvre. */}
      <style>{CSS_INFO_BIEN}</style>
      <style>{CSS_ZONE_DEFILANTE}</style>
      <div className="mrt rec" role="dialog" aria-modal="true" aria-labelledby="rec-titre"
        onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); fermerSansRien(); } }}>
        {/* 🔴 LA CROIX EST UNE SORTIE NOMMÉE (demande d'Arno) : elle remplace le bouton « Ignorer » du pied, qui
            disait la même chose en prenant la place d'une décision. Rien n'est changé en sortant par elle. */}
        <button type="button" className="rec-croix" aria-label="Fermer sans rien changer"
          title="Fermer sans rien changer" onClick={fermerSansRien}>×</button>
        <h2 className="mrt-titre" id="rec-titre">Rattacher ce mail à…</h2>
        {/* ══ 🔴🔴 LOT MODALE-SUIVI-ET-DEFILEMENT (point 3) — SEUL LE MILIEU DÉFILE ═══════════════════════════
            CONSTAT D'ARNO : « Sur la capture, “Valider” est coupé en bas. » La modale entière défilait
            (`.rec{max-height:92vh;overflow-y:auto}`) : passé une certaine hauteur de contenu, le pied sortait du
            cadre, et le seul bouton qui décide devenait invisible.
            🔴 LE TITRE ET LE PIED SONT DÉSORMAIS HORS DU DÉFILEMENT, et ce bloc-ci est le seul à défiler. */}
        <div className="rec-corps">
        {/* ⚠️ « D'APRÈS LE DESTINATAIRE » NE SE DIT QUE D'UN MAIL QU'ON ÉCRIT. Sur un mail REÇU, le moteur part
            du message lui-même : la phrase serait fausse, et il n'y a rien à mettre à la place — chaque bien
            proposé porte déjà SON motif, juste à côté de sa case. */}
        {messageId === null && (
          <p className="rec-dest">
            D’après {destinataires.length === 1 ? 'le destinataire' : `les ${destinataires.length} destinataires`}
            {' : '}{destinataires.join(', ')}
          </p>
        )}

        {/* ══ 🔴 « INTERNE » EN PREMIER QUAND TOUS LES DESTINATAIRES SONT DE LA MAISON ══════════════════════════
            Demande d'Arno. C'est une PROPOSITION de place, pas une décision : rien n'est coché d'avance, et le
            bouton se re-clique pour se défaire. Quand les destinataires sont mêlés, le bouton reste — en bas,
            avec les autres réponses — parce qu'un échange peut être interne sans que l'adresse le dise. */}
        {contexte?.interneDabord && (
          <p className="rec-interne-dabord">
            Tous les destinataires sont de la maison : cet échange est probablement <strong>interne</strong>.
          </p>
        )}

        {etat.v === 'charge' && <p className="gst-info" role="status">Lecture des biens possibles…</p>}
        {etat.v === 'erreur' && <p className="gst-tronc" role="alert">{etat.message}</p>}

        {contexte !== null && !contexte.disponible && (
          <p className="gst-tronc">
            Le classement n’est pas encore installé sur cette base (annuaire des biens ou mise à jour 257 à
            appliquer). Le mail partira « à classer ».
          </p>
        )}

        {contexte?.disponible && (
          /* 🔴 LOT CLASSER-DEUX-BOUTONS — LES PROPOSITIONS SONT UNE CARTE, la recherche en est une autre :
             « chaque categorie a sa place » (demande d'Arno). Sans cette separation, les deux listes de cases a
             cocher se confondaient en une seule, et l'on ne savait plus ce qui venait de l'automatisation. */
          <section className="rec-carte" aria-label="Biens proposés">
            <p className="rec-carte-titre">Propositions</p>
            <div className="rec-barre">
              {/* ══ 🔴🔴 LOT MODALE-RATTACHER-PROPRE — LE COMPTEUR, ET CE QU'IL COMPTE ═══════════════════════
                  ① DES BIENS DISTINCTS, par construction : `selection` est un ENSEMBLE. Un bien qui figure à la
                     fois dans les propositions et dans les résultats n'y entre qu'une fois, quel que soit
                     l'endroit où on l'a coché.
                  ② SUR CE QUI EST AFFICHÉ, et non plus « sur N proposé(s) ». Constaté à l'écran : la bascule
                     cochant désormais aussi les résultats de recherche, on lisait « 3 bien(s) coché(s) sur
                     1 proposé(s) » — une phrase qui compte deux choses différentes de part et d'autre de
                     « sur ». Les deux nombres parlent maintenant du même ensemble : celui qu'on voit. */}
              {/* ══ 🔴🔴 LOT AUCUNE-PROPOSITION-ET-ANIMATION-INVERSE — QUAND IL N'Y A RIEN, ON LE DIT ═══════
                  DEMANDE D'ARNO (01/10/2026) : « Aucune proposition disponible pour ce mail. Utilise le moteur
                  de recherche ci-dessous pour sélectionner le ou les biens en relation avec ce mail. »

                  🔴 ET SURTOUT : PAS DE « 0 bien(s) coché(s) sur 0 affiché(s) ». Ce compteur-là ne comptait
                  rien ; il donnait à une fenêtre vide l'air d'une fenêtre pleine, et laissait chercher des cases
                  qui n'existaient pas. Une phrase qui dit QUOI FAIRE vaut mieux qu'un nombre qui dit zéro. */}
              {aucuneProposition
                ? <p className="rec-compte rec-aucune" role="status">{AUCUNE_PROPOSITION}</p>
                : (
                  <p className="rec-compte" role="status">
                    {`${selection.size} bien(s) coché(s) sur ${clesVisibles().length} affiché(s).`}
                  </p>
                )}
              {/* 🔴 UN SEUL LIEN QUI BASCULE, et il porte sur les propositions ET sur les résultats affichés.
                  ⚠️ IL DISPARAÎT AVEC LES CASES : « tout sélectionner » sur rien ne veut rien dire. */}
              {!aucuneProposition && (
                <button type="button" className="gst-lien-bouton" onClick={toutBasculer}>
                  {toutesCochees ? 'Désélectionner tous les biens' : 'Sélectionner tous les biens'}
                </button>
              )}
            </div>

            {/* 🔴 LOT MODALE-SUIVI-ET-DEFILEMENT (point 2) — la zone DIT ce qu'elle cache en dessous. */}
            <ZoneDefilante className="rec-biens" as="ul" enfants={<>
              {(contexte.biens ?? []).filter((b) => !b.replie || autresDeplies).map((b) => (
                <li key={b.cle} className="rec-bien">
                  <label className="rec-choix">
                    <input type="checkbox" checked={selection.has(b.cle)} onChange={() => basculer(b.cle)} />
                    {/* 🔴 LOT MODALE-RATTACHER-PROPRE — LE TITRE, SANS NUMÉRO DE LOT : « adresse — qualité ». */}
                    <span className="rec-bien-nom">{titre(b.cle)}</span>
                    {/* ⚠️ LA PASTILLE EST DANS LE LABEL, et elle NE COCHE PAS : voir `InfoBien`.
                        ⚠️ `surLaLigne` PORTE LES PARTIES, écrites juste dessous dans `rec-parties`. */}
                    <InfoBien cle={b.cle} titre={titre(b.cle)}
                      surLaLigne={`${titre(b.cle)} ${b.parties.map((p) => p.nom).join(' ')}`} />
                  </label>
                  {/* 🔴 LE MOTIF EST ÉCRIT EN CLAIR, TOUJOURS (« locataire de ce bien », « propriétaire »…) : on
                      doit savoir POURQUOI ce bien est proposé, et pourquoi sa case est cochée, sans rouvrir le
                      code. C'est la règle du lot AFFECTATION-PAR-BIEN, et elle vaut ici à l'identique. */}
                  <p className="rec-motif">{b.motif}</p>
                  <ul className="rec-parties">
                    {b.parties.length === 0 && <li className="rec-partie">aucune partie connue aujourd’hui</li>}
                    {b.parties.map((p) => (
                      <li key={`${p.role}|${p.cle}`} className="rec-partie">
                        <span className="rec-role">{p.role === 'proprietaire' ? 'propriétaire' : 'locataire'}</span>
                        {' '}{p.nom}
                      </li>
                    ))}
                  </ul>
                </li>
              ))}
              {/* ══ 🔴🔴 LOT CLASSER-SUR-CHAQUE-MAIL — CE QUI EST COCHÉ EST VISIBLE, TOUJOURS ══════════════
                  Deux sources ici, et la SECONDE est le correctif du défaut d'Arno (« le compteur reste bloqué
                  à 1 ») : les biens DÉJÀ RATTACHÉS que le moteur ne propose pas. Ils étaient cochés sans case —
                  comptés par le bouton, introuvables dans la liste, hors d'atteinte de « Tout désélectionner ».

                  🔴 LE MOTIF DIT D'OÙ CHACUN VIENT : « ajouté à la main depuis la recherche » n'est pas « déjà
                  rattaché à ce mail », et c'est précisément ce qu'on a besoin de savoir avant de décocher. */}
              {/* ══ 🔴 LOT PROPOSITIONS-PAR-LE-CONTENU — « VOIR LES AUTRES » ═══════════════════════════════
                  Demande d'Arno : « Plus de 5 biens → les 5 plus pertinents, plus “voir les autres”. » Les
                  douze lots d'un bailleur noieraient la proposition au lieu de l'éclairer ; ils ne sont pas
                  perdus pour autant, ils sont à un clic. */}
              {replies > 0 && (
                <li className="rec-bien rec-autres">
                  <button type="button" className="gst-lien-bouton"
                    onClick={() => setAutresDeplies((v) => !v)}>
                    {autresDeplies ? 'masquer les autres biens' : `voir les autres (${replies})`}
                  </button>
                </li>
              )}
              {horsPropositions.map(({ cible: a, origine }) => (
                <li key={`hors-${a.cle}`} className="rec-bien">
                  <label className="rec-choix">
                    <input type="checkbox" checked={selection.has(a.cle ?? '')}
                      onChange={() => basculer(a.cle ?? '')} />
                    <span className="rec-bien-nom">{titre(a.cle ?? '')}</span>
                    {/* ⚠️ ICI LA LIGNE N'AFFICHE QUE LE TITRE : aucune partie n'est écrite dessous. */}
                    <InfoBien cle={a.cle ?? ''} titre={titre(a.cle ?? '')} surLaLigne={titre(a.cle ?? '')} />
                  </label>
                  <p className="rec-motif">
                    {origine === 'recherche'
                      ? 'ajouté à la main depuis la recherche'
                      : 'déjà rattaché — décochez pour le retirer'}
                  </p>
                </li>
              ))}
            </>} />
          </section>
        )}

        {/* ══ 🔴🔴 LE MOTEUR DE RECHERCHE, TOUJOURS VISIBLE (demande d'Arno) ═══════════════════════════════════
            Il était derrière un lien qui ouvrait une SECONDE fenêtre par-dessus celle-ci : on perdait de vue les
            propositions au moment précis où l'on cherchait ce qu'elles n'avaient pas trouvé. */}
        <section className="rec-carte rec-recherche" aria-label="Moteur de recherche">
          <p className="rec-carte-titre">Moteur de recherche</p>
          <label className="rec-champ">
            {/* 🔴 LA LÉGENDE EST AU-DESSUS DU CHAMP, jamais dans le champ : un texte d'aide qui disparaît à la
                première lettre n'aide qu'avant qu'on en ait besoin. */}
            <span className="rec-legende">
              Adresse, n° de lot, nom (propriétaire ou locataire), téléphone ou e-mail — tous les mots, dans
              n’importe quel ordre
            </span>
            <input ref={champRecherche}
              className="rec-saisie" type="search" value={saisie} autoComplete="off" maxLength={120}
              placeholder="ex. « 28 marceau », « 421 », « MARTY », « 06 03 05 07 03 »"
              onChange={(e) => setSaisie(e.target.value)} />
          </label>

          {recherche.v === 'cherche' && <p className="rec-vide" role="status">Recherche…</p>}
          {recherche.v === 'erreur' && (
            <p className="rec-vide" role="alert">La recherche n’a pas répondu. Réessayez.</p>
          )}
          {recherche.v === 'ok' && !recherche.resultats.disponible && (
            <p className="rec-vide">Annuaire des biens pas encore installé sur cette base.</p>
          )}
          {recherche.v === 'ok' && recherche.resultats.disponible && recherche.resultats.lignes.length === 0 && (
            // 🔴 ON DIT CE QU'ON A CHERCHÉ : « aucun résultat » tout court se lit comme une panne.
            <p className="rec-vide">{messageAucunBien(saisie)}</p>
          )}

          {/* 🔴 LA MÊME ZONE, pour les résultats : Arno nomme les deux listes. */}
          {recherche.v === 'ok' && recherche.resultats.lignes.length > 0 && (
            <ZoneDefilante className="rec-resultats" enfants={<>
              {grouperResultats(recherche.resultats.lignes).map((g) => (
                <section key={g.sorte} className="rec-groupe">
                  {/* Les deux groupes titrés du moteur : « Par adresse », puis « Par nom ou coordonnée ». */}
                  <p className="rec-groupe-titre">{g.titre}</p>
                  <ul className="rec-lignes">
                    {g.biens.map((b) => (
                      <LigneBienCompacte key={b.cle} bien={b} coche={selection.has(b.cle)}
                        titre={titre(b.cle)}
                        /* 🔴🔴 LOT MODALE-RATTACHER-PROPRE — « déjà dans la sélection » (demande d'Arno) : ce
                           bien est DÉJÀ montré en haut. La mention dit que les deux cases n'en font qu'une,
                           et le compteur ne le compte qu'une fois. */
                        dejaEnHaut={clesEnHaut.has(b.cle)}
                        onBasculer={() => basculerResultat(b)} />
                    ))}
                  </ul>
                </section>
              ))}
            </>} />
          )}
          {recherche.v === 'ok' && recherche.resultats.tronque && (
            <p className="rec-vide">Seuls les premiers biens sont affichés — précisez votre recherche.</p>
          )}
        </section>

        {/* ══ 🔴 LE PIED NE PORTE PLUS QU'UNE DÉCISION ═════════════════════════════════════════════════════════
            CE QU'IL Y AVAIT, ET QUI A ÉTÉ RETIRÉ SUR DEMANDE D'ARNO :
              · « Interne — échange entre collègues » → il est devenu le GROS BOUTON BLANC du bloc « Classer ce
                mail », où il est visible sans ouvrir de fenêtre. Ici, il obligeait à ouvrir une modale de
                rattachement pour dire qu'il n'y avait rien à rattacher ;
              · « Ignorer — envoyer à classer » → c'est la CROIX, en haut à droite, et la touche Échap. Deux
                sorties qui ne changent rien n'ont pas besoin de deux libellés ; celle-ci prenait la place d'une
                décision, à côté du seul bouton qui en pose une.
            🔒 LE BOUTON ROUGE N'EST PAS TOUCHÉ : même mot, même compte, même geste. */}
        </div>

        {/* 🔴 LOT MODALE-SUIVI-ET-DEFILEMENT (point 1) — le bloc « Suivi dans la conversation » APPARAÎT au moment
            où la sélection change (c'est l'écran qui le décide, module pur `blocSuiviVisible`). L'animation est
            la même que partout ailleurs dans la modale : une apparition discrète, et rien de plus. */}
        {piedSupplementaire !== null && <div className="rec-pied-sup">{piedSupplementaire}</div>}

        <div className="mrt-pied rec-pied">
          {/* 🔴 LOT SUIVI-CONVERSATION — LE MOTIF DU BLOCAGE SE LIT, il ne se survole pas : au doigt, une
              infobulle n'existe pas (exigence transverse du dépôt). */}
          {validationBloquee !== null && (
            <p className="rec-bloque" role="status">{validationBloquee}</p>
          )}
          <button type="button" className="svv-btn svv-btn-primary gst-btn"
            disabled={validationBloquee !== null} title={validationBloquee ?? undefined}
            onClick={valider}>
            {/* 🔴🔴 LOT CLASSER-SUR-CHAQUE-MAIL — LE VRAI NOMBRE, ET « aucun bien » À ZÉRO (demande d'Arno).
                Le bouton reste ACTIF à zéro : valider à vide est une décision — elle retire tous les
                rattachements et ramène les deux boutons, d'où l'on peut alors choisir « Interne ».
                ⚠️ `selection` NE COMPTE PLUS QUE DU VISIBLE : toute clé cochée a désormais sa case (voir
                l'encadré de `horsPropositions`). C'est ce qui fait que ce compte redescend à zéro. */}
            {selection.size === 0 ? 'Valider — aucun bien' : `Valider — ${selection.size} bien(s)`}
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * ══ 🔴 UNE LIGNE DE RÉSULTAT, COMPACTE ════════════════════════════════════════════════════════════════════════
 *
 * Demande d'Arno : « adresse — lot · type | PROPRIÉTAIRE(S) nom(s) | LOCATAIRE nom ou “Vacant” », avec une case.
 *
 * 🔴 COMPACTE, ET PAS UNE CARTE À DEUX COLONNES comme celle du panneau de rattachement : ici la recherche vit
 * SOUS les propositions, dans une modale. Des cartes hautes repousseraient les propositions hors de l'écran, au
 * moment précis où l'on compare les deux.
 *
 * ⚠️ LA MISE EN FORME EST DÉCIDÉE DANS LE MODULE PUR (`ligneCompacteDuBien`) : « Vacant », les co-propriétaires,
 * le type accolé au libellé. Cet écran place et peint, il ne décide pas.
 */
function LigneBienCompacte({ bien: b, coche, titre, dejaEnHaut, onBasculer }: {
  bien: BienTrouve; coche: boolean; titre: string; dejaEnHaut: boolean; onBasculer: () => void;
}) {
  const l = ligneCompacteDuBien(b, titre);
  return (
    <li className={`rec-ligne${dejaEnHaut ? ' rec-ligne--deja' : ''}`}>
      <label className="rec-ligne-choix">
        <input type="checkbox" checked={coche} onChange={onBasculer} />
        <span className="rec-ligne-corps">
          <span className="rec-ligne-titre">
            {l.titre}
            {/* ⚠️ `surLaLigne` PORTE AUSSI LES PARTIES, qui sont écrites juste dessous : la fenêtre ne répétera
                donc ni le propriétaire ni le locataire — mais gardera la DATE D'ENTRÉE, qui n'est pas là. */}
            <InfoBien cle={b.cle} titre={l.titre} surLaLigne={`${l.titre} ${l.proprietaires} ${l.locataire}`} />
          </span>
          {/* 🔴🔴 « déjà dans la sélection » : la même case, vue d'un autre endroit — jamais un second bien. */}
          {dejaEnHaut && <span className="rec-ligne-deja">déjà dans la sélection</span>}
          <span className="rec-ligne-parties">
            <span className="rec-ligne-role">{b.parties.filter((p) => p.role === 'proprietaire').length > 1
              ? 'Propriétaires' : 'Propriétaire'}</span>
            {' '}{l.proprietaires}
            <span className="rec-ligne-sep" aria-hidden="true"> | </span>
            <span className="rec-ligne-role">Locataire</span>{' '}{l.locataire}
          </span>
          {/* Pourquoi cette ligne répond : c'est ce qui permet de comprendre un résultat surprenant. */}
          <span className="rec-ligne-motif">trouvé par {b.raisons.map(motRaison).join(' · ')}</span>
        </span>
      </label>
    </li>
  );
}

export const CSS_RATTACHER_EN_ECRIVANT = `
/* ⚠️ AUCUN ACCENT GRAVE DANS CE LITTERAL : un seul le terminerait (piege consigne plusieurs fois dans ce depot).

   ══ 🔴🔴 LE VOILE PORTE SON PROPRE PLEIN ECRAN, ET C'EST INDISPENSABLE ════════════════════════════════════════
   VU A L'ECRAN LE 30/09/2026 : la modale s'ouvrait DANS la fenetre de redaction flottante, large de 494 px, et
   restait derriere elle. Deux causes, et il fallait les deux :
     ① la classe .mrt-voile (qui porte le plein ecran des autres fenetres du module) vit dans une AUTRE feuille
        de style, que la fenetre de redaction ne monte pas — la classe etait ecrite, et ne s'appliquait pas ;
     ② la fenetre flottante porte un z-index de 60 ; un voile sans z-index propre passe dessous, meme en fixed.
   On ne se repose donc sur AUCUNE feuille exterieure : ce bloc suffit a lui seul.

   ══ 🔴 LOT CLASSER-DEUX-BOUTONS — LE RELIEF DEMANDE PAR ARNO ══════════════════════════════════════════════════
   « fond de modale legerement teinte, blocs en cartes blanches a bordure fine et ombre douce, libelles gris,
   valeurs foncees ». AUCUNE COULEUR NOUVELLE : le fond teinte est le jeton « field » (celui des champs), les
   cartes sont le jeton « surface » (celui des fenetres). En sombre, les deux s'inversent tout seuls — c'est
   justement pourquoi on prend des jetons et pas des valeurs. */
.rec-voile{position:fixed;inset:0;z-index:80;display:flex;align-items:center;justify-content:center;
  padding:16px;background:color-mix(in srgb, var(--color-svv-ink) 45%, transparent);overflow-y:auto}
/* ══ 🔴🔴 LOT MODALE-SUIVI-ET-DEFILEMENT (point 3) — LA MODALE TIENT DANS L'ECRAN ═══════════════════════════════
   CONSTAT D'ARNO : « Valider » etait coupe en bas. La modale entiere defilait, donc le pied sortait du cadre des
   que le contenu depassait. Elle est maintenant une COLONNE : titre, corps defilant, pied. Seul le milieu bouge.
   ⚠️ min-height:0 SUR LE CORPS EST OBLIGATOIRE : sans lui, un enfant flex refuse de retrecir sous sa hauteur
   naturelle, le corps garde sa taille entiere et le pied repart hors cadre — le defaut qu'on vient de corriger.
   ⚠️ 100dvh A COTE DE 92vh : sur un telephone, vh ignore la barre d'adresse et la modale depasse malgre la
   borne. min() prend la plus severe des deux, et 32px laisse la marge du voile.
   AUCUN ACCENT GRAVE ICI : ce commentaire vit dans un litteral gabarit (piege TS1005 du depot). */
.rec{position:relative;max-width:680px;width:min(680px, 96vw);background:var(--color-svv-field);
  color:var(--color-svv-ink);border-radius:12px;padding:16px;box-shadow:0 12px 40px rgba(0,0,0,.28);
  display:flex;flex-direction:column;max-height:min(92vh, calc(100dvh - 32px));overflow:hidden}
.rec-corps{flex:1 1 auto;min-height:0;overflow-y:auto;overscroll-behavior:contain}

/* LA CROIX : 44 px de cible, en permanence, jamais au survol — au doigt, le survol n'existe pas. */
.rec-croix{position:absolute;top:8px;right:8px;display:inline-flex;align-items:center;justify-content:center;
  min-width:36px;min-height:36px;padding:0;font:inherit;font-size:1.4rem;line-height:1;color:var(--color-svv-muted);
  background:transparent;border:0;border-radius:50%;cursor:pointer}
.rec-croix:hover{background:color-mix(in srgb, var(--color-svv-ink) 8%, transparent);color:var(--color-svv-ink)}
.rec-croix:focus-visible{outline:2px solid var(--color-svv-red);outline-offset:1px}

.rec-dest{margin:0 0 .5rem;padding-right:2.2rem;font-size:.8rem;color:var(--color-svv-muted);
  overflow-wrap:anywhere}
.rec-interne-dabord{margin:0 0 .5rem;padding:6px 10px;border-radius:.5rem;font-size:.82rem;
  color:var(--color-svv-green-ink);background:var(--color-svv-green-soft)}

/* ══ LES CARTES : c'est elles qui donnent le relief, et qui separent les categories ═════════════════════════ */
.rec-carte{margin:0 0 10px;padding:10px 12px;background:var(--color-svv-surface);
  border:1px solid var(--color-svv-line);border-radius:.7rem;box-shadow:0 1px 3px rgba(0,0,0,.06);min-width:0}
.rec-carte-titre{margin:0 0 .4rem;font-size:.72rem;font-weight:700;letter-spacing:.04em;text-transform:uppercase;
  color:var(--color-svv-muted)}

.rec-barre{display:flex;flex-wrap:wrap;align-items:baseline;justify-content:space-between;gap:.5rem;
  margin:0 0 .4rem}
.rec-compte{margin:0;font-size:.8rem;color:var(--color-svv-muted)}
/* ══ 🔴🔴 LOT AUCUNE-PROPOSITION-ET-ANIMATION-INVERSE — LA PHRASE QUI REMPLACE LE COMPTEUR A ZERO ════════════════
   Elle prend toute la largeur (le lien « Selectionner tous les biens » n'est plus la pour partager la ligne) et
   se lit comme une consigne, pas comme une note de bas de page : meme taille que le reste de la carte, et la
   couleur du texte ordinaire plutot que le gris des compteurs. */
.rec-aucune{flex:1 1 100%;font-size:.84rem;line-height:1.45;color:var(--color-svv-ink)}
.rec-biens{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:6px;
  max-height:34vh;overflow-y:auto}
.rec-bien{padding:8px 10px;border:1px solid var(--color-svv-line);border-radius:.6rem}
/* CIBLE TACTILE : la ligne entiere est cliquable, et la case ne descend pas sous 44 px de hauteur totale. */
.rec-choix{display:flex;align-items:flex-start;gap:.5rem;min-height:32px;cursor:pointer}
.rec-bien-nom{font-weight:600;overflow-wrap:anywhere}
.rec-motif{margin:.2rem 0 0 1.6rem;font-size:.76rem;font-style:italic;color:var(--color-svv-muted)}
.rec-parties{list-style:none;margin:.2rem 0 0 1.6rem;padding:0;font-size:.78rem;color:var(--color-svv-muted)}
.rec-role{font-weight:700;font-size:.68rem;text-transform:uppercase;letter-spacing:.02em}

/* ══ LE MOTEUR DE RECHERCHE ════════════════════════════════════════════════════════════════════════════════ */
.rec-champ{display:flex;flex-direction:column;gap:.25rem;min-width:0}
/* LA LEGENDE EST AU-DESSUS DU CHAMP, jamais dedans : un texte d'aide qui disparait a la premiere lettre n'aide
   qu'avant qu'on en ait besoin. */
.rec-legende{font-size:.75rem;color:var(--color-svv-muted);line-height:1.35}
.rec-saisie{min-height:40px;padding:.35rem .55rem;font:inherit;font-size:.9rem;color:var(--color-svv-ink);
  background:var(--color-svv-surface);border:1px solid var(--color-svv-line-strong);border-radius:.45rem;
  min-width:0;width:100%}
.rec-saisie:focus-visible{outline:2px solid var(--color-svv-red);outline-offset:2px}
.rec-vide{margin:.4rem 0 0;font-size:.8rem;color:var(--color-svv-muted)}
/* DEFILEMENT INTERNE (demande d'Arno) : la recherche ne pousse jamais les propositions hors de l'ecran. */
.rec-resultats{margin-top:.4rem;max-height:30vh;overflow-y:auto}
.rec-groupe+.rec-groupe{margin-top:.5rem}
.rec-groupe-titre{margin:0 0 .25rem;font-size:.7rem;font-weight:700;letter-spacing:.04em;text-transform:uppercase;
  color:var(--color-svv-ink)}
.rec-lignes{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:2px}
.rec-ligne{border-radius:.45rem}
.rec-ligne:hover{background:var(--color-svv-field)}
/* 🔴🔴 LOT MODALE-RATTACHER-PROPRE — UN RESULTAT DEJA MONTRE EN HAUT. Il garde sa case (cocher ici ou la-haut
   revient au meme), mais il DIT qu'il n'est pas un second bien. Le liseret n'est qu'un renfort : c'est le MOT
   qui porte l'information, regle du module depuis la premiere capsule. */
.rec-ligne--deja{border-left:3px solid var(--color-svv-green-ink);background:var(--color-svv-green-soft)}
.rec-ligne-deja{font-size:.7rem;font-weight:700;text-transform:uppercase;letter-spacing:.02em;
  color:var(--color-svv-green-ink)}
.rec-ligne-choix{display:flex;align-items:flex-start;gap:.5rem;padding:5px 6px;min-height:40px;cursor:pointer;
  min-width:0}
.rec-ligne-corps{display:flex;flex-direction:column;gap:1px;min-width:0}
/* VALEURS FONCEES, LIBELLES GRIS (demande d'Arno) : la hierarchie se lit sans couleur supplementaire. */
.rec-ligne-titre{display:inline-flex;align-items:center;flex-wrap:wrap;font-size:.84rem;font-weight:600;
  color:var(--color-svv-ink);overflow-wrap:anywhere}
.rec-ligne-parties{font-size:.76rem;color:var(--color-svv-ink);overflow-wrap:anywhere}
.rec-ligne-role{font-weight:700;font-size:.66rem;text-transform:uppercase;letter-spacing:.03em;
  color:var(--color-svv-muted)}
.rec-ligne-sep{color:var(--color-svv-muted)}
.rec-ligne-motif{font-size:.72rem;font-style:italic;color:var(--color-svv-muted)}

.rec-note{font-size:.78rem;color:var(--color-svv-muted)}
/* 🔴 LE PIED NE DEFILE PAS : il est hors du corps, donc toujours visible — c'est tout l'objet du point 3. */
.rec-pied{display:flex;flex-wrap:wrap;justify-content:flex-end;gap:.5rem;margin-top:.8rem;flex:0 0 auto}
/* 🔴 LOT CLASSER-SUR-CHAQUE-MAIL — ce que l'appelant ajoute au pied (portee, « Hors gestion… ») : une carte de
   plus, du meme relief que les autres, pour qu'on la lise comme une zone et non comme un ajout. */
/* 🔴 LOT MODALE-SUIVI-ET-DEFILEMENT (point 1) — IL APPARAIT AU MOMENT DU CHANGEMENT, discretement.
   La meme apparition que le reste de la modale : une opacite et quelques pixels, jamais un surgissement.
   Il ne defile pas non plus : il porte une decision, au meme titre que le bouton juste en dessous. */
.rec-pied-sup{margin:0;padding:8px 10px;background:var(--color-svv-surface);border:1px solid var(--color-svv-line);
  border-radius:.7rem;min-width:0;flex:0 0 auto;animation:rec-parait .18s ease-out both}
@keyframes rec-parait{from{opacity:0;transform:translateY(-4px)}to{opacity:1;transform:none}}
@media (prefers-reduced-motion:reduce){.rec-pied-sup{animation:none}}
/* 🔴 LOT SUIVI-CONVERSATION — le motif qui dit pourquoi « Valider » attend. Il prend toute la largeur du pied
   pour se lire d'un coup, et le rouge n'est qu'un renfort : le MOT porte l'information. */
.rec-bloque{flex:1 1 100%;margin:0;font-size:.82rem;font-weight:600;color:var(--color-svv-red)}
@media (max-width:520px){
  .rec{width:100%;max-width:100%}
  .rec-pied>.svv-btn{flex:1 1 100%}
}
`;
