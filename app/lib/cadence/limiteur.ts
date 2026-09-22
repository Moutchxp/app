import { query } from '../db/client';
import { lireSeuilsCadence, type SeuilsCadence } from './config';

/**
 * LIMITEUR DE CADENCE — compteurs en base (pas de Redis : rien de plus à exploiter, et l'état survit au
 * redémarrage), FENÊTRE GLISSANTE exacte (cf. migration 227 pour la justification du modèle).
 *
 * PRINCIPE PRODUIT : un titulaire de compte a des analyses ILLIMITÉES EN TOTAL — on ne borne que le RYTHME,
 * à un niveau qu'un humain ne peut pas tenir (une analyse demande 1 à 2 minutes : photo, cadrage de l'axe,
 * saisie de l'étage). Aucune limite journalière ni totale pour un compte ; le visiteur sans compte, lui, en a une.
 *
 * NE BLOQUE JAMAIS PAR ACCIDENT : toute erreur de base laisse PASSER la requête (`autorise`). Un incident sur
 * le limiteur ne doit pas fermer le service — c'est une protection contre les robots, pas un péage.
 */

export type ActionCadence = 'analyse' | 'creation_compte';

/** Une fenêtre à respecter : `n` actions au plus sur `secondes`. */
interface Fenetre {
  secondes: number;
  maximum: number;
}

export interface VerdictCadence {
  /** false = seuil atteint → la route doit répondre 429. */
  autorise: boolean;
  /** Secondes à attendre avant que la plus ancienne action de la fenêtre atteinte en sorte. ≥ 1. */
  retryApresS: number;
  /** Code stable rendu dans le JSON, distinct du 429 générique de saturation. */
  code: 'cadence_depassee';
  /** true si le sujet est un visiteur SANS compte (le front ajoute alors l'invitation à créer un compte). */
  sansCompte: boolean;
}

/** Fenêtres applicables selon que l'appelant est identifié ou non. */
function fenetres(action: ActionCadence, avecCompte: boolean, s: SeuilsCadence): Fenetre[] {
  if (action === 'creation_compte') return [{ secondes: 3600, maximum: s.creationComptreParHeure }];
  return avecCompte
    ? // Compte : rythme borné, AUCUNE limite journalière ni totale (décision produit, pas un oubli).
      [
        { secondes: 600, maximum: s.compteAnalysesPar10min },
        { secondes: 3600, maximum: s.compteAnalysesParHeure },
      ]
    : [
        { secondes: 600, maximum: s.visiteurAnalysesPar10min },
        { secondes: 86400, maximum: s.visiteurAnalysesPar24h },
      ];
}

/**
 * Vérifie la cadence ET enregistre l'action si elle est autorisée (une seule visite à la base par fenêtre).
 * `internauteId` non nul → comptage PAR COMPTE ; sinon comptage par `sujetIp` (cf. `ip.ts`).
 */
export async function verifierCadence(
  action: ActionCadence,
  sujetIp: string,
  internauteId: string | null,
): Promise<VerdictCadence> {
  const seuils = await lireSeuilsCadence();
  const avecCompte = internauteId !== null;
  const portee: 'ip' | 'compte' = avecCompte ? 'compte' : 'ip';
  const sujet = avecCompte ? (internauteId as string) : sujetIp;
  const passant: VerdictCadence = { autorise: true, retryApresS: 0, code: 'cadence_depassee', sansCompte: !avecCompte };

  if (!seuils.actif) return passant; // interrupteur général d'exploitation

  try {
    for (const f of fenetres(action, avecCompte, seuils)) {
      // Combien d'actions dans la fenêtre, et depuis quand la plus ancienne ? Une seule requête par fenêtre.
      const r = await query<{ n: string; plus_ancienne: Date | null }>(
        `SELECT count(*)::text AS n, min(cree_a) AS plus_ancienne
           FROM cadence_evenement
          WHERE action = $1 AND portee = $2 AND sujet = $3 AND cree_a > now() - make_interval(secs => $4)`,
        [action, portee, sujet, f.secondes],
      );
      const n = Number(r.rows[0]?.n ?? '0');
      if (n < f.maximum) continue;

      // Seuil atteint : on rend la main quand la PLUS ANCIENNE action de la fenêtre en sera sortie.
      const plusAncienne = r.rows[0]?.plus_ancienne;
      const ecoule = plusAncienne ? (Date.now() - new Date(plusAncienne).getTime()) / 1000 : 0;
      const reste = Math.ceil(f.secondes - ecoule);
      return { autorise: false, retryApresS: Math.max(1, reste), code: 'cadence_depassee', sansCompte: !avecCompte };
    }

    await query(`INSERT INTO cadence_evenement (action, portee, sujet) VALUES ($1, $2, $3)`, [action, portee, sujet]);
    return passant;
  } catch {
    // Table absente (migration non appliquée) ou base indisponible → on LAISSE PASSER (jamais de panne ajoutée).
    return passant;
  }
}

/**
 * PURGE des compteurs plus vieux que la plus longue fenêtre utile (24 h) + une marge. Best-effort, silencieuse.
 * Appelée en post-réponse par la route d'analyse : pas de tâche planifiée à maintenir, et le volume purgé reste
 * minuscule. `RETENTION_H` est large exprès — un compteur gardé une heure de trop ne coûte rien, un compteur
 * effacé trop tôt rouvrirait la fenêtre.
 */
export const RETENTION_H = 25;

export async function purgerCadence(): Promise<void> {
  try {
    await query(`DELETE FROM cadence_evenement WHERE cree_a < now() - make_interval(hours => $1)`, [RETENTION_H]);
  } catch {
    /* best-effort : la purge n'a jamais le droit de faire échouer une requête */
  }
}
