import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { executerReleveAuto, executerReleveManuelle, executerReleveDemandee, motifErreur,
  MOTIF_SANS_DESCRIPTION,
  type DepsReleveAuto, type DepsReleveDemandee, type IssueReleveManuelle,
  type MajReleveRun } from './releveAuto';
import type { ClientBoite, RapportReleve } from './releveReponses';

/**
 * R7 — orchestrateur PUR de la relève automatique (injection totale : ni IMAP, ni base). On éprouve les trois garde-fous
 * « ignore » AVANT connexion (sans ligne releve_run), la tentative réelle journalisée EN DEUX TEMPS, et l'ISOLATION
 * (une relève qui échoue journalise « erreur » et RETOURNE — elle ne relance jamais).
 */
const CLIENT_FACTICE = {} as ClientBoite; // opaque : transite de creerClient à relever, jamais déréférencé ici

function rapport(over: Partial<RapportReleve> = {}): RapportReleve {
  return {
    mode: 'applique', profil: 'entreprise', connecte: true, depuis: null, domainesInterroges: [],
    uidsServeur: 0, referencesInterrogees: 0, uidsReferences: 0, plafondReferencesAtteint: false, plafondAtteint: false,
    vus: 0, dejaConnus: 0, horsPerimetre: 0, horsPerimetreSonde: 0, horsPerimetreSansAncre: 0, emisParNous: 0, retenus: 0, rattaches: 0, nonRattaches: 0,
    rebondsDetectes: 0, rebondsRattaches: 0, rebondsEtrangers: 0, rebondsAppliques: 0, accuses: 0, referencesCaptees: 0, liensCaptes: 0, ecrites: 0, piecesDeposees: 0, piecesNonDeposees: 0, parMethode: {}, lignes: [],
    ...over,
  };
}

/** Deps par défaut = relève ACTIVE, aucun « ok » antérieur, compte présent, relève OK. Chaque test surcharge ce qu'il éprouve. */
function makeDeps(over: Partial<DepsReleveAuto> = {}): DepsReleveAuto {
  return {
    maintenant: () => new Date('2026-08-08T12:00:00Z'),
    lireConfig: vi.fn(async () => ({ active: true, intervalleMinutes: 60, profil: 'entreprise' as const })),
    dernierOkLe: vi.fn(async () => null),
    creerClient: vi.fn(async () => CLIENT_FACTICE),
    relever: vi.fn(async () => rapport({ retenus: 2, rattaches: 2, ecrites: 2 })),
    insererRun: vi.fn(async () => 7),
    finaliserRun: vi.fn(async () => {}),
    ...over,
  };
}

describe('R7 — executerReleveAuto : garde-fous AVANT connexion (aucune ligne releve_run)', () => {
  it('relève DÉSACTIVÉE → « ignore », AUCUNE connexion, AUCUNE ligne', async () => {
    const creerClient = vi.fn(async () => CLIENT_FACTICE);
    const insererRun = vi.fn(async () => 7);
    const deps = makeDeps({ lireConfig: vi.fn(async () => ({ active: false, intervalleMinutes: 60, profil: 'entreprise' as const })), creerClient, insererRun });

    const issue = await executerReleveAuto(deps);

    expect(issue.resultat).toBe('ignore');
    expect(issue.runId).toBeNull();
    expect(creerClient).not.toHaveBeenCalled();
    expect(insererRun).not.toHaveBeenCalled();
  });

  it('intervalle NON écoulé (dernière relève « ok » il y a 30 min < 60) → « ignore », aucune connexion, aucune ligne', async () => {
    const creerClient = vi.fn(async () => CLIENT_FACTICE);
    const insererRun = vi.fn(async () => 7);
    const deps = makeDeps({ dernierOkLe: vi.fn(async () => new Date('2026-08-08T11:30:00Z')), creerClient, insererRun });

    const issue = await executerReleveAuto(deps);

    expect(issue.resultat).toBe('ignore');
    expect(creerClient).not.toHaveBeenCalled();
    expect(insererRun).not.toHaveBeenCalled();
  });

  it('intervalle ÉCOULÉ (dernière relève « ok » il y a 90 min > 60) → tentative réelle', async () => {
    const insererRun = vi.fn(async () => 7);
    const deps = makeDeps({ dernierOkLe: vi.fn(async () => new Date('2026-08-08T10:30:00Z')), insererRun });

    const issue = await executerReleveAuto(deps);

    expect(issue.resultat).toBe('ok');
    expect(insererRun).toHaveBeenCalledTimes(1);
  });

  it('profil INACTIF (creerClient → null) → « ignore », AUCUNE ligne releve_run', async () => {
    const insererRun = vi.fn(async () => 7);
    const deps = makeDeps({ creerClient: vi.fn(async () => null), insererRun });

    const issue = await executerReleveAuto(deps);

    expect(issue.resultat).toBe('ignore');
    expect(issue.raison).toMatch(/inactif/i);
    expect(insererRun).not.toHaveBeenCalled();
  });
});

