/**
 * RATT-AUTO — brique de veille « REJEU AUTOMATIQUE du suivi de rattachement », SCOPÉE aux permis « en attente de bâti ».
 *
 * POURQUOI : un permis dont la projection est validée passe en `en_attente_bati` et rien ne l'en sort — le rejeu du suivi
 * (`permis:rattachement-suivre`) est un script MANUEL jamais planifié. Cette brique rejoue `suivreRattachement` sur ces seuls
 * dossiers à chaque tick (idéalement juste après l'ingestion auto) : le jour où une édition BD TOPO plus récente que le snapshot
 * livre le bâti attendu, le dossier bascule seul en `arbitrage_demande` (décision humaine), sans intervention.
 *
 * 🔴 GARDES :
 *  · On APPELLE `suivreRattachement`, on ne réécrit NI sa logique NI sa mécanique de détection. La détection s'appuie sur le bâti
 *    BD TOPO RÉEL vs le snapshot figé — JAMAIS sur l'emprise reconstituée (qui n'alimente ni moteur, ni verdict, ni altitude).
 *  · AUCUNE injection d'altitude : la bascule attend une décision humaine (chemin RATTACHEMENT_AUTOMATIQUE existant NON élargi ici).
 *  · Un passage qui trouve 0 (aucun dossier, ou aucune bascule) est un résultat NORMAL — jamais un échec.
 *  · Cœur PUR + I/O injectées (`DepsSuiviRattachementAuto`) → les tests ne touchent NI la base NI `suivreRattachement`. Ne DOIT PAS
 *    importer `server-only` (atteint par le CLI `veille:run`).
 */
import { query } from '../db/client';
import { suivreRattachement } from '../permis/rattachementSuiviRepo';

/** Interrupteur de la brique (config_veille.rattachement_suivi_auto_active). */
export interface ConfigSuiviAuto { actif: boolean }

/** Bilan d'UN passage, journalisé. `resultat` n'est 'echec' QUE sur exception — jamais parce que 0 dossier/0 bascule. */
export interface BilanSuiviAuto { examines: number; bascules: number; resultat: 'succes' | 'echec'; erreur: string | null }

export interface DepsSuiviRattachementAuto {
  /** Interrupteur. Migration absente → { actif: false } (repli sûr : rien ne se déclenche). */
  config(): Promise<ConfigSuiviAuto>;
  /** Les dossiers actuellement `en_attente_bati` — le SEUL périmètre (jamais tout l'univers suivi). */
  listerEnAttenteBati(): Promise<number[]>;
  /** Rejoue le suivi d'UN dossier ; renvoie son état résultant (null = aucun changement persisté). N'injecte jamais d'altitude. */
  rejouer(dossierId: number): Promise<{ etat: string | null }>;
  /** Journalise le bilan du passage (exploitable ; un 0/0 reste 'succes'). */
  journaliser(bilan: BilanSuiviAuto): Promise<void>;
}

export interface ResultatSuiviAuto { agi: 'inactif' | 'execute'; examines: number; bascules: number }

/**
 * Une passe de rejeu (appelée à chaque tick sous le verrou consultatif global → jamais concurrente). Interrupteur OFF → rien
 * (aucun listing, aucun rejeu, aucun journal). Sinon : rejoue chaque `en_attente_bati` et compte les BASCULES (dossiers ayant
 * quitté `en_attente_bati`). Un rejeu qui lève → passage journalisé en 'echec' PUIS relancé (la veille l'ISOLE en amont).
 */
export async function executerSuiviRattachementAuto(deps: DepsSuiviRattachementAuto): Promise<ResultatSuiviAuto> {
  const cfg = await deps.config();
  if (!cfg.actif) return { agi: 'inactif', examines: 0, bascules: 0 };

  const dossiers = await deps.listerEnAttenteBati();
  let examines = 0, bascules = 0;
  try {
    for (const dossierId of dossiers) {
      const r = await deps.rejouer(dossierId);
      examines++;
      // BASCULE = le dossier a QUITTÉ « en_attente_bati » (vers arbitrage_demande / valide auto). null = aucun changement persisté.
      if (r.etat !== null && r.etat !== 'en_attente_bati') bascules++;
    }
  } catch (e) {
    await deps.journaliser({ examines, bascules, resultat: 'echec', erreur: e instanceof Error ? e.message : String(e) });
    throw e; // relaie : la veille l'isole (un échec de brique ne fait jamais tomber la veille)
  }

  await deps.journaliser({ examines, bascules, resultat: 'succes', erreur: null });
  return { agi: 'execute', examines, bascules };
}

/** Dépendances RÉELLES (production). Toutes résilientes à l'ordre d'application de la migration 154 (repli sûr : rien ne se passe). */
export function depsReellesSuiviRattachementAuto(): DepsSuiviRattachementAuto {
  return {
    config: async () => {
      try {
        const { rows } = await query<{ a: boolean }>(`SELECT rattachement_suivi_auto_active AS a FROM config_veille WHERE id = 1`);
        return { actif: rows[0]?.a === true };
      } catch { return { actif: false }; } // 154 pas encore appliquée → OFF (sûr)
    },
    listerEnAttenteBati: async () => {
      const { rows } = await query<{ dossier_id: number | string }>(
        `SELECT dossier_id FROM permis_rattachement WHERE etat = 'en_attente_bati'`);
      return rows.map((r) => Number(r.dossier_id)); // bigint → chaîne côté pilote pg
    },
    rejouer: async (dossierId) => {
      const r = await suivreRattachement(dossierId, 'veille:suivi-auto');
      return { etat: r.etat };
    },
    journaliser: async (b) => {
      try {
        await query(
          `INSERT INTO rattachement_suivi_auto_journal (passe_le, nb_examines, nb_bascules, resultat, erreur)
             VALUES (now(), $1, $2, $3, $4)`,
          [b.examines, b.bascules, b.resultat, b.erreur]);
      } catch { /* table absente (154 non appliquée) → pas de trace, jamais une panne */ }
    },
  };
}
