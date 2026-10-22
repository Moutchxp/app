/**
 * CLI `location:importer-suivi-2026` — L'IMPORT DU SUIVI MENSUEL D'ARNO (CA_JBP_2026.xlsx) DANS « OUTILS DE SUIVI » (Arno, 22/10/2026).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * Chaque ligne du fichier devient une ligne d'activité (migration 406) : rapprochée de son bail quand le score de confiance le
 * permet (≥ 0,80), sinon importée « historique non rattaché » (une douteuse garde le bail proposé en commentaire). Rien n'est
 * perdu, rien n'est doublé : clé d'import par ligne (rejouable), un bail déjà suivi dans l'outil n'est pas recompté. Les
 * avenants entrent comme « avenant ». Les apporteurs nommés dans le fichier rejoignent le référentiel ; la rétrocession d'août
 * aussi. Puis le CONTRÔLE : chaque mois recalculé par le tableau de bord face aux totaux du fichier, au centime.
 *
 * 🔴 À BLANC PAR DÉFAUT : il LIT et écrit son rapport ; aucune écriture en base. `--reel` écrit (une transaction, ajout seul),
 *    puis relit la base pour refaire le contrôle sur ce qui y est vraiment.
 * 🔴 Le rapport va dans `.captures/importer-suivi-location-2026/` (jamais sur le Bureau).
 *
 * Usage :
 *   npm run location:importer-suivi-2026                                   (à blanc, fichier .captures/suivi-location/CA_JBP_2026.xlsx)
 *   npm run location:importer-suivi-2026 -- --reel                         (écrit)
 *   … -- --fichier=/chemin/CA_JBP_2026.xlsx · --rapport=/chemin/fichier-ou-dossier
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */
import '../lib/chargerEnv';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import ExcelJS from 'exceljs';
import { estPointEntree } from '../lib/scripts/pointEntree';
import { cheminRapport, optionLigne, RACINE_PROJET } from '../lib/ops/rapportScript';
import { depuisExcelJs } from '../lib/location/suivi/classeurExcelJs';
import { lireClasseur, type MoisExcel } from '../lib/location/suivi/lectureExcel';
import { rapprocher } from '../lib/location/suivi/rapprochementImport';
import { retrocessionDuMois, type ApporteurLu } from '../lib/location/suivi/repriseExcel';
import { controler, planifier, texteRapportImport, versActivite, type LignePlan } from '../lib/location/suivi/planImport';
import type { ActiviteCalcul } from '../lib/location/suivi/tableauBord';

const P = '[location:importer-suivi-2026]';
const NOM_SCRIPT = 'importer-suivi-location-2026';
const ANNEE = 2026;
const REGLE_FICHIER = [{ depuis: `${ANNEE}-01-01`, tauxNegociateur: 0.15, primeLogement: 150, primeParking: 15 }];
const norm = (t: string): string => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

/** Le taux le plus fréquent de chaque apporteur dans le fichier (`=E8*10%`) : son barème au 1er janvier. PUR. */
export function tauxParApporteur(plan: readonly LignePlan[]): Map<string, number> {
  const comptes = new Map<string, Map<number, number>>();
  for (const p of plan) {
    if (p.apporteur === null || p.ligne.tauxCommission === null) continue;
    const cle = p.apporteur.nom.trim().toLowerCase();
    const m = comptes.get(cle) ?? new Map<number, number>();
    m.set(p.ligne.tauxCommission, (m.get(p.ligne.tauxCommission) ?? 0) + 1);
    comptes.set(cle, m);
  }
  return new Map([...comptes].map(([cle, m]) => [cle, [...m].sort((a, b) => b[1] - a[1] || b[0] - a[0])[0][0]]));
}

