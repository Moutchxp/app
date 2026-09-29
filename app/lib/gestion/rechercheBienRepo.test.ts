import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * 🔴 LOT BIEN-RATTACHE — LA REQUÊTE DE RECHERCHE D'UN BIEN.
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * Ce qui est protégé ici, et qui casse d'une façon reconnaissable :
 *   ① 🔴 TOUS LES MOTS, DANS N'IMPORTE QUEL ORDRE. La recherche d'avant cherchait la chaîne ENTIÈRE : « 4 victor
 *      hugo » ne trouvait pas « 4-6-8 rue Victor Hugo », parce que les mots n'y sont pas collés.
 *   ② 🔴 ET AUCUN RÉSULTAT HORS SUJET — c'est le pendant du même prédicat : exiger TOUS les mots interdit qu'une
 *      requête de deux mots remonte un bien qui n'en porte qu'un.
 *   ③ les résultats sont TOUJOURS des biens : la requête ne sélectionne que dans `gestion_annuaire_lot`.
 *   ④ le téléphone est cherché dans TOUS ses formats, et l'e-mail aussi.
 *   ⑤ « passé » se juge à LA DATE DU MAIL, jamais à aujourd'hui.
 *
 * On teste le COMPORTEMENT (paramètres LIÉS, raisons rendues) et des FRAGMENTS SÉMANTIQUES sur un SQL normalisé —
 * jamais la forme exacte de la requête émise.
 *
 * 🔒 Aucune donnée réelle : adresses et noms inventés.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */

const queryMock = vi.fn();
vi.mock('../db/client', () => ({ query: (...a: unknown[]) => queryMock(...a) }));
const annuaire = vi.fn(async () => true);
vi.mock('./schema', () => ({
  annuaireDisponible: () => annuaire(),
  libelleSourceContactDisponible: async () => true,
  /**
   * LOT FICHES-ANNUAIRE (étape C) — la sonde de l'annuaire MODIFIABLE. `false` ici : ces épreuves figent la forme
   * de la requête SANS la migration 278, et c'est l'état de la base à ce jour. La condition qu'elle ajoute
   * (`archive_le IS NULL`, pour écarter une coordonnée retirée à la main) a ses propres épreuves.
   */
  annuaireModifiableDisponible: async () => false,
}));

import { chercherBiens } from './rechercheBienRepo';

/** Une ligne de résultat telle que PostgreSQL la rend. */
const ligne = (o: Record<string, unknown> = {}) => ({
  lot_id: '1', cle: '494', adresse: '2 Rue Mars et Roty', code_postal: '92800', commune: 'Puteaux',
  nature: 'Local commercial', type_bien: null,
  proprietaire_id: '7', proprietaire_cle: 'P1', proprietaire_nom: 'MARS AVENIR',
  par_adresse: true, par_lot: false, par_proprietaire: false, par_contact_proprietaire: false,
  locataires_trouves: null, locataires_passes: null, locataires_contact: null, ...o,
});

/** Le 1er appel est la recherche ; les suivants sont les parties et les contacts. */
const sqlRecherche = () => String(queryMock.mock.calls[0]?.[0] ?? '').replace(/\s+/g, ' ');
const paramsRecherche = () => (queryMock.mock.calls[0]?.[1] ?? []) as unknown[];

const rendre = (lignes: unknown[]) => {
  queryMock.mockReset();
  queryMock.mockImplementation(async (sql: string) => {
    if (/FROM gestion_annuaire_lot lo/.test(String(sql))) return { rows: lignes };
    return { rows: [] };   // occupations et contacts : hors sujet ici
  });
};

beforeEach(() => { annuaire.mockResolvedValue(true); rendre([]); });

describe('🔴 ① tous les mots, dans n’importe quel ordre', () => {
  it('le prédicat dit « AUCUN MOT NE MANQUE », et les mots sont passés LIÉS', async () => {
    await chercherBiens('4 victor hugo');
    // 🔴 `NOT EXISTS (… NOT LIKE …)` = tous les mots présents. Un `LIKE '%toute la requête%'` raterait l'ordre.
    expect(sqlRecherche()).toContain('NOT EXISTS');
    expect(sqlRecherche()).toContain('unnest($1::text[])');
    expect(paramsRecherche()[0]).toEqual(['victor', 'hugo']);
  });

  it('un mot d’une seule lettre n’est pas un mot : il ferait correspondre presque tout', async () => {
    await chercherBiens('a victor');
    expect(paramsRecherche()[0]).toEqual(['victor']);
  });

  it('accents et casse sont ignorés — « GÉRHARD » et « gerhard » sont le même mot', async () => {
    await chercherBiens('Rue GÉRHARD');
    expect(paramsRecherche()[0]).toEqual(['rue', 'gerhard']);
  });

  it('une requête trop courte n’interroge PAS la base', async () => {
    const r = await chercherBiens('a');
    expect(r.lignes).toEqual([]);
    expect(queryMock).not.toHaveBeenCalled();
  });
});

