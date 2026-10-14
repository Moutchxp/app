import { query } from '../db/client';
import { envoiClassementDisponible } from './schema';
import type { Auteur } from './gestes';
import { SQL_MESSAGE_DE_L_ENVOI, type CibleEnvoi } from './envoiCiblesRepo';
import { decisionRattachement, fondDuMail, rattachementVide, type RattachementBrouillon } from './rattachementBrouillon';

/**
 * ══ 🔴🔴 LOT COMPOSEUR-FENETRE-COMPLETE (Arno, 13-14/10/2026) — LE RATTACHEMENT DU COMPOSEUR, APPLIQUÉ APRÈS L'ENVOI ══
 *
 * ⚠️ PAS DE `import 'server-only'` ICI — convention du module (voir `envoiCiblesRepo.ts`).
 *
 * DÉCISION D'ARNO : « Rien n'est écrit avant l'envoi. Tous les choix (biens, portée, événement, autres classements)
 * sont gardés avec le brouillon. À l'envoi, une fois le mail réellement parti et enregistré, applique EXACTEMENT la
 * même fonction que “Modifier le rattachement” sur un mail existant, avec ces choix. Un seul chemin d'écriture
 * partagé : pas de seconde logique. Si l'envoi échoue, rien n'est appliqué. »
 *
 * ═══ 🔴 LE CHEMIN, EN DEUX TEMPS — CELUI DES BIENS COCHÉS DEPUIS LE LOT RATTACHER-EN-ECRIVANT ══════════════════════
 *
 *   ① APRÈS L'ENVOI RÉUSSI (`envoyerMessage` → `deps.classer`) — `enregistrerClassementEnvoi` écrit l'INTENTION
 *      (biens choisis, biens du suivi de fond décochés, position de la glissière), attachée à l'envoi. Un envoi en
 *      échec n'atteint jamais cette étape : rien n'est retenu, donc rien ne sera appliqué.
 *   ② APRÈS LA RELÈVE — `appliquerClassementsEnAttente` retrouve le mail capturé (`SQL_MESSAGE_DE_L_ENVOI`, la même
 *      reconnaissance que les biens cochés : en cas d'ambiguïté, rien n'est posé), lit le suivi de la conversation,
 *      décide par `decisionRattachement` (les règles de la fenêtre) et appelle `poserClassement` — LA fonction derrière
 *      « Modifier le rattachement » (`POST /api/admin/gestion/suivi`). « Origine » n'écrit rien : le mail hérite alors
 *      du suivi de fond, comme tout mail qui arrive.
 *
 * 🔴 UN SEUL CHEMIN POUR LES BIENS : quand l'intention est retenue ici, les biens ne passent PLUS par
 * `gestion_envoi_cible` (rattachements manuels posés directement) — voir `depsEnvoiReel.classer`. Les cibles
 * « événement » y restent, inchangées.
 *
 * 🔴 RIEN NE PEUT FAIRE ÉCHOUER UN ENVOI NI UNE RELÈVE : les deux fonctions attrapent leurs erreurs.
 * ⚠️ SANS LA MIGRATION 351 : `enregistrerClassementEnvoi` rend `false` sans requête, et l'ancien chemin s'applique.
 */

/**
 * ① À L'ENVOI — RETENIR L'INTENTION. Rend `true` si elle est retenue (les biens voyagent alors par elle), `false`
 * sinon (migration absente, aucun choix, auteur non humain) : l'appelant garde alors l'ancien chemin.
 */
export async function enregistrerClassementEnvoi(o: {
  envoiId: number; cibles: readonly CibleEnvoi[]; rattachement: RattachementBrouillon | null; auteur: Auteur;
}): Promise<boolean> {
  try {
    if (o.rattachement === null) return false;
    const biens = biensDesCibles(o.cibles);
    if (biens.length === 0 && rattachementVide(o.rattachement)) return false;
    const libelle = (o.auteur.libelle ?? '').trim();
    if (libelle === '' || libelle.toLowerCase() === 'automatique') return false;
    if (!(await envoiClassementDisponible())) return false;
    await query(
      `INSERT INTO gestion_envoi_classement (envoi_id, biens, retires, position, auteur_id, auteur_libelle)
       VALUES ($1, $2::jsonb, $3::jsonb, $4, $5, $6)
       ON CONFLICT (envoi_id) DO NOTHING`,
      [o.envoiId, JSON.stringify(biens), JSON.stringify(o.rattachement.retires), o.rattachement.position,
        o.auteur.id, libelle]);
    return true;
  } catch (e) {
    console.error('[gestion/envoiClassement] intention non retenue (envoi=%d)', o.envoiId, e);
    return false;
  }
}

