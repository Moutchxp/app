'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { memeCibleBrouillon, type CibleBrouillon } from '../../../../lib/gestion/redaction';
import type { ContexteRedaction } from '../../../../lib/gestion/classementBien';
// 🔴 LE MOTEUR DE RECHERCHE DE BIENS, TEL QU'IL EXISTE : mêmes groupes, mêmes raisons, même route.
// 🔴 LOT CLASSER-SUR-CHAQUE-MAIL — la catégorie d'un lot, posée là où la nature est connue. Module PUR.
import { categorieDuBien, type CategorieBien } from '../../../../lib/gestion/categorieBien';
// 🔴 LOT MODALE-RATTACHER-PROPRE — le titre d'un bien (sans numéro de lot) et la pastille « i ».
import { titresDistincts, unParCle } from '../../../../lib/gestion/titreBien';
import { CSS_INFO_BIEN } from './InfoBien';
// 🔴 LOT MODALE-SUIVI-ET-DEFILEMENT (point 2) — la pastille qui annonce le contenu en dessous d'une liste.
import { CSS_ZONE_DEFILANTE } from './ZoneDefilante';
/* 🔴🔴 LOT MOTEUR-RECHERCHE-BIENS-UNIFIE — les cartes et le moteur de recherche vivent dans LE composant partagé :
   « Modifier le rattachement » rend exactement le même. Cette fenêtre garde sa logique (brouillon, pré-coche). */
