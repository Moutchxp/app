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
  lireRecuLeReponse: vi.fn(), // T4
  reclasserNatureReponse: vi.fn(), // T7-A
  estNatureReclassable: (v: unknown) => typeof v === 'string' && ['accuse', 'documents', 'autre'].includes(v), // T7-A — garde réelle (pas un vi.fn)
  marquerRepondu: vi.fn(), annulerRepondu: vi.fn(), // T7-B
  RattachementNonEnvoyeeError: class RattachementNonEnvoyeeError extends Error { statut: string; constructor(s: string) { super(`demande « ${s} » : le rattachement manuel est réservé aux demandes envoyées`); this.statut = s; this.name = 'RattachementNonEnvoyeeError'; } },
}));
vi.mock('../../../../../lib/sitadel/demandeRepo', () => ({
  cloturerDemande: vi.fn(), rouvrirDemande: vi.fn(), lireCleTelechargeable: vi.fn(), marquerDeposee: vi.fn(), // T4
  TransitionInterditeError: class TransitionInterditeError extends Error { raison: string; constructor(r: string) { super(r); this.raison = r; } },
  DepotInterditError: class DepotInterditError extends Error { raison: string; constructor(r: string) { super(r); this.raison = r; this.name = 'DepotInterditError'; } },
}));
vi.mock('../../../../../lib/veille/demandeRelanceRepo', () => ({
  majRelance: vi.fn(), abandonnerRelance: vi.fn(), regenererRelance: vi.fn(),
  RelanceActionError: class RelanceActionError extends Error { raison: string; constructor(r: string) { super(r); this.raison = r; } },
}));
// LOT 35 — la confirmation de dépôt lit la référence mairie de l'accusé (releveReponses). Mocké : le confirmer_depot doit fournir une valeur.
vi.mock('../../../../../lib/veille/releveReponses', () => ({ lireReferenceMairieDeReponse: vi.fn() }));
vi.mock('../../../../../lib/stockage', () => ({ urlSignee: vi.fn(async () => 'https://signed/url') })); // N10-B : capter les options de signature

import { POST } from './route';
import { exigerAdministrateur } from '../../../../../lib/admin/garde';
import {
  statutDemande, marquerDossierNonFourni, marquerDossierRefusMairie, annulerTriageDossier,
  retirerDossierDemande, reattacherDossierDemande, rattacherAMain, marquerTraitee, lireRecuLeReponse,
  reclasserNatureReponse, marquerRepondu, annulerRepondu, RattachementNonEnvoyeeError,
} from '../../../../../lib/veille/demandeReponseRepo';
import { marquerDeposee, DepotInterditError, lireCleTelechargeable } from '../../../../../lib/sitadel/demandeRepo';
import { lireReferenceMairieDeReponse } from '../../../../../lib/veille/releveReponses';
import { urlSignee } from '../../../../../lib/stockage';

const garde = exigerAdministrateur as unknown as ReturnType<typeof vi.fn>;
const statut = statutDemande as unknown as ReturnType<typeof vi.fn>;
const nonFourni = marquerDossierNonFourni as unknown as ReturnType<typeof vi.fn>;
const refusMairie = marquerDossierRefusMairie as unknown as ReturnType<typeof vi.fn>;
const annulerTriage = annulerTriageDossier as unknown as ReturnType<typeof vi.fn>;
const retirer = retirerDossierDemande as unknown as ReturnType<typeof vi.fn>;
const reattacher = reattacherDossierDemande as unknown as ReturnType<typeof vi.fn>;
const rattacher = rattacherAMain as unknown as ReturnType<typeof vi.fn>;
const traiter = marquerTraitee as unknown as ReturnType<typeof vi.fn>;
const reclasser = reclasserNatureReponse as unknown as ReturnType<typeof vi.fn>;
const repondu = marquerRepondu as unknown as ReturnType<typeof vi.fn>;
const annulerRep = annulerRepondu as unknown as ReturnType<typeof vi.fn>;
const recuLe = lireRecuLeReponse as unknown as ReturnType<typeof vi.fn>;
const deposer = marquerDeposee as unknown as ReturnType<typeof vi.fn>;
const lireRef = lireReferenceMairieDeReponse as unknown as ReturnType<typeof vi.fn>;
const cleTel = lireCleTelechargeable as unknown as ReturnType<typeof vi.fn>;
const signee = urlSignee as unknown as ReturnType<typeof vi.fn>;

