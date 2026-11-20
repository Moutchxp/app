/**
 * ══ 🔴🔴 UNIFIER LES ADRESSES DU STOCK : UNE SEULE ADRESSE OFFICIELLE PAR ADRESSE RÉELLE (Arno, 20/11/2026, « Adresse officielle BAN », lot 5) ════════
 *
 *   DATABASE_URL=postgresql://localhost:5432/svav_recette npx tsx app/scripts/adresses-officielles-unifier.ts
 *       → « --essai » (par défaut) : ce que l'unification ferait, SANS RIEN ÉCRIRE (connexion en lecture seule) ; rapport dans
 *         `.captures/adresse-officielle-ban/essai-unification-AAAA-MM-JJ-HHMM/` (`resume.txt`, `rapport.html`, `plan.json`) ;
 *   … --appliquer --plan=<plan.json de l'essai validé>
 *       → relit le stock, refait le plan, et N'ÉCRIT RIEN s'il diffère de celui de l'essai ; sinon l'applique en UNE transaction, journalisée et tracée
 *         (migration 508) ; rend le numéro de la passe ;
 *   … --annuler=<numéro de passe>
 *       → annule la passe (valeurs d'avant reprises, rapprochements fermés, ajouts retirés) en UNE transaction ;
 *   … --epreuve-annulation --plan=<plan.json>
 *       → l'épreuve « appliquer → annuler → état identique » dans UNE transaction, ANNULÉE à la fin (ROLLBACK) : rien n'est écrit.
 *
 * 🔴 GARDE : appliquer, annuler et l'épreuve n'acceptent que `svav_recette` (vérifiée hors et DANS la transaction). La production : lot 8, décision d'Arno.
 */
const ECRIT = ['--appliquer', '--annuler', '--epreuve-annulation'].some((o) => process.argv.some((a) => a === o || a.startsWith(`${o}=`)));
if (!ECRIT) process.env.PGOPTIONS = `${process.env.PGOPTIONS ?? ''} -c default_transaction_read_only=on`.trim();

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { query, withTransaction, type RequeteTx } from '../lib/db/client';
import { TABLES_COMPTEES, compterTables } from '../lib/adresse/essaiStockRepo';
import { htmlUnification, planUnification, texteResumeUnification } from '../lib/adresse/unificationStock';
import { lireEntreeUnification, unificationDuStock } from '../lib/adresse/unificationStockRepo';
import { annulerUnification, appliquerUnification, etatUnification, RefusUnification } from '../lib/adresse/unificationApplicationRepo';
import { cheminRapport, optionLigne, RACINE_PROJET } from '../lib/ops/rapportScript';
import type { Auteur } from '../lib/gestion/gestes';

const AUTEUR: Auteur = { id: null, libelle: 'unification des adresses officielles (lot 5)' };
const RECETTE = 'svav_recette';

async function garde(q: RequeteTx | typeof query = query): Promise<void> {
  const { rows: [b] } = await q<{ b: string }>('SELECT current_database() AS b');
  if (b?.b !== RECETTE) throw new RefusUnification(`GARDE : la base est « ${b?.b ?? '?'} », pas ${RECETTE}. Rien n’est écrit.`);
}

/** Le plan relu à l'instant, et la comparaison avec celui de l'essai validé (le fichier) : identiques, ou rien n'est fait. */
async function planIdentique(fichier: string) {
  const attendu = JSON.stringify(JSON.parse(readFileSync(fichier, 'utf8')));
  const entree = await lireEntreeUnification();
  const plan = planUnification(entree);
  if (JSON.stringify(plan) !== attendu) {
    throw new RefusUnification(`Le plan relu à l’instant DIFFÈRE de celui de l’essai (${fichier}) : le stock a changé depuis. Relancez l’essai et faites-le valider. Rien n’est écrit.`);
  }
  return { plan, entree };
}

