import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';

/**
 * ══ 🔴🔴 LOT TRANSFERT-AVEC-PIECES — CE QUI EST REPRIS, ET CE QUI NE L'EST PAS ══════════════════════════════════
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * RÈGLE D'ARNO (03/10/2026) : « TOUTES les vraies pièces jointes du message transféré sont jointes au brouillon,
 * cochées par défaut. Pas les images intégrées (signatures, logos) : même critère que le compteur. »
 * « Répondre et Répondre à tous : AUCUNE pièce reprise par défaut, comme Gmail. »
 * « Si le transfert concerne une conversation, seules les pièces DU message transféré sont reprises. »
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */

const queryMock = vi.fn();
vi.mock('../db/client', () => ({ query: (...a: unknown[]) => queryMock(...a) }));
let migration252 = true;
let migration296 = true;
vi.mock('./schema', () => ({
  piecesEnvoiDisponibles: async () => migration252,
  fileEnvoiDisponible: async () => true,
  pieceIntegreeDisponible: async () => migration296,
  nomUsageDisponible: async () => false,
}));

import { cocherPiece, listerPieces, reprendrePiecesDuMessage } from './brouillonPieceRepoBase';

const sql = () => queryMock.mock.calls.map((c) => String(c[0]).replace(/\s+/g, ' '));
const params = (i = 0) => queryMock.mock.calls[i][1] as unknown[];

beforeEach(() => {
  migration252 = true; migration296 = true;
  queryMock.mockReset();
  queryMock.mockResolvedValue({ rows: [], rowCount: 0 });
});

describe('🔴🔴 ① la reprise ne prend que les VRAIES pièces', () => {
  /**
   * 🔴🔴 LE MÊME FRAGMENT QUE LES CINQ COMPTEURS ET LE TROMBONE (`sqlEstVraiePiece`). Arno : « même critère que le
   * compteur ». En écrire un second ferait partir dans un transfert ce que la ligne ne compte pas — et personne
   * ne saurait laquelle des deux règles a raison.
   */
  it('🔴🔴 les images intégrées et les jumeaux macOS sont écartés', async () => {
    await reprendrePiecesDuMessage(7, 42);
    const requete = sql()[0];
    expect(requete).toContain("nom_fichier NOT LIKE '._%'");
    expect(requete).toContain('coalesce(p.integree, false)');
    expect(requete).toContain('image/%');
  });

  /** 🔴 SANS LA MIGRATION 296, la colonne n'est NOMMÉE NULLE PART : la reprise retombe sur la règle de nom/taille. */
  it('🔴 sans la migration 296, `integree` n’est pas nommée', async () => {
    migration296 = false;
    await reprendrePiecesDuMessage(7, 42);
    expect(sql()[0]).not.toContain('integree');
  });

  /**
   * 🔴🔴 UNE PIÈCE SANS OCTETS EST REPRISE QUAND MÊME, MAIS DÉCOCHÉE. Avant ce lot, la condition
   * `cle_stockage IS NOT NULL` la faisait DISPARAÎTRE : on ne savait même pas qu'elle avait existé.
   */
  it('🔴🔴 une pièce sans octets entre, avec sa case déjà décochée', async () => {
    await reprendrePiecesDuMessage(7, 42);
    const requete = sql()[0];
    expect(requete).toContain('CASE WHEN p.cle_stockage IS NULL THEN now() END');
    // ⚠️ ET LA CONDITION QUI L'EXCLUAIT A DISPARU.
    expect(requete).not.toContain('WHERE p.message_id = $2 AND p.cle_stockage IS NOT NULL');
  });

  /** 🔴 SEULES LES PIÈCES DU MESSAGE TRANSFÉRÉ, jamais celles de la conversation : la clause le dit. */
  it('🔴 la reprise est bornée à UN message', async () => {
    await reprendrePiecesDuMessage(7, 42);
    expect(sql()[0]).toContain('p.message_id = $2');
    expect(sql()[0]).not.toContain('fil_id');
    expect(params()).toEqual([7, 42]);
  });

  /** ⚠️ IDEMPOTENT, ET IL LE RESTE : une pièce décochée à la main n'est pas ressuscitée par l'enregistrement suivant. */
  it('⚠️ `NOT EXISTS` regarde la ligne, pas son `retire_le`', async () => {
    await reprendrePiecesDuMessage(7, 42);
    const requete = sql()[0];
    expect(requete).toContain('NOT EXISTS');
    expect(requete).toContain('b.piece_id = p.id');
    expect(requete).not.toContain('b.retire_le IS NULL');
  });

  it('⚠️ sans la migration 252, aucune requête n’est émise', async () => {
    migration252 = false;
    expect(await reprendrePiecesDuMessage(7, 42)).toBe(0);
    expect(queryMock).not.toHaveBeenCalled();
  });
});

