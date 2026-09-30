import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * 🔴 LOT STATUT-PAR-MAIL — LA BOÎTE DE RÉCEPTION : UN MAIL PAR LIGNE, PAGINÉE.
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * CE QUI EST PROTÉGÉ ICI, et qui casse d'une façon reconnaissable :
 *   ① UN MAIL PAR LIGNE, pas une conversation. C'est tout l'objet du lot : une conversation de douze messages
 *      occupait UNE ligne, et ses onze autres mails étaient invisibles — or le classement se fait mail par mail.
 *   ② LA PAGINATION EST PAR CURSEUR (date **et** identifiant), jamais par `OFFSET`. Une boîte alimentée par un
 *      logiciel reçoit plusieurs mails à la même seconde : la date seule en perdrait un à chaque page.
 *   ③ LE STATUT DE LA LIGNE EST CELUI DU MAIL, sur ses rattachements à un BIEN — jamais l'événement.
 *   ④ SANS LA MIGRATION 257, aucune capsule n'est rendue (`null`) plutôt qu'une rouge qui accuserait à tort.
 *
 * On teste le COMPORTEMENT (paramètres liés, découpage des pages, curseur rendu, capsule calculée) et, au besoin,
 * des FRAGMENTS SÉMANTIQUES sur un SQL normalisé — jamais la forme exacte de la requête émise.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */

const queryMock = vi.fn();
vi.mock('../db/client', () => ({ query: (...a: unknown[]) => queryMock(...a) }));
const migration257 = vi.fn(async () => true);
/** LOT STATUT-HORS-GESTION — la 266, pilotée séparément : les deux migrations n'arrivent pas ensemble. */
const migration266 = vi.fn(async () => true);
vi.mock('./schema', () => ({
  rattachementsDisponibles: () => migration257(), horsGestionDisponible: () => migration266(),
  // 🔴 LOT RATTACHER-EN-ECRIVANT — migration 281 absente : la table n'est nommée nulle part.
  interneDisponible: async () => false,
}));

import { lireMailsRecus, compterMailsRecus, PAGE_RECEPTION } from './receptionRepo';

/** Une ligne telle que PostgreSQL la rend : les `bigint` en CHAÎNE (piège du dépôt). */
const ligne = (n: number, o: Record<string, unknown> = {}) => ({
  message_id: String(n),
  fil_id: String(1000 + n),
  de_adresse: 'martin@orange.fr',
  de_nom: 'Mme Martin',
  objet: `Objet ${n}`,
  extrait: 'bonjour',
  recu_le: `2026-08-${String(28 - (n % 27)).padStart(2, '0')}T10:00:00Z`,
  nb_pieces: 0,
  r_biens: null,
  r_manuel: null,
  ...o,
});

/** Le 1er appel est la page, celui qui compte se reconnaît à ce qu'il compte. */
const COMPTE = 'count(*)::int AS n';
const rendre = (lignes: unknown[], total = 57) => {
  queryMock.mockReset();
  queryMock.mockImplementation(async (sql: string) => {
    if (String(sql).includes(COMPTE)) return { rows: [{ n: total }] };
    return { rows: lignes };
  });
};
const appelPage = () => queryMock.mock.calls.find((c) => !String(c[0]).includes(COMPTE));
const sqlPage = () => String(appelPage()?.[0] ?? '').replace(/\s+/g, ' ');
const paramsPage = () => (appelPage()?.[1] ?? []) as unknown[];

beforeEach(() => { migration257.mockResolvedValue(true); migration266.mockResolvedValue(true); rendre([]); });

describe('🔴 un MAIL par ligne, pas une conversation', () => {
  it('lit les messages, et ne regroupe rien par échange', async () => {
    rendre([ligne(1), ligne(2)]);
    const p = await lireMailsRecus(null, { limite: 10 });
    expect(p.lignes.map((l) => l.messageId)).toEqual([1, 2]);
    // Deux mails du MÊME échange resteraient deux lignes : c'est le message qui porte l'identité.
    expect(sqlPage()).toContain('FROM gestion_message m');
    expect(sqlPage()).not.toContain('GROUP BY m.fil_id');
  });

  it('rend le mail ET son échange : le clic doit pouvoir déplier le bon message', async () => {
    rendre([ligne(7)]);
    const p = await lireMailsRecus(null);
    expect(p.lignes[0]).toMatchObject({ messageId: 7, filId: 1007 });
  });

  it('les REÇUS seulement, et sans le spam — nos envois ont leur propre liste', async () => {
    await lireMailsRecus(null);
    expect(sqlPage()).toContain("m.sens = 'recu'");
    expect(sqlPage()).toContain('m.spam_le IS NULL');
  });

  it('du plus récent au plus ancien : c’est ce qu’on ouvre le matin', async () => {
    await lireMailsRecus(null);
    expect(sqlPage()).toContain('ORDER BY m.recu_le DESC, m.id DESC');
  });
});

