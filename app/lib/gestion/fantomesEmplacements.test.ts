import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';

/**
 * ══ 🔴🔴 LOT FANTOMES-APRES-INDEXATION — LA DÉTECTION ET LA CORRECTION, ÉPROUVÉES SANS DRIVE ═════════════════════
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * DÉCISION D'ARNO (03/10/2026) : « Ta proposition est acceptée : relance automatiquement la détection et la
 * correction des entrées fantômes du registre juste après chaque passe d'indexation (changes.list), et pas en
 * continu. Le journal doit tracer le nombre de candidats, le nombre de corrections et le nombre de disparitions.
 * Lecture seule sur le Drive. »
 *
 * 🔴 CE QUE LA SORTIE DE LA RÈGLE DU SCRIPT A RENDU POSSIBLE, et c'est tout l'intérêt : la détection s'éprouve
 * maintenant SANS réseau ni Drive, avec des doublures. Les quatre verdicts (corriger, disparu, intacte, on ne
 * conclut rien) étaient jusqu'ici invérifiables autrement qu'en lançant le script sur le vrai Drive.
 *
 * ⚠️ LE DRIVE ARRIVE PAR INJECTION, et ce n'est pas pour la commodité : le balayage n'a qu'UN SEUL `fetch` dans
 * tout son fichier, et trois gardes statiques en font la preuve qu'il ne sait pas écrire. S'il devait ouvrir une
 * seconde porte pour ce nettoyage, ces gardes tomberaient. Il lui prête donc la sienne.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */

const queryMock = vi.fn();
vi.mock('../db/client', () => ({ query: (...a: unknown[]) => queryMock(...a) }));

/** 🔴 LES TROIS ÉCRITURES SONT DOUBLÉES POUR ÊTRE OBSERVÉES — jamais pour être supposées. */
const disparueMock = vi.fn();
const indexDisparusMock = vi.fn();
const registreMock = vi.fn();
const indexParentMock = vi.fn();
/**
 * 🔴 L'OCCUPANT DE L'EMPLACEMENT — doublé lui aussi, et il le FAUT. C'est la lecture qui dit si une autre ligne de
 * la même pièce tient déjà le dossier de destination : sans elle doublée, la fabrique de `./driveRepo` rendrait
 * `undefined` et le nettoyage tomberait à l'appel (piège déjà rencontré dans ce dépôt : une fabrique `vi.mock`
 * oubliée derrière un export neuf).
 */
const occupantMock = vi.fn();
vi.mock('./nomUsageRepo', () => ({ marquerCopieDisparue: (...a: unknown[]) => disparueMock(...a) }));
vi.mock('./driveRepo', () => ({
  deplacerCopieAuRegistre: (...a: unknown[]) => registreMock(...a),
  occupantDuSlot: (...a: unknown[]) => occupantMock(...a),
}));
vi.mock('./empreinteDriveRepo', () => ({
  noterFichiersDisparus: (...a: unknown[]) => indexDisparusMock(...a),
  noterParentDeplace: (...a: unknown[]) => indexParentMock(...a),
}));

import {
  journaliserFantomes, nettoyerFantomes, phraseBilanFantomes, VERIFICATIONS_MAX, type DepsFantomes,
} from './fantomesEmplacements';

/** Un candidat, tel que la présélection le rend. */
const ligne = (id: number, o: Partial<Record<string, unknown>> = {}) => ({
  id: String(id), piece_id: '27085', drive_file_id: `F${id}`,
  drive_dossier_id: 'VIEUX', dossier_nom: 'Ancien dossier', ...o,
});

/** Une porte de doublure : elle répond ce qu'on lui dit, et retient ce qu'on lui a demandé. */
function porte(reponses: Record<string, { trashed?: boolean; parents?: string[] } | number>): DepsFantomes & {
  demandes: string[];
} {
  const demandes: string[] = [];
  return {
    demandes,
    lireFichier: async (id) => {
      demandes.push(id);
      const r = reponses[id];
      if (r === undefined) return { ok: false, statut: 404 };
      if (typeof r === 'number') return { ok: false, statut: r };
      return { ok: true, valeur: { nom: id, parents: r.parents ?? [], trashed: r.trashed === true } };
    },
    nomDossier: async (id) => (id === 'REEL' ? 'Nouveau dossier' : null),
  };
}