describe('R7 — executerReleveAuto : tentative réelle journalisée EN DEUX TEMPS', () => {
  it('succès → insererRun (« en_cours ») PUIS finaliserRun « ok » avec les compteurs du rapport', async () => {
    const insererRun = vi.fn(async () => 7);
    const finaliserRun = vi.fn(async () => {});
    const deps = makeDeps({
      insererRun, finaliserRun,
      relever: vi.fn(async () => rapport({ vus: 5, retenus: 3, rattaches: 2, ecrites: 3, rebondsRattaches: 1 })),
    });

    const issue = await executerReleveAuto(deps);

    expect(issue.resultat).toBe('ok');
    expect(issue.runId).toBe(7);
    expect(insererRun).toHaveBeenCalledWith('entreprise');
    expect(finaliserRun).toHaveBeenCalledWith(7, expect.objectContaining({
      resultat: 'ok',
      rapport: expect.objectContaining({ vus: 5, retenus: 3, ecrites: 3, rebondsRattaches: 1 }),
    }));
  });

  it('ÉCHEC de relève → finaliserRun « erreur » (motif) et NE RELANCE PAS (issue « erreur »)', async () => {
    const insererRun = vi.fn(async () => 7);
    const finaliserRun = vi.fn(async () => {});
    const deps = makeDeps({ insererRun, finaliserRun, relever: vi.fn(async () => { throw new Error('IMAP timeout'); }) });

    // NE DOIT PAS jeter (isolation : c'est l'appelant qui décide) → issue « erreur »
    const issue = await executerReleveAuto(deps);

    expect(issue.resultat).toBe('erreur');
    expect(issue.raison).toContain('IMAP timeout');
    expect(insererRun).toHaveBeenCalledTimes(1); // la ligne « en_cours » a bien été posée avant l'échec
    expect(finaliserRun).toHaveBeenCalledWith(7, expect.objectContaining({ resultat: 'erreur', erreur: 'IMAP timeout' }));
  });

  it('appelle relever avec le CLIENT de creerClient et le PROFIL configuré (personne)', async () => {
    const client = {} as ClientBoite;
    const relever = vi.fn(async () => rapport({ profil: 'personne' }));
    const deps = makeDeps({
      lireConfig: vi.fn(async () => ({ active: true, intervalleMinutes: 60, profil: 'personne' as const })),
      creerClient: vi.fn(async () => client),
      relever,
    });

    await executerReleveAuto(deps);

    expect(relever).toHaveBeenCalledWith(client, 'personne');
  });
});

