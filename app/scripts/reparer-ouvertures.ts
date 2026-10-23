import '../lib/chargerEnv';
import { writeFileSync } from 'node:fs';
import { estPointEntree } from '../lib/scripts/pointEntree';
import { cheminRapport, optionLigne } from '../lib/ops/rapportScript';
import type { OuvertureAReprendre, PasseRepriseOuvertures } from '../lib/gestion/repriseOuverturesRepo';

/**
 * ══ 🔴🔴 REPRISE — « LA DATE D'OUVERTURE = LA DATE DE CRÉATION » (Arno, 23/10/2026, option A) ══════════════════════════════════
 *
 * Ramène à l'instant de création les ouvertures datées après la création (ou dans le futur), et note l'ancienne date future dans
 * une carte « RDV intervention » (la règle : `repriseOuverturesRepo.ts`).
 *
 *   npm run gestion:reparer-ouvertures                      → À BLANC (par défaut) : rien n'est écrit, le rapport dit ce qui le serait
 *   npm run gestion:reparer-ouvertures -- --reel            → écrit, en UNE transaction (tout ou rien)
 *   … -- --rapport=<fichier ou dossier>                     → où écrire le rapport (défaut : .captures/reparer-ouvertures/)
 *
 * Rejouable : un événement repris a son ouverture à la création et ne ressort plus.
 */
const P = '[gestion:reparer-ouvertures]';
const NOM_SCRIPT = 'reparer-ouvertures';
const dateFr = (s: string): string => `${s.slice(8, 10)}/${s.slice(5, 7)}/${s.slice(0, 4)} à ${s.slice(11, 16)}`;

export function texteRapportOuvertures(p: PasseRepriseOuvertures, o: { base: string }): string {
  const ligne = (c: OuvertureAReprendre): string => [
    `  · ${c.reference ?? `événement ${c.evenementId}`} — ${c.objet ?? '(sans intitulé)'}`,
    `      bien : ${c.bien ?? '(aucun bien déclaré)'}`,
    `      créé le ${dateFr(c.creeLe)} · ${c.sorte === 'evenement' ? 'ouverture saisie' : `carte Ouverture n° ${c.carteId}`} : ${dateFr(c.ouvertLe)}${c.futur ? ' (DANS LE FUTUR)' : ''}`,
    `      carte RDV intervention : ${c.rdvExistants === 0 ? 'aucune' : `${c.rdvExistants} sur la frise${c.rdvCeJour ? ', dont une ce jour-là' : ''}`}`
      + ` → ${c.rdvAPoser ? `une carte RDV ${p.reel ? 'POSÉE' : 'serait posée'} au ${dateFr(c.ouvertLe).slice(0, 10)}` : 'aucune à poser'}`,
    `      → ouverture ${p.reel ? 'RAMENÉE' : 'serait ramenée'} au ${dateFr(c.creeLe)} (ancienne date gardée au journal)`,
  ].join('\n');
  return [
    `REPRISE DES OUVERTURES — ${p.reel ? 'RÉEL' : 'À BLANC (aucune écriture)'}`,
    `base : ${o.base}`,
    '',
    `ouvertures datées après la création ou dans le futur : ${p.trouvees.length}${p.reel ? ` · reprises : ${p.reprises} · cartes RDV posées : ${p.rdvPoses}` : ''}`,
    '',
    ...(p.trouvees.length === 0 ? ['  (aucune)'] : p.trouvees.map(ligne)),
    '',
  ].join('\n');
}

async function principal(): Promise<void> {
  const argv = process.argv.slice(2);
  const reel = argv.includes('--reel');
  const { passerRepriseOuvertures } = await import('../lib/gestion/repriseOuverturesRepo');
  const { closePool } = await import('../lib/db/client');
  const base = (process.env.DATABASE_URL ?? '').split('/').pop()?.split('?')[0] ?? '?';
  try {
    const p = await passerRepriseOuvertures({ reel });
    const texte = texteRapportOuvertures(p, { base });
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
