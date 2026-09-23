import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  attenteApresEchec, duree, enTeteMode, enTeteRattrapage, etatSuivant, executerCli, imprimerIssue, imprimerMesures,
  lireAppliquer, lireEntier, lireOptions, poids, suiteDeLaBoucle, PLANCHER_DISQUE_OCTETS,
  type EtatBoucle, type ReglagesBoucle,
} from './relever-gestion';
import type { IssueReleve } from '../lib/gestion/releve';
import type { RapportCapture } from '../lib/gestion/capture';

/**
 * CLI `gestion:relever` — DEUX modes, UNE frontière d'écriture. On teste le cœur avec une relève INJECTÉE : aucun IMAP,
 * aucune base. Le point dur : la simulation doit être le DÉFAUT, et se voir en toutes lettres dans la sortie — un doute
 * sur le mode, c'est une écriture faite sans l'avoir voulue.
 */

const rapport = (o: Partial<RapportCapture> = {}): RapportCapture => ({
  mode: 'applique', dossier: '_GESTION BOITE MAIL', depuis: '2026-06-25T12:00:00Z',
  uidsServeur: 10, plafondAtteint: false, vus: 10, dejaConnus: 2, captures: 8, recus: 5, envoyes: 3, exclus: 4,
  filsCrees: 6, filsFusionnes: 1, piecesDeposees: 2, piecesNonDeposees: 1, echecsLecture: 0,
  parRegle: { 'envoi de logiciel': 3, 'courrier interne': 1 },
  dejaVusEcartes: 0, resteInconnus: 0,
  reconnexions: 0, dureeTotaleMs: 0, dureeMedianeMs: 0, dureeMaxMs: 0, octetsLus: 0, lesPlusLents: [], ...o,
});
const issue = (o: Partial<IssueReleve> = {}): IssueReleve =>
  ({ resultat: 'ok', raison: 'ok', runId: 1, rapport: rapport(), ...o });

const io = () => { const lignes: string[] = []; return { lignes, log: (s: string) => lignes.push(s) }; };

describe('le mode — la simulation est le DÉFAUT', () => {
  it('sans option, on ne modifie rien', () => {
    expect(lireAppliquer([])).toBe(false);
    expect(lireAppliquer(['--jours=30'])).toBe(false);
  });

  it('il faut le demander explicitement pour écrire', () => {
    expect(lireAppliquer(['--appliquer'])).toBe(true);
  });

  it('le mode est dit EN TÊTE, en toutes lettres, dans les deux cas', () => {
    expect(imprimerIssue(issue(), false).join('\n')).toContain('SIMULATION (aucune écriture, nulle part)');
    expect(imprimerIssue(issue(), true).join('\n')).toContain('APPLIQUÉ (écritures réelles)');
  });

  it('en simulation, la sortie RAPPELLE que rien n’a été écrit et comment faire pour de vrai', () => {
    const t = imprimerIssue(issue(), false).join('\n');
    expect(t).toContain('rien n’a été écrit');
    expect(t).toContain('--appliquer');
  });

  it('en mode appliqué, ce rappel disparaît (il serait faux)', () => {
    expect(imprimerIssue(issue(), true).join('\n')).not.toContain('--appliquer');
  });
});

