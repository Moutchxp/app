/**
 * CLI `transaction:statut-negociateur` — 🔴 LOT BX (Arno, 30/10/2026) : le statut d'un négociateur SANS compte de connexion (ancien collaborateur
 * nommé par un libellé dans les « TABLEAU DE BORD » : CATHERINE, JULIEN…), posé sur une fiche par libellé (migration 444). AUCUN compte n'est créé.
 *
 * 🔴 ESSAI PAR DÉFAUT : pour chaque libellé, le compte qui le rapproche (s'il y en a un, le compte fait foi : REFUSÉ, son statut se change dans
 *    « Comptes »), le statut lu aujourd'hui et celui demandé ; puis, par société, les commissions de négociateur de ces libellés et le « Reste à
 *    l'agence HT » de toutes les ventes signées avant / après. Rapport dans `.captures/transaction-statut-negociateur/` ; RIEN en base.
 * 🔴 ÉCRITURE seulement avec `--ecrire` : refusée en bloc si un libellé est rapproché d'un compte ; chaque fiche posée (la précédente retirée,
 *    jamais supprimée), journalisée.
 *
 * Usage :
 *   npm run transaction:statut-negociateur -- --libelles="CATHERINE,JULIEN,ANTOINE,HELENE,JEAN CLAUDE,FRED" --statut=independant
 *   npm run transaction:statut-negociateur -- --libelles="…" --statut=independant --ecrire --note="réponse d'Arno, LOT BX"
 *   option : --rapport=/chemin (fichier ou dossier)
 */
import '../lib/chargerEnv';
import { writeFileSync } from 'node:fs';
import { estPointEntree } from '../lib/scripts/pointEntree';
import { cheminRapport, optionLigne } from '../lib/ops/rapportScript';
import { SOCIETES } from '../lib/transaction/modele';
import { effetStatuts, planStatuts, texteStatuts, type EffetSociete } from '../lib/transaction/statutNegociateurPlan';
import { estStatutSansCompte } from '../lib/transaction/statutSansCompte';

const NOM_SCRIPT = 'transaction-statut-negociateur';
const P = '[transaction:statut-negociateur]';

export async function main(argv: readonly string[]): Promise<number> {
  const ecrire = argv.includes('--ecrire');
  const libelles = [...new Set((optionLigne(argv, 'libelles') ?? '').split(',').map((x) => x.trim()).filter((x) => x !== ''))];
  const statut = optionLigne(argv, 'statut');
  const note = optionLigne(argv, 'note');
  const l: string[] = [`${P} ${ecrire ? 'ÉCRITURE' : 'ESSAI (rien n’est écrit ; --ecrire pour écrire)'} — ${new Date().toISOString()}`];
  if (libelles.length === 0 || !estStatutSansCompte(statut)) {
    l.push('⛔ --libelles="A,B,…" et --statut=independant|associe|salarie sont obligatoires. Rien n’est écrit.');
    console.log(l.join('\n'));
    return 2;
  }
  let code = 0;
  const { closePool } = await import('../lib/db/client');
  try {
    const { lireVentes, lireRetrocessions, lireStatutsNegociateurs, libellesDePaye, comptesRapprochesDesLibelles } = await import('../lib/transaction/repo');
    const comptes = await comptesRapprochesDesLibelles(libelles);
    const statutsDemandes = await lireStatutsNegociateurs(libelles);
    const plan = planStatuts(libelles, statut, statutsDemandes, comptes);
    const effets: EffetSociete[] = [];
    for (const s of SOCIETES) {
      const [ventes, retros] = await Promise.all([lireVentes(s), lireRetrocessions(s)]);
      const statuts = await lireStatutsNegociateurs([...new Set([...libellesDePaye(ventes), ...retros.map((r) => r.negociateur), ...libelles])]);
      effets.push(effetStatuts(ventes, retros, s, statuts, plan));
    }
    l.push('', texteStatuts(plan, effets));
    if (ecrire) {
      const refus = plan.filter((p) => p.refus !== null);
      if (refus.length > 0) { l.push('', `⛔ ${refus.map((p) => p.libelle).join(', ')} : rapproché(s) d’un compte. Rien n’est écrit.`); code = 2; }
      else {
        const { poserStatutSansCompte } = await import('../lib/transaction/statutSansCompte');
        for (const p of plan) {
          const r = await poserStatutSansCompte({ libelle: p.libelle, statut, note, auteur: 'transaction:statut-negociateur (LOT BX)' });
          l.push(r.ok ? (r.id === null ? `${p.libelle} : déjà « ${statut} », rien n’est écrit` : `${p.libelle} : fiche n° ${r.id} posée (${statut}), journalisée`) : `⛔ ${p.libelle} : ${r.motif}`);
          if (!r.ok) code = 2;
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
