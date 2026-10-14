'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { planClassement } from '../../../../lib/gestion/gesteClassement';
/* 🔴🔴 LOT MOTEUR-RECHERCHE-BIENS-UNIFIE — LE SEUL COMPOSANT DE CHOIX DE BIENS : celui de « Rattacher ce mail à… ».
   Les grandes cartes à deux colonnes (pastille de certitude, blocs e-mail + Copier, ligne récapitulative) sont
   supprimées, sur décision d'Arno. Seule différence admise : les locataires à la date du mail. */
import { CSS_LISTE_BIENS, ListeBiensACocher, useRechercheBiens } from './ListeBiensACocher';
import { CSS_INFO_BIEN } from './InfoBien';
import { CSS_ZONE_DEFILANTE } from './ZoneDefilante';
import { titresDistincts, unParCle } from '../../../../lib/gestion/titreBien';
/* 🔴🔴 LOT VISUALISER-MAIL-ET-REPERE-FENETRE — le motif qui fait d'un lien un AJOUT PONCTUEL. Voir son encadré. */
import { MOTIF_AJOUT_PONCTUEL } from '../../../../lib/gestion/ficheRattachement';
import type { BienProposable, ContexteClassement } from '../../../../lib/gestion/classementBien';
import type { BienTrouve } from '../../../../lib/gestion/rechercheBienRepo';
import type { ExpediteurDuMail } from '../../../../lib/gestion/expediteurDuMail';

/**
 * 🔴 LOT BIEN-RATTACHE — LE MENU DE RATTACHEMENT À UN BIEN, UNE SEULE ENTRÉE.
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * 🔴 CE QU'IL FUSIONNE, ET POURQUOI. Il y avait DEUX portes pour la même question : le bloc des propositions, ouvert
 * en permanence, et « + Rattacher à… », qui dépliait un autre sélecteur ailleurs dans la page. On cochait dans l'un,
 * on validait dans l'autre, et l'on ne savait plus lequel comptait. Demande d'Arno : une seule entrée, un seul
 * menu, une seule validation.
 *
 * L'ORDRE DU MENU EST CELUI DE LA CONFIANCE :
 *   ① LES PROPOSITIONS DE L'AUTOMATISATION, en haut, avec leur fiche complète (bien, propriétaire, locataire à la
 *      date du mail, certitude, motif, pré-coche). Aucune proposition ⇒ la zone ne s'affiche pas du tout.
 *   ② LA RECHERCHE LIBRE, en dessous, pour ajouter ce que l'automatisation n'a pas vu. Ses résultats sont rangés
 *      en DEUX GROUPES TITRÉS : « Par adresse », puis « Par nom ou coordonnée ».
 *   ③ UNE SEULE VALIDATION pour les deux zones, avec la portée et « Hors gestion ».
 *
 * 🔴 LES RÉSULTATS DE RECHERCHE SONT DES BIENS, JAMAIS DES PERSONNES. Chercher « MARTY » rend SES biens. Et un bien
 * déjà présent dans les propositions n'est pas répété plus bas : la même ligne deux fois, avec deux cases, c'est
 * une case qu'on oublie de cocher.
 *
 * 🔴 RIEN N'EST ÉCRIT AVANT « Rattacher ». Ouvrir, chercher, cocher, décocher, refermer : aucune écriture.
 *
 * ⚠️ AUCUN IMPORT QUI TIRE `pg` : les types passent par `import type`, effacés à la compilation.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */
