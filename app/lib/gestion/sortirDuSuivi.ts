import type { LienAffiche } from './rattachementRepo';
import { SORTES_BIEN } from './statutClassement';
import type { Classement } from './periodesConversation';

/**
 * ══ 🔴🔴 LOT HISTORIQUE-BIEN-12, POINT 1 — « SORTIR DU SUIVI », DEPUIS L'HISTORIQUE D'UN BIEN ════════════════════
 *
 * Module PUR : aucune base, aucun réseau, aucun DOM, aucun React. Il DIT ce que le geste demande ; c'est la route
 * du suivi qui l'écrit.
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * DEMANDE D'ARNO (05/10/2026) : « Bouton “Sortir du suivi”, à DROITE du bloc d'en-tête du mail déplié […]. Effet :
 * le mail est détaché de CE bien uniquement, avec ses pièces (elles quittent le résumé de ce bien). On passe par
 * la porte existante des fenêtres de suivi, fenêtre “Ce mail uniquement” (exception). Aucun second chemin. Les
 * autres biens éventuels du mail ne bougent pas. »
 *
 * ═══ 🔴🔴 CE QUE LE GESTE EST, EXACTEMENT — ET POURQUOI IL N'INVENTE RIEN ════════════════════════════════════════
 *
 * « Sortir du suivi de ce bien » n'est PAS une opération nouvelle : c'est la fenêtre « Ce mail uniquement » de
 * `RattachementsDuFil`, posée avec la liste des biens du mail MOINS celui qu'on regarde. Même route
 * (`POST /api/admin/gestion/suivi`), même dépôt (`poserClassement`), même `choix: 'mail'`, même journal, même
 * projection, même annulation (`annulerClassement`). Ce module ne fait que CALCULER la liste qui reste.
 *
 * 🔴 D'OÙ LA RÈGLE DES AUTRES BIENS, QUI TOMBE TOUTE SEULE : ils sont dans la liste qu'on repose, donc rien ne
 * leur arrive. Un geste qui aurait « retiré un lien » les aurait touchés le jour où la projection se recalcule.
 *
 * 🔴 ET LA RÈGLE DU « PLUS AUCUN BIEN » TOMBE AUSSI : une exception à liste VIDE est un classement parfaitement
 * valide (`classementRecu` l'accepte), et la projection retire alors tous les liens de bien de ce mail. Sa
 * pastille devient « À classer » par le seul jeu de `capsuleDuMessage` — aucune règle de statut n'est écrite ici,
 * et surtout pas « Interne », qui veut dire autre chose (un échange entre nous, décidé à la main).
 *
 * ⚠️ LES PIÈCES NE SONT PAS TOUCHÉES, ET N'ONT PAS À L'ÊTRE. Elles quittent le résumé parce que leur MAIL quitte
 * la sélection du bien — c'est la même lecture (`porteursDePieces`) qui les ramenait. Rien n'est déplacé, rien
 * n'est effacé, et ce qui est déjà rangé dans le Drive n'en bouge pas d'un pixel.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */

/** Le mot du bouton. Court : il vit à droite d'un en-tête déjà chargé. */
export const MOT_SORTIR_DU_SUIVI = 'Sortir du suivi';

/**
 * L'info-bulle NOMME le bien, parce que le bouton ne le peut pas. Dans l'historique d'un bien, « Sortir du
 * suivi » pourrait se lire « sortir du suivi de la conversation » — ce que le geste ne fait PAS.
 */
export function aideSortirDuSuivi(adresseDuBien: string): string {
  return `Détacher ce mail du suivi de ${adresseDuBien}. Ses autres biens éventuels ne bougent pas.`;
}

/**
 * ══ 🔴 L'ADRESSE DU BIEN, TIRÉE DE SON TITRE ════════════════════════════════════════════════════════════════════
 *
 * Le titre d'un bien est écrit par `nomBien` : « 28 Avenue Marceau, 92400 COURBEVOIE — Appartement — lot 421 ».
 * La phrase d'Arno dit « le suivi de <adresse du bien> » : c'est le PREMIER segment qu'il nomme, et lui seul —
 * « sortir du suivi de 28 Avenue Marceau, 92400 COURBEVOIE — Appartement — lot 421 ? » ferait une question qu'on
 * ne lit pas jusqu'au bout, donc une confirmation qu'on clique sans lire.
 *
 * ⚠️ PAS DE SÉPARATEUR ⇒ LE TITRE ENTIER, jamais une chaîne vide : mieux vaut long que muet. Et un titre vide
 * rend « ce bien », qui est vrai et se lit.
 */
