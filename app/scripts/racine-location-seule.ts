/**
 * CLI `gestion:drive:racine-location-seule` — LA RACINE « Base de données location seule » DU DRIVE (Arno, 22/10/2026, mise en
 * production des migrations 403 et 404).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * Le dossier frère de « Base de données locative », dans le Drive partagé « GESTION LOCATIVE », qui reçoit les dossiers des biens
 * « location seule ». L'application le crée d'elle-même au premier besoin ; ce script permet de le créer À PART, en le voyant.
 *
 * 🔴 À BLANC PAR DÉFAUT : il lit le registre et le Drive (métadonnées et liste des dossiers voisins — AUCUNE écriture, ni au Drive
 *    ni en base) et dit ce qu'il ferait. `--reel` seulement crée le dossier (étiqueté, à côté de « Base de données locative ») et
 *    l'inscrit dans `gestion_drive_racine`. Rejouable : déjà inscrit → rien ; déjà présent avec l'étiquette → inscrit sans créer.
 * 🔴 REFUS : « Documents clients scannés » dans la chaîne des parents ; racine « Base de données locative » inconnue ; un dossier
 *    du même nom SANS l'étiquette existe déjà à côté (jamais de doublon : à trancher à la main).
 * 🔴 Le rapport va dans `.captures/racine-location-seule/` (ou `--rapport=`), jamais sur le Bureau.
 *
 * Usage :
 *   npm run gestion:drive:racine-location-seule                 (à blanc)
 *   npm run gestion:drive:racine-location-seule -- --reel       (crée et inscrit)
 *   … -- --rapport=/chemin/fichier-ou-dossier
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */
import '../lib/chargerEnv';
import { writeFileSync } from 'node:fs';
import { estPointEntree } from '../lib/scripts/pointEntree';
import { cheminRapport, optionLigne } from '../lib/ops/rapportScript';
import type { DiagnosticRacine } from '../lib/gestion/arbreStatutDriveRepo';

const P = '[gestion:drive:racine-location-seule]';
const NOM_SCRIPT = 'racine-location-seule';

/** Le texte du rapport. PUR. */
export function texteRapportRacine(o: { reel: boolean; base: string; quand: Date; diagnostic: DiagnosticRacine;
  issue?: { ok: true; id: string; geste: 'deja' | 'retrouvee' | 'cree' } | { ok: false; motif: string } }): string {
  const d = o.diagnostic;
  const lignes = [
    `RACINE « Base de données location seule » — ${o.reel ? 'RÉEL' : 'À BLANC (lectures seules : aucune écriture au Drive ni en base)'}`,
    `base : ${o.base} · ${o.quand.toISOString()}`, '',
  ];
  if (d.etat === 'deja') lignes.push(`DÉJÀ INSCRITE au registre : ${d.racineId} — rien à faire.`);
  else if (d.etat === 'refus') lignes.push(`⛔ REFUS : ${d.motif}`, ...(d.chaine.length ? [`chaîne lue : ${d.chaine.join(' ‹ ')}`] : []));
  else {
    lignes.push(`à côté de : « ${d.locative.nom} » (${d.locative.id})`, `dans : « ${d.parent.nom ?? '?'} » (${d.parent.id})`, `chaîne lue : ${d.chaine.join(' ‹ ')}`,
      d.etat === 'retrouvee' ? `un dossier ÉTIQUETÉ existe déjà (${d.retrouvee}) : ${o.reel ? 'il est' : 'il serait'} inscrit, sans rien créer.`
        : `aucun dossier « Base de données location seule » à côté : ${o.reel ? 'il est' : 'il serait'} CRÉÉ puis inscrit.`);
  }
  if (o.reel && o.issue !== undefined) {
    lignes.push('', o.issue.ok ? `✓ ${o.issue.geste === 'cree' ? 'CRÉÉE' : o.issue.geste === 'retrouvee' ? 'RETROUVÉE' : 'DÉJÀ'} et inscrite : ${o.issue.id}` : `✗ ÉCHEC : ${o.issue.motif}`);
  }
  return `${lignes.join('\n')}\n`;
}

async function principal(): Promise<void> {
  const argv = process.argv.slice(2);
  const reel = argv.includes('--reel');
  const { diagnosticRacineLocationSeule, creerRacineLocationSeule, arbreDisponible } = await import('../lib/gestion/arbreStatutDriveRepo');
  const { closePool } = await import('../lib/db/client');
  const base = (process.env.DATABASE_URL ?? '').split('/').pop()?.split('?')[0] ?? '?';
  try {
    if (!(await arbreDisponible())) { console.error(`${P} migration 404 non appliquée : rien à faire.`); process.exitCode = 2; return; }
    const diagnostic = await diagnosticRacineLocationSeule();
    const issue = reel && diagnostic.etat !== 'refus' ? await creerRacineLocationSeule(`script ${NOM_SCRIPT}`) : undefined;
    const texte = texteRapportRacine({ reel, base, quand: new Date(), diagnostic, issue });
    const chemin = cheminRapport({ nomScript: NOM_SCRIPT, demande: optionLigne(argv, 'rapport') });
    writeFileSync(chemin, texte, 'utf8');
    console.log(texte);
    console.log(`${P} rapport : ${chemin}`);
    if (diagnostic.etat === 'refus' || (issue !== undefined && !issue.ok)) process.exitCode = 1;
  } finally {
    await closePool();
  }
}

if (estPointEntree(import.meta.url)) {
  principal().catch((e: unknown) => { console.error(P, e); process.exit(1); });
}