const post = (body: unknown) => POST(new Request('http://test/api/admin/permis/reponses', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }));

beforeEach(() => {
  vi.clearAllMocks();
  garde.mockResolvedValue({ auteurId: 5 }); // administrateur par défaut → auteur '5'
  statut.mockResolvedValue('envoyee');       // demande ouverte par défaut
  lireRef.mockResolvedValue(null);           // LOT 35 : par défaut, aucun accusé exploitable (les tests qui l'exigent surchargent)
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

describe('T4 — confirmer_depot : la date RÉELLE de dépôt est OBLIGATOIRE et bornée (ni future, ni postérieure au message)', () => {
  it('LOT 35 — date valide + accusé porteur d’une réf. → 200, référence ÉCRITE (marquerDeposee la reçoit), rattache, referenceCaptee remonté', async () => {
    recuLe.mockResolvedValueOnce('2020-02-01'); // le message est arrivé après le dépôt
    lireRef.mockResolvedValueOnce('SLC260901542604'); // l'accusé déclencheur porte la référence mairie
    deposer.mockResolvedValueOnce(undefined); rattacher.mockResolvedValueOnce(true);
    const res = await post({ action: 'confirmer_depot', reponseId: 7, demandeId: 42, envoyeLe: '2020-01-01' });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, referenceCaptee: 'SLC260901542604' }); // vérité d'écran : la réf. est remontée
    // 🔴 LE BUG CORRIGÉ : marquerDeposee reçoit la RÉFÉRENCE (avant : null) → demande_reference_externe écrite. Puis rattachement.
    expect(deposer).toHaveBeenCalledWith(42, '5', 'SLC260901542604', '2020-01-01');
    expect(rattacher).toHaveBeenCalledWith(7, 42, '5');
  });

  it('LOT 35 — accusé SANS référence exploitable → 200 mais referenceCaptee=null (l’écran invitera à saisir à la main)', async () => {
    recuLe.mockResolvedValueOnce('2020-02-01');
    lireRef.mockResolvedValueOnce(null);
    deposer.mockResolvedValueOnce(undefined); rattacher.mockResolvedValueOnce(true);
    const res = await post({ action: 'confirmer_depot', reponseId: 7, demandeId: 42, envoyeLe: '2020-01-01' });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, referenceCaptee: null });
    expect(deposer).toHaveBeenCalledWith(42, '5', null, '2020-01-01'); // dépôt confirmé quand même, sans référence
  });

  it('date ABSENTE → 400, aucune bascule (champ vide et obligatoire)', async () => {
    const res = await post({ action: 'confirmer_depot', reponseId: 7, demandeId: 42 });
    expect(res.status).toBe(400);
    expect(deposer).not.toHaveBeenCalled();
    expect(rattacher).not.toHaveBeenCalled();
  });

  it('format non AAAA-MM-JJ → 400', async () => {
    expect((await post({ action: 'confirmer_depot', reponseId: 7, demandeId: 42, envoyeLe: '01/01/2020' })).status).toBe(400);
    expect(deposer).not.toHaveBeenCalled();
  });

  it('date dans le FUTUR → 400, aucune bascule (borne AVANT toute lecture du message)', async () => {
    const res = await post({ action: 'confirmer_depot', reponseId: 7, demandeId: 42, envoyeLe: '2999-12-31' });
    expect(res.status).toBe(400);
    expect((await res.json()).erreur).toMatch(/futur/i);
    expect(recuLe).not.toHaveBeenCalled();
    expect(deposer).not.toHaveBeenCalled();
  });

  it('date POSTÉRIEURE au message reçu → 400 (le dépôt précède la réponse de la mairie)', async () => {
    recuLe.mockResolvedValueOnce('2020-01-01');
    const res = await post({ action: 'confirmer_depot', reponseId: 7, demandeId: 42, envoyeLe: '2020-06-01' });
    expect(res.status).toBe(400);
    expect((await res.json()).erreur).toMatch(/postérieure au message/i);
    expect(deposer).not.toHaveBeenCalled();
  });

  it('message introuvable (recu_le null) → 404, aucune bascule', async () => {
    recuLe.mockResolvedValueOnce(null);
    const res = await post({ action: 'confirmer_depot', reponseId: 7, demandeId: 42, envoyeLe: '2020-01-01' });
    expect(res.status).toBe(404);
    expect(deposer).not.toHaveBeenCalled();
  });

  it('identifiants non entiers → 400, aucune lecture ni écriture', async () => {
    const res = await post({ action: 'confirmer_depot', reponseId: 'x', demandeId: 42, envoyeLe: '2020-01-01' });
    expect(res.status).toBe(400);
    expect(recuLe).not.toHaveBeenCalled();
    expect(deposer).not.toHaveBeenCalled();
  });

  it('dépôt refusé par le repo (DepotInterditError) → 409 avec le motif métier, jamais un 503', async () => {
    recuLe.mockResolvedValueOnce('2020-02-01');
    deposer.mockRejectedValueOnce(new DepotInterditError('déjà « envoyee » — dépôt impossible'));
    const res = await post({ action: 'confirmer_depot', reponseId: 7, demandeId: 42, envoyeLe: '2020-01-01' });
    expect(res.status).toBe(409);
    expect((await res.json()).erreur).toMatch(/dépôt impossible/i);
    expect(rattacher).not.toHaveBeenCalled();
  });
});

