import { describe, it, expect, vi, beforeEach } from 'vitest';

const queryMock = vi.fn();
vi.mock('../db/client', () => ({ query: (...a: unknown[]) => queryMock(...a) }));

import { chercherEvenements, MAX_RESULTATS, motsDe, normaliser } from './recherche';
/* 🔴 LOT ETAT-PAR-LA-FRISE — l'épreuve lit la règle au même endroit que le dépôt : une condition recopiée ici
   serait une seconde vérité, et c'est exactement ce que le lot supprime. */
import { sqlEvenementOuvertParLaFrise } from './etatParLaFrise';

/** Blancs normalisés : on éprouve le SENS d'un SQL émis, jamais sa mise en forme (AGENTS.md). */
const plat = (t: string): string => t.replace(/\s+/g, ' ');

/**
 * LOT 4d-B1 — la recherche qui sert les TROIS gestes (affecter depuis la file, déplacer un échange, déplacer un mail).
 * Le comportement sur une VRAIE base (accents, expéditeurs rattachés, injection) est éprouvé à part, sur cluster
 * jetable ; ici on tient le contrat : ce qui est cherché, comment c'est borné, et ce qui est LIÉ plutôt que collé.
 */
const sql = () => (queryMock.mock.calls[0][0] as string).replace(/\s+/g, ' ');
const params = () => queryMock.mock.calls[0][1] as unknown[];

beforeEach(() => { queryMock.mockReset(); queryMock.mockResolvedValue({ rows: [] }); });

describe('normaliser / découper la saisie', () => {
  it('enlève les accents et la casse', () => {
    expect(normaliser('Régularisation')).toBe('regularisation');
    expect(normaliser('DUBÉ')).toBe('dube');
    expect(normaliser('Élodie Ferré')).toBe('elodie ferre');
    expect(normaliser('Aïe çà où')).toBe('aie ca ou');
  });

  it('découpe en mots, garde ce qui compose une adresse e-mail', () => {
    expect(motsDe('fuite marceau')).toEqual(['fuite', 'marceau']);
    expect(motsDe('  Fuite,  Marceau ! ')).toEqual(['fuite', 'marceau']);
    expect(motsDe('plombier@artisans.test')).toEqual(['plombier@artisans.test']);
    expect(motsDe('GES-2026-000001')).toEqual(['ges-2026-000001']);
  });

  it('une saisie vide ne donne aucun mot — le champ devient une liste, pas une impasse', () => {
    expect(motsDe('')).toEqual([]);
    expect(motsDe('   ')).toEqual([]);
    expect(motsDe('%%%')).toEqual([]); // les jokers de LIKE ne survivent pas au découpage
  });

  it('borne le nombre de mots et leur longueur — une saisie absurde ne fabrique pas une requête absurde', () => {
    expect(motsDe('a b c d e f g h i j')).toHaveLength(6);
    expect(motsDe('x'.repeat(200))[0]).toHaveLength(40);
  });
});

describe('la requête', () => {
  it('cherche sur le titre, le demandeur, l’adresse, la référence ET les expéditeurs rattachés', async () => {
    await chercherEvenements('fuite');
    const s = sql();
    for (const champ of ['e.reference', 'e.objet', 'e.demandeur_nom', 'e.demandeur_email', 'e.adresse_libre']) {
      expect(s).toContain(champ);
    }
    expect(s).toContain('m.de_nom');     // l'expéditeur d'un message rattaché…
    expect(s).toContain('m.de_adresse'); // …par son nom comme par son adresse
    expect(s).toContain('a2.actif');     // seulement les échanges ENCORE rattachés
  });

  it('TOUS les mots doivent être présents (ET), chacun en paramètre LIÉ', async () => {
    await chercherEvenements('fuite marceau');
    expect(sql()).toContain("LIKE '%' || $2 || '%' AND");
    expect(sql()).toContain("LIKE '%' || $3 || '%'");
    expect(params()).toEqual([MAX_RESULTATS, 'fuite', 'marceau']);
  });

  it('aucun mot saisi → aucune condition, la liste des plus récents', async () => {
    await chercherEvenements('');
    // Pas de « WHERE » sur les événements eux-mêmes : aucune condition LIKE n'est posée (le WHERE qui reste est
    //   celui de la sous-requête qui compte les échanges rattachés — il ne filtre pas la liste).
    expect(sql()).not.toContain('LIKE');
    expect(sql()).not.toContain('FROM gestion_evenement e WHERE');
    expect(params()).toEqual([MAX_RESULTATS]);
  });

  it('une tentative d’injection voyage comme une VALEUR, jamais comme du SQL', async () => {
    await chercherEvenements("'; DROP TABLE gestion_evenement; --");
    expect(sql()).not.toContain('DROP');
    expect(params().slice(1).every((p) => typeof p === 'string')).toBe(true);
  });

  /**
   * ══ 🔴🔴 LOT ETAT-PAR-LA-FRISE (08/10/2026) — « OUVERT » NE SE LIT PLUS SUR `traite_le` ═══════════════════
   *
   * L'épreuve figeait `ORDER BY (e.traite_le IS NOT NULL) ASC`. La règle d'Arno : « L'état d'un événement se
   * déduit des cartes de BORNE de sa frise. » Un événement dont la carte Clôture a été retirée doit donc
   * remonter dans la recherche — c'est son constat, sur GES-2026-000001.
   *
   * ⚠️ LE VERDICT NE SE RELÂCHE PAS, IL CHANGE DE SOURCE : les ouverts passent toujours devant, et c'est la
   * frise qui dit lesquels. On éprouve le SENS (le tri lit la règle, pas la colonne), pas la forme du SQL.
   */
  it('les cartes OUVERTES passent devant les traitées, et « ouvert » vient de la frise', async () => {
    await chercherEvenements('');
    expect(sql()).toContain(`ORDER BY NOT ${plat(sqlEvenementOuvertParLaFrise('e'))} ASC`);
    expect(sql()).not.toContain('ORDER BY (e.traite_le IS NOT NULL)');
  });

  it('le nombre de résultats est borné, par un paramètre lié', async () => {
    await chercherEvenements('x', 7);
    expect(sql()).toContain('LIMIT $1');
    expect(params()[0]).toBe(7);
  });

  it('n’émet QUE de la lecture', async () => {
    await chercherEvenements('fuite');
    expect(/\b(INSERT|UPDATE|DELETE|TRUNCATE|ALTER|DROP)\b/i.test(sql())).toBe(false);
  });

  it('un état inconnu retombe sur « à traiter » plutôt que de casser l’écran', async () => {
    /* 🔴 LOT ETAT-PAR-LA-FRISE — la ligne porte maintenant `ouvert`, calculé par la base sur les cartes de
       borne. Un événement OUVERT dont l'état stocké est illisible se lit « à traiter », le repli le plus
       prudent ; s'il était clos, il se lirait « traité » quoi que dise la colonne. */
    queryMock.mockResolvedValue({ rows: [{ id: 1, reference: 'GES-2026-000001', objet: 'x', demandeur: null, adresse_libre: null, etat: 'zzz', ouvert: true, nb_fils: 0 }] });
    expect((await chercherEvenements(''))[0].etat).toBe('a_traiter');
  });
});