describe('R1 — executerReleveManuelle : FORCE la relève (aucune garde opt-in/intervalle)', () => {
  it('relève DÉSACTIVÉE + dernière « ok » à l’instant → relève quand même (contraste avec executerReleveAuto)', async () => {
    const relever = vi.fn(async () => rapport({ vus: 4, retenus: 2, rattaches: 2, ecrites: 2 }));
    const insererRun = vi.fn(async () => 7);
    const finaliserRun = vi.fn(async () => {});
    const deps = makeDeps({
      lireConfig: vi.fn(async () => ({ active: false, intervalleMinutes: 60, profil: 'entreprise' as const })),
      dernierOkLe: vi.fn(async () => new Date('2026-08-08T11:59:00Z')), // 1 min → executerReleveAuto ignorerait
      relever, insererRun, finaliserRun,
    });

    const issue = await executerReleveManuelle(deps);

    expect(issue.resultat).toBe('ok');
    expect(issue.runId).toBe(7);
    expect(issue.rapport).toEqual(expect.objectContaining({ vus: 4, ecrites: 2 }));
    expect(relever).toHaveBeenCalledTimes(1); // la garde « désactivée » NE s'applique PAS au déclenchement manuel
    expect(insererRun).toHaveBeenCalledWith('entreprise');
    expect(finaliserRun).toHaveBeenCalledWith(7, expect.objectContaining({ resultat: 'ok' }));
  });

  it('n’appelle jamais dernierOkLe (aucune notion d’intervalle en manuel)', async () => {
    const dernierOkLe = vi.fn(async () => new Date('2026-08-08T11:59:00Z'));
    await executerReleveManuelle(makeDeps({ dernierOkLe }));
    expect(dernierOkLe).not.toHaveBeenCalled();
  });

  it('profil INACTIF (creerClient → null) → « inactif », AUCUNE ligne releve_run', async () => {
    const insererRun = vi.fn(async () => 7);
    const deps = makeDeps({ creerClient: vi.fn(async () => null), insererRun });

    const issue = await executerReleveManuelle(deps);

    expect(issue.resultat).toBe('inactif');
    expect(issue.raison).toMatch(/inactif/i);
    expect(issue.rapport).toBeNull();
    expect(insererRun).not.toHaveBeenCalled();
  });

  it('ÉCHEC de relève → journalise « erreur » puis RETOURNE sans jeter (isolation)', async () => {
    const finaliserRun = vi.fn(async () => {});
    const deps = makeDeps({ insererRun: vi.fn(async () => 7), finaliserRun, relever: vi.fn(async () => { throw new Error('IMAP timeout'); }) });

    const issue = await executerReleveManuelle(deps);

    expect(issue.resultat).toBe('erreur');
    expect(issue.raison).toContain('IMAP timeout');
    expect(issue.rapport).toBeNull();
    expect(finaliserRun).toHaveBeenCalledWith(7, expect.objectContaining({ resultat: 'erreur', erreur: 'IMAP timeout' }));
  });
});

// ── LOT 34 — RELÈVE DÉCLENCHÉE (dépôt téléservice) : verrou consultatif + LECTURE SEULE (aucun envoi) ───────────────────────────
const OK: IssueReleveManuelle = { resultat: 'ok', raison: '2 retenu(s)', runId: 1, rapport: rapport({ retenus: 2, referencesCaptees: 1 }) };
function depsDemandee(over: Partial<DepsReleveDemandee> = {}): DepsReleveDemandee {
  return { acquerirVerrou: vi.fn(async () => true), libererVerrou: vi.fn(async () => {}), relever: vi.fn(async () => OK), ...over };
}

describe('LOT 34 — executerReleveDemandee : verrou réutilisé + aucun envoi', () => {
  it('verrou LIBRE → relève exécutée UNE fois, verrou relâché', async () => {
    const d = depsDemandee();
    const r = await executerReleveDemandee(d);
    expect(r.resultat).toBe('ok');
    expect(d.relever).toHaveBeenCalledTimes(1);
    expect(d.libererVerrou).toHaveBeenCalledTimes(1);
  });

  it('verrou DÉJÀ PRIS (run/relève ordinaire en cours) → « occupe », relève JAMAIS exécutée (pas de double exécution)', async () => {
    const relever = vi.fn(async () => OK);
    const libererVerrou = vi.fn(async () => {});
    const r = await executerReleveDemandee(depsDemandee({ acquerirVerrou: vi.fn(async () => false), relever, libererVerrou }));
    expect(r.resultat).toBe('occupe');
    expect(relever).not.toHaveBeenCalled();      // aucune superposition à une relève en cours
    expect(libererVerrou).not.toHaveBeenCalled(); // rien à relâcher : le verrou n'a pas été pris
  });

  it('le verrou est TOUJOURS relâché, même si la relève lève', async () => {
    const libererVerrou = vi.fn(async () => {});
    await expect(executerReleveDemandee(depsDemandee({ relever: vi.fn(async () => { throw new Error('IMAP KO'); }), libererVerrou }))).rejects.toThrow('IMAP KO');
    expect(libererVerrou).toHaveBeenCalledTimes(1);
  });

  it('AUCUN ENVOI possible : le contrat n’expose QUE verrou + relever (lecture) — aucun émetteur atteignable', async () => {
    const d = depsDemandee();
    await executerReleveDemandee(d);
    // Preuve STRUCTURELLE : il n'existe aucune dépendance « envoyer » ; le seul geste métier est deps.relever (= releverBoite, lecture IMAP).
    expect(Object.keys(d).sort()).toEqual(['acquerirVerrou', 'libererVerrou', 'relever']);
    expect(d.relever).toHaveBeenCalledTimes(1);
  });
});

