/**
 * Constitution des demandes de communication (chantier S7) — logique PURE et testable. ⚠️ CE MODULE N'ENVOIE RIEN :
 * il compose des lots et le TEXTE d'une demande. Aucune I/O réseau, aucun e-mail.
 *
 * ⚠️ RÈGLE JURIDIQUE (à ne pas « améliorer ») : le droit d'accès (CRPA L311-1/L311-9) s'exerce SANS avoir à justifier
 * d'un motif. Le texte n'énonce donc AUCUN motif, aucune justification d'intérêt, aucune mention de l'usage prévu —
 * en exposer un AFFAIBLIRAIT la demande. Les libellés de pièces viennent de la config (`pieces_demandees`), pas du dur.
 */
import type { CanalContact } from './mairieContact';

export interface ConfigDemandeur {
  raisonSociale: string;
  formeJuridique: string;
  siegeAdresse: string;
  representantNom: string;
  representantQualite: string;
  emailContact: string;
  telephone: string;
}

/** Champs d'identité REQUIS (hors telephone) pour qu'une demande quitte 'brouillon' (recours CADA — cf. migration 053). */
const CHAMPS_IDENTITE_REQUIS: { cle: keyof ConfigDemandeur; libelle: string }[] = [
  { cle: 'raisonSociale', libelle: 'raison sociale' },
  { cle: 'formeJuridique', libelle: 'forme juridique' },
  { cle: 'siegeAdresse', libelle: 'adresse du siège' },
  { cle: 'representantNom', libelle: 'nom du représentant' },
  { cle: 'representantQualite', libelle: 'qualité du représentant' },
  { cle: 'emailContact', libelle: 'e-mail de contact' },
];

/** Liste des champs d'identité MANQUANTS (vide = identité complète → la demande peut passer 'prête'). */
export function identiteManquante(c: ConfigDemandeur): string[] {
  return CHAMPS_IDENTITE_REQUIS.filter((f) => (c[f.cle] ?? '').trim() === '').map((f) => f.libelle);
}

// ── Pièces demandées (libellés depuis la config, jamais en dur) ──────────────
export interface Piece { code: string; description: string }
/** Descriptions RÉGLEMENTAIRES connues (le CHOIX des pièces vient de `pieces_demandees` ; ici seulement leur libellé). */
const LIBELLES_PIECES: Record<string, string> = {
  PC2: 'plan de masse coté dans les trois dimensions, prévue à l’article R.431-9 du code de l’urbanisme',
  PC3: 'plan en coupe du terrain et de la construction',
};
export function piecesDepuisConfig(piecesDemandees: string): Piece[] {
  return piecesDemandees.split(',').map((s) => s.trim()).filter((s) => s !== '')
    .map((code) => ({ code, description: LIBELLES_PIECES[code] ?? '' }));
}

// ── Constitution des lots (pure) ─────────────────────────────────────────────
export interface CandidatDossier {
  dossierId: number;
  codeInsee: string;
  communeNom: string | null;
  canal: CanalContact | null;
  numDau: string;
  dateReelleAutorisation: string | null;
  adresse: string;
  cadastre: string[];
}
export interface HistoriqueDemandes {
  /** dossier_id déjà rattachés à une demande NON abandonnée → jamais reproposés. */
  dejaRattaches: ReadonlySet<number>;
  /** nombre de demandes déjà créées CE MOIS-CI, par code_insee (plafond mensuel). */
  demandesCeMoisParCommune: ReadonlyMap<string, number>;
}
export interface ParamsLot { dossiersParDemande: number; demandesParCommuneParMois: number }
export interface Lot { codeInsee: string; communeNom: string; canal: CanalContact; dossiers: CandidatDossier[] }

