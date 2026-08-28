/**
 * R8 — COMPOSITION du récapitulatif d'alerte quotidien. Module PUR : aucune I/O. `composerAlerte` reçoit un état DÉJÀ
 * calculé (ce qui a changé depuis la borne + la santé de la relève) et rend { sujet, corps } — ou `null` quand il n'y a
 * RIEN à dire (c'est ce null qui évite l'e-mail inutile : jamais un e-mail par événement, un seul récapitulatif par jour).
 *
 * ⚠️ RÈGLE CENTRALE : on n'annonce JAMAIS un silence qu'on n'a pas vérifié. Si la relève n'est pas fraîche, on le dit EN
 * PREMIER et le reste est présenté comme INCERTAIN — le corps ne DÉCLARE jamais qu'une mairie « n'a pas répondu ».
 */

export interface ReponseRattacheeAlerte {
  reference: string;
  communeNom: string | null;
  nbPieces: number;
  dossiersSatisfaits: string[]; // numéros Sitadel des dossiers obtenus grâce à cette réponse
}
export interface RebondAlerteInfo {
  reference: string;
  communeNom: string | null;
  motif: string | null;
}
/** J1 DEFAUT 2 — T3 : un ACCUSÉ (« la mairie a écrit ») n'est PAS une réponse (« la mairie a répondu ») → annoncé À PART, jamais compté « réponse ». */
export interface AccuseAlerteInfo {
  reference: string;
  communeNom: string | null;
}
export interface DemandeEcheanceAlerte {
  reference: string;
  communeNom: string | null;
  etat: 'proche' | 'depassee';
  echeanceLe: string; // 'AAAA-MM-JJ'
}
export interface RelanceAlerteInfo {
  reference: string;
  communeNom: string | null;
}

export interface EntreeAlerte {
  releveFraiche: boolean;
  releveDetail: string;                       // ex. « dernière relève réussie il y a 12 minutes » / « aucune relève réussie à ce jour »
  reponsesRattachees: ReponseRattacheeAlerte[]; // depuis la borne — RÉELLES seulement (nature NOT IN accuse/rebond), T3
  accusesRecus: AccuseAlerteInfo[];           // J1 DEFAUT 2 : accusés de réception rattachés depuis la borne (« a écrit », pas « a répondu »)
  nbAReattacher: number;                      // nouvelles réponses non rattachées depuis la borne
  rebondsAppliques: RebondAlerteInfo[];       // demandes non parvenues (rebond) depuis la borne
  demandesEcheance: DemandeEcheanceAlerte[];  // passées à proche/dépassée depuis la borne
  relancesPreparees: RelanceAlerteInfo[];     // brouillons en attente de relecture
}

function commune(nom: string | null): string {
  return nom ? ` (${nom})` : '';
}

/**
 * Compose le récapitulatif, ou `null` s'il n'y a rien à dire. Ordre du corps : santé de la relève (en tête) → réponses
 * rattachées → réponses à rattacher → rebonds appliqués (problème d'acheminement, pas un silence) → échéances → relances.
 */
