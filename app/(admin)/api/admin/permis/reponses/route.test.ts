import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * T1 — POST /api/admin/permis/reponses, actions de STATUT par dossier (non fourni / refus mairie / annuler triage / retirer /
 * ré-attacher). On MOCKE les repos : ce fichier teste le COMPORTEMENT de la route (garde « demande close », validation de la
 * date de refus, mapping du conflit de ré-attachement, transmission au repo), pas la logique métier (testée dans
 * demandeReponseRepo). ⚠️ Les classes d'erreur des modules voisins restent de vraies classes (le reste du POST les utilise en
 * instanceof), mais aucune de ces branches n'est atteinte ici. db/client mocké (aucune DB).
 */
vi.mock('../../../../../lib/db/client', () => ({ query: vi.fn(), withTransaction: vi.fn() }));
vi.mock('../../../../../lib/admin/garde', () => ({ exigerAdministrateur: vi.fn() }));
vi.mock('../../../../../lib/veille/reponsesSuivi', () => ({ chargerSuiviReponses: vi.fn() }));
vi.mock('../../../../../lib/veille/demandeReponseRepo', () => ({
  rattacherAMain: vi.fn(), marquerTraitee: vi.fn(), marquerDossierSatisfait: vi.fn(), demarquerDossier: vi.fn(),
  statutDemande: vi.fn(), marquerDossierNonFourni: vi.fn(), marquerDossierRefusMairie: vi.fn(),
  annulerTriageDossier: vi.fn(), retirerDossierDemande: vi.fn(), reattacherDossierDemande: vi.fn(),
}));
vi.mock('../../../../../lib/sitadel/demandeRepo', () => ({
  cloturerDemande: vi.fn(), rouvrirDemande: vi.fn(), lireCleTelechargeable: vi.fn(),
  TransitionInterditeError: class TransitionInterditeError extends Error { raison: string; constructor(r: string) { super(r); this.raison = r; } },
}));
vi.mock('../../../../../lib/veille/demandeRelanceRepo', () => ({
  majRelance: vi.fn(), abandonnerRelance: vi.fn(), regenererRelance: vi.fn(),
  RelanceActionError: class RelanceActionError extends Error { raison: string; constructor(r: string) { super(r); this.raison = r; } },
}));

import { POST } from './route';
import { exigerAdministrateur } from '../../../../../lib/admin/garde';
import {
  statutDemande, marquerDossierNonFourni, marquerDossierRefusMairie, annulerTriageDossier,
  retirerDossierDemande, reattacherDossierDemande,
} from '../../../../../lib/veille/demandeReponseRepo';

const garde = exigerAdministrateur as unknown as ReturnType<typeof vi.fn>;
const statut = statutDemande as unknown as ReturnType<typeof vi.fn>;
const nonFourni = marquerDossierNonFourni as unknown as ReturnType<typeof vi.fn>;
const refusMairie = marquerDossierRefusMairie as unknown as ReturnType<typeof vi.fn>;
const annulerTriage = annulerTriageDossier as unknown as ReturnType<typeof vi.fn>;
const retirer = retirerDossierDemande as unknown as ReturnType<typeof vi.fn>;
const reattacher = reattacherDossierDemande as unknown as ReturnType<typeof vi.fn>;

const post = (body: unknown) => POST(new Request('http://test/api/admin/permis/reponses', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }));

beforeEach(() => {
  vi.clearAllMocks();
  garde.mockResolvedValue({ auteurId: 5 }); // administrateur par défaut → auteur '5'
  statut.mockResolvedValue('envoyee');       // demande ouverte par défaut
});

describe('T1 — garde « demande close » (jamais un statut de dossier sur une demande close)', () => {
  for (const action of ['dossier_non_fourni', 'dossier_refus_mairie', 'annuler_triage', 'retirer_dossier', 'reattacher_dossier'] as const) {
    it(`${action} sur une demande close → 409, aucune écriture`, async () => {
      statut.mockResolvedValueOnce('close');
      const res = await post({ action, demandeId: 42, dossierId: 7, refusLe: '2020-01-01' });
      expect(res.status).toBe(409);
      expect((await res.json()).erreur).toMatch(/close/i);
      expect(nonFourni).not.toHaveBeenCalled();
      expect(refusMairie).not.toHaveBeenCalled();
      expect(annulerTriage).not.toHaveBeenCalled();
      expect(retirer).not.toHaveBeenCalled();
      expect(reattacher).not.toHaveBeenCalled();
    });
  }
});

