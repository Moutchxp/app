/**
 * Constitution des demandes de communication (chantier S7) — logique PURE et testable. ⚠️ CE MODULE N'ENVOIE RIEN :
 * il compose des lots et le TEXTE d'une demande. Aucune I/O réseau, aucun e-mail.
 *
 * ⚠️ RÈGLE JURIDIQUE (à ne pas « améliorer ») : le droit d'accès (CRPA L311-1/L311-9) s'exerce SANS avoir à justifier
 * d'un motif. Le texte n'énonce donc AUCUN motif, aucune justification d'intérêt, aucune mention de l'usage prévu —
 * en exposer un AFFAIBLIRAIT la demande. Les libellés de pièces viennent de la config (`pieces_demandees`), pas du dur.
 */
import { type CanalContact, emailValide } from './mairieContact';

export interface ConfigDemandeur {
  raisonSociale: string;
  formeJuridique: string;
  siegeAdresse: string;
  representantNom: string;
  representantQualite: string;
  emailContact: string;
  telephone: string;
}

/**
 * Contrôles de PLAUSIBILITÉ de l'identité (hors telephone) requis pour qu'une demande quitte 'brouillon'. Au-delà du
 * simple non-vide (S7), on refuse aussi : e-mail au format invalide, longueur invraisemblable, et — pour raison sociale,
 * nom et adresse du siège — une valeur ENTIÈREMENT EN CAPITALES (souvent un texte de substitution non renseigné).
 * Chaque problème NOMME le champ ET la raison. Vide = identité plausible.
 */
const CONTROLES_IDENTITE: { cle: keyof ConfigDemandeur; libelle: string; min: number; capitales: boolean }[] = [
  { cle: 'raisonSociale', libelle: 'raison sociale', min: 2, capitales: true },
  { cle: 'formeJuridique', libelle: 'forme juridique', min: 2, capitales: false },
  { cle: 'siegeAdresse', libelle: 'adresse du siège', min: 8, capitales: true },
  { cle: 'representantNom', libelle: 'nom du représentant', min: 3, capitales: true },
  { cle: 'representantQualite', libelle: 'qualité du représentant', min: 2, capitales: false },
];

/** Une valeur est « entièrement en capitales » si elle contient des lettres mais AUCUNE minuscule. */
function toutEnCapitales(s: string): boolean {
  return /\p{Lu}/u.test(s) && !/\p{Ll}/u.test(s);
}

/** Problèmes d'identité (champ + raison), vide si plausible. Remplace l'ancien contrôle « non vide ». */
export function problemesIdentite(c: ConfigDemandeur): string[] {
  const p: string[] = [];
  for (const ctl of CONTROLES_IDENTITE) {
    const v = (c[ctl.cle] ?? '').trim();
    if (v === '') { p.push(`${ctl.libelle} : requis`); continue; }
    if (v.length < ctl.min) { p.push(`${ctl.libelle} : trop court pour être crédible`); continue; }
    if (ctl.capitales && toutEnCapitales(v)) p.push(`${ctl.libelle} : entièrement en capitales (valeur de substitution ?)`);
  }
  const email = (c.emailContact ?? '').trim();
  if (email === '') p.push('e-mail de contact : requis');
  else if (!emailValide(email)) p.push('e-mail de contact : format invalide');
  return p;
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
  codePostal: string | null;
  cadastre: string[];
}
export interface HistoriqueDemandes {
  /** dossier_id déjà rattachés à une demande NON abandonnée → jamais reproposés. */
  dejaRattaches: ReadonlySet<number>;
  /** nombre de demandes déjà créées CE MOIS-CI, par code_insee (plafond mensuel). */
  demandesCeMoisParCommune: ReadonlyMap<string, number>;
}
export interface ParamsLot {
  dossiersParDemande: number;
  demandesParCommuneParMois: number;
  /** Date d'autorisation minimale ('AAAA-MM-JJ', = aujourd'hui − anciennete_max). `null` = pas de borne (jamais en prod). */
  dateMin: string | null;
}
export interface Lot { codeInsee: string; communeNom: string; canal: CanalContact; dossiers: CandidatDossier[] }

/**
 * Propose des lots à partir de candidats DÉJÀ ORDONNÉS par priorité (cf. priorite.ts — on ne réordonne pas ici).
 * Exclut : dossiers HORS FENÊTRE d'ancienneté (date < `dateMin`) ou SANS DATE d'autorisation (pertinence non jugeable —
 * la cible d'une demande est un bâtiment que le LiDAR ne voit pas encore ; au-delà, la hauteur est déjà mesurée) ;
 * dossiers déjà rattachés ; communes en canal 'inconnu'/absent ou orphelines (communeNom null). Groupe par commune,
 * ≤ `dossiersParDemande` par demande, au plus `quota` demandes/commune (= plafond mensuel − demandes du mois). PURE.
 */
