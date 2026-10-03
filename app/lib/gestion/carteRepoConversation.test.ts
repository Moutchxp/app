import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * LOT 5b — LA LECTURE D'UNE CONVERSATION, côté base. Le point dur n'est pas d'afficher les messages écartés : c'est de
 * les afficher DANS LEUR FIL sans qu'ils reviennent dans la FILE DE TRI. Les deux lectures sont distinctes et doivent
 * le rester — c'est exactement la logique de Gmail, qui range les promotions ailleurs sans les retirer du fil.
 *
 * On teste le COMPORTEMENT (paramètres liés, ce que la projection rend), jamais la forme du SQL.
 */

const queryMock = vi.fn();
vi.mock('../db/client', () => ({ query: (...a: unknown[]) => queryMock(...a) }));
vi.mock('./schema', () => ({
  /* 🔴 LOT ETOILE-SIGNATURES-PIECES — la 296 n'est pas le sujet de ce fichier : ABSENTE, la colonne
     `integree` n'est nommée nulle part et le SQL inspecté ici reste celui d'avant ce lot. */
  pieceIntegreeDisponible: async () => false,
  deplacementsDeMailsDisponibles: async () => false,
  destinatairesSeparesDisponibles: async () => avecDest,
  // LOT ENVOI-DIAG — la conversation demande désormais les avis de non-remise de ses messages. Ici la migration 261
  //   est déclarée ABSENTE : `nonRemisesDesMessages` rend une carte vide sans émettre une seule requête, et les
  //   assertions de ce fichier portent donc exactement sur le SQL d'avant ce lot.
  nonRemiseDisponible: async () => false,
  // 🔴 LOT NOM-UNIQUE-DES-PIECES — la sonde du nom d'usage (migration 286). Fausse ici : ces épreuves
  //   portent sur autre chose, et le SQL qu'elles inspectent reste celui d'avant ce lot.
  nomUsageDisponible: async () => false,
}));

let avecDest = true;

import { lireCorpsDuMessage, lireMessagesDuFil } from './carteRepo';

const filRow = (o: Record<string, unknown> = {}) => ({
  id: 7, objet: 'Chauffage en panne', etat: 'a_classer', reference: null, evenement_id: null, ...o,
});
const msgRow = (n: number, o: Record<string, unknown> = {}) => ({
  message_id: n, sens: 'recu', de_adresse: 'martin@orange.fr', de_nom: 'Mme Martin',
  recu_le: `2026-09-2${n}T08:00:00Z`, objet: 'Chauffage',
  corps: null, extrait: 'bonjour', automatique: false,
  hors_file: false, motif_hors_file: null, html_seul: false,
  dest_a: null, dest_cc: null, destinataires: 'gestion@criterimmo.fr', est_dernier: false, ...o,
});

/** Répond selon la requête, pas selon l'ordre : plus robuste qu'une file de `mockResolvedValueOnce`. */
const base = (fil: unknown[], messages: unknown[], pieces: unknown[] = []) => {
  queryMock.mockReset();
  queryMock.mockImplementation(async (sql: string) => {
    const s = String(sql);
    if (s.includes('FROM gestion_fil f')) return { rows: fil };
    if (s.includes('WITH msg AS')) return { rows: messages };
    if (s.includes('gestion_piece')) return { rows: pieces };
    return { rows: [] };
  });
};
const sqlMessages = () => String(queryMock.mock.calls.find((c) => String(c[0]).includes('WITH msg AS'))?.[0] ?? '');

beforeEach(() => { avecDest = true; queryMock.mockReset(); });

describe('🔴 les messages écartés sont DANS le fil, et toujours hors de la file de tri', () => {
  it('la conversation ne filtre PLUS `exclu_le` : un fil montre tout ce qui s’y est dit', async () => {
    base([filRow()], [msgRow(1)]);
    await lireMessagesDuFil(7);
    expect(sqlMessages()).not.toContain('exclu_le IS NULL');
  });

  it('un message écarté est rendu, à sa place, avec son motif', async () => {
    base([filRow()], [
      msgRow(1),
      msgRow(2, { hors_file: true, motif_hors_file: 'envoi de logiciel' }),
      msgRow(3, { est_dernier: true, corps: 'et voilà' }),
    ]);
    const r = await lireMessagesDuFil(7);
    expect(r!.messages.map((m) => m.messageId)).toEqual([1, 2, 3]); // l'ordre chronologique est conservé
    expect(r!.messages[1].horsFile).toBe(true);
    expect(r!.messages[1].motifHorsFile).toBe('envoi de logiciel');
    expect(r!.messages[0].horsFile).toBe(false);
  });

  it('la FILE DE TRI, elle, n’a pas bougé : son dépôt continue d’écarter ces messages', async () => {
    const { readFileSync } = await import('node:fs');
    const file = readFileSync('app/lib/gestion/fileRepo.ts', 'utf8');
    expect(file).toContain('exclu_le IS NULL');
    expect(file).not.toContain('conversation'); // les deux lectures restent distinctes
  });
});

