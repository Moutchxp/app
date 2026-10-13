/**
 * CLI — LOT RATTACHEMENT-AUTOMATIQUE-REGLES-R1-R4-ET-LECTURE-DE-L-OBJET : RÉGLER LA DURÉE DE LA RÈGLE B.
 *
 * « Ancien locataire qui écrit après son départ → rattaché automatiquement à son DERNIER bien pendant 15 MOIS après la
 * date de sortie. La durée est réglable (réglage par défaut 15 mois). » (Arno, 13/10/2026)
 *
 * SANS `--appliquer`, ELLE AFFICHE LE RÉGLAGE ET N'ÉCRIT RIEN. Avec :
 *   npx tsx app/scripts/regler-rattachement-auto.ts --mois=18 --auteur=a.jorel@sansvisavis.com --appliquer
 * Le réglage est signé et daté (`modifie_le`, `modifie_par_libelle`) ; il vaut pour les mails examinés ENSUITE.
 */
import '../lib/chargerEnv';
import { closePool } from '../lib/db/client';
import { lireReglageRattachement, reglerAncienLocataireMois } from '../lib/gestion/reglageRattachementRepo';

async function principal(): Promise<void> {
  const arg = (nom: string) => process.argv.find((a) => a.startsWith(`--${nom}=`))?.slice(nom.length + 3) ?? null;
  const avant = await lireReglageRattachement();
  if (avant === null) { console.log('Migration 345 non appliquée : les nouvelles règles ne jouent pas.'); return; }
  console.log(`Mise en service : ${avant.miseEnService} · ancien locataire : ${avant.ancienLocataireMois} mois`);
  const mois = arg('mois');
  if (mois === null || !process.argv.includes('--appliquer')) { console.log('(lecture seule — ajouter --mois=N --auteur=… --appliquer)'); return; }
  const r = await reglerAncienLocataireMois(Number(mois), arg('auteur') ?? '');
  console.log(r.ok ? `Réglé : ${mois} mois.` : `Refusé : ${r.motif}`);
  if (!r.ok) process.exitCode = 1;
}

principal().catch((e) => { console.error(e); process.exitCode = 1; }).finally(() => { void closePool(); });