export function MenuRattachementBien({
  messageId, filId, onFerme, onGeste, onChange, onHorsGestion, ponctuel = false,
  preCoches = null, pied, onValider, motValider, validationBloquee = null, onSelection, libellesConnus,
  aussiAValider = false,
  cochesImposees, onCochesChange, sansBoutons = false, propositionsElargies = false, propositionsRepliables = false,
  titrePropositions,
  expediteurMail = null, trameCochee = false,
}: {
  /** 🔴 LOT PILULE-ROUGE-MAISON-EXPEDITEUR-UNIQUE-TRAME-VERTE — l'expéditeur du mail affiché (cartouche nommé). */
  expediteurMail?: ExpediteurDuMail | null;
  /** 🔴 MÊME LOT — trame verte sur les cartes cochées (propositions et résultats). */
  trameCochee?: boolean;
  /** 🔴 LOT GLISSIERE-PILULE — le bloc « Propositions » porte la croix qui le replie (« Modifier le rattachement »). */
  propositionsRepliables?: boolean;
  /** 🔴 LOT TITRE-PROPOSITIONS-DYNAMIQUE — le titre du bloc « Propositions », décidé par la fenêtre. Absent ⇒ inchangé. */
  titrePropositions?: string;
  /**
   * 🔴 LOT PROPOSITIONS-MEME-PROPRIETAIRE — « Modifier le rattachement » : les propositions élargies (autres biens du
   * propriétaire des biens rattachés, biens des adresses du mail). Absent ⇒ les propositions du moteur seules.
   */
  propositionsElargies?: boolean;
  /**
   * 🔴 LOT MODALE-MODIFIER-RATTACHEMENT-4-POSITIONS — la rangée « Valider / Annuler » n'est pas rendue : la fenêtre
   * appelante valide elle-même, par sa glissière et son bouton final (posés dans `pied`). Absent ⇒ comme avant.
   */
  sansBoutons?: boolean;
  messageId: number;
  filId: number | null;
  onFerme: () => void;
  onGeste?: (message: string) => void;
  onChange: () => void | Promise<void>;
  /**
   * Ouvre LA fenêtre de classement, qui porte « Hors gestion » et le classement par pièce.
   *
   * ⚠️ FACULTATIF DEPUIS LE LOT VISUALISER-UNIFIE-ET-BROUILLON-EN-HAUT : la fenêtre « Visualiser / Modifier »
   * n'a pas de seconde boîte à ouvrir par-dessus elle-même, et un bouton qui se contenterait de refermer le
   * panneau serait un bouton qui ment. Absent ⇒ il n'est pas rendu du tout.
   */
  onHorsGestion?: () => void;
  /* ══ 🔴🔴 LOT VISUALISER-UNIFIE-ET-BROUILLON-EN-HAUT, POINT 2 — LE MENU DEVIENT UN SÉLECTEUR ════════════════
     La fenêtre « Visualiser / Modifier » a besoin des DEUX zones d'Arno (« a) les propositions automatiques […]
     b) le moteur de recherche ») mais écrit, elle, par une tout autre porte : une EXCEPTION de suivi, en un seul
     appel. Les cinq options ci-dessous permettent de réemployer ce menu tel quel plutôt que d'en recopier une
     seconde version — ce qui aurait donné, un jour, deux listes de propositions qui ne disent pas la même chose.

     ⚠️ TOUTES ABSENTES ⇒ COMPORTEMENT D'AVANT CE LOT, À LA LIGNE PRÈS : pré-coche du moteur, fieldset de portée,
     écriture lien par lien par ce composant. */

  /**
   * 🔴 LA PRÉ-COCHE IMPOSÉE. `null` = celle du moteur (les biens recommandés), comme avant ce lot. Une liste =
   * exactement ces biens-là, et c'est ce que demande Arno pour la fenêtre : « propositions décochées, SAUF les
   * biens déjà rattachés, qui sont cochés ».
   */
  preCoches?: readonly string[] | null;
  /** Ce qui remplace le choix de portée, au-dessus des boutons : l'encadré d'exception, ou le bloc de suivi. */
  pied?: React.ReactNode;
  /**
   * 🔴🔴 QUI ÉCRIT. Donné, ce menu N'ÉCRIT PLUS RIEN lui-même : il rend la sélection, et l'appelant décide. C'est
   * la règle de la maison appliquée à l'envers du lot BIEN-RATTACHE — un seul geste, une seule implémentation :
   * ici, la règle de suivi vit dans la fenêtre et sa route, pas dans un menu de sélection.
   */
  onValider?: (biens: readonly { cle: string; libelle: string }[]) => Promise<void>;
  /**
   * Les libellés des biens que l'appelant a pré-cochés. Sans eux, un bien déjà rattaché mais absent des
   * propositions ET des résultats de recherche repartirait avec sa CLÉ pour nom — illisible trois mois plus tard
   * dans une période.
   */
  libellesConnus?: Readonly<Record<string, string>>;
  /**
   * ══ 🔴🔴 LOT FENETRE-BIENS-CARTES-ET-RACCOURCIS, POINT 3 — LA SÉLECTION EST TENUE PAR L'APPELANT ══════════════
   *
   * DEMANDE D'ARNO (03/10/2026) : « supprime la zone “Bien(s) déjà rattaché(s) à ce mail” du panneau : elle
   * répète les cartes du haut. À la place, chaque CARTE de bien du haut reçoit une CASE, cochée par défaut. »
   *
   * 🔴 LA CONSÉQUENCE EST STRUCTURELLE : la sélection ne peut plus vivre dans ce menu, puisqu'elle se coche en
   * DEHORS de lui. Donnée, elle est commandée par l'appelant ; absente, le menu garde la sienne et se comporte
   * exactement comme avant ce lot (c'est le cas de la modale « Rattacher ce mail à… »).
   *
   * ⚠️ UNE SEULE VÉRITÉ : quand l'appelant commande, le menu n'en garde AUCUNE copie. Deux états pour une
   * sélection, c'est une case qui se décoche toute seule au rendu suivant.
   */
  cochesImposees?: readonly string[];
  onCochesChange?: (cles: readonly string[], libelles?: Record<string, string>) => void;
  /** Le mot du bouton, quand ce n'est plus « Rattacher ». */
  motValider?: string;
  /** Un motif non nul BLOQUE la validation et s'affiche : c'est la confirmation de « Toute la conversation ». */
  validationBloquee?: string | null;
  /**
   * 🔴🔴 LOT CLASSER-PAR-LA-MODALE, POINT 3 — L'APPELANT A QUELQUE CHOSE À ÉCRIRE QUE CE MENU NE VOIT PAS.
   *
   * La fenêtre « Bien(s) rattaché(s) à ce mail » porte désormais, dans son pied, un événement à lier ou à créer.
   * Ce menu ne connaît que les BIENS : sans cette propriété, il grisait « Valider le suivi » parce que la
   * sélection de biens n'avait pas bougé — et l'événement devenait impossible à poser seul.
   *
   * ⚠️ `false`/absent ⇒ LE MENU EST EXACTEMENT CELUI D'AVANT : c'est la sélection de biens, et elle seule, qui
   * décide s'il y a quelque chose à valider.
   */
  aussiAValider?: boolean;
  /** La sélection en cours, remontée à chaque changement — l'appelant en tire sa phrase et ses alertes. */
  onSelection?: (cles: readonly string[], libelles?: Record<string, string>) => void;
  /**
   * ══ 🔴🔴 LOT VISUALISER-MAIL-ET-REPERE-FENETRE — L'AJOUT PONCTUEL ══════════════════════════════════════════
   *
   * RÈGLE D'ARNO (03/10/2026) : « un bouton “+ Ajouter ce mail à un autre bien” qui ouvre une sélection
   * (propositions du moteur, DÉCOCHÉES, et moteur de recherche, MÊMES COMPOSANTS que la modale). Il crée un
   * rattachement PONCTUEL de CE seul mail au bien choisi, EN PLUS de ses biens actuels. »
   *
   * Trois différences, et trois seulement :
   *   ① AUCUNE PRÉ-COCHE. Ici on AJOUTE un bien qu'on a en tête, on ne valide pas ce que le moteur propose —
   *      pré-cocher ferait partir un rattachement qu'on n'a pas demandé d'un simple clic sur « Rattacher » ;
   *   ② AUCUNE PORTÉE À CHOISIR : « ponctuel » VEUT DIRE ce mail, et rien d'autre. Offrir « toute la
   *      conversation » ici contredirait le bouton qui vient d'être cliqué ;
   *   ③ LE MOTIF EST `MOTIF_AJOUT_PONCTUEL`, et c'est lui qui tient la promesse d'Arno — aucune période touchée,
   *      et `projeterLeFil` ne retire jamais ce qu'elle n'a pas posé.
   *
   * ⚠️ ABSENT ⇒ COMPORTEMENT D'AVANT CE LOT, À LA LETTRE : pré-coche du moteur, portée au choix, motif habituel.
   */
  ponctuel?: boolean;
}) {
  const [etat, setEtat] = useState<
    { v: 'charge' } | { v: 'ok'; contexte: ContexteClassement } | { v: 'rien' }
  >({ v: 'charge' });
  /**
   * 🔴 LA SÉLECTION, QUAND LE MENU LA TIENT LUI-MÊME. Elle est ignorée dès que l'appelant commande
   * (`cochesImposees`) — voir l'encadré de cette option.
   */
  const [cochesLocales, setCochesLocales] = useState<string[]>([]);
  const commande = cochesImposees !== undefined;
  const coches: readonly string[] = cochesImposees ?? cochesLocales;
  const poserCoches = (n: readonly string[]): void => {
    /**
     * ⚠️ LES LIBELLÉS VOYAGENT AVEC LES CLÉS (lot CLASSER-PAR-LA-MODALE, point 3, défaut vu à l'écran). Ce menu
     * est le SEUL à connaître le nom d'un bien qu'on vient de cocher dans les propositions ou dans la recherche :
     * l'appelant, lui, ne connaît que ceux déjà rattachés au mail. Sans ce second argument, la fenêtre
     * préremplissait le titre d'un événement avec la CLÉ du bien (« 475 ») au lieu de son nom.
     *
     * ⚠️ SECOND ARGUMENT FACULTATIF : les appelants qui ne le lisent pas se comportent exactement comme avant.
     */
    const noms: Record<string, string> = {};
    for (const cle of n) noms[cle] = libelleDe(cle);
    if (commande) onCochesChange?.(n, noms); else setCochesLocales([...n]);
    onSelection?.(n, noms);
  };
  const [portee, setPortee] = useState<'mail' | 'conversation'>('mail');
  const [envoi, setEnvoi] = useState<{ en_cours: boolean; erreur: string | null }>(
    { en_cours: false, erreur: null });

  // ── LA RECHERCHE ────────────────────────────────────────────────────────────────────────────────────────────
  const [saisie, setSaisie] = useState('');
  const champ = useRef<HTMLInputElement | null>(null);
  /**
   * 🔴 LOT MOTEUR-RECHERCHE-BIENS-UNIFIE — LES RÉSULTATS COCHÉS REJOIGNENT LA LISTE DU HAUT, comme dans « Rattacher ce
   * mail à… » : on ne coche pas un résultat pour le voir disparaître à la recherche suivante. Décocher ne le retire pas
   * de la liste (la ligne qu'on vient de toucher ne s'efface pas sous le doigt).
   */
  const [ajoutes, setAjoutes] = useState<BienTrouve[]>([]);
  /** 🔴 « voir les autres » : au-delà de cinq propositions, les suivantes sont à un clic (règle du modèle A). */
  const [autresDeplies, setAutresDeplies] = useState(false);

  /**
   * ══ 🔴🔴 LA PRÉ-COCHE SE SUIT PAR SON CONTENU, JAMAIS PAR L'IDENTITÉ DU TABLEAU ══════════════════════════════
   *
   * ⚠️ DÉFAUT MESURÉ À L'ÉCRITURE DE CE LOT, et il est sournois : l'appelant recompose sa liste à chaque rendu,
   * donc le tableau change d'identité à chaque frappe. Pris tel quel en dépendance, l'effet de chargement se
   * rejouait, et `setCoches(preCoches)` REMETTAIT la sélection de départ — on cochait une case, elle se
   * décochait seule, et « Valider » n'avait plus rien à écrire.
   *
   * 🔴 ON DÉPEND DONC DU CONTENU, trié et joint : deux listes qui disent la même chose ne relancent rien.
   */
  const clePreCoches = preCoches === null ? null : [...preCoches].sort().join('|');

  const charger = useCallback(async () => {
    try {
      const res = await fetch(`/api/admin/gestion/classement?message=${messageId}${propositionsElargies ? '&elargi=1' : ''}`,
        { cache: 'no-store' });
      const d = (await res.json()) as { etat?: string; contexte?: ContexteClassement };
      if (d.etat !== 'ok' || !d.contexte || !d.contexte.disponible) { setEtat({ v: 'rien' }); return; }
      setEtat({ v: 'ok', contexte: d.contexte });
      /**
       * 🔴 LA PRÉ-COCHE VIENT DU MOTEUR, et n'est posée QU'UNE FOIS : la recalculer recocherait ce qu'on décoche.
       *
       * 🔴🔴 SAUF EN AJOUT PONCTUEL : Arno demande des propositions DÉCOCHÉES. On ajoute alors un bien qu'on a en
       * tête ; pré-cocher ferait partir un rattachement qu'on n'a pas demandé.
       */
      /* 🔴🔴 ET LA PRÉ-COCHE IMPOSÉE L'EMPORTE SUR LES DEUX : c'est l'état RÉEL du mail, pas une suggestion. */
      /**
       * ⚠️ RIEN À POSER QUAND L'APPELANT COMMANDE : c'est LUI qui a ouvert le panneau avec l'état réel du mail, et
       * le lui réécrire d'ici effacerait les cases qu'il vient peut-être de décocher.
       */
      if (commande) return;
      setCochesLocales(clePreCoches !== null
        ? (clePreCoches === '' ? [] : clePreCoches.split('|'))
        : (ponctuel ? [] : (d.contexte.biens ?? []).filter((b) => b.recommande).map((b) => b.cle)));
    } catch {
      setEtat({ v: 'rien' });
    }
  }, [messageId, ponctuel, clePreCoches, commande, propositionsElargies]);

  useEffect(() => { void charger(); }, [charger]);
  useEffect(() => { champ.current?.focus(); }, []);

  const contexte = etat.v === 'ok' ? etat.contexte : null;
  /**
   * 🔴🔴 LOT FENETRE-BIENS-LIBELLES-ET-VIDEOS — LES PROPOSITIONS, SAUF LES BIENS DÉJÀ RATTACHÉS.
   *
   * Arno : « b) “Autres biens proposés” : les propositions de l'automatisation SAUF les biens déjà rattachés ».
   * Ils sont dans la zone (a), au-dessus : les répéter ici avec une case à cocher ferait croire qu'il reste
   * quelque chose à décider à leur sujet — et une case déjà cochée dans une liste de propositions se décoche par
   * mégarde.
   *
   * ⚠️ ON FILTRE SUR LA LISTE D'OUVERTURE, pas sur la sélection en cours : un bien retiré par le ✕ ne doit pas
   * réapparaître ici d'un coup, il se remet par « Remettre », là où on vient de le retirer.
   */
  /**
   * 🔴🔴 LOT FENETRE-BIENS-CARTES-ET-RACCOURCIS, POINT 3 — LES BIENS DÉJÀ RATTACHÉS VIENNENT DE `preCoches`.
   *
   * Ils étaient donnés à part (`dejaRattaches`) pour alimenter la zone que ce point SUPPRIME. Or c'est la même
   * liste : `preCoches` EST l'état d'ouverture du mail. En garder deux aurait fini par en laisser une mentir.
   */
  const clesDeja = new Set(preCoches ?? []);
  const propositions: BienProposable[] = (contexte?.biens ?? []).filter((b) => !clesDeja.has(b.cle));
  const dateMail = contexte?.dateMail ?? null;

  /**
   * LA RECHERCHE, TEMPORISÉE (250 ms) — le crochet partagé. 🔴 `dateMail` : les parties des résultats sont celles À LA
   * DATE DU MAIL (« LOCATAIRE (à la date du mail) »), la seule différence admise avec « Rattacher ce mail à… ».
   */
  const recherche = useRechercheBiens(saisie, dateMail);
  const lignesTrouvees: BienTrouve[] = recherche.v === 'ok' ? recherche.resultats.lignes : [];

  /**
   * ══ 🔴🔴 LES CARTES DU HAUT, DANS L'ORDRE DU MODÈLE A ══════════════════════════════════════════════════════════
   * Les propositions de l'automatisation (sauf les biens déjà rattachés, qui ont leur carte au-dessus), puis les
   * résultats de recherche cochés. Un bien replié n'est montré que déplié ou coché — ce qui est coché est visible,
   * toujours. Puis les cochés à l'ouverture en tête : rien ne saute sous le doigt pendant qu'on coche.
   */
  const clesProposees = new Set(propositions.map((b) => b.cle));
  const proposesAffiches = propositions.filter((b) => b.replie !== true || autresDeplies || coches.includes(b.cle));
  const replies = propositions.filter((b) => b.replie === true).length;
  const ajoutesAffiches = ajoutes.filter((a) => !clesProposees.has(a.cle) && !clesDeja.has(a.cle));
  const cochesALOuverture = useRef<ReadonlySet<string> | null>(null);
  if (cochesALOuverture.current === null && etat.v !== 'charge') cochesALOuverture.current = new Set(coches);
  const lignesHaut = [
    ...proposesAffiches.map((b) => ({ cle: b.cle, parties: b.parties, motif: b.motif })),
    ...ajoutesAffiches.map((b) => ({ cle: b.cle, parties: b.parties, motif: 'ajouté à la main depuis la recherche' })),
  ].map((l, i) => ({ l, i, c: (cochesALOuverture.current?.has(l.cle) ?? false) ? 0 : 1 }))
    .sort((x, y) => x.c - y.c || x.i - y.i).map((x) => x.l);

  /** 🔴 LES TITRES (« adresse — nature · type »), calculés UNE fois sur toutes les listes : deux homonymes se départagent. */
  /* ⚠️ UN BIEN = UNE ENTRÉE : proposé ET trouvé à la recherche, il serait compté comme son propre homonyme, et son
     titre prendrait à tort « · lot N » (vu dans Chrome le 11/10/2026, lot PROPOSITIONS-MEME-PROPRIETAIRE). */
  const parTitre = new Map(titresDistincts(unParCle([
    ...propositions.map((b) => ({ cle: b.cle, adresse: [b.adresse ?? '', b.commune ?? ''].filter((x) => x.trim() !== '').join(', '),
      nature: b.nature, typeBien: b.typeBien, immeuble: null as string | null })),
    ...[...ajoutes, ...lignesTrouvees.filter((b) => !ajoutes.some((a) => a.cle === b.cle))].map((b) => ({
      cle: b.cle, adresse: [b.adresseVoie ?? '', b.commune ?? ''].filter((x) => x.trim() !== '').join(', '),
      nature: b.nature, typeBien: b.typeBien, immeuble: null as string | null })),
  ])).map((x) => [x.cle, x.titre]));

  /**
   * 🔴 CE QUI EST À L'ÉCRAN AVEC UNE CASE : les cartes des biens déjà rattachés (au-dessus, dans la fenêtre), les cartes
   * du haut et les résultats. C'est ce que le compteur compte et ce que « Sélectionner tous les biens » touche — un
   * même bien n'y est qu'une fois (ensemble).
   */
  const clesVisibles = [...new Set([...clesDeja, ...lignesHaut.map((l) => l.cle), ...lignesTrouvees.map((b) => b.cle)])]
    .filter((c) => c !== '');
  const toutesCochees = clesVisibles.length > 0 && clesVisibles.every((c) => coches.includes(c));
  /** Les biens déjà montrés plus haut : leur résultat dit « déjà dans la sélection » (une case, pas deux biens). */
  const clesEnHaut = new Set([...clesDeja, ...lignesHaut.map((l) => l.cle)]);

  /** 🔴 L'APPELANT SUIT LA SÉLECTION EN DIRECT : c'est de là que viennent sa phrase, son alerte et son compteur. */
  const basculer = (cle: string): void =>
    poserCoches(coches.includes(cle) ? coches.filter((x) => x !== cle) : [...coches, cle]);
  /** Un résultat coché rejoint la liste du haut (une fois) ; sa case est la même que celle du haut. */
  const rangerResultat = (b: BienTrouve): void => {
    if (clesProposees.has(b.cle) || clesDeja.has(b.cle)) return;
    setAjoutes((a) => (a.some((x) => x.cle === b.cle) ? a : [...a, b]));
  };
  const basculerResultat = (b: BienTrouve): void => { rangerResultat(b); basculer(b.cle); };
  /** « Sélectionner / Désélectionner tous les biens » : sur ce qui est visible, et rien d'autre. */
  const toutBasculer = (): void => {
    if (toutesCochees) { poserCoches(coches.filter((c) => !clesVisibles.includes(c))); return; }
    for (const b of lignesTrouvees) if (!coches.includes(b.cle)) rangerResultat(b);
    poserCoches([...new Set([...coches, ...clesVisibles])]);
  };

  /** Le plan des DEUX zones réunies : c'est lui qui écrit la phrase, jamais un compte fait à la main. */
  const plan = planClassement({
    messageId, portee,
    mailsSansManuel: [messageId, ...(contexte?.filId !== null && portee === 'conversation' ? [] : [])],
    selection: coches, existants: [],
  });
  /**
   * 🔴🔴 CE QU'IL Y A À FAIRE — ET CE N'EST PAS LA MÊME QUESTION DANS LES DEUX MODES.
   *
   * En rattachement, on AJOUTE : sans case cochée, il n'y a rien à poser. En modification des biens d'un mail, on
   * FIXE une liste : tout décocher est un geste plein (« ce mail ne concerne aucun bien »), et c'est le seul
   * moyen de retirer un bien. C'est donc l'ÉCART à l'état de départ qui décide.
   */
  /**
   * 🔴 LE NOM D'UN BIEN, D'OÙ QU'IL VIENNE. Les propositions et les résultats de recherche le portent ; un bien
   * déjà rattaché, lui, peut n'être dans ni l'un ni l'autre — c'est l'appelant qui le nomme alors.
   */
  const libelleDe = (cle: string): string =>
    propositions.find((b) => b.cle === cle)?.libelle
    ?? ajoutes.find((b) => b.cle === cle)?.libelle
    ?? lignesTrouvees.find((b) => b.cle === cle)?.libelle
    ?? libellesConnus?.[cle]
    ?? cle;

  const memeQuAuDepart = clePreCoches !== null && [...coches].sort().join('|') === clePreCoches;
  /**
   * ⚠️ `aussiAValider` (lot CLASSER-PAR-LA-MODALE, point 3) : l'appelant peut avoir quelque chose à écrire que
   * ce menu ne voit pas — un événement à lier ou à créer. Sans lui, « Valider le suivi » restait grisé dès que
   * les biens n'avaient pas changé, et l'on ne pouvait plus poser un événement seul.
   */
  const aFaire = onValider === undefined ? coches.length > 0 : (!memeQuAuDepart || aussiAValider);

  const valider = async () => {
    if (!aFaire || validationBloquee !== null) return;
    /* 🔴 L'ÉCRITURE DÉLÉGUÉE : ce menu ne connaît ni les périodes, ni les exceptions, et n'a pas à les connaître. */
    if (onValider !== undefined) {
      setEnvoi({ en_cours: true, erreur: null });
      try {
        await onValider(coches.map((cle) => ({ cle, libelle: libelleDe(cle) })));
      } finally { setEnvoi({ en_cours: false, erreur: null }); }
      return;
    }
    setEnvoi({ en_cours: true, erreur: null });
    /**
     * ⚠️ LA PORTÉE « TOUTE LA CONVERSATION » PASSE PAR LA MÊME PORTE, avec la liste des mails que le serveur a
     * donnée. On ne la recalcule pas ici : le serveur seul sait quels mails n'ont aucun classement manuel.
     */
    let mails: number[] = [messageId];
    if (portee === 'conversation' && filId !== null) {
      try {
        const res = await fetch(`/api/admin/gestion/classement?fil=${filId}&portee=1`, { cache: 'no-store' });
        const d = (await res.json()) as { etat?: string; mails?: number[] };
        if (d.etat === 'ok') mails = [...new Set([messageId, ...(d.mails ?? [])])];
      } catch { /* on retombe sur le mail ouvert : le geste le plus étroit est le moins regrettable */ }
    }

    let faits = 0;
    const ratés: string[] = [];
    for (const m of mails) {
      for (const cle of coches) {
        try {
          const res = await fetch('/api/admin/gestion/rattachements', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              messageId: m, cible: { sorte: 'lot', cle },
              /* 🔴 LE MOTIF DIT CE QUE LE GESTE EST, et il est LU : « ajout ponctuel » s'écrit sur la carte, et
                 il tient surtout la promesse d'Arno — la projection du suivi ne retire jamais ce qu'elle n'a
                 pas posé elle-même. */
              motif: ponctuel
                ? MOTIF_AJOUT_PONCTUEL
                : (portee === 'conversation' ? 'rattaché à la main (toute la conversation)' : 'rattaché à la main'),
            }),
          });
          if (res.ok) faits += 1; else ratés.push(`${cle} / mail ${m}`);
        } catch { ratés.push(`${cle} / mail ${m}`); }
      }
    }
    setEnvoi({
      en_cours: false,
      erreur: ratés.length === 0 ? null : `${faits} rattachement(s) posé(s), ${ratés.length} en échec.`,
    });
    if (ratés.length === 0) {
      onGeste?.(`${mails.length} mail${mails.length > 1 ? 's' : ''} rattaché${mails.length > 1 ? 's' : ''}`
        + ` à ${coches.length} bien${coches.length > 1 ? 's' : ''}.`);
      await onChange();
      onFerme();
    }
  };

  const fige = envoi.en_cours;

  return (
    <div className="mrb">
      {/* 🔴 LOT MOTEUR-RECHERCHE-BIENS-UNIFIE — les feuilles du composant partagé, de sa pastille « i » et de sa zone
          défilante : celles que monte « Rattacher ce mail à… ». Rien d'autre ne dessine les biens ici. */}
      <style>{CSS_LISTE_BIENS}</style>
      <style>{CSS_INFO_BIEN}</style>
      <style>{CSS_ZONE_DEFILANTE}</style>
      <style>{CSS_MENU_RATTACHEMENT}</style>

      {etat.v === 'charge' && <p className="gst-info" role="status">Lecture des biens possibles…</p>}

      {/* ⚠️ LA ZONE « Bien(s) déjà rattaché(s) à ce mail » A ÉTÉ RETIRÉE ICI (demande d'Arno, 03/10/2026) :
          elle répétait les cartes du haut de la fenêtre, ligne par ligne, avec une croix qui faisait le même
          geste que la case qu'elles portent maintenant. Un même état montré à deux endroits finit toujours par
          se contredire — et c'était déjà deux gestes pour une seule décision. */}
      {/* ══ ① LES PROPOSITIONS DE L'AUTOMATISATION — absentes s'il n'y en a aucune ═════════════════════════════
          🔴🔴 SAUF LES BIENS DÉJÀ RATTACHÉS (Arno) : ils sont au-dessus, sur les CARTES de la fenêtre, avec leur
          case ; les montrer une seconde fois ici ferait croire qu'il reste quelque chose à décider à leur sujet. */}
      {/* ══ 🔴🔴 LOT MOTEUR-RECHERCHE-BIENS-UNIFIE — LES DEUX ZONES SONT LE COMPOSANT PARTAGÉ ═══════════════════════
          « Propositions » puis « Moteur de recherche », exactement comme dans « Rattacher ce mail à… ». Les biens DÉJÀ
          rattachés n'y sont pas répétés : ils ont leur carte, avec sa case, au-dessus dans la fenêtre (Arno). */}
      {/* ⚠️ LE MOTIF DU MOTEUR (« examen ») RESTE LU : il coiffait la zone des propositions, et rien de la liste
          d'Arno ne demande de le retirer. */}
      {contexte?.examen && contexte.examen.motif.trim() !== '' && propositions.length > 0 && (
        <p className="mrb-examen">{contexte.examen.motif}</p>
      )}
      <ListeBiensACocher afficherPropositions={etat.v === 'ok'} lignes={lignesHaut}
        titre={(cle) => parTitre.get(cle) ?? libelleDe(cle)}
        selection={new Set(coches)} onBasculer={basculer}
        clesVisibles={clesVisibles} toutesCochees={toutesCochees} onToutBasculer={toutBasculer}
        replies={replies} autresDeplies={autresDeplies} onBasculerAutres={() => setAutresDeplies((v) => !v)}
        saisie={saisie} onSaisie={setSaisie} champ={champ} recherche={recherche}
        clesEnHaut={clesEnHaut} onBasculerResultat={basculerResultat}
        aLaDateDuMail={dateMail !== null} repliable={propositionsRepliables}
        {...(titrePropositions !== undefined ? { titrePropositions } : {})}
        expediteurMail={expediteurMail} trameCochee={trameCochee} />

      {/* ══ ③ UNE SEULE VALIDATION POUR LES DEUX ZONES ═══════════════════════════════════════════════════════
          🔴🔴 EN AJOUT PONCTUEL, IL N'Y A PAS DE PORTÉE À CHOISIR : « ponctuel » VEUT DIRE ce mail, et rien
          d'autre. Offrir « toute la conversation » ici contredirait le bouton qu'on vient de cliquer — et une
          portée qu'on peut changer après coup n'est plus une promesse. On l'ÉCRIT plutôt que de l'offrir. */}
      {pied !== undefined ? pied : ponctuel ? (
        <p className="mrb-ponctuel" role="note">
          Ce mail uniquement — ajout ponctuel, en plus de ses biens actuels.
          Aucune fenêtre de suivi n’est touchée, et les autres mails ne changent pas.
        </p>
      ) : (
        <fieldset className="mrb-portee">
          <legend className="mrb-legende">Portée</legend>
          <label className="mrb-choix">
            <input type="radio" name="mrb-portee" checked={portee === 'mail'} onChange={() => setPortee('mail')} />
            <span>Ce mail uniquement</span>
          </label>
          <label className={`mrb-choix${filId === null ? ' mrb-choix--inactif' : ''}`}>
            <input type="radio" name="mrb-portee" checked={portee === 'conversation'} disabled={filId === null}
              onChange={() => setPortee('conversation')} />
            <span>Toute la conversation{filId === null ? ' — échange inconnu' : ''}</span>
          </label>
        </fieldset>
      )}

      {!sansBoutons && (
      <div className="mrb-boutons">
        <button type="button" className="svv-btn svv-btn-primary gst-btn"
          disabled={fige || !aFaire || validationBloquee !== null}
          onClick={() => void valider()}>
          {fige ? 'Enregistrement…' : (motValider ?? (ponctuel ? 'Ajouter à ce mail' : 'Rattacher'))}
        </button>
        <button type="button" className="svv-btn svv-btn-outline gst-btn" disabled={fige} onClick={onFerme}>
          Annuler
        </button>
        {/* « Hors gestion » reste accessible d'ici, par LA fenêtre de classement — une seule implémentation. */}
        {onHorsGestion !== undefined && (
          <button type="button" className="gst-lien-bouton" disabled={fige} onClick={onHorsGestion}>
            Hors gestion, ou classer par pièce…
          </button>
        )}
        {/* ⚠️ EN MODE DÉLÉGUÉ, LA PHRASE EST CELLE DE L'APPELANT : lui seul sait ce que « valider » va écrire.
            Ce menu dirait « rattaché », et ce serait faux — c'est une exception de suivi qu'il pose. */}
        {onValider === undefined && (
          <span className="mrb-resume" role="status">
            {aFaire ? plan.resume : 'Aucun bien coché : rien ne sera rattaché.'}
          </span>
        )}
      </div>

      )}

      {/* 🔴 LE MOTIF DU BLOCAGE SE LIT : un bouton grisé sans raison est un bouton cassé. */}
      {validationBloquee !== null && <p className="gst-info" role="status">{validationBloquee}</p>}
      {envoi.erreur !== null && <p className="gst-tronc" role="alert">{envoi.erreur}</p>}
    </div>
  );
}

