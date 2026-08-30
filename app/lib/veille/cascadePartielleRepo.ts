/**
 * CASC-3 — accès données de la cascade partielle (IMPUR : base + SMTP par injection). Deux rôles :
 *  - LECTURE `chargerCascadePartielle(demandeId)` : marqueur actif (CASC-1) + relances/annonce déjà envoyées (journal) + pièces ENCORE
 *    manquantes (diagnostic À JOUR, jamais la liste d'origine) + butoir CASC-2 → étape due (moteur pur) + brouillon pré-rempli.
 *  - PRÉPARATION `executerRelancePartielle` (pur par injection) : ENVOI MANUEL verbatim dans le fil + journal. AUCUN envoi automatique,
 *    aucun branchement ordonnanceur. Appelé UNIQUEMENT par la route admin (clic d'Arno), comme PART-3c.
 *
 * RÉSILIENCE : migration 179/177 absente ou marqueur levé → `chargerCascadePartielle` renvoie null (comportement actuel, page rend).
 * ARRÊT (CASC-5) : plus aucune pièce manquante → cascade arrêtée (aucun brouillon), même si le marqueur n'a pas encore été levé.
 */
import { query } from '../db/client';
import { chargerConfigVeille } from '../sitadel/veilleConfig';
import { etapeCascadePartielle, texteRelancePartielle, texteAnnonceCada, type EtapePartielle, type TexteRelance } from './cascadePartielle';
import { lireEtatPartiel } from '../permis/dossierPartielRepo';
import { dateButoirPartiel, type EtatPartiel } from '../permis/dossierPartiel';
import type { FamillePlan } from '../permis/planMasse';
import type { CibleComplement } from '../permis/demanderPiecesRepo';

/** Préfixes de journal DISTINCTS (comptage des étapes franchies + affichage). Jamais confondus avec le complément (PART-3a) ni la déclaration. */
export const MOTIF_RELANCE_PARTIELLE_PREFIXE = 'relance partielle envoyée';
export const MOTIF_ANNONCE_CADA_PREFIXE = 'annonce CADA envoyée';

export interface EtatCascadePartielle {
  etape: EtapePartielle;
  rang: number | null;
  dateDue: string | null;          // ISO date de l'étape due
  prochaineDate: string | null;    // ISO date de la prochaine échéance (si rien n'est dû)
  famillesManquantes: FamillePlan[];
  brouillon: TexteRelance | null;  // pré-rempli quand une étape 'relance'/'annonce' est due (à relire/modifier avant envoi)
}

/** Pièces ENCORE manquantes d'une demande = union des familles absentes de CHAQUE dossier actif (diagnostic mémorisé, jamais les PDF).
 *  EXPORTÉ : réutilisé par la boucle PART-E (relance sur réponse partielle) — un seul calcul du « manquant restant », jamais deux. */
export async function famillesManquantesDemande(demandeId: number): Promise<{ manquantes: FamillePlan[]; diagnostiquees: number }> {
  const { rows } = await query<{ dossier_id: number }>(`SELECT dossier_id FROM demande_dossier WHERE demande_id = $1 AND actif`, [demandeId]);
  const { lireCompletude } = await import('../permis/completudeRepo');
  const set = new Set<FamillePlan>();
  let diagnostiquees = 0;
  for (const d of rows) {
    const c = await lireCompletude(d.dossier_id);
    if (c === null) continue; // dossier jamais analysé → on ne présume rien
    diagnostiquees += 1;
    for (const l of c.diagnostic.lignes) if (!l.presente) set.add(l.famille as FamillePlan);
  }
  return { manquantes: [...set], diagnostiquees };
}

/** Combien de relances partielles / annonces ont DÉJÀ été envoyées (comptées au journal, source unique de la progression). */
async function compterEtapesEnvoyees(demandeId: number): Promise<{ relances: number; annonce: boolean }> {
  const { rows } = await query<{ n_relances: number; n_annonce: number }>(
    `SELECT count(*) FILTER (WHERE motif LIKE $2 || '%')::int AS n_relances,
            count(*) FILTER (WHERE motif LIKE $3 || '%')::int AS n_annonce
       FROM demande_journal WHERE demande_id = $1`,
    [demandeId, MOTIF_RELANCE_PARTIELLE_PREFIXE, MOTIF_ANNONCE_CADA_PREFIXE]);
  return { relances: rows[0]?.n_relances ?? 0, annonce: (rows[0]?.n_annonce ?? 0) > 0 };
}

