/**
 * AUTO-CONFIRMATION DES ACCUSÉS TÉLÉSERVICE (canal FORMULAIRE uniquement) — « zéro geste humain ».
 *
 * Quand un accusé de téléservice arrive et cite le num_dau d'UNE demande en attente (brouillon/prête), on fait TOUT seul :
 *   · BASCULE en envoyée, ancre `envoye_le = recu_le de l'accusé` (l'accusé prouve la réception, point de départ légal R.311-13 ;
 *     côté sûr de l'asymétrie : trop tard = temps perdu, trop tôt = saisine irrecevable) — via `marquerDeposee(..., envoyeLe)`,
 *     AUCUN nouvel écrivain de `envoye_le` ;
 *   · ENREGISTRE la référence mairie (source 'accuse_reception') via `ajouterReferenceExterne` — pas de second écrivain ; le TRIGGER
 *     (migration 163) lève alors le verrou de commune, la commune redevient proposable au vivier ;
 *   · RATTACHE l'accusé (rattachement_methode 'numero_dossier', par le num_dau) ;
 *   · TRACE une ligne `demande_journal` auteur 'systeme' citant la référence captée et la date retenue (une date à portée
 *     juridique qui change seule DOIT être auditable).
 *
 * CONDITIONS CUMULATIVES (toutes requises), garde d'ambiguïté du projet préservée :
 *   1. nature = 'accuse' (filtré par la requête d'accusés) ;
 *   2. demande de canal 'formulaire', statut 'brouillon' ou 'prete' (candidates) ;
 *   3. le num_dau COMPLET apparaît LITTÉRALEMENT dans objet + corps texte + corps HTML (normaliserNumeroDossier, la MÊME que R3e) ;
 *   4. EXACTEMENT UNE demande candidate — 0 ou ≥ 2 : on ne fait RIEN (proposition manuelle T4 conservée) ;
 *   5. EXACTEMENT UNE référence extraite (compterReferencesMairie, objet d'abord) — 0 ou ≥ 2 : on bascule + rattache mais on
 *      n'enregistre AUCUNE référence, et on le SIGNALE au journal ;
 *   6. `estEmisParNous` en AMONT : garanti par construction — un message présent dans `demande_reponse` a déjà passé le filtre
 *      d'auto-émission de la relève (releveReponses.releverBoite), il n'est JAMAIS ré-évalué ici (incident de boucle du 21/08).
 *
 * Le rail E-MAIL est STRICTEMENT INTACT : les candidates sont `dest_canal = 'formulaire'` uniquement, et la file T4 « Dépôts à
 * confirmer » (proposition manuelle) reste le repli pour tout cas ambigu (0/≥2 candidate). IDEMPOTENT : une fois basculée + rattachée,
 * la demande n'est plus 'brouillon'/'prete' ET le message n'est plus `demande_id IS NULL` → un second passage ne fait RIEN.
 */
import { query, withTransaction } from '../db/client';
import { marquerDeposee, ajouterReferenceExterne, DepotInterditError, ReferenceDejaEnregistreeError } from '../sitadel/demandeRepo';
import { reclamperEnvoyeLe } from './demandeReponseRepo';
import { compterReferencesMairie } from './releveReponses'; // RÉUTILISE MOTIF_REFERENCE (aucune 2e définition du motif)
import { normaliserNumeroDossier } from './satisfactionDossier'; // MÊME normalisation « littérale » de num_dau que la rétention R3e

const AUTEUR = 'systeme';

/** Une demande EN ATTENTE (brouillon/prête, canal formulaire) et ses num_dau normalisés (≥ 10). */
export interface CandidatDepot { demandeId: number; numeros: string[] }
/** L'accusé, réduit à ce qui décide (aucune I/O). */
export interface MessageAccuse { objet: string | null; corpsTexte: string | null; corpsHtml: string | null }
export interface DecisionAutoConfirmation {
  demandeId: number | null; // null = on ne fait RIEN (0 ou ≥ 2 candidates)
  reference: string | null;  // null = on bascule sans référence (0 ou ≥ 2 références)
  nbCandidats: number;
  nbReferences: number;
  raison: string;
}

