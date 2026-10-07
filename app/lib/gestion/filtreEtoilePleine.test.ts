import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';

/**
 * ══ 🔴🔴 LOT FILTRE-ETOILE-PLEINE — LE FILTRE ÉTOILE NE REMONTE QUE DES LIGNES **PLEINES** ═══════════════════════
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * CONSTAT D'ARNO (07/10/2026) : sur `/admin/gestion?etoile=1`, la liste montrait aussi des lignes à étoile CREUSE —
 * « Dégât des eaux – 80 rue de Normandie » (Antoine Mennerun), « Demande de précisions… aides au logement »
 * (Comptabilité ADHOC). C'est-à-dire des échanges dont le mail AFFICHÉ par la ligne n'est pas étoilé.
 *
 * MESURÉ SUR LA BASE, avant correction : 45 lignes rendues, dont 16 creuses. Après : 29, toutes pleines.
 *
 * 🔴 RÈGLE D'ARNO : « ce filtre ne fait remonter QUE les lignes dont l'étoile est PLEINE, c'est-à-dire celles dont
 * le mail affiché par la ligne est lui-même étoilé. Une ligne à étoile creuse n'en fait pas partie. »
 *
 * ═══ 🔴 LE PRINCIPE, LE MÊME QUE « FILTRE = ÉTIQUETTE » ═════════════════════════════════════════════════════════
 *
 * Le filtre n'a plus de règle à lui. Il lit le fragment `sqlMailEtoile` — celui-là même dont se sert la LECTURE qui
 * dessine l'étoile (`mailsEtoilesDesFils`) — et ne change qu'une chose : l'ensemble de messages auquel il
 * s'applique. Les mails de la page pour l'affichage, LE MAIL DE LA LIGNE pour le filtre. L'égalité est donc vraie
 * par construction, pas par surveillance.
 *
 * ═══ 🔒 CE QUE CE FICHIER SIMULE, ET CE QU'IL NE SIMULE PAS ═════════════════════════════════════════════════════
 *
 * Aucune base, aucun réseau : `query` est doublé. Mais le double HONORE le prédicat — il lit le SQL émis et
 * applique au jeu de lignes soit le prédicat par MAIL (`m.etoile_le IS NOT NULL`), soit l'ancien prédicat par
 * ÉCHANGE, selon ce qu'il y trouve. C'est ce qui rend les cas ci-dessous probants : revenir au prédicat d'échange
 * fait repasser la ligne CREUSE, et les épreuves rougissent.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */

const queryMock = vi.fn();
vi.mock('../db/client', () => ({ query: (...a: unknown[]) => queryMock(...a) }));
/**
 * ⚠️ MOCK PARTIEL DES SONDES, et c'est délibéré : on ne force QUE celles qui décident du prédicat étudié, les
 * autres gardent leur vraie valeur. Une fabrique exhaustive tombe au premier export neuf — piège déjà consigné
 * plusieurs fois dans ce dépôt, et qui se referme à l'APPEL, pas à l'import.
 */
vi.mock('./schema', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  /* 🔴 LE SUJET DU FICHIER : la migration 277 est là, donc l'étoile est celle de GMAIL, posée par MAIL. */
  etoileGmailDisponible: async () => true,
  etoileDisponible: async () => false,
  /* ⚠️ LE RESTE EST ÉTEINT : aucune colonne de ces lots n'est nommée, et le SQL inspecté ici ne porte que
     l'appartenance et le filtre étoile — c'est tout le sujet. */
  corbeilleGmailDisponible: async () => false,
  spamDisponible: async () => false,
  nonRemiseDisponible: async () => false,
  rattachementsDisponibles: async () => false,
  horsGestionDisponible: async () => false,
  interneDisponible: async () => false,
  interneDuMessageDisponible: async () => false,
  fileEnvoiDisponible: async () => false,
  redactionDisponible: async () => false,
  nomUsageDisponible: async () => false,
  pieceIntegreeDisponible: async () => false,
}));
vi.mock('./config', () => ({ chargerConfigGestion: async () => ({ adresseGestion: 'gestion@criterimmo.fr' }) }));

import { lireBoiteMail } from './boiteRepo';
import { sqlMailEtoile } from './etoileGmailRepo';
import { sorteEtoileLigne } from './etoileLigne';

/**
 * TROIS ÉCHANGES, UN PAR CAS. `messageAffiche` est le mail que la ligne montre ; `etoiles` les mails étoilés de
 * l'échange, tels que la base les connaît.
 *
 *   · 101 PLEINE — le mail affiché (1010) est étoilé ;
 *   · 102 CREUSE — le mail affiché (1020) ne l'est pas, mais un autre (1021) oui. C'est le cas d'Arno ;
 *   · 103 AUCUNE — rien n'est étoilé dans cet échange.
 */
