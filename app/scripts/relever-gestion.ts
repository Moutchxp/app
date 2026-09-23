/**
 * CLI `gestion:relever` — MODULE « GESTION », LOT 3. DEUX modes, UNE SEULE frontière d'écriture.
 *
 *   • DÉFAUT (sans --appliquer) = SIMULATION. La boîte est LUE (ouverture `readOnly`), tout est calculé — sens du
 *     message, gabarit d'objet, règles d'exclusion, compteurs — et RIEN n'est écrit : ni en base, ni sur le stockage
 *     objet, pas même la ligne du journal des passes (qui serait déjà une écriture). C'est le mode qui permet de
 *     regarder ce qu'une relève ferait AVANT de la laisser faire.
 *
 *   • --appliquer = VRAIE PASSE. Capture les messages non encore connus, applique les règles d'exclusion actives,
 *     dépose les pièces, et journalise la passe dans `gestion_releve_run`. Le plafond par passe vient de la
 *     configuration : au-delà, la passe s'arrête et la suivante REPREND où elle en était.
 *
 * Aucune boîte configurée → message clair et sortie 0 (ce n'est PAS une erreur — même convention que `demandes:relever`).
 * Une passe déjà en cours → message clair et sortie 0 (le verrou a fait son travail).
 *
 * LOT R — TROIS OPTIONS DE RAPATRIEMENT D'HISTORIQUE, toutes PONCTUELLES : aucune n'écrit de réglage, aucune n'est active
 * par défaut, et sans elles la commande se comporte EXACTEMENT comme avant (fenêtre `rattrapage_jours`, plafond de la
 * configuration, une seule passe).
 *   --depuis-origine   remonte à l'ORIGINE du dossier au lieu de `rattrapage_jours` ; la passe est journalisée « rattrapage »
 *   --plafond=N        plafond de CETTE passe seulement
 *   --boucler          enchaîne les passes jusqu'à épuisement (--pause=N secondes entre deux, 10 par défaut)
 * Exemple (rapatriement complet, reprenable à tout moment) :
 *   npm run gestion:relever -- --appliquer --depuis-origine --boucler --plafond=1000
 */
import '../lib/chargerEnv';
import { statfs } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import type { RapportCapture } from '../lib/gestion/capture';
import type { IssueReleve } from '../lib/gestion/releve';
import type { OptionsRattrapage } from '../lib/gestion/releveReelle';

/** Durée lisible : secondes en dessous d'une minute, minutes au-delà. PUR. */
export function duree(ms: number): string {
  if (ms < 1000) return `${ms} ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)} s`;
  return `${Math.floor(ms / 60_000)} min ${Math.round((ms % 60_000) / 1000)} s`;
}

/** Poids lisible. PUR. */
export function poids(octets: number): string {
  if (octets < 1024) return `${octets} o`;
  if (octets < 1024 * 1024) return `${Math.round(octets / 1024)} Ko`;
  return `${(octets / (1024 * 1024)).toFixed(1)} Mo`;
}

/**
 * LOT 3-quater — LE BLOC DE MESURE, c'est-à-dire ce qui manquait au diagnostic. Sans lui, « c'est lent » n'est qu'une
 * impression : on ne sait pas si un message coûte 200 ms ou 90 s, ni si la lenteur est partagée ou concentrée sur
 * quelques pièces lourdes. La MÉDIANE dit le régime ordinaire, le MAXIMUM dit le pire, et les cinq plus lents disent
 * s'il s'agit de gros messages ou d'un serveur qui bloque.
 * ⚠️ Jamais d'objet ni d'adresse : un tableau de diagnostic n'a aucune raison d'être nominatif. PUR.
 */
export function imprimerMesures(r: RapportCapture): string[] {
  if (r.vus === 0) return [];
  const l: string[] = [];
  l.push(`  durée de lecture            : ${duree(r.dureeTotaleMs)} au total · médiane ${duree(r.dureeMedianeMs)} · pire ${duree(r.dureeMaxMs)}`);
  l.push(`  volume lu                   : ${poids(r.octetsLus)}`);
  if (r.reconnexions > 0) l.push(`  reconnexions                : ${r.reconnexions}  (la passe a repris après coupure)`);
  if (r.lesPlusLents.length > 0) {
    l.push('  les plus lents (n° de message, taille, durée) :');
    for (const m of r.lesPlusLents) l.push(`      message ${String(m.uid).padStart(6, ' ')}  ${poids(m.octets).padStart(8, ' ')}  ${duree(m.ms)}`);
  }
  return l;
}

