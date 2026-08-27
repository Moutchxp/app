/**
 * Accès données des demandes de communication (chantier S7). ⚠️ N'ENVOIE RIEN. Lit les candidats (top du classement),
 * propose des lots (via `demande.ts`), crée/liste/lit les demandes, édite le corps, change le statut EN JOURNALISANT.
 * Le destinataire est FIGÉ à la création (copie de mairie_contact) — auditabilité.
 */
import { query, withTransaction } from '../db/client';
import { chargerConfigVeille, type ConfigVeille } from './veilleConfig';
import { lireDossiersPriorite, lireDossiersDepuis, type DossierAffiche } from './veilleRepo';
import type { CanalContact } from './mairieContact';
import {
  type CandidatDossier, type ConfigDemandeur, type Lot, type HistoriqueDemandes, type DiagnosticProposition, type ParamsLot,
  type ProfilDemandeur,
  proposerLots, genererTexte, piecesDepuisConfig, formaterReferenceDemande, problemesIdentite, profilValide, ETIQUETTE_PROFIL,
  configAvecSignataire, apparierSelection, profilEffectifLot, raisonInexploitable,
  verdictAnnulation, RAISON_REFUS_ANNULATION,
} from './demande';
import { type Collaborateur, choisirCollaborateur } from './collaborateur';
import { resoudreDestination, type ContactCommune } from './destinataire';
import { expressionRangSql, classer, libelleNatureProjet, type CleCategorie } from './priorite'; // D2 : expressionRangSql réutilisé (pur) ; Q2b : classer = source unique de catégorie ; N1-B : libelleNatureProjet traduit le code nature
import type { SourceFichePermis } from '../pdf/fichePermisPdf'; // N1-B : type SEUL (le générateur PDF pdfkit n'entre jamais dans le graphe statique)
import { MARQUEUR_FICHE_SYNTHESE, PREFIXE_NOTE_VERSEMENT_AUTO } from '../permis/gedConstantes'; // N1-B/N4/N6-F : sentinelle fiche + préfixe versement auto (source unique)
import { agregerStock, moisDePeriode, type LigneStock, type DossierStock } from './stock'; // Q2b : agrégat PUR du stock (réutilise estCandidatEligible via agregerStock)
import { lireClePiece } from '../veille/demandeReponseRepo'; // A1b : réutilisé par le dispatcher unique de lecture de clé (pas de 2e implémentation)
import { resoudreDepotPresume } from '../veille/depotPresume'; // LOT B1 : résout la présomption de dépôt téléservice au geste terminal (dépôt/annulation)

type Requete = <R = Record<string, unknown>>(text: string, params?: unknown[]) => Promise<{ rows: R[] }>;
const asQ = (q: (t: string, p?: unknown[]) => Promise<unknown>): Requete => ((t, p) => q(t, p)) as Requete;

// V2 — la profondeur de candidats examinés (ex-const NB_CANDIDATS=600) est désormais LUE de la config (cfg.nbCandidatsExamines,
// config_veille, migration 081) : plus aucune valeur recopiée en dur dans le chemin de sélection.

function adresseDe(d: DossierAffiche): string {
  return [d.adrNumTer, d.adrLibvoieTer, d.adrLocaliteTer].filter((x) => x && x.trim() !== '').join(' ');
}
/** Contact brut d'un dossier (mairie_contact + PRADA) pour la résolution unique du destinataire (S14d). */
function contactDe(d: DossierAffiche): ContactCommune {
  return {
    contactCanal: d.destCanal, contactStatut: d.destStatut, contactEmail: d.destEmail,
    contactUrlFormulaire: d.destUrlFormulaire, contactAdressePostale: d.destAdressePostale,
    pradaCourriel: d.destPradaCourriel, pradaImportId: d.destPradaImportId, pradaNom: d.destPradaNom,
  };
}

function versCandidat(d: DossierAffiche): CandidatDossier {
  // S14d : le canal utilisé par proposerLots (adressabilité) est le canal RÉSOLU — une commune 'inconnu' porteuse d'une
  // PRADA au courriel non vide (et contact 'presume') devient 'email' et cesse donc d'être exclue.
  const dest = resoudreDestination(contactDe(d));
  return {
    dossierId: d.id, codeInsee: d.codeInsee, communeNom: d.communeNom, canal: dest.canal,
    type: d.type, // U2 : type d'autorisation (PC/PD) pour la référence téléservice
    numDau: d.numDau, dateReelleAutorisation: d.dateReelleAutorisation, adresse: adresseDe(d), codePostal: d.adrCodpostTer, cadastre: d.cadastre,
    etatDau: d.etatDau, absentDuDernierMillesime: !d.vuAuDernier, arbitragePrada: dest.arbitragePrada,
    destOrigine: dest.origine, destNom: dest.nom,
    maxDossiersParDemande: d.maxDossiersParDemande ?? null, profilImpose: d.profilImpose ?? null, // P3 : contraintes téléservice de la commune
  };
}

