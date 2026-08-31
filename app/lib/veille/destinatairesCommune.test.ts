import { describe, it, expect, beforeEach, vi } from 'vitest';
// Mock DB routé par fragment de SQL (LECTURE SEULE) — pour tester lireDestinataireParDefaut (Règle A) sans base.
const { appels, reponses, queryMock } = vi.hoisted(() => {
  const appels: { sql: string; params: unknown[] }[] = [];
  const reponses = { repondant: [] as { a: string }[], contact: [] as { a: string }[], prada: [] as { a: string }[], dest: [] as { a: string }[], ajouts: [] as { a: string }[] };
  const queryMock = async (sql: string, params?: unknown[]) => {
    appels.push({ sql, params: params ?? [] });
    if (/demande_reponse/i.test(sql) && /de_adresse AS a/i.test(sql)) return { rows: reponses.repondant };
    if (/mairie_contact_email/i.test(sql)) return { rows: reponses.ajouts }; // LOT 29 — AVANT mairie_contact (qui matcherait aussi)
    if (/mairie_contact/i.test(sql)) return { rows: reponses.contact };
    if (/mairie_prada/i.test(sql)) return { rows: reponses.prada };
    if (/dest_email AS a/i.test(sql)) return { rows: reponses.dest };
    return { rows: [] };
  };
  return { appels, reponses, queryMock };
});
vi.mock('../db/client', () => ({ query: queryMock, withTransaction: async () => undefined, pool: {}, closePool: async () => undefined }));

import { composerDestinatairesCommune, choisirDestinataireParDefaut, resoudreDestinatairesRelance, lireDestinataireParDefaut, composerOptionsDestinataire, type SourcesAdressesCommune } from './destinatairesCommune';

const norm = (s: string) => s.replace(/\s+/g, ' ').trim();
beforeEach(() => { appels.length = 0; reponses.repondant = []; reponses.contact = []; reponses.prada = []; reponses.dest = []; reponses.ajouts = []; });

/**
 * LOT 20 — cœur PUR de la composition des destinataires (sans réseau, point 11). On prouve : dest_email toujours en tête, dédup
 * insensible à la casse, exclusion des no-reply / mailer-daemon / postmaster / non-adresses. AUCUN envoi.
 */
const src = (over: Partial<SourcesAdressesCommune> = {}): SourcesAdressesCommune => ({ destEmail: null, contactsConfirmes: [], prada: [], repondants: [], ajouts: [], ...over });