export async function chargerCascadePartielle(demandeId: number): Promise<EtatCascadePartielle | null> {
  const etat: EtatPartiel | null = await lireEtatPartiel(demandeId); // marqueur ACTIF (CASC-1) ; null = non partiel / 177 absente
  if (etat === null) return null;
  // CASC-5 — ARRÊT : plus aucune pièce manquante → la cascade s'arrête (jamais de relance « à vide »), même avant la levée du marqueur.
  const { manquantes } = await famillesManquantesDemande(demandeId);
  if (manquantes.length === 0) return null;

  const cfg = await chargerConfigVeille();
  const premiereReclamation = new Date(etat.le);
  const butoirCasc2 = dateButoirPartiel(premiereReclamation, cfg.cadaPartielDelaiMois, cfg.cadaPartielDelaiJours);
  const { relances, annonce } = await compterEtapesEnvoyees(demandeId);

  const r = etapeCascadePartielle({
    premiereReclamation, relancesEnvoyees: relances, annonceEnvoyee: annonce, aujourdhui: new Date(), butoirCasc2,
    reglages: { relanceJours: cfg.cascadePartielRelanceJours, nbRelancesAvantAnnonce: cfg.cascadePartielNbRelances, annonceJours: cfg.cascadePartielAnnonceJours, saisineJours: cfg.cascadePartielSaisineJours },
  });

  const brouillon: TexteRelance | null =
    r.etape === 'relance' && r.rang !== null ? texteRelancePartielle(r.rang, manquantes)
    : r.etape === 'annonce' && r.dateDue !== null ? texteAnnonceCada(manquantes, new Date(dateSaisineProposable(premiereReclamation, cfg, butoirCasc2)))
    : null;

  return {
    etape: r.etape, rang: r.rang,
    dateDue: r.dateDue ? r.dateDue.toISOString() : null,
    prochaineDate: r.prochaineDate ? r.prochaineDate.toISOString() : null,
    famillesManquantes: manquantes, brouillon,
  };
}

/** Date effective où la saisine devient proposable (annonce + saisineJours, jamais avant le butoir CASC-2) — pour le texte d'annonce. */
function dateSaisineProposable(premiereReclamation: Date, cfg: { cascadePartielRelanceJours: number; cascadePartielNbRelances: number; cascadePartielAnnonceJours: number; cascadePartielSaisineJours: number }, butoirCasc2: Date): number {
  const annonce = premiereReclamation.getTime() + (cfg.cascadePartielNbRelances * cfg.cascadePartielRelanceJours + cfg.cascadePartielAnnonceJours) * 86_400_000;
  const cascade = annonce + cfg.cascadePartielSaisineJours * 86_400_000;
  return Math.max(cascade, butoirCasc2.getTime());
}

// ── PRÉPARATION (envoi MANUEL verbatim, comme PART-3c) — pur par injection ────────────────────────────────────────────────────────
export interface DepsRelancePartielle {
  regimePartiel(demandeId: number): Promise<boolean>; // CASC-4 : la demande est-elle en régime PARTIEL (marqueur CASC-1 actif) ?
  lireCible(demandeId: number): Promise<CibleComplement | null>;
  envoyer(cible: CibleComplement, objet: string, corps: string): Promise<{ messageId: string }>;
  journaliser(demandeId: number, etape: 'relance' | 'annonce', rang: number | null, trace: { objet: string; corps: string; destinataire: string; messageId: string }, auteur: string): Promise<void>;
}
export interface ResultatRelancePartielle { ok: boolean; motif?: string; destinataire?: string; messageId?: string }

/**
 * Envoie une relance/annonce partielle VERBATIM (objet + corps fournis, éventuellement modifiés à la main) dans le fil du dernier
 * message de la mairie. Refuse sans envoyer si objet/corps vide ou aucun message mairie. L'ENVOI précède le JOURNAL. PUR par injection.
 */