beforeEach(() => {
  queryMock.mockReset(); disparueMock.mockReset(); indexDisparusMock.mockReset();
  registreMock.mockReset(); indexParentMock.mockReset(); occupantMock.mockReset();
  /* ⚠️ PAR DÉFAUT, LA PLACE EST LIBRE : c'est le cas ordinaire, et le cas « occupée » s'arme test par test. */
  occupantMock.mockResolvedValue(null);
  registreMock.mockResolvedValue(1);
  indexParentMock.mockResolvedValue(1);
  disparueMock.mockResolvedValue(true);
  indexDisparusMock.mockResolvedValue(1);
});

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   ① LA PRÉSÉLECTION — EN BASE, SANS UN APPEL GOOGLE
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

describe('🔴🔴 la présélection', () => {
  it('🔴🔴 elle compare le registre à l’index, en UNE requête', async () => {
    queryMock.mockResolvedValue({ rows: [] });
    const p = porte({});
    const b = await nettoyerFantomes(p, { appliquer: false });
    expect(queryMock).toHaveBeenCalledTimes(1);
    const sql = String(queryMock.mock.calls[0][0]).replace(/\s+/g, ' ');
    expect(sql).toContain('FROM gestion_piece_drive d');
    expect(sql).toContain('LEFT JOIN gestion_drive_empreinte e ON e.drive_file_id = d.drive_file_id');
    // 🔴 LES TROIS SORTES DE CANDIDATS, dans le même prédicat.
    expect(sql).toContain('e.drive_file_id IS NULL');
    expect(sql).toContain('e.disparu_le IS NOT NULL');
    expect(sql).toContain("coalesce(e.parent_id, '') <> d.drive_dossier_id");
    // ⚠️ ET AUCUN APPEL GOOGLE QUAND IL N'Y A RIEN À VÉRIFIER.
    expect(p.demandes).toEqual([]);
    expect(b).toEqual({ candidats: 0, verifies: 0, corriges: 0, disparus: 0, intacts: 0, bloques: 0 });
  });

  /** ⚠️ LES LIGNES DÉJÀ MARQUÉES « DISPARUES » SONT HORS SUJET : on ne défait pas un constat daté. */
  it('⚠️ les lignes déjà disparues ne sont pas reprises', async () => {
    queryMock.mockResolvedValue({ rows: [] });
    await nettoyerFantomes(porte({}), { appliquer: false });
    expect(String(queryMock.mock.calls[0][0])).toContain('d.disparu_le IS NULL');
  });
});

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   ② LES QUATRE VERDICTS — C'EST LE DRIVE QUI TRANCHE, PAS L'INDEX
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