describe('composerDestinatairesCommune', () => {
  it('cas Aubervilliers : dest_email + répondant réel = 2 adresses, dest_email en tête', () => {
    const l = composerDestinatairesCommune(src({
      destEmail: 'urba-reglementaire@mairie-aubervilliers.fr',
      contactsConfirmes: ['urba-reglementaire@mairie-aubervilliers.fr'], // même que dest → dédupliqué
      repondants: ['lauriane.pangui@mairie-aubervilliers.fr'],
    }));
    expect(l).toEqual(['urba-reglementaire@mairie-aubervilliers.fr', 'lauriane.pangui@mairie-aubervilliers.fr']);
  });

  it('dest_email TOUJOURS en première position, même s’il apparaît aussi dans une autre source', () => {
    const l = composerDestinatairesCommune(src({ destEmail: 'a@m.fr', contactsConfirmes: ['b@m.fr', 'a@m.fr'] }));
    expect(l[0]).toBe('a@m.fr');
    expect(l).toEqual(['a@m.fr', 'b@m.fr']);
  });

  it('dédup INSENSIBLE à la casse (A@M.fr == a@m.fr) — l’adresse déjà vue n’est pas re-servie', () => {
    expect(composerDestinatairesCommune(src({ destEmail: 'A@M.fr', repondants: ['a@m.fr'] }))).toEqual(['A@M.fr']);
  });

  it('exclut no-reply / donotreply / ne-pas-repondre', () => {
    const l = composerDestinatairesCommune(src({ destEmail: 'urba@m.fr', repondants: ['noreply@m.fr', 'ne-pas-repondre@m.fr', 'donotreply@m.fr', 'agent@m.fr'] }));
    expect(l).toEqual(['urba@m.fr', 'agent@m.fr']);
  });

  it('exclut mailer-daemon / postmaster (expéditeurs de rebond)', () => {
    expect(composerDestinatairesCommune(src({ destEmail: 'urba@m.fr', repondants: ['MAILER-DAEMON@m.fr', 'postmaster@m.fr'] }))).toEqual(['urba@m.fr']);
  });

  it('exclut ce qui n’est pas une adresse e-mail (URL de formulaire, vide, espaces)', () => {
    expect(composerDestinatairesCommune(src({ destEmail: 'urba@m.fr', contactsConfirmes: ['https://teleservice.fr/urba', '', '   '] }))).toEqual(['urba@m.fr']);
  });

  it('aucune source exploitable → liste vide', () => {
    expect(composerDestinatairesCommune(src())).toEqual([]);
    expect(composerDestinatairesCommune(src({ destEmail: '  ' }))).toEqual([]);
  });

  it('ordre des sources : dest_email → contacts confirmés → prada → répondants', () => {
    const l = composerDestinatairesCommune(src({ destEmail: 'd@m.fr', contactsConfirmes: ['c@m.fr'], prada: ['p@m.fr'], repondants: ['r@m.fr'] }));
    expect(l).toEqual(['d@m.fr', 'c@m.fr', 'p@m.fr', 'r@m.fr']);
  });
});

describe('LOT 27 — RÈGLE A : choisirDestinataireParDefaut (dernier répondant, repli chaîne)', () => {
  const s = (o: Partial<Parameters<typeof choisirDestinataireParDefaut>[0]> = {}) => ({ dernierRepondant: null, destEmail: null, contactsConfirmes: [], prada: [], ...o });
  it('un répondant → c’est LUI le défaut (prioritaire sur la chaîne de repli)', () => {
    expect(choisirDestinataireParDefaut(s({ dernierRepondant: 'rep@m.fr', destEmail: 'urba@m.fr' }))).toBe('rep@m.fr');
  });
  it('deux adresses dont une jamais répondante : le défaut = le RÉPONDANT, jamais la non-répondante (dest_email)', () => {
    expect(choisirDestinataireParDefaut(s({ dernierRepondant: 'rep@m.fr', destEmail: 'jamais-repondu@m.fr' }))).toBe('rep@m.fr');
  });
  it('AUCUN répondant → repli dest_email, puis contact confirmé, puis prada (dans cet ordre)', () => {
    expect(choisirDestinataireParDefaut(s({ destEmail: 'urba@m.fr', contactsConfirmes: ['c@m.fr'] }))).toBe('urba@m.fr');
    expect(choisirDestinataireParDefaut(s({ contactsConfirmes: ['c@m.fr'], prada: ['p@m.fr'] }))).toBe('c@m.fr');
    expect(choisirDestinataireParDefaut(s({ prada: ['p@m.fr'] }))).toBe('p@m.fr');
  });
  it('rien d’exploitable → null ; un répondant no-reply/non-adresse est SAUTÉ au profit du repli', () => {
    expect(choisirDestinataireParDefaut(s())).toBeNull();
    expect(choisirDestinataireParDefaut(s({ dernierRepondant: 'noreply@m.fr', destEmail: 'urba@m.fr' }))).toBe('urba@m.fr');
    expect(choisirDestinataireParDefaut(s({ dernierRepondant: 'https://teleservice/urba', destEmail: 'urba@m.fr' }))).toBe('urba@m.fr');
  });
});

