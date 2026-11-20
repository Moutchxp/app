import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * 🔴 Arno (18/11/2026) — « aligne raccourciDriveRepo.ts et famillesAdressesRepo.ts sur la règle de la fiche, avec la même fonction
 * unique que la recherche. » Les biens d'un LOCATAIRE dans la fenêtre Drive : « locataire » ou « ancien locataire » se décide par
 * `locataireEnPlace` (une date de sortie renseignée, même à venir, fait un ancien locataire). Base simulée, lecture seule.
 */
const h = vi.hoisted(() => ({ biens: [] as Record<string, unknown>[], params: [] as unknown[][] }));
vi.mock('../db/client', () => ({
  query: async (sql: string, params: unknown[] = []) => {
    if (sql.includes('FROM gestion_annuaire_contact c')) return { rows: [{ sujet: 'locataire', sujet_id: '77' }] };
    if (sql.includes('DISTINCT ON (oc.lot_wippimmo_id)')) { h.params.push(params); return { rows: h.biens }; }
    return { rows: [] };
  },
}));
vi.mock('./schema', () => ({ rattachementsDisponibles: async () => false }));
vi.mock('./partieCategorieRepo', () => ({ biensEtCotesDesContacts: async () => new Map() }));

import { biensPourLaFenetreDrive } from './raccourciDriveRepo';

const lot = (cle: string, sortie: string | null) => ({ cle, adresse: `${cle} rue A`, code_postal: '92400', commune: 'COURBEVOIE',
  proprietaire: null, proprietaire_cle: null, dossier_bien: null, sortie });
const demain = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);

describe('🔴 la fenêtre Drive d’un locataire — la règle de la fiche', () => {
  beforeEach(() => { h.biens = []; h.params = []; });

  it('bail sans sortie ou sortie à venir → « locataire » ; sortie passée → « ancien_locataire » ; aucun bien retiré — 🔴 (Arno, 20/11/2026) la règle a changé : une sortie À VENIR laisse EN PLACE (« sortie prévue le … ») ; seule une sortie passée (le jour même compris) fait l’ancien', async () => {
    h.biens = [lot('418', null), lot('219', '2025-08-07'), lot('385', demain)];
    const r = await biensPourLaFenetreDrive({ adresses: ['loc@exemple.fr'] });
    expect(r.biens.map((b) => [b.cle, b.raison])).toEqual([['418', 'locataire'], ['219', 'ancien_locataire'], ['385', 'locataire']]);
    // Le locataire trouvé part en paramètre lié.
    expect(h.params).toEqual([[77]]);
  });
});