describe('🔴🔴 les verdicts', () => {
  /**
   * 🔴🔴 LE PARENT ÉCRIT VIENT DE GOOGLE. L'index est un REFLET : corriger la base à partir de lui serait
   * corriger une base à partir d'une copie.
   */
  it('🔴🔴 parent différent → on CORRIGE, avec le parent RÉEL et son nom', async () => {
    queryMock.mockResolvedValue({ rows: [ligne(1)] });
    const b = await nettoyerFantomes(porte({ F1: { parents: ['REEL'] } }), { appliquer: true });
    expect(b).toMatchObject({ candidats: 1, verifies: 1, corriges: 1, disparus: 0, intacts: 0, bloques: 0 });
    expect(registreMock).toHaveBeenCalledWith('F1', 'REEL', 'Nouveau dossier');
    expect(indexParentMock).toHaveBeenCalledWith('F1', 'REEL');
    expect(disparueMock).not.toHaveBeenCalled();
  });

  /**
   * ══ 🔴🔴 LE MENSONGE MESURÉ LE 04/10/2026 — « 2 corrigé(s) », ZÉRO LIGNE ÉCRITE ════════════════════════════════
   *
   * En appliquant la correction qu'Arno venait d'autoriser, PostgreSQL a refusé l'écriture :
   * `duplicate key value violates unique constraint "gestion_piece_drive_unique_idx"`. Le bilan annonçait quand
   * même une correction, et le journal de la base l'a répété à TROIS passes du balayage automatique
   * (23:59:20, 00:14:25, 00:29:30). Un journal qui affirme un fait qui n'a pas eu lieu est pire qu'un journal vide.
   *
   * LA CAUSE DU COMPTAGE FAUX : on incrémentait AVANT d'écrire, sans regarder ce que l'écriture rendait.
   * LA CAUSE DU REFUS : l'index unique `(piece_id, drive_dossier_id)` ne distingue pas les copies DISPARUES, si
   * bien qu'une copie mise à la corbeille réservait la place à une copie vivante. Levée par la migration 301.
   */
  it('🔴🔴 écriture bloquée → BLOQUÉE, et SURTOUT pas « corrigée »', async () => {
    queryMock.mockResolvedValue({ rows: [ligne(1)] });
    occupantMock.mockResolvedValue({ id: 26545, driveFileId: 'AUTRE', disparu: true });
    const b = await nettoyerFantomes(porte({ F1: { parents: ['REEL'] } }), { appliquer: true });
    expect(b).toMatchObject({ candidats: 1, verifies: 1, corriges: 0, bloques: 1 });
    /* 🔴 ET RIEN N'EST ÉCRIT, NI AU REGISTRE NI À L'INDEX : on ne note pas un déplacement qu'on n'a pas fait. */
    expect(registreMock).not.toHaveBeenCalled();
    expect(indexParentMock).not.toHaveBeenCalled();
  });

  /**
   * ⚠️ ET SI L'OCCUPANT N'EST PAS VU MAIS QUE L'ÉCRITURE REND 0 : même verdict. `deplacerCopieAuRegistre` avale
   * volontairement les conflits d'unicité (« un conflit n'est pas une panne ») et rend `0` ; c'est ce `0` qui
   * décide, jamais l'intention.
   */
  it('⚠️ zéro ligne écrite → BLOQUÉE, même sans occupant détecté', async () => {
    queryMock.mockResolvedValue({ rows: [ligne(1)] });
    registreMock.mockResolvedValue(0);
    const b = await nettoyerFantomes(porte({ F1: { parents: ['REEL'] } }), { appliquer: true });
    expect(b).toMatchObject({ corriges: 0, bloques: 1 });
    expect(indexParentMock).not.toHaveBeenCalled();
  });

  /**
   * 🔴 EN SIMULATION, LE CHIFFRE ANNONCE UNE INTENTION — et c'est juste : on n'écrit rien, donc rien ne peut
   * buter. La place n'est même pas interrogée : ce serait une requête pour une question sans objet.
   */
  it('🔴 en simulation, la correction est comptée sans interroger la place', async () => {
    queryMock.mockResolvedValue({ rows: [ligne(1)] });
    const b = await nettoyerFantomes(porte({ F1: { parents: ['REEL'] } }), { appliquer: false });
    expect(b).toMatchObject({ corriges: 1, bloques: 0 });
    expect(occupantMock).not.toHaveBeenCalled();
    expect(registreMock).not.toHaveBeenCalled();
  });

  /** ⚠️ L'OCCUPANT EST CHERCHÉ POUR LA BONNE PIÈCE, LE BON DOSSIER, ET EN S'ÉCARTANT SOI-MÊME. */
  it('⚠️ la place est interrogée pour cette pièce, ce dossier, hors de sa propre ligne', async () => {
    queryMock.mockResolvedValue({ rows: [ligne(7)] });
    await nettoyerFantomes(porte({ F7: { parents: ['REEL'] } }), { appliquer: true });
    expect(occupantMock).toHaveBeenCalledWith(27085, 'REEL', 7);
  });

  it('🔴 fichier à la corbeille → DISPARUE, au registre comme à l’index', async () => {
    queryMock.mockResolvedValue({ rows: [ligne(1)] });
    const b = await nettoyerFantomes(porte({ F1: { trashed: true, parents: ['VIEUX'] } }), { appliquer: true });
    expect(b).toMatchObject({ corriges: 0, disparus: 1 });
    expect(disparueMock).toHaveBeenCalledWith('F1', 'mis à la corbeille du Drive');
    expect(indexDisparusMock).toHaveBeenCalledWith(['F1']);
    expect(registreMock).not.toHaveBeenCalled();
  });

  it('🔴 404 → DISPARUE ; 403 aussi', async () => {
    for (const statut of [404, 403]) {
      queryMock.mockResolvedValue({ rows: [ligne(1)] });
      disparueMock.mockClear();
      const b = await nettoyerFantomes(porte({ F1: statut }), { appliquer: true });
      expect(b.disparus, String(statut)).toBe(1);
      expect(disparueMock).toHaveBeenCalled();
    }
  });

  /**
   * 🔴🔴 LA PROPRIÉTÉ LA PLUS IMPORTANTE DE TOUT CE FICHIER. Marquer sur un 503 effacerait du registre une copie
   * parfaitement vivante, et l'on ne la retrouverait plus jamais. Le verdict passe par `estDisparition` (module
   * PUR), qui ne rend `true` que sur deux codes nommés.
   */
  it('🔴🔴 429, 503, ou pas de réponse du tout → ON NE CONCLUT RIEN', async () => {
    for (const statut of [429, 500, 503, 0]) {
      queryMock.mockResolvedValue({ rows: [ligne(1)] });
      disparueMock.mockClear(); registreMock.mockClear();
      const b = await nettoyerFantomes(porte({ F1: statut }), { appliquer: true });
      expect(b, String(statut)).toMatchObject({ corriges: 0, disparus: 0, intacts: 1, bloques: 0 });
      expect(disparueMock, String(statut)).not.toHaveBeenCalled();
      expect(registreMock, String(statut)).not.toHaveBeenCalled();
    }
  });

  /** 🔴 LE REGISTRE DIT VRAI : c'était l'index qui était en retard. On n'écrit rien. */
  it('🔴 parent conforme → INTACTE, et rien n’est écrit', async () => {
    queryMock.mockResolvedValue({ rows: [ligne(1)] });
    const b = await nettoyerFantomes(porte({ F1: { parents: ['VIEUX'] } }), { appliquer: true });
    expect(b).toMatchObject({ corriges: 0, disparus: 0, intacts: 1, bloques: 0 });
    expect(registreMock).not.toHaveBeenCalled();
    expect(disparueMock).not.toHaveBeenCalled();
  });

  /** ⚠️ AUCUN PARENT RENDU : on ne conclut rien non plus — un fichier sans parent n'est pas un fichier déplacé. */
  it('⚠️ aucun parent rendu → on ne conclut rien', async () => {
    queryMock.mockResolvedValue({ rows: [ligne(1)] });
    const b = await nettoyerFantomes(porte({ F1: { parents: [] } }), { appliquer: true });
    expect(b).toMatchObject({ intacts: 1, corriges: 0, disparus: 0 });
  });
});

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   ③ LA SIMULATION, ET LA BORNE
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