describe('LOT 27 — RÈGLE B : resoudreDestinatairesRelance (multi-adresse des 2 dernières, sinon défaut unique)', () => {
  const b = (o: Partial<Parameters<typeof resoudreDestinatairesRelance>[0]> = {}) => ({ defautRegleA: 'rep@m.fr', destEmailFige: 'urba@m.fr', listeLarge: ['urba@m.fr', 'rep@m.fr', 'prada@m.fr'], rang: 3, total: 3, multiActive: true, nbDernieres: 2, ...o });
  it('ORDINAIRE — étapes 2 (avis) et 3 (saisine) → multi-adresse ; étape 1 (rappel) → défaut unique', () => {
    expect(resoudreDestinatairesRelance(b({ rang: 3 }))).toEqual(['urba@m.fr', 'rep@m.fr', 'prada@m.fr']); // saisine
    expect(resoudreDestinatairesRelance(b({ rang: 2 }))).toEqual(['urba@m.fr', 'rep@m.fr', 'prada@m.fr']); // avis
    expect(resoudreDestinatairesRelance(b({ rang: 1 }))).toEqual(['rep@m.fr']);                            // rappel → Règle A seule
  });
  it('PARTIEL (total N+1=3) — relance 2 et annonce 3 → multi ; relance 1 → défaut unique', () => {
    expect(resoudreDestinatairesRelance(b({ rang: 1, total: 3 }))).toEqual(['rep@m.fr']);
    expect(resoudreDestinatairesRelance(b({ rang: 2, total: 3 }))).toEqual(['urba@m.fr', 'rep@m.fr', 'prada@m.fr']);
    expect(resoudreDestinatairesRelance(b({ rang: 3, total: 3 }))).toEqual(['urba@m.fr', 'rep@m.fr', 'prada@m.fr']);
  });
  it('drapeau INACTIF (arrêt d’urgence) → même la dernière étape part au SEUL défaut (Règle A)', () => {
    expect(resoudreDestinatairesRelance(b({ rang: 3, multiActive: false }))).toEqual(['rep@m.fr']);
  });
  it('une SEULE adresse connue (liste ≤ 1) → défaut unique, même sur une étape multi', () => {
    expect(resoudreDestinatairesRelance(b({ rang: 3, listeLarge: ['urba@m.fr'] }))).toEqual(['rep@m.fr']);
  });
  it('le défaut Règle A est TOUJOURS dans la liste multi (préfixé s’il en est absent)', () => {
    expect(resoudreDestinatairesRelance(b({ rang: 3, defautRegleA: 'nouveau@m.fr', listeLarge: ['urba@m.fr', 'prada@m.fr'] })))
      .toEqual(['nouveau@m.fr', 'urba@m.fr', 'prada@m.fr']);
  });
  it('aucun défaut Règle A → repli sur le dest_email figé', () => {
    expect(resoudreDestinatairesRelance(b({ rang: 1, defautRegleA: null }))).toEqual(['urba@m.fr']);
  });
});

describe('LOT 27 — lireDestinataireParDefaut : lit le dernier répondant (hors rebond), exclut les presume (statut confirmé)', () => {
  it('un répondant réel → défaut = ce répondant ; SQL trié par récence, rebonds exclus', async () => {
    reponses.repondant = [{ a: 'lauriane@mairie.fr' }];
    reponses.dest = [{ a: 'urba@mairie.fr' }];
    expect(await lireDestinataireParDefaut(42, '93001')).toBe('lauriane@mairie.fr');
    const q = appels.find((a) => /demande_reponse/i.test(a.sql) && /de_adresse AS a/i.test(a.sql))!;
    const s = norm(q.sql);
    expect(s).toContain("nature <> 'rebond'");       // les rebonds ne comptent pas comme des réponses
    expect(s).toContain('ORDER BY recu_le DESC');     // le PLUS RÉCENT d'abord
    expect(q.params).toEqual([42]);                   // paramètre LIÉ (demandeId)
  });
  it('AUCUN répondant → repli sur dest_email ; les contacts « presume » sont EXCLUS (query filtre statut confirmé)', async () => {
    reponses.repondant = [];                 // pas de réponse
    reponses.dest = [{ a: 'urba@mairie.fr' }];
    reponses.contact = [];                   // la query ne renvoie QUE les confirmés → un presume n'y est pas
    expect(await lireDestinataireParDefaut(7, '93001')).toBe('urba@mairie.fr');
    const c = appels.find((a) => /mairie_contact/i.test(a.sql))!;
    expect(norm(c.sql)).toContain("statut = 'confirme'"); // garantit l'exclusion des 'presume'
  });
});

