/**
 * ══ 🔴🔴 LOT FRISE-CORRECTION-MANUELLE (26/10/2026) — LE DÉPÔT DES CORRECTIONS D'UNE ÉTAPE DE LA FRISE ═════════════════════
 *
 * 🔴 CE FICHIER TOUCHE `pg` : jamais importé depuis un composant `'use client'` (garde `clientBoundary.guard.test.ts`).
 *
 * Quatre gestes, pour TOUTE étape de la frise — venue de Monga, posée à la main, ouverture de repli :
 *   · `corrigerEtape`              — nature (dont point ↔ carte), titre, date ;
 *   · `changerPresenceEtape`       — « Retirer de la frise » (statut `retire`) / « Remettre dans la frise » ;
 *   · `revenirAuClassementAutomatique` — rend à une étape Monga ce que l'automatisation avait décidé ;
 *   · (la lecture des éléments retirés est `friseDeLEvenement(id, 'retire')`).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * 🔴 « LA CORRECTION HUMAINE FAIT FOI » (Arno). Au PREMIER geste sur une étape venue de Monga, sa valeur d'origine est copiée
 * dans `auto_*` (migration 429) : c'est ce que « Revenir au classement automatique » remet, ce que l'écran affiche (« classé
 * automatiquement en point, corrigé en carte par … »), et ce que la relève lit pour ne jamais recréer l'étape transformée
 * (`enregistrerEtapesDuMail`). Aucune passe automatique n'écrit le type, le titre ou le statut d'une étape existante ; les deux
 * reprises de dates (ouvertures, clôtures) ne touchent qu'aux bornes vives, dont la date ne se corrige pas ici.
 *
 * 🔴 LIRE (verrouillé) → REFUSER → ÉCRIRE, dans chaque transaction : `withTransaction` commite au retour normal, un refus rendu
 * après une écriture aurait écrit quand même (piège consigné dans `gestes.ts`).
 *
 * 🔴 RIEN N'EST SUPPRIMÉ : retirer = `statut = 'retire'`, et chaque geste écrit au journal append-only (`gestion_journal`,
 * entité « evenement », une ligne par événement dont la frise porte la carte), l'avant et l'après, l'auteur en texte.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */
import { withTransaction, type RequeteTx } from '../db/client';
import { estBorne, validerCorrection, type CorrectionVoulue } from './correctionEtape';
import { sqlJamaisDansLeFutur } from './ouvertureEvenement';
import { evenementsDeLaCarte, ouvertDansLaTransaction, verrouillerEvenements } from './mongaEtapeRepo';
import { correctionEtapeDisponible } from './schema';
import type { TypeEtape } from './mongaEtape';

export interface AuteurCorrection { id: number | null; libelle: string }

export type IssueCorrection =
  | { ok: true; ouvertAvant: boolean | null; ouvertApres: boolean | null }
  | { ok: false; motif: string; code: 'sans_schema' | 'inconnue' | 'refus' };

export const MOT_SANS_429 = 'La correction de la frise sera disponible après la mise à jour de la base (migration 429).';
export const ACTION_CORRECTION = 'correction_etape';

/** La ligne telle qu'on la lit, verrouillée, avant d'y toucher. */
interface LigneEtape {
  id: number; type: TypeEtape; titre: string | null; jour: string | null; survenu_le: string;
  heure_connue: boolean; jour_connu: boolean; statut: 'vif' | 'retire'; source: 'monga' | 'manuelle';
  certitude: string; message_id: number | null; auto_type: TypeEtape | null;
}

async function lireVerrouillee(q: RequeteTx, id: number): Promise<LigneEtape | null> {
  const { rows } = await q<LigneEtape>(
    `SELECT id::int AS id, type, titre, survenu_le::text AS survenu_le, heure_connue, jour_connu, statut, source, certitude,
            message_id::int AS message_id, auto_type,
            CASE WHEN jour_connu THEN to_char(survenu_le AT TIME ZONE 'Europe/Paris', 'YYYY-MM-DD') END AS jour
       FROM gestion_monga_etape WHERE id = $1 FOR UPDATE`, [id]);
  return rows[0] ?? null;
}