/** Les biens (cibles « lot ») d'un envoi, sans doublon : `{cle, libelle}`. PUR. */
export function biensDesCibles(cibles: readonly CibleEnvoi[]): { cle: string; libelle: string }[] {
  const out: { cle: string; libelle: string }[] = [];
  for (const c of cibles) {
    const cle = (c.cle ?? '').trim();
    if (c.sorte !== 'lot' || cle === '' || out.some((b) => b.cle === cle)) continue;
    out.push({ cle, libelle: (c.libelle ?? '').trim() || cle });
  }
  return out.slice(0, 50);
}

/** Les dépendances de l'application : la lecture du suivi et LA fonction d'écriture. Injectables pour l'épreuve. */
export interface DepsApplication {
  mailsDuFil(filId: number): Promise<number[]>;
  suiviDuFil(filId: number): Promise<{ periodes: import('./periodesConversation').Periode[]; exceptions: import('./periodesConversation').ExceptionMail[] }>;
  poserClassement: typeof import('./periodeRepo').poserClassement;
}

async function depsParDefaut(): Promise<DepsApplication> {
  const p = await import('./periodeRepo');
  return { mailsDuFil: p.mailsDuFil, suiviDuFil: p.suiviDuFil, poserClassement: p.poserClassement };
}

/**
 * ② APRÈS LA RELÈVE — APPLIQUER LES INTENTIONS DONT LE MAIL EST ENFIN LÀ. Rend le nombre d'intentions appliquées.
 *
 * 🔴 CHAQUE INTENTION EST RÉSERVÉE AVANT D'ÊTRE APPLIQUÉE (`applique_le IS NULL` dans l'`UPDATE`) : deux passes de
 * relève concurrentes ne l'appliquent jamais deux fois. Son issue est écrite à côté — on saura toujours ce qui a été
 * fait, et pourquoi rien ne l'a été.
 */
export async function appliquerClassementsEnAttente(deps?: DepsApplication): Promise<number> {
  try {
    if (!(await envoiClassementDisponible())) return 0;
    const { rows } = await query<{
      id: string; message_id: string | null; fil_id: string | null; biens: unknown; retires: unknown;
      position: string | null; auteur_id: string | null; auteur_libelle: string;
    }>(
      `WITH prets AS (
         SELECT ec.id, ${SQL_MESSAGE_DE_L_ENVOI} AS message_id, ec.biens, ec.retires, ec.position,
                ec.auteur_id, ec.auteur_libelle
           FROM gestion_envoi_classement ec
           JOIN gestion_envoi e ON e.id = ec.envoi_id
          WHERE ec.applique_le IS NULL AND e.etat = 'envoye' AND e.parti_le IS NOT NULL
       )
       SELECT p.id::text, p.message_id::text, m.fil_id::text, p.biens, p.retires, p.position,
              p.auteur_id::text, p.auteur_libelle
         FROM prets p JOIN gestion_message m ON m.id = p.message_id
        WHERE p.message_id IS NOT NULL
        ORDER BY p.id`);
    if (rows.length === 0) return 0;
    const d = deps ?? await depsParDefaut();
    let appliques = 0;
    for (const r of rows) {
      const messageId = Number(r.message_id);
      const filId = Number(r.fil_id);
      const { rows: pris } = await query<{ id: string }>(
        `UPDATE gestion_envoi_classement SET applique_le = now(), message_id = $2
          WHERE id = $1 AND applique_le IS NULL RETURNING id::text`, [Number(r.id), messageId]);
      if (pris.length === 0) continue;
      appliques += 1;
      let issue: string;
      try {
        const [mails, suivi] = await Promise.all([d.mailsDuFil(filId), d.suiviDuFil(filId)]);
        const decision = decisionRattachement({
          fond: fondDuMail(mails, suivi.periodes, suivi.exceptions, messageId),
          biens: Array.isArray(r.biens) ? (r.biens as { cle: string; libelle: string }[]) : [],
          rattachement: {
            position: (r.position as RattachementBrouillon['position']) ?? null,
            retires: Array.isArray(r.retires) ? (r.retires as string[]) : [],
          },
        });
        if (decision.ecriture === null) {
          issue = `origine : rien à écrire (${decision.position})`;
        } else {
          const fait = await d.poserClassement({
            filId, messageId, classement: decision.ecriture.classement, choix: decision.ecriture.choix,
            auteur: { id: r.auteur_id === null ? null : Number(r.auteur_id), libelle: r.auteur_libelle },
          });
          issue = fait.ok ? `pose : ${decision.ecriture.choix}` : `refus : ${fait.motif}`;
        }
      } catch (e) {
        console.error('[gestion/envoiClassement] application impossible (intention=%s)', r.id, e);
        issue = 'erreur : application impossible';
      }
      await query('UPDATE gestion_envoi_classement SET issue = $2 WHERE id = $1', [Number(r.id), issue.slice(0, 500)]);
    }
    return appliques;
  } catch (e) {
    console.error('[gestion/envoiClassement] passe impossible', e);
    return 0;
  }
}
