import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * LOT LECTURE-HTML-FIL-TROMBONE — UN BROUILLON JETÉ PART À LA CORBEILLE, ET IL EN REVIENT.
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * 🔴🔴 CE QU'ARNO DEMANDAIT, ET POURQUOI CE N'ÉTAIT PAS POSSIBLE TEL QUEL.
 *
 * « Le brouillon part dans la CORBEILLE (état Gmail, comme un mail), d'où il peut être réintégré. »
 *
 * VÉRIFIÉ LE 29/09/2026 SUR LE VRAI COMPTE : Gmail l'accepte parfaitement — `messages.trash` sur le message d'un
 * brouillon rend `DRAFT TRASH`, le brouillon quitte la liste des brouillons, et `untrash` le ramène. Le blocage
 * n'est pas là.
 *
 * IL EST CHEZ NOUS : `gestion_brouillon` est NOTRE table. Elle ne porte aucun identifiant Gmail, et rien n'est
 * jamais poussé chez Google — nos brouillons n'existent pas dans Gmail, donc il n'y a RIEN à y mettre à la
 * corbeille. Décision d'Arno, prise en connaissance de cause : une corbeille LOCALE, montrée dans la même liste
 * que les mails, avec une capsule qui dit qu'elle est à nous.
 *
 * ═══ CE QUE CE FICHIER PROTÈGE ══════════════════════════════════════════════════════════════════════════════════
 *   ① RIEN N'EST JAMAIS SUPPRIMÉ — le geste DATE la ligne, il ne l'efface pas. Aucun `DELETE` dans ce module ;
 *   ② LE RETOUR EXISTE — et il rend le brouillon À SA PLACE, dans « Brouillons », avec son contenu et ses pièces ;
 *   ③ UN BROUILLON PARTI NE REVIENT PAS — ce n'est plus un brouillon, c'est un message ;
 *   ④ SANS LA MIGRATION 276, LA COLONNE N'EST NOMMÉE NULLE PART, et la corbeille est vide — pas en erreur.
 *
 * ═══ 🔴🔴 CE QUI A ÉTÉ RÉÉCRIT LE 29/09/2026, ET POURQUOI ═══════════════════════════════════════════════════════
 *
 * CE FICHIER ÉPROUVAIT `abandonne_le` COMME COLONNE DE LA CORBEILLE. C'était la première version du lot, et elle
 * s'est vue fausse à l'écran : `abandonne_le` existe depuis l'origine du module et veut dire « jeté POUR DE BON ».
 * La relire comme « jeté avec promesse de retour » change son sens RÉTROACTIVEMENT — mesuré sur la vraie base :
 * **34 brouillons abandonnés, dont 25 jetés du 24 au 29 septembre, AVANT ce lot**, tous réapparus d'un coup dans
 * la Corbeille, dont cinq « (sans objet) — sans destinataire » à la suite.
 *
 * 🔴 UN INVARIANT NE SE RÉÉCRIT PAS DANS LE PASSÉ. D'où `corbeille_le` (migration 276) : la colonne NOUVELLE date
 * le geste NOUVEAU. Les deux sont écrites ensemble — `abandonne_le` pour que « Brouillons » et son compteur se
 * comportent exactement comme avant, `corbeille_le` pour que la Corbeille le montre — et la réintégration efface
 * les deux. Les attentes d'alors sont RÉÉCRITES ci-dessous, pas retirées : c'est le même besoin, mieux servi.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */

const queryMock = vi.fn();
vi.mock('../db/client', () => ({
  query: (...a: unknown[]) => queryMock(...a),
  withTransaction: async (f: (q: unknown) => unknown) => f((...a: unknown[]) => queryMock(...a)),
}));
/**
 * ⚠️ `corbeilleBrouillon` EST UNE VARIABLE DU FICHIER, lue à chaque appel de la sonde : les cas « migration
 * absente » du bloc ④ la basculent, et `beforeEach` la remet à `true`. Une sonde figée à la déclaration du mock
 * ne permettrait d'éprouver qu'un seul des deux mondes.
 */
