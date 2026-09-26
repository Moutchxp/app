/**
 * MODULE « GESTION » — LOT COPIE-SURV : CONSIGNER UN ÉCHEC DE COPIE. IMPUR (SQL).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * 🔴 UN MOTIF D'ÉCHEC EST UNE PIÈCE DE PREUVE, ET IL N'A RIEN À FAIRE DANS UN FICHIER QU'UNE REDIRECTION PEUT VIDER.
 * Le 26/09/2026, les onze motifs qui expliquaient l'arrêt de la passe n° 4 ont disparu avec le journal texte, écrasé
 * par la relance du soir (`>` au lieu de `>>`). Le diagnostic a dû se reconstituer par déduction.
 *
 * 🔴 CONSIGNER NE DOIT JAMAIS FAIRE ÉCHOUER LA COPIE. `noterEchec` attrape tout et ne rend rien : une passe de nuit
 * ne s'arrête pas parce que son carnet de bord a bronché. C'est la règle du module depuis `journalEnvoi`.
 *
 * ⚠️ LA SONDE EST CONSULTÉE À CHAQUE APPEL, et elle ne mémorise que le « oui » : la migration 259 peut être appliquée
 * PENDANT qu'une passe tourne, et la passe doit s'en apercevoir au message suivant.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */
import { query } from '../db/client';
import { copieEchecsDisponibles } from './schema';

/** Où la copie a cassé. Les six valeurs que la base accepte — écrites ici une fois, jamais devinées ailleurs. */
export type EtapeEchec = 'jeton' | 'dossier' | 'stockage' | 'envoi' | 'verification' | 'corbeille';

export interface EchecACOnsigner {
  passeId: number;
  /** `null` quand l'échec ne porte sur aucune pièce précise (jeton, dossier d'arrivée). */
  pieceId: number | null;
  etape: EtapeEchec;
  /** Le statut HTTP quand Google a répondu. Capté à la source, jamais relu dans le motif. */
  codeHttp?: number | null;
  motif: string;
  /** Le garde-fou a refusé : une anomalie, pas une panne passagère. */
  refuse?: boolean;
  /** Rang dans la série d'échecs CONSÉCUTIFS. À dix, la passe s'arrête. */
  rang: number;
}

/** Le motif, borné : il va dans une colonne et dans un bandeau, pas dans un fichier de trace. PUR. */
export function motifBorne(brut: string): string {
  const propre = (brut ?? '').replace(/\s+/g, ' ').trim();
  if (propre === '') return 'motif non précisé';
  return propre.length > 500 ? `${propre.slice(0, 499)}…` : propre;
}

/**
 * CONSIGNE UN ÉCHEC. Ne jette JAMAIS, ne rend rien.
 *
 * ⚠️ SANS LA MIGRATION 259, ELLE NE FAIT RIEN — et ce n'est pas une erreur : les motifs continuent d'aller au
 * terminal, exactement comme avant ce lot. Une passe déjà lancée avec l'ancien code n'est donc gênée d'aucune façon.
 */
export async function noterEchec(e: EchecACOnsigner): Promise<void> {
  try {
    if (!(await copieEchecsDisponibles())) return;
    await query(
      `INSERT INTO gestion_drive_copie_echec (passe_id, piece_id, etape, code_http, motif, refuse, rang)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [e.passeId, e.pieceId, e.etape, e.codeHttp ?? null, motifBorne(e.motif), e.refuse === true, e.rang]);
  } catch {
    // 🔴 SILENCE VOLONTAIRE. Le carnet de bord ne commande pas le navire : la copie continue.
  }
}
