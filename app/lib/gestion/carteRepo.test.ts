import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';

const queryMock = vi.fn();
vi.mock('../db/client', () => ({ query: (...a: unknown[]) => queryMock(...a) }));

import { lireCarte, lireMessagesDuFil, lirePieceAServir, MAX_MESSAGES } from './carteRepo';

/** LOT 4d — aucun partenaire interne par défaut : le comportement doit être celui d'avant la migration 233. */
const CTX = { partenaires: [], adresseGestion: 'gestion@criterimmo.fr', deplacements: false };

/**
 * LOT 4c — la lecture du côté droit. Trois exigences y sont vérifiées :
 *   · LECTURE SEULE (aucun INSERT/UPDATE/DELETE ne sort de ce fichier) ;
 *   · le RATTACHEMENT ACTIF fait foi (une affectation défaite reste en base, mais n'est plus la vérité du jour) ;
 *   · aucune clé de stockage ne remonte vers l'écran.
 * Les requêtes sont éprouvées par FRAGMENTS sémantiques sur une chaîne normalisée, jamais par une regex sur le SQL
 * entier (convention AGENTS.md : figer la forme d'un SQL le casse au premier reformatage).
 */
const sqls = () => queryMock.mock.calls.map((c) => c[0] as string).map((s) => s.replace(/\s+/g, ' '));
const params = (i: number) => queryMock.mock.calls[i][1] as unknown[];

beforeEach(() => { queryMock.mockReset(); queryMock.mockResolvedValue({ rows: [] }); });

describe('le détail d’une carte', () => {
  const EVENEMENT = {
    evenement_id: 9, reference: 'GES-2026-000009', objet: 'Fuite', demandeur_nom: 'Mme M.',
    demandeur_email: 'm@x.fr', adresse_libre: '28 avenue Marceau', etat: 'en_cours',
    ouvert_le: '2026-09-01T10:00:00Z', ouvert_par: 'arno', traite_le: null, traite_par: null,
  };

  it('rend ce que la carte porte, et ses échanges rattachés', async () => {
    queryMock
      .mockResolvedValueOnce({ rows: [EVENEMENT] })
      .mockResolvedValueOnce({ rows: [
        { fil_id: 5, objet: 'Fuite', interlocuteur: 'Mme M.', de_adresse: 'm@x.fr', dernier_le: '2026-09-20T12:00:00Z', nb_messages: 6, nb_pieces: 2, attend: true },
      ] });
    const carte = await lireCarte(9, CTX);
    expect(carte).toMatchObject({ evenementId: 9, reference: 'GES-2026-000009', etat: 'en_cours', ouvertPar: 'arno' });
    expect(carte?.fils).toEqual([
      { filId: 5, objet: 'Fuite', interlocuteur: 'Mme M.', dernierLe: '2026-09-20T12:00:00Z', nbMessages: 6, nbPieces: 2, attend: true },
    ]);
  });

  it('ne retient que les affectations ACTIVES — un échange détaché n’est plus sur la carte', async () => {
    queryMock.mockResolvedValueOnce({ rows: [EVENEMENT] }).mockResolvedValue({ rows: [] });
    await lireCarte(9, CTX);
    expect(sqls()[1]).toContain('a.evenement_id = $1 AND a.actif');
  });

  it('un état inconnu en base retombe sur « à traiter » plutôt que de casser l’écran', async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ ...EVENEMENT, etat: 'zzz' }] }).mockResolvedValue({ rows: [] });
    expect((await lireCarte(9, CTX))?.etat).toBe('a_traiter');
  });

  it('carte inconnue → null, et AUCUNE seconde requête n’est lancée pour rien', async () => {
    queryMock.mockResolvedValue({ rows: [] });
    expect(await lireCarte(9, CTX)).toBeNull();
    expect(queryMock).toHaveBeenCalledTimes(1);
  });
});