/** Mode demandé. PUR. */
export function lireAppliquer(argv: readonly string[]): boolean {
  return argv.includes('--appliquer');
}

// ══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
// LOT R — LE RAPATRIEMENT D'HISTORIQUE (opération PONCTUELLE, jamais un réglage)
//
// La relève ordinaire ne remonte qu'à `rattrapage_jours` (90 en base) : c'est voulu, et ce lot NE LE CHANGE PAS. Mais une
// boîte a un passé plus long que sa fenêtre, et l'importer une fois demande trois choses qu'une passe seule n'a pas :
// remonter à l'origine, enchaîner les passes (le plafond en borne chacune), et survivre à une nuit — coupure réseau,
// quota du fournisseur, disque qui se remplit. Tout est ici, dans la CLI, et RIEN dans le comportement par défaut.
// ══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════

/** Ce que la ligne de commande demande, au-delà du mode. PUR. */
export interface OptionsCli extends OptionsRattrapage {
  /** Enchaîner les passes jusqu'à ce qu'il ne reste plus rien à lire (ou qu'une raison d'arrêter survienne). */
  boucler: boolean;
  /** Pause entre deux passes réussies, en secondes. */
  pauseS: number;
}

/** Entier d'une option `--nom=42`. Absente, vide ou illisible → `defaut`. PUR. */
export function lireEntier(argv: readonly string[], nom: string, defaut: number): number {
  const brut = argv.find((a) => a.startsWith(`--${nom}=`))?.slice(nom.length + 3);
  const n = Number.parseInt(brut ?? '', 10);
  return Number.isFinite(n) && n > 0 ? n : defaut;
}

/** Pause par défaut entre deux passes : laisse respirer le serveur sans rallonger la nuit pour rien. */
export const PAUSE_DEFAUT_S = 10;

/** Options du rattrapage. Aucune n'est active par défaut : sans elles, la commande fait EXACTEMENT ce qu'elle faisait. PUR. */
export function lireOptions(argv: readonly string[]): OptionsCli {
  return {
    depuisOrigine: argv.includes('--depuis-origine'),
    plafond: lireEntier(argv, 'plafond', 0),
    boucler: argv.includes('--boucler'),
    pauseS: lireEntier(argv, 'pause', PAUSE_DEFAUT_S),
  };
}

/**
 * PLANCHER DE DISQUE : en dessous, on n'entame pas une passe de plus. Une pièce jointe se dépose sur le stockage objet,
 * qui vit sur le même disque que la base : un rapatriement d'historique est la seule opération du module capable de le
 * remplir. Mieux vaut un import inachevé et REPRENABLE qu'un disque plein, qui casse tout le reste de la machine.
 */
export const PLANCHER_DISQUE_OCTETS = 20 * 1024 ** 3;

/** Réglages de l'enchaînement. Constantes de la CLI : une opération ponctuelle n'a pas à peupler `gestion_config`. */
export interface ReglagesBoucle { pauseS: number; backoffBaseS: number; backoffMaxS: number; echecsMax: number }

/**
 * Attente après le `n`-ième échec CONSÉCUTIF (1 = le premier), en secondes. CROISSANTE par doublement, et PLAFONNÉE :
 * un fournisseur qui refuse pour cause de quota journalier ne rendra pas la main plus vite parce qu'on insiste — et
 * marteler une boîte qui refuse est le meilleur moyen de se faire fermer la porte plus durablement. PUR.
 */
export function attenteApresEchec(echecs: number, r: ReglagesBoucle): number {
  return Math.min(r.backoffBaseS * 2 ** Math.max(0, echecs - 1), r.backoffMaxS);
}

