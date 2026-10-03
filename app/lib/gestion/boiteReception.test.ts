import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * LOT BOITE-INTERNE-CORBEILLE — UN ENVOI N'EST EN RÉCEPTION QUE S'IL NOUS EST ADRESSÉ.
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * 🔴🔴 LA RÈGLE (Arno, 29/09/2026), en une phrase : un message ENVOYÉ PAR gestion@ — depuis l'app, depuis Gmail, ou
 * par la file d'envoi en arrière-plan — n'apparaît QUE dans « Envoyés », SAUF si gestion@ figure elle-même dans À,
 * Cc ou Cci. C'est mot pour mot la règle de Gmail.
 *
 * ═══ CE QUI ÉTAIT DÉJÀ VRAI, ET CE QUI NE L'ÉTAIT PAS ════════════════════════════════════════════════════════════
 *
 * La PREMIÈRE moitié tenait, et il faut le dire parce que c'était la crainte d'Arno : `sens` est posé par
 * `sensDuMessage` sur la seule comparaison « l'expéditeur EST-IL gestion@ ? », et la vérification sur la vraie base
 * le confirme — **40 063 messages partis de gestion@, 40 063 marqués `envoye`, ZÉRO marqué `recu`**. Aucun envoi
 * n'a jamais fuité en Réception, quelle que soit la voie d'envoi : elles écrivent toutes par la même capture.
 *
 * La SECONDE moitié — l'exception — n'existait pas : **51 messages, 49 échanges**, dont **28 visibles nulle part
 * ailleurs que sous « Envoyés »** une fois le courrier automatique et le spam retirés. Ce sont de vrais courriers :
 * des envois groupés où les locataires sont en Cci et gestion@ le destinataire visible (coupure d'eau, date d'AG,
 * information chauffage), et des notes qu'on s'envoie à soi-même. Total « Réception » : 8 501 → 8 529.
 *
 * 🔴 CE QUE CE FICHIER PROTÈGE SURTOUT : que les QUATRE endroits qui répondent à « qu'y a-t-il en Réception ? »
 * répondent la MÊME chose — la liste, son total, le compteur de la colonne de gauche, et la case « Réception » du
 * panneau de recherche. Ce module a déjà payé une divergence de ce genre (lot BOITE-SENS) : c'est toujours le
 * compteur qu'on croit, et toujours la liste qui a raison.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */

const queryMock = vi.fn();
vi.mock('../db/client', () => ({ query: (...a: unknown[]) => queryMock(...a) }));
vi.mock('./schema', () => ({
  /* 🔴 LOT FENETRES-INDEPENDANTES — le dédoublonnage du compteur passe par le nom d'USAGE : la sonde de la
     migration 286 est donc interrogée ici aussi. ABSENTE ⇒ le fragment rend `nom_fichier`, comme avant. */
  nomUsageDisponible: async () => false,
  /* 🔴 LOT ETOILE-SIGNATURES-PIECES — la 296 n'est pas le sujet de ce fichier : ABSENTE, la colonne
     `integree` n'est nommée nulle part et le SQL inspecté ici reste celui d'avant ce lot. */
  pieceIntegreeDisponible: async () => false,
  // ⚠️ La CORBEILLE n'est pas le sujet de ce fichier : sonde à faux ⇒ aucune colonne nommée, et les requêtes
  //    vérifiées ici sont exactement celles que la règle de Réception produit, sans bruit autour.
  corbeilleGmailDisponible: async () => false,
  spamDisponible: async () => true,
  nonRemiseDisponible: async () => false,
  rattachementsDisponibles: async () => true,
  horsGestionDisponible: async () => false,
  // 🔴 LOT RATTACHER-EN-ECRIVANT — migration 281 absente par défaut : `gestion_fil_interne` n'est NOMMÉE nulle
  //   part, et les assertions de ce fichier portent donc sur le SQL d'avant ce lot.
  interneDisponible: async () => false,
  etoileDisponible: async () => false,
  /**
   * 🔴 LOT ETOILE-ET-SIGNATURE — migration 277 absente par défaut : le filtre étoile lit alors encore
   * `gestion_fil_etoile` (l'étoile de l'équipe), et les assertions de ce fichier portent donc sur le SQL d'avant
   * ce lot. Les deux sources ne sont JAMAIS lues ensemble — c'est l'une OU l'autre.
   */
  etoileGmailDisponible: async () => false,
  rechercheTexteDisponible: async () => true,
  deplacementsDeMailsDisponibles: async () => false,
  destinatairesSeparesDisponibles: async () => false,
  // ⚠️ « Envoyés » AJOUTE les mails qui ne sont PAS partis (lot LIGNE-NON-ENVOYE). Ce n'est pas le sujet ici :
  //    sonde à faux ⇒ aucune table nommée, et la liste est celle de `gestion_message` seule.
  fileEnvoiDisponible: async () => false,
}));
/** L'adresse vient de `gestion_config`, jamais d'une constante : c'est la même source que la capture. */
vi.mock('./config', () => ({ chargerConfigGestion: async () => ({ adresseGestion: 'gestion@criterimmo.fr' }) }));

