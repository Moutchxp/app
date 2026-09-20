import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * 224 — GET /envoi-auto-apercu : VOLUME RÉEL + CAPS pour la modale de confirmation. On MOCKE garde/config/proposition/envoyerDemandes
 * (aucune DB) mais PAS `process` : le filtre e-mail (dansProcess) est le VRAI. On prouve : (1) AUCUN ENVOI RÉEL — envoyerDemandes est
 * appelé en SIMULATION (`appliquer:false`) ; (2) les chiffres sont RELAYÉS des sources (jamais en dur) ; (3) « communes proposables »
 * ne compte que les communes DISTINCTES du process e-mail ; (4) la fenêtre d'ancienneté est la PLUS LARGE (12 × max annees).
 */
vi.mock('../../../../../../lib/admin/garde', () => ({ exigerModule: vi.fn() }));
vi.mock('../../../../../../lib/sitadel/veilleConfig', () => ({ chargerConfigVeille: vi.fn() }));
vi.mock('../../../../../../lib/sitadel/demandeRepo', () => ({ proposition: vi.fn() }));
vi.mock('../../../../../../lib/sitadel/envoiDemande', () => ({ envoyerDemandes: vi.fn() }));
// process (dansProcess/processDeCanal) NON mocké : on éprouve le VRAI filtre e-mail.

import { GET } from './route';
import { exigerModule } from '../../../../../../lib/admin/garde';
import { chargerConfigVeille } from '../../../../../../lib/sitadel/veilleConfig';
import { proposition } from '../../../../../../lib/sitadel/demandeRepo';
import { envoyerDemandes } from '../../../../../../lib/sitadel/envoiDemande';

const garde = exigerModule as unknown as ReturnType<typeof vi.fn>;
const cfg = chargerConfigVeille as unknown as ReturnType<typeof vi.fn>;
const prop = proposition as unknown as ReturnType<typeof vi.fn>;
const envoi = envoyerDemandes as unknown as ReturnType<typeof vi.fn>;

const get = () => GET(new Request('http://test/api/admin/permis/demandes/envoi-auto-apercu'));

beforeEach(() => {
  vi.clearAllMocks();
  garde.mockResolvedValue({ auteurId: 1 });
  cfg.mockResolvedValue({ permisParCommuneParMois: 5, envoiHeureDebut: 9, envoiHeureFin: 18, ancienneteMaxDemandeAnnees: 3 });
  // 3 lots e-mail sur 2 communes DISTINCTES (92004 en double) + 1 formulaire + 1 courrier (exclus) → communesProposables = 2.
  prop.mockResolvedValue({ lots: [
    { canal: 'email', codeInsee: '92004' }, { canal: 'email', codeInsee: '92004' }, { canal: 'email', codeInsee: '92050' },
    { canal: 'formulaire', codeInsee: '92100' }, { canal: 'courrier', codeInsee: '92200' },
  ], diagnostic: {} });
  // SIMULATION d'envoi : 4 demandes prêtes, budget capé à 3, caps 50/100.
  envoi.mockResolvedValue({ candidats: 4, budget: 3, capParRun: 50, capParJour: 100, resultats: [], mode: 'simulation' });
});

describe('224 — aperçu envoi auto (lecture seule, aucun envoi réel)', () => {
  it('non-administrateur → 403, aucune simulation ni proposition', async () => {
    garde.mockResolvedValueOnce({ refus: Response.json({ erreur: 'INTERDIT' }, { status: 403 }) });
    const res = await get();
    expect(res.status).toBe(403);
    expect(envoi).not.toHaveBeenCalled();
    expect(prop).not.toHaveBeenCalled();
  });

  it('AUCUN ENVOI RÉEL : envoyerDemandes est appelé en SIMULATION (appliquer:false)', async () => {
    await get();
    expect(envoi).toHaveBeenCalledTimes(1);
    expect(envoi).toHaveBeenCalledWith({ appliquer: false });
  });

  it('relaie le VOLUME RÉEL + les CAPS des sources (jamais en dur) et compte les communes e-mail DISTINCTES', async () => {
    const res = await get();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      pretesMaintenant: 4, partiraientMaintenant: 3, communesProposables: 2,
      capParRun: 50, capParJour: 100, plafondMensuelParCommune: 5, fenetreDebut: 9, fenetreFin: 18,
    });
  });

  it('« communes proposables » = fenêtre d’ancienneté LA PLUS LARGE (12 × max annees)', async () => {
    await get();
    expect(prop).toHaveBeenCalledWith(expect.anything(), 36); // 12 × 3
  });

  it('source indisponible (proposition jette) → 503, jamais un plantage', async () => {
    prop.mockRejectedValueOnce(new Error('DB down'));
    const res = await get();
    expect(res.status).toBe(503);
  });
});
