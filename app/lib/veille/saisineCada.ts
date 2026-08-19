/**
 * X2 — TEXTE de la SAISINE de la CADA. Module PUR : aucune I/O, aucun import de pg. Compose l'objet + le corps d'une saisine
 * à partir de la demande initiale restée sans réponse, de ses dossiers ENCORE dus et de l'identité du profil demandeur.
 *
 * ⚠️ SOCLE JURIDIQUE EN DUR (même frontière qu'en S40 / genererRelance) : les articles, les formules de fondement et le
 * gabarit de l'objet ne sont PAS éditables à la volée. RÉFÉRENCES — liste CLOSE, AUCUNE AUTRE : CRPA L311-1, L311-9 3°,
 * L311-2, R. 311-12, R. 311-13, R. 343-1, et R.431-9 du code de l'urbanisme (cette dernière via la désignation des pièces).
 *
 * ⚠️ RÈGLE DU PROJET : on rappelle le CONTEXTE FACTUEL (quelle demande, quelle commune, quelle date, restée sans réponse)
 * mais on n'expose JAMAIS le motif ni l'usage prévu des documents — le droit d'accès s'exerce sans se justifier, et l'exposer
 * l'affaiblirait. Aucune date/aucun nom/aucun chiffre inventé : ce qui n'est pas fourni n'est pas imprimé.
 */
import {
  referenceDiscrete, problemesIdentite, dateEnFrancais, signatureEntreprise,
  type Lot, type CandidatDossier, type ConfigDemandeur, type Piece, type ProfilDemandeur,
} from '../sitadel/demande';
import { IdentiteIncompleteError, AucunDossierNonSatisfaitError } from './relance';

export { IdentiteIncompleteError, AucunDossierNonSatisfaitError }; // ré-exportés : même sémantique de refus qu'à la relance

export interface EntreeSaisine {
  reference: string;               // référence de la demande initiale
  profil: ProfilDemandeur;
  communeNom: string;              // commune destinataire de la demande initiale (fait factuel)
  lot: Lot;                        // dossiers de la demande (+ communeNom) — type réutilisé de demande.ts
  dossiersSatisfaitsIds: number[]; // ids des dossiers DÉJÀ obtenus → exclus de la saisine (on ne réclame que les dus)
  config: ConfigDemandeur;         // identité du profil (garde-fou problemesIdentite)
  pieces: Piece[];                 // pièces demandées AVEC leur désignation complète (code + description R.431-9 pour PC2)
  envoyeeLe: Date;                 // envoi RÉEL de la demande initiale (fait passé)
  refusTaciteLe: Date;             // naissance du refus tacite (fenetreCada — fait passé)
}

export interface TexteSaisine { objet: string; corps: string }

/** Date d'un instant en français (« 14 mars 2026 »), en date UTC (cohérent avec echeanceDe). */
function dateFr(d: Date): string {
  return dateEnFrancais(d.toISOString().slice(0, 10));
}

/** Ligne d'UN dossier concerné (rappel factuel), identique à la relance. */
function ligneDossier(d: CandidatDossier): string {
  const villeCP = [d.codePostal, d.communeNom].filter((x) => x !== null && x.trim() !== '').map((x) => x!.trim()).join(' ');
  const lieu = [d.adresse.trim(), villeCP].filter((x) => x !== '').join(', ');
  const cad = d.cadastre.length ? `parcelle(s) ${d.cadastre.join(', ')}` : '';
  return [d.numDau, `autorisé le ${dateEnFrancais(d.dateReelleAutorisation)}`, lieu, cad].filter((x) => x && x.trim() !== '').join(' — ');
}

/**
 * Génère l'objet + le corps d'une saisine CADA. Lève `IdentiteIncompleteError` si l'identité du profil est incomplète, et
 * `AucunDossierNonSatisfaitError` s'il n'y a plus de dossier dû. Le corps, dans l'ordre voulu par R343-1 : identité complète →
 * rappel factuel du contexte → objet + liste détaillée des documents (dossier par dossier) → mention de la pièce jointe →
 * fondement juridique. Le socle juridique (articles/formules) est EN DUR (voir en-tête).
 */
