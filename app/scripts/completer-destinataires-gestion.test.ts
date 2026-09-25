import { describe, it, expect, vi } from 'vitest';
import {
  enTeteMode, etatSuivant, executerCli, imprimerIssue, lireOptions, passeMuette, suiteDeLaBoucle,
  ETAT_INITIAL, PLAFOND_DEFAUT, type EtatBoucle,
} from './completer-destinataires-gestion';
import type { ReglagesBoucle } from './relever-gestion';
import type { OptionsCompletion } from '../lib/gestion/completionPasse';
import { rapportVide, type IssueCompletion, type RapportCompletion } from '../lib/gestion/completion';

const reglages: ReglagesBoucle = { pauseS: 10, backoffBaseS: 60, backoffMaxS: 1800, echecsMax: 8, muettesMax: 2 };

const ok = (r: Partial<RapportCompletion>): IssueCompletion =>
  ({ resultat: 'ok', raison: 'fait', rapport: { ...rapportVide(), ...r } });
const muette = (): IssueCompletion =>
  ({ resultat: 'erreur', raison: 'rien servi', rapport: { ...rapportVide(), lus: 200, demandes: 200, entetesObtenus: 0, resteNull: 200 } });
const echec = (): IssueCompletion => ({ resultat: 'erreur', raison: 'Socket timeout', rapport: null });

describe('lecture de la ligne de commande', () => {
  it('sans option : un plafond par défaut, une seule passe', () => {
    const o = lireOptions([]);
    expect(o).toMatchObject({ plafond: PLAFOND_DEFAUT, boucler: false, muettesMax: 2 });
  });
  it('les options sont lues', () => {
    const o = lireOptions(['--plafond=500', '--boucler', '--pause=30', '--muettes=4']);
    expect(o).toMatchObject({ plafond: 500, boucler: true, pauseS: 30, muettesMax: 4 });
  });
  it('une valeur illisible retombe sur le défaut, elle ne casse pas la commande', () => {
    expect(lireOptions(['--plafond=abc']).plafond).toBe(PLAFOND_DEFAUT);
  });
});

describe('le mode est dit AVANT toute connexion', () => {
  it('la simulation se lit en toutes lettres, et dit comment appliquer', () => {
    const t = enTeteMode(false, lireOptions([])).join('\n');
    expect(t).toContain('SIMULATION');
    expect(t).toContain('--appliquer');
  });
  it('le mode appliqué se lit en toutes lettres', () => {
    expect(enTeteMode(true, lireOptions([])).join('\n')).toContain('APPLIQUÉ');
  });
  /** Ce que la commande promet de ne pas faire doit se lire AVANT qu'elle ne fasse quoi que ce soit. */
  it('l’en-tête dit que seuls les en-têtes sont lus — aucun corps, aucune pièce', () => {
    const t = enTeteMode(true, lireOptions([])).join('\n');
    expect(t).toContain('aucun corps');
    expect(t).toContain('aucun drapeau posé');
  });
});

describe('compte rendu d’une passe', () => {
  it('dit ce qui a été complété et ce qui reste', () => {
    const t = imprimerIssue(ok({ lus: 200, demandes: 200, entetesObtenus: 200, completes: 200, resteNull: 1000 }), true).join('\n');
    expect(t).toContain('COMPLÉTÉS');
    expect(t).toContain('200');
    expect(t).toContain('reste à compléter en base');
  });
  it('en simulation, il est dit que RIEN n’a été écrit', () => {
    const t = imprimerIssue(ok({ lus: 1, demandes: 1, entetesObtenus: 1, completes: 1 }), false).join('\n');
    expect(t).toContain('SERAIENT COMPLÉTÉS');
    expect(t).toContain('rien n’a été écrit');
  });
  it('ce qui n’a pas marché est dit, jamais tu', () => {
    const t = imprimerIssue(ok({ lus: 10, demandes: 9, entetesObtenus: 6, completes: 6, introuvables: 3, ambigus: 1 }), true).join('\n');
    expect(t).toContain('introuvables');
    expect(t).toContain('ambigus');
  });
  it('un échec est annoncé comme tel', () => {
    expect(imprimerIssue(echec(), true).join('\n')).toContain('⚠ ÉCHEC');
  });
});

describe('les passes muettes ont leur PROPRE budget', () => {
  it('une passe sans aucun en-tête servi est muette', () => {
    expect(passeMuette(muette())).toBe(true);
  });
  it('une passe qui avance encore ne l’est pas', () => {
    expect(passeMuette(ok({ lus: 200, demandes: 200, entetesObtenus: 1, completes: 1, resteNull: 5 }))).toBe(false);
  });
  /** Tous les Message-ID ambigus : rien n'a été demandé au serveur, on ne peut donc pas l'accuser de ne rien servir. */
  it('une passe sans AUCUNE demande d’en-tête n’est pas muette', () => {
    expect(passeMuette(ok({ lus: 42, demandes: 0, entetesObtenus: 0, ambigus: 42, resteNull: 42 }))).toBe(false);
  });
  it('la première muette fait PATIENTER, elle n’arrête pas', () => {
    const s = suiteDeLaBoucle(muette(), ETAT_INITIAL, reglages);
    expect(s.action).toBe('continuer');
    if (s.action === 'continuer') expect(s.attendreS).toBeGreaterThan(0);
  });
  it('la seconde muette d’affilée ARRÊTE, en disant qu’il faut revenir plus tard', () => {
    const etat: EtatBoucle = { ...ETAT_INITIAL, muettesConsecutives: 1 };
    const s = suiteDeLaBoucle(muette(), etat, reglages);
    expect(s.action).toBe('arreter');
    expect(s.motif).toContain('limite probable');
  });
  it('une passe qui capture remet les compteurs d’incident à zéro', () => {
    const etat: EtatBoucle = { echecsConsecutifs: 3, muettesConsecutives: 1, restePrecedent: 900 };
    expect(etatSuivant(ok({ completes: 5, resteNull: 800 }), etat))
      .toEqual({ echecsConsecutifs: 0, muettesConsecutives: 0, restePrecedent: 800 });
  });
});

