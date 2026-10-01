import { describe, it, expect, vi, beforeEach } from 'vitest';
import { enregistrerBrouillon, lireBrouillon } from './redactionRepo';

/**
 * ══ 🔴🔴 LOT CLASSER-DEUX-BOUTONS — LE CLASSEMENT SURVIT À LA FERMETURE DE LA FENÊTRE ═════════════════════════
 *
 * CE QUI MANQUAIT, MESURÉ LE 30/09/2026 : `gestion_brouillon` n'avait NI colonne pour les biens rattachés, NI
 * colonne pour « Interne ». Les deux ne vivaient que dans l'état React de la fenêtre de rédaction — fermer la
 * fenêtre, ou recharger la page, effaçait le travail de classement EN SILENCE. On pouvait cocher six biens,
 * rouvrir le brouillon le lendemain, et ne plus rien trouver.
 *
 * Demande d'Arno : « L'état est enregistré avec le brouillon et retrouvé à sa réouverture. »
 *
 * ⚠️ CE FICHIER ÉPROUVE LE COMPORTEMENT ET LES PARAMÈTRES LIÉS, jamais la forme exacte du SQL (convention du
 * dépôt) : une assertion sur le texte de la requête casserait au premier reformatage sans rien apprendre.
 */
let migration285: () => Promise<boolean>;
/** 🔴 LOT CLASSER-AVANT-ENVOI — la sonde de la migration 289 (« hors gestion » hérité), séparée de la 285. */
let migration289: () => Promise<boolean>;
const requetes: { sql: string; params: unknown[] }[] = [];
let reponse: Record<string, unknown>;

vi.mock('../db/client', () => ({
  query: async (sql: string, params: unknown[] = []) => {
    requetes.push({ sql, params });
    return { rows: [reponse], rowCount: 1 };
  },
  withTransaction: async (f: (c: unknown) => unknown) => f({}),
}));
vi.mock('./schema', () => ({
  brouillonHtmlDisponible: async () => false,
  brouillonClassementDisponible: () => migration285(),
  // 🔴 LOT CLASSER-AVANT-ENVOI — la sonde de la migration 289 (« hors gestion » hérité). FAUSSE ici : ce
  //   fichier éprouve la 285, et son SQL doit rester celui d'avant le lot suivant.
  brouillonHorsGestionDisponible: () => migration289(),
  corbeilleBrouillonDisponible: async () => true,
}));
vi.mock('./htmlMail', () => ({ assainirHtml: (h: string) => h }));

const LIGNE = (o: Record<string, unknown> = {}) => ({
  id: 7, fil_id: null, repond_a_message_id: null, voie: 'nouveau',
  dest_a: ['a@b.fr'], dest_cc: [], dest_cci: [], objet: 'Charges', corps: 'texte',
  citation: null, auteur_libelle: 'arno', maj_le: '2026-09-30T18:00:00Z', corps_html: null,
  cibles: [], interne: false, hors_gestion: false, ...o,
});

const BROUILLON = {
  id: null, filId: null, repondAMessageId: null, voie: 'nouveau' as const,
  a: ['a@b.fr'], cc: [], cci: [], objet: 'Charges', corps: 'texte', citation: null,
};
const AUTEUR = { id: 2, libelle: 'arno' };
const LOT = { sorte: 'lot' as const, cle: '421', id: null, libelle: '28 av. Marceau — lot 421' };

beforeEach(() => {
  requetes.length = 0;
  migration285 = async () => true;
  // ⚠️ FAUSSE PAR DÉFAUT : la 289 est LIVRÉE NON APPLIQUÉE. Le décor ordinaire est donc celui d'aujourd'hui.
  migration289 = async () => false;
  reponse = LIGNE();
});

