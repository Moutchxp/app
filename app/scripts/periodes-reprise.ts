/**
 * ══ 🔴🔴 LOT SUIVI-CONVERSATION — REPRENDRE L'EXISTANT EN PÉRIODES ET EXCEPTIONS ═══════════════════════════════
 *
 * Demande d'Arno (point 6) : « Reprends les rattachements actuels sans rien perdre : chaque conversation
 * existante devient une période initiale, et un rattachement posé sur un seul mail est repris comme exception.
 * Fais d'abord une sauvegarde, puis donne-moi les chiffres avant / après. Aucun rattachement manuel perdu. »
 *
 *   npm run gestion:periodes:reprise                 → SIMULATION : elle compte, elle n'écrit rien
 *   npm run gestion:periodes:reprise -- --appliquer   → elle écrit
 *   npm run gestion:periodes:reprise -- --limite=50   → bornée, pour un essai
 *
 * 🔴 ELLE NE S'APPLIQUE QUE SI ELLE EST FIDÈLE, conversation par conversation. Avant d'écrire quoi que ce soit,
 * `repriseFidele` reprojette ce qu'on s'apprête à poser et le compare à l'existant, COUPLE PAR COUPLE. Une
 * conversation que la reprise ne rendrait pas à l'identique est LAISSÉE TELLE QUELLE et comptée à part : mieux
 * vaut une conversation sans période qu'une conversation dont on aurait perdu un rattachement.
 *
 * 🔴 ELLE EST REJOUABLE. Une conversation qui porte déjà des périodes est sautée — relancer la commande ne
 * crée pas de doublon, et permet de reprendre ce qui aurait été ajouté depuis.
 *
 * ⚠️ ELLE N'ÉCRIT RIEN DANS `gestion_rattachement`. La reprise ne fait que DÉCRIRE ce qui existe ; aucun mail
 * n'est reclassé, aucun lien n'est posé ni retiré. C'est ce qui rend l'opération sans risque.
 */
import { query } from '../lib/db/client';
import { reprendreExistant } from '../lib/gestion/periodeRepo';
import { periodesDisponibles } from '../lib/gestion/schema';

const AUTEUR = { id: null, libelle: 'reprise des périodes' };

async function chiffres(): Promise<Record<string, number>> {
  const un = async (sql: string): Promise<number> => {
    const { rows } = await query<{ n: number }>(sql);
    return rows[0]?.n ?? 0;
  };
  return {
    'rattachements confirmés': await un(
      "SELECT count(*)::int AS n FROM gestion_rattachement WHERE statut = 'confirme'"),
    'dont posés à la main': await un(
      `SELECT count(*)::int AS n FROM gestion_rattachement
        WHERE statut = 'confirme' AND (origine = 'manuel' OR statut_par_libelle IS NOT NULL)`),
    'messages classés': await un(
      "SELECT count(DISTINCT message_id)::int AS n FROM gestion_rattachement WHERE statut = 'confirme'"),
    'périodes': await un('SELECT count(*)::int AS n FROM gestion_fil_periode'),
    'exceptions': await un('SELECT count(*)::int AS n FROM gestion_message_exception'),
  };
}

function ecrire(titre: string, c: Record<string, number>): void {
  console.log(`\n${titre}`);
  for (const [k, v] of Object.entries(c)) console.log(`  ${k.padEnd(26)} ${v}`);
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const appliquer = args.includes('--appliquer');
  const limiteArg = args.find((a) => a.startsWith('--limite='));
  const limite = limiteArg === undefined ? undefined : Number(limiteArg.split('=')[1]);

  if (!(await periodesDisponibles())) {
    console.error('\n🔴 La migration 290 n’est pas appliquée. Rien à faire.');
    console.error('   psql "$DATABASE_URL" -f db/migrations/290_gestion_fil_periode.sql\n');
    process.exit(1);
  }

  const avant = await chiffres();
  ecrire('AVANT', avant);

  console.log(`\n${appliquer ? '🔴 APPLICATION' : 'SIMULATION (rien n’est écrit)'}…`);
  const r = await reprendreExistant({ auteur: AUTEUR, appliquer, limite });
  console.log(`  conversations vues         ${r.filsVus}`);
  console.log(`  conversations reprises     ${r.filsRepris}`);
  console.log(`  périodes à créer           ${r.periodes}`);
  console.log(`  exceptions à créer         ${r.exceptions}`);
  // 🔴 LE SEUL CHIFFRE QUI DOIT ÊTRE À ZÉRO.
  console.log(`  🔴 conversations ÉCARTÉES   ${r.filsInfideles}`
    + (r.filsInfideles > 0 ? '  ← la reprise ne les rendrait pas à l’identique : elles restent telles quelles' : ''));

  const apres = await chiffres();
  ecrire('APRÈS', apres);

  const perdus = avant['rattachements confirmés'] - apres['rattachements confirmés'];
  console.log(`\n${perdus === 0 ? '✅' : '🔴'} rattachements confirmés : `
    + `${avant['rattachements confirmés']} → ${apres['rattachements confirmés']}`
    + `${perdus === 0 ? ' (aucun perdu)' : ` — ${perdus} PERDUS`}\n`);
  process.exit(perdus === 0 ? 0 : 1);
}

void main();
