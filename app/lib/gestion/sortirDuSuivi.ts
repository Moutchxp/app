import type { LienAffiche } from './rattachementRepo';
import { SORTES_BIEN } from './statutClassement';

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
 * ══ 🔴🔴 LES BIENS QUI RESTENT APRÈS LA SORTIE. PUR. ═════════════════════════════════════════════════════════════
 *
 * 🔴 ON PART DES LIENS **CONFIRMÉS VERS UN BIEN**, et de rien d'autre. Un lien `evenement` n'est pas un bien
 * (`SORTES_BIEN` le dit déjà pour la pastille), et une proposition non confirmée n'est pas un classement : les
 * reposer en exception aurait transformé une suggestion en décision prise.
 *
 * 🔴 ET LES LIENS **DE PIÈCE** SONT ÉCARTÉS (`pieceId !== null`). Un classement de suivi porte sur le MAIL — c'est
 * ce que `sqlLiensDuBien` dit déjà de son côté (`piece_id IS NULL`). Reposer un lien de pièce en exception de
 * mail aurait élargi sa portée en silence : la pièce classée seule serait devenue un bien du mail entier.
 *
 * ⚠️ SANS DOUBLON, ET DANS L'ORDRE REÇU : la route dédoublonne elle aussi (`classementRecu`), mais compter sur
 * l'autre bout pour tenir une règle est la façon dont on finit par ne la tenir nulle part.
 */
export function biensApresSortie(
  liens: readonly LienAffiche[], cleDuBien: string,
): { cle: string; libelle: string }[] {
  const cible = (cleDuBien ?? '').trim();
  const vus = new Set<string>();
  const restants: { cle: string; libelle: string }[] = [];
  for (const l of liens) {
    if (l.statut !== 'confirme' || l.pieceId !== null) continue;
    if (!SORTES_BIEN.includes(l.cible.sorte)) continue;
    const cle = (l.cible.cle ?? '').trim();
    if (cle === '' || cle === cible || vus.has(cle)) continue;
    vus.add(cle);
    restants.push({ cle, libelle: (l.libelle ?? '').trim() === '' ? cle : l.libelle.trim() });
  }
  return restants;
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