const FILS = [
  { filId: 101, messageAffiche: 1010, etoiles: [1010], qui: 'Lisa Laisne', objet: 'Quittance de septembre' },
  { filId: 102, messageAffiche: 1020, etoiles: [1021], qui: 'Antoine Mennerun', objet: 'Dégât des eaux' },
  { filId: 103, messageAffiche: 1030, etoiles: [], qui: 'Service Gestion', objet: 'Taxes foncières' },
];

/** Une ligne telle que PostgreSQL la rend : les `bigint` en CHAÎNE (piège connu du dépôt). */
const ligneDB = (f: typeof FILS[number]) => ({
  fil_id: String(f.filId), message_id: String(f.messageAffiche), objet: f.objet,
  interlocuteur: f.qui, interlocuteur_adresse: 'x@orange.fr',
  dernier_sens: 'recu', dernier_le: '2026-10-06T10:00:00Z', extrait: 'bonjour',
  nb_messages: 3, nb_lisibles: 3, nb_pieces: 0, nb_corbeille: 0,
  reference: null, sans_suite: false, est_spam: false,
  cl_n: null, cl_humain: null, cl_detail: null, hg_marque: false, hg_motif: null,
  itm_vivante: null, itm_connue: false, itn_marque: false,
});

/** Les mails étoilés, dans la forme que `mailsEtoilesDesFils` rend. */
const mailEtoileDB = (filId: number, id: number) => ({
  fil_id: String(filId), id: String(id), de_adresse: 'didier@free.fr', de_nom: 'Didier Caussanel',
  recu_le: '2026-09-24T19:08:00Z',
});

/**
 * ══ 🔴🔴 LE DOUBLE QUI HONORE LE PRÉDICAT ═══════════════════════════════════════════════════════════════════════
 *
 * Il lit le SQL émis et applique AU JEU DE LIGNES ce que ce SQL demande vraiment :
 *   · `m.etoile_le IS NOT NULL` (le fragment partagé) ⇒ on ne garde que les échanges dont le MAIL AFFICHÉ est
 *     étoilé — la règle du lot ;
 *   · un `EXISTS` sur `gestion_message` (l'ancien prédicat d'échange) ⇒ on garde tout échange qui porte une étoile,
 *     où qu'elle soit. C'est la branche qui fait rougir les cas si quelqu'un revient en arrière.
 *
 * ⚠️ IL NE SIMULE QUE CE PRÉDICAT-LÀ. Le reste du SQL (appartenance, corbeille, spam…) n'est pas rejoué : ce
 * fichier porte sur le filtre étoile, et un faux PostgreSQL complet serait une seconde vérité à maintenir.
 */
