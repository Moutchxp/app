import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';

// Base MOCKÉE : aucune connexion réelle, aucune écriture possible.
const queryMock = vi.fn();
vi.mock('../db/client', () => ({ query: (...a: unknown[]) => queryMock(...a) }));
const schemaMock = vi.fn();
vi.mock('./schema', () => ({ corbeilleGmailDisponible: () => schemaMock() }));

import {
  compterCorbeille, deuxEcritures, idsDeLaCorbeille, marquerCorbeille, reconcilier, tracerSuppression,
} from './corbeilleRepo';

/**
 * ══ 🔴🔴 RÉÉCRIT PAR LE LOT BOITE-INTERNE-CORBEILLE (29/09/2026) ═══════════════════════════════════════════════════
 *
 * CE QUE CE FICHIER ÉPROUVAIT (lot 5-BOITE-3) : une corbeille INTERNE, posée sur `gestion_fil`, qui ne touchait
 * RIEN dans Gmail — « supprimer » voulait dire « je ne veux plus voir cet échange dans mes boîtes ». La garantie
 * scellée ici était donc « aucune écriture dans Gmail ».
 *
 * CE QUE C'EST DEVENU. Décision d'Arno du 29/09/2026 : c'est la corbeille de GMAIL qui fait foi, un seul état
 * synchronisé, comme le spam et le lu/non lu. La garantie d'alors est donc RETOURNÉE, en toute connaissance de
 * cause — et elle est remplacée par une garantie plus forte, parce que le geste porte désormais pour de vrai :
 *
 *   ① AUCUNE ligne n'est jamais effacée — on pose ou l'on retire une DATE, et le journal garde les deux gestes ;
 *   ② la base n'est touchée QU'APRÈS Gmail, jamais avant (c'est la route qui l'ordonne, ce fichier ne sait qu'écrire) ;
 *   ③ la RÉCONCILIATION va dans les DEUX SENS : ce qui n'est plus dans le dossier de Gmail n'est plus à la corbeille ;
 *   ④ sans la migration 275, AUCUNE requête n'est émise — nommer une colonne absente ferait échouer toute la boîte ;
 *   ⑤ la suppression définitive laisse une TRACE et n'efface RIEN chez nous, ni au Drive.
 */

const SQL = (): string[] => queryMock.mock.calls.map((c) => String(c[0]).replace(/\s+/g, ' '));
const TOUT = (): string => SQL().join(' || ');
const PARAMS = (i = 0): unknown[] => (queryMock.mock.calls[i]?.[1] ?? []) as unknown[];
const AUTEUR = { id: 3, libelle: 'Arnaud Jorel' };

beforeEach(() => {
  queryMock.mockReset();
  queryMock.mockResolvedValue({ rows: [], rowCount: 2 });
  schemaMock.mockReset().mockResolvedValue(true);
});

describe('🔴 ④ sans la migration 275', () => {
  it('aucune requête n’est émise, et on le DIT à l’appelant', async () => {
    schemaMock.mockResolvedValue(false);
    expect(await marquerCorbeille([5], true, AUTEUR)).toEqual({ etat: 'sans_schema' });
    expect(await compterCorbeille()).toBeNull();
    expect(await idsDeLaCorbeille()).toBeNull();
    expect(await reconcilier(['<a@b>'])).toBeNull();
    expect(queryMock).not.toHaveBeenCalled();
  });
});

