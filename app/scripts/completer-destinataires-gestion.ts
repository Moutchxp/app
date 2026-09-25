/**
 * CLI `gestion:completer-destinataires` — MODULE « GESTION », LOT 5-DEST.
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * CE QU'ELLE FAIT, ET RIEN D'AUTRE. Les messages capturés AVANT le lot 5-0 portent `dest_a IS NULL` — « jamais
 * analysé ». Sur ceux-là, « Répondre à tous » n'écrit qu'à l'expéditeur. Cette commande relit leurs quatre lignes
 * d'en-tête `To` / `Cc` / `Bcc` / `Reply-To` et remplit les colonnes correspondantes. Elle ne touche à rien d'autre.
 *
 * 🔴 C'EST UNE OPÉRATION PONCTUELLE, PAS UN RÉGLAGE — comme le rapatriement du lot R. Aucune valeur n'est écrite dans
 * `gestion_config`, aucune règle n'est modifiée, et la relève de tous les jours se comporte exactement comme avant.
 *
 * DEUX MODES, UNE SEULE FRONTIÈRE D'ÉCRITURE :
 *   • DÉFAUT (sans --appliquer) = SIMULATION. La boîte est LUE, tout est calculé, et RIEN n'est écrit : ni les
 *     colonnes, ni la ligne de journal. C'est le mode qui permet de regarder ce qui serait écrit AVANT de le laisser
 *     écrire ;
 *   • --appliquer = VRAIE PASSE.
 *
 * OPTIONS :
 *   --plafond=N   lignes traitées par CETTE passe (200 par défaut)
 *   --boucler     enchaîne les passes jusqu'à épuisement (--pause=N secondes entre deux, 10 par défaut)
 *   --muettes=N   arrêt après N passes MUETTES d'affilée (2 par défaut) — le serveur ne sert plus rien
 * Exemple (complétion complète, reprenable à tout moment) :
 *   npm run gestion:completer-destinataires -- --appliquer --boucler --plafond=500
 *
 * 🔒 CE QU'ELLE NE FAIT JAMAIS : télécharger un corps ou une pièce jointe, poser un drapeau, déplacer ou supprimer quoi
 * que ce soit dans la boîte (dossier ouvert en EXAMINE), écraser une valeur déjà analysée (`dest_a IS NULL` est porté
 * dans le WHERE de l'UPDATE), envoyer un message.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */
import '../lib/chargerEnv';
import { pathToFileURL } from 'node:url';
import type { IssueCompletion, RapportCompletion } from '../lib/gestion/completion';
import type { OptionsCompletion } from '../lib/gestion/completionPasse';
// Les DÉCISIONS DE BOUCLE viennent de la relève : attente croissante, budget d'échecs, message d'arrêt sur passe
//   muette. Ce sont les mêmes règles, éprouvées les nuits des 23 et 24/09/2026 — les réécrire ici créerait une
//   seconde vérité qui divergerait au premier réglage.
import {
  attenteApresEchec, lireAppliquer, lireEntier, MOTIF_ARRET_MUET, MUETTES_MAX_DEFAUT, PAUSE_DEFAUT_S,
  type ReglagesBoucle,
} from './relever-gestion';

/** Plafond par défaut d'une passe. Assez pour avancer vite, assez peu pour qu'une coupure ne coûte presque rien. */
export const PLAFOND_DEFAUT = 200;

/** Ce que la ligne de commande demande, au-delà du mode. PUR. */
export interface OptionsCli extends OptionsCompletion {
  boucler: boolean;
  pauseS: number;
  muettesMax: number;
}

/** PUR. */
export function lireOptions(argv: readonly string[]): OptionsCli {
  return {
    plafond: lireEntier(argv, 'plafond', PLAFOND_DEFAUT),
    boucler: argv.includes('--boucler'),
    pauseS: lireEntier(argv, 'pause', PAUSE_DEFAUT_S),
    muettesMax: lireEntier(argv, 'muettes', MUETTES_MAX_DEFAUT),
  };
}

/** Ce que la boucle retient d'une passe à l'autre. PUR. */
export interface EtatBoucle {
  echecsConsecutifs: number;
  muettesConsecutives: number;
  /** `resteNull` de la dernière passe aboutie, ou `null` avant la première. Sert à détecter le surplace. */
  restePrecedent: number | null;
}

export const ETAT_INITIAL: EtatBoucle = { echecsConsecutifs: 0, muettesConsecutives: 0, restePrecedent: null };

export type SuiteBoucle =
  | { action: 'continuer'; attendreS: number; motif: string }
  | { action: 'arreter'; motif: string; codeSortie?: number };