/**
 * GARDER L'ORIGINE, une seule fois : au premier geste sur une étape venue de Monga. `coalesce` sur chaque colonne : une
 * deuxième correction ne réécrit jamais ce que l'automatisation avait décidé.
 */
const SQL_GARDER_ORIGINE = `
  auto_type         = CASE WHEN source = 'monga' AND auto_type IS NULL THEN type         ELSE auto_type END,
  auto_titre        = CASE WHEN source = 'monga' AND auto_type IS NULL THEN titre        ELSE auto_titre END,
  auto_survenu_le   = CASE WHEN source = 'monga' AND auto_type IS NULL THEN survenu_le   ELSE auto_survenu_le END,
  auto_heure_connue = CASE WHEN source = 'monga' AND auto_type IS NULL THEN heure_connue ELSE auto_heure_connue END,
  auto_jour_connu   = CASE WHEN source = 'monga' AND auto_type IS NULL THEN jour_connu   ELSE auto_jour_connu END,
  auto_statut       = CASE WHEN source = 'monga' AND auto_type IS NULL THEN statut       ELSE auto_statut END`;

/** Le journal : une ligne par événement dont la frise porte la carte. */
async function journaliser(
  q: RequeteTx, evenements: readonly number[], auteur: AuteurCorrection, avant: unknown, apres: unknown, commentaire: string,
): Promise<void> {
  for (const e of evenements) {
    await q(
      `INSERT INTO gestion_journal (entite, entite_id, action, valeur_avant, valeur_apres, commentaire, auteur_id, auteur_libelle)
       VALUES ('evenement', $1, $2, $3, $4, $5, $6, $7)`,
      [e, ACTION_CORRECTION, JSON.stringify(avant), JSON.stringify(apres), commentaire, auteur.id, auteur.libelle]);
  }
}

/** L'état ouvert/clos avant un geste qui touche une borne (sinon `null` : rien ne peut changer). */
async function etatAvant(q: RequeteTx, id: number, borne: boolean): Promise<{ evts: number[]; avant: boolean | null }> {
  const evts = await evenementsDeLaCarte(q, id);
  await verrouillerEvenements(q, evts);
  return { evts, avant: borne && evts.length > 0 ? await ouvertDansLaTransaction(q, evts[0]) : null };
}

/**
 * ══ CORRIGER : nature (point ↔ carte compris), titre, date ════════════════════════════════════════════════════════════════
 *
 * ⚠️ UN MAIL PORTE AU PLUS UNE ÉTAPE MONGA DE CHAQUE NATURE (index unique `(message_id, type)`, migration 313) : transformer le
 * commentaire d'un mail en « Rappel de devis » alors que ce mail porte déjà ce rappel est REFUSÉ avec son motif, avant toute
 * écriture — une violation d'index dans la transaction ne dirait rien d'utile à Arno.
 */
