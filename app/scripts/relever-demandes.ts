/**
 * CLI `demandes:relever` — DEUX modes, UNE SEULE frontière d'écriture.
 *
 *   • DÉFAUT (sans --appliquer) = INSPECTION LECTURE SEULE. Lit la boîte (LECTURE STRICTE, jamais de modification) et imprime
 *     ce qui SERAIT retenu / rattaché, **sans AUCUNE écriture en base**. Sert à inspecter une boîte sans rien toucher, et à
 *     déboguer le filtre de pertinence (`--sans-filtre`). ⚠️ Ce mode n'est PAS une relève — il n'écrit jamais. Options :
 *     `--profil=entreprise|personne`, `--plafond=N`, `--sans-filtre`.
 *
 *   • --appliquer = VRAIE RELÈVE. Délègue à l'orchestrateur `executerReleveManuelle(depsReellesReleveAuto())` — EXACTEMENT le
 *     chemin du bouton « Relever la boîte » (route /relever) : versement GED, ligne `releve_run`, avancée du curseur, isolation
 *     d'erreur. La CLI n'est donc PAS un chemin d'écriture à elle : elle appelle le foyer unique et imprime son résultat.
 *     ⚠️ En --appliquer, profil / plafond / filtre viennent de la CONFIG de veille (l'orchestrateur les lit) → `--profil`,
 *     `--plafond` et `--sans-filtre` y sont REFUSÉS (jamais ignorés en silence). Pour les utiliser : lancer SANS --appliquer.
 *
 * Profil inactif (compte IMAP absent) → message clair + sortie 0 (pas une erreur). Même convention que `demandes:envoyer`.
 */
import '../lib/chargerEnv';
import { pathToFileURL } from 'node:url';
import type { ProfilBoite } from '../lib/veille/demandeReponseRepo';
import type { RapportReleve } from '../lib/veille/releveReponses';
import type { IssueReleveManuelle } from '../lib/veille/releveAuto';

const INFIXE: Record<ProfilBoite, string> = { entreprise: '', personne: 'PERSONNE_' };

/** Options réservées au mode INSPECTION : elles paramètrent une lecture, pas la vraie relève (dont la config vient de la veille). */
const OPTIONS_INSPECTION = ['--profil', '--plafond', '--sans-filtre'] as const;

/** Profil demandé (défaut 'entreprise'), ou `null` si la valeur est invalide. PUR. */
export function lireProfil(argv: string[]): ProfilBoite | null {
  const arg = argv.find((a) => a.startsWith('--profil='))?.split('=')[1] ?? 'entreprise';
  return arg === 'entreprise' || arg === 'personne' ? arg : null;
}

/** Plafond d'UID (>0, entier), ou `undefined`. PUR. */
export function lirePlafond(argv: string[]): number | undefined {
  const brut = argv.find((a) => a.startsWith('--plafond='))?.split('=')[1];
  if (brut === undefined) return undefined;
  const n = Number(brut);
  return Number.isInteger(n) && n > 0 ? n : undefined;
}

/** Les options d'INSPECTION effectivement présentes dans argv (avec ou sans `=`). PUR — pilote le refus en --appliquer. */
export function optionsInspectionPresentes(argv: string[]): string[] {
  return OPTIONS_INSPECTION.filter((o) => argv.some((a) => a === o || a.startsWith(`${o}=`)));
}

/** Rapport d'INSPECTION (lecture seule) — mêmes compteurs que la relève, mais AUCUNE écriture n'a eu lieu. */
function imprimerInspection(r: RapportReleve, log: (s: string) => void): void {
  log(`\n[demandes:relever] INSPECTION (lecture seule, aucune écriture) — profil « ${r.profil} »`);
  if (!r.connecte) {
    log('  aucune demande envoyée pour ce profil → pas de connexion à la boîte, rien à inspecter.');
    return;
  }
  log(`  fenêtre (depuis)            : ${r.depuis}`);
  log(`  domaines interrogés (serveur): ${r.domainesInterroges.join(', ') || '(aucun)'}`);
  log(`  UID renvoyés par domaine    : ${r.uidsServeur}${r.plafondAtteint ? '  ⚠ PLAFOND ATTEINT → seuls les plus récents' : ''}`);
  log(`  références interrogées / UID : ${r.referencesInterrogees} / ${r.uidsReferences}${r.plafondReferencesAtteint ? '  ⚠ PLAFOND RÉFÉRENCES ATTEINT' : ''}`);
  log(`  messages téléchargés (vus)  : ${r.vus}`);
  log(`  déjà connus (ignorés)       : ${r.dejaConnus}`);
  log(`  hors périmètre (ignorés)    : ${r.horsPerimetre}`);
  log(`  RETENUS                     : ${r.retenus}`);
  log(`    · rattachés / non rattachés : ${r.rattaches} / ${r.nonRattaches}`);
  const meth = Object.entries(r.parMethode).map(([m, n]) => `${m}=${n}`).join(' · ') || 'aucune';
  log(`    · par méthode               : ${meth}`);
  log(`    · rebonds détectés : ${r.rebondsDetectes} (rattachés ${r.rebondsRattaches}, étrangers ${r.rebondsEtrangers}, acheminements ${r.rebondsAppliques})`);
  log(`  SERAIT enregistré           : ${r.ecrites}`);
  log(`  accusés (a écrit, pas répondu) : ${r.accuses}`);
  log(`  liens captés (jamais suivis) : ${r.liensCaptes}`);
  log(`  pièces déposables / non     : ${r.piecesDeposees} / ${r.piecesNonDeposees}`);
  if (r.lignes.length > 0) {
    log('  détail :');
    for (const l of r.lignes) {
      const cible = l.demandeId === null ? '— (à rattacher)' : `demande ${l.demandeId}`;
      log(`    ${l.rebond ? '↩ REBOND ' : ''}${cible} [${l.methode}] ${l.deAdresse}  « ${(l.objet ?? '').slice(0, 60)} »`);
    }
  }
  log('\n  ⚠ INSPECTION : rien n\'a été écrit. La VRAIE relève (écriture) = « npm run demandes:relever -- --appliquer » (délègue à l\'orchestrateur) ou le bouton « Relever la boîte » de l\'interface.');
}

