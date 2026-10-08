/**
 * ══ 🔴🔴 LOT ETAT-PAR-LA-FRISE, POINT D — LES ÉVÉNEMENTS QUI CONTREDISENT LEUR FRISE. LECTURE SEULE. ══════════════
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * ARNO (08/10/2026) : « RÉPARATION des données incohérentes : liste en LECTURE SEULE les événements dont l'état
 * enregistré contredit leur frise (ex. GES-2026-000001 : clos sans carte Clôture). Ne corrige RIEN en base sans
 * l'accord d'Arno : rends-moi la liste et ce que la règle donnerait pour chacun. »
 *
 * ═══ 🔴 CE QUE CETTE COMMANDE PEUT, ET CE QU'ELLE NE PEUT PAS ═══════════════════════════════════════════════════
 *
 * Elle LIT, et c'est tout — `evenementEtatRepo` ne sait pas écrire (aucun INSERT, aucun UPDATE dans le module).
 * Il n'y a donc pas de drapeau « --corriger » à découvrir un jour par inadvertance : pour réparer, il faudra
 * écrire un geste, et donc en parler.
 *
 * 🔴 ET DEPUIS CE LOT, LA DIVERGENCE N'A PLUS AUCUNE CONSÉQUENCE VISIBLE : tous les écrans lisent la frise. La
 * colonne `etat` ne sert plus qu'à distinguer « à traiter » de « en cours ». Cette liste dit donc ce qu'il
 * resterait à ranger, pas ce qui est cassé — et c'est pour cela qu'elle peut attendre la décision d'Arno.
 *
 * USAGE :
 *   npx tsx --env-file=.env app/scripts/etats-contradictoires.ts
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */
import { closePool } from '../lib/db/client';
import { evenementsEnContradiction } from '../lib/gestion/evenementEtatRepo';

const P = '[états]';

/** Le jour d'un instant ISO, sans construire de date : le fuseau du lecteur ne doit rien décaler. */
function jour(instant: string | null): string {
  return instant === null ? '—' : instant.slice(0, 10);
}

async function main(): Promise<void> {
  const liste = await evenementsEnContradiction();
  if (liste.length === 0) {
    console.log(`${P} ✅ aucun événement ne contredit sa frise.`);
    await closePool();
    return;
  }
  console.log(`${P} ⚠️  ${liste.length} événement(s) dont l’état enregistré contredit sa frise.`);
  console.log(`${P} RIEN n’est corrigé : c’est une lecture.\n`);
  for (const d of liste) {
    console.log(`  ${d.reference} (id ${d.id})`);
    console.log(`    enregistré     : etat = ${d.etatEnregistre}, traite_le = ${jour(d.traiteLe)}`);
    console.log(`    règle (frise)  : ${d.ouvertParLaFrise ? 'OUVERT' : 'CLOS'}`
      + (d.closLeParLaFrise === null ? '' : ` — clos le ${jour(d.closLeParLaFrise)}`));
    console.log(`    périodes       : ${d.bornes ?? '(aucune)'}\n`);
  }
  await closePool();
}

void main().catch((e: unknown) => {
  console.error(`${P} ❌`, e);
  process.exitCode = 1;
});