describe('🔴 le classement est ÉCRIT avec le brouillon', () => {
  it('🔴 à la CRÉATION : les biens et « Interne » partent dans les paramètres liés', async () => {
    await enregistrerBrouillon({ ...BROUILLON, cibles: [LOT], interne: false }, AUTEUR);
    const ecriture = requetes.find((r) => /INSERT INTO gestion_brouillon/.test(r.sql));
    expect(ecriture, 'une insertion doit être émise').toBeDefined();
    expect(ecriture?.sql).toContain('cibles');
    expect(ecriture?.params).toContain(JSON.stringify([LOT]));
    expect(ecriture?.params).toContain(false);
  });

  it('🔴 à la MISE À JOUR : c’est elle qui joue à chaque accalmie de frappe', async () => {
    await enregistrerBrouillon({ ...BROUILLON, id: 7, cibles: [], interne: true }, AUTEUR);
    const ecriture = requetes.find((r) => /UPDATE gestion_brouillon/.test(r.sql));
    expect(ecriture?.sql).toContain('cibles = ');
    expect(ecriture?.sql).toContain('interne = ');
    expect(ecriture?.params).toContain('[]');
    expect(ecriture?.params).toContain(true);
  });

  /** ⚠️ ABSENTS ⇒ VALEURS NEUTRES, jamais `undefined` dans un paramètre lié : la base refuserait. */
  it('⚠️ un brouillon enregistré sans classement écrit une liste vide et « non interne »', async () => {
    await enregistrerBrouillon(BROUILLON, AUTEUR);
    const ecriture = requetes.find((r) => /INSERT INTO gestion_brouillon/.test(r.sql));
    expect(ecriture?.params).toContain('[]');
    expect(ecriture?.params.some((p) => p === undefined)).toBe(false);
  });
});

describe('🔴 le classement est RELU à la réouverture', () => {
  it('🔴 les biens reviennent tels qu’ils ont été laissés', async () => {
    reponse = LIGNE({ cibles: [LOT], interne: false });
    const b = await lireBrouillon(7);
    expect(b?.cibles).toEqual([LOT]);
    expect(b?.interne).toBe(false);
  });

  it('🔴 « Interne » revient aussi', async () => {
    reponse = LIGNE({ cibles: [], interne: true });
    expect((await lireBrouillon(7))?.interne).toBe(true);
  });

  /**
   * 🔴 UNE CIBLE ABÎMÉE EST ÉCARTÉE, PAS UNE ERREUR. Perdre une case cochée est ennuyeux ; faire échouer la
   * lecture du brouillon emporterait le TEXTE écrit avec elle, ce qui serait bien pire.
   */
  it('🔴 une cible mal formée est écartée sans emporter le brouillon', async () => {
    reponse = LIGNE({ cibles: [LOT, { sorte: 'personne', libelle: 'x' }, null, { sorte: 'lot' }, 'zut'] });
    const b = await lireBrouillon(7);
    expect(b?.cibles).toEqual([LOT]);
    expect(b?.corps).toBe('texte');
  });

  it('une colonne qui n’est pas un tableau donne une liste vide', async () => {
    reponse = LIGNE({ cibles: 'pas un tableau' });
    expect((await lireBrouillon(7))?.cibles).toEqual([]);
  });
});

/**
 * ══ 🔴🔴 LOT CLASSER-AVANT-ENVOI — « HORS GESTION » HÉRITÉ, SA PROPRE COLONNE ET SA PROPRE SONDE ══════════════
 *
 * ARNO (01/10/2026) : « si la conversation est déjà rattachée, interne ou hors gestion, la case est pré-remplie
 * en vert dans le même état ». Des trois états, celui-ci est le seul qui n'avait nulle part où s'écrire.
 *
 * 🔴 UNE SONDE À PART DE LA 285, et c'est la règle du module : deux migrations peuvent être appliquées à
 * moitié, et nommer une colonne absente ferait échouer la lecture des brouillons ENTIÈRE.
 */