describe('🔒🔒 sans `appliquer`, rien n’est écrit', () => {
  it('🔒🔒 la simulation COMPTE, et n’écrit rien', async () => {
    queryMock.mockResolvedValue({ rows: [ligne(1), ligne(2)] });
    const b = await nettoyerFantomes(porte({ F1: { parents: ['REEL'] }, F2: { trashed: true } }), {
      appliquer: false,
    });
    expect(b).toMatchObject({ candidats: 2, verifies: 2, corriges: 1, disparus: 1 });
    // 🔴 LES QUATRE ÉCRITURES SONT SOUS LA MÊME GARDE : une seule oubliée, et la simulation écrirait.
    for (const m of [registreMock, indexParentMock, disparueMock, indexDisparusMock]) {
      expect(m).not.toHaveBeenCalled();
    }
  });

  /** ⚠️ LA BORNE EST DITE, et elle protège d'une passe qui s'emballerait sur un registre abîmé. */
  it('⚠️ la borne limite les `files.get`, et l’annonce', async () => {
    queryMock.mockResolvedValue({ rows: [ligne(1), ligne(2), ligne(3)] });
    const dit: string[] = [];
    const p = porte({ F1: { parents: ['VIEUX'] }, F2: { parents: ['VIEUX'] }, F3: { parents: ['VIEUX'] } });
    const b = await nettoyerFantomes(p, { appliquer: false, max: 1, dire: (l) => dit.push(l) });
    expect(b).toMatchObject({ candidats: 3, verifies: 1 });
    expect(p.demandes).toEqual(['F1']);
    expect(dit.join('\n')).toContain('1 candidats vérifiés sur 3');
  });

  it('⚠️ la borne ne peut pas être levée au-delà du plafond du module', async () => {
    queryMock.mockResolvedValue({ rows: [] });
    await nettoyerFantomes(porte({}), { appliquer: false, max: 10_000 });
    expect(VERIFICATIONS_MAX).toBe(200);
  });
});

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   ④ LE JOURNAL — LES TROIS NOMBRES QU'ARNO DEMANDE
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