describe('🔴 ① rien n’est jamais effacé', () => {
  it('« mettre à la corbeille » POSE une date, sans rien supprimer', async () => {
    expect(await marquerCorbeille([5, 6], true, AUTEUR)).toEqual({ etat: 'ok', touches: 2 });
    expect(SQL()[0]).toContain('UPDATE gestion_message SET corbeille_le = coalesce(corbeille_le, now())');
    expect(PARAMS(0)[0]).toEqual([5, 6]);
    expect(TOUT().toUpperCase()).not.toContain('DELETE');
  });

  /**
   * 🔴 `coalesce(corbeille_le, now())` ET NON `now()` SEC. Repasser sur un mail DÉJÀ à la corbeille ne doit pas
   * rajeunir sa date : elle dit « depuis quand », et c'est elle qui permettra de prévenir qu'un mail approche des
   * 30 jours au bout desquels GMAIL l'efface lui-même. Une date remise à zéro repousserait une échéance qui, elle,
   * ne bouge pas.
   */
  it('🔴 la date ne rajeunit pas si le mail y est déjà', async () => {
    await marquerCorbeille([5], true, AUTEUR);
    expect(SQL()[0]).toContain('coalesce(corbeille_le, now())');
    expect(SQL()[0]).not.toMatch(/SET corbeille_le = now\(\)/);
  });

  it('« réintégrer » remet la date à NULL — le même verbe, par l’autre bout', async () => {
    await marquerCorbeille([5], false, AUTEUR);
    expect(SQL()[0]).toContain('SET corbeille_le = NULL');
  });

  it('les deux gestes sont JOURNALISÉS, avec l’auteur figé en texte', async () => {
    await marquerCorbeille([5, 6], true, AUTEUR);
    const journal = SQL().find((s) => s.includes('INSERT INTO gestion_journal')) ?? '';
    expect(journal).toContain("'message'");
    const p = (queryMock.mock.calls.find((c) => String(c[0]).includes('gestion_journal'))?.[1] ?? []) as unknown[];
    expect(p[0]).toEqual([5, 6]);
    expect(p[1]).toBe('corbeille');
    expect(p[6]).toBe('Arnaud Jorel');
  });

  /**
   * ⚠️ LE JOURNAL NE DOIT JAMAIS DÉFAIRE UN GESTE QUI A EU LIEU. Le geste, lui, s'est produit dans la VRAIE boîte
   * Gmail : échouer à l'écrire ici est regrettable, le remonter comme une erreur serait faux — et ferait cliquer
   * une seconde fois sur un bouton qui a déjà agi.
   */
  it('🔴 un journal en échec ne défait pas le geste', async () => {
    queryMock.mockImplementation(async (sql: string) => {
      if (String(sql).includes('gestion_journal')) throw new Error('journal indisponible');
      return { rows: [], rowCount: 1 };
    });
    await expect(marquerCorbeille([5], true, AUTEUR)).resolves.toEqual({ etat: 'ok', touches: 1 });
  });

  it('une liste VIDE n’émet aucune requête : il n’y a rien à faire', async () => {
    expect(await marquerCorbeille([], true, AUTEUR)).toEqual({ etat: 'ok', touches: 0 });
    expect(queryMock).not.toHaveBeenCalled();
  });
});

