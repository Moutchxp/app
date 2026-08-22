/**
 * CASCADE DE RELANCE (lot 1/6) — BROUILLONS d'une relance, en TROIS variantes selon la position dans le délai CRPA. Module PUR :
 * aucune I/O, aucun import de pg ni d'imapflow. Compose UNIQUEMENT le texte (objet + corps) ; N'ENVOIE RIEN, ne journalise rien,
 * n'écrit jamais demande.statut. La logique de DÉCLENCHEMENT (quelle variante, quand) est le lot 3 ; le SCHÉMA est le lot 2.
 *
 *  - 'rappel'   (≈ J-10 avant l'échéance) : rappel COURTOIS, ne mentionne NI la CADA NI le refus tacite (la mairie n'est pas en faute).
 *  - 'avis'     (≈ J-3  avant l'échéance) : annonce l'échéance À VENIR et la POSSIBILITÉ de saisir la CADA (refus pas encore acquis).
 *  - 'saisine'  (jour de l'échéance)      : constate le refus tacite (R. 311-12), informe que la saisine CADA sera déposée à J+4.
 *
 * ⚠️ RÉFÉRENCES JURIDIQUES — VÉRIFIÉES, liste CLOSE, AUCUNE AUTRE sous aucun prétexte : L. 311-1 et L. 311-9 3° du CRPA
 * (fondement du droit d'accès, comme le courrier initial), R. 311-12 (le silence vaut refus — 'saisine' seule), R. 311-13 (délai
 * d'un mois), R. 343-1 (fondement de la saisine CADA — 'saisine' seule), et R. 431-9 du code de l'urbanisme (désignation de PC2).
 *
 * RÈGLES DE FOND héritées du courrier initial (demande.ts, non réimplémenté — on importe ses helpers) :
 *  - la relance est AUTOSUFFISANTE (lue un mois plus tard, sans le courrier initial) et PARTIELLE (ne liste QUE les dossiers dus) ;
 *  - AUCUN motif, aucune justification d'intérêt, aucune mention d'usage : le droit d'accès s'exerce sans se justifier ;
 *  - GARDE-FOU IDENTITÉ : pas de texte si l'identité du profil est incomplète (réutilise problemesIdentite) ;
 *  - la RÉFÉRENCE INTERNE (SVAV-DEM-…) ne trahit jamais le système : demande à UN SEUL dossier → elle n'apparaît NULLE PART
 *    (objet ni corps), l'objet portant le TYPE + le NUMÉRO de permis ; la réponse se rappelle toujours par le NUMÉRO DE PERMIS.
 */
import {
  problemesIdentite, dateEnFrancais, signatureEntreprise,
  type Lot, type CandidatDossier, type ConfigDemandeur, type Piece, type ProfilDemandeur,
} from '../sitadel/demande';

/** Délai (jours) entre l'échéance du délai d'un mois et le dépôt annoncé de la saisine CADA (variante 'saisine'). */
export const DELAI_SAISINE_JOURS = 4;

/** Les trois variantes de la cascade (l'ancienne 'formelle' a disparu — 'saisine' en est l'équivalent sémantique). */
export type VarianteRelance = 'rappel' | 'avis' | 'saisine';

export interface EntreeRelance {
  reference: string;
  profil: ProfilDemandeur;
  lot: Lot;                        // dossiers de la demande + communeNom (type réutilisé de demande.ts)
  dossiersSatisfaitsIds: number[]; // ids des dossiers DÉJÀ obtenus → exclus de la relance
  config: ConfigDemandeur;         // identité du profil (garde-fou d'identité)
  pieces: Piece[];                 // pièces demandées AVEC leur désignation complète (code + description)
  envoyeeLe: Date;                 // envoi RÉEL de la demande initiale (fait passé)
  echeanceLe: Date;                // expiration du délai d'un mois (fait passé, calculé par echeanceDe en amont)
  saisineLe?: Date;                // date de saisine ANNONCÉE (= echeanceLe + DELAI_SAISINE_JOURS) ; REQUISE pour 'saisine' seulement
  historique?: { date: Date; libelle: string }[]; // envois déjà faits, FOURNIS par l'appelant (JAMAIS reconstruits ici) ; défaut []
  adresseReponse: string;          // boîte relue (profil entreprise) ; le profil personne répond à son e-mail
  serviceDestinataire?: string;    // mention de service en tête (pilotée depuis config_veille — câblage lot 3) ; rendue SEULEMENT si non vide
}