// ── LOT 29 — carnet multi-adresses (mairie_contact_email) + options du sélecteur ─────────────────────────────────────────────────
describe('LOT 29 — composerDestinatairesCommune : les ajouts manuels rejoignent le jeu règle B', () => {
  it('une adresse ajoutée à la main entre dans la liste (après le dest_email, dédupliquée)', () => {
    const l = composerDestinatairesCommune(src({ destEmail: 'urba@m.fr', ajouts: ['ajout@m.fr', 'URBA@m.fr'] }));
    expect(l).toEqual(['urba@m.fr', 'ajout@m.fr']); // dest en tête, ajout inclus, doublon insensible à la casse écarté
  });

  it('🔒 RÈGLE B INCHANGÉE pour une commune SANS ajout manuel : liste identique à avant (ajouts=[])', () => {
    const sansAjout = src({ destEmail: 'd@m.fr', contactsConfirmes: ['c@m.fr'], prada: ['p@m.fr'], repondants: ['r@m.fr'] });
    // même sources, ajouts vides → EXACTEMENT la liste historique (dest, contact, prada, répondant), rien de plus
    expect(composerDestinatairesCommune(sansAjout)).toEqual(['d@m.fr', 'c@m.fr', 'p@m.fr', 'r@m.fr']);
    // et le jeu des 2 dernières relances (règle B) part de cette même liste → comportement multi-adresse inchangé
    const b = resoudreDestinatairesRelance({ defautRegleA: 'r@m.fr', destEmailFige: 'd@m.fr', listeLarge: composerDestinatairesCommune(sansAjout), rang: 3, total: 3, multiActive: true, nbDernieres: 2 });
    expect(b).toEqual(['d@m.fr', 'c@m.fr', 'p@m.fr', 'r@m.fr']);
  });
});

describe('LOT 29 — composerOptionsDestinataire : options ordonnées + provenance + défaut en tête', () => {
  it('une seule adresse connue → une seule option', () => {
    expect(composerOptionsDestinataire(src({ destEmail: 'urba@m.fr' }), 'urba@m.fr')).toEqual([{ adresse: 'urba@m.fr', provenance: 'ecrit' }]);
  });

  it('plusieurs adresses, un répondant récent = défaut → il est EN TÊTE, chaque option porte sa provenance', () => {
    const o = composerOptionsDestinataire(src({ destEmail: 'urba@m.fr', repondants: ['lauriane@m.fr'], prada: ['prada@m.fr'], ajouts: ['ajout@m.fr'] }), 'lauriane@m.fr');
    expect(o[0]).toEqual({ adresse: 'lauriane@m.fr', provenance: 'repondant' }); // défaut règle A en tête
    const par = Object.fromEntries(o.map((x) => [x.adresse, x.provenance]));
    expect(par).toEqual({ 'lauriane@m.fr': 'repondant', 'urba@m.fr': 'ecrit', 'ajout@m.fr': 'ajout', 'prada@m.fr': 'prada' });
  });

  it('aucune adresse connue → aucune option (le sélecteur ne bloque pas : la saisie manuelle prend le relais côté écran)', () => {
    expect(composerOptionsDestinataire(src(), null)).toEqual([]);
  });

  it('une même adresse dans plusieurs sources → une seule option, provenance de PLUS HAUTE priorité (répondant l’emporte)', () => {
    const o = composerOptionsDestinataire(src({ destEmail: 'x@m.fr', repondants: ['x@m.fr'] }), 'x@m.fr');
    expect(o).toEqual([{ adresse: 'x@m.fr', provenance: 'repondant' }]); // dédupliquée, répondant > ecrit
  });
});