describe('la suite de la boucle', () => {
  it('plus rien à compléter → on s’arrête, sans erreur', () => {
    const s = suiteDeLaBoucle(ok({ lus: 0, resteNull: 0 }), ETAT_INITIAL, reglages);
    expect(s.action).toBe('arreter');
    expect(s.motif).toContain('TERMINÉE');
    expect(s.action === 'arreter' && s.codeSortie).toBeUndefined();
  });

  /**
   * SURPLACE : il reste des lignes que la commande ne SAIT PAS compléter (introuvables, Message-ID ambigus). Boucler
   * dessus jusqu'au matin ne les trouverait pas davantage — et le motif doit le DIRE, sinon on ira chercher un bug.
   */
  it('le reste ne diminue plus → on s’arrête en disant pourquoi', () => {
    const etat: EtatBoucle = { ...ETAT_INITIAL, restePrecedent: 42 };
    const s = suiteDeLaBoucle(ok({ lus: 42, demandes: 0, entetesObtenus: 0, completes: 0, ambigus: 42, resteNull: 42 }), etat, reglages);
    expect(s.action).toBe('arreter');
    expect(s.motif).toContain('surplace');
    expect(s.motif).toContain('ambigus');
  });

  it('il reste du travail → passe suivante après la pause', () => {
    const s = suiteDeLaBoucle(ok({ lus: 200, demandes: 200, entetesObtenus: 200, completes: 200, resteNull: 800 }), ETAT_INITIAL, reglages);
    expect(s).toMatchObject({ action: 'continuer', attendreS: 10 });
  });

  it('un échec fait RÉESSAYER, avec une attente croissante', () => {
    const s = suiteDeLaBoucle(echec(), ETAT_INITIAL, reglages);
    expect(s.action).toBe('continuer');
  });

  it('huit échecs d’affilée arrêtent la boucle', () => {
    const etat: EtatBoucle = { ...ETAT_INITIAL, echecsConsecutifs: 7 };
    const s = suiteDeLaBoucle(echec(), etat, reglages);
    expect(s.action).toBe('arreter');
    expect(s.action === 'arreter' && s.codeSortie).toBe(1);
  });

  it('« occupe » arrête : rien ne le résoudra tout seul', () => {
    const s = suiteDeLaBoucle({ resultat: 'occupe', raison: 'une relève tourne', rapport: null }, ETAT_INITIAL, reglages);
    expect(s.action).toBe('arreter');
  });
});

describe('le CLI de bout en bout', () => {
  it('sans --boucler, une seule passe est demandée', async () => {
    const completer = vi.fn(async () => ok({ lus: 5, demandes: 5, entetesObtenus: 5, completes: 5, resteNull: 100 }));
    const code = await executerCli({ argv: ['node', 'x'], completer, log: () => {} });
    expect(completer).toHaveBeenCalledTimes(1);
    expect(code).toBe(0);
  });

  it('le mode APPLIQUÉ n’est demandé que si --appliquer est présent', async () => {
    const completer = vi.fn(
      async (_appliquer: boolean, _journal: (l: string) => void, _o: OptionsCompletion) => ok({ lus: 1, demandes: 1, entetesObtenus: 1, completes: 1 }));
    await executerCli({ argv: ['node', 'x'], completer, log: () => {} });
    expect(completer.mock.calls[0][0]).toBe(false);
    completer.mockClear();
    await executerCli({ argv: ['node', 'x', '--appliquer'], completer, log: () => {} });
    expect(completer.mock.calls[0][0]).toBe(true);
  });

  it('le plafond demandé est transmis à la passe', async () => {
    const completer = vi.fn(
      async (_appliquer: boolean, _journal: (l: string) => void, _o: OptionsCompletion) => ok({ lus: 0, resteNull: 0 }));
    await executerCli({ argv: ['node', 'x', '--plafond=777'], completer, log: () => {} });
    expect(completer.mock.calls[0][2]).toEqual({ plafond: 777 });
  });

  it('avec --boucler, les passes s’enchaînent jusqu’à épuisement', async () => {
    const suites = [
      ok({ lus: 200, demandes: 200, entetesObtenus: 200, completes: 200, resteNull: 200 }),
      ok({ lus: 200, demandes: 200, entetesObtenus: 200, completes: 200, resteNull: 0 }),
    ];
    let i = 0;
    const completer = vi.fn(async () => suites[i++]);
    const code = await executerCli({ argv: ['node', 'x', '--appliquer', '--boucler'], completer, log: () => {}, dormir: async () => {} });
    expect(completer).toHaveBeenCalledTimes(2);
    expect(code).toBe(0);
  });

  it('deux passes muettes d’affilée arrêtent la boucle avec un code d’échec', async () => {
    const completer = vi.fn(async () => muette());
    const code = await executerCli({ argv: ['node', 'x', '--appliquer', '--boucler'], completer, log: () => {}, dormir: async () => {} });
    expect(completer).toHaveBeenCalledTimes(2);
    expect(code).toBe(1);
  });

  it('« occupe » n’est PAS une erreur : code de sortie 0', async () => {
    const completer = vi.fn(async () => ({ resultat: 'occupe' as const, raison: 'une relève tourne', rapport: null }));
    expect(await executerCli({ argv: ['node', 'x'], completer, log: () => {} })).toBe(0);
  });
});