describe('le compte rendu', () => {
  it('donne le dossier, la fenêtre et les compteurs qui décident de la suite', () => {
    const t = imprimerIssue(issue(), true).join('\n');
    expect(t).toContain('_GESTION BOITE MAIL');
    expect(t).toContain('2026-06-25');
    expect(t).toContain('CAPTURÉS                    : 8   (5 reçu(s), 3 envoyé(s))');
    expect(t).toContain('tenus hors de la file       : 4   (enregistrés, jamais supprimés)');
    expect(t).toContain('pièces déposées / refusées  : 2 / 1');
  });

  it('détaille ce que CHAQUE règle a écarté, de la plus mordante à la moins', () => {
    const t = imprimerIssue(issue(), true).join('\n');
    expect(t.indexOf('envoi de logiciel')).toBeLessThan(t.indexOf('courrier interne'));
  });

  it('quand le plafond a mordu, dit COMBIEN reste à voir — sans quoi on croirait avoir tout pris', () => {
    const t = imprimerIssue(issue({ rapport: rapport({ plafondAtteint: true, uidsServeur: 1200, vus: 400 }) }), true).join('\n');
    expect(t).toContain('PLAFOND ATTEINT → 800 message(s) pour la passe suivante');
  });

  it('« inactif » et « occupe » disent leur motif, sans tableau de compteurs vide', () => {
    for (const r of ['inactif', 'occupe'] as const) {
      const t = imprimerIssue(issue({ resultat: r, rapport: null, raison: `motif ${r}` }), true).join('\n');
      expect(t).toContain(`motif ${r}`);
      expect(t).not.toContain('CAPTURÉS');
    }
  });

  it('un échec est signalé comme tel', () => {
    expect(imprimerIssue(issue({ resultat: 'erreur', rapport: null, raison: 'boîte indisponible' }), true).join('\n'))
      .toContain('⚠ ÉCHEC : boîte indisponible');
  });
});

describe('le code de sortie', () => {
  it('0 en succès, 0 aussi pour « inactif » et « occupe » (ce ne sont pas des erreurs)', async () => {
    for (const r of ['ok', 'inactif', 'occupe'] as const) {
      const { log } = io();
      expect(await executerCli({ argv: [], relever: async () => issue({ resultat: r }), log })).toBe(0);
    }
  });

  it('1 en échec', async () => {
    const { log } = io();
    expect(await executerCli({ argv: [], relever: async () => issue({ resultat: 'erreur', rapport: null }), log })).toBe(1);
  });

  it('passe bien le mode à la relève — et pas l’inverse', async () => {
    const modes: boolean[] = [];
    const relever = vi.fn(async (appliquer: boolean, journal: (l: string) => void) => { modes.push(appliquer); journal('lu'); return issue(); });
    const { log } = io();
    await executerCli({ argv: [], relever, log });
    expect(modes[0]).toBe(false);
    await executerCli({ argv: ['--appliquer'], relever, log });
    expect(modes[1]).toBe(true);
  });
});