/** Résultat de la VRAIE relève déléguée à l'orchestrateur (écriture réelle : GED, run, curseur). */
function imprimerRelance(i: IssueReleveManuelle, log: (s: string) => void): void {
  if (i.resultat === 'inactif') { log(`[demandes:relever] ${i.raison} — rien à relever (ce n'est pas une erreur).`); return; }
  const etat = i.resultat === 'ok' ? 'RELÈVE APPLIQUÉE (écriture réelle via l\'orchestrateur)' : 'RELÈVE EN ÉCHEC';
  log(`\n[demandes:relever] ${etat}${i.runId !== null ? ` — run #${i.runId}` : ''}`);
  log(`  ${i.raison}`);
}

/** Dépendances injectables du CLI (I/O et effets sortis → cœur PUR et testable sans IMAP ni DB). */
export interface DepsCli {
  argv: string[];
  /** VRAIE relève : `executerReleveManuelle(depsReellesReleveAuto())` — le foyer unique d'écriture. */
  orchestrer: () => Promise<IssueReleveManuelle>;
  /** INSPECTION lecture seule : `releverBoite({ ..., appliquer: false })`. `null` = profil inactif (compte IMAP absent). */
  inspecter: (profil: ProfilBoite, plafond: number | undefined, sansFiltre: boolean) => Promise<RapportReleve | null>;
  log: (s: string) => void;
  erreur: (s: string) => void;
}

/**
 * Cœur du CLI — renvoie le CODE DE SORTIE (0 ok, 1 échec, 2 usage). Deux modes STRICTEMENT séparés :
 *  - `--appliquer` → délègue à l'orchestrateur (aucune écriture propre) ; REFUSE toute option d'inspection (jamais un drapeau
 *    silencieusement inopérant) ;
 *  - défaut → inspection lecture seule (`inspecter`). PUR : n'appelle QUE les deux dépendances injectées.
 */
export async function executerCli(deps: DepsCli): Promise<number> {
  const { argv, orchestrer, inspecter, log, erreur } = deps;

  if (argv.includes('--appliquer')) {
    const refusees = optionsInspectionPresentes(argv);
    if (refusees.length > 0) {
      for (const o of refusees) {
        erreur(`[demandes:relever] ${o} n'est PAS accepté avec --appliquer : la vraie relève délègue à l'orchestrateur, qui lit profil, plafond et filtre depuis la CONFIG de veille (jamais depuis la ligne de commande). Pour utiliser ${o}, relance SANS --appliquer (mode INSPECTION, lecture seule).`);
      }
      return 2; // usage : refus explicite, jamais un drapeau ignoré en silence
    }
    const issue = await orchestrer();
    imprimerRelance(issue, log);
    return issue.resultat === 'erreur' ? 1 : 0; // 'inactif' → 0 (convention)
  }

  // ── INSPECTION (défaut) — LECTURE SEULE, aucune écriture ──
  const profil = lireProfil(argv);
  if (profil === null) {
    erreur('[demandes:relever] profil invalide (attendu : entreprise | personne)');
    return 2;
  }
  const sansFiltre = argv.includes('--sans-filtre');
  if (sansFiltre) log('[demandes:relever] ⚠ --sans-filtre : filtre de pertinence DÉSACTIVÉ (inspection/débogage).');
  const rapport = await inspecter(profil, lirePlafond(argv), sansFiltre);
  if (rapport === null) {
    log(`[demandes:relever] profil « ${profil} » INACTIF : aucun compte IMAP configuré (variables SMTP_${INFIXE[profil]}* absentes). Rien à inspecter — ce n'est pas une erreur.`);
    return 0;
  }
  imprimerInspection(rapport, log);
  return 0;
}

/** Câblage RÉEL des dépendances (imports dynamiques : gardent imapflow/pg HORS du graphe importé par les tests). */
async function main(): Promise<void> {
  const { executerReleveManuelle, depsReellesReleveAuto } = await import('../lib/veille/releveAuto');
  const code = await executerCli({
    argv: process.argv,
    orchestrer: () => executerReleveManuelle(depsReellesReleveAuto()),
    inspecter: async (profil, plafond, sansFiltre) => {
      const { lireCompteImap } = await import('../lib/email');
      const compte = lireCompteImap(INFIXE[profil]);
      if (compte === null) return null; // profil inactif
      const { creerClientBoite } = await import('../lib/email/imap');
      const { releverBoite } = await import('../lib/veille/releveReponses');
      const client = creerClientBoite(compte);
      return releverBoite({ client, profil, plafond, appliquer: false, sansFiltre }); // INSPECTION : lecture seule
    },
    log: (s) => console.log(s),
    erreur: (s) => console.error(s),
  });
  process.exitCode = code;
}

// Point d'entrée : n'exécute `main()` que si le fichier est lancé DIRECTEMENT (`tsx …/relever-demandes.ts`), jamais à l'import
//   par un test (qui n'importe que le cœur PUR `executerCli`).
const lanceDirect = process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;
if (lanceDirect) {
  void main()
    .catch((e) => { console.error('[demandes:relever] échec', e); process.exitCode = 1; })
    .finally(async () => { const { closePool } = await import('../lib/db/client'); await closePool(); });
}