import { comptesBoite, lireBoiteMail, sqlAppartenance, sqlNousEstAdresse } from './boiteRepo';
import { conditions } from './rechercheBoite';
import { sensDuMessage } from './capture';

const plat = (s: string) => s.replace(/\s+/g, ' ');
const etiq = (sorte: string) => ({ sorte, evenementId: null }) as never;
const appels = () => queryMock.mock.calls.map((c) => ({ sql: plat(String(c[0])), params: c[1] as unknown[] }));
/** La requête de PAGE : celle qui bâtit la liste. */
const page = () => appels().find((a) => a.sql.includes('WITH page AS ('));
/**
 * La requête de TOTAL : celle de l'en-tête de liste.
 *
 * ⚠️ LE MARQUEUR EST PRIS ENTIER (`AS n FROM gestion_message m`). `includes('count(*)::int AS n')` seul attrapait
 * la requête de PAGE, qui porte `count(*)::int AS nb_messages` — un préfixe, donc une correspondance. Ce piège a
 * fait comparer les paramètres de la page à ceux du total pendant l'écriture de ce fichier.
 */
const total = () => appels().find((a) => a.sql.includes('count(*)::int AS n FROM gestion_message m'));

beforeEach(() => {
  queryMock.mockReset();
  queryMock.mockImplementation(async () => ({ rows: [] }));
});

/* ══════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   LA MOITIÉ QUI TENAIT DÉJÀ — et qu'on scelle, parce que c'est elle qu'Arno demandait de vérifier
   ══════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

describe('🔴 le SENS d’un message ne dépend QUE de son expéditeur', () => {
  it('un message parti de gestion@ est « envoyé », quel que soit son destinataire', () => {
    expect(sensDuMessage('gestion@criterimmo.fr', 'gestion@criterimmo.fr')).toBe('envoye');
    expect(sensDuMessage('GESTION@Criterimmo.FR ', 'gestion@criterimmo.fr')).toBe('envoye');
  });

  /**
   * 🔴 UN COLLÈGUE N'EST PAS « NOUS ». `a.jorel@sansvisavis.com` qui écrit à gestion@ est un message REÇU — et
   * c'est exactement le cas du mail 57185 qu'Arno a vu en Réception, où sa présence est NORMALE. Confondre
   * « interne » et « nous » ferait disparaître de la boîte les demandes des collègues.
   */
  it('🔴 un collègue interne qui nous écrit est REÇU — le cas du mail 57185', () => {
    expect(sensDuMessage('a.jorel@sansvisavis.com', 'gestion@criterimmo.fr')).toBe('recu');
    expect(sensDuMessage('jb.pons@sansvisavis.com', 'gestion@criterimmo.fr')).toBe('recu');
  });
});

/* ══════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   L'EXCEPTION, ET LES QUATRE ENDROITS QUI DOIVENT LA DIRE PAREIL
   ══════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

describe('🔴 le prédicat d’appartenance, écrit UNE fois', () => {
  it('« Envoyés » reste un littéral, sans paramètre : rien n’a changé de ce côté', () => {
    expect(sqlAppartenance('m', 'envoye', 4)).toBe("m.sens = 'envoye'");
    expect(sqlAppartenance('m', 'envoye', null)).toBe("m.sens = 'envoye'");
  });

  /**
   * 🔴 SANS RANG D'ADRESSE, LE PRÉDICAT EST CELUI D'AVANT LE LOT, mot pour mot. Ce n'est pas une commodité de
   * test : c'est ce qui permet à tout appelant qui n'a pas lu la configuration de garder le comportement connu,
   * plutôt que de produire une requête à moitié juste.
   */
  it('🔴 sans adresse, « Réception » retombe EXACTEMENT sur la règle d’avant', () => {
    expect(sqlAppartenance('m', 'recu', null)).toBe("m.sens = 'recu'");
  });

  it('avec l’adresse, les TROIS champs de destinataires comptent', () => {
    const p = plat(sqlNousEstAdresse('m', 7));
    for (const champ of ['dest_a', 'dest_cc', 'dest_cci']) expect(p).toContain(`m.${champ}`);
    // ⚠️ La comparaison est en MINUSCULES des deux côtés : un en-tête écrit « Gestion@Criterimmo.fr » à l'occasion.
    expect(p).toContain("lower(dn ->> 'adresse') = $7");
    // 🔴 L'adresse est LIÉE, jamais collée : elle vient de la base.
    expect(p).not.toContain('gestion@');
  });
});