export async function corrigerEtape(a: { id: number; voulu: CorrectionVoulue; auteur: AuteurCorrection }): Promise<IssueCorrection> {
  if (!await correctionEtapeDisponible()) return { ok: false, motif: MOT_SANS_429, code: 'sans_schema' };
  return withTransaction(async (q) => {
    const l = await lireVerrouillee(q, a.id);
    if (l === null) return { ok: false, motif: 'Étape inconnue.', code: 'inconnue' };
    if (l.statut !== 'vif') return { ok: false, motif: 'Cette étape est retirée de la frise : remettez-la d’abord.', code: 'refus' };
    const v = validerCorrection({ type: l.type, jour: l.jour }, a.voulu);
    if (v.refus !== null) return { ok: false, motif: v.refus, code: 'refus' };
    if (l.source === 'monga' && l.message_id !== null && v.type !== l.type) {
      const { rows } = await q(
        `SELECT 1 FROM gestion_monga_etape WHERE message_id = $1 AND type = $2 AND source = 'monga' AND id <> $3 LIMIT 1`,
        [l.message_id, v.type, l.id]);
      if (rows.length > 0) {
        return { ok: false, motif: 'Ce mail porte déjà une étape de cette nature : corrigez plutôt celle-là, ou choisissez une autre nature.', code: 'refus' };
      }
    }
    const { evts } = await etatAvant(q, l.id, false);
    /* La date : gardée À LA SECONDE si le jour n'a pas changé (une heure connue reste connue) ; sinon midi, heure de Paris —
       la convention du dépôt pour toute date déclarée sans heure. Jamais une ouverture future (sans objet ici : les bornes
       gardent leur date). */
    await q(
      `UPDATE gestion_monga_etape
          SET ${SQL_GARDER_ORIGINE},
              type = $2, titre = $3,
              survenu_le = CASE WHEN $7::boolean OR $4::text IS NULL THEN survenu_le
                                ELSE (($4::text || ' 12:00:00')::timestamp AT TIME ZONE 'Europe/Paris') END,
              heure_connue = CASE WHEN $7::boolean THEN heure_connue ELSE false END,
              jour_connu = CASE WHEN $7::boolean THEN jour_connu ELSE ($4::text IS NOT NULL) END,
              corrige_le = now(), corrige_par = $5, corrige_par_libelle = $6, maj_le = now(), maj_par_libelle = $6
        WHERE id = $1`,
      [l.id, v.type, v.titre, v.jour, a.auteur.id, a.auteur.libelle, v.dateInchangee]);
    await journaliser(q, evts, a.auteur,
      { carte: l.id, type: l.type, titre: l.titre, jour: l.jour },
      { carte: l.id, type: v.type, titre: v.titre, jour: v.jour },
      `carte n° ${l.id} corrigée à la main${l.type !== v.type ? ` (${l.type} → ${v.type})` : ''}`);
    return { ok: true, ouvertAvant: null, ouvertApres: null };
  });
}

/**
 * ══ RETIRER DE LA FRISE / REMETTRE ═════════════════════════════════════════════════════════════════════════════════════════
 *
 * Pour toute étape (Monga, manuelle, repli). Retirer une BORNE peut changer l'état de l'événement : l'état est relu avant et
 * après, et l'écran l'apprend (la confirmation est posée par l'écran, avant le geste — même règle que le retrait existant).
 *
 * ⚠️ REMETTRE UNE ÉTAPE « ÉCARTÉE » LA REND « CONFIRMÉE » : c'est un humain qui dit qu'elle était juste, et une carte vive
 * restée « écartée » ne compterait plus comme borne (`sqlBornesDeLEvenement` l'ignore).
 */
export async function changerPresenceEtape(
  id: number, presence: 'retire' | 'vif', auteur: AuteurCorrection,
): Promise<IssueCorrection> {
  if (!await correctionEtapeDisponible()) return { ok: false, motif: MOT_SANS_429, code: 'sans_schema' };
  return withTransaction(async (q) => {
    const l = await lireVerrouillee(q, id);
    if (l === null) return { ok: false, motif: 'Étape inconnue.', code: 'inconnue' };
    if (l.statut === presence) {
      return { ok: false, motif: presence === 'retire' ? 'Cette étape est déjà retirée de la frise.' : 'Cette étape est déjà sur la frise.', code: 'refus' };
    }
    const borne = estBorne(l.type);
    const { evts, avant } = await etatAvant(q, l.id, borne);
    await q(
      presence === 'retire'
        ? `UPDATE gestion_monga_etape
              SET ${SQL_GARDER_ORIGINE},
                  statut = 'retire', retire_le = now(), retire_par_libelle = $3,
                  corrige_le = now(), corrige_par = $2, corrige_par_libelle = $3, maj_le = now(), maj_par_libelle = $3
            WHERE id = $1`
        : `UPDATE gestion_monga_etape
              SET ${SQL_GARDER_ORIGINE},
                  statut = 'vif', certitude = CASE WHEN certitude = 'ecartee' THEN 'confirmee' ELSE certitude END,
                  confirme_le = CASE WHEN certitude = 'ecartee' THEN now() ELSE confirme_le END,
                  confirme_par_libelle = CASE WHEN certitude = 'ecartee' THEN $3 ELSE confirme_par_libelle END,
                  corrige_le = now(), corrige_par = $2, corrige_par_libelle = $3, maj_le = now(), maj_par_libelle = $3
            WHERE id = $1`,
      [l.id, auteur.id, auteur.libelle]);
    const apres = borne && evts.length > 0 ? await ouvertDansLaTransaction(q, evts[0]) : null;
    await journaliser(q, evts, auteur, { carte: l.id, statut: l.statut }, { carte: l.id, statut: presence },
      presence === 'retire' ? `carte n° ${l.id} retirée de la frise (réversible)` : `carte n° ${l.id} remise dans la frise`);
    return { ok: true, ouvertAvant: avant, ouvertApres: apres };
  });
}