export function composerAlerte(e: EntreeAlerte): { sujet: string; corps: string } | null {
  const duNouveau = e.reponsesRattachees.length > 0 || e.accusesRecus.length > 0 || e.nbAReattacher > 0 || e.rebondsAppliques.length > 0
    || e.demandesEcheance.length > 0 || e.relancesPreparees.length > 0;
  // Rien à dire = relève fraîche ET aucun changement. Une relève NON fraîche est en soi quelque chose à signaler.
  if (e.releveFraiche && !duNouveau) return null;

  const lignes: string[] = [];

  // 1) EN TÊTE — santé de la relève. Non fraîche → avertissement franc, le reste devient incertain (règle centrale).
  if (!e.releveFraiche) {
    lignes.push(`⚠ RELÈVE À VÉRIFIER — ${e.releveDetail}. Les informations ci-dessous sont donc INCERTAINES : tant que la boîte n’est pas relevée récemment, une réponse a pu arriver sans être vue.`, '');
  } else {
    lignes.push(`Relève : ${e.releveDetail}.`, '');
  }

  // 2) Réponses reçues et rattachées depuis la dernière alerte.
  if (e.reponsesRattachees.length > 0) {
    lignes.push(`Réponses reçues et rattachées depuis la dernière alerte (${e.reponsesRattachees.length}) :`);
    for (const r of e.reponsesRattachees) {
      const dos = r.dossiersSatisfaits.length > 0 ? `dossiers obtenus : ${r.dossiersSatisfaits.join(', ')}` : 'aucun dossier reconnu automatiquement';
      lignes.push(`  · ${r.reference}${commune(r.communeNom)} — ${r.nbPieces} pièce(s) jointe(s) — ${dos}`);
    }
    lignes.push('');
  }

  // 2bis) J1 DEFAUT 2 — ACCUSÉS de réception (T3 : « la mairie a écrit », PAS « a répondu »). Distincts des réponses : un accusé
  //   ne fait pas entrer la demande dans « Réponses » et ne livre aucun document. On le DIT, sans jamais l'appeler « réponse ».
  if (e.accusesRecus.length > 0) {
    lignes.push(`Accusés de réception reçus depuis la dernière alerte (${e.accusesRecus.length}) — la mairie a écrit, pas encore répondu :`);
    for (const a of e.accusesRecus) lignes.push(`  · ${a.reference}${commune(a.communeNom)}`);
    lignes.push('');
  }

  // 3) Réponses reçues NON rattachées (file « à rattacher »).
  if (e.nbAReattacher > 0) {
    lignes.push(`Réponses reçues NON rattachées : ${e.nbAReattacher} en attente d’arbitrage (onglet « Réponses »).`, '');
  }

  // 4) Rebonds APPLIQUÉS — problème d'ACHEMINEMENT, pas un silence : aucun délai ne court (le plus urgent à traiter).
  if (e.rebondsAppliques.length > 0) {
    lignes.push(`⚠ REBONDS — ${e.rebondsAppliques.length} demande(s) NON parvenue(s) à la mairie (problème d’acheminement, pas un silence de l’administration : aucun délai ne court) :`);
    for (const b of e.rebondsAppliques) lignes.push(`  · ${b.reference}${commune(b.communeNom)}${b.motif ? ` — ${b.motif}` : ''}`);
    lignes.push('');
  }

  // 5) Demandes passées à proche / dépassée (avec leur date d'échéance).
  if (e.demandesEcheance.length > 0) {
    lignes.push('Demandes à échéance :');
    for (const d of e.demandesEcheance) {
      lignes.push(`  · ${d.reference}${commune(d.communeNom)} — ${d.etat === 'depassee' ? 'échéance dépassée' : 'échéance proche'} le ${d.echeanceLe}`);
    }
    lignes.push('');
  }

  // 6) Relances préparées en attente de relecture.
  if (e.relancesPreparees.length > 0) {
    lignes.push(`Relances préparées en attente de relecture (${e.relancesPreparees.length}) :`);
    for (const r of e.relancesPreparees) lignes.push(`  · ${r.reference}${commune(r.communeNom)}`);
    lignes.push('');
  }

  lignes.push('Détail complet : onglet « Réponses » de l’espace d’administration.');

  // Sujet sobre et factuel — un résumé chiffré aide à trier sans ouvrir.
  const resume: string[] = [];
  if (e.rebondsAppliques.length > 0) resume.push(`${e.rebondsAppliques.length} rebond(s)`);
  if (e.reponsesRattachees.length > 0) resume.push(`${e.reponsesRattachees.length} réponse(s)`);
  if (e.accusesRecus.length > 0) resume.push(`${e.accusesRecus.length} accusé(s)`); // J1 DEFAUT 2 : jamais fondu dans « réponse(s) »
  if (e.demandesEcheance.length > 0) resume.push(`${e.demandesEcheance.length} échéance(s)`);
  if (!e.releveFraiche) resume.push('relève à vérifier');
  const sujet = `Suivi des demandes CRPA — Sans Vis-à-Vis®${resume.length > 0 ? ` : ${resume.join(', ')}` : ''}`;

  return { sujet, corps: lignes.join('\n').trim() };
}