describe('🔴🔴 le journal', () => {
  it('🔴🔴 il trace candidats, corrections et disparitions', async () => {
    queryMock.mockResolvedValue({ rows: [] });
    await journaliserFantomes({ candidats: 7, verifies: 7, corriges: 3, disparus: 2, intacts: 2, bloques: 0 }, true);
    const sql = String(queryMock.mock.calls[0][0]).replace(/\s+/g, ' ');
    expect(sql).toContain('INSERT INTO gestion_journal');
    const params = queryMock.mock.calls[0][1] as string[];
    expect(params[0]).toContain('7 candidat');
    expect(params[1]).toContain('3 corrigé');
    expect(params[1]).toContain('2 disparu');
    expect(params[2]).toContain('7 candidats');
  });

  /**
   * ⚠️ L'ENTITÉ EST `piece_drive`, celle qui existe DÉJÀ dans `gestion_journal_entite_chk` (vérifié en base).
   * Inventer une entité aurait demandé une migration — donc un lot livré qui ne journalise RIEN tant qu'Arno ne
   * l'applique pas, pour la seule beauté d'un mot.
   */
  it('⚠️ une entité que la base accepte déjà, et aucune migration', async () => {
    queryMock.mockResolvedValue({ rows: [] });
    await journaliserFantomes({ candidats: 1, verifies: 1, corriges: 1, disparus: 0, intacts: 0, bloques: 0 }, true);
    expect(String(queryMock.mock.calls[0][0])).toContain("'piece_drive'");
  });

  /**
   * ⚠️ RIEN QUAND LA PASSE N'A RIEN VU. Une ligne « 0 candidat » toutes les quinze minutes noierait le journal
   * sous 96 lignes par jour qui ne disent rien. On consigne ce qui s'est passé, pas le fait d'avoir regardé.
   */
  it('⚠️ aucune ligne quand il n’y a rien à dire', async () => {
    await journaliserFantomes({ candidats: 0, verifies: 0, corriges: 0, disparus: 0, intacts: 0, bloques: 0 }, true);
    expect(queryMock).not.toHaveBeenCalled();
  });

  /** ⚠️ IL NE LÈVE JAMAIS : un journal impossible ne doit pas défaire un nettoyage qui a eu lieu. */
  it('⚠️ une base muette ne fait pas échouer la passe', async () => {
    const erreur = vi.spyOn(console, 'error').mockImplementation(() => {});
    queryMock.mockRejectedValue(new Error('entité refusée'));
    await expect(journaliserFantomes({ candidats: 1, verifies: 1, corriges: 0, disparus: 1, intacts: 0, bloques: 0 }, true))
      .resolves.toBeUndefined();
    erreur.mockRestore();
  });

  /** La phrase est écrite UNE fois : le journal du serveur et celui de la base disent la même chose. */
  it('la phrase du bilan dit les trois nombres', () => {
    const p = phraseBilanFantomes({ candidats: 1, verifies: 1, corriges: 1, disparus: 0, intacts: 0, bloques: 0 }, true);
    expect(p).toContain('1 candidat,');
    expect(p).toContain('1 correction,');
    expect(p).toContain('0 disparition,');
    expect(phraseBilanFantomes({ candidats: 2, verifies: 2, corriges: 0, disparus: 0, intacts: 2, bloques: 0 }, false))
      .toContain('Simulation');
  });
});

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   ⑤ 🔒🔒 CE MODULE NE SAIT NI ÉCRIRE DANS LE DRIVE, NI SUPPRIMER UNE LIGNE
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

