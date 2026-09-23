import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { executerCli, imprimerIssue, lireAppliquer } from './relever-gestion';
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
  parRegle: { 'envoi de logiciel': 3, 'courrier interne': 1 }, ...o,
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
      .toContain('⚠ échec : boîte indisponible');
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
    const relever = vi.fn(async () => issue());
    const { log } = io();
    await executerCli({ argv: [], relever, log });
    expect(relever).toHaveBeenCalledWith(false);
    await executerCli({ argv: ['--appliquer'], relever, log });
    expect(relever).toHaveBeenLastCalledWith(true);
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
    expect(new Set(modules)).toEqual(new Set(['../lib/chargerEnv', 'node:url', '../lib/gestion/releveReelle', '../lib/db/client']));
  });

  it('n’atteint AUCUN chemin d’envoi vers l’extérieur', () => {
    expect(modules.some((m) => /nodemailer|email/.test(m))).toBe(false);
    expect(/envoyerDemande|envoyerAlerte|sendMail/.test(src)).toBe(false);
  });
});