describe('T4 — ignorer_proposition : marque le message traité (ne réapparaît plus)', () => {
  it('→ 200 ; le repo reçoit le reponseId (traite_le posé)', async () => {
    traiter.mockResolvedValueOnce(true);
    const res = await post({ action: 'ignorer_proposition', reponseId: 7 });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, traite: true });
    expect(traiter).toHaveBeenCalledWith(7);
  });

  it('reponseId non entier → 400, aucune écriture', async () => {
    expect((await post({ action: 'ignorer_proposition', reponseId: 'x' })).status).toBe(400);
    expect(traiter).not.toHaveBeenCalled();
  });
});

describe('T4 — GARDE rattacher : jamais un rattachement manuel vers une demande NON envoyée', () => {
  it('demande brouillon/prête → 409 explicite (route pré-check), rattacherAMain JAMAIS appelé', async () => {
    for (const st of ['brouillon', 'prete'] as const) {
      statut.mockResolvedValueOnce(st);
      const res = await post({ action: 'rattacher', reponseId: 7, demandeId: 42 });
      expect(res.status).toBe(409);
      expect((await res.json()).erreur).toMatch(/confirmez d.abord le dépôt/i);
      expect(rattacher).not.toHaveBeenCalled();
    }
  });

  it('défense en profondeur : la demande passe le pré-check mais le repo lève RattachementNonEnvoyeeError → 409', async () => {
    statut.mockResolvedValueOnce('envoyee'); // pré-check route OK…
    rattacher.mockRejectedValueOnce(new RattachementNonEnvoyeeError('brouillon')); // …mais garde repo (course/état obsolète)
    const res = await post({ action: 'rattacher', reponseId: 7, demandeId: 42 });
    expect(res.status).toBe(409);
    expect((await res.json()).erreur).toMatch(/réservé aux demandes envoyées/i);
  });

  it('demande envoyée → rattachement normal (200)', async () => {
    statut.mockResolvedValueOnce('envoyee');
    rattacher.mockResolvedValueOnce(true);
    const res = await post({ action: 'rattacher', reponseId: 7, demandeId: 42 });
    expect(res.status).toBe(200);
    expect(rattacher).toHaveBeenCalledWith(7, 42, '5');
  });
});

