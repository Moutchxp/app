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
} from './demande';
import { type Collaborateur, choisirCollaborateur } from './collaborateur';
import { resoudreDestination, type ContactCommune } from './destinataire';
import { expressionRangSql, classer, type CleCategorie } from './priorite'; // D2 : expressionRangSql réutilisé (pur) ; Q2b : classer = source unique de catégorie pour le panneau de stock — NE modifie PAS le chemin candidats
import { agregerStock, moisDePeriode, FENETRE_STOCK_MOIS, type LigneStock, type DossierStock } from './stock'; // Q2b : agrégat PUR du stock (réutilise estCandidatEligible via agregerStock)

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
function paramsLot(cfg: ConfigVeille): ParamsLot {
  return { dossiersParDemande: cfg.dossiersParDemande, permisParCommuneParMois: cfg.permisParCommuneParMois, dateMin: dateMinDepuis(cfg.ancienneteMaxDemandeAnnees) };
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
 * 'abandonnee' ne sollicite PAS la commune). AUCUN ENVOI n'existe encore : ce comptage est donc nul aujourd'hui — c'est voulu.
 */
async function lireHistorique(): Promise<HistoriqueDemandes> {
  const [att, mois] = await Promise.all([
    query<{ dossier_id: number }>(`SELECT dossier_id FROM demande_dossier WHERE actif`),
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
export async function proposition(cfg: ConfigVeille): Promise<{ lots: Lot[]; diagnostic: DiagnosticProposition }> {
  const [dossiers, hist] = await Promise.all([lireDossiersPriorite(cfg, cfg.nbCandidatsExamines), lireHistorique()]);
  const candidats = dossiers.map(versCandidat);
  const params = paramsLot(cfg);
  return { lots: proposerLots(candidats, params, hist), diagnostic: diagnostiquer(candidats, hist, params) };
}

// ── Q2b : STOCK de permis encore à demander, par commune et par type (LECTURE SEULE) ─────────────────────────────────
export interface StockResultat { lignes: LigneStock[]; tronque: boolean; genereEnMs: number; fenetreMois: number }

/**
 * Q2b — STOCK par commune. Charge la fenêtre d'AFFICHAGE (6 mois), mappe chaque dossier en candidat via le MÊME `versCandidat`
 * que la proposition (donc résolution de destinataire/canal IDENTIQUE), et agrège par `agregerStock` — qui applique
 * `estCandidatEligible` (l'UNIQUE définition d'éligibilité, Q2a) + la borne d'affichage 6 mois. On ne charge QUE 6 mois car
 * la colonne du tableau est « < 6 mois » : aucun dossier plus ancien ne peut y figurer, et `estCandidatEligible` (fenêtre
 * d'éligibilité complète) est appliqué en entier → strictement équivalent à charger toute la fenêtre, en ~5× moins de lignes.
 * `genereEnMs` = temps de génération, rendu à l'écran (transparence de perf). NE touche ni le chemin candidats ni la base.
 */
export async function stockPermisParCommune(cfg: ConfigVeille): Promise<StockResultat> {
  const t0 = Date.now();
  const dateMin = dateMinDepuis(cfg.ancienneteMaxDemandeAnnees); // borne d'ÉLIGIBILITÉ (inchangée — passée à estCandidatEligible)
  const dateMin6mois = dateMinMois(FENETRE_STOCK_MOIS);          // borne d'AFFICHAGE (sous-ensemble strict)
  const [{ lignes, tronque }, hist] = await Promise.all([lireDossiersDepuis(cfg, dateMin6mois), lireHistorique()]);
  const dossiers: DossierStock[] = lignes.map((d) => ({ candidat: versCandidat(d), categorie: d.categorie }));
  const stock = agregerStock(dossiers, dateMin, hist.dejaRattaches, dateMin6mois);
  if (tronque) console.warn('[permis/stock] plafond de chargement atteint — stock possiblement incomplet (réduire la fenêtre ou passer à un agrégat SQL)');
  return { lignes: stock, tronque, genereEnMs: Date.now() - t0, fenetreMois: FENETRE_STOCK_MOIS };
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
export async function creerDemandes(cfg: ConfigVeille, annee: number, auteur: string | null, profilDemande: ProfilDemandeur | undefined, selection: { cle: string; communeNom: string | null }[]): Promise<CompteRenduCreation> {
  const profil = profilDemande ?? profilValide(cfg.profilDemandeurDefaut);
  const { lots } = await proposition(cfg);
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
          { serviceActive: cfg.mentionServiceActive, serviceTexte: cfg.mentionServiceTexte, delaiActive: cfg.mentionDelaiActive, delaiTexte: cfg.mentionDelaiTexte }); // S39/S40 : réponse + mentions figées
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
  /** D2 — rangs de catégorie DISTINCTS des dossiers de la demande (via classement config), pour le filtre par type. Optionnel : présent sur la LISTE, omis sur le détail. */
  rangs?: number[];
  /** P1 — références internes de la mairie (dépôt manuel), pour la RECHERCHE côté client. Optionnel : présent sur la LISTE. */
  referencesExternes?: string[] }

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
  const sqlRangs = `SELECT dd.demande_id::int AS demande_id, array_agg(DISTINCT (${rangExpr})) AS rangs
    FROM demande_dossier dd JOIN sitadel_dossier d ON d.id = dd.dossier_id GROUP BY dd.demande_id`;
  let referencesIndisponibles = false; // P2 — vrai si la lecture des références échoue (à l'écran : « indisponibles » ≠ « aucune »)
  const [r, rs, rd, rr, rx] = await Promise.all([
    query<{ id: number; reference: string; code_insee: string; commune_nom: string | null; dest_canal: string | null; dest_origine: string; dest_nom: string | null; nb: number; statut: string; profil_demandeur: string; cree_le: string }>(
      // d.id::int : `demande.id` est un bigint que node-postgres rend en CHAÎNE ; sans cast, l'id renvoyé au client est une
      // string et la PATCH groupée (filtre Number.isInteger) l'écarte en silence → boutons « prête »/« abandonner » inertes.
      `SELECT d.id::int AS id, d.reference, d.code_insee, c.nom AS commune_nom, d.dest_canal, d.dest_origine, d.dest_nom, d.statut, d.profil_demandeur, d.cree_le::text AS cree_le,
              (SELECT count(*)::int FROM demande_dossier dd WHERE dd.demande_id = d.id) AS nb
       FROM demande d LEFT JOIN commune c ON c.code_insee = d.code_insee ORDER BY d.cree_le DESC`),
    query<{ statut: string; n: number }>(`SELECT statut, count(*)::int AS n FROM demande GROUP BY statut`),
    query<{ n: number }>(`SELECT count(DISTINCT dossier_id)::int AS n FROM demande_dossier`),
    query<{ demande_id: number; rangs: number[] }>(sqlRangs, paramsRang),
    // P1 — références mairie par demande, agrégées (pour la RECHERCHE côté client). Requête PROPRE à la liste, aucune
    // incidence sur le chemin CANDIDATS. P2 — un échec est JOURNALISÉ et marqué « indisponible » (jamais muet), sans propager
    // un 503 qui viderait l'onglet pour une donnée d'affichage secondaire.
    query<{ demande_id: number; refs: string[] }>(`SELECT demande_id::int AS demande_id, array_agg(reference) AS refs FROM demande_reference_externe GROUP BY demande_id`)
      .catch((e) => { journaliserLectureIndisponible('lecture des références (liste)', e); referencesIndisponibles = true; return { rows: [] as { demande_id: number; refs: string[] }[] }; }),
  ]);
  const parStatut: Record<string, number> = {};
  for (const s of rs.rows) parStatut[s.statut] = s.n;
  const rangsParDemande = new Map(rr.rows.map((x) => [x.demande_id, x.rangs]));
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
    demandes: r.rows.map((x) => ({ id: x.id, reference: x.reference, codeInsee: x.code_insee, communeNom: x.commune_nom, canal: x.dest_canal, destOrigine: x.dest_origine, destNom: x.dest_nom, nbDossiers: x.nb, statut: x.statut, profil: x.profil_demandeur, creeLe: x.cree_le, rangs: rangsParDemande.get(x.id) ?? [], referencesExternes: refsParDemande.get(x.id) ?? [] })),
    alertesIdentite,
    resume: { parStatut, total: r.rows.length, dossiersCouverts: rd.rows[0]?.n ?? 0 },
    referencesIndisponibles,
  };
}

/** P1 — une référence interne de la mairie rattachée à une demande (preuve de dépôt / point d'entrée d'appel). */
export interface ReferenceExterne { id: number; reference: string; dossierId: number | null; source: string | null; recuLe: string | null; creeLe: string }

export interface DemandeDetail extends DemandeListe { objet: string | null; corps: string | null; destEmail: string | null; destUrlFormulaire: string | null; destAdressePostale: string | null; dossiers: { numDau: string; date: string | null }[];
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
  const doss = await query<{ num_dau: string; date: string | null }>(
    `SELECT s.num_dau, s.date_reelle_autorisation::text AS date FROM demande_dossier dd JOIN sitadel_dossier s ON s.id = dd.dossier_id WHERE dd.demande_id = $1 ORDER BY s.num_dau`, [id],
  );
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
    nbDossiers: doss.rows.length, statut: x.statut, profil: x.profil_demandeur, creeLe: x.cree_le, objet: x.objet, corps: x.corps,
    destEmail: x.dest_email, destUrlFormulaire: x.dest_url_formulaire, destAdressePostale: x.dest_adresse_postale,
    dossiers: doss.rows.map((d) => ({ numDau: d.num_dau, date: d.date })),
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
 * Change le statut EN JOURNALISANT. Quitter 'brouillon' (→ 'prete') exige une identité demandeur COMPLÈTE (sinon
 * `IdentiteIncompleteError` avec la liste des champs). Abandonner libère les dossiers (demande_dossier.actif=false).
 * ⚠️ 'envoyee' N'EST PAS gérée ici (l'envoi est un chantier ultérieur).
 */
export async function changerStatut(id: number, nouveau: 'prete' | 'abandonnee', auteur: string | null): Promise<void> {
  return changerStatutLot([id], nouveau, auteur);
}

/**
 * Transition de statut d'un LOT de demandes, EN TOUT-OU-RIEN. Pour 'prete', l'identité est vérifiée UNE FOIS avant toute
 * écriture (sinon `IdentiteIncompleteError` → AUCUNE demande touchée). Sinon, toutes les transitions passent dans UNE
 * transaction (échec = rollback total, aucune transition partielle). Chaque transition est journalisée. AUCUN ENVOI.
 */
export async function changerStatutLot(ids: number[], nouveau: 'prete' | 'abandonnee', auteur: string | null): Promise<void> {
  if (ids.length === 0) return;
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
  const motif = ids.length > 1 ? 'transition (lot)' : 'transition';
  await withTransaction(async (tx) => {
    const q = asQ(tx);
    for (const id of ids) {
      const av = await q<{ statut: string }>(`SELECT statut FROM demande WHERE id = $1`, [id]);
      const avant = av.rows[0]?.statut ?? null;
      await q(`UPDATE demande SET statut = $2, maj_le = now() WHERE id = $1`, [id, nouveau]);
      if (nouveau === 'abandonnee') await q(`UPDATE demande_dossier SET actif = false WHERE demande_id = $1`, [id]);
      await q(`INSERT INTO demande_journal (demande_id, statut_avant, statut_apres, motif, auteur) VALUES ($1, $2, $3, $4, $5)`, [id, avant, nouveau, motif, auteur]);
    }
  });
}

/**
 * R5c — CLÔTURE d'une demande : enfin un ÉCRIVAIN pour 'close' (statut sans écrivain depuis le premier jour du module).
 * Réutilise la MÊME ligne de transition que changerStatutLot — `UPDATE demande SET statut = $2 … WHERE id = $1`, params
 * `[id, nouveau]` — la ligne exacte du bug 22P02 corrigé en S41 : ne JAMAIS réinverser cet ordre (statut lié à $2, id à $1).
 * INTERDIT hors 'envoyee' : une demande brouillon / prête / abandonnée n'est jamais partie, elle n'a rien à clôturer. Si des
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
}

/** Demandes en canal 'formulaire' encore à déposer (brouillon/prête). Corps = texte figé (genererTexte), URL = téléservice figé. */
export async function listerADeposer(): Promise<DemandeADeposer[]> {
  const { rows } = await query<{ id: number; reference: string; commune_nom: string | null; url: string | null; corps: string | null; statut: string; nb: number }>(
    `SELECT d.id::int AS id, d.reference, c.nom AS commune_nom, d.dest_url_formulaire AS url, d.corps, d.statut,
            (SELECT count(*)::int FROM demande_dossier dd WHERE dd.demande_id = d.id) AS nb
     FROM demande d LEFT JOIN commune c ON c.code_insee = d.code_insee
     WHERE d.dest_canal = 'formulaire' AND d.statut IN ('brouillon', 'prete')
     ORDER BY d.cree_le DESC`,
  );
  return rows.map((x) => ({ id: x.id, reference: x.reference, communeNom: x.commune_nom, url: x.url, corps: x.corps, statut: x.statut, nbDossiers: x.nb }));
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
 * Marque une demande 'formulaire' comme DÉPOSÉE À LA MAIN → statut 'envoyee' (statut existant ; un dépôt réel sollicite la
 * commune et consomme donc son plafond mensuel — cf. lireHistorique). Réservé au canal 'formulaire' et aux statuts
 * brouillon/prête. Journalisé. AUCUN envoi automatique.
 *
 * P1 — `reference` FACULTATIVE : si la mairie a renvoyé sa référence (accusé de réception), on la greffe DANS LA MÊME
 * transaction. `ON CONFLICT DO NOTHING` : un doublon ne bloque JAMAIS le dépôt (le geste métier prime). Absente/vide → le
 * dépôt se fait sans référence (elle pourra être ajoutée après coup via `ajouterReferenceExterne`).
 */
export async function marquerDeposee(id: number, auteur: string | null, reference?: string | null): Promise<void> {
  await withTransaction(async (tx) => {
    const q = asQ(tx);
    const r = await q<{ statut: string; canal: string | null }>(`SELECT statut, dest_canal AS canal FROM demande WHERE id = $1`, [id]);
    const row = r.rows[0];
    if (!row) throw new DepotInterditError('demande introuvable');
    if (row.canal !== 'formulaire') throw new DepotInterditError('le dépôt manuel est réservé au canal formulaire');
    if (row.statut !== 'brouillon' && row.statut !== 'prete') throw new DepotInterditError(`déjà « ${row.statut} » — dépôt impossible`);
    await q(`UPDATE demande SET statut = 'envoyee', maj_le = now() WHERE id = $1`, [id]);
    await q(`INSERT INTO demande_journal (demande_id, statut_avant, statut_apres, motif, auteur) VALUES ($1, $2, 'envoyee', 'dépôt manuel (téléservice)', $3)`, [id, row.statut, auteur]);
    const ref = (reference ?? '').trim();
    if (ref !== '') {
      await q(
        `INSERT INTO demande_reference_externe (demande_id, reference, source, recu_le) VALUES ($1, $2, 'accuse_reception', now())
         ON CONFLICT (demande_id, reference) DO NOTHING`,
        [id, ref],
      );
    }
  });
}

// ── Bascule de profil (régénère le corps depuis l'identité COURANTE du profil cible) ─────────────────────────────────
interface LigneDossierRegen {
  id: number; num_dau: string; date_reelle_autorisation: string | null;
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
    `SELECT s.id, s.num_dau, s.date_reelle_autorisation::text AS date_reelle_autorisation,
            s.adr_num_ter, s.adr_libvoie_ter, s.adr_localite_ter, s.adr_codpost_ter,
            s.sec_cadastre1, s.num_cadastre1, s.sec_cadastre2, s.num_cadastre2, s.sec_cadastre3, s.num_cadastre3
     FROM demande_dossier dd JOIN sitadel_dossier s ON s.id = dd.dossier_id
     WHERE dd.demande_id = $1 AND dd.actif ORDER BY s.num_dau`, [id],
  );
  const communeNom = x.commune_nom ?? x.code_insee;
  const dossiers: CandidatDossier[] = doss.rows.map((d) => ({
    dossierId: d.id, codeInsee: x.code_insee, communeNom, canal: (x.dest_canal as CanalContact | null),
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
        { serviceActive: cfgVeille.mentionServiceActive, serviceTexte: cfgVeille.mentionServiceTexte, delaiActive: cfgVeille.mentionDelaiActive, delaiTexte: cfgVeille.mentionDelaiTexte }); // S39/S40 : réponse + mentions figées
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