import { CSS_LISTE_BIENS, ListeBiensACocher, useRechercheBiens } from './ListeBiensACocher';
import type { BienTrouve } from '../../../../lib/gestion/rechercheBienRepo';

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
  destinataires, objet, corps, pieces, cibles, precharge = null, messageId = null, clesClients = null, clesDeBase = null, biensDesAdresses = [],
  piedSupplementaire = null, validationBloquee = null, selectionInitiale = null,
  onSelection, onChange, onFerme, integre = false,
}: {
  /**
   * ══ 🔴🔴 LOT FENETRE-CLASSEMENT-UNIQUE (Arno, 13/10/2026) — LE CONTENU, SANS SON CADRE ════════════════════════
   * Le composeur ouvre désormais LA fenêtre de « Modifier le rattachement » (`RattachementsDuFil`, mode brouillon),
   * et ce composant y devient son CONTENU : propositions « D'après le destinataire », recherche, « Valider ». Vrai ⇒
   * ni voile, ni cadre, ni titre, ni croix : ce sont ceux de la grande fenêtre. Faux (défaut) ⇒ exactement d'avant.
   */
  integre?: boolean;
  /**
   * 🔴 LOT RATTACHEMENT-BIENS-SUIT-LES-ADRESSES — les clés des biens dont un propriétaire ou un locataire est
   * destinataire. Un bien coché HORS de cet ensemble est dit « ajouté manuellement — aucun client de ce bien dans les
   * destinataires ». `null` (biens des adresses pas encore lus, ou mail reçu) ⇒ les mentions d'avant.
   */
  clesClients?: ReadonlySet<string> | null;
  /** Les biens de BASE (fiche ouverte, réponse héritée) : ils ne dépendent pas des adresses, jamais « manuels ». */
  clesDeBase?: ReadonlySet<string> | null;
  /**
   * ══ 🔴🔴 LOT MODALE-PROPOSITIONS-TOUJOURS-VISIBLES — TOUS LES BIENS DES ADRESSES PRÉSENTES ═══════════════════════════
   * Les adresses de À, Cc et Cci liées à des biens (clients, contacts du syndic, e-mail général, carnet de l'immeuble,
   * e-mails rattachés), dans l'ordre des champs, avec TOUS leurs biens — rattachés ou non. Chacun que le moteur ne
   * propose pas rejoint les propositions : coché s'il est déjà rattaché, DÉCOCHÉ sinon, avec son motif (« contact du
   * syndic, suit la copropriété de ce bien — … ») et les deux lignes propriétaire / locataire de sa fiche.
   * DÉFAUT D'ARNO (11/10/2026) : c.jullien@sansvisavis.com, 6 biens ; 1 coché et validé ; la modale rouverte ne montrait
   * plus que ce bien (« 1 bien(s) coché(s) sur 1 affiché(s) »). CAUSE : seuls les biens des adresses EN ATTENTE (aucun
   * bien rattaché) étaient transmis (lot PUCE-COHERENTE-AVEC-RATTACHEMENT-TOUTES-FAMILLES) ; une adresse dont un bien
   * était choisi n'attendait plus, et ses 5 autres biens disparaissaient.
   */
  biensDesAdresses?: ReadonlyArray<{
    adresse: string;
    biens: ReadonlyArray<{ cle: string; lotId: number; libelle: string; categorie?: CategorieBien; motif: string }>;
  }>;
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
  /* 🔴 LOT MOTEUR-RECHERCHE-BIENS-UNIFIE — la recherche différée (250 ms, deux caractères) est le crochet partagé. */
  const recherche = useRechercheBiens(saisie);
  /** Les biens ajoutés à la main : ils ne viennent pas du moteur, mais ils se cochent et se valident pareil. */
  const [ajoutes, setAjoutes] = useState<CibleBrouillon[]>([]);
  /**
   * 🔴 LOT PROPOSITIONS-PAR-LE-CONTENU — LES BIENS AU-DELÀ DU CINQUIÈME. Ils sont dans la liste (ils se cochent,
   * ils se valident) mais rangés derrière un lien tant qu'on ne les demande pas.
   *
   * ⚠️ DÉCLARÉ ICI, AVEC LES AUTRES ÉTATS (lot URGENT-VERIF-SUIVI-ET-76-BIENS) : `proposesAffiches` en dépend, et
   * il se calcule bien avant le rendu. Un crochet déclaré plus bas serait lu après son premier usage.
   */
  const [autresDeplies, setAutresDeplies] = useState(false);
  /**
   * ══ 🔴🔴 LOT MODALE-BIEN-DEJA-RATTACHE-PARTIES — CE QU'ON SAIT D'UN BIEN DÉJÀ RATTACHÉ ══════════════════════════════
   * Un bien déjà rattaché (ou ajouté à la main) que le moteur ne propose pas n'arrive ici qu'avec sa clé et son
   * libellé. Sa fiche est lue — LECTURE SEULE, par la route que la pastille « i » emploie déjà
   * (`/annuaire?lotCle=`) — pour lui donner le même titre et les mêmes deux lignes de parties que les autres cartes.
   */
  const [fiches, setFiches] = useState<Record<string, FicheCourte>>({});
  const fichesDemandees = useRef(new Set<string>());
  /**
   * Les biens EN ATTENTE, figés à l'ouverture (la liste ne bouge pas sous le doigt pendant qu'on coche) : chaque bien
   * une fois, dans l'ordre des adresses.
   */
  const [desAdresses] = useState(() => {
    const out: Array<{ cle: string; id: number; libelle: string; categorie?: CategorieBien; motif: string; rang: number }> = [];
    for (const [rang, c] of biensDesAdresses.entries()) {
      for (const b of c.biens) {
        if (!out.some((x) => x.cle === b.cle)) out.push({ cle: b.cle, id: b.lotId, libelle: b.libelle, categorie: b.categorie, motif: b.motif, rang });
      }
    }
    return out;
  });

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

  /**
   * ══ 🔴🔴 LOT URGENT-VERIF-SUIVI-ET-76-BIENS — LES PROPOSITIONS RÉELLEMENT À L'ÉCRAN ═══════════════════════════
   *
   * 🔴 UNE SEULE LISTE POUR DEUX USAGES, ET C'EST TOUT L'OBJET DE CETTE LIGNE : elle est rendue par la liste du
   * haut ET comptée par le compteur. Avant ce lot, le rendu filtrait les repliés et le compte ne les filtrait
   * pas — d'où « sur 76 affiché(s) » avec cinq lignes à l'écran, et un « Sélectionner tous les biens » qui en
   * cochait 71 que personne n'avait vus.
   *
   * ⚠️ UN BIEN REPLIÉ MAIS **COCHÉ** RESTE AFFICHÉ, et il le faut : on peut déplier, cocher, puis replier. Le
   * cacher le laisserait coché sans case — c'est exactement le défaut « le compteur reste bloqué à 1 » que le lot
   * CLASSER-SUR-CHAQUE-MAIL a payé une fois. Ce qui est coché est visible, toujours.
   */
  const proposesAffiches = (contexte?.biens ?? []).filter(
    (b) => b.replie !== true || autresDeplies || (coches?.has(b.cle) ?? false)
      // LOT MODALE-PROPOSITIONS-TOUJOURS-VISIBLES — un bien d'une adresse présente n'est jamais replié.
      || desAdresses.some((x) => x.cle === b.cle));
  /** Les biens montrés SOUS les propositions : trouvés à la recherche, ou déjà rattachés et non proposés. */
  const horsPropositions: { cible: CibleBrouillon; origine: 'recherche' | 'deja' | 'attente'; motif?: string }[] = [
    ...ajoutes.filter((a) => !clesProposees.has(a.cle ?? ''))
      .map((a) => ({ cible: a, origine: 'recherche' as const })),
    ...cibles
      .filter((c) => c.sorte === 'lot'
        && !clesProposees.has(c.cle ?? '')
        && !ajoutes.some((a) => (a.cle ?? '') === (c.cle ?? '')))
      .map((c) => ({ cible: c, origine: 'deja' as const })),
    // LOT MODALE-PROPOSITIONS-TOUJOURS-VISIBLES — les biens des adresses présentes que le moteur ne propose pas.
    ...desAdresses
      .filter((b) => !clesProposees.has(b.cle)
        && !ajoutes.some((a) => (a.cle ?? '') === b.cle)
        && !cibles.some((c) => c.sorte === 'lot' && (c.cle ?? '') === b.cle))
      .map((b) => ({
        cible: { sorte: 'lot' as const, cle: b.cle, id: b.id, libelle: b.libelle, ...(b.categorie ? { categorie: b.categorie } : {}) },
        origine: 'attente' as const, motif: b.motif,
      })),
  ];
  /**
   * Tous les biens montrés : ceux du moteur, puis les autres. C'est la liste que le compteur compte.
   *
   * ══ 🔴🔴 LOT URGENT-VERIF-SUIVI-ET-76-BIENS — « MONTRÉS » VEUT DIRE **À L'ÉCRAN**, PAS « DANS LA RÉPONSE » ═══
   *
   * CONSTAT D'ARNO (02/10/2026) : « Valider ne doit jamais partir sur des dizaines de biens sans geste
   * explicite. »
   *
   * 🔴 LE DÉFAUT EXACT, trouvé en relisant ce fichier. Les biens repliés derrière « voir les autres » entraient
   * dans cette liste comme les autres. Trois conséquences, toutes fausses :
   *   ① le compteur annonçait « sur 76 affiché(s) » alors que CINQ étaient à l'écran ;
   *   ② « Sélectionner tous les biens » en cochait 76, dont 71 que personne n'avait vus ;
   *   ③ et le mot « VISIBLE », écrit en toutes lettres au lot MODALE-RATTACHER-PROPRE (« ce qui n'est pas à
   *      l'écran n'est pas touché »), était démenti par le code juste en dessous.
   *
   * ⚠️ LES BIENS REPLIÉS NE SONT PAS PERDUS : ils sont à un clic (« voir les autres »), et dès qu'on déplie ils
   * reviennent dans cette liste — compteur et bascule compris. C'est `autresDeplies` qui le dit.
   *
   * ⚠️ `horsPropositions` N'EST JAMAIS REPLIÉ : ce sont les biens DÉJÀ rattachés et ceux qu'on vient de trouver à
   * la recherche. Les cacher ferait exactement le défaut que ce bloc répare — une case cochée sans case.
   */
  const clesHors = horsPropositions.map((x) => x.cible.cle ?? '').filter((c) => c !== '');
  /**
   * ══ 🔴🔴 LOT MODALE-PROPOSITIONS-TOUJOURS-VISIBLES — L'ORDRE D'AFFICHAGE ══════════════════════════════════════════
   * Les biens COCHÉS en tête, puis les autres, regroupés par adresse (dans l'ordre des champs), puis ce que le moteur
   * propose d'autre. « Cochés » = cochés À L'OUVERTURE (pré-coche comprise) : un bien qu'on coche ou décoche ensuite
   * ne saute pas sous le doigt.
   */
  const cochesALOuverture = useRef<ReadonlySet<string> | null>(null);
  if (cochesALOuverture.current === null && coches !== null) cochesALOuverture.current = new Set(coches);
  const rangAdresse = (cle: string): number => desAdresses.find((x) => x.cle === cle)?.rang ?? biensDesAdresses.length;
  const lignesAffichees: Array<{ cle: string; moteur: (typeof proposesAffiches)[number] } | { cle: string; hors: (typeof horsPropositions)[number] }> = [
    ...proposesAffiches.map((b) => ({ cle: b.cle, moteur: b })),
    ...horsPropositions.map((h) => ({ cle: h.cible.cle ?? '', hors: h })),
  ].map((l, i) => ({ l, i, coche: (cochesALOuverture.current?.has(l.cle) ?? false) ? 0 : 1, rang: rangAdresse(l.cle) }))
    .sort((x, y) => x.coche - y.coche || x.rang - y.rang || x.i - y.i)
    .map((x) => x.l);
  useEffect(() => {
    /* ⚠️ AUCUNE GARDE « vivant » : en mode strict, React monte, démonte puis remonte l'effet — la garde jetait la
       SEULE réponse (la clé, déjà demandée, n'était jamais relue) : la carte restait sans parties (mesuré dans
       Chrome). Poser un état après démontage est sans effet en React 19. */
    for (const c of clesHors.filter((x) => !fichesDemandees.current.has(x))) {
      fichesDemandees.current.add(c);
      void (async () => {
        try {
          const res = await fetch(`/api/admin/gestion/annuaire?lotCle=${encodeURIComponent(c)}`, { cache: 'no-store' });
          const d = (await res.json()) as { etat?: string; data?: Record<string, unknown> };
          if (!res.ok || d.etat !== 'ok' || d.data === undefined) { fichesDemandees.current.delete(c); return; }
          const f = ficheCourte(d.data);
          setFiches((m) => ({ ...m, [c]: f }));
        } catch { fichesDemandees.current.delete(c); }
      })();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- la liste des clés suffit.
  }, [clesHors.join(',')]);
  const tous: { cle: string; libelle: string }[] = [
    ...proposesAffiches.map((b) => ({ cle: b.cle, libelle: b.libelle })),
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
    ...horsPropositions.map((x) => {
      // 🔴 LOT MODALE-BIEN-DEJA-RATTACHE-PARTIES — la fiche lue donne le titre habituel (adresse — nature · type).
      const f = fiches[x.cible.cle ?? ''];
      return f === undefined
        ? { cle: x.cible.cle ?? '', adresse: x.cible.libelle, nature: null, typeBien: null, immeuble: null as string | null }
        : { cle: x.cible.cle ?? '', adresse: [f.adresse ?? '', f.commune ?? ''].filter((y) => y.trim() !== '').join(', '),
          nature: f.nature, typeBien: f.typeBien, immeuble: null as string | null };
    }),
    ...(recherche.v === 'ok' ? recherche.resultats.lignes : []).map((b) => ({
      cle: b.cle, adresse: [b.adresseVoie ?? '', b.commune ?? ''].filter((x) => x.trim() !== '').join(', '),
      nature: b.nature, typeBien: b.typeBien, immeuble: null as string | null,
    })),
  ];
  /* ⚠️ UN BIEN = UNE ENTRÉE (lot PROPOSITIONS-MEME-PROPRIETAIRE) : un bien proposé ET trouvé à la recherche serait
     compté comme son propre homonyme, et son titre prendrait à tort « · lot N ». */
  const parTitre = new Map(titresDistincts(unParCle(pourTitres.filter((b) => b.cle !== ''))).map((x) => [x.cle, x.titre]));
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
   * ⚠️ `autresDeplies` EST DÉCLARÉ PLUS HAUT (avec les autres états), parce que `proposesAffiches` en dépend et
   * qu'il se calcule avant le rendu. Il vivait ici ; l'ordre des crochets reste le même à chaque rendu, ce qui
   * est la seule chose que React exige.
   */
  const replies = (contexte?.biens ?? []).filter((b) => b.replie && !desAdresses.some((x) => x.cle === b.cle)).length;

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
  /**
   * ══ 🔴🔴 LOT RATTACHEMENT-VALIDER-TOUS-PERD-DES-BIENS — COCHER EN MASSE, C'EST COCHER ═══════════════════════════
   * BUG D'ARNO (11/10/2026) : 1 bien coché à la main, puis « Sélectionner tous les biens » sur 6 résultats de recherche,
   * puis « Valider — 6 bien(s) » ⇒ « Rattaché — 1 logement ». CAUSE : ce lien cochait les résultats de recherche
   * (leurs CLÉS) sans les ranger dans `ajoutes`, comme le fait le clic case par case (`basculerResultat`) ; à la
   * validation, une clé cochée qu'on ne savait pas décrire était ÉCARTÉE en silence (`filter(parCle.has)`).
   * Désormais le lien range les résultats qu'il coche, exactement comme la case ; la validation sait aussi décrire un
   * résultat affiché ; et un écart restant est DIT (`erreurValidation`), jamais avalé.
   */
  const toutBasculer = () => {
    const visibles = clesVisibles();
    const tousCoches = visibles.every((c) => selection.has(c));
    if (!tousCoches && recherche.v === 'ok') {
      const aRanger = recherche.resultats.lignes.filter((b) => !selection.has(b.cle));
      for (const b of aRanger) rangerResultat(b);
    }
    setCoches((l) => {
      const v = new Set(l ?? []);
      if (tousCoches) for (const c of visibles) v.delete(c);
      else for (const c of visibles) v.add(c);
      return v;
    });
  };

  /**
   * 🔴 UN RÉSULTAT COCHÉ REJOINT LA LISTE DU HAUT, et le compteur bouge. Demande d'Arno, mot pour mot. Il entre
   * donc dans `ajoutes` — la même liste que les biens trouvés à la main avant ce lot — et se coche d'office :
   * on ne coche pas un résultat pour ne pas le prendre.
   *
   * ⚠️ DÉCOCHER UN RÉSULTAT NE LE RETIRE PAS DE LA LISTE : il reste visible, décoché, comme une proposition.
   * L'effacer ferait disparaître sous le doigt la ligne qu'on vient de toucher.
   */
  /** Un résultat de recherche devient une cible connue de cette fenêtre (une fois). Partagé : case ET « tous ». */
  const cibleDuResultat = (b: BienTrouve): CibleBrouillon => ({
    // 🔴 LOT CLASSER-SUR-CHAQUE-MAIL — LA CATÉGORIE EST POSÉE ICI, là où la nature du lot est connue. L'écran
    //   qui affichera la case verte, lui, ne connaît ni l'annuaire ni les natures : il place et peint.
    sorte: 'lot', cle: b.cle, id: null, libelle: b.libelle,
    categorie: categorieDuBien({ nature: b.nature, typeBien: b.typeBien }),
  });
  const rangerResultat = (b: BienTrouve): void => {
    const n = cibleDuResultat(b);
    if ((contexte?.biens ?? []).some((x) => x.cle === b.cle)) return;
    setAjoutes((a) => (a.some((x) => memeCibleBrouillon(x, n)) ? a : [...a, n]));
  };
  const basculerResultat = (b: BienTrouve) => {
    rangerResultat(b);
    basculer(b.cle);
  };
  const [erreurValidation, setErreurValidation] = useState<string | null>(null);

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
    // LOT PUCE-COHERENTE-AVEC-RATTACHEMENT-TOUTES-FAMILLES — un bien en attente coché se décrit aussi.
    for (const b of desAdresses) if (!parCle.has(b.cle)) parCle.set(b.cle, { libelle: b.libelle, id: b.id, categorie: b.categorie });
    // 🔴 LOT RATTACHEMENT-VALIDER-TOUS-PERD-DES-BIENS — un résultat de recherche AFFICHÉ et coché se décrit aussi.
    for (const b of recherche.v === 'ok' ? recherche.resultats.lignes : []) {
      if (!parCle.has(b.cle)) { const n = cibleDuResultat(b); parCle.set(b.cle, { libelle: n.libelle, id: null, categorie: n.categorie }); }
    }
    // 🔴 LE GARDE-FOU : « Valider — N bien(s) » rattache EXACTEMENT les N biens cochés, ou le DIT et ne ferme pas.
    const manquants = [...selection].filter((c) => !parCle.has(c));
    if (manquants.length > 0) {
      setErreurValidation(`${manquants.length} bien(s) coché(s) n’ont pas pu être retenus (lot${manquants.length > 1 ? 's' : ''} `
        + `${manquants.join(', ')}) : rien n’a été validé. Relancez la recherche puis validez à nouveau.`);
      return;
    }
    setErreurValidation(null);
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

  const contenu = (
    <>
      {/* 🔴 LOT MODALE-RATTACHER-PROPRE — la feuille de la pastille « i » : la modale vit au-dessus de tout, et
          ne peut compter sur aucune feuille montée par l'écran qui l'ouvre. */}
      <style>{CSS_INFO_BIEN}</style>
      <style>{CSS_ZONE_DEFILANTE}</style>
      <style>{CSS_LISTE_BIENS}</style>
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

        {/* ══ 🔴🔴 LOT MOTEUR-RECHERCHE-BIENS-UNIFIE — LES DEUX CARTES SONT LE COMPOSANT PARTAGÉ ═════════════════════
            « Propositions » (compteur, « Sélectionner tous », cases, « i », parties, motif, « voir les autres ») puis
            « Moteur de recherche ». Les lignes sont celles de `lignesAffichees` — cochés en tête, puis par adresse —
            et le motif de chacune est décidé ICI, parce que lui seul dépend de ce que la fenêtre sait du brouillon. */}
        {/* ⚠️ UN SEUL ÉLÉMENT, TOUJOURS RENDU : pendant la lecture, seule la recherche est montrée (comme avant ce
            lot), et le champ ne doit pas être remonté — on perdrait le curseur — quand les propositions arrivent. */}
        {(
          <ListeBiensACocher afficherPropositions={contexte?.disponible === true}
            lignes={lignesAffichees.map((l) => {
              if ('moteur' in l) return { cle: l.cle, parties: l.moteur.parties, motif: l.moteur.motif };
              const { cible: a, origine, motif } = l.hors;
              const c = a.cle ?? '';
              return {
                cle: c,
                // 🔴 LOT MODALE-BIEN-DEJA-RATTACHE-PARTIES — les parties dès que la fiche est lue.
                parties: fiches[c]?.parties ?? null,
                motif: origine === 'attente'
                  ? (motif ?? '')
                  : clesClients !== null && !clesClients.has(c) && !(clesDeBase?.has(c) ?? false)
                    ? 'ajouté manuellement — aucun client de ce bien dans les destinataires'
                    : origine === 'recherche'
                      ? 'ajouté à la main depuis la recherche'
                      : 'déjà rattaché — décochez pour le retirer',
              };
            })}
            titre={titre} selection={selection} onBasculer={basculer}
            clesVisibles={clesVisibles()} toutesCochees={toutesCochees} onToutBasculer={toutBasculer}
            replies={replies} autresDeplies={autresDeplies} onBasculerAutres={() => setAutresDeplies((v) => !v)}
            saisie={saisie} onSaisie={setSaisie} champ={champRecherche} recherche={recherche}
            clesEnHaut={clesEnHaut} onBasculerResultat={basculerResultat} />
        )}

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
          {erreurValidation !== null && <p className="rec-bloque" role="alert">{erreurValidation}</p>}
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
    </>
  );

  /* 🔴 LOT FENETRE-CLASSEMENT-UNIQUE — dans la grande fenêtre : le contenu seul, en colonne (corps défilant, pied fixe). */
  if (integre) {
    return (
      <div className="rec rec--integre"
        onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); fermerSansRien(); } }}>
        <style>{CSS_RATTACHER_EN_ECRIVANT}</style>
        {contenu}
      </div>
    );
  }

  return (
    <div className="mrt-voile rec-voile" role="presentation"
      onClick={(e) => { if (e.target === e.currentTarget) fermerSansRien(); }}>
      <style>{CSS_RATTACHER_EN_ECRIVANT}</style>
      <div className="mrt rec" role="dialog" aria-modal="true" aria-labelledby="rec-titre"
        onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); fermerSansRien(); } }}>
        {/* 🔴 LA CROIX EST UNE SORTIE NOMMÉE (demande d'Arno) : elle remplace le bouton « Ignorer » du pied, qui
            disait la même chose en prenant la place d'une décision. Rien n'est changé en sortant par elle. */}
        <button type="button" className="rec-croix" aria-label="Fermer sans rien changer"
          title="Fermer sans rien changer" onClick={fermerSansRien}>×</button>
        <h2 className="mrt-titre" id="rec-titre">Rattacher ce mail à…</h2>
        {contenu}
      </div>
    </div>
  );
}