let corbeilleBrouillon = true;
vi.mock('./schema', () => ({
  redactionDisponible: async () => true,
  brouillonHtmlDisponible: async () => true,
  brouillonPieceDisponible: async () => false,
  corbeilleBrouillonDisponible: async () => corbeilleBrouillon,
  // 🔴 LOT CLASSER-DEUX-BOUTONS — la sonde du classement du brouillon (migration 285). Ce fichier éprouve la
  //   CORBEILLE : on la met à faux pour que son SQL reste celui d'avant ce lot.
  brouillonClassementDisponible: async () => false,
  // 🔴 LOT CLASSER-AVANT-ENVOI — idem pour la migration 289 : ce fichier éprouve la CORBEILLE.
  brouillonHorsGestionDisponible: async () => false,
}));

import {
  abandonnerBrouillon, brouillonsALaCorbeille, compterBrouillonsALaCorbeille, restaurerBrouillon,
} from './redactionRepo';

const SQL = (): string[] => queryMock.mock.calls.map((c) => String(c[0]).replace(/\s+/g, ' '));
const PARAMS = (i = 0): unknown[] => (queryMock.mock.calls[i]?.[1] ?? []) as unknown[];

beforeEach(() => {
  queryMock.mockReset();
  queryMock.mockResolvedValue({ rows: [], rowCount: 1 });
  corbeilleBrouillon = true;
});

describe('🔴 ① rien n’est jamais supprimé', () => {
  it('« Mettre à la corbeille » POSE une date, et n’efface rien', async () => {
    await abandonnerBrouillon(7);
    expect(SQL()[0]).toContain('UPDATE gestion_brouillon SET abandonne_le = now()');
    expect(SQL().join(' ').toUpperCase()).not.toContain('DELETE');
    expect(PARAMS(0)[0]).toBe(7);
  });

  /**
   * 🔴 LES DEUX COLONNES, ENSEMBLE. `abandonne_le` pour que « Brouillons » et son compteur ne voient aucune
   * différence ; `corbeille_le` pour que la Corbeille le montre. N'en écrire qu'une laisserait le brouillon
   * dans les deux listes, ou dans aucune.
   */
  it('🔴 le geste date `abandonne_le` ET `corbeille_le` — une seule vérité, deux lectures', async () => {
    await abandonnerBrouillon(7);
    expect(SQL()[0]).toContain('abandonne_le = now()');
    expect(SQL()[0]).toContain('corbeille_le = now()');
  });

  /**
   * ⚠️ `envoye_le IS NULL` DANS LA CONDITION : un brouillon déjà PARTI n'est plus un brouillon, et le jeter
   * reviendrait à prétendre défaire un envoi. La garde est dans la requête, pas dans l'appelant.
   */
  it('🔴 un brouillon déjà parti n’est pas jetable', async () => {
    await abandonnerBrouillon(7);
    expect(SQL()[0]).toContain('envoye_le IS NULL');
  });
});

describe('🔴 ② le retour existe, et il remet le brouillon à sa place', () => {
  it('« Réintégrer » remet les dates à NULL — le même verbe, par l’autre bout', async () => {
    queryMock.mockResolvedValue({ rows: [], rowCount: 1 });
    expect(await restaurerBrouillon(7)).toBe(true);
    expect(SQL()[0]).toContain('SET abandonne_le = NULL, corbeille_le = NULL');
  });

  /**
   * 🔴 ON NE RÉINTÈGRE QUE CE QUI EST À LA CORBEILLE. La condition porte sur `corbeille_le`, jamais sur
   * `abandonne_le` : les 25 brouillons jetés AVANT ce lot ont `abandonne_le` posé et `corbeille_le` à NULL —
   * lus par l'ancienne condition, ils seraient devenus réintégrables, donc de nouveau vivants.
   */
  it('🔴 la condition lit `corbeille_le`, pas `abandonne_le`', async () => {
    await restaurerBrouillon(7);
    expect(SQL()[0]).toContain('corbeille_le IS NOT NULL');
    expect(SQL()[0]).not.toContain('abandonne_le IS NOT NULL');
  });

  /**
   * 🔴 IL DIT S'IL A FAIT QUELQUE CHOSE. Un brouillon qui n'était pas à la corbeille (ou déjà parti) ne se
   * restaure pas : la route doit pouvoir répondre « ce brouillon n'y est pas » plutôt qu'un succès qui ment.
   */
  it('🔴 restaurer ce qui n’y est pas rend `false`, jamais un faux succès', async () => {
    queryMock.mockResolvedValue({ rows: [], rowCount: 0 });
    expect(await restaurerBrouillon(7)).toBe(false);
  });

  /** ⚠️ `maj_le` est touché : c'est la colonne sur laquelle « Brouillons » trie. Sans elle, il reviendrait au fond. */
  it('le brouillon réintégré remonte dans « Brouillons »', async () => {
    await restaurerBrouillon(7);
    expect(SQL()[0]).toContain('maj_le = now()');
  });
});