describe('🔴🔴 ② la lecture rend les cochées ET les décochées', () => {
  it('🔴🔴 elle ne filtre plus `retire_le`, sinon on ne pourrait plus recocher', async () => {
    await listerPieces(7);
    const requete = sql()[0];
    expect(requete).toContain('(bp.retire_le IS NULL) AS cochee');
    expect(requete).not.toMatch(/WHERE bp\.brouillon_id = \$1 AND bp\.retire_le IS NULL/);
  });

  /** 🔒 `disponible` EST UN BOOLÉEN, jamais le chemin de l'objet : aucune clé de stockage ne sort vers l'écran. */
  it('🔒 la disponibilité sort en booléen, pas en clé de stockage', async () => {
    await listerPieces(7);
    const requete = sql()[0];
    expect(requete).toContain('p.cle_stockage IS NOT NULL) AS disponible');
    expect(requete).not.toMatch(/SELECT[^)]*p\.cle_stockage(?!\s+IS)/);
  });

  it('🔴 un fichier AJOUTÉ est toujours disponible : ses octets viennent du dépôt lui-même', async () => {
    queryMock.mockResolvedValue({
      rows: [{ id: 1, nom_fichier: 'x.pdf', type_mime: null, taille_octets: '5', piece_id: null, cochee: true, disponible: true }],
    });
    const r = await listerPieces(7);
    expect(r[0]).toMatchObject({ origine: 'ajoutee', cochee: true, disponible: true });
  });
});

describe('🔴🔴 ③ cocher et décocher', () => {
  it('🔴 décocher pose `retire_le`', async () => {
    await cocherPiece(7, 3, false);
    expect(sql()[0]).toContain('SET retire_le = now()');
  });

  /**
   * 🔒 RECOCHER UNE PIÈCE SANS OCTETS EST REFUSÉ EN SQL, pas à l'écran. Une requête forgée ne doit pas pouvoir
   * faire partir un envoi voué à l'échec — c'est la demande d'Arno, tenue où elle ne se contourne pas.
   */
  it('🔒🔒 recocher exige que les octets existent', async () => {
    await cocherPiece(7, 3, true);
    const requete = sql()[0];
    expect(requete).toContain('SET retire_le = NULL');
    expect(requete).toContain('p.cle_stockage IS NOT NULL');
  });
});

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   ④ RÉPONDRE NE REPREND RIEN — ET C'EST LA ROUTE QUI LE TIENT
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

describe('🔴🔴 ④ Répondre et Répondre à tous ne reprennent aucune pièce', () => {
  const route = readFileSync('app/(admin)/api/admin/gestion/brouillons/route.ts', 'utf8');

  /** 🔴 ARNO : « comme Gmail. Ne change rien de ce côté. » La condition est là, et elle ne vise que le transfert. */
  it('🔴🔴 la reprise n’est appelée que pour `transferer`', () => {
    expect(route).toContain("if (voie === 'transferer' && brouillon.repondAMessageId !== null)");
    expect((route.match(/reprendrePiecesDuMessage\(/g) ?? [])).toHaveLength(1);
  });
});

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   ⑤ L'ÉDITEUR OUVRE LE BROUILLON TOUT DE SUITE — c'est le défaut d'Arno
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

describe('🔴🔴 ⑤ un transfert naît avec ses pièces', () => {
  const editeur = readFileSync('app/(admin)/admin/(protected)/gestion/Redaction.tsx', 'utf8');

  /**
   * 🔴🔴 LE DÉFAUT D'ARNO, ET SA CAUSE. La reprise marchait, mais elle est faite par l'ENREGISTREMENT du
   * brouillon — et un brouillon qu'on vient d'ouvrir n'est pas encore enregistré. Tant qu'on n'avait pas tapé une
   * lettre, il n'existait pas, donc ses pièces non plus, et la zone était vide.
   */
  it('🔴🔴 l’éditeur enregistre d’emblée un transfert neuf', () => {
    expect(editeur).toContain("brouillon.voie === 'transferer' && brouillon.id === null");
    expect(editeur).toContain('void assurerBrouillon();');
  });

  /** 🔴 ET SEULEMENT UN TRANSFERT : créer un brouillon d'avance pour une réponse poserait une ligne vide. */
  it('🔴 une réponse n’est pas enregistrée d’avance', () => {
    const i = editeur.indexOf('const transfertNeuf');
    expect(i).toBeGreaterThan(0);
    const bloc = editeur.slice(i, i + 400);
    expect(bloc).not.toContain("'repondre'");
  });
});
