import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * ══ 🔴🔴 LOT CONTACTS-EXTERNES — LA GRATUITÉ DU LOT SUR L'EXISTANT, PROUVÉE SUR LE SQL ÉMIS ═══════════════════
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * 🔴🔴 CE QUE CE FICHIER GARDE, ET IL N'EN GARDE QU'UNE CHOSE : **SANS LA MIGRATION 293, AUCUNE TABLE NI COLONNE
 * NOUVELLE N'EST NOMMÉE**, et le classement d'un mail se comporte exactement comme avant ce lot.
 *
 * ⚠️ POURQUOI C'EST LE TEST LE PLUS IMPORTANT DU LOT. Les migrations de ce module sont livrées NON APPLIQUÉES :
 * entre la livraison et son application par Arno, le code tourne sur un schéma plus ancien que lui. Une requête
 * qui nommerait `gestion_fil_periode_personne` ou `role_instantane` ne casserait pas « la fonctionnalité
 * nouvelle » — elle casserait LE CLASSEMENT D'UN MAIL, c'est-à-dire l'écran principal du module. C'est la leçon
 * du lot 4a, inscrite en tête de `schema.ts`, et elle a déjà coûté une livraison.
 *
 * 🔴 L'AUTRE MOITIÉ — « avec la 293, ça marche » — est éprouvée SUR UNE VRAIE BASE par
 * `contactsExternes.itest.ts` (37 scénarios, dont les trois essais d'intrusion). Un faux serveur ne prouverait
 * rien d'un trigger.
 *
 * ⚠️ ON ASSERTE LES FRAGMENTS SÉMANTIQUES DU SQL, sur une chaîne normalisée — jamais la FORME exacte d'une
 * requête (convention d'écriture des tests du dépôt, `AGENTS.md`). « cette table est-elle nommée ? » survit à
 * tous les reformatages ; une regex sur un WHERE complet casse au premier.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */

const queryMock = vi.fn();
const qMock = vi.fn();
vi.mock('../db/client', () => ({
  query: (...a: unknown[]) => queryMock(...a),
  withTransaction: async (f: (q: unknown) => Promise<unknown>) => f(qMock),
}));

let migration293 = false;
vi.mock('./schema', () => ({
  periodesDisponibles: async () => true,
  rattachementsDisponibles: async () => true,
  interventionsDisponibles: async () => migration293,
  annuaireDisponible: async () => true,
  annuaireModifiableDisponible: async () => true,
  libelleSourceContactDisponible: async () => true,
  spamDisponible: async () => true,
  corbeilleGmailDisponible: async () => true,
  /* 🔴 LOT RENOMMER-PARTOUT-ET-FINITIONS, POINT 7 — la sonde de la migration 297. ⚠️ UNE FABRIQUE `vi.mock`
     QUI OUBLIE UN EXPORT NEUF FAIT TOMBER LE MODULE À L'APPEL, pas à l'import : le piège est déjà consigné
     plusieurs fois dans ce dépôt. Elle rend `false` : la table n'est alors nommée nulle part, et les
     épreuves de FORME du SQL écrites avant ce lot restent vraies à la lettre. */
  interneDuMessageDisponible: async () => false,
}));

const rattacher = vi.fn(async () => ({ ok: true, id: 1 }));
const changerStatut = vi.fn(async () => ({ ok: true, id: 1 }));
vi.mock('./rattachementRepo', () => ({
  rattacher: (...a: unknown[]) => rattacher(...(a as [])),
  changerStatut: (...a: unknown[]) => changerStatut(...(a as [])),
}));
vi.mock('./interneRepo', () => ({
  marquerInterne: async () => ({ ok: true, nb: 0 }),
  annulerInterne: async () => ({ ok: true, nb: 0 }),
  /* 🔴🔴 LOT INTERNE-ANNULER-ET-SUITE, POINT 2 — la projection lit la marque d'ÉCHANGE une fois par fil : elle
     décide si le REPLI a quelque chose à dire sur ses mails. ⚠️ UNE FABRIQUE `vi.mock` QUI OUBLIE UN EXPORT NEUF
     FAIT TOMBER LE MODULE À L'APPEL, pas à l'import — piège déjà consigné plusieurs fois ici. Carte VIDE = aucune
     conversation marquée, donc projection mot pour mot celle d'avant ce lot. */
  lireInterne: async () => new Map(),
}));
vi.mock('./horsGestionRepo', () => ({
  marquerHorsGestion: async () => ({ ok: true, nb: 0 }),
  annulerHorsGestion: async () => ({ ok: true, nb: 0 }),
}));

import { poserClassement } from './periodeRepo';

const AUTEUR = { id: 7, libelle: 'a.jorel@sansvisavis.com' };
const BIEN = { cle: '421', libelle: '28 av. Marceau — Logement' };
const QUI = { sorte: 'locataire' as const, cle: 'thai cecile#c.thai@orange.fr', libelle: 'THAI Cécile' };

/** Tout le SQL émis, blancs normalisés — la forme exacte n'est jamais assertée, seuls les fragments le sont. */
const toutLeSql = (): string => [...queryMock.mock.calls, ...qMock.mock.calls]
  .map((c) => String(c[0]).replace(/\s+/g, ' ')).join(' § ');

/**
 * La fausse base : trois mails, aucune période au départ, et des `RETURNING id` qui répondent.
 *
 * ⚠️ ELLE SE SOUVIENT DE LA PÉRIODE QU'ON VIENT D'INSÉRER, et il le faut : `poserClassement` écrit la période
 * PUIS la relit pour projeter. Une fausse base qui ne la rendrait pas ferait sortir la projection par son
 * « aucune période, rien à faire » — et l'épreuve conclurait à tort que le bien n'est pas posé.
 */
let periodePosee: { biens: { cle: string; libelle: string }[] } | null = null;

function reponse(sql: string): { rows: unknown[] } {
  const s = sql.replace(/\s+/g, ' ');
  if (s.includes('INSERT INTO gestion_fil_periode ')) periodePosee = { biens: [BIEN] };
  if (s.includes('FROM gestion_message WHERE fil_id')) {
    return { rows: [{ id: '10' }, { id: '20' }, { id: '30' }] };
  }
  if (s.includes('FROM gestion_fil_periode p')) {
    return periodePosee === null ? { rows: [] } : { rows: [{
      id: '990', depuis_message_id: '10', sorte: 'biens',
      cree_par_libelle: AUTEUR.libelle, cree_le: '2026-10-02T09:00:00Z',
      biens: periodePosee.biens, personnes: null,
    }] };
  }
  if (s.includes('FROM gestion_message_exception e')) return { rows: [] };
  if (s.includes('exclu_par_regle_id FROM gestion_message')) {
    return { rows: [{ id: '10', sens: 'recu', objet: 'Contestation', exclu_par_regle_id: null }] };
  }
  if (s.includes("to_char(recu_le AT TIME ZONE 'UTC'")) {
    return { rows: [{ id: '10', le: '2026-03-10' }, { id: '20', le: '2026-03-11' }] };
  }
  if (s.includes('count(*)::int AS n')) return { rows: [{ n: 0 }] };
  if (s.includes('SELECT id::text, message_id::text, cible_cle')) return { rows: [] };
  if (s.includes('cle_personne AS cle')) return { rows: [] };
  return { rows: [{ id: '990' }] };
}

beforeEach(() => {
  migration293 = false;
  periodePosee = null;
  for (const m of [queryMock, qMock, rattacher, changerStatut]) m.mockClear();
  queryMock.mockImplementation(async (sql: string) => reponse(sql));
  qMock.mockImplementation(async (sql: string) => reponse(sql));
});

/** Les morceaux que la migration 293 crée, et qu'on ne doit JAMAIS nommer avant qu'elle soit appliquée. */
const MORCEAUX_293 = [
  'gestion_contact_externe',
  'gestion_fil_periode_personne',
  'gestion_message_exception_personne',
  'role_instantane',
  'contact_externe_id',
];

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   🔴🔴 S-293-A — SANS LA MIGRATION, RIEN N'EST NOMMÉ, ET LE BIEN SE CLASSE QUAND MÊME
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

describe('🔴🔴 sans la migration 293, aucune table ni colonne nouvelle n’est nommée', () => {
  it('🔴🔴 un classement ORDINAIRE (sans personne) n’en nomme aucune', async () => {
    const r = await poserClassement({
      filId: 1, messageId: 10, classement: { sorte: 'biens', biens: [BIEN] },
      choix: 'suite', auteur: AUTEUR,
    });
    expect(r.ok).toBe(true);
    for (const m of MORCEAUX_293) expect(toutLeSql()).not.toContain(m);
  });

  it('🔴🔴 un classement QUI PORTE DES PERSONNES n’en nomme aucune NON PLUS, et le bien part', async () => {
    /**
     * 🔴 LE CAS EXACT DE LA LIVRAISON : le code du lot est en place, la migration ne l'est pas, et quelqu'un
     * valide l'étape 2. Le classement du BIEN doit aboutir — c'est la règle n° 1 (ne rien casser) — et les
     * relations aux personnes doivent être simplement SAUTÉES, sans une erreur.
     */
    const r = await poserClassement({
      filId: 1, messageId: 10,
      classement: { sorte: 'biens', biens: [BIEN], personnes: [QUI] },
      choix: 'suite', auteur: AUTEUR,
    });
    expect(r.ok).toBe(true);
    for (const m of MORCEAUX_293) expect(toutLeSql()).not.toContain(m);
    // Le bien, lui, est bien posé : c'est `rattacher` qui le fait, comme avant ce lot.
    expect(rattacher).toHaveBeenCalledWith(expect.objectContaining({
      messageId: 10, cible: { sorte: 'lot', cle: BIEN.cle, id: null },
    }));
  });

  it('🔴 la période est écrite avec ses BIENS, exactement comme avant ce lot', async () => {
    await poserClassement({
      filId: 1, messageId: 10,
      classement: { sorte: 'biens', biens: [BIEN], personnes: [QUI] },
      choix: 'suite', auteur: AUTEUR,
    });
    const sql = toutLeSql();
    expect(sql).toContain('INSERT INTO gestion_fil_periode');
    expect(sql).toContain('gestion_fil_periode_bien');
  });

  it('🔴 une EXCEPTION (« classement ponctuel ») ne nomme rien de nouveau non plus', async () => {
    await poserClassement({
      filId: 1, messageId: 10,
      classement: { sorte: 'biens', biens: [BIEN], personnes: [QUI] },
      choix: 'mail', auteur: AUTEUR,
    });
    const sql = toutLeSql();
    expect(sql).toContain('INSERT INTO gestion_message_exception');
    expect(sql).toContain('gestion_message_exception_bien');
    for (const m of MORCEAUX_293) expect(sql).not.toContain(m);
  });
});

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   🔴 S-293-B — AVEC LA MIGRATION, LES PERSONNES SONT ÉCRITES ET LUES
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

describe('🔴 avec la migration 293, les personnes de la fenêtre sont écrites', () => {
  beforeEach(() => { migration293 = true; });

  it('🔴 la période gagne ses personnes, et la lecture va les chercher', async () => {
    await poserClassement({
      filId: 1, messageId: 10,
      classement: { sorte: 'biens', biens: [BIEN], personnes: [QUI] },
      choix: 'suite', auteur: AUTEUR,
    });
    const sql = toutLeSql();
    expect(sql).toContain('INSERT INTO gestion_fil_periode_personne');
    // La lecture du suivi joint les personnes dans la MÊME requête que les biens (jamais une par période).
    expect(sql).toContain('FROM gestion_fil_periode_personne');
  });

  it('🔴 une exception gagne les siennes, dans sa propre table', async () => {
    await poserClassement({
      filId: 1, messageId: 10,
      classement: { sorte: 'biens', biens: [BIEN], personnes: [QUI] },
      choix: 'mail', auteur: AUTEUR,
    });
    expect(toutLeSql()).toContain('INSERT INTO gestion_message_exception_personne');
  });

  it('🔴🔴 un classement SANS personne n’écrit AUCUNE ligne de personne', async () => {
    await poserClassement({
      filId: 1, messageId: 10, classement: { sorte: 'biens', biens: [BIEN] },
      choix: 'suite', auteur: AUTEUR,
    });
    expect(toutLeSql()).not.toContain('INSERT INTO gestion_fil_periode_personne');
  });

  it('⚠️ « Interne » ne porte aucune personne, même si on en passe', async () => {
    await poserClassement({
      filId: 1, messageId: 10,
      classement: { sorte: 'interne', biens: [], personnes: [QUI] },
      choix: 'suite', auteur: AUTEUR,
    });
    expect(toutLeSql()).not.toContain('INSERT INTO gestion_fil_periode_personne');
  });
});