/**
 * DÉCISION PURE (aucune base) — applique les conditions 3/4/5 à un accusé contre les candidates. Le num_dau est cherché
 * LITTÉRALEMENT (via normaliserNumeroDossier) dans objet + corps texte + corps HTML. Testable sans I/O.
 */
export function deciderAutoConfirmation(candidats: CandidatDepot[], message: MessageAccuse): DecisionAutoConfirmation {
  const foin = normaliserNumeroDossier(`${message.objet ?? ''}\n${message.corpsTexte ?? ''}\n${message.corpsHtml ?? ''}`);
  const cites = candidats.filter((c) => c.numeros.some((n) => n.length >= 10 && foin.includes(n)));
  if (cites.length === 0) return { demandeId: null, reference: null, nbCandidats: 0, nbReferences: 0, raison: 'aucune demande en attente ne cite ce message' };
  if (cites.length >= 2) return { demandeId: null, reference: null, nbCandidats: cites.length, nbReferences: 0, raison: `ambigu : ${cites.length} demandes en attente citées — proposition manuelle conservée` };
  const { count, reference } = compterReferencesMairie(message.objet, message.corpsTexte); // références : objet d'abord (bruit num_dau du corps écarté)
  return {
    demandeId: cites[0].demandeId,
    reference: count === 1 ? reference : null,
    nbCandidats: 1, nbReferences: count,
    raison: count === 1 ? `confirmé (référence « ${reference} » unique)` : `confirmé sans référence (${count} référence(s) extraite(s))`,
  };
}

/** Résultat par accusé examiné (pour le journal du script / de la relève). */
export interface ResultatAccuse extends DecisionAutoConfirmation { reponseId: number; applique: boolean }
export interface RapportAutoConfirmation { mode: 'simulation' | 'applique'; accusesExamines: number; confirmees: number; resultats: ResultatAccuse[] }

/** Candidates = demandes EN ATTENTE (brouillon/prête) de canal FORMULAIRE, avec leurs num_dau ACTIFS normalisés. LECTURE SEULE. */
async function lireCandidats(): Promise<CandidatDepot[]> {
  const { rows } = await query<{ demande_id: number; num_daus: string[] }>(
    `SELECT d.id::int AS demande_id,
            coalesce(array_agg(s.num_dau) FILTER (WHERE s.num_dau IS NOT NULL), '{}') AS num_daus
       FROM demande d
       JOIN demande_dossier dd ON dd.demande_id = d.id AND dd.actif
       JOIN sitadel_dossier s ON s.id = dd.dossier_id
      WHERE d.statut IN ('brouillon', 'prete') AND d.dest_canal = 'formulaire'
      GROUP BY d.id`);
  return rows.map((r) => ({ demandeId: r.demande_id, numeros: (r.num_daus ?? []).map(normaliserNumeroDossier).filter((n) => n.length >= 10) }));
}

/**
 * ORCHESTRE l'auto-confirmation sur tous les accusés NON rattachés et NON traités (condition 1 : nature='accuse'). Recharge les
 * candidates PAR accusé (une confirmation précédente sort sa cible de l'ensemble → jamais deux fois). `appliquer=false` = simulation
 * (aucune écriture) : c'est le mode du dry-run du script de rattrapage. Renvoie un rapport chiffré + le détail par accusé.
 */