describe('garanties STATIQUES', () => {
  const src = readFileSync('app/scripts/relever-gestion.ts', 'utf8');

  /** Modules du graphe d'EXÉCUTION (les `import type` sont effacés ; les commentaires ne pèsent rien). */
  const modules = src.split('\n').filter((l) => !/^\s*import\s+type\b/.test(l))
    .flatMap((l) => [...l.matchAll(/(?:from\s*|import\s*\(\s*|^\s*import\s+)'([^']+)'/g)].map((m) => m[1]));

  it('la CLI n’écrit jamais elle-même : elle délègue au foyer unique', () => {
    expect(modules).toContain('../lib/gestion/releveReelle');
    // Liste EXHAUSTIVE et voulue : la config d'environnement, le point d'entrée Node, le foyer de relève, et la
    //   fermeture du pool en sortie (une extinction, jamais une écriture). Rien d'autre n'est atteignable.
    // `node:fs/promises` n'y figure QUE pour `statfs` — une MESURE de l'espace libre (garde disque du lot R). La CLI
    //   n'écrit toujours aucun fichier : le test suivant le vérifie sur la source.
    expect(new Set(modules)).toEqual(new Set([
      '../lib/chargerEnv', 'node:fs/promises', 'node:url', '../lib/gestion/releveReelle', '../lib/db/client',
    ]));
  });

  it('de node:fs, elle n’emprunte QUE la mesure d’espace libre — aucune écriture de fichier', () => {
    expect(/from 'node:fs\/promises'/.test(src)).toBe(true);
    expect(/import \{ statfs \} from 'node:fs\/promises'/.test(src)).toBe(true);
    expect(/writeFile|appendFile|mkdir|rm\(|unlink|createWriteStream/.test(src)).toBe(false);
  });

  it('n’atteint AUCUN chemin d’envoi vers l’extérieur', () => {
    expect(modules.some((m) => /nodemailer|email/.test(m))).toBe(false);
    expect(/envoyerDemande|envoyerAlerte|sendMail/.test(src)).toBe(false);
  });
});


describe('LOT 3-ter — le mode s’affiche AVANT la moindre connexion', () => {
  it('l’en-tête nomme le mode, dans les deux cas', () => {
    expect(enTeteMode(false).join('\n')).toContain('SIMULATION (aucune écriture, nulle part)');
    expect(enTeteMode(true).join('\n')).toContain('APPLIQUÉ (écritures réelles)');
  });

  it('il est imprimé AVANT que la relève ne soit appelée — un terminal muet ne dit pas s’il travaille', async () => {
    const { lignes, log } = io();
    let vuAvant: string[] = [];
    await executerCli({
      argv: [],
      relever: async () => { vuAvant = [...lignes]; return issue(); },
      log,
    });
    expect(vuAvant.join('\n')).toContain('SIMULATION'); // déjà à l'écran quand la passe démarre
    expect(vuAvant.join('\n')).toContain('démarrage…');
  });

  it('la PROGRESSION de la passe est imprimée au fil de l’eau', async () => {
    const { lignes, log } = io();
    await executerCli({
      argv: [],
      relever: async (_a, journal) => { journal('… 25/400 lus'); journal('passe terminée'); return issue(); },
      log,
    });
    expect(lignes.join('\n')).toContain('… 25/400 lus');
    expect(lignes.join('\n')).toContain('passe terminée');
  });
});

describe('LOT 3-ter — un échec est annoncé, mais ses compteurs sont gardés', () => {
  const partiel = rapport({ vus: 137, captures: 120, exclus: 14 });

  it('⚠ ÉCHEC en tête, ET le détail de ce qui a été capturé avant la panne', () => {
    const t = imprimerIssue(issue({ resultat: 'erreur', raison: 'Socket timeout', rapport: partiel }), true).join('\n');
    expect(t).toContain('⚠ ÉCHEC : Socket timeout');
    expect(t).toContain('CAPTURÉS                    : 120');
    expect(t).toContain('messages lus                : 137');
  });

  it('un échec SANS compteurs (panne avant toute lecture) reste lisible', () => {
    const t = imprimerIssue(issue({ resultat: 'erreur', raison: 'connexion refusée', rapport: null }), true).join('\n');
    expect(t).toContain('⚠ ÉCHEC : connexion refusée');
    expect(t).not.toContain('CAPTURÉS');
  });

  it('le code de sortie reste 1 sur échec, même avec un rapport partiel', async () => {
    const { log } = io();
    expect(await executerCli({ argv: [], relever: async () => issue({ resultat: 'erreur', rapport: partiel }), log })).toBe(1);
  });
});

describe('LOT 3-quater — le bloc de MESURE, c’est-à-dire ce qui manquait au diagnostic', () => {
  const mesure = rapport({
    vus: 400, dureeTotaleMs: 612_000, dureeMedianeMs: 900, dureeMaxMs: 42_000, octetsLus: 180 * 1024 * 1024,
    reconnexions: 2,
    lesPlusLents: [{ uid: 1234, ms: 42_000, octets: 14_600_000 }, { uid: 88, ms: 30_500, octets: 5_000_000 }],
  });

  it('donne le total, la médiane et le pire — la médiane dit le régime, le pire dit l’incident', () => {
    const t = imprimerMesures(mesure).join('\n');
    expect(t).toContain('10 min 12 s au total');
    expect(t).toContain('médiane 900 ms');
    expect(t).toContain('pire 42.0 s');
    expect(t).toContain('180.0 Mo');
  });

  it('liste les plus lents avec numéro, taille et durée — jamais objet ni adresse', () => {
    const t = imprimerMesures(mesure).join('\n');
    expect(t).toContain('les plus lents');
    expect(t).toContain('message   1234');
    expect(t).toContain('13.9 Mo');
    expect(t).not.toContain('@');
  });

  it('annonce les reconnexions quand il y en a eu, et se tait sinon', () => {
    expect(imprimerMesures(mesure).join('\n')).toContain('reconnexions                : 2');
    expect(imprimerMesures(rapport({ vus: 10, reconnexions: 0 })).join('\n')).not.toContain('reconnexions ');
  });

  it('ne dit rien quand aucun message n’a été lu (une mesure vide serait du bruit)', () => {
    expect(imprimerMesures(rapport({ vus: 0 }))).toEqual([]);
  });

  it('les mesures apparaissent aussi sur un ÉCHEC : c’est là qu’on veut savoir ce qui était lent', () => {
    const t = imprimerIssue(issue({ resultat: 'erreur', raison: 'Socket timeout', rapport: mesure }), true).join('\n');
    expect(t).toContain('⚠ ÉCHEC');
    expect(t).toContain('les plus lents');
  });

  it('la simulation dit qu’elle lit LÉGER (aucun corps, aucune pièce téléchargés)', () => {
    expect(imprimerIssue(issue(), false).join('\n')).toContain('version LÉGÈRE');
    expect(imprimerIssue(issue(), true).join('\n')).not.toContain('version LÉGÈRE');
  });

  it('durées et poids se lisent sans effort', () => {
    expect(duree(450)).toBe('450 ms');
    expect(duree(42_000)).toBe('42.0 s');
    expect(duree(612_000)).toBe('10 min 12 s');
    expect(poids(800)).toBe('800 o');
    expect(poids(2048)).toBe('2 Ko');
    expect(poids(14_600_000)).toBe('13.9 Mo');
  });
});

describe('LOT 3-quinquies — l’état du RATTRAPAGE est dit en clair', () => {
  it('rattrapage en cours → combien de messages n’ont JAMAIS été lus, et quoi faire', () => {
    const t = imprimerIssue(issue({ rapport: rapport({ resteInconnus: 4711 }) }), true).join('\n');
    expect(t).toContain('RATTRAPAGE EN COURS : 4711 message(s) de la fenêtre encore JAMAIS lus');
    expect(t).toContain('Relancez la même commande');
  });

  it('rattrapage terminé → on le dit, pour qu’on sache s’arrêter de relancer', () => {
    const t = imprimerIssue(issue({ rapport: rapport({ resteInconnus: 0 }) }), true).join('\n');
    expect(t).toContain('RATTRAPAGE TERMINÉ');
    expect(t).not.toContain('RATTRAPAGE EN COURS');
  });

  it('les déjà-lus écartés sans téléchargement sont comptés à part des « déjà connus »', () => {
    const t = imprimerIssue(issue({ rapport: rapport({ dejaVusEcartes: 4800, dejaConnus: 0 }) }), true).join('\n');
    expect(t).toContain('déjà lus, écartés sans lecture : 4800');
    expect(t).toContain('déjà connus (ignorés)       : 0');
  });
});

/**
 * LOT R — LE RAPATRIEMENT D'HISTORIQUE. Le point dur n'est pas de remonter loin : c'est que rien de tout cela ne
 * déborde sur la relève ORDINAIRE. Aucune option active par défaut, aucun réglage écrit, et la passe unique d'avant
 * reste la passe unique d'avant.
 */
describe('LOT R — les options sont PONCTUELLES, et éteintes par défaut', () => {
  it('sans option, rien n’est demandé : ni origine, ni plafond, ni boucle', () => {
    const o = lireOptions([]);
    expect(o.depuisOrigine).toBe(false);
    expect(o.plafond).toBe(0);
    expect(o.boucler).toBe(false);
    expect(o.pauseS).toBe(10);
  });

  it('chaque option se demande explicitement, et se lit dans la sortie', () => {
    const o = lireOptions(['--appliquer', '--depuis-origine', '--plafond=1000', '--boucler', '--pause=45']);
    expect(o).toMatchObject({ depuisOrigine: true, plafond: 1000, boucler: true, pauseS: 45 });
    const t = enTeteRattrapage(o).join('\n');
    expect(t).toContain('depuis l’ORIGINE du dossier');
    expect(t).toContain('1000 message(s) pour CETTE passe');
    expect(t).toContain('gestion_config n’est pas touchée');
  });

  it('une relève ordinaire n’affiche AUCUN en-tête de rattrapage (ce serait un bruit trompeur)', () => {
    expect(enTeteRattrapage(lireOptions(['--appliquer']))).toEqual([]);
  });

  it('un entier illisible, négatif ou absent retombe sur le défaut — jamais sur NaN', () => {
    expect(lireEntier(['--plafond=abc'], 'plafond', 7)).toBe(7);
    expect(lireEntier(['--plafond=-5'], 'plafond', 7)).toBe(7);
    expect(lireEntier(['--plafond=0'], 'plafond', 7)).toBe(7);
    expect(lireEntier([], 'plafond', 7)).toBe(7);
    expect(lireEntier(['--plafond=250'], 'plafond', 7)).toBe(250);
  });

  it('les options sont TRANSMISES à la relève, telles que demandées', async () => {
    const vues: unknown[] = [];
    const { log } = io();
    await executerCli({
      argv: ['--appliquer', '--depuis-origine', '--plafond=800'],
      relever: async (_a, _j, options) => { vues.push(options); return issue(); },
      log,
    });
    expect(vues[0]).toEqual({ depuisOrigine: true, plafond: 800 });
  });
});

describe('LOT R — l’enchaînement des passes : quand continuer, quand s’arrêter', () => {
  const reglages: ReglagesBoucle = { pauseS: 10, backoffBaseS: 60, backoffMaxS: 1800, echecsMax: 8 };
  const neuf: EtatBoucle = { echecsConsecutifs: 0, restePrecedent: null };

  it('il reste des messages jamais lus → on continue, après la pause', () => {
    const s = suiteDeLaBoucle(issue({ rapport: rapport({ resteInconnus: 4711 }) }), neuf, reglages);
    expect(s).toMatchObject({ action: 'continuer', attendreS: 10 });
    expect(s.motif).toContain('4711');
  });

  it('plus rien d’inconnu → on s’arrête : boucler jusqu’au matin pour rien serait la pire des fins', () => {
    const s = suiteDeLaBoucle(issue({ rapport: rapport({ resteInconnus: 0 }) }), neuf, reglages);
    expect(s.action).toBe('arreter');
    expect(s.motif).toContain('TERMINÉ');
  });

  it('SURPLACE (le reste ne diminue pas) → on s’arrête, une boucle sans progrès ne se répare pas seule', () => {
    const etat: EtatBoucle = { echecsConsecutifs: 0, restePrecedent: 300 };
    expect(suiteDeLaBoucle(issue({ rapport: rapport({ resteInconnus: 300 }) }), etat, reglages).action).toBe('arreter');
    expect(suiteDeLaBoucle(issue({ rapport: rapport({ resteInconnus: 299 }) }), etat, reglages).action).toBe('continuer');
  });

  it('un échec ISOLÉ ne finit pas la nuit : on réessaie, avec une attente croissante', () => {
    const echec = issue({ resultat: 'erreur', rapport: null });
    expect(suiteDeLaBoucle(echec, neuf, reglages)).toMatchObject({ action: 'continuer', attendreS: 60 });
    expect(suiteDeLaBoucle(echec, { ...neuf, echecsConsecutifs: 2 }, reglages)).toMatchObject({ attendreS: 240 });
  });

  it('l’attente double mais reste PLAFONNÉE — insister ne fait pas rendre la main plus vite', () => {
    expect(attenteApresEchec(1, reglages)).toBe(60);
    expect(attenteApresEchec(4, reglages)).toBe(480);
    expect(attenteApresEchec(9, reglages)).toBe(1800);
    expect(attenteApresEchec(50, reglages)).toBe(1800);
  });

  it('une panne DURABLE finit par arrêter la boucle, au budget d’échecs consécutifs', () => {
    const s = suiteDeLaBoucle(issue({ resultat: 'erreur', rapport: null }), { ...neuf, echecsConsecutifs: 7 }, reglages);
    expect(s.action).toBe('arreter');
    expect(s.motif).toContain('8 échecs consécutifs');
  });

  it('un SUCCÈS remet le compteur d’échecs à zéro : seuls les échecs d’AFFILÉE comptent', () => {
    const apresEchec = etatSuivant(issue({ resultat: 'erreur', rapport: null }), { ...neuf, echecsConsecutifs: 3 });
    expect(apresEchec.echecsConsecutifs).toBe(4);
    expect(etatSuivant(issue({ rapport: rapport({ resteInconnus: 12 }) }), apresEchec))
      .toEqual({ echecsConsecutifs: 0, restePrecedent: 12 });
  });

  it('« occupe » et « inactif » arrêtent la boucle : rien ne les résoudra tout seul', () => {
    for (const r of ['occupe', 'inactif'] as const) {
      expect(suiteDeLaBoucle(issue({ resultat: r, rapport: null, raison: 'motif' }), neuf, reglages).action).toBe('arreter');
    }
  });
});

describe('LOT R — la boucle, de bout en bout', () => {
  it('enchaîne les passes jusqu’à épuisement, puis rend la main', async () => {
    const restes = [900, 500, 0];
    let n = 0;
    const { lignes, log } = io();
    const code = await executerCli({
      argv: ['--appliquer', '--depuis-origine', '--boucler'],
      relever: async () => issue({ rapport: rapport({ resteInconnus: restes[n++] }) }),
      log, dormir: async () => {},
    });
    expect(n).toBe(3);
    expect(code).toBe(0);
    expect(lignes.join('\n')).toContain('── passe 3 ──');
  });

  it('SANS --boucler, une seule passe — le comportement d’avant, intact', async () => {
    let n = 0;
    const { log } = io();
    await executerCli({
      argv: ['--appliquer'],
      relever: async () => { n += 1; return issue({ rapport: rapport({ resteInconnus: 4711 }) }); },
      log, dormir: async () => {},
    });
    expect(n).toBe(1);
  });

  it('elle ATTEND réellement entre deux passes (backoff compris) — jamais de martèlement', async () => {
    const dodos: number[] = [];
    const restes = [900, 0];
    let n = 0;
    const { log } = io();
    await executerCli({
      argv: ['--appliquer', '--boucler', '--pause=30'],
      relever: async () => issue({ rapport: rapport({ resteInconnus: restes[n++] }) }),
      log, dormir: async (s) => { dodos.push(s); },
    });
    expect(dodos).toEqual([30]);
  });

  it('GARDE DISQUE : sous le plancher, aucune passe n’est entamée, et on le dit en clair', async () => {
    let n = 0;
    const { lignes, log } = io();
    const code = await executerCli({
      argv: ['--appliquer', '--boucler'],
      relever: async () => { n += 1; return issue(); },
      log, dormir: async () => {},
      espaceLibreOctets: async () => PLANCHER_DISQUE_OCTETS - 1,
    });
    expect(n).toBe(0);            // rien n'a même commencé
    expect(code).toBe(1);
    expect(lignes.join('\n')).toContain('⛔ ARRÊT — garde disque');
  });

  it('la garde ne mord pas en SIMULATION : une simulation n’écrit rien, donc ne remplit rien', async () => {
    let n = 0;
    const { log } = io();
    await executerCli({
      argv: [],
      relever: async () => { n += 1; return issue(); },
      log, dormir: async () => {},
      espaceLibreOctets: async () => 0,
    });
    expect(n).toBe(1);
  });

  it('au-dessus du plancher, la passe part normalement', async () => {
    let n = 0;
    const { log } = io();
    await executerCli({
      argv: ['--appliquer'],
      relever: async () => { n += 1; return issue(); },
      log, espaceLibreOctets: async () => PLANCHER_DISQUE_OCTETS * 2,
    });
    expect(n).toBe(1);
  });
});