describe('🔒🔒 les propriétés du code', () => {
  const code = readFileSync('app/lib/gestion/fantomesEmplacements.ts', 'utf8');

  it('🔒🔒 pas un seul `fetch`, et pas un module d’écriture Drive', () => {
    expect(code).not.toContain('fetch(');
    expect(code).not.toContain('googleapis.com');
    for (const mod of ['driveMouvement', 'driveCorbeilleReel', 'driveEcriture', 'driveCreation',
      'renommageDrive', 'copiePiecesReel']) {
      expect(code, mod).not.toContain(`/${mod}'`);
    }
  });

  /**
   * 🔒🔒 AUCUNE SUPPRESSION DE LIGNE, JAMAIS. Une ligne de `gestion_piece_drive` dit un fait daté, et ce fait
   * reste vrai après la disparition du fichier — c'est même le seul moment où l'on a envie de le relire.
   */
  it('🔒🔒 il ne sait pas supprimer', () => {
    for (const mot of ['DELETE FROM', 'TRUNCATE', 'DROP ']) expect(code, mot).not.toContain(mot);
  });

  /**
   * ⚠️ PAS DE `server-only` SUR CE MODULE, et ce test existe parce que je l'y avais mis par réflexe. Le garde F2
   * (`garde/serverOnly.guard.test.ts`) a rougi, et il avait raison : DEUX lignes de commande atteignent ce module
   * (`indexer-empreintes-drive`, `nettoyer-emplacements-fantomes`), et `server-only` lève à l'import hors
   * composant serveur — les deux CLI seraient mortes au CHARGEMENT, avant d'avoir rien fait.
   *
   * 🔒 La frontière client reste gardée ailleurs, et génériquement : `clientBoundary.guard.test.ts` interdit à
   * tout fichier `'use client'` d'atteindre un module qui tire `pg`, ce qui est le cas d'ici par `db/client`.
   * Ce test-ci est le rappel de proximité : il rougit dans le fichier qu'on est en train d'éditer.
   */
  it('⚠️ il ne porte pas `server-only` — deux CLI l’atteignent', () => {
    expect(code).not.toMatch(/^\s*import\s+['"]server-only['"]/m);
    expect(code).toContain("import { query } from '../db/client'");
  });

  /** 🔴 LE VERDICT VIENT DU MODULE PUR, pas d'un seuil réécrit ici. */
  it('🔴 « disparu » se décide par `estDisparition`', () => {
    expect(code).toContain("import { estDisparition, motifDisparition } from './copieDisparue'");
    expect(code).toContain('if (estDisparition(r.statut))');
    expect(code).not.toContain('r.statut === 404');
  });
});

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   ⑥ 🔴🔴 « JUSTE APRÈS CHAQUE PASSE D'INDEXATION, ET PAS EN CONTINU »
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

describe('🔴🔴 le branchement sur la passe `changes.list`', () => {
  const balayage = readFileSync('app/scripts/indexer-empreintes-drive.ts', 'utf8');

  it('🔴🔴 il est lancé dans la branche de l’incrément, après les appels', () => {
    const i = balayage.indexOf("if (changements) {");
    const fin = balayage.indexOf('/* ── LE CHIFFRAGE', i);
    const bloc = balayage.slice(i, fin);
    expect(bloc).toContain('await nettoyerFantomes(portePourFantomes(h)');
    expect(bloc).toContain('journaliserFantomes(bilan, true)');
    // 🔴 APRÈS le compte des appels, donc après la passe : il ne s'intercale pas dedans.
    expect(bloc.indexOf('appels Drive émis')).toBeLessThan(bloc.indexOf('nettoyerFantomes'));
  });

  /** 🔴 PAS EN CONTINU : il n'est PAS dans la branche du balayage complet, qui ne rafraîchit pas l'index par `changes`. */
  it('🔴 une seule invocation dans tout le balayage', () => {
    expect((balayage.match(/nettoyerFantomes\(/g) ?? [])).toHaveLength(1);
  });

  /** ⚠️ IL SUIT LE MODE DE LA PASSE : `--changements` seul compte sans écrire. */
  it('⚠️ il hérite du mode de la passe', () => {
    expect(balayage).toContain('appliquer, dire: (l) => console.log(l),');
    expect(balayage).toContain('if (appliquer) await journaliserFantomes(bilan, true);');
  });

  /**
   * 🔴🔴 ET SURTOUT : LE BALAYAGE N'A TOUJOURS QU'UNE SEULE PORTE. C'est la preuve qu'il ne sait pas écrire dans
   * le Drive, et trois gardes statiques en dépendent. Le nettoyage reçoit CETTE porte par injection.
   */
  it('🔴🔴 toujours un seul `fetch` dans le balayage', () => {
    expect((balayage.match(/fetch\(/g) ?? [])).toHaveLength(1);
    expect(balayage).toContain('function portePourFantomes(h: HeadersInit): DepsFantomes {');
  });

  /**
   * ⚠️ UN NETTOYAGE QUI TOMBE NE FAIT PAS ÉCHOUER L'INCRÉMENT. La passe est faite, son jeton de reprise est
   * consigné : perdre le nettoyage coûte quinze minutes, perdre le jeton coûte neuf minutes de rebalayage.
   */
  it('⚠️ il ne peut pas faire échouer la passe', () => {
    /* ⚠️ ON CHERCHE L'APPEL, PAS L'IMPORT : `indexOf('nettoyerFantomes')` tombait sur la ligne d'import, qui
       n'est évidemment pas dans un `try`. L'épreuve passait alors… pour la mauvaise raison, puis échouait. */
    const i = balayage.indexOf('await nettoyerFantomes(');
    expect(i).toBeGreaterThan(-1);
    expect(balayage.slice(Math.max(0, i - 400), i)).toContain('try {');
  });
});