/**
 * Propose des lots à partir de candidats DÉJÀ ORDONNÉS par priorité (cf. priorite.ts — on ne réordonne pas ici).
 * Exclut : dossiers déjà rattachés ; communes en canal 'inconnu'/absent ou orphelines (communeNom null) — on ne sait
 * pas où envoyer. Groupe par commune, ≤ `dossiersParDemande` dossiers par demande, et au plus `quota` demandes par
 * commune (= plafond mensuel − demandes déjà créées ce mois). PURE : entrées → sortie, aucune base.
 */
export function proposerLots(candidats: CandidatDossier[], params: ParamsLot, hist: HistoriqueDemandes): Lot[] {
  const parCommune = new Map<string, CandidatDossier[]>();
  for (const d of candidats) {
    if (hist.dejaRattaches.has(d.dossierId)) continue;               // déjà demandé
    if (d.communeNom === null || d.canal === null || d.canal === 'inconnu') continue; // non adressable
    (parCommune.get(d.codeInsee) ?? parCommune.set(d.codeInsee, []).get(d.codeInsee)!).push(d);
  }
  const lots: Lot[] = [];
  for (const [code, dossiers] of parCommune) {
    const quota = Math.max(0, params.demandesParCommuneParMois - (hist.demandesCeMoisParCommune.get(code) ?? 0));
    if (quota <= 0) continue;
    const commune = dossiers[0].communeNom!;
    const canal = dossiers[0].canal!;
    for (let i = 0, faits = 0; i < dossiers.length && faits < quota; i += params.dossiersParDemande, faits += 1) {
      lots.push({ codeInsee: code, communeNom: commune, canal, dossiers: dossiers.slice(i, i + params.dossiersParDemande) });
    }
  }
  return lots;
}

// ── Référence + texte ────────────────────────────────────────────────────────
/** Formate SVAV-DEM-AAAA-NNNNNN (6 chiffres). */
export function formaterReferenceDemande(annee: number, n: number): string {
  return `SVAV-DEM-${annee}-${String(n).padStart(6, '0')}`;
}

export interface TexteDemande { objet: string; corps: string }

/**
 * Génère l'objet + le corps d'une demande selon la trame CRPA imposée, en substituant les variables. AUCUN motif ni
 * justification (cf. règle juridique en tête). Les pièces proviennent de la config.
 */
export function genererTexte(lot: Lot, config: ConfigDemandeur, reference: string, pieces: Piece[]): TexteDemande {
  const n = lot.dossiers.length;
  const objet = `Demande de communication de documents administratifs — ${lot.communeNom} — ${n} dossier(s) — réf. ${reference}`;

  const lignesPieces = pieces.map((p) => `— la pièce ${p.code}${p.description ? `, ${p.description}` : ''} ;`).join('\n');
  const lignesDossiers = lot.dossiers.map((d) => {
    const date = d.dateReelleAutorisation ?? 'date inconnue';
    const adresse = d.adresse.trim() !== '' ? d.adresse : 'adresse non précisée';
    const cad = d.cadastre.length ? d.cadastre.join(', ') : 'non précisée(s)';
    return `${d.numDau} — autorisé le ${date} — ${adresse} — parcelle(s) ${cad}`;
  }).join('\n');
  const tel = config.telephone.trim() !== '' ? `, téléphone ${config.telephone.trim()}` : '';

  const corps = [
    'Madame, Monsieur,',
    '',
    'En application des articles L311-1 et L311-9 3° du code des relations entre le public et l’administration, je vous demande communication, par voie électronique, des pièces suivantes pour chacun des dossiers listés ci-dessous :',
    '',
    lignesPieces,
    '',
    'Dossiers concernés :',
    lignesDossiers,
    '',
    `${config.raisonSociale}, ${config.formeJuridique}, dont le siège est ${config.siegeAdresse}, représentée par ${config.representantNom}, ${config.representantQualite}.`,
    `Adresse de réponse : ${config.emailContact}${tel}`,
    '',
    `Je vous remercie de bien vouloir rappeler la référence ${reference} dans votre réponse.`,
    '',
    'Je vous prie d’agréer, Madame, Monsieur, l’expression de ma considération distinguée.',
  ].join('\n');

  return { objet, corps };
}