describe('🔴 la pagination est par CURSEUR — date ET identifiant', () => {
  it('sans curseur, part de l’infini et de l’identifiant maximal', async () => {
    await lireMailsRecus(null, { limite: 5 });
    expect(paramsPage()[0]).toBe('infinity');
    expect(paramsPage()[1]).toBe('9223372036854775807');
  });

  it('avec curseur, passe la date ET l’identifiant reçus — jamais un OFFSET', async () => {
    await lireMailsRecus({ recuLe: '2026-08-10T09:00:00Z', messageId: '2896' }, { limite: 5 });
    expect(paramsPage().slice(0, 2)).toEqual(['2026-08-10T09:00:00Z', '2896']);
    expect(sqlPage()).not.toContain('OFFSET');
  });

  it('demande UNE ligne de plus que la page, pour savoir s’il y a une suite sans la compter', async () => {
    rendre([]);
    await lireMailsRecus(null, { limite: 30 });
    expect(paramsPage()[2]).toBe(31);
  });

  it('rend le curseur de la DERNIÈRE ligne gardée, et rabote la ligne de trop', async () => {
    rendre([ligne(1), ligne(2), ligne(3)]);
    const p = await lireMailsRecus(null, { limite: 2 });
    expect(p.lignes.map((l) => l.messageId)).toEqual([1, 2]);
    expect(p.suivant).toEqual({ recuLe: ligne(2).recu_le, messageId: '2' });
  });

  it('pas de suite quand la page n’est pas pleine : le bouton « plus anciens » doit disparaître', async () => {
    rendre([ligne(1)]);
    const p = await lireMailsRecus(null, { limite: 2 });
    expect(p.suivant).toBeNull();
  });

  it('le total n’est compté qu’à la PREMIÈRE page — la requête chère ne se paie pas à chaque « voir plus »', async () => {
    rendre([ligne(1)], 9631);
    const p1 = await lireMailsRecus(null, { limite: 1 });
    expect(p1.total).toBe(9631);

    rendre([ligne(2)], 9631);
    const p2 = await lireMailsRecus({ recuLe: '2026-08-01T00:00:00Z', messageId: '2' }, { limite: 1 });
    expect(p2.total).toBeNull();
    expect(queryMock.mock.calls.filter((c) => String(c[0]).includes(COMPTE))).toHaveLength(0);
  });

  it('la limite demandée est bornée : une page de 10 000 lignes n’est pas une page', async () => {
    await lireMailsRecus(null, { limite: 10_000 });
    expect(paramsPage()[2]).toBe(101);
  });

  it('la page par défaut est celle du module, pas un chiffre écrit sur place', async () => {
    await lireMailsRecus(null);
    expect(paramsPage()[2]).toBe(PAGE_RECEPTION + 1);
  });
});

describe('🔴 le statut de la ligne est celui du MAIL, sur ses rattachements à un BIEN', () => {
  it('aucun rattachement de bien ⇒ « À classer »', async () => {
    rendre([ligne(1, { r_biens: null, r_manuel: null })]);
    const p = await lireMailsRecus(null);
    expect(p.lignes[0].capsule).toBe('a_classer');
    expect(p.lignes[0].biens).toEqual([]);
  });

  it('un rattachement automatique ⇒ « Auto », et le bien est nommé pour l’info-bulle', async () => {
    rendre([ligne(1, { r_biens: ['127 Rue Gérhard, Puteaux — lot 445'], r_manuel: false })]);
    const p = await lireMailsRecus(null);
    expect(p.lignes[0].capsule).toBe('auto');
    expect(p.lignes[0].biens).toEqual(['127 Rue Gérhard, Puteaux — lot 445']);
  });

  it('un rattachement posé à la main ⇒ « Classé »', async () => {
    rendre([ligne(1, { r_biens: ['lot 445'], r_manuel: true })]);
    const p = await lireMailsRecus(null);
    expect(p.lignes[0].capsule).toBe('classe');
  });

  it('seuls les CONFIRMÉS et les sortes de BIEN comptent — jamais l’événement', async () => {
    await lireMailsRecus(null);
    const s = sqlPage();
    expect(s).toContain("r.statut = 'confirme'");
    expect(s).toContain("r.cible_sorte IN ('lot', 'proprietaire', 'locataire')");
    expect(s).not.toContain("'evenement'");
  });

  it('UNE seule requête pour la page, rattachements compris : une jointure latérale, pas 30 requêtes', async () => {
    rendre([ligne(1), ligne(2), ligne(3)]);
    await lireMailsRecus(null, { limite: 3 });
    expect(queryMock.mock.calls.filter((c) => !String(c[0]).includes(COMPTE))).toHaveLength(1);
    expect(sqlPage()).toContain('LEFT JOIN LATERAL');
  });
});