/** Ce que la fenêtre retient de la fiche d'un bien déjà rattaché : son titre et ses parties d'aujourd'hui. */
interface FicheCourte {
  adresse: string | null; commune: string | null; nature: string | null; typeBien: string | null;
  parties: { role: 'proprietaire' | 'locataire'; nom: string }[];
}
/** La fiche de l'annuaire → ce qu'il faut à la carte : propriétaires non archivés, occupants actuels. PUR. */
export function ficheCourte(d: Record<string, unknown>): FicheCourte {
  const texte = (x: unknown): string | null => (typeof x === 'string' && x.trim() !== '' ? x : null);
  const personnes = (x: unknown) => (Array.isArray(x) ? x : []) as Array<{ nom?: unknown; prenom?: unknown; archive?: unknown }>;
  const nom = (p: { nom?: unknown; prenom?: unknown }) => [texte(p.nom) ?? '', texte(p.prenom) ?? ''].filter((y) => y !== '').join(' ');
  return {
    adresse: texte(d.adresse), commune: texte(d.commune), nature: texte(d.nature), typeBien: texte(d.typeBien),
    parties: [
      ...personnes(d.proprietaires).filter((p) => p.archive !== true).map((p) => ({ role: 'proprietaire' as const, nom: nom(p) })),
      ...personnes(d.occupants).filter((p) => p.archive !== true).map((p) => ({ role: 'locataire' as const, nom: nom(p) })),
    ].filter((p) => p.nom !== ''),
  };
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

/* ══ 🔴 LOT MOTEUR-RECHERCHE-BIENS-UNIFIE — LES CARTES, LE COMPTEUR, LES LIGNES ET LE MOTEUR DE RECHERCHE ONT
   DEMENAGE dans CSS_LISTE_BIENS (ListeBiensACocher.tsx), sans retouche : la fenetre « Modifier le rattachement »
   monte la meme feuille, ce qui la rend identique a celle-ci. Ne restent ici que le voile, le cadre et le pied. */
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
/* LOT FENETRE-CLASSEMENT-UNIQUE : le contenu pose dans la grande fenetre — ni cadre ni ombre, il prend la place qui
   reste ; le corps defile, le pied « Valider » reste visible. */
.rec.rec--integre{max-width:none;width:auto;background:transparent;box-shadow:none;border-radius:0;padding:0;
  max-height:none;flex:1 1 auto;min-height:0}
@media (max-width:520px){
  .rec{width:100%;max-width:100%}
  .rec-pied>.svv-btn{flex:1 1 100%}
}
`;