describe('les messages d’un échange', () => {
  const MESSAGE = {
    message_id: 1, sens: 'recu', de_adresse: 'locataire@exemple.test', de_nom: 'Mme M.',
    recu_le: '2026-09-20T12:00:00Z', objet: 'Fuite', corps: 'Bonjour, fuite.', automatique: false,
  };

  it('se lisent du PLUS ANCIEN au plus récent — l’ordre d’une conversation', async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ id: 5 }] }).mockResolvedValue({ rows: [] });
    await lireMessagesDuFil(5);
    // Repéré par son contenu, pas par sa position : une sonde de schéma précède désormais la lecture (lot 5b).
    expect(sqls().find((x) => x.includes('WITH msg AS'))).toContain('ORDER BY recu_le ASC, message_id ASC');
  });

  /**
   * 🔴 LOT 5b — CE TEST A CHANGÉ DE SENS, sur décision d'Arno du 24/09/2026, et le changement est le point du lot :
   * les messages écartés par une règle n'étaient affichés NULLE PART. Ils apparaissent désormais DANS leur
   * conversation, à leur place chronologique et signalés par un mot — sans jamais revenir dans la FILE DE TRI.
   * C'est la logique de Gmail : les promotions sont rangées ailleurs, pas retirées du fil.
   */
  it('les messages écartés sont DANS la conversation (et toujours hors de la file de tri)', async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ id: 5 }] }).mockResolvedValue({ rows: [] });
    await lireMessagesDuFil(5);
    expect(sqls().find((x) => x.includes('WITH msg AS'))).not.toContain('exclu_le IS NULL');
    // …et la file de tri, elle, les écarte toujours : les deux lectures sont distinctes et le restent.
    const { readFileSync } = await import('node:fs');
    expect(readFileSync('app/lib/gestion/fileRepo.ts', 'utf8')).toContain('exclu_le IS NULL');
  });

  it('attache chaque pièce à SON message', async () => {
    queryMock
      .mockResolvedValueOnce({ rows: [{ id: 5 }] })
      .mockResolvedValueOnce({ rows: [MESSAGE, { ...MESSAGE, message_id: 2 }] })
      .mockResolvedValueOnce({ rows: [
        { piece_id: 7, message_id: 2, nom_fichier: 'constat.pdf', type_mime: 'application/pdf', taille_octets: '120', disponible: true, motif_non_stocke: null },
      ] });
    const m = (await lireMessagesDuFil(5))?.messages;
    expect(m?.[0].pieces).toEqual([]);
    expect(m?.[1].pieces).toEqual([
      { pieceId: 7, nomFichier: 'constat.pdf', typeMime: 'application/pdf', tailleOctets: 120, disponible: true, motifNonStocke: null },
    ]);
  });

  it('la TAILLE revient en NOMBRE — pg rend les bigint en chaîne, et « 120 » ne se compare pas à 120', async () => {
    queryMock
      .mockResolvedValueOnce({ rows: [{ id: 5 }] })
      .mockResolvedValueOnce({ rows: [MESSAGE] })
      .mockResolvedValueOnce({ rows: [{ piece_id: 7, message_id: 1, nom_fichier: 'x.pdf', type_mime: null, taille_octets: '4096', disponible: true, motif_non_stocke: null }] });
    expect((await lireMessagesDuFil(5))?.messages[0].pieces[0].tailleOctets).toBe(4096);
  });

  it('une pièce NON déposée est annoncée indisponible AVEC son motif — plutôt qu’un lien qui échouerait', async () => {
    queryMock
      .mockResolvedValueOnce({ rows: [{ id: 5 }] })
      .mockResolvedValueOnce({ rows: [MESSAGE] })
      .mockResolvedValueOnce({ rows: [{ piece_id: 8, message_id: 1, nom_fichier: 'video.mov', type_mime: 'video/quicktime', taille_octets: null, disponible: false, motif_non_stocke: 'type refusé' }] });
    expect((await lireMessagesDuFil(5))?.messages[0].pieces[0]).toMatchObject({ disponible: false, motifNonStocke: 'type refusé' });
  });

  it('un corps vide devient null — « (message sans texte) » se dit à l’écran, pas par une chaîne vide', async () => {
    queryMock
      .mockResolvedValueOnce({ rows: [{ id: 5 }] })
      .mockResolvedValueOnce({ rows: [{ ...MESSAGE, corps: '   ' }] })
      .mockResolvedValue({ rows: [] });
    expect((await lireMessagesDuFil(5))?.messages[0].corps).toBeNull();
  });

  it('le nombre de messages et la taille des corps sont BORNÉS — un fil pathologique ne fait pas une page de 10 Mo', async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ id: 5 }] }).mockResolvedValue({ rows: [] });
    await lireMessagesDuFil(5);
    expect(sqls()[1]).toContain(`LIMIT ${MAX_MESSAGES}`);
    expect(sqls()[1]).toMatch(/left\(coalesce\(corps_texte, ''\), \d+\)/);
  });

  it('échange inconnu → null, sans aller chercher ni messages ni pièces', async () => {
    queryMock.mockResolvedValue({ rows: [] });
    expect(await lireMessagesDuFil(5)).toBeNull();
    expect(queryMock).toHaveBeenCalledTimes(1);
  });
});