describe('🔴 les filtres rapides de la colonne', () => {
  it('« Tous » n’ajoute aucune condition', async () => {
    await lireMailsRecus(null, { filtre: 'tous' });
    expect(sqlPage()).not.toContain('rb.biens IS');
  });

  it('« À classer » ne garde que les mails sans aucun bien', async () => {
    await lireMailsRecus(null, { filtre: 'a_classer' });
    expect(sqlPage()).toContain('AND rb.biens IS NULL');
  });

  it('« Classés » ne garde que les mails qui en ont un', async () => {
    await lireMailsRecus(null, { filtre: 'classes' });
    expect(sqlPage()).toContain('AND rb.biens IS NOT NULL');
  });
});

describe('🔴 sans la migration 257 : on le DIT, on n’accuse pas', () => {
  it('aucune capsule n’est rendue (`null`), plutôt qu’une rouge sur toute la boîte', async () => {
    migration257.mockResolvedValue(false);
    rendre([ligne(1)]);
    const p = await lireMailsRecus(null);
    expect(p.lignes[0].capsule).toBeNull();
  });

  it('la table des rattachements n’est NOMMÉE NULLE PART — sinon toute la requête échouerait', async () => {
    migration257.mockResolvedValue(false);
    await lireMailsRecus(null);
    expect(sqlPage()).not.toContain('gestion_rattachement');
    // ⚠️ ON NOMME LA TABLE, PAS LA FORME. Chercher « LEFT JOIN LATERAL » confondait avec la jointure « hors
    //    gestion », qui est une AUTRE migration et peut parfaitement être là quand celle-ci manque.
    expect(sqlPage()).not.toContain(') rb ON true');
  });

  it('le filtre rapide ne vide PAS la liste : « il n’y a rien à classer » serait faux', async () => {
    migration257.mockResolvedValue(false);
    await lireMailsRecus(null, { filtre: 'a_classer' });
    expect(sqlPage()).not.toContain('rb.biens IS NULL');
  });
});

describe('les détails de la ligne', () => {
  it('le libellé d’un partenaire interne prime sur le nom porté par le mail', async () => {
    rendre([ligne(1, { de_adresse: 'compta@cabinet-x.fr', de_nom: 'Boîte générique' })]);
    const p = await lireMailsRecus(null, {
      partenaires: [{ adresse: 'compta@cabinet-x.fr', libelle: 'Cabinet X (compta)', categorie: 'adhoc' }] as never,
    });
    expect(p.lignes[0].de).toBe('Cabinet X (compta)');
  });

  it('sans nom ni partenaire, l’adresse fait le libellé ; sans rien, on le dit', async () => {
    rendre([ligne(1, { de_nom: null }), ligne(2, { de_nom: null, de_adresse: null })]);
    const p = await lireMailsRecus(null, { limite: 5 });
    expect(p.lignes[0].de).toBe('martin@orange.fr');
    expect(p.lignes[1].de).toBe('(expéditeur inconnu)');
  });

  it('le trombone et son chiffre viennent du COMPTE de pièces, pas d’un booléen', async () => {
    rendre([ligne(1, { nb_pieces: 3 }), ligne(2, { nb_pieces: 0 })]);
    const p = await lireMailsRecus(null, { limite: 5 });
    expect(p.lignes[0]).toMatchObject({ aPiece: true, nbPieces: 3 });
    expect(p.lignes[1]).toMatchObject({ aPiece: false, nbPieces: 0 });
  });

  it('un extrait vide vaut « pas d’extrait » — un cadre blanc se lirait comme un mail vide', async () => {
    rendre([ligne(1, { extrait: '   ' })]);
    const p = await lireMailsRecus(null);
    expect(p.lignes[0].extrait).toBeNull();
  });
});

describe('le compte des mails reçus', () => {
  it('compte les reçus non-spam, et applique le filtre demandé', async () => {
    rendre([], 9631);
    const n = await compterMailsRecus('a_classer', true);
    expect(n).toBe(9631);
    const sql = String(queryMock.mock.calls.find((c) => String(c[0]).includes(COMPTE))?.[0] ?? '')
      .replace(/\s+/g, ' ');
    expect(sql).toContain("m.sens = 'recu'");
    expect(sql).toContain('AND rb.biens IS NULL');
  });

  it('rend 0 plutôt que `undefined` quand la base ne rend aucune ligne', async () => {
    queryMock.mockReset();
    queryMock.mockResolvedValue({ rows: [] });
    expect(await compterMailsRecus('tous', true)).toBe(0);
  });
});