/** Ce que la boucle retient d'une passe à l'autre. PUR. */
export interface EtatBoucle {
  echecsConsecutifs: number;
  /** `resteInconnus` de la dernière passe ABOUTIE, ou `null` avant la première. Sert à détecter le surplace. */
  restePrecedent: number | null;
}

export type SuiteBoucle =
  | { action: 'continuer'; attendreS: number; motif: string }
  | { action: 'arreter'; motif: string };

/**
 * DÉCIDE de la suite après une passe. PUR — c'est le cœur d'un run de plusieurs heures, il doit se lire et se tester
 * sans boîte ni base. Quatre sorties, et chacune répond à une façon dont une nuit peut mal tourner :
 *   · plus rien d'inconnu → c'est FINI, on s'arrête (sans quoi la boucle tournerait pour rien jusqu'au matin) ;
 *   · SURPLACE (le reste ne diminue pas d'une passe à l'autre) → on s'arrête : quelque chose empêche d'avancer, et
 *     boucler sur place pendant huit heures ne le réparerait pas ;
 *   · échec → on RÉESSAIE, avec une attente croissante, jusqu'à un budget d'échecs CONSÉCUTIFS. Un échec isolé
 *     (coupure, quota) ne doit pas finir la nuit ; une panne durable ne doit pas la consumer ;
 *   · « occupe » / « inactif » → on s'arrête : ce ne sont pas des erreurs, mais rien ne les résoudra tout seul.
 */
export function suiteDeLaBoucle(issue: IssueReleve, etat: EtatBoucle, r: ReglagesBoucle): SuiteBoucle {
  if (issue.resultat === 'erreur') {
    const echecs = etat.echecsConsecutifs + 1;
    if (echecs >= r.echecsMax) return { action: 'arreter', motif: `${echecs} échecs consécutifs : on arrête plutôt que d’insister.` };
    const attendreS = attenteApresEchec(echecs, r);
    return { action: 'continuer', attendreS, motif: `échec ${echecs}/${r.echecsMax} — nouvelle tentative dans ${attendreS} s.` };
  }
  if (issue.resultat !== 'ok') return { action: 'arreter', motif: issue.raison };
  if (issue.rapport === null) return { action: 'arreter', motif: issue.raison };
  const reste = issue.rapport.resteInconnus;
  if (reste === 0) return { action: 'arreter', motif: 'rattrapage TERMINÉ : plus aucun message de la fenêtre n’est inconnu.' };
  if (etat.restePrecedent !== null && reste >= etat.restePrecedent) {
    return { action: 'arreter', motif: `surplace : ${reste} message(s) restants comme à la passe précédente — on arrête, une boucle sans progrès ne se répare pas toute seule.` };
  }
  return { action: 'continuer', attendreS: r.pauseS, motif: `${reste} message(s) encore jamais lus — passe suivante dans ${r.pauseS} s.` };
}

/** État de la boucle après une passe. Un succès REMET À ZÉRO le compteur d'échecs : seuls les échecs d'affilée comptent. PUR. */
export function etatSuivant(issue: IssueReleve, etat: EtatBoucle): EtatBoucle {
  if (issue.resultat === 'erreur') return { ...etat, echecsConsecutifs: etat.echecsConsecutifs + 1 };
  return { echecsConsecutifs: 0, restePrecedent: issue.rapport?.resteInconnus ?? etat.restePrecedent };
}

/** En-tête du rattrapage : ce qui est demandé, en toutes lettres, AVANT toute connexion. PUR. */
export function enTeteRattrapage(o: OptionsCli): string[] {
  if (!o.depuisOrigine && !o.boucler && (o.plafond ?? 0) === 0) return [];
  const l: string[] = ['  ── RAPATRIEMENT D’HISTORIQUE (opération ponctuelle — aucun réglage n’est modifié) ──'];
  if (o.depuisOrigine) l.push('     fenêtre : depuis l’ORIGINE du dossier (au lieu de rattrapage_jours en base)');
  if ((o.plafond ?? 0) > 0) l.push(`     plafond : ${o.plafond} message(s) pour CETTE passe (gestion_config n’est pas touchée)`);
  if (o.boucler) l.push(`     passes  : enchaînées jusqu’à épuisement, ${o.pauseS} s entre chacune`);
  return l;
}

