import { describe, it, expect, vi } from 'vitest';

/**
 * ══ 🔴🔴 LOT GESTION-BADGE-ONESHOT (Arno, 16/10/2026) — LE BADGE « Suivi modifié en one shot » ════════════════════════
 * Il ne s'allume QUE sur un vrai one shot. Défaut constaté (fil 36646) : après « Ce mail + futurs échanges », CHAQUE mail
 * de la fenêtre l'affichait — les biens retirés par la fenêtre étaient lus comme des gestes « ce mail uniquement ».
 * La base est simulée ; `oneShotDetaille` est la VRAIE source du badge (conversation, listes, plein écran, historique).
 */
const SORTIES = vi.hoisted(() => [] as Record<string, unknown>[]);
const EXCEPTIONS = vi.hoisted(() => [] as Record<string, unknown>[]);
vi.mock('../db/client', () => ({
  query: async (sql: string) => {
    const s = sql.replace(/\s+/g, ' ');
    if (s.includes('to_regclass')) return { rows: [{ e: 'gestion_message_exception', s: true }] };
    if (s.includes('FROM gestion_message_exception e')) return { rows: EXCEPTIONS };
    if (s.includes("r.statut = 'sorti'")) return { rows: SORTIES };
    return { rows: [] };
  },
}));
vi.mock('./traceOneShotRepo', () => ({ traceOneShotDisponible: async () => false, photoDuFondEnBase: async () => null }));
vi.mock('./periodeRepo', () => ({
  MOTIF_RETIRE_PAR_SUIVI: 'retiré par le suivi de la conversation',
  MOTIF_DETACHE_A_LA_MAIN: 'bien décoché à la main dans la fenêtre de rattachement',
  MOTIF_REMPLACE_PAR_FENETRE: 'remplacé par le suivi choisi dans la fenêtre de rattachement',
  suiviDuFil: async () => ({ periodes: [], exceptions: [] }), mailsDuFil: async () => [1, 2, 3, 4],
}));

import { oneShotDetaille } from './suiviOneShotRepo';

const sortie = (m: number, motif: string | null) => ({
  message_id: String(m), fil_id: '9', libelle: '54 Avenue Puvis De Chavannes — lot 21', cle: '21',
  par: 'a.jorel@sansvisavis.com', motif, nom: null, le: '2026-10-16T19:55:23Z', photo: null,
});

describe('🔴🔴 le badge « Suivi modifié en one shot » ne s’allume que sur un vrai one shot', () => {
  it('🔴🔴 fenêtre « Ce mail + futurs » (cas du fil 36646) : aucun badge, mail d’ouverture compris ; vrai one shot : badge', async () => {
    SORTIES.length = 0; EXCEPTIONS.length = 0;
    SORTIES.push(
      sortie(1, 'remplacé par le suivi choisi dans la fenêtre de rattachement'),  // mail de la fenêtre
      sortie(2, 'bien décoché à la main dans la fenêtre de rattachement'),        // ouverture d'une fenêtre d'avant ce lot, sans exception
      sortie(3, 'bien décoché à la main dans la fenêtre de rattachement'),        // vrai one shot : exception vivante
      sortie(4, null),                                                             // « Sortir du suivi » : inchangé
    );
    EXCEPTIONS.push({ message_id: '3', fil_id: '9', libelle: 'a.jorel@sansvisavis.com', nom: null, le: '2026-10-16T19:55:23Z', photo: null });
    const { modifications } = await oneShotDetaille([1, 2, 3, 4]);
    expect(modifications.has(1)).toBe(false);
    expect(modifications.has(2)).toBe(false);
    expect(modifications.has(3)).toBe(true);
    expect(modifications.has(4)).toBe(true);
  });
});