/**
 * Une passe où le serveur n'a servi AUCUN en-tête, alors qu'il y avait des lignes à traiter. Même définition que la
 * relève, et pour la même raison : Gmail ne dit rien quand il atteint sa limite — il sert du vide. PUR.
 */
export function passeMuette(issue: IssueCompletion): boolean {
  const r = issue.rapport;
  // ⚠️ `demandes`, jamais `lus` : une passe entièrement faite de Message-ID ambigus ne demande aucun en-tête et
  //   n'apprend donc rien sur l'état du serveur. Voir `passeMuette` dans `completion.ts`, source unique de la règle.
  return r !== null && r.demandes > 0 && r.entetesObtenus === 0;
}

/**
 * DÉCIDE de la suite après une passe. PUR — c'est le cœur d'un run de plusieurs heures, il doit se lire et se tester
 * sans boîte ni base. Quatre sorties, chacune pour une façon dont l'opération peut mal tourner ; ce sont exactement
 * celles de la relève, parce que ce sont les mêmes pannes.
 */
export function suiteDeLaBoucle(issue: IssueCompletion, etat: EtatBoucle, r: ReglagesBoucle): SuiteBoucle {
  // LA PASSE MUETTE D'ABORD, ET SUR SON PROPRE BUDGET : insister ne fait pas revenir un quota, seul le temps le fait.
  if (passeMuette(issue)) {
    const muettes = etat.muettesConsecutives + 1;
    if (muettes >= r.muettesMax) {
      return {
        action: 'arreter', codeSortie: 1,
        motif: `${MOTIF_ARRET_MUET} (${muettes} passes muettes d’affilée : ${issue.rapport?.demandes ?? 0} en-têtes demandés, aucun servi.)`,
      };
    }
    const attendreS = attenteApresEchec(muettes, r);
    return {
      action: 'continuer', attendreS,
      motif: `passe muette ${muettes}/${r.muettesMax} (aucun en-tête servi) — nouvelle tentative dans ${attendreS} s.`,
    };
  }
  if (issue.resultat === 'erreur') {
    const echecs = etat.echecsConsecutifs + 1;
    if (echecs >= r.echecsMax) {
      return { action: 'arreter', codeSortie: 1, motif: `${echecs} échecs consécutifs : on arrête plutôt que d’insister.` };
    }
    const attendreS = attenteApresEchec(echecs, r);
    return { action: 'continuer', attendreS, motif: `échec ${echecs}/${r.echecsMax} — nouvelle tentative dans ${attendreS} s.` };
  }
  if (issue.resultat !== 'ok' || issue.rapport === null) return { action: 'arreter', motif: issue.raison };

  const reste = issue.rapport.resteNull;
  if (reste === 0) return { action: 'arreter', motif: 'COMPLÉTION TERMINÉE : plus aucun message sans destinataires analysés.' };
  // SURPLACE : le reste ne diminue pas. Il reste des lignes que cette commande ne sait pas compléter (introuvables,
  //   Message-ID ambigus) : boucler dessus jusqu'au matin ne les trouverait pas davantage.
  if (etat.restePrecedent !== null && reste >= etat.restePrecedent) {
    return {
      action: 'arreter',
      motif: `surplace : ${reste} message(s) restants comme à la passe précédente — ceux-là ne sont pas complétables (introuvables ou Message-ID ambigus).`,
    };
  }
  return { action: 'continuer', attendreS: r.pauseS, motif: `${reste} message(s) encore à compléter — passe suivante dans ${r.pauseS} s.` };
}

/** État après une passe. Une passe qui AVANCE remet les deux compteurs d'incident à zéro. PUR. */
export function etatSuivant(issue: IssueCompletion, etat: EtatBoucle): EtatBoucle {
  if (passeMuette(issue)) return { ...etat, muettesConsecutives: etat.muettesConsecutives + 1 };
  if (issue.resultat === 'erreur') return { ...etat, echecsConsecutifs: etat.echecsConsecutifs + 1 };
  return { echecsConsecutifs: 0, muettesConsecutives: 0, restePrecedent: issue.rapport?.resteNull ?? etat.restePrecedent };
}

/** En-tête, imprimé AVANT LA MOINDRE CONNEXION : devant un terminal muet, « ça travaille » et « c'est bloqué » se ressemblent. PUR. */
export function enTeteMode(appliquer: boolean, o: OptionsCli): string[] {
  return [
    '',
    `[gestion:completer-destinataires] ${appliquer ? 'APPLIQUÉ (écritures réelles)' : 'SIMULATION (aucune écriture, nulle part)'}`,
    '  ── OPÉRATION PONCTUELLE : aucun réglage n’est modifié, la relève de tous les jours ne change pas ──',
    `     plafond : ${o.plafond} message(s) par passe${o.boucler ? `, passes enchaînées (${o.pauseS} s entre chacune)` : ''}`,
    '     lecture : en-têtes To / Cc / Cci / Répondre-à SEULEMENT — aucun corps, aucune pièce, aucun drapeau posé',
    appliquer ? '  démarrage…' : '  démarrage… (ajouter --appliquer pour exécuter réellement)',
  ];
}

