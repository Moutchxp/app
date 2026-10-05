import { describe, it, expect, vi, beforeEach } from 'vitest';

const queryMock = vi.fn();
vi.mock('../db/client', () => ({ query: (...a: unknown[]) => queryMock(...a) }));
vi.mock('./schema', () => ({ rattachementsDisponibles: async () => true }));

import { evenementsParLocataire, EVENEMENTS_PAR_LOCATAIRE_MAX } from './historiqueBienRepo';

/**
 * ══ 🔴🔴 LOT HISTORIQUE-BIEN-18, POINT 1 — LA DÉFINITION DE « L'ÉVÉNEMENT LE CONCERNE », ÉPROUVÉE ═══════════════
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * Arno demande : « Donne la définition retenue et teste-la. » Elle a DEUX branches, et elles vivent ici parce que
 * c'est le SQL qui connaît les mails :
 *   ① l'ouverture de l'événement tombe dans l'occupation ;
 *   ② un de ses mails porte une adresse de sa carte ou d'un de ses contacts annexes.
 *
 * ═══ 🔴🔴 CE QUE L'ESSAI SUR LA VRAIE BASE A CORRIGÉ, ET QUE CE FICHIER TIENT FERMÉ ═════════════════════════════
 *
 * Un événement d'essai posé sur le fil 3366 (le dépôt de garantie de VAGLIO, lot-146) remontait pour les TROIS
 * cartes du bien — dont ACKET GOEMAERE - DERRIEN, partie le 31/01/2025 et étrangère à ce dépôt. Une seule
 * adresse l'y traînait : celle de la PROPRIÉTAIRE du lot, qui paraît dans les mails de toutes les locations.
 * Sans ce tri, tout événement touchant le bailleur aurait prolongé la période de TOUS les anciens locataires
 * jusqu'à aujourd'hui. L'essai a ensuite été retiré, la base recomptée identique (2 événements, 8 affectations).
 *
 * ⚠️ POURQUOI DES FRAGMENTS DE SQL, ET NON LA FORME DE LA REQUÊTE. La règle du dépôt (AGENTS.md) interdit de
 * figer la forme d'un SQL émis — un reformatage casserait l'épreuve sans qu'un comportement ait changé. On lit
 * donc, sur la chaîne normalisée, les fragments qui PORTENT la décision : la jointure des contacts du
 * propriétaire, et l'exclusion qui s'ensuit. Ce que chacun fait aux dates est éprouvé dans la partie pure
 * (`historiqueBienProlongation.test.ts`) et à l'écran (`HistoriqueDuBien.test.ts`).
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */

/** Le SQL émis, blancs normalisés — la forme exacte n'est jamais figée, seuls les fragments qui décident. */
const sql = (): string => String(queryMock.mock.calls[0][0]).replace(/\s+/g, ' ');

beforeEach(() => {
  queryMock.mockReset();
  queryMock.mockResolvedValue({ rows: [] });
});