const servir = (): void => {
  queryMock.mockReset();
  queryMock.mockImplementation(async (sql: string) => {
    const s = String(sql).replace(/\s+/g, ' ');
    /**
     * ⚠️ ON RECONNAÎT LA PAGE D'ABORD, À SON CTE, et le piège s'est refermé en écrivant ce fichier : la requête de
     * la page contient elle aussi `de_nom` (l'interlocuteur) et, depuis ce lot, `etoile_le IS NOT NULL` (le
     * filtre). Une branche « étoiles » posée avant lui répondait des mails étoilés, et la liste arrivait vide.
     */
    if (s.includes('WITH page')) {
      const parMail = s.includes(sqlMailEtoile('m'));
      const parEchange = /EXISTS \(\s*SELECT 1 FROM gestion_message me\b/.test(s);
      return {
        rows: FILS.filter((f) => {
          if (parMail) return f.etoiles.includes(f.messageAffiche);
          if (parEchange) return f.etoiles.length > 0;
          return true; // aucun filtre demandé : la liste nue
        }).map(ligneDB),
      };
    }
    /* Le TOTAL de l'en-tête (`sqlCompteBoite`) : il ne porte PAS de CTE, il compte. */
    if (s.includes('count(*)::int AS n')) return { rows: [{ n: 0 }] };
    if (s.includes('FILTER (WHERE lisibles > 0)')) return { rows: [{ lisibles: 0, total: 0 }] };
    /* La lecture qui DESSINE l'étoile : les mails étoilés des échanges de la page. */
    if (s.includes('de_nom') && s.includes('etoile_le IS NOT NULL')) {
      return { rows: FILS.flatMap((f) => f.etoiles.map((id) => mailEtoileDB(f.filId, id))) };
    }
    return { rows: [] };
  });
};

const lire = () => lireBoiteMail(null, [], 30,
  { etiquette: { sorte: 'reception' }, etoilesSeules: true } as never);
/** La requête de LISTE, espaces normalisés — on assertera par fragments sémantiques, jamais sur la forme exacte. */
const sqlListe = (): string => String(
  queryMock.mock.calls.findLast((c) => String(c[0]).includes('WITH page'))?.[0] ?? '').replace(/\s+/g, ' ');
/** La requête du TOTAL de l'en-tête (« N conversations »), qui doit porter le MÊME filtre. */
const sqlTotal = (): string => String(
  queryMock.mock.calls.find((c) => String(c[0]).includes('count(*)::int AS n')
    && !String(c[0]).includes('WITH page'))?.[0] ?? '').replace(/\s+/g, ' ');

beforeEach(servir);

describe('🔴🔴 ① les trois cas', () => {
  it('🔴 une ligne PLEINE apparaît', async () => {
    const p = await lire();
    expect(p.lignes.map((l) => l.filId)).toContain(101);
  });

  /**
   * 🔴🔴 LE CAS D'ARNO. L'échange 102 porte bien une étoile — mais sur un autre mail que celui que la ligne
   * montre. Avant ce lot, il remontait ; c'est exactement « Dégât des eaux – 80 rue de Normandie ».
   */
  it('🔴🔴 une ligne CREUSE n’apparaît PAS', async () => {
    const p = await lire();
    expect(p.lignes.map((l) => l.filId)).not.toContain(102);
  });

  it('🔴 une ligne SANS étoile n’apparaît pas', async () => {
    const p = await lire();
    expect(p.lignes.map((l) => l.filId)).not.toContain(103);
  });
});

describe('🔴🔴 ② la cohérence : ce qui remonte dessine une PLEINE', () => {
  /**
   * 🔴🔴 LA GARANTIE QU'ARNO DEMANDE, ET LA SEULE QUI COMPTE À L'USAGE : quoi que la requête rende, l'étoile
   * DESSINÉE sur chacune de ses lignes est pleine. Le filtre et l'affichage ne peuvent plus se contredire.
   */
  it('🔴🔴 pour CHAQUE ligne rendue, l’étoile dessinée est « pleine »', async () => {
    const p = await lire();
    expect(p.lignes.length).toBeGreaterThan(0);
    for (const l of p.lignes) {
      expect(sorteEtoileLigne(l.etoile), `fil ${l.filId}`).toBe('pleine');
      expect(l.etoile.duMessage, `fil ${l.filId}`).toBe(true);
    }
  });

  /** ⚠️ ET SANS LE FILTRE, LES TROIS SONT LÀ — c'est bien le filtre qui écarte, pas la lecture des étoiles. */
  it('⚠️ sans le filtre, les trois lignes remontent, creuse comprise', async () => {
    const p = await lireBoiteMail(null, [], 30, { etiquette: { sorte: 'reception' } } as never);
    expect(p.lignes.map((l) => l.filId)).toEqual([101, 102, 103]);
    expect(sorteEtoileLigne(p.lignes[1].etoile)).toBe('creuse');
  });
});

describe('🔴🔴 ③ le filtre n’a pas de règle à lui', () => {
  /**
   * 🔴🔴 LE PRINCIPE DU LOT, ÉPROUVÉ SUR LE TEXTE ÉMIS : le filtre porte le fragment PARTAGÉ, celui que la lecture
   * d'affichage emploie. Pas une formulation équivalente — LE MÊME, rendu par la même fonction.
   */
  it('🔴🔴 le filtre EST `sqlMailEtoile` sur le mail de la ligne', async () => {
    await lire();
    expect(sqlListe()).toContain(sqlMailEtoile('m'));
  });

  /** 🔴 ET L'ANCIEN PRÉDICAT D'ÉCHANGE A DISPARU : c'est lui qui faisait remonter les creuses. */
  it('🔴 plus aucun `EXISTS` d’échange pour l’étoile', async () => {
    await lire();
    expect(sqlListe()).not.toMatch(/EXISTS \(\s*SELECT 1 FROM gestion_message me\b/);
  });

  /** 🔴 LE COMPTEUR « N conversations » PORTE LE MÊME FILTRE — sinon il annoncerait ce que la liste ne montre pas. */
  it('🔴🔴 le total de l’en-tête porte le même prédicat que la page', async () => {
    await lire();
    expect(sqlTotal()).toContain(sqlMailEtoile('m'));
  });

  /** ⚠️ ET SANS LE FILTRE, LE PRÉDICAT N'EST NULLE PART : on ne filtre pas une liste qu'on n'a pas filtrée. */
  it('⚠️ sans le filtre, le prédicat d’étoile n’est pas émis', async () => {
    await lireBoiteMail(null, [], 30, { etiquette: { sorte: 'reception' } } as never);
    expect(sqlListe()).not.toContain(sqlMailEtoile('m'));
  });

  /**
   * 🔴🔴 UNE SEULE ÉCRITURE DE LA COLONNE. `sqlMailEtoile` est la seule à nommer `etoile_le` dans un prédicat :
   * si quelqu'un la réécrit à la main quelque part, les deux côtés peuvent diverger à nouveau.
   */
  it('🔴🔴 la colonne n’est nommée que par le fragment partagé', () => {
    const repo = readFileSync('app/lib/gestion/boiteRepo.ts', 'utf8');
    expect(repo).toContain("sqlMailEtoile('m')");
    expect(repo).not.toContain('etoile_le IS NOT NULL');
  });
});
