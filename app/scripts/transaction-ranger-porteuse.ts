/**
 * ══ 🔴 TUILE « TRANSACTION », LOT AE (Arno, 29/10/2026) — RANGER CHAQUE VENTE RÉPARTIE CHEZ SA SOCIÉTÉ PORTEUSE ══════════════════════
 *
 * Règle d'Arno : une vente appartient TOUJOURS à la société de son négociateur d'ENTRÉE (pour un collaborateur des deux sociétés : celle
 * choisie pour cette vente) ; la page de saisie ne compte que sans négociateur d'entrée. Depuis ce lot, l'enregistrement range la vente ; ce
 * script range celles enregistrées AVANT (leur colonne `societe` ≠ la société du négociateur d'entrée).
 *
 * 🔴 À BLANC PAR DÉFAUT : liste les ventes mal rangées et écrit son rapport ; aucune écriture en base. `--appliquer` range chacune
 * (`rangerPorteuse` : la colonne `societe` réécrite, journalisée — « Annuler » dans l'historique de la vente la remet — et le registre des
 * lignes miroir resynchronisé : l'ancienne ligne miroir annulée, jamais supprimée). Rejouer ne réécrit rien. Exige la migration 434.
 * Le rapport va dans `.captures/transaction-ranger-porteuse/` (jamais sur le Bureau).
 *
 *   npm run transaction:ranger-porteuse -- [--appliquer] [--rapport=/chemin]
 */
import '../lib/chargerEnv';
import { writeFileSync } from 'node:fs';
import { estPointEntree } from '../lib/scripts/pointEntree';
import { cheminRapport, optionLigne } from '../lib/ops/rapportScript';
import { LIBELLE_SOCIETE } from '../lib/transaction/modele';

const P = '[transaction:ranger-porteuse]';

async function main(argv: readonly string[]): Promise<number> {
  const appliquer = argv.includes('--appliquer');
  const { closePool } = await import('../lib/db/client');
  const { ventesMalRangees, rangerPorteuse } = await import('../lib/transaction/repo');
  const l: string[] = [`${P} ${appliquer ? 'APPLIQUER' : 'À BLANC (rien n’est écrit ; --appliquer pour écrire)'} — ${new Date().toISOString()}`];
  try {
    const liste = await ventesMalRangees();
    l.push('', `VENTES RÉPARTIES MAL RANGÉES (société enregistrée ≠ société du négociateur d’entrée) : ${liste.length}`);
    let rangees = 0;
    for (const v of liste) {
      const ligne = `  n° ${v.id} « ${v.libelle} » (${v.statut}) — enregistrée ${LIBELLE_SOCIETE[v.enregistree]}, négociateur d’entrée ${v.negociateurEntree ?? '?'} chez ${LIBELLE_SOCIETE[v.porteuse]}`;
      if (!appliquer) { l.push(`${ligne} — à ranger chez ${LIBELLE_SOCIETE[v.porteuse]} (--appliquer)`); continue; }
      const r = await rangerPorteuse(v.id, { id: null, libelle: 'transaction:ranger-porteuse' });
      if (r.ok) { rangees += r.valeur ? 1 : 0; l.push(`${ligne} — ${r.valeur ? `RANGÉE chez ${LIBELLE_SOCIETE[r.valeur.apres]} (journalisé)` : 'déjà rangée'}`); }
      else l.push(`${ligne} — ⛔ ${r.motif}`);
    }
    l.push('', appliquer ? `${rangees} vente(s) rangée(s).` : 'À blanc : rien n’a été écrit.');
    return fin(l, argv, 0);
  } finally {
    await closePool();
  }
}

function fin(l: string[], argv: readonly string[], code: number): number {
  const chemin = cheminRapport({ nomScript: 'transaction-ranger-porteuse', demande: optionLigne(argv, 'rapport') });
  const texte = l.join('\n');
  writeFileSync(chemin, texte, 'utf8');
  console.log(texte);
  console.log(`${P} rapport : ${chemin}`);
  return code;
}

if (estPointEntree(import.meta.url)) {
  main(process.argv.slice(2)).then((c) => process.exit(c), (e) => { console.error(P, e instanceof Error ? e.message : e); process.exit(1); });
}