export function proposerLots(candidats: CandidatDossier[], params: ParamsLot, hist: HistoriqueDemandes): Lot[] {
  const parCommune = new Map<string, CandidatDossier[]>();
  for (const d of candidats) {
    if (d.dateReelleAutorisation === null) continue;                 // sans date → pertinence non jugeable → exclu
    if (params.dateMin !== null && d.dateReelleAutorisation < params.dateMin) continue; // trop ancien → déjà mesuré au LiDAR
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

// ── Aides d'INTERFACE (pures, S7b) ───────────────────────────────────────────
/** Ancre/cible du détail d'une demande — NON VIDE pour un id réel (garde contre un lien mort/vide). */
export function ancreDetail(id: number): string {
  return Number.isInteger(id) && id > 0 ? `demande-${id}` : '';
}

/** Décision de transition d'un LOT : passer 'prete' exige une identité plausible (sinon champs+raisons → aucune écriture). */
export function peutPasserLot(statut: 'prete' | 'abandonnee', config: ConfigDemandeur): { ok: boolean; champs: string[] } {
  if (statut === 'prete') { const champs = problemesIdentite(config); return { ok: champs.length === 0, champs }; }
  return { ok: true, champs: [] };
}

/** Compteurs expliquant l'absence de lots (mesurés, jamais figés). */
export interface DiagnosticProposition {
  candidatsExamines: number;
  dossiersHorsFenetre: number;
  dossiersDejaRattaches: number;
  communesSansCanal: number;
  communesPlafondMensuel: number;
}

/**
 * Message expliquant POURQUOI 0 lot, à partir des compteurs RÉELS (jamais un texte générique). '' si des lots existent.
 */
export function expliquerProposition(nbLots: number, d: DiagnosticProposition): string {
  if (nbLots > 0) return '';
  const raisons: string[] = [];
  if (d.dossiersHorsFenetre > 0) raisons.push(`${d.dossiersHorsFenetre} dossier(s) hors fenêtre d'ancienneté (déjà mesurés au LiDAR) ou sans date`);
  if (d.dossiersDejaRattaches > 0) raisons.push(`${d.dossiersDejaRattaches} dossier(s) déjà rattaché(s) à une demande`);
  if (d.communesPlafondMensuel > 0) raisons.push(`plafond mensuel atteint pour ${d.communesPlafondMensuel} commune(s)`);
  if (d.communesSansCanal > 0) raisons.push(`${d.communesSansCanal} commune(s) sans canal de contact connu`);
  const base = `Aucun lot à proposer sur ${d.candidatsExamines} dossier(s) examiné(s) en tête de classement`;
  return raisons.length ? `${base} : ${raisons.join(' ; ')}.` : `${base}.`;
}

const MOIS_FR = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
/** Date d'autorisation en toutes lettres : '2017-03-14' → « 14 mars 2017 ». `null`/invalide → « date inconnue »/valeur brute. */
export function dateEnFrancais(iso: string | null): string {
  if (!iso) return 'date inconnue';
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return iso;
  const mois = Number(m[2]) - 1;
  if (mois < 0 || mois > 11) return iso;
  return `${Number(m[3])} ${MOIS_FR[mois]} ${m[1]}`;
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
    // Commune + code postal, en plus de l'adresse. ⚠️ l'adresse (libellé de voie tronqué à 26 c par Sitadel) est
    // transmise TELLE QUELLE — on ajoute seulement les autres éléments d'identification autour.
    const villeCP = [d.codePostal, d.communeNom].filter((x) => x !== null && x.trim() !== '').map((x) => x!.trim()).join(' ');
    const adresse = d.adresse.trim();
    const cad = d.cadastre.length ? `parcelle(s) ${d.cadastre.join(', ')}` : '';
    const segments = [d.numDau, `autorisé le ${dateEnFrancais(d.dateReelleAutorisation)}`];
    if (adresse !== '') {
      segments.push([adresse, villeCP].filter((x) => x !== '').join(', '));
      if (cad) segments.push(cad);
    } else {
      // Pas d'adresse : la ligne s'appuie explicitement sur les parcelles (+ commune/CP), sans vide ni tiret orphelin.
      const secours = [villeCP, cad].filter((x) => x !== '').join(', ');
      if (secours) segments.push(secours);
    }
    return segments.join(' — ');
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