export function adresseDuBien(titre: string): string {
  const t = (titre ?? '').trim();
  if (t === '') return 'ce bien';
  const premier = t.split(' — ')[0].trim();
  return premier === '' ? t : premier;
}

/**
 * ══ 🔴🔴 LE CLASSEMENT À REPOSER, SANS CE BIEN. PUR. ═════════════════════════════════════════════════════════════
 *
 * ═══ 🔴🔴 CE QU'UN ESSAI RÉEL A APPRIS, ET QUI A FAIT RÉÉCRIRE CETTE FONCTION ════════════════════════════════════
 *
 * Première version : elle partait des LIENS du mail et mettait toutes les cibles dans `biens`. Essayée pour de
 * vrai le 05/10/2026 sur le mail 57471 de lot-27, elle a produit DEUX dégâts, l'un après l'autre :
 *
 *   ① le propriétaire du mail s'est retrouvé reposé comme un **LOT** — la projection écrit `cible_sorte = 'lot'`
 *      pour tout ce qui est dans `biens`. Le mail s'est donc rattaché au « lot 45 », qui est un autre bien ;
 *   ② et sans lui, l'INTERVENTION « via Arnaud JOREL » disparaissait : un propriétaire sur un mail n'est pas un
 *      bien du classement, c'est une PERSONNE (`Classement.personnes`, lot CONTACTS-EXTERNES), projetée à part.
 *
 * Les deux essais ont été annulés et la base rétablie (liens 172539 / 172540 confirmés). La leçon tient en une
 * phrase : **le classement d'un mail a deux axes, et ce module doit les respecter tous les deux.**
 *
 * ═══ 🔴 D'OÙ ON PART : CE QUE LE SUIVI DIT DÉJÀ DE CE MAIL ═══════════════════════════════════════════════════════
 *
 * On ne reconstruit donc PAS un classement à partir des liens : on prend celui qui est EN VIGUEUR sur ce mail
 * (`projeter(mails, periodes, exceptions)`, le module pur du suivi), et on en retire ce bien. Tout le reste —
 * les autres lots, les personnes, leur contact extérieur — est reposé **tel quel**, sans l'avoir retraduit.
 *
 * 🔴 C'EST CE QUI TIENT LA RÈGLE D'ARNO (« les autres biens éventuels du mail ne bougent pas ») : on ne les
 * recopie pas depuis une autre source, on rend la décision qui s'applique, moins une ligne.
 *
 * ⚠️ AUCUNE CONFIGURATION EN VIGUEUR ⇒ `undefined` : aucune fenêtre ne couvre ce mail. Voir `classementSansLeBien`
 * ci-dessous, qui sait alors retomber sur les liens — et pourquoi c'est sans danger.
 */
export function classementEnVigueurSansLeBien(
  enVigueur: Classement | undefined, cleDuBien: string,
): Classement | undefined {
  if (enVigueur === undefined || enVigueur.sorte !== 'biens') return undefined;
  const cible = (cleDuBien ?? '').trim();
  const biens = enVigueur.biens.filter((b) => (b.cle ?? '').trim() !== cible);
  return {
    sorte: 'biens',
    biens,
    /**
     * 🔴 LES PERSONNES SONT REPOSÉES TELLES QUELLES, contact extérieur compris : les retirer de la liste les
     * retirerait du mail (le diff d'une fenêtre retire ce qu'une fenêtre a posé).
     *
     * 🔴🔴 SAUF QUAND IL NE RESTE PLUS AUCUN BIEN — et ce n'est pas une précaution, c'est la règle. La base
     * REFUSE une intervention sans lien vivant vers un bien sur le même mail (migration 293), et Arno a déjà
     * tranché la question en toutes lettres : « une intervention ne survit pas au départ de son bien ». La
     * projection s'en charge elle-même (`retirerInterventionsSansBien`) ; les envoyer quand même faisait
     * REFUSER le geste entier — mesuré à l'écran le 05/10/2026, mail 57471 : « la base n'a pas répondu », et
     * rien n'était écrit. Mieux vaut un geste qui aboutit et une cascade qui s'applique.
     */
    personnes: biens.length === 0 ? [] : (enVigueur.personnes ?? []),
  };
}

