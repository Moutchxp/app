import '../lib/chargerEnv';
import { writeFileSync } from 'node:fs';
import { estPointEntree } from '../lib/scripts/pointEntree';
import { cheminRapport, optionLigne } from '../lib/ops/rapportScript';
import type { PasseRattrapageLiens } from '../lib/gestion/mongaRattrapageLiensRepo';

/**
 * ══ 🔴🔴 RATTRAPAGE — « LE PREMIER GESTE HUMAIN SUR UN MAIL MONGA RELIE TOUTE SA RÉFÉRENCE » (Arno, 26/10/2026) ═════════
 *
 * Pose, pour le passé, le lien référence Monga → événement que le rattachement à la main pose désormais (la règle :
 * `mongaRattrapageLiensRepo.ts`).
 *
 *   npm run gestion:relier-monga-rattrapage                    → À BLANC (par défaut) : rien n'est écrit, le rapport dit ce qui le serait
 *   npm run gestion:relier-monga-rattrapage -- --appliquer     → pose les liens (une transaction par lien) et classe les mails
 *   … -- --rapport=<fichier ou dossier>                        → où écrire le rapport (défaut : .captures/relier-monga-rattrapage/)
 *
 * Rejouable : une référence reliée ne ressort plus.
 */
const P = '[gestion:relier-monga-rattrapage]';
const NOM_SCRIPT = 'relier-monga-rattrapage';
/** Le jour du motif, celui qu'Arno a fixé : « rattrapage du 26/10/2026 ». */
export const JOUR_DU_RATTRAPAGE = '26/10/2026';

const dateFr = (s: string): string => `${s.slice(8, 10)}/${s.slice(5, 7)}/${s.slice(0, 4)} à ${s.slice(11, 16)}`;

export function texteRapportRattrapage(p: PasseRattrapageLiens, o: { base: string }): string {
  if (!p.disponible) {
    return [`RATTRAPAGE DES LIENS MONGA — base : ${o.base}`, '',
      'La migration 311 (interventions Monga) n’est pas appliquée sur cette base : rien à faire.', ''].join('\n');
  }
  const pose = new Map(p.poses.map((x) => [x.reference, x]));
  const ligne = (l: PasseRattrapageLiens['liens'][number]): string => {
    const fait = pose.get(l.reference);
    const suite = !p.appliquer ? '→ lien qui SERAIT posé'
      : fait === undefined ? '→ non traité'
        : fait.issue === 'cree' ? `→ lien POSÉ · ${fait.mailsClasses} mail(s) classé(s)`
          : fait.issue === 'deja' ? '→ déjà relié entre-temps à cet événement : rien'
            : '→ relié entre-temps à un autre événement : rien';
    return [
      `  · ${l.evenementReference} — ${l.objet}`,
      `      référence : ${l.reference} · étapes qui apparaîtront sur la frise : ${l.etapes}`,
      `      auteur : ${l.auteurLibelle} (affectation du ${dateFr(l.affecteLe)})`,
      `      ${suite}`,
    ].join('\n');
  };
  const ambigue = (a: PasseRattrapageLiens['ambigues'][number]): string => [
    `  · ${a.reference} — réclamée par ${a.evenements.length} événements : RIEN N'EST POSÉ (choix humain)`,
    ...a.evenements.map((e) => `      ${e.evenementReference} (rattaché par ${e.auteurLibelle})`),
  ].join('\n');
  return [
    `RATTRAPAGE DES LIENS MONGA — ${p.appliquer ? 'APPLIQUÉ' : 'À BLANC (aucune écriture)'}`,
    `base : ${o.base}`,
    `motif : rattrapage du ${JOUR_DU_RATTRAPAGE}`,
    '',
    `liens à poser : ${p.liens.length}${p.appliquer ? ` · posés : ${p.poses.filter((x) => x.issue === 'cree').length}` : ''}`,
    '',
    ...(p.liens.length === 0 ? ['  (aucun)'] : p.liens.map(ligne)),
    '',
    `références candidates pour plusieurs événements (laissées de côté) : ${p.ambigues.length}`,
    ...(p.ambigues.length === 0 ? ['  (aucune)'] : p.ambigues.map(ambigue)),
    '',
  ].join('\n');
}

async function principal(): Promise<void> {
  const argv = process.argv.slice(2);
  const appliquer = argv.includes('--appliquer');
  const { passerRattrapageLiensMonga } = await import('../lib/gestion/mongaRattrapageLiensRepo');
  const { closePool } = await import('../lib/db/client');
  const base = (process.env.DATABASE_URL ?? '').split('/').pop()?.split('?')[0] ?? '?';
  try {
    const p = await passerRattrapageLiensMonga({ appliquer, jour: JOUR_DU_RATTRAPAGE });
    const texte = texteRapportRattrapage(p, { base });
    const chemin = cheminRapport({ nomScript: NOM_SCRIPT, demande: optionLigne(argv, 'rapport') });
    writeFileSync(chemin, texte, 'utf8');
    console.log(texte);
    console.log(`${P} rapport : ${chemin}`);
  } finally {
    await closePool();
  }
}

if (estPointEntree(import.meta.url)) {
  principal().catch((e: unknown) => { console.error(P, e); process.exit(1); });
}