describe('🔴🔴 « Hors gestion » hérité, écrit et relu avec le brouillon', () => {
  beforeEach(() => { migration289 = async () => true; });

  it('🔴 à la CRÉATION, la colonne est nommée et la valeur part liée', async () => {
    await enregistrerBrouillon({ ...BROUILLON, horsGestion: true }, AUTEUR);
    const ecriture = requetes.find((r) => /INSERT INTO gestion_brouillon/.test(r.sql));
    expect(ecriture?.sql).toContain('hors_gestion');
    expect(ecriture?.params).toContain(true);
  });

  it('🔴 à la MISE À JOUR aussi', async () => {
    await enregistrerBrouillon({ ...BROUILLON, id: 7, horsGestion: true }, AUTEUR);
    const ecriture = requetes.find((r) => /UPDATE gestion_brouillon/.test(r.sql));
    expect(ecriture?.sql).toContain('hors_gestion = ');
    expect(ecriture?.params).toContain(true);
  });

  /**
   * 🔴🔴 LE DÉCALAGE DE PARAMÈTRES, LE DÉFAUT QUE CE TEST EXISTE POUR ATTRAPER. Trois colonnes facultatives
   * numérotées à la main finissent par se décaler d'un cran — et un décalage n'échoue pas : il écrit la
   * mauvaise valeur dans la mauvaise colonne. On éprouve donc les TROIS ensemble.
   */
  it('🔴🔴 les trois colonnes facultatives ensemble : chacune reçoit SA valeur', async () => {
    await enregistrerBrouillon({
      ...BROUILLON, id: 7, corpsHtml: '<p>bonjour</p>', cibles: [LOT], interne: false, horsGestion: true,
    }, AUTEUR);
    const ecriture = requetes.find((r) => /UPDATE gestion_brouillon/.test(r.sql));
    const sql = (ecriture?.sql ?? '').replace(/\s+/g, ' ');
    // L'ordre des colonnes et celui des paramètres doivent se correspondre, un pour un.
    const rangs = ['cibles', 'interne', 'hors_gestion']
      .map((c) => Number(new RegExp(`${c} = \\$(\\d+)`).exec(sql)?.[1]));
    expect(rangs.some(Number.isNaN)).toBe(false);
    const p = ecriture?.params ?? [];
    expect(p[rangs[0] - 1]).toBe(JSON.stringify([LOT]));
    expect(p[rangs[1] - 1]).toBe(false);
    expect(p[rangs[2] - 1]).toBe(true);
  });

  it('🔴 et il REVIENT à la réouverture — sinon il faudrait reclasser un courrier déjà classé', async () => {
    reponse = LIGNE({ hors_gestion: true });
    expect((await lireBrouillon(7))?.horsGestion).toBe(true);
  });

  /** ⚠️ SANS LA 289 : la colonne n'est NOMMÉE NULLE PART, et la lecture rend `false` sans rien inventer. */
  it('⚠️ sans la migration 289, la colonne n’est nommée nulle part', async () => {
    migration289 = async () => false;
    await enregistrerBrouillon({ ...BROUILLON, horsGestion: true }, AUTEUR);
    const ecriture = requetes.find((r) => /INSERT INTO gestion_brouillon/.test(r.sql));
    expect(ecriture?.sql).not.toContain('hors_gestion,');
    expect(ecriture?.sql).toContain('false AS hors_gestion');
    expect((await lireBrouillon(7))?.horsGestion).toBe(false);
  });
});

/**
 * ══ ⚠️ SANS LA MIGRATION 285, LES COLONNES NE SONT NOMMÉES NULLE PART ═════════════════════════════════════════
 *
 * Règle du module depuis le lot 4a : nommer une colonne absente ferait échouer la lecture des brouillons
 * ENTIÈRE, pas seulement le classement. Le texte écrit serait perdu pour un confort d'affichage.
 */
describe('⚠️ sans la migration 285, rien n’est nommé — et le brouillon marche comme avant', () => {
  beforeEach(() => { migration285 = async () => false; });

  it('🔴 aucune écriture ne porte les colonnes du classement', async () => {
    await enregistrerBrouillon({ ...BROUILLON, cibles: [LOT], interne: true }, AUTEUR);
    const ecriture = requetes.find((r) => /INSERT INTO gestion_brouillon/.test(r.sql));
    /**
     * ⚠️ ON REGARDE LA LISTE DES COLONNES ÉCRITES, pas la requête entière : le `RETURNING` porte les ALIAS
     * neutres (« '[]'::jsonb AS cibles »), et c'est justement ce qu'on veut — il ne LIT pas la colonne.
     */
    const colonnes = (ecriture?.sql ?? '').slice(0, (ecriture?.sql ?? '').indexOf('VALUES'));
    expect(colonnes).not.toContain('cibles');
    expect(colonnes).not.toContain('interne');
    // …et le texte, lui, est enregistré exactement comme avant ce lot.
    expect(ecriture?.params).toContain('texte');
  });

  it('🔴 aucune lecture ne les nomme non plus', async () => {
    await lireBrouillon(7);
    const lecture = requetes.find((r) => /SELECT/.test(r.sql));
    // ⚠️ On accepte l'ALIAS (« false AS interne ») : ce qui est interdit, c'est de LIRE la colonne.
    expect(lecture?.sql).toContain("'[]'::jsonb AS cibles");
    expect(lecture?.sql).toContain('false AS interne');
  });

  it('⚠️ et le brouillon relu part d’un classement vide, jamais d’un état inventé', async () => {
    reponse = LIGNE({ cibles: [], interne: false });
    const b = await lireBrouillon(7);
    expect(b?.cibles).toEqual([]);
    expect(b?.interne).toBe(false);
  });
});