async function principal(): Promise<void> {
  const argv = process.argv.slice(2);
  const reel = argv.includes('--reel');
  const fichier = optionLigne(argv, 'fichier') ?? join(RACINE_PROJET, '.captures/suivi-location/CA_JBP_2026.xlsx');
  const { closePool } = await import('../lib/db/client');
  const repo = await import('../lib/location/suivi/importSuiviRepo');
  const base = (process.env.DATABASE_URL ?? '').split('/').pop()?.split('?')[0] ?? '?';
  try {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(fichier);
    const mois: MoisExcel[] = lireClasseur(depuisExcelJs(wb as never), ANNEE);
    const disponible = await repo.importDisponible();
    if (reel && !disponible) throw new Error('migration 406 absente : rien ne peut être écrit (lancer à blanc pour voir le plan et le contrôle).');
    const [candidats, comptes, existants] = await Promise.all([repo.lireCandidats(), repo.lireComptes(), repo.lireExistants()]);
    // Le négociateur : l'en-tête de l'onglet (« Jean-Baptiste ») → le compte actif de même prénom, s'il est unique.
    const entete = mois.find((m) => m.negociateur !== '')?.negociateur ?? '';
    const memePrenom = comptes.filter((c) => norm(c.prenom) === norm(entete));
    const negociateur = memePrenom.length === 1 ? { id: memePrenom[0].id, libelle: memePrenom[0].libelle } : { id: null, libelle: entete };
    const plan = planifier(mois, rapprocher(mois.flatMap((m) => m.lignes), candidats),
      { collaborateurs: comptes.map((c) => c.libelle), dejaImportees: existants.dejaImportees, bauxSuivis: existants.bauxSuivis });
    const retrocessions = mois.map((m) => retrocessionDuMois(m, { negociateurId: negociateur.id, negociateurLibelle: negociateur.libelle })).filter((r) => r !== null);
    const apporteursACreer = [...new Map(plan.filter((p) => p.apporteur !== null && !existants.apporteurs.has(p.apporteur.nom.trim().toLowerCase()))
      .map((p) => [p.apporteur!.nom.trim().toLowerCase(), p.apporteur!] as [string, ApporteurLu])).values()];
    // Le contrôle porte sur ce qui sera EN BASE : les lignes importées (ou déjà importées), pas celles d'un bail déjà suivi.
    let activites: ActiviteCalcul[] = plan.filter((p) => p.etat !== 'deja_suivie').map((p) => versActivite(p, negociateur));
    let bilan = '';
    if (reel) {
      const b = await repo.ecrireImport({ plan, annee: ANNEE, negociateur, tauxApporteurs: tauxParApporteur(plan), retrocessions, auteur: `import ${NOM_SCRIPT}` });
      bilan = `ÉCRIT : ${b.activites} ligne(s) d'activité, ${b.apporteurs} apporteur(s), ${b.retrocessions} rétrocession(s). Contrôle refait sur la base relue.`;
      const relu = await repo.relireImport();
      const parCle = new Map(plan.map((p) => [p.importCle, p]));
      activites = relu.map((r) => ({ ...versActivite(parCle.get(r.cle)!, negociateur), type: r.type as ActiviteCalcul['type'], dateSignature: r.date,
        honoProprietaireHt: r.hp, honoLocataireHt: r.hl, primeSaisie: r.prime, commissionSaisie: r.commission, avecGestion: r.avec, apporteurTaux: r.taux }));
    }
    const controle = controler(mois, activites, REGLE_FICHIER, retrocessions);
    const texte = [texteRapportImport({ reel, base, fichier, plan, mois, controle, negociateur, apporteursACreer, retrocessions, disponible }), bilan].join('\n');
    const chemin = cheminRapport({ nomScript: NOM_SCRIPT, demande: optionLigne(argv, 'rapport') });
    writeFileSync(chemin, texte, 'utf8');
    console.log(texte);
    console.log(`${P} rapport : ${chemin}`);
    if (!controle.every((c) => c.auCentime)) process.exitCode = 2;
  } finally {
    await closePool();
  }
}

if (estPointEntree(import.meta.url)) {
  principal().catch((e) => { console.error(`${P} échec :`, e instanceof Error ? e.message : e); process.exit(1); });
}