/**
 * ══ 🔴 LE REPLI : LES LOTS DU MAIL, QUAND AUCUNE FENÊTRE NE LE COUVRE. PUR. ══════════════════════════════════════
 *
 * 🔴 SEULEMENT LA SORTE `lot`, et c'est la correction du dégât ① ci-dessus : `Classement.biens` se projette en
 * `cible_sorte = 'lot'`. Y glisser un propriétaire ou un locataire écrirait un bien qui n'existe pas.
 *
 * 🔴 ET AUCUNE PERSONNE N'EST REPOSÉE DANS CE CAS, ce qui est sans danger : une intervention ne peut avoir été
 * posée que par une fenêtre (motif « intervention posée par le suivi »), et il n'y en a aucune ici — le diff ne
 * retirera donc rien. Les reposer aurait demandé de deviner leur contact extérieur, que les liens ne portent pas.
 *
 * ⚠️ LES LIENS DE PIÈCE SONT ÉCARTÉS (`pieceId !== null`) : un classement de suivi porte sur le MAIL, c'est ce que
 * `sqlLiensDuBien` dit déjà de son côté. Reposer un lien de pièce aurait élargi sa portée en silence.
 *
 * ⚠️ ET LES PROPOSITIONS NON CONFIRMÉES AUSSI : une suggestion que personne n'a validée n'est pas une décision.
 */
export function lotsApresSortie(
  liens: readonly LienAffiche[], cleDuBien: string,
): { cle: string; libelle: string }[] {
  const cible = (cleDuBien ?? '').trim();
  const vus = new Set<string>();
  const restants: { cle: string; libelle: string }[] = [];
  for (const l of liens) {
    if (l.statut !== 'confirme' || l.pieceId !== null || l.cible.sorte !== 'lot') continue;
    const cle = (l.cible.cle ?? '').trim();
    if (cle === '' || cle === cible || vus.has(cle)) continue;
    vus.add(cle);
    restants.push({ cle, libelle: (l.libelle ?? '').trim() === '' ? cle : l.libelle.trim() });
  }
  return restants;
}

/**
 * ══ 🔴🔴 LE CLASSEMENT FINAL — UNE SEULE PORTE POUR L'ÉCRAN. PUR. ═══════════════════════════════════════════════
 *
 * La configuration en vigueur quand il y en a une ; les lots du mail sinon. L'écran n'a pas à choisir.
 */
export function classementSansLeBien(o: {
  enVigueur: Classement | undefined;
  liens: readonly LienAffiche[];
  cleDuBien: string;
}): Classement {
  const duSuivi = classementEnVigueurSansLeBien(o.enVigueur, o.cleDuBien);
  if (duSuivi !== undefined) return duSuivi;
  return { sorte: 'biens', biens: lotsApresSortie(o.liens, o.cleDuBien), personnes: [] };
}

/** Ce mail est-il seulement RATTACHÉ à ce bien ? Sinon le bouton n'a rien à retirer, et ne s'affiche pas. */
export function suitCeBien(liens: readonly LienAffiche[], cleDuBien: string): boolean {
  const cible = (cleDuBien ?? '').trim();
  return liens.some((l) => l.statut === 'confirme' && l.pieceId === null
    && SORTES_BIEN.includes(l.cible.sorte) && (l.cible.cle ?? '').trim() === cible);
}

/**
 * ══ 🔴🔴 LA QUESTION POSÉE AVANT, MOT POUR MOT ══════════════════════════════════════════════════════════════════
 *
 * Arno : « Sortir ce mail du suivi de <adresse du bien> ? Ses N pièces jointes quitteront aussi cet historique. »
 *
 * ⚠️ LA SECONDE PHRASE DISPARAÎT QUAND IL N'Y A AUCUNE PIÈCE. « Ses 0 pièces jointes quitteront aussi cet
 * historique » annonce une conséquence qui n'existe pas — et une confirmation qui énumère des riens est une
 * confirmation qu'on apprend à ne plus lire.
 *
 * ⚠️ LE SINGULIER EST ÉCRIT : « Sa 1 pièce jointe » n'est pas du français, et la phrase est lue par quelqu'un qui
 * s'apprête à retirer un mail d'un dossier.
 */
export function motConfirmationSortie(o: { adresseDuBien: string; nbPieces: number }): string {
  const question = `Sortir ce mail du suivi de ${o.adresseDuBien} ?`;
  if (o.nbPieces <= 0) return question;
  return o.nbPieces === 1
    ? `${question} Sa pièce jointe quittera aussi cet historique.`
    : `${question} Ses ${o.nbPieces} pièces jointes quitteront aussi cet historique.`;
}

/**
 * Ce que l'écran annonce une fois le mail sorti, avec son « Annuler ».
 *
 * ⚠️ IL DIT CE QUI A EU LIEU, PAS CE QU'IL FAUT FAIRE : « Mail sorti du suivi de … » se relit sans contexte, là
 * où « C'est fait » obligerait à se souvenir de ce qu'on vient de cliquer.
 */
export function motMailSorti(adresseDuBien: string): string {
  return `Mail sorti du suivi de ${adresseDuBien}.`;
}