export const CSS_MENU_RATTACHEMENT = `
/* Le menu est le VOISIN IMMEDIAT de la ligne qui l'ouvre : un panneau qui s'ouvre en bas de page apparait hors
   du regard. Un liseré à gauche le rattache visuellement à sa ligne. */
.mrb{margin:6px 0 10px;padding:8px 10px;border:1px solid var(--color-svv-line);border-left:3px solid
  var(--color-svv-line-strong);border-radius:.6rem;background:var(--color-svv-field);min-width:0}
/* La legende de la portee : petites capitales grises, comme les titres de carte. */
.mrb-legende{margin:0 0 .3rem;font-size:.72rem;font-weight:700;letter-spacing:.04em;text-transform:uppercase;
  color:var(--color-svv-muted)}
.mrb-boutons{display:flex;flex-wrap:wrap;align-items:center;gap:8px;margin-bottom:8px}
.mrb-resume{font-size:.78rem;color:var(--color-svv-muted)}
.mrb-examen{margin:0 0 .4rem;font-size:.78rem;color:var(--color-svv-muted)}
.mrb-portee{margin:8px 0;padding:6px 10px;border:1px solid var(--color-svv-line);border-radius:.6rem;min-width:0}
/* 🔴 L'ajout ponctuel n'a pas de portee a choisir : on l'ECRIT. Meme encadre, ton de note. */
.mrb-ponctuel{margin:8px 0;padding:6px 10px;border:1px dashed var(--color-svv-line-strong);border-radius:.6rem;
  font-size:.78rem;color:var(--color-svv-muted);line-height:1.4}
.mrb-choix{display:flex;align-items:center;gap:.5rem;min-height:32px;font-size:.85rem;color:var(--color-svv-ink);
  cursor:pointer}
.mrb-choix--inactif{color:var(--color-svv-muted);cursor:default}

`;
