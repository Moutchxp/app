import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * 🔴 MON ESPACE, LOT 5 — les VRAIES routes de création (POST /api/admin/mon-espace/compromis) et de vérification du n° (GET …/mandat), base
 * simulée (rien n'est écrit). `enregistrerDossier` (la fonction de la tuile Suivi CA) est espionnée : on vérifie qu'elle reçoit la saisie telle
 * quelle, ou qu'elle n'est JAMAIS appelée quand « Mon espace » refuse.
 */
const h = vi.hoisted(() => ({ garde: vi.fn(), enregistrer: vi.fn(), role: 'collaborateur', mandat: true, prise: null as unknown }));
vi.mock('../../../../../lib/mon-espace/garde', () => ({ exigerMonEspace: h.garde }));
vi.mock('../../../../../lib/gestion/auteur', () => ({ auteurDeLaRequete: async () => ({ id: 5, libelle: 'lea@x.fr' }) }));
vi.mock('../../../../../lib/db/client', () => ({ query: async () => ({ rows: [{ role: h.role }] }) }));
vi.mock('../../../../../lib/admin/schemaDroits', () => ({ mandatDisponible: async () => h.mandat, repartitionDisponible: async () => true,
  personneTypeDisponible: async () => true, prixVenteDisponible: async () => true, uniteCommissionDisponible: async () => true }));
vi.mock('../../../../../lib/transaction/repo', () => ({ enregistrerDossier: h.enregistrer, lireNegociateurs: async () => [], lireVentes: async () => [] }));
vi.mock('../../../../../lib/transaction/mandatRepo', async (orig) => ({ ...(await orig<object>()), venteDuMandat: async () => h.prise }));

import { POST } from './route';
import { GET as verifier } from '../mandat/route';
import { MOTIF_CREATION_PAS_SUR_UN_COTE, MOTIF_CREATION_SANS_449, MOTIF_CREATION_SANS_MANDAT } from '../../../../../lib/mon-espace/creation';
import { INDEX_UNIQUE_MANDAT } from '../../../../../lib/transaction/mandatRepo';

const dossier = (o: Record<string, unknown> = {}) => ({ societe: 'criterimmo', statut: 'compromis', honorairesTtc: 12000, retroApporteurTtc: 0, numeroMandat: 'M-42',
  personnes: [{ role: 'vendeur', nom: 'DUPONT' }], entreeId: 5, sortieId: 7,
  parties: [{ sorte: 'entree', compteId: 5, pourcentage: 50 }, { sorte: 'sortie', compteId: 7, pourcentage: 50 }], ...o });
const poster = async (corps: Record<string, unknown>) => {
  const r = await POST(new Request('http://local/api/admin/mon-espace/compromis', { method: 'POST', body: JSON.stringify(corps) }));
  return { status: r.status, corps: await r.json() as { etat?: string; motif?: string; data?: unknown } };
};
beforeEach(() => {
  h.garde.mockResolvedValue({ auteurId: 5 }); h.role = 'collaborateur'; h.mandat = true; h.prise = null;
  h.enregistrer.mockReset().mockResolvedValue({ ok: true, valeur: 99 });
});

describe('🔴 POST /api/admin/mon-espace/compromis — créer depuis « Mon espace »', () => {
  it('sans structure : 422, rien n’est enregistré', async () => {
    const r = await poster({ dossier: dossier({ societe: null }) });
    expect([r.status, r.corps.motif]).toEqual([422, 'Société inconnue.']);
    expect(h.enregistrer).not.toHaveBeenCalled();
  });
  it('sans n° de mandat : 422, rien n’est enregistré', async () => {
    for (const numeroMandat of [undefined, '', '   ']) {
      const r = await poster({ dossier: dossier({ numeroMandat }) });
      expect([r.status, r.corps.motif]).toEqual([422, MOTIF_CREATION_SANS_MANDAT]);
    }
    expect(h.enregistrer).not.toHaveBeenCalled();
  });
  it('sans la migration 449 : 422 (aucun contrôle de doublon possible, donc aucune création)', async () => {
    h.mandat = false;
    expect((await poster({ dossier: dossier() })).corps.motif).toBe(MOTIF_CREATION_SANS_449);
    expect(h.enregistrer).not.toHaveBeenCalled();
  });
  it('n° libre : la saisie part TELLE QUELLE vers enregistrerDossier (la fonction de la tuile) ; l’id est rendu', async () => {
    const r = await poster({ dossier: dossier() });
    expect([r.status, r.corps]).toEqual([200, { etat: 'ok', data: 99 }]);
    const [id, saisie] = h.enregistrer.mock.calls[0] as [number | null, Record<string, unknown>];
    expect(id).toBeNull();
    expect(saisie).toMatchObject({ societe: 'criterimmo', statut: 'compromis', numeroMandat: { saisi: 'M-42', normalise: 'M42' }, entreeId: 5, sortieId: 7 });
  });
  it('n° déjà pris dans la structure : le refus d’enregistrerDossier (avec le résumé) rendu en 422 ; doublon levé par la base : 422', async () => {
    h.enregistrer.mockResolvedValue({ ok: false, motif: 'Ce mandat existe déjà : n° M-42 chez CRITERIMMO — « X », compromis en cours. Rien n’a été enregistré.' });
    const r = await poster({ dossier: dossier() });
    expect([r.status, r.corps.motif]).toEqual([422, 'Ce mandat existe déjà : n° M-42 chez CRITERIMMO — « X », compromis en cours. Rien n’a été enregistré.']);
    h.enregistrer.mockRejectedValue(Object.assign(new Error('unique'), { code: '23505', constraint: INDEX_UNIQUE_MANDAT }));
    expect((await poster({ dossier: dossier() })).status).toBe(422);
  });
  it('collaborateur absent des deux côtés : refusé (403), rien n’est enregistré ; administrateur : accepté pour autrui', async () => {
    const autrui = dossier({ entreeId: 7, sortieId: 8, parties: [{ sorte: 'entree', compteId: 7, pourcentage: 50 }, { sorte: 'sortie', compteId: 8, pourcentage: 50 }] });
    const r = await poster({ dossier: autrui });
    expect([r.status, r.corps.motif]).toEqual([403, MOTIF_CREATION_PAS_SUR_UN_COTE]);
    expect(h.enregistrer).not.toHaveBeenCalled();
    h.role = 'administrateur';
    expect((await poster({ dossier: autrui })).status).toBe(200);
    expect(h.enregistrer).toHaveBeenCalledTimes(1);
  });
  it('ni une vente directement actée, ni une modification (id) : refusées', async () => {
    expect((await poster({ dossier: dossier({ statut: 'vendue', dateActe: '2026-11-02' }) })).status).toBe(422);
    expect((await poster({ id: 12, dossier: dossier() })).status).toBe(422);
    expect(h.enregistrer).not.toHaveBeenCalled();
  });
  it('sans le droit « Mon espace » : 403', async () => {
    h.garde.mockResolvedValue({ refus: Response.json({ erreur: 'ACCES_REVOQUE' }, { status: 403 }) });
    expect((await poster({ dossier: dossier() })).status).toBe(403);
    expect(h.enregistrer).not.toHaveBeenCalled();
  });
});

describe('🔴 GET /api/admin/mon-espace/mandat — la vérification du n° (les fonctions du lot 2)', () => {
  const lire = async (q: string) => { const r = await verifier(new Request(`http://local/api/admin/mon-espace/mandat?${q}`)); return { status: r.status, corps: await r.json() as Record<string, unknown> }; };
  it('sans structure, ou sans n° : 422', async () => {
    expect((await lire('numero=M-42')).status).toBe(422);
    expect((await lire('societe=macj')).status).toBe(422);
    expect((await lire('societe=macj&numero=%20%20')).status).toBe(422);
  });
  it('libre : { libre: true }', async () => {
    expect((await lire('societe=macj&numero=M-42')).corps).toEqual({ etat: 'ok', data: { libre: true, numero: 'M-42' } });
  });
  it('pris : la transaction existante (bien, statut, date, structure) — aucun montant', async () => {
    h.prise = { id: 3, societe: 'macj', numero: 'M-0042', libelle: 'DUPONT / MARTIN', statut: 'compromis', dateCompromis: '2026-10-01', dateActe: null, adresseBien: '1 rue A' };
    const r = await lire('societe=macj&numero=m%2042');
    const t = (r.corps.data as { libre: boolean; transaction: Record<string, unknown> });
    expect(t.libre).toBe(false);
    expect(t.transaction).toMatchObject({ id: 3, societe: 'macj', numero: 'M-0042', libelle: 'DUPONT / MARTIN', statut: 'compromis', dateCompromis: '2026-10-01', adresseBien: '1 rue A' });
    expect(JSON.stringify(r.corps)).not.toMatch(/honoraires|montant|commission/i);
  });
});