describe('LOT 34 — GARDE D’IMPORTS : la relève déclenchée n’atteint aucun module d’émission', () => {
  const RACINE = process.cwd();
  const lire = (rel: string): string => readFileSync(join(RACINE, rel), 'utf8');
  const MODULES_ENVOI = /envoiRelance|envoiSaisineCada|envoiAuto|cascadePartielleRepo|nodemailer|obtenirTransporteur|executerVeille/;

  it('la route /relever-depot n’importe AUCUN module d’émission ni executerVeille', () => {
    const src = lire('app/(admin)/api/admin/permis/relever-depot/route.ts');
    // On ne regarde QUE les lignes `import` (les commentaires peuvent citer « executerVeille » pour dire qu'on ne l'appelle pas).
    const imports = src.split('\n').filter((l) => /^\s*import\b/.test(l)).join('\n');
    expect(imports).toMatch(/executerReleveDemandee/);      // elle passe bien par le chemin LECTURE SEULE
    expect(imports).not.toMatch(MODULES_ENVOI);             // et par AUCUN émetteur (ni executerVeille)
  });
});

/* ══════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   🔴🔴 LOT EVENEMENTS-CARTES-PLEINES, POINT 3 — UN MOTIF D'ÉCHEC N'EST JAMAIS VIDE
   ══════════════════════════════════════════════════════════════════════════════════════════════════════════════════

   DIAGNOSTIC DU 07/10/2026, rendu à Arno : le bandeau de l'écran affichait « La dernière relève automatique a
   échoué à 17:33 : motif non enregistré ». Il ne mentait pas — le motif était une chaîne VIDE en base. La cause
   tenait en une ligne : `e instanceof Error ? e.message : String(e)`, sans aucun repli quand le message manque.

   MESURE : 2 passes sur 56 échecs depuis le 25/09/2026 (26/09 à 10:29, 07/10 à 17:33). Rare — et c'est justement
   pour cela qu'on ne pouvait pas l'expliquer après coup.
   ══════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

describe('🔴🔴 le motif d’un échec de relève n’est jamais vide', () => {
  /** 🔴 LE CAS ORDINAIRE NE CHANGE PAS : un message présent reste le motif, mot pour mot. */
  it('🔴 un message présent est le motif, inchangé', () => {
    expect(motifErreur(new Error('getaddrinfo ENOTFOUND imap.gmail.com')))
      .toBe('getaddrinfo ENOTFOUND imap.gmail.com');
  });

  /**
   * 🔴🔴 LE CAS QUI A MANQUÉ : message vide, mais `code` présent — c'est exactement la forme des erreurs réseau
   * de Node, et `code` est précisément le mot qu'on cherche six mois plus tard (DNS ? box ? serveur ?).
   */
  it('🔴🔴 message vide : le CODE et le NOM prennent sa place', () => {
    const e = Object.assign(new Error(''), { code: 'ECONNRESET' });
    expect(motifErreur(e)).toBe('ECONNRESET (Error)');
  });

  /** 🔴 UN MESSAGE FAIT D'ESPACES VAUT UN MESSAGE VIDE : sinon le bandeau afficherait du blanc. */
  it('🔴 un message d’espaces vaut un message vide', () => {
    const e = Object.assign(new Error('   \n  '), { code: 'ETIMEDOUT' });
    expect(motifErreur(e)).toBe('ETIMEDOUT (Error)');
  });

  /** ⚠️ SANS CODE, LE NOM SUFFIT : « TypeError » dit déjà où chercher. */
  it('⚠️ ni message ni code : le nom de l’erreur', () => {
    const e = new TypeError('');
    expect(motifErreur(e)).toBe('TypeError');
  });

  /** ⚠️ SANS CODE NI NOM : une phrase, jamais un vide. */
  it('⚠️ ni message, ni code, ni nom : une phrase', () => {
    const e = Object.assign(new Error(''), { name: '' });
    expect(motifErreur(e)).toBe(MOTIF_SANS_DESCRIPTION);
    expect(MOTIF_SANS_DESCRIPTION.trim()).not.toBe('');
  });

  /** ⚠️ CE QUI N'EST PAS UNE `Error` SE DIT QUAND MÊME — un `throw 'x'`, un objet, `null`. */
  it('⚠️ ce qui n’est pas une Error laisse une trace lisible', () => {
    expect(motifErreur('la boîte a raccroché')).toBe('la boîte a raccroché');
    expect(motifErreur(null)).toBe('null');
    expect(motifErreur(undefined)).toBe('undefined');
    expect(motifErreur(404)).toBe('404');
    /* Une chaîne vide, elle, n'est pas une information : on rend la phrase. */
    expect(motifErreur('')).toBe(MOTIF_SANS_DESCRIPTION);
    expect(motifErreur('   ')).toBe(MOTIF_SANS_DESCRIPTION);
  });

  /**
   * 🔴🔴 ET AUCUNE ENTRÉE NE PEUT RENDRE UNE CHAÎNE VIDE. C'est la promesse du lot, et on la vérifie sur un
   * éventail plutôt que sur les cas qu'on a imaginés : c'est ce qui aurait attrapé le défaut d'origine.
   */
  it('🔴🔴 quoi qu’on lui donne, le motif n’est jamais vide', () => {
    const cas: unknown[] = [
      new Error(''), new Error('  '), new TypeError(''), Object.assign(new Error(''), { name: '', code: '' }),
      Object.assign(new Error(''), { code: 42 }), '', '   ', null, undefined, 0, false, {}, [],
      Object.create(null) as unknown,
    ];
    /* ⚠️ L'ÉTIQUETTE DE L'ASSERTION DOIT ÊTRE SÛRE, ELLE AUSSI : `String(Object.create(null))` JETTE, et c'est
       l'épreuve qui serait tombée, pas le code. Défaut rencontré en écrivant ce cas — exactement le genre de
       chose que ce test existe pour attraper, mais côté sujet. */
    const nommer = (c: unknown, i: number): string => {
      try { return `cas ${i} : ${String(c)}`; } catch { return `cas ${i} : (objet sans représentation)`; }
    };
    cas.forEach((c, i) => {
      const m = motifErreur(c);
      expect(typeof m, nommer(c, i)).toBe('string');
      expect(m.trim(), nommer(c, i)).not.toBe('');
    });
  });

  /**
   * 🔴🔴 LES DEUX CHEMINS D'ÉCRITURE L'EMPLOIENT — la relève AUTOMATIQUE et la relève MANUELLE. C'est ce qui
   * fait que le journal ne peut plus recevoir de motif vide, quel que soit le déclencheur.
   */
  it('🔴🔴 les deux relèves écrivent ce motif, et plus aucune ne lit `e.message` seul', () => {
    const src = readFileSync(join(process.cwd(), 'app/lib/veille/releveAuto.ts'), 'utf8');
    expect((src.match(/const motif = motifErreur\(e\);/g) ?? [])).toHaveLength(2);
    /* ⚠️ SANS LES COMMENTAIRES : l'encadré du correctif CITE la ligne d'avant pour dire ce qu'elle faisait, et
       une lecture brute serait tombée sur la mémoire du lot au lieu du code. */
    const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    expect(code).not.toContain('e instanceof Error ? e.message : String(e)');
  });

  /**
   * 🔴🔴 ET CE QUI EST ÉCRIT ARRIVE BIEN DANS LE JOURNAL : on fait échouer une relève avec une erreur au message
   * vide, et l'on regarde ce que `finaliserRun` reçoit. C'est la seule épreuve qui relie la fonction au défaut
   * constaté — les autres ne jugent que la fonction.
   */
  it('🔴🔴 une relève qui échoue sans message journalise quand même un motif', async () => {
    /* ⚠️ LES PARAMÈTRES SONT DÉCLARÉS, et pas seulement pour la forme : sans eux, `mock.calls` est typé `[]` et
       lire `[1]` ne compile pas. On veut justement regarder ce SECOND argument — la mise à jour du journal. */
    const finaliserRun = vi.fn(async (_id: number, _maj: MajReleveRun) => undefined);
    const deps = makeDeps({
      relever: vi.fn(async () => { throw Object.assign(new Error(''), { code: 'ECONNRESET' }); }),
      finaliserRun,
    });
    const issue = await executerReleveAuto(deps);
    expect(issue.resultat).toBe('erreur');
    expect(issue.raison).toBe('ECONNRESET (Error)');
    const maj = finaliserRun.mock.calls.at(-1)?.[1];
    expect(maj?.resultat).toBe('erreur');
    expect(maj?.erreur).toBe('ECONNRESET (Error)');
    expect((maj?.erreur ?? '').trim()).not.toBe('');
  });
});