describe('🔴 ② l’adresse cherchée porte AUSSI le code postal, et rien d’autre', () => {
  it('le foin d’adresse réunit l’adresse normalisée et le code postal', async () => {
    await chercherBiens('92800 puteaux');
    expect(sqlRecherche()).toContain("lo.adresse_normalisee || ' ' || coalesce(lo.code_postal, '')");
  });

  it('🔴 la requête ne sélectionne QUE des lots : jamais une personne comme résultat', async () => {
    await chercherBiens('marty');
    const s = sqlRecherche();
    expect(s).toContain('FROM gestion_annuaire_lot lo');
    // Aucune branche ne rend un propriétaire ou un locataire SEUL — c'était le cas de la recherche d'avant.
    expect(s).not.toContain('FROM gestion_annuaire_proprietaire pr WHERE');
    expect(s).not.toContain('FROM gestion_annuaire_locataire lc');
  });
});

describe('🔴 ③ ④ téléphone et e-mail, tous formats', () => {
  it('un numéro écrit avec des espaces devient un E.164 LIÉ', async () => {
    await chercherBiens('06 69 14 28 07');
    expect(paramsRecherche()[1]).toBe('+33669142807');
  });

  it('un numéro déjà en E.164 donne le même paramètre', async () => {
    await chercherBiens('+33669142807');
    expect(paramsRecherche()[1]).toBe('+33669142807');
  });

  it('une suite de chiffres cherche aussi une FIN de numéro', async () => {
    await chercherBiens('142807');
    expect(paramsRecherche()[2]).toBe('%142807');
  });

  it('un e-mail est cherché en entier, en minuscules', async () => {
    await chercherBiens('A.Jorel@SansVisAvis.com');
    expect(paramsRecherche()[3]).toBe('a.jorel@sansvisavis.com');
  });

  it('un nombre court et seul est lu comme un n° de lot', async () => {
    await chercherBiens('494');
    expect(paramsRecherche()[5]).toBe('494');
  });
});

describe('🔴 ⑤ « passé » se juge à la DATE DU MAIL', () => {
  it('la date est passée LIÉE, et sert de référence à la sortie du bail', async () => {
    await chercherBiens('dupont', { dateMail: '2026-08-13' });
    expect(paramsRecherche()[4]).toBe('2026-08-13');
    expect(sqlRecherche()).toContain('coalesce($5::date, current_date)');
  });

  it('une date absurde est refusée, et on retombe sur aujourd’hui', async () => {
    await chercherBiens('dupont', { dateMail: 'bientôt' });
    expect(paramsRecherche()[4]).toBeNull();
  });
});

describe('les raisons rendues à l’écran', () => {
  it('une correspondance d’adresse est dite « adresse »', async () => {
    rendre([ligne()]);
    const r = await chercherBiens('mars roty');
    expect(r.lignes[0].raisons.map((x) => x.sorte)).toEqual(['adresse']);
    expect(r.lignes[0].libelle).toBe('2 Rue Mars et Roty, 92800 Puteaux — lot 494');
  });

  it('🔴 un LOCATAIRE PASSÉ est dit comme tel, et ne se confond pas avec l’actuel', async () => {
    rendre([ligne({
      par_adresse: false, locataires_trouves: ['ABIDI Aymen'], locataires_passes: ['DUPONT Jean'],
    })]);
    const r = await chercherBiens('dupont', { dateMail: '2026-08-13' });
    expect(r.lignes[0].raisons.map((x) => `${x.sorte}:${x.detail}`))
      .toEqual(['locataire:ABIDI Aymen', 'locataire_passe:DUPONT Jean']);
  });

  it('une correspondance par TÉLÉPHONE nomme la personne', async () => {
    rendre([ligne({ par_adresse: false, par_contact_proprietaire: true })]);
    const r = await chercherBiens('06 69 14 28 07');
    expect(r.lignes[0].raisons[0]).toEqual({ sorte: 'telephone_proprietaire', detail: 'MARS AVENIR' });
  });

  it('une correspondance par E-MAIL le dit, et non « téléphone »', async () => {
    rendre([ligne({ par_adresse: false, par_contact_proprietaire: true })]);
    const r = await chercherBiens('a.jorel@sansvisavis.com');
    expect(r.lignes[0].raisons[0].sorte).toBe('email_proprietaire');
  });
});

describe('les bornes et les états', () => {
  it('une ligne de plus que la limite est demandée : sa présence dit qu’il y en a d’autres', async () => {
    await chercherBiens('puteaux', { limite: 5 });
    expect(paramsRecherche()[6]).toBe(6);
  });

  it('au-delà de la limite, on le DIT — une liste tronquée en silence fait chercher ce qu’on a caché', async () => {
    rendre([ligne({ cle: '1' }), ligne({ cle: '2' }), ligne({ cle: '3' })]);
    const r = await chercherBiens('puteaux', { limite: 2 });
    expect(r.lignes).toHaveLength(2);
    expect(r.tronque).toBe(true);
  });

  it('🔴 sans annuaire, on le DIT au lieu de rendre une liste vide qui se lirait « rien trouvé »', async () => {
    annuaire.mockResolvedValue(false);
    const r = await chercherBiens('puteaux');
    expect(r.disponible).toBe(false);
    expect(queryMock).not.toHaveBeenCalled();
  });

  it('aucun résultat ⇒ liste vide, mais l’annuaire est bien là', async () => {
    rendre([]);
    const r = await chercherBiens('victor hugo');
    expect(r.lignes).toEqual([]);
    expect(r.disponible).toBe(true);
  });
});