describe('🔴🔴 quels événements concernent quel locataire', () => {
  it('🔒 elle lit par la clé du lot, et sous le plafond nommé', async () => {
    await evenementsParLocataire('104');
    expect(queryMock.mock.calls[0][1]).toEqual(['104', EVENEMENTS_PAR_LOCATAIRE_MAX]);
  });

  it('⚠️ une clé vide ne lit RIEN : une requête sans cible aurait rendu le bien de quelqu’un d’autre', async () => {
    expect(await evenementsParLocataire('   ')).toEqual([]);
    expect(queryMock).not.toHaveBeenCalled();
  });

  it('🔴 BRANCHE ① — l’ouverture dans l’occupation, bornée à aujourd’hui quand le bail court', async () => {
    await evenementsParLocataire('104');
    expect(sql()).toContain('ev.ouvert_le::date <= coalesce(b.sortie, current_date)');
  });

  it('🔴 BRANCHE ② — une adresse à elle dans un mail de l’événement, SANS condition de date', async () => {
    await evenementsParLocataire('104');
    const s = sql();
    expect(s).toContain('JOIN siennes s ON s.occ = b.occ AND s.adresse = a.adresse');
    /* ⚠️ ET LES NÔTRES ÉCARTÉES : nous paraissons partout, nous serions contact annexe de chaque location. */
    expect(s).toContain('a.interne = false');
  });

  /**
   * 🔴🔴 LE DÉFAUT TROUVÉ À L'ESSAI. Les contacts du propriétaire du lot et ceux des AUTRES cartes sont écartés
   * de la branche ② — sauf s'ils sont aussi une adresse de SA PROPRE carte, qui est à elle quoi qu'il arrive.
   */
  it('🔴🔴 une adresse d’une AUTRE PARTIE du bien ne rattache rien : propriétaire et autres cartes écartés', async () => {
    await evenementsParLocataire('104');
    const s = sql();
    expect(s).toContain("c.sujet = 'proprietaire' AND c.sujet_id = l.proprietaire_id");
    expect(s).toContain('NOT EXISTS (SELECT 1 FROM autres au WHERE au.adresse = a.adresse)');
    expect(s).toContain('NOT EXISTS (SELECT 1 FROM cartes ad WHERE ad.adresse = a.adresse)');
    /* ⚠️ MAIS SA PROPRE ADRESSE RESTE, et cette branche-là passe AVANT les deux exclusions. */
    expect(s).toContain('EXISTS (SELECT 1 FROM cartes mi WHERE mi.occ = p.occ AND mi.adresse = a.adresse)');
  });

  /** ⚠️ « UN MAIL RATTACHÉ À UN BIEN » N'EST PAS REDÉFINI ICI : c'est la règle commune aux quatre écrans. */
  it('⚠️ elle emprunte le prédicat commun de rattachement, elle n’en écrit pas un second', async () => {
    await evenementsParLocataire('104');
    expect(sql()).toContain("r.statut = 'confirme' AND r.cible_sorte = 'lot'");
  });

  /**
   * 🔴 LA LECTURE REND LA FORME QUE LA PARTIE PURE ATTEND. `etat <> 'traite'` ⇒ `ouvert`, et c'est lui qui fait
   * finir l'événement « aujourd'hui » : un état mal traduit aurait raccourci une période en silence.
   */
  it('🔴 elle rend `occ-<id>`, l’état en booléen et la branche qui a rattaché', async () => {
    queryMock.mockResolvedValue({
      rows: [
        {
          occ: '503', id: '9', reference: 'GES-2026-000009', objet: 'Litige dépôt de garantie',
          etat: 'en_cours', ouvert_le: '2025-11-11T08:00:00Z', traite_le: null, par: 'adresse',
        },
        {
          occ: '92', id: '9', reference: 'GES-2026-000009', objet: 'Litige dépôt de garantie',
          etat: 'traite', ouvert_le: '2025-11-11T08:00:00Z', traite_le: '2026-03-15T08:00:00Z',
          par: 'occupation',
        },
      ],
    });
    const r = await evenementsParLocataire('104');
    expect(r[0]).toEqual({
      cle: 'occ-503', evenementId: 9, reference: 'GES-2026-000009', objet: 'Litige dépôt de garantie',
      ouvert: true, ouvertLe: '2025-11-11T08:00:00Z', closLe: null, par: 'adresse',
    });
    expect(r[1].ouvert).toBe(false);
    expect(r[1].closLe).toBe('2026-03-15T08:00:00Z');
    expect(r[1].par).toBe('occupation');
  });

  /** ⚠️ UNE BRANCHE INCONNUE RETOMBE SUR « adresse », jamais sur une valeur hors du type. */
  it('⚠️ une branche illisible ne devient pas une troisième sorte', async () => {
    queryMock.mockResolvedValue({
      rows: [{
        occ: '1', id: '1', reference: 'GES-2026-000001', objet: 'X', etat: 'traite',
        ouvert_le: null, traite_le: null, par: 'autre chose',
      }],
    });
    expect((await evenementsParLocataire('104'))[0].par).toBe('adresse');
  });
});