/**
 * LOT 3-ter — EN-TÊTE, imprimé AVANT LA MOINDRE CONNEXION. Auparavant la CLI n'affichait rien tant que la passe n'était
 * pas finie : devant un terminal muet, « ça travaille » et « c'est bloqué » se ressemblaient exactement — d'où 25 minutes
 * d'attente avant un plantage. Le mode, lui, doit se lire AVANT que quoi que ce soit ne puisse écrire. PUR.
 */
export function enTeteMode(appliquer: boolean): string[] {
  return [
    '',
    `[gestion:relever] ${appliquer ? 'APPLIQUÉ (écritures réelles)' : 'SIMULATION (aucune écriture, nulle part)'}`,
    appliquer ? '  démarrage…' : '  démarrage… (ajouter --appliquer pour exécuter réellement)',
  ];
}

/**
 * Compte rendu d'une passe, ligne à ligne. PUR (aucun `console.log` ici) → testable. Le mode est dit EN TÊTE et en
 * toutes lettres : lire « SIMULATION » ou « APPLIQUÉ » ne doit jamais demander un effort.
 */
export function imprimerIssue(issue: IssueReleve, appliquer: boolean): string[] {
  const l: string[] = [];
  const mode = appliquer ? 'APPLIQUÉ (écritures réelles)' : 'SIMULATION (aucune écriture, nulle part)';
  l.push('');
  l.push(`[gestion:relever] ${mode}`);

  // LOT 3-ter — un ÉCHEC est annoncé comme tel, MAIS ses compteurs sont imprimés quand la passe avait déjà travaillé :
  //   ce qui a été capturé est acquis, et la passe suivante reprendra où celle-ci s'est arrêtée.
  if (issue.resultat === 'erreur') l.push(`  ⚠ ÉCHEC : ${issue.raison}`);

  if (issue.rapport === null) {
    if (issue.resultat !== 'erreur') l.push(`  rien à faire : ${issue.raison}`);
    l.push('');
    return l;
  }

  const r = issue.rapport;
  l.push(`  dossier                     : ${r.dossier}`);
  l.push(`  fenêtre (depuis)            : ${r.depuis}`);
  l.push(`  UID renvoyés par le serveur : ${r.uidsServeur}${r.plafondAtteint ? `  ⚠ PLAFOND ATTEINT → ${r.uidsServeur - r.vus} message(s) pour la passe suivante` : ''}`);
  l.push(`  déjà lus, écartés sans lecture : ${r.dejaVusEcartes}`);
  l.push(`  messages lus                : ${r.vus}`);
  l.push(`  déjà connus (ignorés)       : ${r.dejaConnus}`);
  l.push(`  illisibles (ignorés)        : ${r.echecsLecture}`);
  l.push(`  CAPTURÉS                    : ${r.captures}   (${r.recus} reçu(s), ${r.envoyes} envoyé(s))`);
  l.push(`  tenus hors de la file       : ${r.exclus}   (enregistrés, jamais supprimés)`);
  for (const [motif, n] of Object.entries(r.parRegle).sort((a, b) => b[1] - a[1])) {
    l.push(`      ${String(n).padStart(5, ' ')}  ${motif}`);
  }
  l.push(`  fils créés / fusionnés      : ${r.filsCrees} / ${r.filsFusionnes}`);
  l.push(`  pièces déposées / refusées  : ${r.piecesDeposees} / ${r.piecesNonDeposees}`);
  l.push(...imprimerMesures(r));
  l.push('');
  // LOT 3-quinquies — L'ÉTAT DU RATTRAPAGE, en une phrase. Sans elle, « plafond atteint » ne disait pas s'il restait dix
  //   messages ou cinq mille, et rien ne disait quand s'arrêter de relancer.
  l.push(r.resteInconnus > 0
    ? `  ▸ RATTRAPAGE EN COURS : ${r.resteInconnus} message(s) de la fenêtre encore JAMAIS lus. Relancez la même commande.`
    : '  ▸ RATTRAPAGE TERMINÉ : plus aucun message de la fenêtre n’est inconnu.');
  if (!appliquer) {
    l.push('');
    l.push('  ⓘ SIMULATION : rien n’a été écrit. Les fils et les pièces ne sont comptés qu’en mode appliqué.');
    l.push('    Les messages sont lus en version LÉGÈRE (en-têtes et structure) : aucun corps, aucune pièce téléchargés.');
    l.push('    Pour exécuter réellement : relancer avec --appliquer');
  }
  l.push('');
  return l;
}