describe('le chargement paresseux des corps', () => {
  it('SEUL le dernier message part avec son corps ; les autres n’ont qu’un extrait', async () => {
    base([filRow()], [msgRow(1), msgRow(2, { est_dernier: true, corps: 'le texte complet' })]);
    const r = await lireMessagesDuFil(7);
    expect(r!.messages[0].corps).toBeNull();
    expect(r!.messages[0].extrait).toBe('bonjour');
    expect(r!.messages[1].corps).toBe('le texte complet');
  });

  it('le corps d’un seul message se lit à part, avec son identifiant LIÉ', async () => {
    queryMock.mockResolvedValue({ rows: [{ message_id: 42, corps: 'bonjour', corps_html: null, html_seul: false }] });
    const r = await lireCorpsDuMessage(42);
    // 🔴🔴 LOT CADRE-ISOLE-MAILS — `cssMail` voyage avec le corps : la feuille <style> d'en-tête du mail,
    //   filtrée, pour son cadre isolé. Ce message n'en a pas : chaîne vide, jamais `null`.
    expect(r).toEqual({ messageId: 42, corps: 'bonjour', html: null, htmlSeul: false, cssMail: '' });
    expect(queryMock.mock.calls[0][1]).toEqual([42]);
  });

  it('un message inexistant rend `null` — l’écran dira « ce message n’existe pas », pas « vide »', async () => {
    queryMock.mockResolvedValue({ rows: [] });
    await expect(lireCorpsDuMessage(999)).resolves.toBeNull();
  });

  /**
   * ══ 🔴 LOT BIEN-RATTACHE — UN CORPS VIDE MAIS DU HTML : ON LE REND, ASSAINI ════════════════════════════════
   * Demande d'Arno, sur le fil 36494 : l'écran affichait « affichage à venir » au lieu du contenu. 1 180 mails en
   * base n'ont QUE du HTML. La lecture le rend désormais — et l'assainissement se fait ICI, côté serveur, pour
   * que le navigateur ne voie jamais le HTML brut.
   */
  it('🔴 un corps vide mais du HTML : la lecture rend le HTML ASSAINI', async () => {
    queryMock.mockResolvedValue({
      rows: [{ message_id: 5, corps: '', corps_html: '<p>Bonjour</p>', html_seul: true }],
    });
    await expect(lireCorpsDuMessage(5))
      .resolves.toEqual({ messageId: 5, corps: null, html: '<p>Bonjour</p>', htmlSeul: true, cssMail: '' });
  });

  it('🔴 le script est ÔTÉ avant de sortir de la base — jamais au navigateur de s’en charger', async () => {
    queryMock.mockResolvedValue({
      rows: [{
        message_id: 6, corps: '', html_seul: true,
        corps_html: '<p>Bonjour<script>alert(1)</script><img src="x" onerror="alert(2)"></p>',
      }],
    });
    const r = await lireCorpsDuMessage(6);
    expect(r?.html).not.toContain('<script');
    expect(r?.html).not.toContain('onerror');
    expect(r?.html).toContain('Bonjour');
  });

  it('un HTML qui ne porte QUE des balises ne prétend pas être un contenu', async () => {
    queryMock.mockResolvedValue({
      rows: [{ message_id: 7, corps: '', corps_html: '<div><span></span></div>', html_seul: true }],
    });
    expect((await lireCorpsDuMessage(7))?.html).toBeNull();
  });
});

describe('les destinataires, selon ce que la base sait', () => {
  it('migration 235 appliquée → les colonnes sont lues, et un tableau JSON devient une liste', async () => {
    avecDest = true;
    base([filRow()], [msgRow(1, { est_dernier: true, dest_a: [{ nom: 'Jean', adresse: 'j@d.fr' }], dest_cc: [] })]);
    const r = await lireMessagesDuFil(7);
    expect(sqlMessages()).toContain('dest_a, dest_cc');
    expect(r!.messages[0].destA).toEqual([{ nom: 'Jean', adresse: 'j@d.fr' }]);
    expect(r!.messages[0].destCc).toEqual([]); // analysé et vide : ce n'est PAS « inconnu »
  });

  it('migration 235 ABSENTE → les colonnes ne sont pas nommées, et tout est « non analysé »', async () => {
    avecDest = false;
    base([filRow()], [msgRow(1, { est_dernier: true })]);
    const r = await lireMessagesDuFil(7);
    expect(sqlMessages()).toContain('NULL::jsonb AS dest_a');
    expect(r!.messages[0].destA).toBeNull();
    expect(r!.messages[0].destinatairesFondus).toBe('gestion@criterimmo.fr'); // le repli d'avant, toujours là
  });

  it('une valeur inattendue en base ne casse pas l’écran : elle vaut « non analysé »', async () => {
    base([filRow()], [msgRow(1, { est_dernier: true, dest_a: 'pas un tableau' })]);
    const r = await lireMessagesDuFil(7);
    expect(r!.messages[0].destA).toBeNull();
  });
});

describe('l’en-tête de l’échange voyage avec ses messages', () => {
  it('objet, état et référence — de quoi alimenter le bandeau, où que la conversation soit ouverte', async () => {
    base([filRow({ etat: 'sans_suite', reference: 'GES-2026-000012', evenement_id: 3 })], [msgRow(1, { est_dernier: true })]);
    const r = await lireMessagesDuFil(7);
    expect(r!.fil).toEqual({
      filId: 7, objet: 'Chauffage en panne', etat: 'sans_suite', reference: 'GES-2026-000012', evenementId: 3,
    });
  });

  it('un échange inconnu rend `null`, et rien n’est lu ensuite', async () => {
    base([], []);
    await expect(lireMessagesDuFil(999)).resolves.toBeNull();
    expect(queryMock.mock.calls.some((c) => String(c[0]).includes('WITH msg AS'))).toBe(false);
  });

  it('un état inattendu retombe sur « à classer » plutôt que de proposer un geste impossible', async () => {
    base([filRow({ etat: 'inconnu' })], [msgRow(1, { est_dernier: true })]);
    expect((await lireMessagesDuFil(7))!.fil.etat).toBe('a_classer');
  });
});
