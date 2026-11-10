/**
 * ══ 🔴🔴 LOT GESTION-TRADUCTION (Arno, 10/11/2026) — TRADUIRE LES COMMENTAIRES MONGA DÉJÀ ENREGISTRÉS ══════════════════════════════════
 *
 * Les commentaires arrivés APRÈS la mise à jour sont traduits par la relève. Ceux d'avant ne le sont QUE par ce script, lancé à la main.
 *
 *   · ESSAI (défaut) : liste ce qui serait traduit (langue probable, date, référence, début du texte). Session en LECTURE SEULE, AUCUN
 *     appel au service, rien n'est écrit.
 *   · --appliquer : traduit chacun avec Mistral AI (Union européenne, `MISTRAL_API_KEY`), en n'envoyant QUE le texte du commentaire, et
 *     range la traduction dans `gestion_monga_traduction` (migration 463). Le texte d'origine n'est jamais modifié ; aucune étape n'est
 *     créée, modifiée ni validée. Un échec s'écrit « echec » : l'écran dit « Traduction indisponible », la relève retentera plus tard.
 *
 * Lancer :  npm run gestion:monga-commentaires:traduire               (ESSAI : rien écrit, rien envoyé)
 *           npm run gestion:monga-commentaires:traduire -- --appliquer
 * Rapport : .captures/monga-commentaires-traduire/rapport-<date>.txt (ou --rapport=).
 */
import '../lib/chargerEnv';
import { writeFileSync } from 'node:fs';
import { pool, closePool } from '../lib/db/client';
import { repriseDesCommentaires, traducteurMistral } from '../lib/gestion/traductionCommentaireRepo';
import { cheminRapport } from '../lib/ops/rapportScript';

const NOM = 'monga-commentaires-traduire';

const arg = (nom: string): string | null => {
  const a = process.argv.find((x) => x.startsWith(`--${nom}=`));
  return a === undefined ? null : a.slice(nom.length + 3);
};

async function main(): Promise<void> {
  const appliquer = process.argv.includes('--appliquer');
  const lignes: string[] = [];
  const dire = (t = '') => { lignes.push(t); console.log(t); };
  dire(`══ Traduction des commentaires Monga — ${appliquer ? 'APPLIQUER (service Mistral AI, UE)' : 'ESSAI (rien n’est écrit, rien n’est envoyé)'}`);

  const client = await pool.connect();
  try {
    const q = (sql: string, p: unknown[] = []) => client.query(sql, p);
    const { rows } = await q(`SELECT to_regclass('public.gestion_monga_traduction') IS NOT NULL AS la`);
    if (!(rows[0] as { la: boolean }).la) {
      dire('La migration 463 n’est pas appliquée : rien à faire (appliquez-la d’abord).');
      return;
    }
    if (!appliquer) {
      await q('BEGIN');
      await q('SET TRANSACTION READ ONLY');
    }
    const bilan = await repriseDesCommentaires({ appliquer, q, traducteur: appliquer ? traducteurMistral() : null, dire });
    if (!appliquer) {
      await q('ROLLBACK');
      dire(`Essai : ${bilan.candidats} commentaire(s) seraient traduits. Rien n’a été écrit ni envoyé. Relancer avec --appliquer.`);
    } else {
      dire(`✓ ${bilan.traduits} traduit(s), ${bilan.francais} reconnu(s) français par le service, ${bilan.echecs} échec(s) (retentés par la relève).`);
    }
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    throw e;
  } finally {
    client.release();
    const chemin = cheminRapport({ nomScript: NOM, demande: arg('rapport') });
    writeFileSync(chemin, `${lignes.join('\n')}\n`);
    console.log(`Rapport : ${chemin}`);
  }
}

void main()
  .catch((e) => { console.error(`[${NOM}] échec`, e); process.exitCode = 1; })
  .finally(() => closePool());