describe('🔴 les quatre endroits disent la même chose', () => {
  it('① la LISTE : l’appartenance entre aux DEUX étages du parcours', async () => {
    await lireBoiteMail(null, [], 30, { etiquette: etiq('reception') });
    const sql = page()?.sql ?? '';
    expect(sql).toContain("(m.sens = 'recu' OR EXISTS");
    expect(sql).toContain("(m2.sens = 'recu' OR EXISTS");
    expect(page()?.params[3]).toBe('gestion@criterimmo.fr');
  });

  it('② le TOTAL de l’en-tête porte le MÊME prédicat, aux deux étages', async () => {
    await lireBoiteMail(null, [], 30, { etiquette: etiq('reception') });
    const t = total();
    expect(t?.sql).toContain("(m.sens = 'recu' OR EXISTS");
    expect(t?.sql).toContain("(m2.sens = 'recu' OR EXISTS");
    expect(t?.params).toEqual(['gestion@criterimmo.fr']);
  });

  it('③ le COMPTEUR de la colonne de gauche compte la même chose', async () => {
    queryMock.mockImplementation(async () => ({
      rows: [{ lisibles: 10, total: 12, envoyes: 6613, reception: 8529, spam: 250 }],
    }));
    const c = await comptesBoite();
    const q = appels().find((a) => a.sql.includes('dernier_recu'));
    expect(q?.sql).toContain("(sens = 'recu' OR EXISTS");
    expect(q?.params).toEqual(['gestion@criterimmo.fr']);
    expect(c.reception).toBe(8529);
  });

  it('④ la case « Réception » de la recherche cherche exactement ce que l’étiquette montre', () => {
    const { sql, params } = conditions(
      { saisie: 'facture', listes: ['reception'] } as never, true, true, 'gestion@criterimmo.fr');
    const tout = plat(sql.join(' AND '));
    expect(tout).toContain("(m.sens = 'recu' OR EXISTS");
    expect(params).toContain('gestion@criterimmo.fr');
  });

  /**
   * ⚠️ ET SANS ADRESSE, LA RECHERCHE EST CELLE D'AVANT. Les appels qui ne lisent pas la configuration (tests
   * existants, appelants anciens) ne doivent pas produire une requête à moitié juste.
   */
  it('sans adresse, la recherche garde la règle d’avant', () => {
    const { sql } = conditions({ saisie: 'facture', listes: ['reception'] } as never, true, true);
    expect(plat(sql.join(' AND '))).toContain("(m.sens = 'recu' AND m.exclu_le IS NULL)");
  });
});

describe('🔴 « Envoyés » n’est pas touché', () => {
  it('sa liste reste le littéral, et ne réclame AUCUN paramètre de plus', async () => {
    await lireBoiteMail(null, [], 30, { etiquette: etiq('envoyes') });
    expect(page()?.sql).toContain("AND m.sens = 'envoye'");
    expect(page()?.sql).not.toContain('dest_cci');
    expect(page()?.params).toHaveLength(3);
    // ⚠️ Un paramètre de trop et PostgreSQL refuse la requête : « bind message supplies N parameters… ».
    expect(total()?.params).toEqual([]);
  });

  /**
   * 🔴 LES DEUX BOÎTES SE RECOUVRENT, ELLES NE SE PARTAGENT PAS. Un message qu'on s'adresse à soi-même est dans
   * les DEUX — il n'est pas retiré d'« Envoyés » pour entrer en Réception. C'est pourquoi on ne touche pas à
   * `sens` : ces messages sont bel et bien envoyés.
   */
  it('🔴 rien n’exclut d’Envoyés un message qui nous est aussi adressé', async () => {
    await lireBoiteMail(null, [], 30, { etiquette: etiq('envoyes') });
    const sql = page()?.sql ?? '';
    expect(sql).not.toContain('NOT EXISTS (SELECT 1 FROM jsonb_array_elements');
  });
});

describe('les autres étiquettes ignorent la règle, comme avant', () => {
  it.each(['a_classer', 'sans_suite', 'automatique', 'spam'])('« %s » ne nomme aucun destinataire', async (sorte) => {
    await lireBoiteMail(null, [], 30, { etiquette: etiq(sorte) });
    expect(page()?.sql).not.toContain('dest_cci');
  });
});
