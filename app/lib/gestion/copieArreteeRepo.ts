/**
 * MODULE « GESTION » — LOT COPIE-SURV : L'ÉTAT DE LA COPIE, LU EN BASE. IMPUR (SQL), STRICTEMENT EN LECTURE.
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * 🔴 CE MODULE N'ÉCRIT RIEN et ne sait pas écrire. Il ne touche NI au verrou de la copie, NI à la passe en cours :
 * il ne fait que trois SELECT. Une passe de copie tourne peut-être pendant qu'on regarde l'écran — elle ne doit pas
 * s'en apercevoir.
 *
 * 🔴 LE COMPTE DES PIÈCES RESTANTES EST MIS EN CACHE. MESURÉ le 26/09/2026 : l'anti-jointure sur les 26 814 pièces
 * coûte 17 ms, contre 0,04 ms pour lire la dernière passe. C'est peu, mais c'est payé à CHAQUE affichage de l'écran,
 * pour un chiffre qui ne bouge que d'une pièce toutes les deux secondes. Un cache de 30 secondes rend l'alerte
 * gratuite, et l'écart est sans conséquence : on n'y regarde pas une pièce près, on y regarde « reste-t-il du
 * travail ? ».
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */
import { hostname } from 'node:os';
import { query } from '../db/client';
import { copieEchecsDisponibles, copiePiecesDisponible } from './schema';
import { processusVivant, type CopieVue, type MotifEchecVue, type PasseCopieVue } from './copieArretee';

/** Combien de temps le compte des pièces restantes reste valable. Voir l'en-tête : 17 ms contre 0,04 ms. */
export const CACHE_RESTANTES_MS = 30_000;

/** Combien de motifs d'échec on rapporte. Cinq suffisent à reconnaître une cause ; trente noieraient le bandeau. */
export const MOTIFS_MAX = 5;

let cacheRestantes: { valeur: number; le: number } | null = null;

/** Pour les tests : oublie le compte mémorisé. Sans effet en production, où rien ne l'appelle. */
export function oublierCacheCopie(): void {
  cacheRestantes = null;
}

/**
 * COMBIEN DE PIÈCES RESTENT À COPIER. Mis en cache (voir l'en-tête).
 *
 * ⚠️ MÊME PRÉDICAT QUE LA COMMANDE `copie-etat` : une pièce est faite quand elle a une copie VÉRIFIÉE. Une copie
 * déposée mais non vérifiée compte comme à refaire — sans quoi l'écran annoncerait un travail fini qui ne l'est pas.
 */
export async function piecesRestantes(maintenant = Date.now()): Promise<number> {
  if (cacheRestantes !== null && maintenant - cacheRestantes.le < CACHE_RESTANTES_MS) return cacheRestantes.valeur;
  const { rows } = await query<{ n: string }>(
    `SELECT count(*)::text AS n FROM gestion_piece p
      WHERE p.cle_stockage IS NOT NULL
        AND NOT EXISTS (SELECT 1 FROM gestion_piece_drive d
                         WHERE d.piece_id = p.id AND d.verifie_le IS NOT NULL)`);
  const valeur = Number(rows[0]?.n ?? 0);
  cacheRestantes = { valeur, le: maintenant };
  return valeur;
}

/** LA DERNIÈRE PASSE DE COPIE, quelle qu'en soit l'issue. `null` = aucune n'a jamais tourné. */
export async function dernierePasseCopie(): Promise<PasseCopieVue | null> {
  const { rows } = await query<{
    id: string; resultat: string; termine: string | null; motif: string | null; echecs: number;
    copiees: number; hote: string | null; pid: number | null;
  }>(
    `SELECT id, resultat,
            to_char(termine_le AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS termine,
            motif_arret AS motif, echecs, pieces_copiees AS copiees, hote, pid
       FROM gestion_drive_copie_passe
      WHERE mode = 'applique'
      ORDER BY id DESC LIMIT 1`);
  const p = rows[0];
  if (p === undefined) return null;
  return {
    id: Number(p.id), resultat: p.resultat, termineLe: p.termine, motifArret: p.motif,
    echecs: p.echecs, piecesCopiees: p.copiees,
    // 🔴 LA MÊME FONCTION QUE `copie-etat`, et non une seconde : deux façons de dire « ce processus vit encore »
    //   finiraient par se contredire, et c'est l'écran le moins regardé qui garderait le faux.
    vivant: processusVivant(p.pid, p.hote, hostname()),
  };
}

/** LES DERNIERS MOTIFS D'ÉCHEC d'une passe. Vide sans la migration 259 — et ce n'est pas une erreur. */
export async function motifsEchec(passeId: number, combien = MOTIFS_MAX): Promise<MotifEchecVue[]> {
  if (!(await copieEchecsDisponibles())) return [];
  try {
    const { rows } = await query<{
      piece_id: string | null; etape: string; code_http: number | null; motif: string; survenu: string;
    }>(
      `SELECT piece_id, etape, code_http, motif,
              to_char(survenu_le AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS survenu
         FROM gestion_drive_copie_echec
        WHERE passe_id = $1
        ORDER BY survenu_le DESC, id DESC
        LIMIT $2`, [passeId, combien]);
    return rows.map((r) => ({
      pieceId: r.piece_id === null ? null : Number(r.piece_id),
      etape: r.etape, codeHttp: r.code_http, motif: r.motif, survenuLe: r.survenu,
    }));
  } catch {
    return []; // le bandeau se tait sur ce détail plutôt que d'empêcher l'écran de s'afficher
  }
}

/**
 * L'ÉTAT COMPLET DE LA COPIE, pour le bandeau. LECTURE SEULE.
 *
 * ⚠️ MIGRATION 255 ABSENTE ⇒ TOUT À `null` / VIDE, ce qui rend le bandeau MUET : sans elle il n'y a pas de passe de
 * copie du tout, donc rien à signaler. Nommer une table absente ferait échouer TOUT l'écran, pas seulement ce
 * bandeau (incident du 24/09/2026).
 */
export async function lireEtatCopie(): Promise<CopieVue> {
  if (!(await copiePiecesDisponible())) return { derniere: null, restantes: null, motifs: [] };
  try {
    const derniere = await dernierePasseCopie();
    if (derniere === null) return { derniere: null, restantes: null, motifs: [] };
    // ⚠️ ON NE COMPTE, ET ON NE LIT LES MOTIFS, QUE SI LA PASSE EST CLOSE : pendant qu'elle tourne le bandeau se
    //   tait de toute façon, et ces deux lectures seraient payées pour rien à chaque affichage.
    if (derniere.termineLe === null) return { derniere, restantes: null, motifs: [] };
    const [restantes, motifs] = await Promise.all([piecesRestantes(), motifsEchec(derniere.id)]);
    return { derniere, restantes, motifs };
  } catch {
    // Le bandeau se tait plutôt que d'empêcher l'écran de s'afficher. La copie, elle, n'est pas touchée.
    return { derniere: null, restantes: null, motifs: [] };
  }
}