export async function executerRelancePartielle(deps: DepsRelancePartielle, arg: { demandeId: number; etape: 'relance' | 'annonce'; rang: number | null; objet: string; corps: string; auteur: string }): Promise<ResultatRelancePartielle> {
  if (arg.objet.trim() === '' || arg.corps.trim() === '') return { ok: false, motif: 'objet et corps requis' };
  // CASC-4 — RÉGIME UNIQUE : la cascade PARTIELLE n'agit QUE sur une demande marquée « dossier partiel » (CASC-1). Garde côté serveur
  //   (pas seulement l'UI) : sur une demande en régime ORDINAIRE, refus explicite motivé — jamais d'envoi partiel hors régime.
  if (!(await deps.regimePartiel(arg.demandeId))) return { ok: false, motif: 'demande non marquée « dossier partiel » : elle relève du régime de relance ordinaire' };
  const cible = await deps.lireCible(arg.demandeId);
  if (cible === null) return { ok: false, motif: 'aucun message de mairie auquel répondre pour cette demande' };
  if (cible.motifIndisponible !== null) return { ok: false, motif: cible.motifIndisponible };
  const { messageId } = await deps.envoyer(cible, arg.objet, arg.corps);
  await deps.journaliser(arg.demandeId, arg.etape, arg.rang, { objet: arg.objet, corps: arg.corps, destinataire: cible.destinataire, messageId }, arg.auteur);
  return { ok: true, destinataire: cible.destinataire, messageId };
}

// ── Implémentation RÉELLE ─────────────────────────────────────────────────────
export function depsReellesRelancePartielle(): DepsRelancePartielle {
  return {
    regimePartiel: async (demandeId) => (await lireEtatPartiel(demandeId)) !== null, // CASC-4 : marqueur CASC-1 actif ? (false si 177 absente)
    lireCible: async (demandeId) => {
      // Cible = fil du dernier message mairie de la demande. On réutilise lireCibleComplementReel via un dossier ACTIF de la demande
      //   (il résout dossier→demande→dernier message répondable) — aucune 2e implémentation d'envoi.
      const { rows } = await query<{ dossier_id: number }>(`SELECT dossier_id FROM demande_dossier WHERE demande_id = $1 AND actif ORDER BY dossier_id LIMIT 1`, [demandeId]);
      const dossierId = rows[0]?.dossier_id;
      if (dossierId === undefined) return null;
      const { lireCibleComplementReel } = await import('../permis/demanderPiecesRepo');
      return lireCibleComplementReel(dossierId);
    },
    envoyer: async (cible, objet, corps) => {
      const { obtenirTransporteur, lireCompteSmtp, envoyerComplementPieces } = await import('../email');
      const { INFIXE_SMTP } = await import('../sitadel/envoiDemande');
      const { entetesFil } = await import('../permis/complementPieces');
      const compte = lireCompteSmtp(INFIXE_SMTP[cible.profil as 'entreprise' | 'personne'] ?? '');
      if (compte === null) throw new Error('compte SMTP non configuré');
      const { inReplyTo, references } = entetesFil(cible.messageId, cible.referencesBrut);
      const emission = await envoyerComplementPieces(obtenirTransporteur(compte), cible.from, { to: cible.destinataire, replyTo: cible.from, objet, corps, inReplyTo, references });
      return { messageId: emission.messageId };
    },
    journaliser: async (demandeId, etape, rang, trace, auteur) => {
      const prefixe = etape === 'annonce' ? MOTIF_ANNONCE_CADA_PREFIXE : MOTIF_RELANCE_PARTIELLE_PREFIXE;
      const motif = etape === 'annonce'
        ? `${MOTIF_ANNONCE_CADA_PREFIXE} à ${trace.destinataire} (messageId ${trace.messageId})`
        : `${MOTIF_RELANCE_PARTIELLE_PREFIXE} #${rang ?? '?'} à ${trace.destinataire} (messageId ${trace.messageId})`;
      const details = JSON.stringify({ type: etape === 'annonce' ? 'annonce_cada' : 'relance_partielle', rang, objet: trace.objet, corps: trace.corps, destinataire: trace.destinataire, messageId: trace.messageId });
      try {
        await query(`INSERT INTO demande_journal (demande_id, statut_avant, statut_apres, motif, auteur, details) VALUES ($1, NULL, NULL, $2, $3, $4::jsonb)`, [demandeId, motif, auteur, details]);
      } catch (e) {
        if (typeof e === 'object' && e !== null && (e as { code?: string }).code === '42703') {
          await query(`INSERT INTO demande_journal (demande_id, statut_avant, statut_apres, motif, auteur) VALUES ($1, NULL, NULL, $2, $3)`, [demandeId, `${motif}\n--- objet ---\n${trace.objet}\n--- corps ---\n${trace.corps}`, auteur]); // 175 absente → trace dans motif
        } else throw e;
      }
      void prefixe;
    },
  };
}