describe('🔴 ③ ce que la corbeille montre, et ce qu’elle compte', () => {
  it('la liste ne prend QUE les jetés, du plus récemment jeté au plus ancien', async () => {
    queryMock.mockResolvedValue({ rows: [] });
    await brouillonsALaCorbeille();
    const sql = SQL()[0];
    expect(sql).toContain('corbeille_le IS NOT NULL AND envoye_le IS NULL');
    expect(sql).toContain('ORDER BY corbeille_le DESC');
  });

  it('elle est BORNÉE : une corbeille se lit, elle ne défile pas', async () => {
    queryMock.mockResolvedValue({ rows: [] });
    await brouillonsALaCorbeille(999);
    expect(PARAMS(0)[0]).toBe(200);
    queryMock.mockReset();
    queryMock.mockResolvedValue({ rows: [] });
    await brouillonsALaCorbeille(-4);
    expect(PARAMS(0)[0]).toBe(1);
  });

  /**
   * 🔴 LE COMPTEUR COMPTE EXACTEMENT CE QUE LA LISTE MONTRE — même condition, écrite de la même façon. C'est la
   * règle du module depuis le lot BOITE-SENS : un compteur qui compte autrement fait chercher ailleurs ce qui est
   * sous les yeux, et c'est toujours le compteur qu'on croit.
   */
  it('🔴 le compteur porte la MÊME condition que la liste', async () => {
    queryMock.mockResolvedValue({ rows: [{ n: 3 }] });
    expect(await compterBrouillonsALaCorbeille()).toBe(3);
    expect(SQL()[0]).toContain('corbeille_le IS NOT NULL AND envoye_le IS NULL');
  });
});

/* ══════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   ④ SANS LA MIGRATION 276 — LE CODE TOURNE, ET NE MENT PAS
   ══════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

describe('🔴 ④ migration 276 absente : la colonne n’est NOMMÉE nulle part', () => {
  beforeEach(() => { corbeilleBrouillon = false; });

  /**
   * 🔴 LA RÈGLE DU MODULE : une sonde voyage AVEC la donnée qu'elle conditionne. Nommer une colonne absente ne
   * donne pas un résultat vide — cela fait ÉCHOUER la requête, donc l'écran entier.
   */
  it('🔴 jeter un brouillon fait exactement ce qu’il faisait avant ce lot', async () => {
    await abandonnerBrouillon(7);
    expect(SQL()[0]).toContain('abandonne_le = now()');
    expect(SQL()[0]).not.toContain('corbeille_le');
  });

  it('🔴 la corbeille est VIDE, et aucune requête n’est posée', async () => {
    expect(await brouillonsALaCorbeille()).toEqual([]);
    expect(await compterBrouillonsALaCorbeille()).toBe(0);
    expect(queryMock).not.toHaveBeenCalled();
  });

  /**
   * 🔴 ET LE RETOUR RÉPOND « NON », pas un faux succès. C'est ce « non » que la route rend à l'écran, et c'est
   * pourquoi l'éditeur, lui, ne propose même pas le geste : il redit « Supprimer le brouillon ». Une promesse de
   * retour qu'on ne peut pas tenir est pire que pas de promesse.
   */
  it('🔴 réintégrer rend `false` sans rien tenter', async () => {
    expect(await restaurerBrouillon(7)).toBe(false);
    expect(queryMock).not.toHaveBeenCalled();
  });
});

/* ══════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   LES MOTS DU GESTE SUIVENT LA MIGRATION
   ══════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

describe('🔴 l’écran dit ce qui va VRAIMENT se passer', () => {
  it('avec la corbeille : « Mettre à la corbeille », et un retour', async () => {
    const { motsJeterBrouillon } = await import('./redaction');
    const m = motsJeterBrouillon(true);
    expect(m.infobulle).toBe('Mettre à la corbeille');
    expect(m.question).toContain('réintégré');
    expect(m.reversible).toBe(true);
  });

  /** 🔴 SANS ELLE, LE MOT D'AVANT REVIENT — et il ne promet rien : c'est ce qui se passe. */
  it('🔴 sans la corbeille : « Supprimer le brouillon », et aucun bandeau', async () => {
    const { motsJeterBrouillon } = await import('./redaction');
    const m = motsJeterBrouillon(false);
    expect(m.infobulle).toBe('Supprimer le brouillon');
    expect(m.question).toContain('sans retour possible');
    expect(m.reversible).toBe(false);
  });
});