/**
 * Combien de secondes « Annuler » reste offert.
 *
 * ⚠️ HUIT SECONDES, COMME PARTOUT AILLEURS (`SECONDES_ANNULER_DEPLACEMENT`, lot HISTORIQUE-BIEN-8) : « quelques
 * secondes » doit vouloir dire la même chose dans toute l'application.
 *
 * 🔴 ET BIEN EN DEÇÀ DE CE QUE LE DÉPÔT PERMET : `annulerClassement` refuse de défaire un geste vieux de plus de
 * DEUX MINUTES (garde SQL `cree_le > now() - interval '2 minutes'`). Offrir un bouton au-delà de cette fenêtre
 * aurait donné un « Annuler » qui échoue — la pire sorte de bouton.
 */
export const SECONDES_ANNULER_SORTIE = 8;

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   🔴🔴 LOT RATTACHEMENT-PONCTUEL, POINT 1 — « MODIFIER LE RATTACHEMENT », PONCTUELLEMENT
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════

   DEMANDE D'ARNO (06/10/2026) : « À côté de “Sortir du suivi”, même style, un second bouton “Modifier le
   rattachement”. Il ouvre la fenêtre “Bien(s) rattaché(s) à ce mail” […] MAIS en mode PONCTUEL : aucune option
   de suivi n'est affichée ni proposée […] Un bandeau clair en haut de la fenêtre […] Le bouton de validation
   s'appelle “Valider pour ce mail uniquement”. »

   🔴🔴 CE QUE LE MODE PONCTUEL EST, EXACTEMENT. Ce n'est PAS un second chemin d'écriture : c'est la MÊME fenêtre,
   la MÊME route (`POST /api/admin/gestion/suivi`), le MÊME `choix: 'mail'` — celui que « Sortir du suivi » emploie
   déjà juste au-dessus. Ce qui change est ce qu'on MONTRE : on ne propose plus un choix de portée, parce qu'il n'y
   en a plus qu'une, et on le DIT.

   🔴 POURQUOI « AUCUNE PÉRIODE N'EST CRÉÉE, MODIFIÉE OU SUPPRIMÉE » EST VRAI PAR CONSTRUCTION, et non par
   précaution : `choix: 'mail'` écrit une EXCEPTION, et une exception ne déplace aucune période — c'est sa
   définition même (`periodesConversation`). Les deux autres fenêtres, celles qui touchent aux périodes, ne sont
   pas offertes : elles ne peuvent donc pas être choisies par mégarde.

   ⚠️ CE MODE NE S'APPLIQUE QU'À CETTE PORTE. « Visualiser / Modifier » et « Classer » gardent leurs trois
   fenêtres : ce lot AJOUTE une porte, il n'en modifie aucune.
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

/** Le mot du second bouton. Court, comme son voisin : ils vivent à droite d'un en-tête déjà chargé. */
export const MOT_MODIFIER_LE_RATTACHEMENT = 'Modifier le rattachement';

/**
 * L'info-bulle NOMME le bien, comme celle de son voisin et pour la même raison : dans l'historique d'un bien,
 * « modifier le rattachement » pourrait se lire « de la conversation » — ce que le geste ne fait PAS.
 */
export function aideModifierLeRattachement(adresseDuBienLu: string): string {
  return `Modifier les biens rattachés à CE mail uniquement, sans toucher au suivi de la conversation `
    + `ni aux autres mails. Vous êtes dans l’historique de ${adresseDuBienLu}.`;
}

/**
 * ══ 🔴🔴 LE BANDEAU, MOT POUR MOT CELUI D'ARNO ══════════════════════════════════════════════════════════════════
 *
 * 🔴 IL EST ÉCRIT AVANT LE GESTE, ET NON APRÈS. C'est la règle de la maison, et elle vaut double ici : la
 * différence entre une modification ponctuelle et une règle de suivi ne se voit pas à l'écran une fois le geste
 * fait — elle se voit trois mails plus loin.
 */
export const BANDEAU_MODIFICATION_PONCTUELLE =
  'Modification ponctuelle : elle ne concerne QUE ce mail. Aucun autre mail, aucune conversation et aucun '
  + 'suivi ne sont modifiés.';

/** Le mot du bouton de validation, en mode ponctuel. Il dit la portée, puisque plus rien d'autre ne la dit. */
export const MOT_VALIDER_CE_MAIL_UNIQUEMENT = 'Valider pour ce mail uniquement';

/** Ce qu'on dit après le geste, au-dessus de l'« Annuler ». */
export const MOT_MODIFICATION_PONCTUELLE_FAITE =
  'Rattachement de ce mail modifié. Aucun autre mail, aucune période de suivi n’a bougé.';