describe('🔴 ③ la réconciliation va dans les DEUX SENS', () => {
  /**
   * 🔴 C'EST CE SECOND SENS QUI FAIT DU MIROIR UN MIROIR. Poser seulement laisserait à la corbeille un mail que
   * quelqu'un a réintégré depuis Gmail sur son téléphone : il y resterait pour toujours, invisible dans ses
   * vraies boîtes. Gmail fait foi.
   */
  it('pose sur ce qui est dans le dossier, RETIRE de tout le reste', async () => {
    // ⚠️ La 1re requête est le COMPTE DE CORRESPONDANCE (garde-fou) : la pose et le retrait viennent après.
    queryMock.mockResolvedValue({ rows: [{ n: 2 }], rowCount: 2 });
    const r = await reconcilier(['a@x', 'b@x']);
    expect(r).toEqual({ poses: 2, retires: 2 });
    const [, pose, retire] = SQL();
    expect(pose).toContain('SET corbeille_le = coalesce(corbeille_le, now())');
    expect(pose).toContain('message_id = ANY($1::text[]) AND corbeille_le IS NULL');
    expect(retire).toContain('SET corbeille_le = NULL');
    expect(retire).toContain('corbeille_le IS NOT NULL AND NOT (message_id = ANY($1::text[]))');
  });

  /* ════════════════════════════════════════════════════════════════════════════════════════════════════════════
     🔴🔴 LE DÉFAUT DU 29/09/2026 — LES CHEVRONS, ET LA COLONNE VIDÉE EN SILENCE
     ════════════════════════════════════════════════════════════════════════════════════════════════════════════

     CE QUI S'EST PASSÉ, EN PRODUCTION LOCALE : notre colonne `message_id` garde le `Message-ID` TEL QUEL, chevrons
     compris (`<CAJ6+kPH…@mail.gmail.com>`). La première version de la relève ôtait les chevrons avant de comparer.
     Sur 16 mails lus dans « [Gmail]/Corbeille » : ZÉRO correspondance, donc « aucun de nos mails n'est dans la
     corbeille », donc la marque retirée de TOUS. La colonne est passée de 10 à 0, sans une erreur, sans un mot.

     DEUX PROTECTIONS EN SORTENT, et les deux sont éprouvées ici :
       ① on accepte les DEUX écritures, des deux côtés — on n'impose pas une forme à un serveur IMAP ;
       ② « le dossier n'est pas vide et rien ne correspond » est une SIGNATURE DE PANNE, pas un état : on refuse
          alors de retirer quoi que ce soit.
     ════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

  it('🔴 les DEUX écritures sont envoyées : avec et sans chevrons', () => {
    expect(deuxEcritures(['<a@x>']).sort()).toEqual(['<a@x>', 'a@x']);
    expect(deuxEcritures(['a@x']).sort()).toEqual(['<a@x>', 'a@x']);
  });

  it('🔴 un identifiant chevronné retrouve son jumeau nu, et réciproquement', async () => {
    queryMock.mockResolvedValue({ rows: [{ n: 1 }], rowCount: 1 });
    await reconcilier(['<a@x>', 'b@x']);
    const envoyes = PARAMS(0)[0] as string[];
    for (const attendu of ['a@x', '<a@x>', 'b@x', '<b@x>']) expect(envoyes).toContain(attendu);
  });

  /**
   * 🔴 L'ÉGALITÉ RESTE UNE ÉGALITÉ. `btrim(message_id, '<>')` aurait été plus court — et aurait écarté l'index
   * UNIQUE de la colonne, faisant balayer 57 000 messages deux fois par passe. La normalisation est donc du côté
   * du PARAMÈTRE, jamais de la colonne.
   */
  it('🔴 aucune fonction n’est appliquée à la COLONNE : l’index doit servir', async () => {
    queryMock.mockResolvedValue({ rows: [{ n: 1 }], rowCount: 1 });
    await reconcilier(['a@x']);
    expect(TOUT()).not.toContain('btrim(message_id');
    expect(TOUT()).not.toContain('lower(message_id');
  });

  it('🔴 dossier NON vide + aucune correspondance ⇒ on REFUSE de retirer, et on le dit', async () => {
    queryMock.mockResolvedValue({ rows: [{ n: 0 }], rowCount: 5 });
    const r = await reconcilier(['a@x', 'b@x']);
    expect(r).toEqual({ poses: 0, retires: 0, refuse: 'aucune_correspondance' });
    // 🔴 UNE SEULE REQUÊTE A ÉTÉ ÉMISE — celle qui compte. Aucun UPDATE n'est parti.
    expect(SQL()).toHaveLength(1);
    expect(TOUT().toUpperCase()).not.toContain('UPDATE');
  });

  it('dédoublonne, et n’émet jamais de chaîne vide', async () => {
    queryMock.mockResolvedValue({ rows: [{ n: 1 }], rowCount: 1 });
    await reconcilier(['a@x', ' a@x ', '<a@x>', '', '   ']);
    expect((PARAMS(0)[0] as string[]).sort()).toEqual(['<a@x>', 'a@x']);
  });

  /**
   * 🔴 UNE CORBEILLE VIDE EST UNE RÉPONSE, PAS UNE PANNE : elle retire la marque de tout le monde, ce qui est
   * exactement juste — Gmail ne contient plus rien. C'est la relève, et elle seule, qui refuse de réconcilier
   * quand elle n'a PAS PU LIRE le dossier (cf. `reconcilierCorbeille`).
   */
  it('🔴 un dossier vide vide la corbeille, et c’est la vérité', async () => {
    queryMock.mockResolvedValue({ rows: [{ n: 0 }], rowCount: 2 });
    const r = await reconcilier([]);
    expect(r).toEqual({ poses: 2, retires: 2 });
    // ⚠️ AUCUN REFUS ICI, et c'est le point : zéro correspondance sur un dossier VIDE est la vérité, pas une
    //    panne. Le garde-fou ne se déclenche que si le dossier porte des mails.
    expect(SQL().at(-1)).toContain('SET corbeille_le = NULL');
  });

  it('aucun DELETE, dans aucun des deux sens', async () => {
    queryMock.mockResolvedValue({ rows: [{ n: 1 }], rowCount: 1 });
    await reconcilier(['a@x']);
    expect(TOUT().toUpperCase()).not.toContain('DELETE');
  });
});