export function genererSaisineCada(e: EntreeSaisine): TexteSaisine {
  const problemes = problemesIdentite(e.config, e.profil);
  if (problemes.length > 0) throw new IdentiteIncompleteError(problemes);

  const satisfaits = new Set(e.dossiersSatisfaitsIds);
  const dossiersDus = e.lot.dossiers.filter((d) => !satisfaits.has(d.dossierId));
  if (dossiersDus.length === 0) throw new AucunDossierNonSatisfaitError(e.reference);

  const lignesPieces = e.pieces.map((p) => `— la pièce ${p.code}${p.description ? `, ${p.description}` : ''} ;`).join('\n');
  const lignesDossiers = dossiersDus.map(ligneDossier).join('\n');
  const dateEnvoi = dateFr(e.envoyeeLe);
  const dateRefus = dateFr(e.refusTaciteLe);

  // ── SOCLE JURIDIQUE EN DUR (non éditable) ──
  const fondement = 'en application des articles L311-1 et L311-9 3° du code des relations entre le public et l’administration';
  const acheves = 'Ces pièces sont des documents administratifs achevés au sens de l’article L311-2 du même code.';
  const constat = `Le délai d’un mois prévu à l’article R. 311-13 du même code, courant à compter de la réception de cette demande, est écoulé depuis le ${dateRefus}. En application de l’article R. 311-12 du même code, le silence gardé par l’administration a fait naître une décision implicite de refus de communication.`;
  const saisine = 'En conséquence, je saisis la Commission d’accès aux documents administratifs, sur le fondement de l’article R. 343-1 du même code.';
  const pieceJointe = 'Une copie de la demande initiale restée sans réponse est jointe à la présente saisine.';

  if (e.profil === 'personne') {
    // Objet GÉNÉRIQUE (aucune référence, aucune commune, aucune marque) ; référence DISCRÈTE dans le seul corps.
    const objet = 'Saisine de la Commission d’accès aux documents administratifs';
    const enTete = [e.config.representantNom, e.config.siegeAdresse, e.config.emailContact]
      .map((x) => x.trim()).filter((x) => x !== '').join('\n');
    const corps = [
      enTete, // identité complète : nom, adresse postale, e-mail
      '',
      'Madame, Monsieur,',
      '',
      `Par une demande du ${dateEnvoi}, j’ai demandé à la commune de ${e.communeNom}, ${fondement}, communication par voie électronique des pièces suivantes concernant les dossiers listés ci-dessous :`,
      lignesPieces,
      '',
      'Dossiers concernés :',
      lignesDossiers,
      '',
      acheves,
      '',
      constat,
      '',
      saisine,
      '',
      `Merci de bien vouloir rappeler la référence ${referenceDiscrete(e.reference)} dans votre réponse.`,
      '',
      pieceJointe,
      '',
      'Je vous prie d’agréer, Madame, Monsieur, l’expression de mes salutations distinguées.',
      '',
      e.config.representantNom.trim(),
    ].join('\n');
    return { objet, corps };
  }

  // Profil ENTREPRISE : identité de société complète (forme, dénomination, siège, représentant) ; référence dans l'objet.
  const objet = `Saisine de la Commission d’accès aux documents administratifs — ${e.communeNom} — réf. ${e.reference}`;
  const identite = `${e.config.raisonSociale}, ${e.config.formeJuridique}, dont le siège est ${e.config.siegeAdresse}, représentée par ${e.config.representantNom}${e.config.representantQualite.trim() !== '' ? `, ${e.config.representantQualite}` : ''}.`;
  const corps = [
    'Madame, Monsieur,',
    '',
    identite, // identité complète de la personne morale
    '',
    `Par une demande du ${dateEnvoi}, référencée ${e.reference}, j’ai demandé à la commune de ${e.communeNom}, ${fondement}, communication par voie électronique des pièces suivantes concernant les dossiers listés ci-dessous :`,
    lignesPieces,
    '',
    'Dossiers concernés :',
    lignesDossiers,
    '',
    acheves,
    '',
    constat,
    '',
    saisine,
    '',
    pieceJointe,
    '',
    'Je vous prie d’agréer, Madame, Monsieur, l’expression de ma considération distinguée.',
    '',
    ...signatureEntreprise(e.config), // FUS — signature du représentant (nom + qualité si renseignée), comme la demande et la relance
  ].join('\n');
  return { objet, corps };
}