export interface TexteRelance { objet: string; corps: string }

/** Erreur levée quand l'identité du profil est incomplète : AUCUN texte n'est produit (comme pour le courrier initial). */
export class IdentiteIncompleteError extends Error {
  constructor(public readonly problemes: string[]) {
    super(`identité du demandeur incomplète : ${problemes.join(' ; ')}`);
    this.name = 'IdentiteIncompleteError';
  }
}

/** Erreur levée si TOUS les dossiers sont déjà satisfaits : il n'y a plus rien à réclamer (relanceAuto le garantit aussi). */
export class AucunDossierNonSatisfaitError extends Error {
  constructor(public readonly reference: string) {
    super(`aucun dossier à réclamer pour ${reference} : tous les dossiers sont satisfaits`);
    this.name = 'AucunDossierNonSatisfaitError';
  }
}

/** Date d'un instant en français (« 14 mars 2026 ») via le helper de demande.ts, en date UTC (cohérent avec echeanceDe). */
function dateFr(d: Date): string {
  return dateEnFrancais(d.toISOString().slice(0, 10));
}

/** Libellé du type de permis, TIRÉ DE LA DONNÉE (jamais deviné). Type absent → chaîne vide (l'objet retombe sur « n° … »). */
function typePermisLibelle(t?: 'PC' | 'PD'): string {
  return t === 'PC' ? 'permis de construire' : t === 'PD' ? 'permis de démolir' : '';
}

/** Ligne d'UN dossier concerné (rappel factuel, pas la trame complète du courrier initial). */
function ligneDossier(d: CandidatDossier): string {
  const villeCP = [d.codePostal, d.communeNom].filter((x) => x !== null && x.trim() !== '').map((x) => x!.trim()).join(' ');
  const lieu = [d.adresse.trim(), villeCP].filter((x) => x !== '').join(', ');
  const cad = d.cadastre.length ? `parcelle(s) ${d.cadastre.join(', ')}` : '';
  return [d.numDau, `autorisé le ${dateEnFrancais(d.dateReelleAutorisation)}`, lieu, cad].filter((x) => x && x.trim() !== '').join(' — ');
}

/**
 * Génère l'objet + le corps d'une relance selon la `variante`. Lève `IdentiteIncompleteError` (identité incomplète → aucun texte),
 * `AucunDossierNonSatisfaitError` (plus rien à réclamer). Structure commune aux trois textes (ordre EXACT) : service (option) →
 * « Madame, Monsieur, » → excuse préventive → fondement + pièces → dossier(s) dû(s) → paragraphe de la variante → offre de lien →
 * identité + adresse de réponse → renvoi au service compétent (rappel/avis) → rappel du NUMÉRO DE PERMIS → historique → politesse.
 */