describe('🔴 ⑤ la suppression définitive laisse une trace, et n’efface rien chez nous', () => {
  it('elle journalise, et n’émet AUCUN DELETE ni UPDATE', async () => {
    await tracerSuppression([7, 8], AUTEUR);
    expect(SQL()).toHaveLength(1);
    expect(SQL()[0]).toContain('INSERT INTO gestion_journal');
    expect(TOUT().toUpperCase()).not.toContain('DELETE');
    expect(TOUT().toUpperCase()).not.toContain('UPDATE');
  });

  it('le commentaire DIT que le Drive n’est pas touché, et que notre copie reste', async () => {
    await tracerSuppression([7], AUTEUR);
    const p = PARAMS(0);
    expect(p[1]).toBe('suppression_definitive');
    expect(String(p[4])).toContain('Drive');
    expect(String(p[4])).toContain('Irréversible');
  });
});

describe('la liste et le compteur disent la MÊME chose', () => {
  it('les deux comptent des ÉCHANGES, pas des messages', async () => {
    queryMock.mockResolvedValue({ rows: [{ n: 4, fil_id: '9', total: '4', mails: '6' }], rowCount: 1 });
    expect(await compterCorbeille()).toBe(4);
    expect(SQL()[0]).toContain('count(DISTINCT fil_id)');
    queryMock.mockReset();
    queryMock.mockResolvedValue({ rows: [{ fil_id: '9', total: '4', mails: '6' }] });
    const tout = await idsDeLaCorbeille();
    expect(tout).toEqual({ ids: [9], total: 4, mails: 6 });
  });

  /**
   * 🔴 LA BORNE EST APPLIQUÉE À LA REQUÊTE, pas après. Un geste irréversible ne doit pas pouvoir être demandé sur
   * une liste qu'on n'a pas su montrer ; l'écran, lui, DIT combien il a pris (`total` peut dépasser `ids`).
   */
  it('🔴 la sélection est bornée, et la borne entre dans le SQL', async () => {
    queryMock.mockResolvedValue({ rows: [] });
    await idsDeLaCorbeille(999_999);
    expect(SQL()[0]).toContain('LIMIT $1');
    expect(PARAMS(0)[0]).toBe(1_000);
    queryMock.mockReset();
    queryMock.mockResolvedValue({ rows: [] });
    await idsDeLaCorbeille(-3);
    expect(PARAMS(0)[0]).toBe(1);
  });
});

/**
 * 🔒 GARDE STATIQUE — CE FICHIER N'EFFACE RIEN, JAMAIS.
 *
 * Écrit sur le TEXTE du module plutôt que sur son comportement, parce que c'est une promesse faite à Arno et non
 * une propriété d'un cas d'essai : un `DELETE` ajouté dans une branche qu'aucun test ne traverse passerait
 * autrement inaperçu. La suppression, elle, a lieu chez GOOGLE, et nulle part ailleurs.
 */
describe('🔒 garde statique', () => {
  const brut = readFileSync('app/lib/gestion/corbeilleRepo.ts', 'utf8');
  /**
   * ⚠️ LES COMMENTAIRES SONT RETIRÉS AVANT D'ASSERTER — règle du dépôt. Ce module RACONTE ce qu'était la corbeille
   * interne et pourquoi elle ne l'est plus : il nomme donc `gestion_fil` en toutes lettres, et un garde posé sur
   * le texte brut interdirait d'expliquer ce qu'on a remplacé. C'est le CODE qu'on surveille, pas la prose.
   */
  const source = brut.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/[^\n]*/g, ' ');

  it('aucun DELETE dans le module', () => {
    expect(source.toUpperCase()).not.toContain('DELETE FROM');
  });

  it('🔴 la colonne de la corbeille INTERNE (migration 251) n’est plus lue nulle part', () => {
    expect(source).not.toContain('gestion_fil');
  });

  it('🔴 le module ne parle JAMAIS au Drive ni à Google', () => {
    expect(source).not.toContain('drive');
    expect(source).not.toContain('googleapis');
    expect(source).not.toContain('fetch(');
  });
});
