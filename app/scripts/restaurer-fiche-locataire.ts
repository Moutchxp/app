/**
 * ══ 🔴🔴 LOT DOUBLON-RENVOI-ADHOC, POINT D (Arno, 10/11/2026) — RESTAURER LA FICHE D'UN LOCATAIRE DONT LE BAIL EST EN COURS ═══════════════
 *
 * Le cas : Stéphanie PIEULHET (locataire n° 531, bail 542 en cours), fiche supprimée le 10/11/2026 avec la ligne de suivi du doublon.
 * Voir `app/lib/location/restaurerFicheLocataire.ts` : la fiche seule redevient active, une ligne au journal ; rien d'autre ne change.
 *
 * Lancer :  npm run location:restaurer-fiche-locataire -- --locataire=531              (ESSAI : lecture seule, rien n'est écrit)
 *           npm run location:restaurer-fiche-locataire -- --locataire=531 --appliquer  (une transaction)
 * Rapport : .captures/restaurer-fiche-locataire/rapport-<date>.txt (ou --rapport=).
 */
import '../lib/chargerEnv';
import { writeFileSync } from 'node:fs';
import { pool, closePool } from '../lib/db/client';
import { restaurerFicheLocataire } from '../lib/location/restaurerFicheLocataire';
import { cheminRapport } from '../lib/ops/rapportScript';

const NOM = 'restaurer-fiche-locataire';
const AUTEUR = { id: null, libelle: 'script restaurer-fiche-locataire (décision d’Arno du 10/11/2026)' };

const arg = (nom: string): string | null => {
  const a = process.argv.find((x) => x.startsWith(`--${nom}=`));
  return a === undefined ? null : a.slice(nom.length + 3);
};

async function main(): Promise<void> {
  const appliquer = process.argv.includes('--appliquer');
  const id = Number(arg('locataire'));
  if (!Number.isSafeInteger(id) || id <= 0) throw new Error('Précisez --locataire=N (ex. --locataire=531).');
  const lignes: string[] = [];
  const dire = (t = '') => { lignes.push(t); console.log(t); };
  dire(`══ Restaurer la fiche du locataire n° ${id} — ${appliquer ? 'APPLIQUER (une transaction)' : 'ESSAI (rien n’est écrit)'}`);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    if (!appliquer) await client.query('SET TRANSACTION READ ONLY');
    const r = await restaurerFicheLocataire({ locataireId: id, appliquer, q: (s, p = []) => client.query(s, p), auteur: AUTEUR });
    for (const l of r.lignes) dire(l);
    if (r.etat === 'restauree') { await client.query('COMMIT'); dire('✓ Fiche restaurée, ligne écrite au journal de l’annuaire.'); }
    else { await client.query('ROLLBACK'); dire(r.motif ?? 'Essai : rien n’a été écrit. Relancer avec --appliquer pour écrire.'); }
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