export function genererRelance(e: EntreeRelance, variante: VarianteRelance): TexteRelance {
  const problemes = problemesIdentite(e.config, e.profil);
  if (problemes.length > 0) throw new IdentiteIncompleteError(problemes);

  // Ne réclamer QUE les dossiers non satisfaits. Si tous le sont, il n'y a plus rien à relancer.
  const satisfaits = new Set(e.dossiersSatisfaitsIds);
  const dossiersDus = e.lot.dossiers.filter((d) => !satisfaits.has(d.dossierId));
  if (dossiersDus.length === 0) throw new AucunDossierNonSatisfaitError(e.reference);

  if (variante === 'saisine' && !e.saisineLe) throw new Error('genererRelance : saisineLe est requis pour la variante « saisine »');

  const estEntreprise = e.profil === 'entreprise';
  const plusieurs = dossiersDus.length > 1;
  // La RÉFÉRENCE INTERNE ne figure dans le corps QUE pour une demande entreprise À PLUSIEURS dossiers (un seul dossier → nulle part).
  const inclureRefCorps = estEntreprise && plusieurs;

  const lignesPieces = e.pieces.map((p) => `— la pièce ${p.code}${p.description ? `, ${p.description}` : ''} ;`).join('\n');
  const lignesDossiers = dossiersDus.map(ligneDossier).join('\n');
  const dateEnvoi = dateFr(e.envoyeeLe);
  const dateEcheance = dateFr(e.echeanceLe);
  const historique = e.historique ?? [];
  const service = (e.serviceDestinataire ?? '').trim();

  // ── Blocs communs ──────────────────────────────────────────────────────────
  const fondement = 'en application des articles L311-1 et L311-9 3° du code des relations entre le public et l’administration';
  const excusePreventive = 'À ce jour, je n’ai pas reçu de réponse concernant les documents demandés. Si ce message croisait votre envoi, ou si des pièces m’avaient déjà été transmises sans que j’en aie eu connaissance, je vous prie de bien vouloir excuser cette relance.';
  const refPart = inclureRefCorps ? `, référencée ${e.reference}` : '';
  const introPoint4 = variante === 'saisine'
    ? `Pour mémoire, ma demande du ${dateEnvoi}${refPart} portait, ${fondement}, sur la communication par voie électronique des pièces suivantes :`
    : `Par une demande du ${dateEnvoi}${refPart}, je vous ai demandé, ${fondement}, communication par voie électronique des pièces suivantes concernant ${plusieurs ? 'les dossiers listés ci-dessous' : 'le dossier ci-dessous'} :`;
  const labelDossiers = plusieurs ? 'Dossiers concernés :' : 'Dossier concerné :';
  const offreLien = 'Si les documents sont volumineux, un lien de téléchargement me conviendra parfaitement.';
  const rappelNumeroPermis = 'Merci de bien vouloir rappeler le numéro de permis dans votre réponse.';

  // ── Paragraphe PROPRE À LA VARIANTE (point 6) ────────────────────────────────
  const paraVariante: string[] =
    variante === 'rappel'
      ? [`Le délai d’un mois prévu à l’article R. 311-13 du même code arrive à son terme le ${dateEcheance}. Je me permets de revenir vers vous à l’approche de cette date, afin que vous disposiez du temps nécessaire pour me transmettre les pièces si elles sont disponibles.`]
      : variante === 'avis'
        ? [
            `Le délai d’un mois prévu à l’article R. 311-13 du même code arrive à son terme le ${dateEcheance}. Au-delà de cette date, l’absence de réponse vaut décision implicite de refus, ce qui ouvre la possibilité de saisir la Commission d’accès aux documents administratifs (CADA).`,
            '',
            'Je tenais à vous en informer par avance, afin que vous disposiez du temps nécessaire pour me transmettre les pièces si elles sont disponibles. Une réponse de votre part rendrait cette démarche sans objet.',
          ]
        : [
            'Le délai d’un mois prévu à l’article R. 311-13 est arrivé à son terme ce jour. Cette absence de réponse constitue une décision implicite de refus au sens de l’article R. 311-12.',
            '',
            'Je vous informe que je vais saisir la Commission d’accès aux documents administratifs (CADA), sur le fondement de l’article R. 343-1.',
            '',
            `Je procéderai à cette saisine le ${dateFr(e.saisineLe!)}. Si les pièces me parviennent d’ici là, je n’y donnerai pas suite : c’est la raison pour laquelle je vous adresse ce message plutôt que de saisir la commission dès aujourd’hui.`,
          ];

  // ── Point 8 : clause d'identité (par profil) + adresse de réponse ────────────
  const identiteBloc: string[] = estEntreprise
    ? [
        `${e.config.raisonSociale}, ${e.config.formeJuridique}, dont le siège est ${e.config.siegeAdresse}, représentée par ${e.config.representantNom}${e.config.representantQualite.trim() !== '' ? `, ${e.config.representantQualite}` : ''}.`,
        `Adresse de réponse : ${e.adresseReponse.trim()}${e.config.telephone.trim() !== '' ? `, téléphone ${e.config.telephone.trim()}` : ''}`,
      ]
    : [
        `${e.config.representantNom.trim()}, demeurant ${e.config.siegeAdresse.trim()}.`,
        `Adresse de réponse : ${e.config.emailContact.trim()}.`,
      ];

  // ── Point 9 : renvoi au service compétent (rappel/avis) ; 'saisine' → mise à disposition ─
  const point9 = variante === 'saisine'
    ? 'Je reste à votre disposition pour tout élément qui faciliterait le traitement de cette demande.'
    : 'Si cette demande ne relève pas de votre service, je vous remercie de bien vouloir la transmettre au service compétent.';

  // ── Point 12 : politesse + signature (par profil) ────────────────────────────
  const politesse = estEntreprise
    ? 'Je vous prie d’agréer, Madame, Monsieur, l’expression de ma considération distinguée.'
    : 'Je vous prie d’agréer, Madame, Monsieur, l’expression de mes salutations distinguées.';
  const signature = estEntreprise ? signatureEntreprise(e.config) : [e.config.representantNom.trim()];

  // ── Assemblage (ordre EXACT des 12 points) ───────────────────────────────────
  const parts: string[] = [];
  if (service !== '') parts.push(service, '');                       // 1. service destinataire (conditionnel)
  parts.push('Madame, Monsieur,', '');                              // 2.
  parts.push(excusePreventive, '');                                 // 3. excuse préventive (en tête, identique aux trois)
  parts.push(introPoint4, lignesPieces, '');                        // 4. fondement + désignation complète des pièces
  parts.push(labelDossiers, lignesDossiers, '');                    // 5. dossier(s) DÛ(S) uniquement
  parts.push(...paraVariante, '');                                  // 6. paragraphe propre à la variante
  parts.push(offreLien, '');                                        // 7. offre de lien si volumineux
  parts.push(...identiteBloc, '');                                  // 8. identité (profil) + adresse de réponse + téléphone
  parts.push(point9, '');                                           // 9. renvoi service compétent (ou mise à disposition 'saisine')
  parts.push(rappelNumeroPermis, '');                               // 10. rappel du NUMÉRO DE PERMIS (jamais la référence interne)
  if (historique.length > 0) {                                      // 11. historique en FIN de lettre (juste avant la politesse)
    parts.push('Pour mémoire, nos échanges concernant ce permis :', ...historique.map((h) => `— ${dateFr(h.date)} : ${h.libelle}`), '');
  }
  parts.push(politesse, '', ...signature);                          // 12. politesse + signature

  // ── Objet + bascule référence interne / numéro de permis ─────────────────────
  const prefixe = variante === 'saisine' ? 'Information sur la suite de ma demande' : 'Nouvelle demande de communication de documents administratifs';
  let objet: string;
  if (!plusieurs) {
    // UN SEUL dossier (les DEUX profils) : type + numéro de permis + commune, JAMAIS la référence interne.
    const d = dossiersDus[0];
    const lib = typePermisLibelle(d.type);
    objet = `${prefixe} — ${lib !== '' ? `${lib} ` : ''}n° ${d.numDau} — ${e.lot.communeNom}`;
  } else if (estEntreprise) {
    objet = `${prefixe} — ${e.lot.communeNom} — réf. ${e.reference}`; // entreprise + plusieurs : référence complète (comportement conservé)
  } else {
    objet = prefixe;                                                 // personne + plusieurs : objet générique (comportement conservé)
  }

  return { objet, corps: parts.join('\n') };
}
