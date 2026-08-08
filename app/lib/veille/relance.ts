/**
 * R6b — BROUILLON de RELANCE à l'échéance. Module PUR : aucune I/O, aucun import de pg ni d'imapflow. Compose UNIQUEMENT le
 * texte (objet + corps) d'une relance ; N'ENVOIE RIEN, ne journalise rien, n'écrit jamais demande.statut.
 *
 * ⚠️ RÉFÉRENCES JURIDIQUES — VÉRIFIÉES, liste CLOSE, AUCUNE AUTRE sous aucun prétexte : L. 311-1 et L. 311-9 3° du CRPA
 * (fondement du droit d'accès, comme le courrier initial), R. 311-12 (le silence vaut refus), R. 311-13 (délai d'un mois à
 * compter de la réception), R. 343-1 (deux mois pour saisir la CADA), et R.431-9 du code de l'urbanisme (désignation de PC2).
 *
 * R6c — la relance est AUTOSUFFISANTE (lue un mois plus tard, sans le courrier initial) et PARTIELLE :
 *  - elle ne liste QUE les dossiers NON satisfaits (les pièces déjà obtenues ne sont plus réclamées) ;
 *  - elle rappelle le fondement (L. 311-1 / L. 311-9 3°) et la désignation COMPLÈTE des pièces (comme le courrier initial).
 *
 * RÈGLES DE FOND héritées du courrier initial (demande.ts, non réimplémenté — on importe ses helpers) :
 *  - AUCUN motif, aucune justification d'intérêt, aucune mention d'usage : le droit d'accès s'exerce sans se justifier ;
 *  - profil PERSONNE = objet GÉNÉRIQUE (sans référence, sans marque, sans commune), référence DISCRÈTE dans le seul corps ;
 *    profil ENTREPRISE = référence complète dans l'objet et le corps ;
 *  - AUCUNE date-calendrier de la relance elle-même (apposée à l'envoi) ; on mentionne seulement des FAITS PASSÉS stables :
 *    la date d'envoi de la demande initiale et la date d'expiration du délai d'un mois ;
 *  - GARDE-FOU IDENTITÉ : pas de texte si l'identité du profil est incomplète (réutilise problemesIdentite).
 */
import {
  referenceDiscrete, problemesIdentite, dateEnFrancais,
  type Lot, type CandidatDossier, type ConfigDemandeur, type Piece, type ProfilDemandeur,
} from '../sitadel/demande';