describe('servir une pièce', () => {
  it('rend la clé de stockage au SERVEUR (c’est lui qui ira chercher les octets)', async () => {
    queryMock.mockResolvedValue({ rows: [{ cle_stockage: 'gestion/2026/09/c.pdf', nom_fichier: 'c.pdf', type_mime: 'application/pdf' }] });
    expect(await lirePieceAServir(7)).toEqual({ cleStockage: 'gestion/2026/09/c.pdf', nomFichier: 'c.pdf', typeMime: 'application/pdf' });
    expect(params(0)).toEqual([7]);
  });

  it('pièce jamais déposée (aucune clé) → null : il n’y a rien à servir, et on ne prétend pas le contraire', async () => {
    queryMock.mockResolvedValue({ rows: [{ cle_stockage: null, nom_fichier: 'c.pdf', type_mime: null }] });
    expect(await lirePieceAServir(7)).toBeNull();
  });

  it('pièce inconnue → null', async () => {
    queryMock.mockResolvedValue({ rows: [] });
    expect(await lirePieceAServir(7)).toBeNull();
  });
});

describe('LECTURE SEULE, vérifiable dans le code', () => {
  // Commentaires ôtés : ceux de ce fichier DISENT ce qu'il ne fait pas (« les écritures vivent dans gestes.ts »),
  //   et une assertion sur le fichier entier prouverait l'inverse de ce qu'on veut établir.
  const code = readFileSync('app/lib/gestion/carteRepo.ts', 'utf8')
    .split('\n').filter((l) => !/^\s*(\*|\/\*|\/\/)/.test(l)).join('\n');

  it('n’émet aucune écriture', () => {
    for (const verbe of ['INSERT INTO', 'UPDATE ', 'DELETE FROM', 'TRUNCATE']) expect(code).not.toContain(verbe);
  });

  /**
   * On lit la LISTE DES IMPORTS, pas le texte du fichier : `cle_stockage` est un nom de colonne légitime ici (c'est
   * ce qu'on rend au serveur), alors qu'IMPORTER le module de stockage signifierait que ce fichier manipule des
   * octets — ce qu'il ne doit jamais faire. Distinguer les deux est tout l'objet de ce test.
   */
  it('n’importe NI le module de stockage NI de quoi fabriquer une URL signée', () => {
    const imports = [...code.matchAll(/(?:from\s*|import\s*\(\s*)'([^']+)'/g)].map((m) => m[1]);
    // `attente` et `partenaires` sont des modules FRÈRES, purs ou en lecture seule : les importer ne fait pas de ce
    //   fichier un manipulateur d'octets. Ce qui est interdit, c'est le module de stockage — et lui seul.
    // LOT 5b — `./schema` rejoint la liste : c'est la SONDE de schéma (lecture d'`information_schema`), qui ne
    //   manipule aucun octet de pièce jointe. La règle protégée reste la même : pas de module de stockage ici.
    expect(imports).toEqual(['../db/client', './attente', './partenaires', './schema']);
    expect(imports).not.toContain('../stockage');
    expect(code).not.toContain('urlSignee');
  });
});