describe('T7-A — reclasser la nature d’un message (accuse | documents | autre)', () => {
  it('cible valide (documents) → 200 ; le repo reçoit (reponseId, nature, auteur)', async () => {
    reclasser.mockResolvedValueOnce(true);
    const res = await post({ action: 'reclasser', reponseId: 7, nature: 'documents' });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true });
    expect(reclasser).toHaveBeenCalledWith(7, 'documents', '5');
  });

  it('accepte aussi accuse et autre', async () => {
    for (const nature of ['accuse', 'autre'] as const) {
      reclasser.mockResolvedValueOnce(true);
      const res = await post({ action: 'reclasser', reponseId: 7, nature });
      expect(res.status).toBe(200);
      expect(reclasser).toHaveBeenCalledWith(7, nature, '5');
    }
  });

  it('refuse rebond et indetermine (jamais un jugement humain / état transitoire) → 400, aucune écriture', async () => {
    for (const nature of ['rebond', 'indetermine', 'bidon']) {
      const res = await post({ action: 'reclasser', reponseId: 7, nature });
      expect(res.status).toBe(400);
    }
    expect(reclasser).not.toHaveBeenCalled();
  });

  it('reponseId absent → 400, aucune écriture', async () => {
    const res = await post({ action: 'reclasser', nature: 'documents' });
    expect(res.status).toBe(400);
    expect(reclasser).not.toHaveBeenCalled();
  });
});

describe('T7-B — répondu / annuler_repondu (bouton MANUEL, RÉVERSIBLE)', () => {
  it('répondu → 200, le repo reçoit (reponseId, auteur)', async () => {
    repondu.mockResolvedValueOnce(true);
    const res = await post({ action: 'repondu', reponseId: 7 });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true });
    expect(repondu).toHaveBeenCalledWith(7, '5');
    expect(annulerRep).not.toHaveBeenCalled();
  });

  it('annuler_repondu → 200, appelle annulerRepondu (réversibilité)', async () => {
    annulerRep.mockResolvedValueOnce(true);
    const res = await post({ action: 'annuler_repondu', reponseId: 7 });
    expect(res.status).toBe(200);
    expect(annulerRep).toHaveBeenCalledWith(7, '5');
    expect(repondu).not.toHaveBeenCalled();
  });

  it('reponseId absent → 400, aucune écriture', async () => {
    const res = await post({ action: 'repondu' });
    expect(res.status).toBe(400);
    expect(repondu).not.toHaveBeenCalled();
  });
});

describe('N10-B — url_piece : variante INLINE (ouverture à la page) sans changer le téléchargement existant', () => {
  beforeEach(() => { cleTel.mockResolvedValue({ cle: 'k/abc', nomFichier: 'PC3.pdf' }); signee.mockResolvedValue('https://signed/url'); });

  it('① DÉFAUT (aucun `inline`) → téléchargement FORCÉ, STRICTEMENT inchangé (forcerTelechargement:true)', async () => {
    const res = await post({ action: 'url_piece', pieceId: 7, source: 'dossier' });
    expect(res.status).toBe(200);
    expect(signee).toHaveBeenCalledWith('k/abc', undefined, { forcerTelechargement: true, nomFichier: 'PC3.pdf' });
  });

  it('inline:true → signe SANS forcer le téléchargement (ouverture au visionneur)', async () => {
    const res = await post({ action: 'url_piece', pieceId: 7, source: 'dossier', inline: true });
    expect(res.status).toBe(200);
    expect(signee).toHaveBeenCalledWith('k/abc', undefined, {}); // aucune option → Content-Disposition inline
  });

  it('la clé de stockage ne figure PAS dans la réponse (seule l’URL signée sort)', async () => {
    const res = await post({ action: 'url_piece', pieceId: 7, source: 'dossier', inline: true });
    const body = await res.json();
    expect(body.url).toBe('https://signed/url');
    expect(JSON.stringify(body)).not.toContain('k/abc');
  });
});