/** Compte rendu d'une passe, ligne à ligne. PUR (aucun `console.log` ici) → testable. */
export function imprimerIssue(issue: IssueCompletion, appliquer: boolean): string[] {
  const l: string[] = [''];
  if (issue.resultat === 'erreur') l.push(`  ⚠ ÉCHEC : ${issue.raison}`);
  if (issue.rapport === null) {
    if (issue.resultat !== 'erreur') l.push(`  rien à faire : ${issue.raison}`);
    l.push('');
    return l;
  }
  const r: RapportCompletion = issue.rapport;
  l.push(`  messages à compléter lus      : ${r.lus}`);
  l.push(`  en-têtes demandés / servis    : ${r.demandes} / ${r.entetesObtenus}`);
  l.push(`  ${appliquer ? 'COMPLÉTÉS' : 'SERAIENT COMPLÉTÉS'}${appliquer ? '                    ' : '            '}: ${r.completes}`);
  if (r.dejaFaits > 0) l.push(`  déjà faits par une autre passe: ${r.dejaFaits}`);
  if (r.introuvables > 0) l.push(`  introuvables dans la boîte    : ${r.introuvables}   (laissés « jamais analysé »)`);
  if (r.ambigus > 0) l.push(`  Message-ID ambigus            : ${r.ambigus}   (plusieurs messages répondent — on ne choisit pas)`);
  l.push(`  reste à compléter en base     : ${r.resteNull}`);
  if (r.exemples.length > 0) {
    l.push('  exemples (adresses tronquées) :');
    for (const e of r.exemples) l.push(`      ${e}`);
  }
  if (!appliquer) {
    l.push('');
    l.push('  ⓘ SIMULATION : rien n’a été écrit. Pour exécuter réellement : relancer avec --appliquer');
  }
  l.push('');
  return l;
}

/** Cœur du CLI, testable par injection. Renvoie le code de sortie. */
export async function executerCli(opts: {
  argv: readonly string[];
  completer: (appliquer: boolean, journal: (ligne: string) => void, options: OptionsCompletion) => Promise<IssueCompletion>;
  log: (s: string) => void;
  /** Attente entre deux passes. Injectée → les tests ne dorment jamais. */
  dormir?: (secondes: number) => Promise<void>;
}): Promise<number> {
  const appliquer = lireAppliquer(opts.argv);
  const o = lireOptions(opts.argv);
  const reglages: ReglagesBoucle = {
    pauseS: o.pauseS, backoffBaseS: 60, backoffMaxS: 1800, echecsMax: 8, muettesMax: o.muettesMax,
  };
  const dormir = opts.dormir ?? ((s: number) => new Promise<void>((r) => setTimeout(r, s * 1000)));

  for (const ligne of enTeteMode(appliquer, o)) opts.log(ligne);

  let etat: EtatBoucle = { ...ETAT_INITIAL };
  let code = 0;
  for (let passe = 1; ; passe += 1) {
    if (o.boucler) opts.log(`\n── passe ${passe} ──`);
    const issue = await opts.completer(appliquer, (l) => opts.log(`  ${l}`), { plafond: o.plafond });
    for (const ligne of imprimerIssue(issue, appliquer)) opts.log(ligne);
    code = issue.resultat === 'erreur' ? 1 : 0; // 'inactif' et 'occupe' ne sont PAS des erreurs
    if (!o.boucler) return code;

    const suite = suiteDeLaBoucle(issue, etat, reglages);
    etat = etatSuivant(issue, etat);
    opts.log(`  ▸ ${suite.motif}`);
    if (suite.action === 'arreter') return suite.codeSortie ?? code;
    await dormir(suite.attendreS);
  }
}

/** Câblage RÉEL (import dynamique : garde `imapflow` et `pg` hors du graphe importé par les tests). */
async function main(): Promise<void> {
  const { completer } = await import('../lib/gestion/completionReelle');
  process.exitCode = await executerCli({ argv: process.argv, completer, log: (s) => console.log(s) });
}

// Point d'entrée : n'exécute `main()` que si le fichier est lancé DIRECTEMENT, jamais à l'import par un test.
const lanceDirect = process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;
if (lanceDirect) {
  void main()
    .catch((e) => { console.error('[gestion:completer-destinataires] échec', e); process.exitCode = 1; })
    .finally(async () => { const { closePool } = await import('../lib/db/client'); await closePool(); });
}
