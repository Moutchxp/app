/**
 * ══ 🔴🔴 LOT MONGA-1, POINT 1 — RELIRE TOUT LE COURRIER MONGA ════════════════════════════════════════════════════
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * Relit les mails Monga déjà en base et garde ce qu'ils disent dans `gestion_monga_mail` (migration 311). Affiche
 * le taux de lecture, à comparer avec celui de l'audit du 06/10/2026 :
 *
 *       référence 95/97 · libellé 93/97 · adresse 93/97 · lien Mission 93/97 · 40 références
 *
 * 🔴 IL NE POSE ET NE DÉFAIT AUCUN LIEN référence ↔ événement. Ces liens sont des clics d'Arno, pas des lectures
 * — la contrainte `gestion_monga_lien_humain_chk` l'interdit d'ailleurs en base. Relire est donc sans danger, et
 * rejouable autant de fois qu'on veut : c'est la commande du rattrapage quand l'extracteur s'améliore.
 *
 * LANCEMENT :  npx tsx app/scripts/relire-monga.ts
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */
import { closePool } from '../lib/db/client';
import { interventionsMonga, relireLesMailsMonga } from '../lib/gestion/mongaRepo';

function taux(n: number, total: number): string {
  return `${n}/${total} (${total === 0 ? 0 : Math.round((n / total) * 100)} %)`;
}

async function principal(): Promise<void> {
  const r = await relireLesMailsMonga();
  if (r.mailsLus === 0) {
    console.log('Aucun mail Monga lu. La migration 311 est-elle appliquée ?');
    return;
  }
  console.log(`\n  ${r.mailsLus} mails Monga relus.\n`);
  console.log(`  référence     ${taux(r.avecReference, r.mailsLus)}`);
  console.log(`  libellé       ${taux(r.avecLibelle, r.mailsLus)}`);
  console.log(`  adresse       ${taux(r.avecAdresse, r.mailsLus)}`);
  console.log(`  lien Mission  ${taux(r.avecLienMission, r.mailsLus)}`);
  console.log(`\n  ${r.references} références distinctes.`);

  const aRelier = await interventionsMonga({ reliees: false });
  const reliees = await interventionsMonga({ reliees: true });
  console.log(`  dont ${reliees.length} reliées à un événement, ${aRelier.length} à relier.\n`);
  for (const i of aRelier.slice(0, 50)) {
    console.log(`  ${i.reference}  ${String(i.nbMails).padStart(2)} mails  `
      + `${(i.libelle ?? '—').slice(0, 38).padEnd(38)}  ${(i.adresse ?? '—').slice(0, 42).padEnd(42)}  `
      + i.derniereEtapeMot);
  }
}

principal()
  .catch((e: unknown) => { console.error(e); process.exitCode = 1; })
  .finally(() => closePool());