/**
 * ══ 🔒 GARDE STATIQUE — CE QUE LE MODULE FAIT, ET PAR QUELLE SEULE PORTE ════════════════════════════════════════
 *
 * ═══ 🔴🔴 REQUALIFIÉ LE 07/10/2026 — LOT BROUILLON-ACCES-SUPPRESSION ═══════════════════════════════════════════
 *
 * CE TEST DISAIT « AUCUN `DELETE` SUR LES BROUILLONS », et c'était vrai : jeter un brouillon le DATAIT
 * (`abandonne_le`, `corbeille_le`), et il restait en base, réintégrable. La garde protégeait cette promesse.
 *
 * 🔴 ARNO L'A LEVÉE, EXPRESSÉMENT ET EN CONNAISSANCE DE CAUSE (07/10/2026) : « un bouton “Supprimer le
 * brouillon” […] confirmation “Supprimer définitivement ce brouillon ?” […] le brouillon est supprimé en base ».
 * Le mot « définitivement » est de lui. Une corbeille reste offerte à côté, par son propre bouton : c'est la
 * personne qui choisit entre les deux gestes, et non plus le dépôt qui en interdit un.
 *
 * 🔴 CE QUE LA GARDE DEVIENT, ET POURQUOI ELLE RESTE UTILE. Elle ne demande plus l'absence du geste, elle demande
 * son UNICITÉ : un seul `DELETE`, dans la seule fonction qui l'annonce par son nom. Un `DELETE` glissé ailleurs —
 * dans `abandonnerBrouillon`, dans la lecture d'une liste, dans une branche d'erreur — ferait disparaître du
 * travail humain sans que personne l'ait demandé, et c'est CELA que la garde empêche désormais.
 */
describe('🔒 garde statique', () => {
  it('🔴 un seul DELETE, et seulement dans la suppression définitive', async () => {
    const { readFileSync } = await import('node:fs');
    const brut = readFileSync('app/lib/gestion/redactionRepo.ts', 'utf8');
    // ⚠️ Les commentaires sont retirés : ce module RACONTE ce qu'il fait et ne fait pas, et les mots y figurent.
    const code = brut.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/[^\n]*/g, ' ');
    const haut = code.toUpperCase();
    expect((haut.match(/DELETE FROM GESTION_BROUILLON/g) ?? []), 'un seul, pas deux').toHaveLength(1);
    /* 🔴 ET IL EST DANS LA FONCTION QUI LE DIT. On mesure la distance entre la déclaration et le `DELETE` : au-delà
       du corps de cette fonction, c'est qu'il a été écrit ailleurs. */
    const iFonction = code.indexOf('export async function supprimerBrouillonDefinitivement');
    const iDelete = haut.indexOf('DELETE FROM GESTION_BROUILLON');
    expect(iFonction, 'la fonction nommée existe').toBeGreaterThan(0);
    expect(iDelete).toBeGreaterThan(iFonction);
    /* ⚠️ ON REPART APRÈS SA PROPRE DÉCLARATION (`+ 1`), sinon c'est elle qu'on trouverait. */
    expect(code.slice(iFonction + 1, iDelete), 'le DELETE est dans SON corps')
      .not.toContain('export async function ');
  });

  /** 🔴 ET LE GESTE DE LA CORBEILLE, LUI, N'A PAS CHANGÉ D'UNE LIGNE : il DATE, il ne supprime pas. */
  it('🔴 « mettre à la corbeille » ne supprime toujours rien', async () => {
    const { readFileSync } = await import('node:fs');
    const brut = readFileSync('app/lib/gestion/redactionRepo.ts', 'utf8');
    const code = brut.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/[^\n]*/g, ' ');
    const debut = code.indexOf('export async function abandonnerBrouillon');
    const corps = code.slice(debut, code.indexOf('\n}', debut));
    expect(corps.toUpperCase()).not.toContain('DELETE');
    expect(corps.replace(/\s+/g, ' ')).toContain('UPDATE gestion_brouillon SET abandonne_le = now()');
  });
});