export interface EntreeRelance {
  reference: string;
  profil: ProfilDemandeur;
  lot: Lot;                       // dossiers de la demande + communeNom (type réutilisé de demande.ts)
  dossiersSatisfaitsIds: number[]; // R6c : ids des dossiers DÉJÀ obtenus → exclus de la relance
  config: ConfigDemandeur;        // identité du profil (garde-fou d'identité)
  pieces: Piece[];                // pièces demandées AVEC leur désignation complète (code + description)
  envoyeeLe: Date;                // envoi RÉEL de la demande initiale (fait passé)
  echeanceLe: Date;               // expiration du délai d'un mois (fait passé, calculé par echeanceDe en amont)
  adresseReponse: string;         // boîte relue (profil entreprise) ; le profil personne répond à l'e-mail en tête
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

/** Ligne d'UN dossier concerné (rappel factuel, pas la trame complète du courrier initial). */
function ligneDossier(d: CandidatDossier): string {
  const villeCP = [d.codePostal, d.communeNom].filter((x) => x !== null && x.trim() !== '').map((x) => x!.trim()).join(' ');
  const lieu = [d.adresse.trim(), villeCP].filter((x) => x !== '').join(', ');
  const cad = d.cadastre.length ? `parcelle(s) ${d.cadastre.join(', ')}` : '';
  return [d.numDau, `autorisé le ${dateEnFrancais(d.dateReelleAutorisation)}`, lieu, cad].filter((x) => x && x.trim() !== '').join(' — ');
}

/**
 * Génère l'objet + le corps d'une relance. Lève `IdentiteIncompleteError` si l'identité est incomplète (aucun texte). Le
 * corps constate l'écoulement du délai d'un mois (R. 311-13), le refus tacite né du silence (R. 311-12), renouvelle la
 * demande par voie électronique, et mentionne — en une phrase neutre — la saisine possible de la CADA sous deux mois (R. 343-1).
 */
export function genererRelance(e: EntreeRelance): TexteRelance {
  const problemes = problemesIdentite(e.config, e.profil);
  if (problemes.length > 0) throw new IdentiteIncompleteError(problemes);

  // R6c — ne réclamer QUE les dossiers non satisfaits. Si tous le sont, il n'y a plus rien à relancer.
  const satisfaits = new Set(e.dossiersSatisfaitsIds);
  const dossiersDus = e.lot.dossiers.filter((d) => !satisfaits.has(d.dossierId));
  if (dossiersDus.length === 0) throw new AucunDossierNonSatisfaitError(e.reference);

  // Désignation COMPLÈTE des pièces (code + description réglementaire), comme le courrier initial.
  const lignesPieces = e.pieces.map((p) => `— la pièce ${p.code}${p.description ? `, ${p.description}` : ''} ;`).join('\n');
  const lignesDossiers = dossiersDus.map(ligneDossier).join('\n');
  const dateEnvoi = dateFr(e.envoyeeLe);
  const dateEcheance = dateFr(e.echeanceLe);

  // Rappel du FONDEMENT (L311-1 / L311-9 3°), comme le courrier initial — la relance est autosuffisante.
  const fondement = 'en application des articles L311-1 et L311-9 3° du code des relations entre le public et l’administration';
  // Constat commun — SOCLE JURIDIQUE vérifié (R. 311-13 puis R. 311-12).
  const constat = `Le délai d’un mois prévu à l’article R. 311-13 du code des relations entre le public et l’administration, courant à compter de la réception de cette demande, est écoulé depuis le ${dateEcheance}. En application de l’article R. 311-12 du même code, le silence gardé par l’administration a fait naître une décision de refus.`;
  // Mention CADA — une phrase neutre, sans agressivité (R. 343-1).
  const cada = 'À défaut de réponse, la Commission d’accès aux documents administratifs pourra être saisie dans le délai de deux mois prévu à l’article R. 343-1 du même code.';

  if (e.profil === 'personne') {
    // Objet GÉNÉRIQUE (aucune référence, aucune marque, aucune commune) ; référence DISCRÈTE dans le seul corps.
    const objet = 'Relance — demande de communication de documents administratifs';
    const enTete = [e.config.representantNom, e.config.siegeAdresse, e.config.emailContact]
      .map((x) => x.trim()).filter((x) => x !== '').join('\n');
    const corps = [
      enTete,
      '',
      'Madame, Monsieur,',
      '',
      `Par une demande du ${dateEnvoi}, je vous ai demandé, ${fondement}, communication par voie électronique des pièces suivantes concernant les dossiers listés ci-dessous :`,
      lignesPieces,
      '',
      'Dossiers concernés :',
      lignesDossiers,
      '',
      constat,
      '',
      'Je renouvelle cette demande de communication, par voie électronique, à l’adresse figurant en tête de la présente.',
      '',
      `Merci de bien vouloir rappeler la référence ${referenceDiscrete(e.reference)} dans votre réponse.`,
      '',
      cada,
      '',
      'Je vous prie d’agréer, Madame, Monsieur, l’expression de mes salutations distinguées.',
      '',
      e.config.representantNom.trim(),
    ].join('\n');
    return { objet, corps };
  }

  // Profil ENTREPRISE : référence COMPLÈTE dans l'objet et le corps ; identité de société ; adresse de réponse = boîte relue.
  const objet = `Relance — demande de communication de documents administratifs — ${e.lot.communeNom} — réf. ${e.reference}`;
  const tel = e.config.telephone.trim() !== '' ? `, téléphone ${e.config.telephone.trim()}` : '';
  const identite = `${e.config.raisonSociale}, ${e.config.formeJuridique}, dont le siège est ${e.config.siegeAdresse}, représentée par ${e.config.representantNom}${e.config.representantQualite.trim() !== '' ? `, ${e.config.representantQualite}` : ''}.`;
  const corps = [
    'Madame, Monsieur,',
    '',
    `Par une demande du ${dateEnvoi}, référencée ${e.reference}, je vous ai demandé, ${fondement}, communication par voie électronique des pièces suivantes concernant les dossiers listés ci-dessous :`,
    lignesPieces,
    '',
    'Dossiers concernés :',
    lignesDossiers,
    '',
    constat,
    '',
    'Je renouvelle cette demande de communication, par voie électronique.',
    identite,
    `Adresse de réponse : ${e.adresseReponse.trim()}${tel}`,
    '',
    cada,
    '',
    'Je vous prie d’agréer, Madame, Monsieur, l’expression de ma considération distinguée.',
  ].join('\n');
  return { objet, corps };
}
