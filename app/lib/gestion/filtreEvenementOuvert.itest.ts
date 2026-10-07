/**
 * ══ 🔴🔴 LOT FILTRE-A-LA-ROUTE — « ENSEMBLE FILTRÉ = ENSEMBLE DES MAILS ÉTIQUETÉS », SUR LES VRAIES DONNÉES ══════
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * DEMANDE D'ARNO (07/10/2026) : « Ajoute un test de bout en bout qui appelle la VRAIE route de l'écran avec et
 * sans le filtre, et exige : ensemble filtré = ensemble des mails étiquetés. »
 *
 * 🔴🔴 POURQUOI UNE ÉPREUVE D'INTÉGRATION, ET CE QUE CELA COÛTE. L'égalité demandée porte sur des ENSEMBLES de
 * mails : elle ne se mesure que sur de vraies données. Un pilote simulé dirait que le filtre garde ce que j'ai
 * décidé qu'il garderait — c'est-à-dire rien. Ce fichier appelle donc les VRAIES routes (`GET` comprises) contre
 * la vraie base locale.
 *
 * ⚠️ IL EST DONC HORS DE `npm test` (motif `*.itest.ts`, `npm run test:integration`) : il serait rouge sur toute
 * machine sans la base et ses 57 000 mails, et une suite rouge pour une raison normale finit par ne plus être
 * lue — précédent `curation.test.ts`, rouge du 14/07 au 03/08/2026 (AGENTS.md). LA GARANTIE DE STRUCTURE, elle,
 * tourne dans `npm test` : `filtreQuatreQuestions.route.test.ts` exige que le listing, le compteur, la frise et
 * le résumé des pièces envoient à la base LE MÊME TEXTE de condition, celui que l'étiquette fabrique.
 *
 * 🔴 CE QUE CE FICHIER AURAIT ATTRAPÉ. Le 07/10/2026, le listing filtré rendait 5 mails là où 9 portaient
 * l'étiquette — le filtre ne connaissait que la voie du fil. Les chiffres ci-dessous sont ceux du bien 315, le
 * cas d'Arno. Mais l'épreuve ne s'y arrête pas : elle rejoue l'égalité sur TOUS les biens qui portent au moins
 * un mail étiqueté, parce qu'un filtre juste sur un bien peut être faux sur le suivant.
 *
 * ⚠️ LECTURE SEULE, INTÉGRALEMENT : les trois routes appelées n'émettent que des SELECT (c'est écrit dans leur
 * en-tête, et leur garde de lot le tient). Rien n'est écrit, rien n'est à remettre en l'état.
 *
 * ⚠️ LA GARDE D'ACCÈS EST NEUTRALISÉE, ET SEULEMENT ELLE. Ce fichier éprouve la règle de sélection, pas le
 * droit d'entrer : l'authentification a ses propres épreuves. Tout le reste — lecture des paramètres d'adresse,
 * `etendreCible`, les quatre questions — est le code de production, tel quel.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */
import { afterAll, describe, expect, it } from 'vitest';
import { vi } from 'vitest';

vi.mock('../admin/garde', () => ({ exigerCompteActif: async () => null }));

import { closePool, query } from '../db/client';

/** Le cas d'Arno, relevé à l'écran le 07/10/2026 : 9 mails étiquetés sur 140, dont un en octobre. */
const CAS_ARNO = { lot: '315', etiquetes: 9, total: 140 };

type Ligne = { messageId: number; evenements: { ouvert: boolean }[] };

async function routes(): Promise<{
  historique: (r: Request) => Promise<Response>;
  frise: (r: Request) => Promise<Response>;
  pieces: (r: Request) => Promise<Response>;
}> {
  const h = await import('../../(admin)/api/admin/gestion/historique/route');
  const f = await import('../../(admin)/api/admin/gestion/historique/frise/route');
  const p = await import('../../(admin)/api/admin/gestion/historique/pieces/route');
  return { historique: h.GET, frise: f.GET, pieces: p.GET };
}

/** L'adresse EXACTE que l'écran appelle, relevée dans l'onglet Réseau de Chrome. */
const adresse = (chemin: string, lot: string, filtre: boolean): string =>
  `http://local/api/admin/gestion/historique${chemin}?${filtre ? 'evt=ouvert&' : ''}taille=100&cible=lot-${lot}`;

async function donnees(appel: (r: Request) => Promise<Response>, url: string): Promise<Record<string, unknown>> {
  const res = await appel(new Request(url));
  expect(res.status).toBe(200);
  const corps = await res.json() as { etat: string; data: Record<string, unknown> };
  expect(corps.etat).toBe('ok');
  return corps.data;
}

const tries = (n: readonly number[]): number[] => [...n].sort((a, b) => a - b);

afterAll(async () => { await closePool(); });