/**
 * ══ REVENIR AU CLASSEMENT AUTOMATIQUE ══════════════════════════════════════════════════════════════════════════════════════
 *
 * Remet, sur une étape venue de Monga déjà corrigée, exactement ce que l'automatisation avait décidé (`auto_*`), et efface la
 * trace de correction de la LIGNE — le journal, lui, garde tout. Refusé si le mail porte entre-temps une autre étape de la
 * nature d'origine (la relève n'en a pas créé, mais une autre correction a pu la poser) : on le dit, on n'écrase rien.
 */
export async function revenirAuClassementAutomatique(id: number, auteur: AuteurCorrection): Promise<IssueCorrection> {
  if (!await correctionEtapeDisponible()) return { ok: false, motif: MOT_SANS_429, code: 'sans_schema' };
  return withTransaction(async (q) => {
    const l = await lireVerrouillee(q, id);
    if (l === null) return { ok: false, motif: 'Étape inconnue.', code: 'inconnue' };
    if (l.source !== 'monga' || l.auto_type === null) {
      return { ok: false, motif: 'Cette étape n’a pas de classement automatique à retrouver.', code: 'refus' };
    }
    if (l.message_id !== null && l.auto_type !== l.type) {
      const { rows } = await q(
        `SELECT 1 FROM gestion_monga_etape WHERE message_id = $1 AND type = $2 AND source = 'monga' AND id <> $3 LIMIT 1`,
        [l.message_id, l.auto_type, l.id]);
      if (rows.length > 0) return { ok: false, motif: 'Ce mail porte déjà une étape de la nature d’origine : rien n’est changé.', code: 'refus' };
    }
    const borne = estBorne(l.type);
    const { evts, avant } = await etatAvant(q, l.id, borne);
    const { rows: remis } = await q<{ type: string; statut: string }>(
      `UPDATE gestion_monga_etape
          SET type = auto_type, titre = auto_titre,
              survenu_le = CASE WHEN auto_type = 'ouverture' THEN ${sqlJamaisDansLeFutur('auto_survenu_le')} ELSE auto_survenu_le END,
              heure_connue = coalesce(auto_heure_connue, heure_connue), jour_connu = coalesce(auto_jour_connu, jour_connu),
              statut = coalesce(auto_statut, statut),
              retire_le = CASE WHEN coalesce(auto_statut, statut) = 'vif' THEN NULL ELSE retire_le END,
              auto_type = NULL, auto_titre = NULL, auto_survenu_le = NULL, auto_heure_connue = NULL, auto_jour_connu = NULL,
              auto_statut = NULL, corrige_le = NULL, corrige_par = NULL, corrige_par_libelle = NULL,
              maj_le = now(), maj_par_libelle = $2
        WHERE id = $1
        RETURNING type, statut`, [l.id, auteur.libelle]);
    const apres = borne && evts.length > 0 ? await ouvertDansLaTransaction(q, evts[0]) : null;
    await journaliser(q, evts, auteur, { carte: l.id, type: l.type, titre: l.titre, statut: l.statut },
      { carte: l.id, type: remis[0]?.type, statut: remis[0]?.statut },
      `carte n° ${l.id} rendue au classement automatique`);
    return { ok: true, ouvertAvant: avant, ouvertApres: apres };
  });
}