describe('T1 — refus mairie : la date de notification est l’ancre juridique, validée côté route', () => {
  it('date absente → 400, jamais d’écriture', async () => {
    const res = await post({ action: 'dossier_refus_mairie', demandeId: 42, dossierId: 7 });
    expect(res.status).toBe(400);
    expect(refusMairie).not.toHaveBeenCalled();
  });
  it('format non AAAA-MM-JJ → 400', async () => {
    expect((await post({ action: 'dossier_refus_mairie', demandeId: 42, dossierId: 7, refusLe: '12/03/2026' })).status).toBe(400);
    expect(refusMairie).not.toHaveBeenCalled();
  });
  it('date dans le FUTUR → 400 (un refus ne peut pas être notifié demain)', async () => {
    const res = await post({ action: 'dossier_refus_mairie', demandeId: 42, dossierId: 7, refusLe: '2999-12-31' });
    expect(res.status).toBe(400);
    expect((await res.json()).erreur).toMatch(/futur/i);
    expect(refusMairie).not.toHaveBeenCalled();
  });
  it('date valide non future → 200 ; le repo reçoit (demandeId, dossierId, date, auteur)', async () => {
    refusMairie.mockResolvedValueOnce(true);
    const res = await post({ action: 'dossier_refus_mairie', demandeId: 42, dossierId: 7, refusLe: '2020-01-01' });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true });
    expect(refusMairie).toHaveBeenCalledWith(42, 7, '2020-01-01', '5');
  });
});

describe('T1 — ré-attachement : conflit d’unicité rendu explicite (jamais un 23505 nu)', () => {
  it('repo renvoie « conflit » → 409 nommé', async () => {
    reattacher.mockResolvedValueOnce('conflit');
    const res = await post({ action: 'reattacher_dossier', demandeId: 42, dossierId: 7 });
    expect(res.status).toBe(409);
    expect((await res.json()).erreur).toMatch(/déjà rattaché/i);
  });
  it('repo renvoie « reattache » → 200 { ok:true }', async () => {
    reattacher.mockResolvedValueOnce('reattache');
    expect(await (await post({ action: 'reattacher_dossier', demandeId: 42, dossierId: 7 })).json()).toMatchObject({ ok: true });
  });
  it('repo renvoie « introuvable » → 200 { ok:false } (idempotent, jamais une erreur)', async () => {
    reattacher.mockResolvedValueOnce('introuvable');
    const res = await post({ action: 'reattacher_dossier', demandeId: 42, dossierId: 7 });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: false });
  });
});

describe('T1 — actions simples : transmission au repo + garde-fous', () => {
  it('non fourni → 200 ; repo reçoit (demandeId, dossierId, auteur)', async () => {
    nonFourni.mockResolvedValueOnce(true);
    expect((await post({ action: 'dossier_non_fourni', demandeId: 42, dossierId: 7 })).status).toBe(200);
    expect(nonFourni).toHaveBeenCalledWith(42, 7, '5');
  });
  it('annuler triage → 200 ; repo reçoit (demandeId, dossierId, auteur)', async () => {
    annulerTriage.mockResolvedValueOnce(true);
    expect((await post({ action: 'annuler_triage', demandeId: 42, dossierId: 7 })).status).toBe(200);
    expect(annulerTriage).toHaveBeenCalledWith(42, 7, '5');
  });
  it('retirer → 200 ; repo reçoit (demandeId, dossierId, auteur)', async () => {
    retirer.mockResolvedValueOnce(true);
    expect((await post({ action: 'retirer_dossier', demandeId: 42, dossierId: 7 })).status).toBe(200);
    expect(retirer).toHaveBeenCalledWith(42, 7, '5');
  });
  it('identifiants non entiers → 400, aucun statut lu, aucune écriture', async () => {
    const res = await post({ action: 'dossier_non_fourni', demandeId: 'x', dossierId: 7 });
    expect(res.status).toBe(400);
    expect(statut).not.toHaveBeenCalled();
    expect(nonFourni).not.toHaveBeenCalled();
  });
  it('non-administrateur → 403 renvoyé tel quel, aucune écriture', async () => {
    garde.mockResolvedValueOnce({ refus: Response.json({ erreur: 'INTERDIT' }, { status: 403 }) });
    const res = await post({ action: 'retirer_dossier', demandeId: 42, dossierId: 7 });
    expect(res.status).toBe(403);
    expect(retirer).not.toHaveBeenCalled();
  });
});