/** Borne d'ancienneté : aujourd'hui − `annees` (format 'AAAA-MM-JJ'). Au-delà, la hauteur est déjà mesurée au LiDAR. */
function dateMinDepuis(annees: number): string {
  const d = new Date();
  d.setFullYear(d.getFullYear() - annees);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
/** Q2b — borne en MOIS : aujourd'hui − `mois` (format 'AAAA-MM-JJ'). `setMonth` négatif retombe sur l'année précédente. */
function dateMinMois(mois: number): string {
  const d = new Date();
  d.setMonth(d.getMonth() - mois);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
/**
 * Q4 — `ancienneteMois` (état d'écran, DÉJÀ borné par la route via `bornerAncienneteMois`) raccourcit la fenêtre passée à
 * l'éligibilité : AU MAXIMUM (ou absent) → `dateMinDepuis(anciennete_max)`, EXACTEMENT le comportement d'avant Q4
 * (byte-identique) ; en deçà → `dateMinMois(ancienneteMois)`. Réutilise les DEUX helpers existants, n'en crée pas un
 * troisième. Ne touche NI l'éligibilité (estCandidatEligible) NI le réglage anciennete_max lui-même — seulement la DATE passée.
 */
export function paramsLot(cfg: ConfigVeille, ancienneteMois?: number): ParamsLot {
  const maxMois = 12 * cfg.ancienneteMaxDemandeAnnees;
  const mois = ancienneteMois ?? maxMois;
  const dateMin = mois >= maxMois ? dateMinDepuis(cfg.ancienneteMaxDemandeAnnees) : dateMinMois(mois);
  return { dossiersParDemande: cfg.dossiersParDemande, permisParCommuneParMois: cfg.permisParCommuneParMois, dateMin };
}

/** Identité d'un profil (défaut 'entreprise'). Ligne absente → champs vides (jamais d'exception). */
export async function lireConfigDemandeur(profil: ProfilDemandeur = 'entreprise'): Promise<ConfigDemandeur> {
  const r = await query<{ raison_sociale: string; forme_juridique: string; siege_adresse: string; representant_nom: string; representant_qualite: string; email_contact: string; telephone: string }>(
    `SELECT raison_sociale, forme_juridique, siege_adresse, representant_nom, representant_qualite, email_contact, telephone FROM config_demandeur WHERE profil = $1`,
    [profil],
  );
  const x = r.rows[0] ?? { raison_sociale: '', forme_juridique: '', siege_adresse: '', representant_nom: '', representant_qualite: '', email_contact: '', telephone: '' };
  return {
    raisonSociale: x.raison_sociale, formeJuridique: x.forme_juridique, siegeAdresse: x.siege_adresse,
    representantNom: x.representant_nom, representantQualite: x.representant_qualite, emailContact: x.email_contact, telephone: x.telephone,
  };
}

/**
 * Historique : dossiers déjà rattachés (demande active) + nombre de PERMIS (dossiers) déjà demandés ce mois par commune QUI
 * COMPTENT pour le plafond mensuel.
 * ⚠️ Q1 — le plafond `permis_par_commune_par_mois` borne la SOLLICITATION RÉELLE d'une mairie EN NOMBRE DE PERMIS, quel que
 * soit le nombre de courriers/dépôts que cela représente : on compte donc les DOSSIERS (via demande_dossier), pas les
 * demandes. Seules les demandes RÉELLEMENT PARTIES le consomment → `statut IN ('envoyee','close')` (une 'brouillon'/'prete'/
 * 'annulee' ne sollicite PAS la commune). AUCUN ENVOI n'existe encore : ce comptage est donc nul aujourd'hui — c'est voulu.
 */
/**
 * Q3-B — dossiers qui comptent comme « déjà demandés » (alimente `dejaRattaches`). Le stock reflète le TRAVAIL RESTANT : un
 * rattachement actif cesse de compter quand la tentative est SOLDÉE SANS DOCUMENTS — demande 'close' sans satisfait_le ni
 * dossier_document, OU triage='refus_mairie' — pour que le permis REVIENNE demandable. Corrigé par la LECTURE (aucune écriture
 * de `actif` : la colonne garde ses deux intentions existantes). INVARIANT INVIOLABLE : un dossier OBTENU (satisfait_le sur un
 * rattachement actif OU ≥ 1 dossier_document) compte TOUJOURS, quelle que soit sa demande → un permis obtenu ne revient JAMAIS.
 * Exporté pour être joué À L'IDENTIQUE par le test d'intégration (aucune dérive entre le code et sa preuve).
 */
export const SQL_DOSSIERS_DEJA_DEMANDES =
  `SELECT DISTINCT dd.dossier_id
     FROM demande_dossier dd JOIN demande d ON d.id = dd.demande_id
    WHERE dd.actif AND (
          EXISTS (SELECT 1 FROM demande_dossier s WHERE s.dossier_id = dd.dossier_id AND s.actif AND s.satisfait_le IS NOT NULL)
       OR EXISTS (SELECT 1 FROM dossier_document doc WHERE doc.dossier_id = dd.dossier_id)
       OR (d.statut <> 'close' AND dd.triage IS DISTINCT FROM 'refus_mairie')
    )`;

async function lireHistorique(): Promise<HistoriqueDemandes> {
  const [att, mois] = await Promise.all([
    query<{ dossier_id: number }>(SQL_DOSSIERS_DEJA_DEMANDES),
    query<{ code_insee: string; n: number }>(
      `SELECT d.code_insee, count(dd.dossier_id)::int AS n
         FROM demande d JOIN demande_dossier dd ON dd.demande_id = d.id
        WHERE d.statut IN ('envoyee', 'close') AND date_trunc('month', d.cree_le) = date_trunc('month', now())
        GROUP BY d.code_insee`,
    ),
  ]);
  return {
    dejaRattaches: new Set(att.rows.map((r) => r.dossier_id)),
    permisCeMoisParCommune: new Map(mois.rows.map((r) => [r.code_insee, r.n])),
  };
}

/** Compteurs expliquant l'absence de lots — MÊME logique d'exclusion que proposerLots (sans le toucher). */
export function diagnostiquer(candidats: CandidatDossier[], hist: HistoriqueDemandes, params: ParamsLot): DiagnosticProposition {
  const sansCanal = new Set<string>();
  const formulaire = new Map<string, string>(); // S16 : code_insee → Nom (à déposer à la main — PRODUIT des lots)
  const courrier = new Map<string, string>();    // S16 : code_insee → Nom (écartée faute d'adresse e-mail)
  const parCommune = new Map<string, number>();
  const arbitrages = new Set<string>(); // S14d : communes PRADA-disponible mais contact 'confirme' conservé
  let rattaches = 0, horsFenetre = 0, annules = 0, absents = 0;
  for (const d of candidats) {
    // S14d — arbitrage relevé indépendamment des exclusions de dossiers (il concerne la config du destinataire, pas la
    // fenêtre) : jamais de bascule silencieuse d'un contact confirmé.
    if (d.arbitragePrada) arbitrages.add(d.communeNom ?? d.codeInsee);
    // Q2a — MÊME définition d'éligibilité que proposerLots (`raisonInexploitable`, plus de duplication). Le premier critère
    // qui échoue donne la raison ; chaque bucket ci-dessous en découle. communeNom est non-null dès que raison ≠ 'sans_canal'.
    const raison = raisonInexploitable(d, params.dateMin, hist.dejaRattaches);
    if (raison === 'annule') { annules += 1; continue; }
    if (raison === 'absent') { absents += 1; continue; }
    if (raison === 'hors_fenetre') { horsFenetre += 1; continue; }
    if (raison === 'deja_rattache') { rattaches += 1; continue; }
    if (raison === 'sans_canal') { sansCanal.add(d.codeInsee); continue; }
    if (raison === 'courrier') { courrier.set(d.codeInsee, d.communeNom!); continue; }         // S16 : écartée (pas de lot)
    if (d.canal === 'formulaire') formulaire.set(d.codeInsee, d.communeNom!);                    // S16 : à déposer — MAIS produit un lot
    parCommune.set(d.codeInsee, (parCommune.get(d.codeInsee) ?? 0) + 1);
  }
  let plafond = 0;
  for (const code of parCommune.keys()) {
    if (params.permisParCommuneParMois - (hist.permisCeMoisParCommune.get(code) ?? 0) <= 0) plafond += 1;
  }
  return {
    candidatsExamines: candidats.length, dossiersAnnules: annules, dossiersAbsents: absents, dossiersHorsFenetre: horsFenetre,
    dossiersDejaRattaches: rattaches, communesSansCanal: sansCanal.size, communesPlafondMensuel: plafond,
    communesFormulaire: [...formulaire.values()].sort(),
    communesCourrier: [...courrier.values()].sort(),
    arbitragesPrada: [...arbitrages].sort(),
  };
}

/** Lots PROPOSÉS (aucune écriture) + diagnostic (pour expliquer un « 0 lot ») — pour revue avant création. */
export async function proposition(cfg: ConfigVeille, ancienneteMois?: number): Promise<{ lots: Lot[]; diagnostic: DiagnosticProposition }> {
  const [dossiers, hist] = await Promise.all([lireDossiersPriorite(cfg, cfg.nbCandidatsExamines), lireHistorique()]);
  const candidats = dossiers.map(versCandidat);
  const params = paramsLot(cfg, ancienneteMois); // Q4 : fenêtre d'ancienneté d'écran (bornée), défaut = maximum du réglage
  return { lots: proposerLots(candidats, params, hist), diagnostic: diagnostiquer(candidats, hist, params) };
}

// ── Q2b : STOCK de permis encore à demander, par commune et par type (LECTURE SEULE) ─────────────────────────────────
export interface StockResultat { lignes: LigneStock[]; tronque: boolean; genereEnMs: number; fenetreMois: number }

/**
 * Q2b/Q4 — STOCK par commune. `fenetreMois` (OBLIGATOIRE — Q4-fix écart 3 : un seul défaut, celui du bornage de la route via
 * `bornerAncienneteMois`, plus de second défaut ici) est la fenêtre d'AFFICHAGE. On charge UNIQUEMENT cette fenêtre, mappe
 * chaque dossier en candidat via le MÊME `versCandidat` que la proposition (résolution destinataire/canal IDENTIQUE), et
 * agrège par `agregerStock` — qui applique `estCandidatEligible` (l'UNIQUE définition d'éligibilité, Q2a) + la borne
 * d'affichage. Charger la seule fenêtre d'affichage suffit : la colonne « < N mois » ne peut contenir de dossier plus ancien,
 * et l'éligibilité complète reste appliquée → équivalent à tout charger, en moins de lignes. `genereEnMs` = temps de
 * génération (transparence de perf). NE touche ni le chemin candidats ni la base.
 */
export async function stockPermisParCommune(cfg: ConfigVeille, fenetreMois: number): Promise<StockResultat> {
  const t0 = Date.now();
  const dateMin = dateMinDepuis(cfg.ancienneteMaxDemandeAnnees); // borne d'ÉLIGIBILITÉ (inchangée — passée à estCandidatEligible)
  const dateMinFenetre = dateMinMois(fenetreMois);              // Q4 — borne d'AFFICHAGE = fenêtre du filtre (bornée par la route)
  const [{ lignes, tronque }, hist] = await Promise.all([lireDossiersDepuis(cfg, dateMinFenetre), lireHistorique()]);
  const dossiers: DossierStock[] = lignes.map((d) => ({ candidat: versCandidat(d), categorie: d.categorie }));
  const stock = agregerStock(dossiers, dateMin, hist.dejaRattaches, dateMinFenetre);
  if (tronque) console.warn('[permis/stock] plafond de chargement atteint — stock possiblement incomplet (réduire la fenêtre ou passer à un agrégat SQL)');
  return { lignes: stock, tronque, genereEnMs: Date.now() - t0, fenetreMois };
}

/** Q2b — un permis délivré (panneau de détail) : identité + type + s'il est DÉJÀ demandé (réf. de la demande active), sinon à demander. */
export interface PermisDetail {
  numDau: string; date: string | null; adresse: string;
  categorie: CleCategorie; libelleCategorie: string;
  demandeReference: string | null; // réf. de la demande ACTIVE rattachée (déjà demandé), sinon null (encore à demander)
}

/**
 * Q2b — LISTE des permis DÉLIVRÉS (date d'autorisation non nulle) d'UNE commune, pour le panneau de détail. Chargée à
 * l'ouverture du panneau, pour cette commune seule. `periodeCle` borne la date (défaut 6 mois → jusqu'à « origine » = tout) ;
 * `cle` filtre par type (null = tous). Le drapeau « déjà demandé » vient d'une jointure LATÉRALE sur la demande ACTIVE (même
 * sémantique que `expressionRattachementSql` : rattaché ⇔ une `demande_dossier` active existe) — la référence est celle de
 * cette demande. La catégorie réutilise `classer` (source unique). LECTURE SEULE ; ne touche pas le chemin candidats.
 */
export async function lireDetailPermisCommune(cfg: ConfigVeille, codeInsee: string, periodeCle: string | null, cle: CleCategorie | null): Promise<PermisDetail[]> {
  const mois = moisDePeriode(periodeCle);
  const params: unknown[] = [codeInsee];
  let filtreDate = '';
  if (mois !== null) { params.push(dateMinMois(mois)); filtreDate = ` AND d.date_reelle_autorisation >= $${params.length}`; }
  const { rows } = await query<{
    type: 'PC' | 'PD'; num_dau: string; date: string | null; nature_projet_completee: string | null;
    i_extension: boolean | null; i_surelevation: boolean | null; nb_lgt_tot_crees: number | null; surf_creee: string | number | null;
    adr_num_ter: string | null; adr_libvoie_ter: string | null; adr_localite_ter: string | null; demande_reference: string | null;
  }>(
    `SELECT d.type, d.num_dau, d.date_reelle_autorisation::text AS date,
            d.nature_projet_completee, d.i_extension, d.i_surelevation, d.nb_lgt_tot_crees, d.surf_creee,
            d.adr_num_ter, d.adr_libvoie_ter, d.adr_localite_ter,
            rat.reference AS demande_reference
       FROM sitadel_dossier d
       LEFT JOIN LATERAL (
         SELECT dm.reference FROM demande_dossier dd JOIN demande dm ON dm.id = dd.demande_id
          WHERE dd.dossier_id = d.id AND dd.actif LIMIT 1
       ) rat ON true
      WHERE d.code_insee = $1 AND d.date_reelle_autorisation IS NOT NULL${filtreDate}
      ORDER BY d.date_reelle_autorisation DESC, d.num_dau`,
    params,
  );
  return rows
    .map((r) => {
      const cl = classer(
        { type: r.type, natureProjetCompletee: r.nature_projet_completee, iExtension: r.i_extension, iSurelevation: r.i_surelevation, nbLgtTotCrees: r.nb_lgt_tot_crees, surfCreee: r.surf_creee === null ? null : Number(r.surf_creee) },
        cfg,
      );
      return {
        numDau: r.num_dau, date: r.date,
        adresse: [r.adr_num_ter, r.adr_libvoie_ter, r.adr_localite_ter].map((x) => (x ?? '').trim()).filter((x) => x !== '').join(' '),
        categorie: cl.cle, libelleCategorie: cl.libelle, demandeReference: r.demande_reference ?? null,
      };
    })
    .filter((p) => cle === null || p.categorie === cle);
}

// ── A1a : ARCHIVES — permis RENSEIGNÉS par les mairies (dossier satisfait) + leurs pièces (LECTURE SEULE) ───────────────
/**
 * Une pièce d'un permis archivé. ⚠️ `cle_stockage` N'EST JAMAIS exposée : seul un booléen `deposee` (téléchargeable ?) sort de
 * la base — la clé ne quitte jamais le serveur. Le téléchargement passe par l'action `url_piece` (signature serveur unique).
 */
export interface PieceArchive {
  id: number;                    // id de la pièce (demande_reponse_piece OU dossier_document selon `origine`) — passé à url_piece pour signer l'URL (jamais la clé)
  nomFichier: string;
  typeMime: string | null;
  tailleOctets: number | null;
  deposee: boolean;              // cle_stockage IS NOT NULL → téléchargeable
  motifNonStocke: string | null; // renseigné si NON déposée (jamais un bouton mort côté écran)
  // A1b : 'email' (registre, non supprimable) · 'manuel' (ajoutée à la main, supprimable) · N1-B 'genere' (fiche, non supprimable,
  // régénérée) · N6-F 'auto' (versée automatiquement, SUPPRIMABLE — un versement auto peut se tromper).
  origine: 'email' | 'manuel' | 'genere' | 'auto';
  recuLe: string | null;         // T5 : date de la réponse porteuse (email) → étiquette « reçues le JJ/MM » ; NULL pour un document manuel
  objet: string | null;          // T5 : objet de la réponse porteuse (email) ; NULL pour un document manuel
  deposePar?: string | null;     // N6-F : pour une pièce 'auto', l'EXPÉDITEUR du mail d'origine (d'où vient la pièce) ; absent pour l'e-mail
  estSource?: boolean;           // N10 : cette pièce a servi à une valeur RETENUE ou à une CANDIDATE proposée (journal 'plan') → bleu + tête de catégorie. Résolue SANS ambiguïté (nom unique dans la GED) sinon non marquée (N10-J).
  nbChampsSource?: number;        // N10-J : nombre de CHAMPS distincts que cette pièce a servi à remplir/proposer → libellé « a servi à remplir N champ(s) » (la couleur seule ne porte jamais l'info)
}
/** Une ligne d'archive = UN PERMIS renseigné : un `demande_dossier` dont `satisfait_le` n'est pas nul. */
export interface LigneArchive {
  dossierId: number;
  numDau: string;
  codeInsee: string;
  communeNom: string | null;
  categorie: CleCategorie;
  libelleCategorie: string;
  dateAutorisation: string | null;
  satisfaitLe: string | null;    // G2 : ancre des « 2 mois » (arrivée en Archives). ⚠️ se remet à jour si le dossier est démarqué puis re-satisfait → l'horloge des 2 mois redémarre (accepté, pas de 2e date).
  satisfaitPar: string | null;   // 'automatique' | 'manuel' (origine du marquage)
  demandeReference: string;
  recuLe: string | null;         // G2 : date de la réponse qui a satisfait (dd.reponse_id) ; NULL = satisfait à la main sans réponse → aucun délai G1
  expireLeCapte: string | null;  // G2 : expiration L1 la plus proche des liens forts de cette réponse (NULL → délai G1 = recuLe + 7 j)
  aLienFort: boolean;            // G2 : la réponse porte un lien fort (contenu périssable non classé) — signal de contenu au même titre qu'une pièce e-mail
  pieces: PieceArchive[];
  sourcesNonResolues: string[];  // N10-J : noms de pièces SOURCES du journal non résolus (homonymes → ambigu, ou absents de la GED) → RIEN épinglé, mais RENDU VISIBLE (jamais deviné)
}

// N1-B / N4 — sentinelle de la fiche générée : source unique dans le module-feuille PROPRE `permis/gedConstantes` (importable
// par un CLI sans happer `server-only`), importée en tête et RÉ-EXPORTÉE ici pour ne rien casser des usages existants.
export { MARQUEUR_FICHE_SYNTHESE };

/**
 * A1a — ARCHIVES : tous les permis RENSEIGNÉS par les mairies, c.-à-d. les `demande_dossier` dont `satisfait_le` n'est pas nul
 * (marque « pièces obtenues », migration 077), avec leurs pièces (`demande_reponse_piece` de la réponse qui a satisfait le
 * dossier via `reponse_id` ; NULL — satisfait à la main — → aucune pièce). Une JOINTURE SQL rattache dossier ⋈ demande ⋈
 * commune, et les pièces sont agrégées en SQL (`json_agg`) : AUCUN rapprochement en mémoire → piège bigint→chaîne évité.
 * Catégorie via `classer` (source unique). Tri : satisfaction DÉCROISSANTE. ⚠️ `cle_stockage` n'est PAS sélectionnée (seulement
 * `IS NOT NULL`) : la clé de stockage ne sort jamais de la base. LECTURE SEULE ; ne touche pas le chemin candidats.
 */
export async function listerArchives(cfg: ConfigVeille): Promise<LigneArchive[]> {
  const { rows } = await query<{
    dossier_id: number; num_dau: string; code_insee: string; commune_nom: string | null;
    type: 'PC' | 'PD'; nature_projet_completee: string | null; i_extension: boolean | null; i_surelevation: boolean | null;
    nb_lgt_tot_crees: number | null; surf_creee: string | number | null;
    date_autorisation: string | null; satisfait_le: string | null; satisfait_par: string | null; demande_reference: string;
    recu_le: string | null; expire_le_capte: string | null; a_lien_fort: boolean;
    pieces: PieceArchive[] | null;
  }>(
    // G2 — on charge en plus, via la réponse qui a satisfait (dd.reponse_id) : sa date (recu_le, ancre du délai G1), l'expiration
    //   L1 la plus proche de ses liens forts, et la présence d'un lien fort. LEFT JOIN : un dossier satisfait À LA MAIN (reponse_id
    //   NULL) n'a ni réponse ni délai (recu_le NULL). Aligné G1 ; « en GED » se lit ensuite des pièces manuelles (dossier_document).
    `SELECT s.id::int AS dossier_id, s.num_dau, s.code_insee, c.nom AS commune_nom,
            s.type, s.nature_projet_completee, s.i_extension, s.i_surelevation, s.nb_lgt_tot_crees, s.surf_creee,
            s.date_reelle_autorisation::text AS date_autorisation,
            dd.satisfait_le::date::text AS satisfait_le, dd.satisfait_par, dm.reference AS demande_reference,
            dr.recu_le::text AS recu_le,
            (SELECT min(l.expire_le)::text FROM demande_reponse_lien l WHERE l.reponse_id = dd.reponse_id AND l.fort) AS expire_le_capte,
            EXISTS (SELECT 1 FROM demande_reponse_lien l WHERE l.reponse_id = dd.reponse_id AND l.fort) AS a_lien_fort,
            COALESCE((
              -- T5 — REPLI AU GRAIN DEMANDE : le schéma n'a AUCUN lien pièce↔permis, donc reponse_id n'apporte pas de précision
              --   réelle. On liste les pièces de TOUTES les réponses rattachées à la demande du dossier (hors rebond), étiquetées
              --   par réponse (recu_le + objet). Répare rétroactivement les permis satisfaits À LA MAIN (reponse_id NULL) SANS
              --   script de reprise. cle_stockage jamais sélectionnée (seulement IS NOT NULL).
              SELECT json_agg(json_build_object(
                'id', p.id::int, 'nomFichier', p.nom_fichier, 'typeMime', p.type_mime, 'tailleOctets', p.taille_octets,
                'deposee', p.cle_stockage IS NOT NULL, 'motifNonStocke', p.motif_non_stocke, 'origine', 'email',
                'recuLe', dr2.recu_le::text, 'objet', dr2.objet
              ) ORDER BY dr2.recu_le DESC, p.id)
              FROM demande_reponse dr2
              JOIN demande_reponse_piece p ON p.reponse_id = dr2.id
             WHERE dr2.demande_id = dd.demande_id AND dr2.nature <> 'rebond'
            ), '[]'::json) AS pieces
       FROM demande_dossier dd
       JOIN sitadel_dossier s ON s.id = dd.dossier_id
       JOIN demande dm ON dm.id = dd.demande_id
       LEFT JOIN demande_reponse dr ON dr.id = dd.reponse_id
       LEFT JOIN commune c ON c.code_insee = s.code_insee
      WHERE dd.satisfait_le IS NOT NULL
      ORDER BY dd.satisfait_le DESC, s.num_dau`,
  );
  // A1b — documents AJOUTÉS À LA MAIN (dossier_document), fusionnés par dossier. RÉSILIENT à l'ordre des migrations : si la
  // table n'existe pas encore (089 non appliquée), on JOURNALISE et on dégrade en « aucun document manuel » (pièces e-mail conservées).
  const manuels = await lireDocumentsManuels();
  const sources = await lirePiecesSources(); // N10-J : par dossier, nom de pièce source → nb de champs remplis (retenue OU candidate 'plan')
  return rows.map((r) => {
    const marque = marquerSources([...(r.pieces ?? []), ...(manuels.get(r.dossier_id) ?? [])], sources.get(r.dossier_id) ?? new Map());
    const cl = classer(
      { type: r.type, natureProjetCompletee: r.nature_projet_completee, iExtension: r.i_extension, iSurelevation: r.i_surelevation, nbLgtTotCrees: r.nb_lgt_tot_crees, surfCreee: r.surf_creee === null ? null : Number(r.surf_creee) },
      cfg,
    );
    return {
      dossierId: r.dossier_id, numDau: r.num_dau, codeInsee: r.code_insee, communeNom: r.commune_nom,
      categorie: cl.cle, libelleCategorie: cl.libelle,
      dateAutorisation: r.date_autorisation, satisfaitLe: r.satisfait_le, satisfaitPar: r.satisfait_par,
      demandeReference: r.demande_reference,
      recuLe: r.recu_le ?? null, expireLeCapte: r.expire_le_capte ?? null, aLienFort: r.a_lien_fort === true,
      // E-MAIL d'abord (origine 'email'), puis les documents manuels de CE dossier ('manuel'). Fusion par dossier_id ::int (nombre) → pas de piège chaîne.
      // N10-J : chaque pièce porte `estSource`/`nbChampsSource` (source résolue sans ambiguïté) ; les sources non résolues sont remontées à part.
      pieces: marque.pieces,
      sourcesNonResolues: marque.sourcesNonResolues,
    };
  });
}

/**
 * A1b — documents AJOUTÉS À LA MAIN, groupés par dossier (`dossier_document`), avec `origine: 'manuel'` et `deposee: true`
 * (cle_stockage est NOT NULL). RÉSILIENT à l'ordre des migrations : la table peut ne pas exister (089 non appliquée) → on
 * JOURNALISE (jamais muet) et on renvoie une Map VIDE, laissant les pièces e-mail intactes. `dossier_id ::int` (nombre) =
 * clé de fusion cohérente avec `s.id::int` de `listerArchives` (piège bigint→chaîne évité).
 */
async function lireDocumentsManuels(): Promise<Map<number, PieceArchive[]>> {
  try {
    // N1-B / N6-F — origine dérivée de `note` : marqueur `MARQUEUR_FICHE_SYNTHESE` → 'genere' (non supprimable) ; préfixe
    //   `PREFIXE_NOTE_VERSEMENT_AUTO` → 'auto' (versée automatiquement, SUPPRIMABLE ; `deposePar` = expéditeur du mail) ; NULL ou
    //   autre → 'manuel' (comportement inchangé). ORDER BY : la fiche générée d'abord, puis par date de dépôt (« en premier »).
    const { rows } = await query<{ dossier_id: number; docs: PieceArchive[] }>(
      `SELECT dossier_id::int AS dossier_id,
              json_agg(json_build_object(
                'id', id::int, 'nomFichier', nom_fichier, 'typeMime', type_mime, 'tailleOctets', taille_octets,
                'deposee', true, 'motifNonStocke', NULL,
                'origine', CASE WHEN note = $1 THEN 'genere'
                                WHEN note LIKE $2 THEN 'auto'
                                ELSE 'manuel' END,
                'recuLe', NULL, 'objet', NULL,
                'deposePar', CASE WHEN note LIKE $2 THEN depose_par ELSE NULL END
              ) ORDER BY (note = $1) DESC, depose_le, id) AS docs
         FROM dossier_document GROUP BY dossier_id`,
      [MARQUEUR_FICHE_SYNTHESE, `${PREFIXE_NOTE_VERSEMENT_AUTO}%`],
    );
    return new Map(rows.map((r) => [r.dossier_id, r.docs]));
  } catch (e) {
    journaliserLectureIndisponible('documents manuels (dossier_document — migration 089 non appliquée ?)', e);
    return new Map();
  }
}

/**
 * N10 / N10-J — par dossier, pour CHAQUE pièce SOURCE (nom de fichier), le nombre de CHAMPS distincts qu'elle a servi à remplir.
 * Une pièce est SOURCE si elle est citée par une valeur RETENUE (`role='retenue'`) OU par une CANDIDATE proposée (`methode='plan'` :
 * les cotes de gabarit lues par position, journalisées en 'ecartee' mais PROPOSÉES). Une pièce citée SEULEMENT pour un vrai
 * 'ecartee' (superstructure au-dessus du toit) n'est PAS une source. RÉSILIENT : table absente → Map VIDE + log.
 */
async function lirePiecesSources(): Promise<Map<number, Map<string, number>>> {
  try {
    const { rows } = await query<{ dossier_id: number; piece: string; nb: number }>(
      `SELECT dossier_id::int AS dossier_id, piece, count(DISTINCT champ)::int AS nb
         FROM permis_extraction_journal
        WHERE (role = 'retenue' OR methode = 'plan') AND piece IS NOT NULL
        GROUP BY dossier_id, piece`);
    const m = new Map<number, Map<string, number>>();
    for (const r of rows) (m.get(r.dossier_id) ?? m.set(r.dossier_id, new Map()).get(r.dossier_id)!).set(r.piece, r.nb);
    return m;
  } catch (e) {
    journaliserLectureIndisponible('pièces sources (permis_extraction_journal — migration 104 non appliquée ?)', e);
    return new Map();
  }
}

/**
 * N10-J — marque les pièces SOURCES et rend visible ce qui NE se résout PAS. Une source ne se colore/épingle QUE si son nom est
 * UNIQUE dans la GED du dossier (le journal stocke un NOM, pas un id : deux homonymes = ambigu → on ne devine pas). Nom source
 * absent des pièces = introuvable. Dans les deux cas : rien de marqué, mais le nom est remonté dans `sourcesNonResolues`.
 */
function marquerSources(pieces: PieceArchive[], srcMap: Map<string, number>): { pieces: PieceArchive[]; sourcesNonResolues: string[] } {
  const compte = new Map<string, number>();
  for (const p of pieces) compte.set(p.nomFichier, (compte.get(p.nomFichier) ?? 0) + 1);
  const resolue = (nom: string) => srcMap.has(nom) && compte.get(nom) === 1;
  return {
    pieces: pieces.map((p) => resolue(p.nomFichier) ? { ...p, estSource: true, nbChampsSource: srcMap.get(p.nomFichier) } : { ...p, estSource: false }),
    sourcesNonResolues: [...srcMap.keys()].filter((nom) => (compte.get(nom) ?? 0) !== 1), // homonyme (≥2) ou introuvable (0)
  };
}

/**
 * FUS-3c — pièces d'UN dossier (pour rapatrier le détail Archives sur la page Rattachement). RÉUTILISE la logique de
 * `listerArchives` (mêmes deux sources, mêmes helpers `lireDocumentsManuels`/`lirePiecesSources`), scopée à un dossier et SANS
 * exiger qu'il soit satisfait. `cle_stockage` jamais sélectionnée (seul `IS NOT NULL`) → la clé ne sort pas de la base. Lecture seule.
 */
export async function listerPiecesDossier(dossierId: number): Promise<PieceArchive[]> {
  let email: PieceArchive[] = [];
  try {
    const { rows } = await query<{ pieces: PieceArchive[] | null }>(
      `SELECT COALESCE((
          SELECT json_agg(json_build_object(
            'id', p.id::int, 'nomFichier', p.nom_fichier, 'typeMime', p.type_mime, 'tailleOctets', p.taille_octets,
            'deposee', p.cle_stockage IS NOT NULL, 'motifNonStocke', p.motif_non_stocke, 'origine', 'email',
            'recuLe', dr2.recu_le::text, 'objet', dr2.objet
          ) ORDER BY dr2.recu_le DESC, p.id)
          FROM demande_dossier dd
          JOIN demande_reponse dr2 ON dr2.demande_id = dd.demande_id AND dr2.nature <> 'rebond'
          JOIN demande_reponse_piece p ON p.reponse_id = dr2.id
         WHERE dd.dossier_id = $1
        ), '[]'::json) AS pieces`, [dossierId]);
    email = rows[0]?.pieces ?? [];
  } catch (e) { journaliserLectureIndisponible('pièces e-mail (demande_reponse_piece) du dossier', e); }
  const manuels = (await lireDocumentsManuels()).get(dossierId) ?? [];
  const srcMap = (await lirePiecesSources()).get(dossierId) ?? new Map<string, number>();
  return marquerSources([...email, ...manuels], srcMap).pieces; // N10-J : même résolution non ambiguë (les non résolues ne sont pas rendues ici)
}

export type ResultatDepotDocument = { ok: true; documentId: number } | { ok: false; motif: string };

/**
 * A1b — dépose un document AJOUTÉ À LA MAIN sur un permis ARCHIVÉ (satisfait). Un permis NON archivé est REFUSÉ (message
 * explicite ; le seul chemin de marquage « renseigné » reste R5b/Réponses). ORDRE STRICT : dépôt S3 + empreinte
 * (`deposerDocumentDossier`, @aws-sdk en import DYNAMIQUE), PUIS insertion — si le dépôt échoue (whitelist, taille, S3),
 * AUCUNE ligne n'est créée. Whitelist MIME + borne de taille = celles du chemin entrant (réutilisées). Ne touche pas
 * `demande_reponse_piece`. Le nom d'origine va en base (`nom_fichier`), jamais dans la clé.
 */
export async function deposerDocumentSurPermis(
  dossierId: number, contenu: Buffer, typeMime: string | null, nomFichier: string, deposePar: string | null, note: string | null = null,
): Promise<ResultatDepotDocument> {
  const arch = await query<{ ok: boolean }>(`SELECT EXISTS (SELECT 1 FROM demande_dossier dd WHERE dd.dossier_id = $1 AND dd.satisfait_le IS NOT NULL) AS ok`, [dossierId]);
  if (!arch.rows[0]?.ok) return { ok: false, motif: 'ce permis n’est pas encore renseigné : un document ne peut être ajouté qu’à un permis archivé (satisfait)' };
  const cfg = await chargerConfigVeille();
  const { deposerDocumentDossier } = await import('../stockage'); // import DYNAMIQUE : @aws-sdk hors du graphe statique
  const dep = await deposerDocumentDossier(contenu, typeMime, { dossierId, tailleMaxOctets: cfg.pieceTailleMaxMo * 1024 * 1024 });
  if (!dep.depose) return { ok: false, motif: dep.motif }; // type hors whitelist / trop volumineux / stockage KO → RIEN inséré
  const ins = await query<{ id: number }>(
    `INSERT INTO dossier_document (dossier_id, nom_fichier, type_mime, taille_octets, cle_stockage, empreinte_sha256, depose_par, note)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id::int AS id`,
    [dossierId, nomFichier, typeMime, dep.taille, dep.cle, dep.empreinte, deposePar, note],
  );
  return { ok: true, documentId: ins.rows[0].id };
}

/**
 * N1-B — assemble les DONNÉES d'un permis pour sa fiche de synthèse : uniquement ce qui existe en base. Catégorie via `classer`
 * (source unique), nature TRADUITE en clair via `libelleNatureProjet` (plus le code brut « 1 »), et la liste des pièces
 * PRÉSENTES EN GED (`dossier_document` hors la fiche elle-même, marqueur exclu). `null` si le dossier n'est pas archivé (aucune
 * fiche à produire). Les valeurs manquantes restent `null` : c'est le générateur (composerFichePermis) qui pose « non renseigné ».
 */
export async function donneesFicheSynthese(dossierId: number): Promise<SourceFichePermis | null> {
  const { rows } = await query<{
    reference: string; num_dau: string; type: 'PC' | 'PD'; adresse: string | null; commune_nom: string | null; code_insee: string;
    nature: string | null; i_extension: boolean | null; i_surelevation: boolean | null; nb_lgt_tot_crees: number | null; surf_creee: string | number | null;
    date_autorisation: string | null; satisfait_le: string | null; satisfait_par: string | null;
  }>(
    `SELECT dm.reference, s.num_dau, s.type,
            nullif(btrim(concat_ws(' ', s.adr_num_ter, s.adr_libvoie_ter, s.adr_localite_ter)), '') AS adresse,
            c.nom AS commune_nom, s.code_insee,
            s.nature_projet_completee AS nature, s.i_extension, s.i_surelevation, s.nb_lgt_tot_crees, s.surf_creee,
            s.date_reelle_autorisation::text AS date_autorisation,
            dd.satisfait_le::date::text AS satisfait_le, dd.satisfait_par
       FROM demande_dossier dd
       JOIN sitadel_dossier s ON s.id = dd.dossier_id
       JOIN demande dm ON dm.id = dd.demande_id
       LEFT JOIN commune c ON c.code_insee = s.code_insee
      WHERE s.id = $1 AND dd.satisfait_le IS NOT NULL
      ORDER BY dd.satisfait_le DESC, dm.id
      LIMIT 1`,
    [dossierId],
  );
  const r = rows[0];
  if (!r) return null;
  const cfg = await chargerConfigVeille();
  const cl = classer(
    { type: r.type, natureProjetCompletee: r.nature, iExtension: r.i_extension, iSurelevation: r.i_surelevation, nbLgtTotCrees: r.nb_lgt_tot_crees, surfCreee: r.surf_creee === null ? null : Number(r.surf_creee) },
    cfg,
  );
  const { rows: pr } = await query<{ nom: string }>(
    `SELECT nom_fichier AS nom FROM dossier_document WHERE dossier_id = $1 AND note IS DISTINCT FROM $2 ORDER BY depose_le, id`,
    [dossierId, MARQUEUR_FICHE_SYNTHESE],
  );
  return {
    numDau: r.num_dau, type: r.type, reference: r.reference,
    communeNom: r.commune_nom, codeInsee: r.code_insee, adresse: r.adresse,
    categorie: cl.libelle,
    natureTravaux: r.nature === null ? null : libelleNatureProjet(r.nature), // traduit en clair (jamais le code nu)
    dateAutorisation: r.date_autorisation, surface: r.surf_creee === null ? null : String(r.surf_creee), logements: r.nb_lgt_tot_crees,
    satisfaitLe: r.satisfait_le, satisfaitPar: r.satisfait_par,
    pieces: pr.map((x) => x.nom),
  };
}

/**
 * N1-B — dépose (ou REMPLACE) la FICHE DE SYNTHÈSE générée d'un permis. UNE SEULE fiche par permis : l'ancienne (même marqueur
 * `note`) est retirée et la nouvelle insérée ATOMIQUEMENT (withTransaction), donc l'index unique (dossier_id, empreinte) —
 * inopérant ici puisque l'empreinte change à chaque régénération — n'entraîne AUCUNE accumulation. ORDRE : dépôt S3 (empreinte,
 * whitelist, borne de taille — mêmes règles que les pièces reçues) PUIS la bascule delete+insert ; sur échec de dépôt, RIEN
 * n'est modifié. L'ancien objet S3 est nettoyé en best-effort (un orphelin est sans conséquence). La fiche est marquée
 * `note = MARQUEUR_FICHE_SYNTHESE` → origine 'genere' à l'affichage, et NON supprimable à la main (cf. supprimerDocumentDossier).
 */
export async function deposerFicheSynthese(dossierId: number, contenu: Buffer, nomFichier: string): Promise<ResultatDepotDocument> {
  const arch = await query<{ ok: boolean }>(`SELECT EXISTS (SELECT 1 FROM demande_dossier dd WHERE dd.dossier_id = $1 AND dd.satisfait_le IS NOT NULL) AS ok`, [dossierId]);
  if (!arch.rows[0]?.ok) return { ok: false, motif: 'ce permis n’est pas archivé : aucune fiche de synthèse ne peut y être déposée' };
  const cfg = await chargerConfigVeille();
  const { deposerDocumentDossier } = await import('../stockage'); // import DYNAMIQUE : @aws-sdk hors du graphe statique
  const dep = await deposerDocumentDossier(contenu, 'application/pdf', { dossierId, tailleMaxOctets: cfg.pieceTailleMaxMo * 1024 * 1024 });
  if (!dep.depose) return { ok: false, motif: dep.motif }; // S3/whitelist/taille KO → RIEN inséré, ancienne fiche intacte
  const anciennesCles: string[] = [];
  const documentId = await withTransaction(async (q) => {
    const anc = await q<{ cle_stockage: string }>(
      `DELETE FROM dossier_document WHERE dossier_id = $1 AND note = $2 RETURNING cle_stockage`, [dossierId, MARQUEUR_FICHE_SYNTHESE]);
    for (const r of anc.rows) anciennesCles.push(r.cle_stockage);
    const ins = await q<{ id: number }>(
      `INSERT INTO dossier_document (dossier_id, nom_fichier, type_mime, taille_octets, cle_stockage, empreinte_sha256, depose_par, note)
       VALUES ($1, $2, 'application/pdf', $3, $4, $5, 'Sans Vis-à-Vis (généré)', $6) RETURNING id::int AS id`,
      [dossierId, nomFichier, dep.taille, dep.cle, dep.empreinte, MARQUEUR_FICHE_SYNTHESE],
    );
    return ins.rows[0].id;
  });
  if (anciennesCles.length > 0) {
    try {
      const { supprimer } = await import('../stockage');
      for (const cle of anciennesCles) await supprimer(cle);
    } catch (e) {
      journaliserLectureIndisponible('suppression de l’ancienne fiche de synthèse (objet S3) — orphelin possible, sans conséquence', e);
    }
  }
  return { ok: true, documentId };
}

/**
 * A1b — supprime un document AJOUTÉ À LA MAIN (`dossier_document`). ORDRE : ligne en base PUIS objet S3 — un objet orphelin
 * est sans conséquence, une ligne pointant dans le vide non. L'échec de suppression S3 est JOURNALISÉ (jamais muet), sans
 * annuler la suppression de la ligne. Ne touche JAMAIS `demande_reponse_piece` (registre des pièces reçues par e-mail — le
 * refus explicite est côté route, discriminé par `source`). Renvoie false si l'id est inconnu.
 * N1-B — GARDE : une fiche de synthèse GÉNÉRÉE (`note = MARQUEUR_FICHE_SYNTHESE`) n'est JAMAIS supprimable à la main (elle se
 * régénère). `note IS DISTINCT FROM` laisse supprimables les documents manuels ordinaires (note NULL incluse).
 */
export async function supprimerDocumentDossier(documentId: number): Promise<boolean> {
  const { rows } = await query<{ cle_stockage: string }>(
    `DELETE FROM dossier_document WHERE id = $1 AND note IS DISTINCT FROM $2 RETURNING cle_stockage`, [documentId, MARQUEUR_FICHE_SYNTHESE]);
  if (rows.length === 0) return false;
  try {
    const { supprimer } = await import('../stockage'); // import DYNAMIQUE : @aws-sdk hors du graphe statique
    await supprimer(rows[0].cle_stockage);
  } catch (e) {
    journaliserLectureIndisponible('suppression de l’objet S3 (document manuel) — objet possiblement orphelin, sans conséquence', e);
  }
  return true;
}

/**
 * A1b — lit la CLÉ de stockage d'une pièce téléchargeable, DISPATCHÉE par `source` : 'reponse' (pièce reçue par e-mail,
 * `demande_reponse_piece` — réutilise `lireClePiece`, chemin relève inchangé) ou 'dossier' (document ajouté à la main,
 * `dossier_document`). UNE SEULE fonction de lecture de clé (pas de 2e implémentation) ; la SIGNATURE reste faite par
 * `urlSignee` (lib/stockage), seul signeur. La clé ne quitte pas le serveur (seul l'appelant qui signe la reçoit).
 */
export async function lireCleTelechargeable(id: number, source: 'reponse' | 'dossier'): Promise<{ cle: string; nomFichier: string } | null> {
  // N6-E — renvoie la clé ET le nom d'origine (nom de téléchargement forcé, cf. urlSignee). `null` = pièce absente / non déposée.
  if (source === 'dossier') {
    const { rows } = await query<{ cle_stockage: string | null; nom_fichier: string }>(`SELECT cle_stockage, nom_fichier FROM dossier_document WHERE id = $1`, [id]);
    const r = rows[0];
    return r && r.cle_stockage !== null ? { cle: r.cle_stockage, nomFichier: r.nom_fichier } : null;
  }
  return lireClePiece(id);
}

/** Attribue une référence SVAV-DEM-AAAA-NNNNNN (compteur atomique, verrou de ligne). */
async function attribuerReference(q: Requete, annee: number): Promise<string> {
  const r = await q<{ dernier: number }>(
    `INSERT INTO demande_compteur (annee, dernier) VALUES ($1, 1)
     ON CONFLICT (annee) DO UPDATE SET dernier = demande_compteur.dernier + 1 RETURNING dernier`, [annee],
  );
  return formaterReferenceDemande(annee, r.rows[0].dernier);
}

/** Un lot sélectionné mais NON créé (invalidé entre l'affichage et le clic), avec sa raison — pour le compte rendu chiffré. */
export interface LotIgnore { cle: string; communeNom: string | null; raison: string }
/** Compte rendu CHIFFRÉ d'une création : demandes créées, dossiers gelés, lots sélectionnés, conflits, lots invalidés listés. */
export interface CompteRenduCreation {
  crees: string[];
  demandesCreees: number;
  lotsSelectionnes: number;
  dossiersCrees: number;
  ignoresConflit: number;      // race sur l'index unique partiel (dossier rattaché entre proposition() et l'INSERT)
  lotsInvalides: LotIgnore[];  // clés sélectionnées sans lot frais correspondant
  profil: ProfilDemandeur;
}

const RAISON_LOT_INVALIDE = 'lot plus disponible : dossiers déjà rattachés, plafond mensuel atteint, ou proposition modifiée depuis l’affichage — ignoré (jamais créé de force)';

/**
 * Crée les demandes des lots SÉLECTIONNÉS (V3). ⚠️ NE FAIT PAS CONFIANCE AU CLIENT : re-dérive la proposition FRAÎCHE
 * (`proposition(cfg)` = gardes réappliquées : dossiers encore libres, plafond mensuel, canal exploitable — proposerLots) et
 * n'apparie la sélection QUE par clé sur ces lots frais (`apparierSelection`). Un lot demandé sans lot frais correspondant est
 * IGNORÉ et LISTÉ (jamais créé de force). Pour chaque lot créé (transaction) : référence, destinataire FIGÉ, texte généré,
 * liens dossiers, journal (→brouillon). L'index unique partiel `demande_dossier_unique_actif` est le filet anti-course : un
 * dossier rattaché entre proposition() et l'INSERT → lot ignoré (ignoresConflit). Compte rendu CHIFFRÉ. AUCUN ENVOI.
 */
export async function creerDemandes(cfg: ConfigVeille, annee: number, auteur: string | null, profilDemande: ProfilDemandeur | undefined, selection: { cle: string; communeNom: string | null }[], ancienneteMois?: number): Promise<CompteRenduCreation> {
  const profil = profilDemande ?? profilValide(cfg.profilDemandeurDefaut);
  const { lots } = await proposition(cfg, ancienneteMois); // Q4 : re-dérive avec la MÊME fenêtre que l'aperçu (sinon lots ≠ affichés)
  const { aCreer, invalides } = apparierSelection(lots, selection.map((s) => s.cle));
  const communeParCle = new Map(selection.map((s) => [s.cle, s.communeNom]));
  const lotsInvalides: LotIgnore[] = invalides.map((cle) => ({ cle, communeNom: communeParCle.get(cle) ?? null, raison: RAISON_LOT_INVALIDE }));
  const pieces = piecesDepuisConfig(cfg.piecesDemandees);
  // P3 — profil EFFECTIF par lot : celui IMPOSÉ par le téléservice de la commune (`lot.profilImpose`, issu de la proposition
  // re-jouée ici), sinon le profil du batch. La config d'identité est lue par profil réellement utilisé (au plus 2 lectures).
  const profilDe = (lot: Lot): ProfilDemandeur => profilEffectifLot(lot, profil);
  const profilsUtilises = new Set(aCreer.map(profilDe));
  const cfgParProfil = new Map<ProfilDemandeur, ConfigDemandeur>();
  for (const p of profilsUtilises) cfgParProfil.set(p, await lireConfigDemandeur(p));
  // S8a/S8b — TOURNIQUET (profil « entreprise » UNIQUEMENT : un collaborateur signe AU NOM DE LA SOCIÉTÉ). Chargé dès qu'un
  // lot (batch OU imposé) est en entreprise. `dernieres`/`chargeGlobale` sont mis à jour AU FIL DU LOT (équilibrage intra-run).
  const besoinCollaborateurs = profilsUtilises.has('entreprise');
  const collaborateurs = besoinCollaborateurs ? await lireCollaborateursActifs() : [];
  const dernieres = besoinCollaborateurs ? await lireDernieresParCommune() : new Map<string, Map<number, string | null>>();
  const chargeGlobale = besoinCollaborateurs ? await lireChargeGlobale() : new Map<number, number>();
  const maintenant = new Date();
  const crees: string[] = [];
  let ignoresConflit = 0, dossiersCrees = 0;
  for (const lot of aCreer) {
    const profilLot = profilDe(lot);                                      // P3 : profil imposé par la commune, sinon batch
    const cfgDem = cfgParProfil.get(profilLot)!;                          // config d'identité du profil EFFECTIF du lot
    const collabActifs = profilLot === 'entreprise' ? collaborateurs : []; // tourniquet : profil entreprise uniquement
    const parCommune = dernieres.get(lot.codeInsee) ?? new Map<number, string | null>();
    const collaborateurId = collabActifs.length > 0
      ? choisirCollaborateur(lot.codeInsee, collabActifs, parCommune, chargeGlobale, maintenant).collaborateurId
      : null;
    const collab = collaborateurId !== null ? collabActifs.find((c) => c.id === collaborateurId) ?? null : null;
    const cfgSignataire = collab
      ? configAvecSignataire(cfgDem, { nom: collab.nom, prenom: collab.prenom, fonction: collab.fonction, email: collab.email })
      : cfgDem;
    try {
      const ref = await withTransaction(async (tx) => {
        const q = asQ(tx);
        const reference = await attribuerReference(q, annee);
        const { objet, corps } = genererTexte(lot, cfgSignataire, reference, pieces, profilLot, cfg.adresseReponse,
          { serviceActive: cfg.mentionServiceActive, serviceTexte: cfg.mentionServiceTexte, delaiActive: cfg.mentionDelaiActive, delaiTexte: cfg.mentionDelaiTexte,
            sourcesActive: cfg.mentionSourcesActive, sourcesTexte: cfg.mentionSourcesTexte }); // S39/S40/S-DWG : réponse + mentions figées
        // S14d — destinataire FIGÉ via la MÊME fonction que la sélection amont (resoudreDestination) : lecture de
        // mairie_contact ÉTENDUE à mairie_prada, puis précédence PRADA/contact. Le texte du courrier ne dépend pas du
        // destinataire (genererTexte ne le reçoit pas) → figer un autre e-mail laisse le corps strictement inchangé.
        const contact = await q<{
          canal: string | null; statut: string | null; email: string | null; url_formulaire: string | null; adresse_postale: string | null;
          prada_courriel: string | null; prada_import_id: number | null; prada_nom: string | null; prada_prenom: string | null;
        }>(
          `SELECT mc.canal, mc.statut, mc.email, mc.url_formulaire, mc.adresse_postale,
                  mp.courriel AS prada_courriel, mp.import_id AS prada_import_id, mp.nom AS prada_nom, mp.prenom AS prada_prenom
           FROM commune c
           LEFT JOIN mairie_contact mc ON mc.code_insee = c.code_insee
           LEFT JOIN mairie_prada mp ON mp.code_insee = c.code_insee
           WHERE c.code_insee = $1`, [lot.codeInsee],
        );
        const row = contact.rows[0] ?? null;
        const dest = resoudreDestination({
          contactCanal: (row?.canal ?? null) as ContactCommune['contactCanal'],
          contactStatut: (row?.statut ?? null) as ContactCommune['contactStatut'],
          contactEmail: row?.email ?? null, contactUrlFormulaire: row?.url_formulaire ?? null, contactAdressePostale: row?.adresse_postale ?? null,
          pradaCourriel: row?.prada_courriel ?? null, pradaImportId: row?.prada_import_id ?? null,
          pradaNom: [row?.prada_prenom, row?.prada_nom].map((x) => (x ?? '').trim()).filter((x) => x !== '').join(' ') || null,
        });
        const dem = await q<{ id: number }>(
          `INSERT INTO demande (reference, code_insee, statut, objet, corps, profil_demandeur, collaborateur_id, dest_canal, dest_email, dest_url_formulaire, dest_adresse_postale, dest_origine, dest_prada_import_id, dest_nom)
           VALUES ($1, $2, 'brouillon', $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13) RETURNING id`,
          [reference, lot.codeInsee, objet, corps, profilLot, collaborateurId, dest.canal, dest.email, dest.urlFormulaire, dest.adressePostale, dest.origine, dest.pradaImportId, dest.nom],
        );
        const id = dem.rows[0].id;
        for (const d of lot.dossiers) {
          await q(`INSERT INTO demande_dossier (demande_id, dossier_id, actif) VALUES ($1, $2, true)`, [id, d.dossierId]);
        }
        await q(`INSERT INTO demande_journal (demande_id, statut_avant, statut_apres, motif, auteur) VALUES ($1, NULL, 'brouillon', $2, $3)`,
          [id, collaborateurId !== null ? `création (collaborateur ${collaborateurId})` : 'création', auteur]);
        return reference;
      });
      crees.push(ref);
      dossiersCrees += lot.dossiers.length;
      if (collaborateurId !== null) {
        parCommune.set(collaborateurId, maintenant.toISOString()); dernieres.set(lot.codeInsee, parCommune);
        chargeGlobale.set(collaborateurId, (chargeGlobale.get(collaborateurId) ?? 0) + 1); // charge globale au fil du lot
      }
    } catch {
      ignoresConflit += 1; // conflit d'unicité (dossier déjà rattaché entre-temps) → lot ignoré, pas d'écriture partielle
    }
  }
  return { crees, demandesCreees: crees.length, lotsSelectionnes: selection.length, dossiersCrees, ignoresConflit, lotsInvalides, profil };
}

export interface DemandeListe { id: number; reference: string; codeInsee: string; communeNom: string | null; canal: string | null; destOrigine: string; destNom: string | null; nbDossiers: number; statut: string; profil: string; creeLe: string;
  /** T2-C — dossiers encore DÛS (actif ET non satisfaits) de la demande. Optionnel : présent sur la LISTE, omis sur le détail (comme rangs). Sert au masquage « En cours » des demandes à 0 dû (soldées / sans dossier actif). */
  dossiersDus?: number;
  /** D2 — rangs de catégorie DISTINCTS des dossiers de la demande (via classement config), pour le filtre par type. Optionnel : présent sur la LISTE, omis sur le détail. */
  rangs?: number[];
  /** P1 — références internes de la mairie (dépôt manuel), pour la RECHERCHE côté client. Optionnel : présent sur la LISTE. */
  referencesExternes?: string[];
  /** T6-B — num_dau des dossiers ACTIFS de la demande (colonne « N° permis »). Optionnel : présent sur la LISTE, omis sur le détail. */
  numeros?: string[] }

export interface ResumeDemandes { parStatut: Record<string, number>; total: number; dossiersCouverts: number }

/** Alerte d'identité CIBLÉE : un profil réellement porté par des demandes en brouillon dont l'identité est incomplète. */
export interface AlerteIdentite { profil: ProfilDemandeur; libelle: string; manque: string[] }

/**
 * P2 — journalise COMPLÈTEMENT une erreur de lecture d'AFFICHAGE SECONDAIRE (name/message/stack + champs pg), puis laisse
 * l'appelant marquer l'info « indisponible » (DISTINCTE de « vide ») SANS propager (un 503 viderait l'onglet pour une donnée
 * secondaire). Remplace le catch muet de P1 — jamais de catch silencieux (le précédent `veille:run` invisible 9 h).
 */
function journaliserLectureIndisponible(contexte: string, e: unknown): void {
  const err = e as { name?: unknown; message?: unknown; stack?: unknown; code?: unknown; detail?: unknown; constraint?: unknown; table?: unknown; column?: unknown };
  console.error(`[permis/demandes] ${contexte} — indisponible (écran conservé)`, {
    name: err?.name, message: err?.message,
    code: err?.code, detail: err?.detail, constraint: err?.constraint, table: err?.table, column: err?.column,
    stack: err?.stack,
  });
}

export async function listerDemandes(): Promise<{ demandes: DemandeListe[]; alertesIdentite: AlerteIdentite[]; resume: ResumeDemandes; referencesIndisponibles: boolean }> {
  // D2 — classement des dossiers d'une demande par CATÉGORIE, pour le filtre par type. On RÉUTILISE `expressionRangSql`
  // (pure) sur une requête PROPRE à la liste : le chemin CANDIDATS (construireRequeteListe) n'est pas touché. LECTURE SEULE.
  const cfg = await chargerConfigVeille();
  const paramsRang: unknown[] = [];
  const rangExpr = expressionRangSql(cfg, paramsRang);
  // T6-B — même requête (jointure + GROUP BY déjà là → aucun aller-retour) : on agrège AUSSI les num_dau des dossiers ACTIFS
  //   (FILTER dd.actif), pour la colonne « N° permis ». Cohérent avec `nb` (compte des dossiers actifs). 0 actif → numeros NULL → [].
  const sqlRangs = `SELECT dd.demande_id::int AS demande_id, array_agg(DISTINCT (${rangExpr})) AS rangs,
           array_agg(d.num_dau ORDER BY d.num_dau) FILTER (WHERE dd.actif) AS numeros
    FROM demande_dossier dd JOIN sitadel_dossier d ON d.id = dd.dossier_id GROUP BY dd.demande_id`;
  let referencesIndisponibles = false; // P2 — vrai si la lecture des références échoue (à l'écran : « indisponibles » ≠ « aucune »)
  const [r, rs, rd, rr, rx] = await Promise.all([
    query<{ id: number; reference: string; code_insee: string; commune_nom: string | null; dest_canal: string | null; dest_origine: string; dest_nom: string | null; nb: number; dossiers_dus: number; statut: string; profil_demandeur: string; cree_le: string }>(
      // d.id::int : `demande.id` est un bigint que node-postgres rend en CHAÎNE ; sans cast, l'id renvoyé au client est une
      // string et la PATCH groupée (filtre Number.isInteger) l'écarte en silence → boutons « prête »/« annuler » inertes.
      // T2-C : `nb` = dossiers ATTACHÉS (dd.actif) — un dossier RETIRÉ (actif=false) n'est plus couvert par la demande, jamais
      //   compté (colonne Dossiers + en-tête). `dossiers_dus` = attachés ET non satisfaits → « En cours » masque les 0-dû.
      `SELECT d.id::int AS id, d.reference, d.code_insee, c.nom AS commune_nom, d.dest_canal, d.dest_origine, d.dest_nom, d.statut, d.profil_demandeur, d.cree_le::text AS cree_le,
              (SELECT count(*)::int FROM demande_dossier dd WHERE dd.demande_id = d.id AND dd.actif) AS nb,
              (SELECT count(*)::int FROM demande_dossier dd WHERE dd.demande_id = d.id AND dd.actif AND dd.satisfait_le IS NULL) AS dossiers_dus
       FROM demande d LEFT JOIN commune c ON c.code_insee = d.code_insee ORDER BY d.cree_le DESC`),
    query<{ statut: string; n: number }>(`SELECT statut, count(*)::int AS n FROM demande GROUP BY statut`),
    query<{ n: number }>(`SELECT count(DISTINCT dossier_id)::int AS n FROM demande_dossier`),
    query<{ demande_id: number; rangs: number[]; numeros: string[] | null }>(sqlRangs, paramsRang),
    // P1 — références mairie par demande, agrégées (pour la RECHERCHE côté client). Requête PROPRE à la liste, aucune
    // incidence sur le chemin CANDIDATS. P2 — un échec est JOURNALISÉ et marqué « indisponible » (jamais muet), sans propager
    // un 503 qui viderait l'onglet pour une donnée d'affichage secondaire.
    query<{ demande_id: number; refs: string[] }>(`SELECT demande_id::int AS demande_id, array_agg(reference) AS refs FROM demande_reference_externe GROUP BY demande_id`)
      .catch((e) => { journaliserLectureIndisponible('lecture des références (liste)', e); referencesIndisponibles = true; return { rows: [] as { demande_id: number; refs: string[] }[] }; }),
  ]);
  const parStatut: Record<string, number> = {};
  for (const s of rs.rows) parStatut[s.statut] = s.n;
  const rangsParDemande = new Map(rr.rows.map((x) => [x.demande_id, x.rangs]));
  const numerosParDemande = new Map(rr.rows.map((x) => [x.demande_id, x.numeros ?? []])); // T6-B : num_dau actifs (NULL → [])
  const refsParDemande = new Map(rx.rows.map((x) => [x.demande_id, x.refs]));

  // Alertes CIBLÉES : uniquement les profils réellement portés par des demandes EN BROUILLON (celles qui aspirent à
  // passer « prête ») et dont l'identité correspondante est incomplète.
  const profilsBrouillon = [...new Set(r.rows.filter((x) => x.statut === 'brouillon').map((x) => profilValide(x.profil_demandeur)))];
  const alertesIdentite: AlerteIdentite[] = [];
  for (const profil of profilsBrouillon) {
    const manque = problemesIdentite(await lireConfigDemandeur(profil), profil);
    if (manque.length > 0) alertesIdentite.push({ profil, libelle: ETIQUETTE_PROFIL[profil], manque });
  }

  return {
    demandes: r.rows.map((x) => ({ id: x.id, reference: x.reference, codeInsee: x.code_insee, communeNom: x.commune_nom, canal: x.dest_canal, destOrigine: x.dest_origine, destNom: x.dest_nom, nbDossiers: x.nb, dossiersDus: x.dossiers_dus, statut: x.statut, profil: x.profil_demandeur, creeLe: x.cree_le, rangs: rangsParDemande.get(x.id) ?? [], numeros: numerosParDemande.get(x.id) ?? [], referencesExternes: refsParDemande.get(x.id) ?? [] })),
    alertesIdentite,
    resume: { parStatut, total: r.rows.length, dossiersCouverts: rd.rows[0]?.n ?? 0 },
    referencesIndisponibles,
  };
}

/** P1 — une référence interne de la mairie rattachée à une demande (preuve de dépôt / point d'entrée d'appel). */
export interface ReferenceExterne { id: number; reference: string; dossierId: number | null; source: string | null; recuLe: string | null; creeLe: string }

export interface DemandeDetail extends DemandeListe { objet: string | null; corps: string | null; destEmail: string | null; destUrlFormulaire: string | null; destAdressePostale: string | null; dossiers: { numDau: string; date: string | null }[];
  /** T2-C — dossiers RETIRÉS de la demande (actif=false) : listés À PART, jamais mêlés aux attachés ni comptés (nbDossiers = attachés). Le retrait est une correction TRAÇABLE, pas une disparition muette. */
  dossiersRetires: { numDau: string; date: string | null }[];
  /** P1 — références de la mairie (détail complet : source, dates), pour AFFICHAGE et ajout après coup. */
  referencesMairie: ReferenceExterne[];
  /** P2 — vrai si la LECTURE des références a échoué : « indisponibles » à l'écran, DISTINCT d'une liste vide (« aucune »). */
  referencesMairieIndisponible: boolean }

export async function lireDemande(id: number): Promise<DemandeDetail | null> {
  const r = await query<{ id: number; reference: string; code_insee: string; commune_nom: string | null; statut: string; profil_demandeur: string; objet: string | null; corps: string | null; dest_canal: string | null; dest_email: string | null; dest_url_formulaire: string | null; dest_adresse_postale: string | null; dest_origine: string; dest_nom: string | null; cree_le: string }>(
    // d.id::int : cf. listerDemandes — detail.id repart dans le corps de la PATCH groupée (transition/bascule).
    `SELECT d.id::int AS id, d.reference, d.code_insee, c.nom AS commune_nom, d.statut, d.profil_demandeur, d.objet, d.corps,
            d.dest_canal, d.dest_email, d.dest_url_formulaire, d.dest_adresse_postale, d.dest_origine, d.dest_nom, d.cree_le::text AS cree_le
     FROM demande d LEFT JOIN commune c ON c.code_insee = d.code_insee WHERE d.id = $1`, [id],
  );
  const x = r.rows[0];
  if (!x) return null;
  // T2-C : on LIT dd.actif pour SCINDER attachés / retirés — on ne filtre PAS (un retrait doit rester visible au détail, jamais
  //   une disparition muette). Attachés d'abord (actif DESC), puis num_dau.
  const doss = await query<{ num_dau: string; date: string | null; actif: boolean }>(
    `SELECT s.num_dau, s.date_reelle_autorisation::text AS date, dd.actif
       FROM demande_dossier dd JOIN sitadel_dossier s ON s.id = dd.dossier_id
      WHERE dd.demande_id = $1 ORDER BY dd.actif DESC, s.num_dau`, [id],
  );
  const attaches = doss.rows.filter((d) => d.actif);   // couverts par la demande → comptés
  const retires = doss.rows.filter((d) => !d.actif);   // retirés → listés à part, jamais comptés
  // P1 — références mairie de la demande (détail). P2 — un échec est JOURNALISÉ et marqué « indisponible » (jamais muet),
  // sans propager (le reste du détail reste affiché — donnée secondaire).
  let referencesMairieIndisponible = false;
  const refs = await query<{ id: number; reference: string; dossier_id: number | null; source: string | null; recu_le: string | null; cree_le: string }>(
    `SELECT id::int AS id, reference, dossier_id::int AS dossier_id, source, recu_le::text AS recu_le, cree_le::text AS cree_le
       FROM demande_reference_externe WHERE demande_id = $1 ORDER BY cree_le`, [id],
  ).catch((e) => { journaliserLectureIndisponible('lecture des références (détail)', e); referencesMairieIndisponible = true; return { rows: [] as { id: number; reference: string; dossier_id: number | null; source: string | null; recu_le: string | null; cree_le: string }[] }; });
  return {
    id: x.id, reference: x.reference, codeInsee: x.code_insee, communeNom: x.commune_nom, canal: x.dest_canal,
    destOrigine: x.dest_origine, destNom: x.dest_nom,
    nbDossiers: attaches.length, statut: x.statut, profil: x.profil_demandeur, creeLe: x.cree_le, objet: x.objet, corps: x.corps,
    destEmail: x.dest_email, destUrlFormulaire: x.dest_url_formulaire, destAdressePostale: x.dest_adresse_postale,
    dossiers: attaches.map((d) => ({ numDau: d.num_dau, date: d.date })),
    dossiersRetires: retires.map((d) => ({ numDau: d.num_dau, date: d.date })),
    referencesMairie: refs.rows.map((d) => ({ id: d.id, reference: d.reference, dossierId: d.dossier_id, source: d.source, recuLe: d.recu_le, creeLe: d.cree_le })),
    referencesMairieIndisponible,
  };
}

/** Édite le corps (et l'objet) d'une demande brouillon. */
export async function majCorps(id: number, corps: string, objet: string | null): Promise<void> {
  await query(`UPDATE demande SET corps = $2, objet = COALESCE($3, objet), maj_le = now() WHERE id = $1 AND statut = 'brouillon'`, [id, corps, objet]);
}

/** Erreur de garde-fou identité (transition bloquée) — champs manquants exposés. */
export class IdentiteIncompleteError extends Error {
  constructor(public champs: string[]) { super('identité du demandeur incomplète'); this.name = 'IdentiteIncompleteError'; }
}

/** Erreur de transition interdite (ex. bascule de profil sur une demande non-brouillon) — raison exposée. */
export class TransitionInterditeError extends Error {
  constructor(public raison: string) { super(raison); this.name = 'TransitionInterditeError'; }
}

/**
 * B1 — un dossier NON réactivé à la réouverture parce qu'il est déjà actif sur une AUTRE demande (compte rendu, jamais un
 * rattachement au jugé). Le lien du dossier reste `actif=false` sur la demande rouverte ; c'est la demande `dejaActiveSurDemandeId`
 * qui le détient.
 */
export interface ConflitReactivation { demandeId: number; numDau: string; dejaActiveSurDemandeId: number }

/**
 * Change le statut EN JOURNALISANT. Quitter 'brouillon' (→ 'prete') exige une identité demandeur COMPLÈTE (sinon
 * `IdentiteIncompleteError` avec la liste des champs). Annuler libère les dossiers (demande_dossier.actif=false), qui
 * redeviennent immédiatement proposables (le vrai « abandon » — écarter définitivement un permis — n'existe pas ici).
 * B1 — RÉOUVERTURE (annulee → prete) : RÉACTIVE les dossiers, symétriquement à l'annulation (voir changerStatutLot). Renvoie
 * les conflits de réactivation (vide si aucun). ⚠️ 'envoyee' N'EST PAS gérée ici (l'envoi est un chantier ultérieur).
 */
export async function changerStatut(id: number, nouveau: 'prete' | 'annulee', auteur: string | null): Promise<ConflitReactivation[]> {
  return changerStatutLot([id], nouveau, auteur);
}

/**
 * Transition de statut d'un LOT de demandes, EN TOUT-OU-RIEN. Pour 'prete', l'identité est vérifiée UNE FOIS avant toute
 * écriture (sinon `IdentiteIncompleteError` → AUCUNE demande touchée). Sinon, toutes les transitions passent dans UNE
 * transaction (échec = rollback total, aucune transition partielle). Chaque transition est journalisée. AUCUN ENVOI.
 * B1 — SYMÉTRIE de l'annulation : annuler pose `demande_dossier.actif=false` ; ROUVRIR (annulee → prete) le repose à true.
 * Réactivation PARTIELLE conflict-safe : un dossier déjà actif sur une AUTRE demande (index unique partiel
 * `demande_dossier_unique_actif`) n'est PAS réactivé et est SIGNALÉ (compte rendu), jamais un crash ni un rattachement au jugé.
 * Renvoie la liste des conflits (vide si aucun).
 */
export async function changerStatutLot(ids: number[], nouveau: 'prete' | 'annulee', auteur: string | null): Promise<ConflitReactivation[]> {
  if (ids.length === 0) return [];
  if (nouveau === 'prete') {
    // Verrou 'prete' sur l'identité DU PROFIL PORTÉ par chaque demande (pas un profil global). Une seule identité
    // incomplète parmi les profils concernés bloque TOUT le lot (aucune écriture).
    const { rows } = await query<{ profil: string }>(`SELECT DISTINCT profil_demandeur AS profil FROM demande WHERE id = ANY($1::bigint[])`, [ids]);
    const manque: string[] = [];
    for (const { profil } of rows) {
      const p = profilValide(profil);
      for (const x of problemesIdentite(await lireConfigDemandeur(p), p)) manque.push(`${ETIQUETTE_PROFIL[p]} — ${x}`);
    }
    if (manque.length > 0) throw new IdentiteIncompleteError(manque);
  }
  // D1 — 🔴 VERROU : une demande 'envoyee' ou 'close' n'est JAMAIS annulable (démarche engagée = preuve juridique), quel que
  //   soit l'appelant (cette garde protège AUSSI le chemin unitaire existant : PATCH /demandes {statut:'annulee'}). Tout-ou-rien :
  //   un seul id interdit fait échouer le lot AVANT toute écriture (aucune annulation partielle). Verdict = source pure partagée.
  if (nouveau === 'annulee') {
    const { rows } = await query<{ id: number; reference: string; statut: string }>(
      `SELECT id, reference, statut FROM demande WHERE id = ANY($1::bigint[])`, [ids]);
    const interdits = rows.filter((r) => verdictAnnulation(r.statut, true) === 'envoyee_interdite');
    if (interdits.length > 0) {
      throw new TransitionInterditeError(`annulation impossible : ${interdits.map((r) => `${r.reference} (${r.statut})`).join(', ')} — une demande envoyée ou close n'est jamais annulable`);
    }
  }
  const motif = ids.length > 1 ? 'transition (lot)' : 'transition';
  const conflits: ConflitReactivation[] = [];
  await withTransaction(async (tx) => {
    const q = asQ(tx);
    for (const id of ids) {
      const av = await q<{ statut: string; dest_canal: string | null }>(`SELECT statut, dest_canal FROM demande WHERE id = $1`, [id]);
      const avant = av.rows[0]?.statut ?? null;
      const canal = av.rows[0]?.dest_canal ?? null;
      await q(`UPDATE demande SET statut = $2, maj_le = now() WHERE id = $1`, [id, nouveau]);
      // Q3-A — un dossier SATISFAIT reste actif=true même si sa demande est annulée : annuler ne doit JAMAIS faire revenir au
      //   stock un permis dont les documents ont été obtenus. Même garde que le retrait (`satisfait_le IS NULL`).
      if (nouveau === 'annulee') await q(`UPDATE demande_dossier SET actif = false WHERE demande_id = $1 AND satisfait_le IS NULL`, [id]);
      // LOT B1 — annuler une demande TÉLÉSERVICE lève sa présomption de dépôt (verrou de commune) → 'renoncee' (geste = renoncement ;
      //   aucune échéance CRPA ne court d'ici). POINT UNIQUE : BlocDepot.annuler ET « abandonner » de SuiviDemandes passent par ici.
      //   Autres canaux : aucune présomption n'existe (le signal « copier » est formulaire-only) → on ne l'appelle pas. Idempotent
      //   (0 ligne = no-op) ; dans la MÊME transaction, sans pouvoir faire échouer l'annulation. PAS sur 'prete' (encore à déposer).
      if (nouveau === 'annulee' && canal === 'formulaire') await resoudreDepotPresume(q, id, 'renoncee', auteur);
      // B1 — RÉOUVERTURE : réactive les dossiers de la demande, SAUF ceux déjà actifs sur une autre demande (conflict-safe).
      if (nouveau === 'prete' && avant === 'annulee') {
        await q(
          `UPDATE demande_dossier dd SET actif = true
            WHERE dd.demande_id = $1 AND NOT dd.actif
              AND NOT EXISTS (SELECT 1 FROM demande_dossier o WHERE o.dossier_id = dd.dossier_id AND o.actif AND o.demande_id <> dd.demande_id)`,
          [id],
        );
        // Les liens restés inactifs après la réactivation = ceux tenus par une autre demande active → compte rendu.
        const { rows: cr } = await q<{ num_dau: string; conflit: number }>(
          `SELECT s.num_dau, o.demande_id::int AS conflit
             FROM demande_dossier dd
             JOIN demande_dossier o ON o.dossier_id = dd.dossier_id AND o.actif AND o.demande_id <> dd.demande_id
             JOIN sitadel_dossier s ON s.id = dd.dossier_id
            WHERE dd.demande_id = $1 AND NOT dd.actif`,
          [id],
        );
        for (const x of cr) conflits.push({ demandeId: id, numDau: x.num_dau, dejaActiveSurDemandeId: x.conflit });
      }
      await q(`INSERT INTO demande_journal (demande_id, statut_avant, statut_apres, motif, auteur) VALUES ($1, $2, $3, $4, $5)`, [id, avant, nouveau, motif, auteur]);
    }
  });
  return conflits;
}

/** D1 — refus détaillé d'une annulation en masse (compte rendu chiffré). */
export interface RefusAnnulation { id: number; reference: string | null; statut: string | null; raison: string }
/** D1 — compte rendu d'une annulation en masse : N annulées, M permis rendus au réservoir, détail des refusées. */
export interface RapportAnnulation { annulees: number; permisLiberes: number; refusees: RefusAnnulation[] }

/**
 * D1 — ANNULATION EN MASSE des demandes NON ENVOYÉES, PER-ITEM RÉSILIENTE (jamais tout-ou-rien : chaque demande éligible est
 * annulée, chaque refus est RAPPORTÉ avec sa raison). Passe par le MÊME chemin d'annulation que `changerStatutLot`
 * (`UPDATE demande SET statut='annulee'` + `demande_dossier.actif=false` sur les non satisfaits + présomption téléservice levée +
 * journal auteur) — AUCUN DELETE. Rend les permis au réservoir : `permisLiberes` = dossiers DISTINCTS effectivement désactivés
 * (RETURNING), ceux qui redeviennent proposables (la logique « déjà demandé » lit `dd.actif`, cf. SQL_DOSSIERS_DEJA_DEMANDES).
 *
 * `autoriserPrete` : le geste de MASSE par défaut le laisse à `false` → une 'prete' est REFUSÉE ('prete_exclue'), jamais emportée
 * en silence. Le geste DÉDIÉ à une prête le passe à `true`. 🔴 'envoyee'/'close' sont TOUJOURS refusées (verdictAnnulation).
 */
export async function annulerLot(ids: number[], auteur: string | null, autoriserPrete: boolean): Promise<RapportAnnulation> {
  const refusees: RefusAnnulation[] = [];
  const dossiersLiberes = new Set<number>();
  let annulees = 0;
  if (ids.length === 0) return { annulees: 0, permisLiberes: 0, refusees };
  const motif = ids.length > 1 ? 'annulation (lot)' : 'annulation';
  await withTransaction(async (tx) => {
    const q = asQ(tx);
    for (const id of ids) {
      const { rows } = await q<{ statut: string; dest_canal: string | null; reference: string }>(`SELECT statut, dest_canal, reference FROM demande WHERE id = $1`, [id]);
      const row = rows[0] ?? null;
      const statut = row?.statut ?? null;
      const verdict = verdictAnnulation(statut, autoriserPrete);
      if (verdict !== 'annulable') {
        refusees.push({ id, reference: row?.reference ?? null, statut, raison: RAISON_REFUS_ANNULATION[verdict] });
        continue;
      }
      // MÊME séquence que la branche 'annulee' de changerStatutLot (:934-942, :974) — garder les deux en phase.
      await q(`UPDATE demande SET statut = 'annulee', maj_le = now() WHERE id = $1`, [id]);
      const libs = await q<{ dossier_id: number }>(`UPDATE demande_dossier SET actif = false WHERE demande_id = $1 AND satisfait_le IS NULL AND actif RETURNING dossier_id`, [id]);
      for (const l of libs.rows) dossiersLiberes.add(l.dossier_id);
      if (row?.dest_canal === 'formulaire') await resoudreDepotPresume(q, id, 'renoncee', auteur);
      await q(`INSERT INTO demande_journal (demande_id, statut_avant, statut_apres, motif, auteur) VALUES ($1, $2, 'annulee', $3, $4)`, [id, statut, motif, auteur]);
      annulees += 1;
    }
  });
  return { annulees, permisLiberes: dossiersLiberes.size, refusees };
}

/**
 * R5c — CLÔTURE d'une demande : enfin un ÉCRIVAIN pour 'close' (statut sans écrivain depuis le premier jour du module).
 * Réutilise la MÊME ligne de transition que changerStatutLot — `UPDATE demande SET statut = $2 … WHERE id = $1`, params
 * `[id, nouveau]` — la ligne exacte du bug 22P02 corrigé en S41 : ne JAMAIS réinverser cet ordre (statut lié à $2, id à $1).
 * INTERDIT hors 'envoyee' : une demande brouillon / prête / annulée n'est jamais partie, elle n'a rien à clôturer. Si des
 * dossiers restent DUS, la clôture reste possible mais EXIGE un motif (elle arrête le suivi d'échéance). Transactionnel
 * (demande + demande_journal). N'envoie rien ; ne touche pas les relances (l'auto ne relance plus une demande non 'envoyee').
 */
export async function cloturerDemande(id: number, motif: string, auteur: string | null): Promise<void> {
  await withTransaction(async (tx) => {
    const q = asQ(tx);
    const r = await q<{ statut: string; dus: number }>(
      `SELECT statut,
              (SELECT count(*)::int FROM demande_dossier dd WHERE dd.demande_id = $1 AND dd.actif AND dd.satisfait_le IS NULL) AS dus
         FROM demande WHERE id = $1`,
      [id]);
    const row = r.rows[0];
    if (!row) throw new TransitionInterditeError('demande introuvable');
    if (row.statut !== 'envoyee') throw new TransitionInterditeError(`demande « ${row.statut} » : seule une demande envoyée peut être clôturée`);
    const motifNet = (motif ?? '').trim();
    if (row.dus > 0 && motifNet === '') throw new TransitionInterditeError(`${row.dus} dossier(s) encore dû(s) : un motif de clôture est requis`);
    const motifFinal = motifNet !== '' ? motifNet : 'clôture (tous les dossiers satisfaits)';
    await q(`UPDATE demande SET statut = $2, maj_le = now() WHERE id = $1`, [id, 'close']); // ordre [id, nouveau] — cf. S41 (22P02)
    await q(`INSERT INTO demande_journal (demande_id, statut_avant, statut_apres, motif, auteur) VALUES ($1, $2, 'close', $3, $4)`, [id, row.statut, motifFinal, auteur]);
  });
}

/**
 * R5c — RÉOUVERTURE d'une demande clôturée ('close' → 'envoyee'), journalisée. Indispensable, pas un confort : une clôture
 * erronée sort la demande du suivi d'échéance SANS signal alors que le délai CRPA continue de courir — le retour arrière doit
 * exister (comme le démarquage d'un dossier en R5b). Après réouverture, l'échéance se RECALCULE seule depuis envoye_le : on ne
 * stocke AUCUNE date dérivée. Même ligne de transition, même ordre de paramètres `[id, nouveau]`. Transactionnel.
 */
export async function rouvrirDemande(id: number, motif: string | null, auteur: string | null): Promise<void> {
  await withTransaction(async (tx) => {
    const q = asQ(tx);
    const r = await q<{ statut: string }>(`SELECT statut FROM demande WHERE id = $1`, [id]);
    const row = r.rows[0];
    if (!row) throw new TransitionInterditeError('demande introuvable');
    if (row.statut !== 'close') throw new TransitionInterditeError(`demande « ${row.statut} » : seule une demande close peut être rouverte`);
    const motifFinal = (motif ?? '').trim() !== '' ? (motif as string).trim() : 'réouverture (clôture annulée)';
    await q(`UPDATE demande SET statut = $2, maj_le = now() WHERE id = $1`, [id, 'envoyee']); // ordre [id, nouveau] — cf. S41 (22P02)
    await q(`INSERT INTO demande_journal (demande_id, statut_avant, statut_apres, motif, auteur) VALUES ($1, 'close', 'envoyee', $2, $3)`, [id, motifFinal, auteur]);
  });
}

// ── Dépôt manuel sur téléservice (canal 'formulaire' — S16) ──────────────────────────────────────────────────────────
export interface DemandeADeposer {
  id: number; reference: string; communeNom: string | null; url: string | null; corps: string | null; statut: string; nbDossiers: number;
  /** U2/U4/U5 : dossiers ATTACHÉS + leurs parcelles + les lignes SŒURS (même num_dau, type ≠) → repli d'adresse vérifié par le cadastre. */
  dossiers: {
    type: 'PC' | 'PD'; numDau: string; adresse: string | null; codePostal: string | null; communeNom: string | null; parcelles: string[];
    soeurs: { type: 'PC' | 'PD'; adresse: string | null; codePostal: string | null; communeNom: string | null; parcelles: string[] }[];
  }[];
}

/** Demandes en canal 'formulaire' encore à déposer (brouillon/prête). Corps = texte figé (genererTexte), URL = téléservice figé. */
export async function listerADeposer(): Promise<DemandeADeposer[]> {
  const { rows } = await query<{ id: number; reference: string; commune_nom: string | null; url: string | null; corps: string | null; statut: string; nb: number; dossiers: DemandeADeposer['dossiers'] }>(
    // U2/U4 : dossiers ATTACHÉS (type + num_dau + adresse). U5 : + `parcelles` (normalisées « SEC-NUM ») et `soeurs` (mêmes num_dau,
    //   type ≠, avec adresse + parcelles) → repli d'adresse cross-type VÉRIFIÉ PAR LE CADASTRE, résolu côté TS (resoudreAdresseAvecReplis).
    `SELECT d.id::int AS id, d.reference, c.nom AS commune_nom, d.dest_url_formulaire AS url, d.corps, d.statut,
            (SELECT count(*)::int FROM demande_dossier dd WHERE dd.demande_id = d.id) AS nb,
            coalesce((SELECT json_agg(json_build_object(
                        'type', s.type, 'numDau', s.num_dau,
                        'adresse', nullif(btrim(concat_ws(' ', s.adr_num_ter, s.adr_libvoie_ter, s.adr_localite_ter)), ''),
                        'codePostal', s.adr_codpost_ter, 'communeNom', cs.nom,
                        'parcelles', ARRAY(SELECT upper(btrim(px.sec)) || '-' || btrim(px.num)
                                             FROM (VALUES (s.sec_cadastre1, s.num_cadastre1), (s.sec_cadastre2, s.num_cadastre2), (s.sec_cadastre3, s.num_cadastre3)) px(sec, num)
                                            WHERE coalesce(btrim(px.sec), '') <> ''),
                        'soeurs', (SELECT coalesce(json_agg(json_build_object(
                                       'type', o.type,
                                       'adresse', nullif(btrim(concat_ws(' ', o.adr_num_ter, o.adr_libvoie_ter, o.adr_localite_ter)), ''),
                                       'codePostal', o.adr_codpost_ter, 'communeNom', co.nom,
                                       'parcelles', ARRAY(SELECT upper(btrim(ox.sec)) || '-' || btrim(ox.num)
                                                            FROM (VALUES (o.sec_cadastre1, o.num_cadastre1), (o.sec_cadastre2, o.num_cadastre2), (o.sec_cadastre3, o.num_cadastre3)) ox(sec, num)
                                                           WHERE coalesce(btrim(ox.sec), '') <> ''))), '[]'::json)
                                     FROM sitadel_dossier o LEFT JOIN commune co ON co.code_insee = o.code_insee
                                    WHERE o.num_dau = s.num_dau AND o.type <> s.type)) ORDER BY s.num_dau)
                        FROM demande_dossier dd JOIN sitadel_dossier s ON s.id = dd.dossier_id
                        LEFT JOIN commune cs ON cs.code_insee = s.code_insee
                       WHERE dd.demande_id = d.id AND dd.actif), '[]'::json) AS dossiers
     FROM demande d LEFT JOIN commune c ON c.code_insee = d.code_insee
     WHERE d.dest_canal = 'formulaire' AND d.statut IN ('brouillon', 'prete')
     ORDER BY d.cree_le DESC`,
  );
  return rows.map((x) => ({ id: x.id, reference: x.reference, communeNom: x.commune_nom, url: x.url, corps: x.corps, statut: x.statut, nbDossiers: x.nb, dossiers: x.dossiers ?? [] }));
}

/** Dépôt manuel interdit (mauvais canal ou statut déjà avancé) — raison exposée. */
export class DepotInterditError extends Error {
  constructor(public raison: string) { super(raison); this.name = 'DepotInterditError'; }
}

/** P1 — la même référence est déjà enregistrée pour cette demande (violation de l'unique) — 409 métier, jamais 503. */
export class ReferenceDejaEnregistreeError extends Error {
  constructor() { super('cette référence est déjà enregistrée pour cette demande'); this.name = 'ReferenceDejaEnregistreeError'; }
}

/**
 * P1 — enregistre une RÉFÉRENCE interne de la MAIRIE sur une demande (preuve de dépôt / point d'entrée d'appel). INDÉPENDANT
 * du statut : une demande DÉJÀ déposée peut en recevoir une APRÈS COUP (l'accusé de réception arrive parfois plus tard que le
 * dépôt — cas réel de la demande 119). L'unique (demande_id, reference) empêche le doublon → 23505 traduit en
 * `ReferenceDejaEnregistreeError` (409 métier). `reference` est nettoyée (trim). N'écrit JAMAIS demande.statut.
 */
export async function ajouterReferenceExterne(
  demandeId: number, reference: string,
  opts: { dossierId?: number | null; source?: string | null; note?: string | null; recuLe?: string | null } = {},
): Promise<void> {
  try {
    await query(
      `INSERT INTO demande_reference_externe (demande_id, dossier_id, reference, source, note, recu_le)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [demandeId, opts.dossierId ?? null, reference.trim(), opts.source ?? null, opts.note ?? null, opts.recuLe ?? null],
    );
  } catch (e) {
    if ((e as { code?: string }).code === '23505') throw new ReferenceDejaEnregistreeError();
    throw e; // inattendu → remonte au catch journalisé de la route (503)
  }
}

/**
 * FUS-4 — SUPPRIME une référence mairie d'une demande (corriger une saisie, retirer un accusé mal capté). 🔴 N'écrit JAMAIS
 * demande.statut ni envoye_le : effacer une référence NE DÉFAIT JAMAIS un envoi validé — l'échéance CRPA et le verrou de dépôt
 * (Lot A) ne bougent pas. Le statut « accusé reçu » étant DÉRIVÉ (référence OU message 'accuse'), l'affichage revient de
 * lui-même. Idempotent : renvoie true si une ligne a été retirée, false si la référence n'existait pas. `reference` nettoyée (trim).
 */
export async function supprimerReferenceExterne(demandeId: number, reference: string): Promise<boolean> {
  const res = await query(
    `DELETE FROM demande_reference_externe WHERE demande_id = $1 AND reference = $2`,
    [demandeId, reference.trim()],
  );
  return (res.rowCount ?? 0) > 0;
}

/**
 * Marque une demande 'formulaire' comme DÉPOSÉE À LA MAIN → statut 'envoyee' (statut existant ; un dépôt réel sollicite la
 * commune et consomme donc son plafond mensuel — cf. lireHistorique). Réservé au canal 'formulaire' et aux statuts
 * brouillon/prête. Journalisé. AUCUN envoi automatique. B2 — écrit AUSSI la ligne demande_acheminement (canal 'formulaire',
 * envoye_le=now) : le registre juridique unique et l'ancre d'échéance, exactement comme le fait l'e-mail.
 *
 * P1 — `reference` FACULTATIVE : si la mairie a renvoyé sa référence (accusé de réception), on la greffe DANS LA MÊME
 * transaction. `ON CONFLICT DO NOTHING` : un doublon ne bloque JAMAIS le dépôt (le geste métier prime). Absente/vide → le
 * dépôt se fait sans référence (elle pourra être ajoutée après coup via `ajouterReferenceExterne`).
 */
export async function marquerDeposee(id: number, auteur: string | null, reference?: string | null, envoyeLe?: Date | string | null): Promise<void> {
  await withTransaction(async (tx) => {
    const q = asQ(tx);
    const r = await q<{ statut: string; canal: string | null }>(`SELECT statut, dest_canal AS canal FROM demande WHERE id = $1`, [id]);
    const row = r.rows[0];
    if (!row) throw new DepotInterditError('demande introuvable');
    if (row.canal !== 'formulaire') throw new DepotInterditError('le dépôt manuel est réservé au canal formulaire');
    if (row.statut !== 'brouillon' && row.statut !== 'prete') throw new DepotInterditError(`déjà « ${row.statut} » — dépôt impossible`);
    await q(`UPDATE demande SET statut = 'envoyee', maj_le = now() WHERE id = $1`, [id]);
    // B2 — HORODATE l'envoi dans le registre juridique UNIQUE (demande_acheminement), MÊME ancre `envoye_le` que l'e-mail : sans
    //   elle, etatEcheance reste « pas encore envoyée » et la boucle juridique (relance, CADA) est inerte. Canal 'formulaire'
    //   (téléservice) ; PAS de message_id ni de retour fournisseur (un dépôt téléservice n'en produit aucun) → NULL, ce qui DIT
    //   l'absence d'artefact e-mail sans en inventer. `statut='envoye'` = c'est bien parti à la mairie.
    // T4 — `envoyeLe` = la DATE RÉELLE DE DÉPÔT saisie par l'opérateur (rattrapage relève) ; absente → now() (dépôt en direct).
    //   L'ancre d'échéance/forclusion CADA se cale ainsi sur le dépôt prouvé, jamais sur la date du mail (cf. recon T4).
    // FUS — INVARIANT téléservice : `envoye_le` ne peut JAMAIS être postérieur au PREMIER accusé rattaché à la demande.
    //   Chronologie réelle copier ≤ dépôt ≤ accusé : l'accusé PROUVE que le dépôt existait à cet instant et, pour un
    //   téléservice qui accuse immédiatement, c'est l'estimation la plus SERRÉE du dépôt réel. On garde l'instant de validation
    //   (coalesce($2, now())), plafonné à l'accusé via LEAST. Aucun accusé rattaché → 'infinity' ⇒ pas de plafond, le clic
    //   reste la seule ancre (cf. recon §6). Le clic « copier » (borne INFÉRIEURE, « j'ai copié » ≠ « j'ai déposé ») n'entre
    //   PAS dans le calcul. UNIQUEMENT le canal 'formulaire' : l'e-mail horodate déjà l'émission SMTP réelle (envoiDemande),
    //   jamais touché. Même invariant que la validation T4 (envoyeLe ≤ message), en UN SEUL endroit — l'écriture.
    await q(
      `INSERT INTO demande_acheminement (demande_id, canal, statut, envoye_le)
       VALUES ($1, 'formulaire', 'envoye', LEAST(
         coalesce($2::timestamptz, now()),
         coalesce((SELECT min(r.recu_le) FROM demande_reponse r WHERE r.demande_id = $1 AND r.nature = 'accuse'), 'infinity'::timestamptz)))`,
      [id, envoyeLe ?? null],
    );
    await q(`INSERT INTO demande_journal (demande_id, statut_avant, statut_apres, motif, auteur) VALUES ($1, $2, 'envoyee', 'dépôt manuel (téléservice)', $3)`, [id, row.statut, auteur]);
    const ref = (reference ?? '').trim();
    if (ref !== '') {
      await q(
        `INSERT INTO demande_reference_externe (demande_id, reference, source, recu_le) VALUES ($1, $2, 'accuse_reception', now())
         ON CONFLICT (demande_id, reference) DO NOTHING`,
        [id, ref],
      );
    }
    // LOT B1 — le dépôt téléservice RÉSOUT la présomption (signal « copier ») → 'deposee', dans la MÊME transaction (atomicité :
    //   aucune fenêtre « déposée mais verrou de commune encore tenu »). marquerDeposee est déjà formulaire-only (garde ci-dessus).
    //   Idempotent (0 ligne = no-op si jamais « copié ») ; ne peut pas faire échouer le dépôt.
    await resoudreDepotPresume(q, id, 'deposee', auteur);
  });
}

// ── Bascule de profil (régénère le corps depuis l'identité COURANTE du profil cible) ─────────────────────────────────
interface LigneDossierRegen {
  id: number; type: 'PC' | 'PD'; num_dau: string; date_reelle_autorisation: string | null;
  adr_num_ter: string | null; adr_libvoie_ter: string | null; adr_localite_ter: string | null; adr_codpost_ter: string | null;
  sec_cadastre1: string | null; num_cadastre1: string | null; sec_cadastre2: string | null; num_cadastre2: string | null; sec_cadastre3: string | null; num_cadastre3: string | null;
}
function cadastreDe(r: LigneDossierRegen): string[] {
  const refs: string[] = [];
  for (const [sec, num] of [[r.sec_cadastre1, r.num_cadastre1], [r.sec_cadastre2, r.num_cadastre2], [r.sec_cadastre3, r.num_cadastre3]]) {
    if ((sec ?? '').trim() !== '' || (num ?? '').trim() !== '') refs.push(`${(sec ?? '').trim()} ${(num ?? '').trim()}`.trim());
  }
  return refs;
}

/** Reconstruit le `Lot` d'une demande (pour régénérer son texte) à partir de ses dossiers rattachés. `null` si absente. */
async function chargerPourRegeneration(q: Requete, id: number): Promise<{ statut: string; reference: string; profilAvant: ProfilDemandeur; lot: Lot } | null> {
  const r = await q<{ reference: string; code_insee: string; commune_nom: string | null; dest_canal: string | null; statut: string; profil_demandeur: string }>(
    `SELECT d.reference, d.code_insee, c.nom AS commune_nom, d.dest_canal, d.statut, d.profil_demandeur
     FROM demande d LEFT JOIN commune c ON c.code_insee = d.code_insee WHERE d.id = $1`, [id],
  );
  const x = r.rows[0];
  if (!x) return null;
  const doss = await q<LigneDossierRegen>(
    `SELECT s.id, s.type, s.num_dau, s.date_reelle_autorisation::text AS date_reelle_autorisation,
            s.adr_num_ter, s.adr_libvoie_ter, s.adr_localite_ter, s.adr_codpost_ter,
            s.sec_cadastre1, s.num_cadastre1, s.sec_cadastre2, s.num_cadastre2, s.sec_cadastre3, s.num_cadastre3
     FROM demande_dossier dd JOIN sitadel_dossier s ON s.id = dd.dossier_id
     WHERE dd.demande_id = $1 AND dd.actif ORDER BY s.num_dau`, [id],
  );
  const communeNom = x.commune_nom ?? x.code_insee;
  const dossiers: CandidatDossier[] = doss.rows.map((d) => ({
    dossierId: d.id, codeInsee: x.code_insee, communeNom, canal: (x.dest_canal as CanalContact | null),
    type: d.type, // U2 : type d'autorisation pour la référence (régénération du corps)
    numDau: d.num_dau, dateReelleAutorisation: d.date_reelle_autorisation,
    adresse: [d.adr_num_ter, d.adr_libvoie_ter, d.adr_localite_ter].filter((v) => v && v.trim() !== '').join(' '),
    codePostal: d.adr_codpost_ter, cadastre: cadastreDe(d),
    etatDau: null, absentDuDernierMillesime: false, // non pertinents pour la RÉGÉNÉRATION de texte (dossiers déjà rattachés)
  }));
  const lot: Lot = { codeInsee: x.code_insee, communeNom, canal: (x.dest_canal as CanalContact) ?? 'email', dossiers };
  return { statut: x.statut, reference: x.reference, profilAvant: profilValide(x.profil_demandeur), lot };
}

/** Bascule le profil d'UNE demande (délègue au lot). */
export async function changerProfil(id: number, profil: ProfilDemandeur, auteur: string | null): Promise<void> {
  return changerProfilLot([id], profil, auteur);
}

/**
 * Bascule le profil d'un LOT de demandes, EN TOUT-OU-RIEN (une transaction). Autorisée UNIQUEMENT sur des demandes en
 * 'brouillon' (sinon `TransitionInterditeError` → rollback total, aucune écriture). Régénère l'objet ET le corps depuis
 * l'identité COURANTE du profil cible, met à jour `profil_demandeur`, et journalise le changement (append-only). AUCUN
 * ENVOI. ⚠️ écrase les modifications manuelles du corps (le texte est reconstruit — l'UI en avertit avant d'appeler).
 */
export async function changerProfilLot(ids: number[], profil: ProfilDemandeur, auteur: string | null): Promise<void> {
  if (ids.length === 0) return;
  const cfgVeille = await chargerConfigVeille();
  const cfgProfil = await lireConfigDemandeur(profil);
  const pieces = piecesDepuisConfig(cfgVeille.piecesDemandees);
  await withTransaction(async (tx) => {
    const q = asQ(tx);
    for (const id of ids) {
      const d = await chargerPourRegeneration(q, id);
      if (!d) throw new TransitionInterditeError(`demande ${id} introuvable`);
      if (d.statut !== 'brouillon') throw new TransitionInterditeError(`la demande ${d.reference} n'est pas en brouillon (statut : ${d.statut}) — bascule de profil impossible`);
      const { objet, corps } = genererTexte(d.lot, cfgProfil, d.reference, pieces, profil, cfgVeille.adresseReponse,
        { serviceActive: cfgVeille.mentionServiceActive, serviceTexte: cfgVeille.mentionServiceTexte, delaiActive: cfgVeille.mentionDelaiActive, delaiTexte: cfgVeille.mentionDelaiTexte,
          sourcesActive: cfgVeille.mentionSourcesActive, sourcesTexte: cfgVeille.mentionSourcesTexte }); // S39/S40/S-DWG : réponse + mentions figées
      await q(`UPDATE demande SET objet = $2, corps = $3, profil_demandeur = $4, maj_le = now() WHERE id = $1`, [id, objet, corps, profil]);
      await q(`INSERT INTO demande_journal (demande_id, statut_avant, statut_apres, motif, auteur) VALUES ($1, $2, $2, $3, $4)`, [id, d.statut, `profil ${d.profilAvant} → ${profil}`, auteur]);
    }
  });
}

// ── Collaborateurs (chantier S8a) ────────────────────────────────────────────
/** Collaborateurs ACTIFS (l'éligibilité fine — identité crédible — est vérifiée par le tourniquet). */
export async function lireCollaborateursActifs(): Promise<Collaborateur[]> {
  const { rows } = await query<{ id: number; nom: string; prenom: string; fonction: string; email: string; actif: boolean }>(
    `SELECT id, nom, prenom, coalesce(fonction, '') AS fonction, email, actif FROM collaborateur WHERE actif ORDER BY id`,
  );
  return rows;
}

/** Pour le tourniquet : date ISO de la DERNIÈRE demande de chaque collaborateur, PAR COMMUNE. */
async function lireDernieresParCommune(): Promise<Map<string, Map<number, string | null>>> {
  const { rows } = await query<{ code_insee: string; collaborateur_id: number; d: string }>(
    `SELECT code_insee, collaborateur_id, max(cree_le)::text AS d FROM demande WHERE collaborateur_id IS NOT NULL GROUP BY code_insee, collaborateur_id`,
  );
  const m = new Map<string, Map<number, string | null>>();
  for (const r of rows) {
    const c = m.get(r.code_insee) ?? new Map<number, string | null>();
    c.set(r.collaborateur_id, r.d);
    m.set(r.code_insee, c);
  }
  return m;
}

/** Pour l'équilibrage GLOBAL du tourniquet (S8b) : nb total de demandes déjà portées par chaque collaborateur, toutes communes confondues. */
async function lireChargeGlobale(): Promise<Map<number, number>> {
  const { rows } = await query<{ collaborateur_id: number; n: number }>(
    `SELECT collaborateur_id, count(*)::int AS n FROM demande WHERE collaborateur_id IS NOT NULL GROUP BY collaborateur_id`,
  );
  return new Map(rows.map((r) => [r.collaborateur_id, r.n]));
}

export interface CollaborateurListe extends Collaborateur { creeLe: string; desactiveLe: string | null; nbPC: number; nbPD: number; nbEnAttente: number }

/** Tous les collaborateurs (actifs + désactivés) avec compteurs : dossiers PC/PD couverts + demandes en attente de réponse. */
export async function lireCollaborateurs(): Promise<CollaborateurListe[]> {
  const { rows } = await query<{ id: number; nom: string; prenom: string; fonction: string; email: string; actif: boolean; cree_le: string; desactive_le: string | null; nb_pc: number; nb_pd: number; nb_attente: number }>(
    `SELECT c.id, c.nom, c.prenom, coalesce(c.fonction, '') AS fonction, c.email, c.actif, c.cree_le::text AS cree_le, c.desactive_le::text AS desactive_le,
            count(dd.*) FILTER (WHERE s.type = 'PC')::int AS nb_pc,
            count(dd.*) FILTER (WHERE s.type = 'PD')::int AS nb_pd,
            count(DISTINCT d.id) FILTER (WHERE d.statut = 'envoyee')::int AS nb_attente
     FROM collaborateur c
     LEFT JOIN demande d ON d.collaborateur_id = c.id
     LEFT JOIN demande_dossier dd ON dd.demande_id = d.id
     LEFT JOIN sitadel_dossier s ON s.id = dd.dossier_id
     GROUP BY c.id ORDER BY c.actif DESC, c.nom, c.prenom`,
  );
  return rows.map((r) => ({
    id: r.id, nom: r.nom, prenom: r.prenom, fonction: r.fonction, email: r.email, actif: r.actif,
    creeLe: r.cree_le, desactiveLe: r.desactive_le, nbPC: r.nb_pc, nbPD: r.nb_pd, nbEnAttente: r.nb_attente,
  }));
}

/** Crée un collaborateur (identité DÉJÀ validée côté route). Conflit d'e-mail (unique, insensible casse) → null. */
export async function creerCollaborateur(champs: { nom: string; prenom: string; fonction: string; email: string }): Promise<{ id: number } | null> {
  try {
    const { rows } = await query<{ id: number }>(
      `INSERT INTO collaborateur (nom, prenom, fonction, email) VALUES ($1, $2, $3, $4) RETURNING id`,
      [champs.nom.trim(), champs.prenom.trim(), champs.fonction.trim() === '' ? null : champs.fonction.trim(), champs.email.trim()],
    );
    return { id: rows[0].id };
  } catch {
    return null; // conflit lower(email) unique — l'appelant renvoie « e-mail déjà utilisé »
  }
}

/** (Dé)active un collaborateur — JAMAIS de suppression. Désactivé → plus jamais choisi ; historique conservé. */
export async function changerActivationCollaborateur(id: number, actif: boolean): Promise<void> {
  await query(`UPDATE collaborateur SET actif = $2, desactive_le = CASE WHEN $2 THEN NULL ELSE now() END WHERE id = $1`, [id, actif]);
}