/** Cœur du CLI, testable par injection. Renvoie le code de sortie. */
export async function executerCli(opts: {
  argv: readonly string[];
  relever: (appliquer: boolean, journal: (ligne: string) => void, options: OptionsRattrapage) => Promise<IssueReleve>;
  log: (s: string) => void;
  /** Attente entre deux passes. Injectée → les tests ne dorment jamais. */
  dormir?: (secondes: number) => Promise<void>;
  /** Octets libres sur le disque du stockage. Absente → aucune garde (comportement d'avant, passe unique). */
  espaceLibreOctets?: () => Promise<number>;
}): Promise<number> {
  const appliquer = lireAppliquer(opts.argv);
  const o = lireOptions(opts.argv);
  const reglages: ReglagesBoucle = { pauseS: o.pauseS, backoffBaseS: 60, backoffMaxS: 1800, echecsMax: 8 };
  const dormir = opts.dormir ?? ((s: number) => new Promise<void>((r) => setTimeout(r, s * 1000)));

  for (const ligne of enTeteMode(appliquer)) opts.log(ligne);      // AVANT la moindre connexion
  for (const ligne of enTeteRattrapage(o)) opts.log(ligne);

  let etat: EtatBoucle = { echecsConsecutifs: 0, restePrecedent: null };
  let code = 0;
  for (let passe = 1; ; passe += 1) {
    // GARDE DISQUE, avant d'entamer une passe : on refuse de COMMENCER ce qu'on ne pourrait pas finir. Un import
    //   inachevé se reprend ; un disque plein arrête la base, le stockage, et tout le reste de la machine.
    if (appliquer && opts.espaceLibreOctets) {
      const libre = await opts.espaceLibreOctets();
      if (libre < PLANCHER_DISQUE_OCTETS) {
        opts.log(`\n  ⛔ ARRÊT — garde disque : ${poids(libre)} libres, plancher ${poids(PLANCHER_DISQUE_OCTETS)}.`);
        opts.log('     Rien n’est perdu : les messages déjà capturés sont acquis, la reprise repart d’elle-même.');
        return 1;
      }
    }
    if (o.boucler) opts.log(`\n── passe ${passe} ──`);
    const issue = await opts.relever(appliquer, (l) => opts.log(`  ${l}`), { depuisOrigine: o.depuisOrigine, plafond: o.plafond });
    for (const ligne of imprimerIssue(issue, appliquer)) opts.log(ligne);
    code = issue.resultat === 'erreur' ? 1 : 0; // 'inactif' et 'occupe' ne sont PAS des erreurs
    if (!o.boucler) return code;

    const suite = suiteDeLaBoucle(issue, etat, reglages);
    etat = etatSuivant(issue, etat);
    opts.log(`  ▸ ${suite.motif}`);
    if (suite.action === 'arreter') return code;
    await dormir(suite.attendreS);
  }
}

/** Câblage RÉEL (import dynamique : garde imapflow/pg hors du graphe importé par les tests). */
async function main(): Promise<void> {
  const { relever } = await import('../lib/gestion/releveReelle');
  process.exitCode = await executerCli({
    argv: process.argv,
    relever,
    log: (s) => console.log(s),
    // `statfs` est une MESURE, jamais une écriture : on lit l'espace libre du disque où vivent base et stockage.
    espaceLibreOctets: async () => { const s = await statfs(process.cwd()); return Number(s.bavail) * Number(s.bsize); },
  });
}

// Point d'entrée : n'exécute `main()` que si le fichier est lancé DIRECTEMENT, jamais à l'import par un test.
const lanceDirect = process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;
if (lanceDirect) {
  void main()
    .catch((e) => { console.error('[gestion:relever] échec', e); process.exitCode = 1; })
    .finally(async () => { const { closePool } = await import('../lib/db/client'); await closePool(); });
}