describe('la VRAIE route, avec et sans le filtre « Événement ouvert »', () => {
  it(`🔴🔴 bien ${CAS_ARNO.lot} : ${CAS_ARNO.etiquetes} étiquetés sans le filtre, LES MÊMES ${CAS_ARNO.etiquetes} avec`,
    async () => {
      const { historique } = await routes();
      const sans = await donnees(historique, adresse('', CAS_ARNO.lot, false));
      const avec = await donnees(historique, adresse('', CAS_ARNO.lot, true));

      const etiquetes = tries((sans.lignes as Ligne[])
        .filter((l) => l.evenements.some((e) => e.ouvert)).map((l) => l.messageId));
      const filtres = tries((avec.lignes as Ligne[]).map((l) => l.messageId));

      /* 🔴 L'ÉGALITÉ DEMANDÉE PAR ARNO, et elle se lit dans les deux sens : aucun mail filtré sans étiquette
         (le filtre n'invente rien), aucun mail étiqueté hors du filtre (le filtre n'en perd aucun). */
      expect(filtres).toEqual(etiquetes);
      expect(etiquetes.length).toBe(CAS_ARNO.etiquetes);

      /* ⚠️ ET CHAQUE LIGNE RENDUE PAR LE FILTRE PORTE BIEN L'ÉTIQUETTE : l'égalité des identifiants ne suffit
         pas à le dire, puisque la seconde requête pourrait rendre les bons mails sans leur événement. */
      for (const l of avec.lignes as Ligne[]) expect(l.evenements.some((e) => e.ouvert)).toBe(true);
    });

  /**
   * 🔴🔴 LE COMPTEUR D'EN-TÊTE DIT LE MÊME NOMBRE. C'est lui qu'on lit en haut de l'écran (« Historique du
   * bien 9 »), et il vient d'une AUTRE requête que le listing : un compteur qui annoncerait 140 au-dessus de
   * neuf lignes serait le même désaccord, sous un autre visage.
   */
  it('🔴🔴 le compteur d’en-tête annonce exactement le nombre de lignes filtrées', async () => {
    const { historique } = await routes();
    const avec = await donnees(historique, adresse('', CAS_ARNO.lot, true));
    const entete = avec.entete as { nbMails: number };
    const total = avec.total as { nbMails: number };
    expect(entete.nbMails).toBe((avec.lignes as Ligne[]).length);
    expect(entete.nbMails).toBe(CAS_ARNO.etiquetes);
    // Et le TOTAL du bien, lui, ne bouge pas : « 9 sur 140 ».
    expect(total.nbMails).toBe(CAS_ARNO.total);
  });

  /**
   * ══ 🔴🔴 LA FRISE — C'EST ELLE QUI DISAIT « oct. 0 » ══════════════════════════════════════════════════════
   *
   * Arno : « la frise affiche “oct. 0” au lieu de 1 ». La frise vit dans SA PROPRE ROUTE et compte les mails
   * par mois : le mail du 06/10 lui manquait parce que le filtre le retirait. On exige donc ici les mêmes
   * identifiants que le listing — et, nommément, qu'il y ait bien un mail d'octobre 2026.
   */
  it('🔴🔴 la frise rend les mêmes mails que le listing, octobre compris', async () => {
    const { historique, frise } = await routes();
    const avec = await donnees(historique, adresse('', CAS_ARNO.lot, true));
    const f = await donnees(frise, adresse('/frise', CAS_ARNO.lot, true));
    const mails = f.mails as { messageId: number; recuLe: string }[];

    expect(tries(mails.map((m) => m.messageId))).toEqual(tries((avec.lignes as Ligne[]).map((l) => l.messageId)));
    expect(mails.filter((m) => m.recuLe.startsWith('2026-10')).length).toBe(1);
  });

  /** 🔴 LE RÉSUMÉ DES PIÈCES parle de la même sélection : ses mails sont un sous-ensemble du listing filtré. */
  it('🔴 le résumé des pièces ne sort pas de la sélection filtrée', async () => {
    const { historique, pieces } = await routes();
    const avec = await donnees(historique, adresse('', CAS_ARNO.lot, true));
    const p = await donnees(pieces, adresse('/pieces', CAS_ARNO.lot, true));
    const dansLeListing = new Set((avec.lignes as Ligne[]).map((l) => l.messageId));
    for (const m of p.messages as { messageId: number }[]) expect(dansLeListing.has(m.messageId)).toBe(true);
  });

  /**
   * ══ 🔴🔴 ET SUR TOUS LES BIENS QUI PORTENT UN MAIL ÉTIQUETÉ, PAS SEULEMENT CELUI D'ARNO ═══════════════════
   *
   * Un filtre juste sur un bien peut être faux sur le suivant : celui d'Arno n'a AUCUNE partie déclarée (son
   * bien ne vient que des mails de l'événement), un autre en aurait. La liste des biens à éprouver est donc
   * LUE EN BASE, et non écrite ici — le jour où un événement naît ailleurs, l'épreuve l'inclut d'elle-même.
   */
  it('🔴🔴 l’égalité tient sur CHAQUE bien qui porte au moins un mail étiqueté', async () => {
    const { historique } = await routes();
    const { rows } = await query<{ cle: string }>(
      `SELECT DISTINCT r.cible_cle AS cle
         FROM gestion_rattachement r
         JOIN gestion_message m ON m.id = r.message_id
         JOIN gestion_evenement ev ON ev.etat <> 'traite'
        WHERE r.cible_sorte = 'lot' AND r.statut = 'confirme' AND r.piece_id IS NULL
          AND btrim(coalesce(r.cible_cle, '')) <> ''
        ORDER BY 1`);
    // Un garde contre le faux vert : zéro bien à éprouver voudrait dire que la base n'a plus d'événement ouvert.
    expect(rows.length).toBeGreaterThan(0);

    for (const { cle } of rows) {
      const sans = await donnees(historique, adresse('', cle, false));
      const avec = await donnees(historique, adresse('', cle, true));
      const etiquetes = tries((sans.lignes as Ligne[])
        .filter((l) => l.evenements.some((e) => e.ouvert)).map((l) => l.messageId));
      const filtres = tries((avec.lignes as Ligne[]).map((l) => l.messageId));
      expect(filtres, `bien ${cle}`).toEqual(etiquetes);
    }
  });
});
