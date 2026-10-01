'use client';

import { useCallback, useEffect, useState } from 'react';
import { memeCibleBrouillon, type CibleBrouillon } from '../../../../lib/gestion/redaction';
import type { ContexteRedaction } from '../../../../lib/gestion/classementBien';
// 🔴 LE MOTEUR DE RECHERCHE DE BIENS, TEL QU'IL EXISTE : mêmes groupes, mêmes raisons, même route.
import { grouperResultats, messageAucunBien, motRaison } from '../../../../lib/gestion/rechercheBien';
import { ligneCompacteDuBien } from '../../../../lib/gestion/classementBoutons';
// 🔴 LOT CLASSER-SUR-CHAQUE-MAIL — la catégorie d'un lot, posée là où la nature est connue. Module PUR.
import { categorieDuBien, type CategorieBien } from '../../../../lib/gestion/categorieBien';
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
function precocher(c: ContexteRedaction, cibles: readonly CibleBrouillon[]): string[] {
  const dejaLa = cibles.filter((x) => x.sorte === 'lot').map((x) => x.cle ?? '');
  return [...new Set([...c.biens.filter((b) => b.recommande).map((b) => b.cle), ...dejaLa])];
}

export function RattacherEnEcrivant({
  destinataires, objet, corps, pieces, cibles, precharge = null, messageId = null,
  piedSupplementaire = null, onChange, onFerme,
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
  onChange: (c: CibleBrouillon[]) => void;
  onFerme: () => void;
}) {
  /**
   * 🔴 LA CLÉ DES DESTINATAIRES, calculée AVANT l'état : c'est elle qui décide si le pré-chargement vaut pour
   * cette ouverture-ci. Même forme des deux côtés (l'appelant la compose de la même liste, dans le même ordre).
   */
  const cle = messageId === null ? destinataires.join(',') : `message:${messageId}`;
  const pret = precharge !== null && precharge.cle === cle ? precharge.contexte : null;
  const [etat, setEtat] = useState<
    | { v: 'charge' }
    | { v: 'ok'; contexte: ContexteRedaction }
    | { v: 'erreur'; message: string }
  >(pret === null ? { v: 'charge' } : { v: 'ok', contexte: pret });
  /**
   * Les clés cochées. `null` = « pas encore décidé », et c'est ce qui permet de poser la PRÉ-COCHE une seule fois,
   * au chargement : la recalculer ferait recocher d'elle-même une case qu'on vient de décocher.
   */
  const [coches, setCoches] = useState<string[] | null>(
    // 🔴 LA PRÉ-COCHE EST POSÉE DÈS LE PREMIER RENDU quand les propositions sont déjà là : sans cela, la fenêtre
    //   s'ouvrirait avec les biens affichés mais aucune case cochée, puis les cases se cocheraient toutes seules
    //   sous les yeux — un mouvement qui se lit comme un défaut.
    pret === null ? null : precocher(pret, cibles),
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
      setCoches((prev) => prev ?? calcule);
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
  const selection = coches ?? [];
  const toutesCochees = tous.length > 0 && tous.every((b) => selection.includes(b.cle));

  const basculer = (c: string) => setCoches((l) => {
    const v = l ?? [];
    return v.includes(c) ? v.filter((x) => x !== c) : [...v, c];
  });

  /**
   * 🔴 « TOUT SÉLECTIONNER / TOUT DÉSÉLECTIONNER » EST UN SEUL BOUTON, qui bascule. Deux boutons séparés
   * laisseraient toujours l'un des deux sans effet, et il faudrait deviner lequel.
   */
  const toutBasculer = () => setCoches(toutesCochees ? [] : tous.map((b) => b.cle));

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
    const retenues: CibleBrouillon[] = selection
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
      <div className="mrt rec" role="dialog" aria-modal="true" aria-labelledby="rec-titre"
        onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); fermerSansRien(); } }}>
        {/* 🔴 LA CROIX EST UNE SORTIE NOMMÉE (demande d'Arno) : elle remplace le bouton « Ignorer » du pied, qui
            disait la même chose en prenant la place d'une décision. Rien n'est changé en sortant par elle. */}
        <button type="button" className="rec-croix" aria-label="Fermer sans rien changer"
          title="Fermer sans rien changer" onClick={fermerSansRien}>×</button>
        <h2 className="mrt-titre" id="rec-titre">Rattacher ce mail à…</h2>
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
              <p className="rec-compte" role="status">
                {tous.length === 0
                  ? 'Aucun bien ne se déduit de ces destinataires.'
                  : `${selection.length} bien(s) coché(s) sur ${tous.length} proposé(s).`}
              </p>
              {tous.length > 0 && (
                <button type="button" className="gst-lien-bouton" onClick={toutBasculer}>
                  {toutesCochees ? 'Tout désélectionner' : 'Tout sélectionner'}
                </button>
              )}
            </div>

            <ul className="rec-biens">
              {(contexte.biens ?? []).map((b) => (
                <li key={b.cle} className="rec-bien">
                  <label className="rec-choix">
                    <input type="checkbox" checked={selection.includes(b.cle)} onChange={() => basculer(b.cle)} />
                    <span className="rec-bien-nom">{b.libelle}</span>
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
              {horsPropositions.map(({ cible: a, origine }) => (
                <li key={`hors-${a.cle}`} className="rec-bien">
                  <label className="rec-choix">
                    <input type="checkbox" checked={selection.includes(a.cle ?? '')}
                      onChange={() => basculer(a.cle ?? '')} />
                    <span className="rec-bien-nom">{a.libelle}</span>
                  </label>
                  <p className="rec-motif">
                    {origine === 'recherche'
                      ? 'ajouté à la main depuis la recherche'
                      : 'déjà rattaché — décochez pour le retirer'}
                  </p>
                </li>
              ))}
            </ul>
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
            <input className="rec-saisie" type="search" value={saisie} autoComplete="off" maxLength={120}
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

          {recherche.v === 'ok' && recherche.resultats.lignes.length > 0 && (
            <div className="rec-resultats">
              {grouperResultats(recherche.resultats.lignes).map((g) => (
                <section key={g.sorte} className="rec-groupe">
                  {/* Les deux groupes titrés du moteur : « Par adresse », puis « Par nom ou coordonnée ». */}
                  <p className="rec-groupe-titre">{g.titre}</p>
                  <ul className="rec-lignes">
                    {g.biens.map((b) => (
                      <LigneBienCompacte key={b.cle} bien={b} coche={selection.includes(b.cle)}
                        onBasculer={() => basculerResultat(b)} />
                    ))}
                  </ul>
                </section>
              ))}
            </div>
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
        {piedSupplementaire !== null && <div className="rec-pied-sup">{piedSupplementaire}</div>}

        <div className="mrt-pied rec-pied">
          <button type="button" className="svv-btn svv-btn-primary gst-btn" onClick={valider}>
            {/* 🔴🔴 LOT CLASSER-SUR-CHAQUE-MAIL — LE VRAI NOMBRE, ET « aucun bien » À ZÉRO (demande d'Arno).
                Le bouton reste ACTIF à zéro : valider à vide est une décision — elle retire tous les
                rattachements et ramène les deux boutons, d'où l'on peut alors choisir « Interne ».
                ⚠️ `selection` NE COMPTE PLUS QUE DU VISIBLE : toute clé cochée a désormais sa case (voir
                l'encadré de `horsPropositions`). C'est ce qui fait que ce compte redescend à zéro. */}
            {selection.length === 0 ? 'Valider — aucun bien' : `Valider — ${selection.length} bien(s)`}
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
function LigneBienCompacte({ bien: b, coche, onBasculer }: {
  bien: BienTrouve; coche: boolean; onBasculer: () => void;
}) {
  const l = ligneCompacteDuBien(b);
  return (
    <li className="rec-ligne">
      <label className="rec-ligne-choix">
        <input type="checkbox" checked={coche} onChange={onBasculer} />
        <span className="rec-ligne-corps">
          <span className="rec-ligne-titre">{l.titre}</span>
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
.rec{position:relative;max-width:680px;width:min(680px, 96vw);background:var(--color-svv-field);
  color:var(--color-svv-ink);border-radius:12px;padding:16px;box-shadow:0 12px 40px rgba(0,0,0,.28);
  max-height:92vh;overflow-y:auto}

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
.rec-ligne-choix{display:flex;align-items:flex-start;gap:.5rem;padding:5px 6px;min-height:40px;cursor:pointer;
  min-width:0}
.rec-ligne-corps{display:flex;flex-direction:column;gap:1px;min-width:0}
/* VALEURS FONCEES, LIBELLES GRIS (demande d'Arno) : la hierarchie se lit sans couleur supplementaire. */
.rec-ligne-titre{font-size:.84rem;font-weight:600;color:var(--color-svv-ink);overflow-wrap:anywhere}
.rec-ligne-parties{font-size:.76rem;color:var(--color-svv-ink);overflow-wrap:anywhere}
.rec-ligne-role{font-weight:700;font-size:.66rem;text-transform:uppercase;letter-spacing:.03em;
  color:var(--color-svv-muted)}
.rec-ligne-sep{color:var(--color-svv-muted)}
.rec-ligne-motif{font-size:.72rem;font-style:italic;color:var(--color-svv-muted)}

.rec-note{font-size:.78rem;color:var(--color-svv-muted)}
.rec-pied{display:flex;flex-wrap:wrap;justify-content:flex-end;gap:.5rem;margin-top:.8rem}
/* 🔴 LOT CLASSER-SUR-CHAQUE-MAIL — ce que l'appelant ajoute au pied (portee, « Hors gestion… ») : une carte de
   plus, du meme relief que les autres, pour qu'on la lise comme une zone et non comme un ajout. */
.rec-pied-sup{margin:0;padding:8px 10px;background:var(--color-svv-surface);border:1px solid var(--color-svv-line);
  border-radius:.7rem;min-width:0}
@media (max-width:520px){
  .rec{width:100%;max-width:100%}
  .rec-pied>.svv-btn{flex:1 1 100%}
}
`;
