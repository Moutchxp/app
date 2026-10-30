/**
 * CLI `transaction:reclasser-retro` — 🔴 LOT BV (Arno, 30/10/2026) : une « rétrocession » importée qui est en réalité la COMMISSION du négociateur
 * de la ligne (ligne « Apporteur Intermédiaire » de son onglet, ex. CATHERINE à 70–80 % des honoraires) → reclassée en commission du négociateur.
 *
 * 🔴 ESSAI PAR DÉFAUT : lit (lecture seule), liste les ventes candidates (critère de `reclassementRetro.ts`), le « Reste agence HT » de chacune
 *    avant / après au centime, les totaux, et dit pour chaque vente RECLASSABLE (le reste ne change pas) ou BLOQUÉE (il changerait : le négociateur
 *    n'est pas indépendant ; ou plusieurs destinataires). Écrit son rapport dans `.captures/transaction-reclasser-retro/` ; RIEN en base.
 * 🔴 ÉCRITURE seulement avec `--ecrire` ET `--ventes=<n°,n°…>` (la liste accordée par Arno) : chaque vente demandée doit être RECLASSABLE dans le
 *    plan recalculé, sinon RIEN n'est écrit (code 2) ; chaque vente dans sa transaction, journalisée, réversible (rien n'est supprimé).
 *
 * Usage :
 *   npm run transaction:reclasser-retro                                     (essai : les deux sociétés)
 *   npm run transaction:reclasser-retro -- --societe=criterimmo             (essai : une société)
 *   npm run transaction:reclasser-retro -- --ecrire --ventes=214            (écriture, après accord d'Arno sur la liste)
 *   option : --rapport=/chemin (fichier ou dossier)
 */
import '../lib/chargerEnv';
import { writeFileSync } from 'node:fs';
import { estPointEntree } from '../lib/scripts/pointEntree';
import { cheminRapport, optionLigne } from '../lib/ops/rapportScript';
import { SOCIETES, type Societe } from '../lib/transaction/modele';
import { planReclassement, texteReclassement, type CandidatReclassement } from '../lib/transaction/reclassementRetro';

const NOM_SCRIPT = 'transaction-reclasser-retro';
const P = '[transaction:reclasser-retro]';

export async function main(argv: readonly string[]): Promise<number> {
  const ecrire = argv.includes('--ecrire');
  const demandees = (optionLigne(argv, 'ventes') ?? '').split(',').map((x) => Number(x.trim())).filter((x) => Number.isSafeInteger(x) && x > 0);
  const choix = optionLigne(argv, 'societe');
  const societes: Societe[] = choix === 'criterimmo' || choix === 'macj' ? [choix] : [...SOCIETES];
  const { closePool } = await import('../lib/db/client');
  const { lireVentes, lireRetrocessions, lireStatutsNegociateurs, libellesDePaye } = await import('../lib/transaction/repo');
  const { resolveurDe } = await import('../lib/transaction/statutLigne');
  const l: string[] = [`${P} ${ecrire ? 'ÉCRITURE' : 'ESSAI (rien n’est écrit ; --ecrire --ventes=… pour écrire, après accord d’Arno)'} — ${new Date().toISOString()}`];
  let code = 0;
  try {
    const plan: CandidatReclassement[] = [];
    for (const s of societes) {
      const [ventes, retros] = await Promise.all([lireVentes(s), lireRetrocessions(s)]);
      const statuts = await lireStatutsNegociateurs([...new Set([...libellesDePaye(ventes), ...retros.map((r) => r.negociateur)])]);
      plan.push(...planReclassement(ventes, retros, resolveurDe(statuts), s));
    }
    l.push('', texteReclassement(plan));
    if (ecrire) {
      if (demandees.length === 0) { l.push('', '⛔ --ecrire demande --ventes=<n°,n°…> : la liste accordée par Arno. Rien n’est écrit.'); code = 2; }
      else {
        const refus = demandees.filter((id) => !plan.some((c) => c.venteId === id && c.reclassable));
        if (refus.length > 0) { l.push('', `⛔ vente(s) ${refus.join(', ')} absente(s) du plan ou BLOQUÉE(S) : rien n’est écrit.`); code = 2; }
        else {
          const { reclasserRetroEnCommission } = await import('../lib/transaction/reclassementRetroRepo');
          for (const id of demandees) {
            const c = plan.find((x) => x.venteId === id)!;
            const r = await reclasserRetroEnCommission({ venteId: id, retroIds: c.retroIds, negociateur: c.negociateur, montantTtc: c.retroTtc, auteur: 'transaction:reclasser-retro (LOT BV)' });
            l.push(r.ok ? `vente ${id} : reclassée (commission n° ${r.ligneId}, rétrocession(s) ${c.retroIds.join(', ')} retirée(s), journalisé)` : `⛔ ${r.motif}`);
            if (!r.ok) code = 2;
          }
        }
      }
    } else l.push('', 'Essai : rien n’a été écrit.');
  } catch (e) {
    l.push(`⛔ ${e instanceof Error ? e.message : String(e)}`); code = 1;
  } finally { await closePool(); }
  const chemin = cheminRapport({ nomScript: NOM_SCRIPT, demande: optionLigne(argv, 'rapport') });
  writeFileSync(chemin, `${l.join('\n')}\n`);
  console.log(`${l.join('\n')}\n\nRapport : ${chemin}`);
  return code;
}

if (estPointEntree(import.meta.url)) {
  main(process.argv.slice(2)).then((c) => process.exit(c)).catch((e) => { console.error(e); process.exit(1); });
}