export async function autoConfirmerAccusesTeleservice(appliquer: boolean): Promise<RapportAutoConfirmation> {
  const { rows: accuses } = await query<{ id: number; objet: string | null; corps_texte: string | null; corps_html: string | null; recu_le: Date }>(
    `SELECT id::int AS id, objet, corps_texte, corps_html, recu_le
       FROM demande_reponse
      WHERE demande_id IS NULL AND nature = 'accuse' AND traite_le IS NULL
      ORDER BY recu_le, id`);
  const resultats: ResultatAccuse[] = [];
  for (const acc of accuses) {
    const candidats = await lireCandidats();
    const d = deciderAutoConfirmation(candidats, { objet: acc.objet, corpsTexte: acc.corps_texte, corpsHtml: acc.corps_html });
    const applique = d.demandeId !== null && appliquer;
    if (applique) await appliquerConfirmation(acc.id, acc.recu_le, d);
    resultats.push({ ...d, reponseId: acc.id, applique });
  }
  return { mode: appliquer ? 'applique' : 'simulation', accusesExamines: accuses.length, confirmees: resultats.filter((r) => r.applique).length, resultats };
}

/**
 * APPLIQUE une confirmation décidée. ORDRE choisi pour l'IDEMPOTENCE : (1) référence, (2) bascule, (3) rattachement + trace.
 * Chaque étape avale son cas « déjà fait » (23505 sur la référence, DepotInterdit sur une demande déjà envoyée, `demande_id IS NULL`
 * sur le rattachement) → rejouable sans dégât ; un re-run complet ne trouve de toute façon plus la demande (statut ≠ brouillon/prête)
 * ni le message (`demande_id` posé). Réutilise `marquerDeposee` (envoye_le) et `ajouterReferenceExterne` (référence) TELS QUELS.
 */
async function appliquerConfirmation(reponseId: number, recuLe: Date, d: DecisionAutoConfirmation): Promise<void> {
  const demandeId = d.demandeId as number;
  const recuIso = new Date(recuLe).toISOString();
  // (1) Référence D'ABORD (source 'accuse_reception') : le TRIGGER 163 résout la présomption de dépôt (verrou de commune levé).
  if (d.reference !== null) {
    try { await ajouterReferenceExterne(demandeId, d.reference, { source: 'accuse_reception', recuLe: recuIso }); }
    catch (e) { if (!(e instanceof ReferenceDejaEnregistreeError)) throw e; } // déjà enregistrée → idempotent
  }
  // (2) BASCULE en envoyée, envoye_le = recu_le de l'accusé (chemin EXISTANT ; référence NON re-passée ici — écrite en (1)).
  try { await marquerDeposee(demandeId, AUTEUR, null, recuIso); }
  catch (e) { if (!(e instanceof DepotInterditError)) throw e; } // déjà envoyée → idempotent
  // (3) RATTACHEMENT (par num_dau) + re-plafond envoye_le au 1er accusé (idempotent) + TRACE 'systeme', en UNE transaction.
  await withTransaction(async (q) => {
    await q(
      `UPDATE demande_reponse
          SET demande_id = $2, rattachement_methode = 'numero_dossier', rattache_le = now(), maj_le = now(),
              note = btrim(coalesce(note || chr(10), '') || $3)
        WHERE id = $1 AND demande_id IS NULL`,
      [reponseId, demandeId, `rattaché automatiquement (accusé téléservice, n° de permis) par ${AUTEUR}`]);
    await reclamperEnvoyeLe(q, demandeId, AUTEUR); // no-op ici (envoye_le = recu_le du 1er accusé) ; défensif + monotone
    const motif = d.reference !== null
      ? `dépôt téléservice confirmé automatiquement d'après l'accusé (message ${reponseId}) : référence mairie « ${d.reference} » enregistrée (source accuse_reception) ; envoye_le retenu = ${recuIso}`
      : `dépôt téléservice confirmé automatiquement d'après l'accusé (message ${reponseId}) : ${d.nbReferences} référence(s) extraite(s) — AUCUNE enregistrée (à saisir à la main) ; envoye_le retenu = ${recuIso}`;
    await q(`INSERT INTO demande_journal (demande_id, statut_avant, statut_apres, motif, auteur) VALUES ($1, NULL, NULL, $2, $3)`, [demandeId, motif, AUTEUR]);
  });
}