async function main(): Promise<string[]> {
  const fichier = optionLigne(process.argv, 'plan');
  const annuler = optionLigne(process.argv, 'annuler');
  if (process.argv.includes('--appliquer')) {
    if (fichier === null) throw new RefusUnification('Indiquez le plan validé : --plan=<chemin du plan.json de l’essai>. Rien n’est écrit.');
    await garde();
    const { plan, entree } = await planIdentique(fichier);
    const avant = await compterTables();
    const issue = await withTransaction(async (q) => { await garde(q); return appliquerUnification(q, plan, entree, RECETTE, AUTEUR); });
    const apres = await compterTables();
    return [`APPLIQUÉ sur ${RECETTE} — passe n° ${issue.operationId}`, JSON.stringify(issue),
      ...TABLES_COMPTEES.map((t) => `  ${t} : ${avant[t] ?? 'absente'} → ${apres[t] ?? 'absente'}`)];
  }
  if (annuler !== null) {
    await garde();
    const avant = await compterTables();
    const issue = await withTransaction(async (q) => { await garde(q); return annulerUnification(q, Number(annuler), AUTEUR); });
    const apres = await compterTables();
    return [`ANNULÉE sur ${RECETTE} — passe n° ${issue.operationId}`, JSON.stringify(issue), ...TABLES_COMPTEES.map((t) => `  ${t} : ${avant[t] ?? 'absente'} → ${apres[t] ?? 'absente'}`)];
  }
  if (process.argv.includes('--epreuve-annulation')) {
    if (fichier === null) throw new RefusUnification('Indiquez le plan : --plan=<chemin du plan.json de l’essai>.');
    await garde();
    const { plan, entree } = await planIdentique(fichier);
    const lignes: string[] = [];
    const FIN = new Error('fin de l’épreuve : tout est annulé (ROLLBACK)');
    try {
      await withTransaction(async (q) => {
        await garde(q);
        const e0 = await etatUnification(q);
        const a = await appliquerUnification(q, plan, entree, RECETTE, AUTEUR);
        const e1 = await etatUnification(q);
        const n = await annulerUnification(q, a.operationId, AUTEUR);
        const e2 = await etatUnification(q);
        lignes.push(`ÉPREUVE sur ${RECETTE}, dans une transaction annulée à la fin (rien n’est écrit)`,
          `appliquer : ${JSON.stringify(a)}`, `annuler : ${JSON.stringify(n)}`,
          `état après appliquer ${e1 === e0 ? 'IDENTIQUE (rien n’a changé ?)' : 'différent de l’avant (attendu)'} ; état après annuler ${e2 === e0 ? 'IDENTIQUE à l’avant ✅' : 'DIFFÉRENT de l’avant ❌'}`);
        throw FIN;
      });
    } catch (e) { if (e !== FIN) throw e; }
    return lignes;
  }
  // ── l'essai (par défaut), en lecture seule
  const e = await unificationDuStock();
  if (!e.ok) throw new RefusUnification(e.motif);
  const maintenant = new Date();
  const horo = maintenant.toLocaleString('sv-SE', { timeZone: 'Europe/Paris' }).replace(' ', '-').replace(/:/g, '').slice(0, 15);
  const dossier = optionLigne(process.argv, 'dossier') ?? join(RACINE_PROJET, '.captures', 'adresse-officielle-ban', `essai-unification-${horo}`);
  mkdirSync(dossier, { recursive: true });
  const entete = [
    `Base : ${e.base} — ESSAI (aucune écriture : connexion en lecture seule) — ${maintenant.toLocaleString('fr-FR', { timeZone: 'Europe/Paris' })}`,
    `Preuve « rien n’est écrit » : ${e.intact ? 'tables identiques avant et après' : '⚠️ UNE TABLE A CHANGÉ PENDANT L’ESSAI'} — `
      + TABLES_COMPTEES.map((t) => `${t} ${e.avant[t] ?? 'absente'}→${e.apres[t] ?? 'absente'}`).join(', '),
  ];
  writeFileSync(join(dossier, 'resume.txt'), `${texteResumeUnification(e.plan, entete)}\n`);
  writeFileSync(join(dossier, 'rapport.html'), htmlUnification(e.plan, entete));
  writeFileSync(join(dossier, 'plan.json'), JSON.stringify(e.plan, null, 1));
  return [texteResumeUnification(e.plan, entete).split('\nIMMEUBLES QUI CHANGENT')[0], `\nRapport : ${dossier}`];
}

void main().then((lignes) => {
  console.log(lignes.join('\n'));
  if (ECRIT) {
    const chemin = cheminRapport({ nomScript: 'adresses-officielles-unifier', prefixe: process.argv.includes('--appliquer') ? 'applique' : process.argv.includes('--epreuve-annulation') ? 'epreuve' : 'annule' });
    writeFileSync(chemin, `${lignes.join('\n')}\n`); console.log(`Rapport : ${chemin}`);
  }
  process.exit(0);
}, (e) => { console.error(e instanceof RefusUnification ? e.message : e); process.exit(e instanceof RefusUnification ? 2 : 1); });
