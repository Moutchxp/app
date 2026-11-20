import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * 🔴🔴 Arno (20/11/2026) — l'enregistrement des blocs 3 et 4 depuis la fiche du locataire : sur son BAIL EN COURS, par les chemins existants
 * (bloc 3 contrôlé AVANT toute écriture, bloc 4, puis bloc 3 sur une version relue) ; jamais de mail. Dépendances simulées.
 */
let bailEnCours: string | null;
vi.mock('../db/client', () => ({
  query: async () => ({ rows: bailEnCours === null ? [] : [{ id: bailEnCours }], rowCount: bailEnCours === null ? 0 : 1 }),
}));
const appels: string[] = [];
const preparerDossier = vi.fn(async (..._a: unknown[]) => { appels.push('preparer'); return { etat: 'pret' }; });
const modifierDossierLocation = vi.fn(async (..._a: unknown[]) => { appels.push('modifier3'); return { etat: 'ok', data: { changements: [{ bloc: 3, champ: 'Commentaires', avant: 'a', apres: 'b' }] } }; });
const lireDossierDuBail = vi.fn(async (..._a: unknown[]) => { appels.push('relire'); return { etat: 'ok', data: { version: 'v2' } }; });
const enregistrerSuiviLocataire = vi.fn(async (..._a: unknown[]) => { appels.push('suivi4'); return { etat: 'ok', data: { changements: [{ bloc: 4, champ: 'Négociateur', avant: 'A', apres: 'B' }], activiteId: 9 } }; });
vi.mock('./dossierLocationRepo', () => ({
  preparerDossier: (...a: unknown[]) => preparerDossier(...a), modifierDossierLocation: (...a: unknown[]) => modifierDossierLocation(...a),
  lireDossierDuBail: (...a: unknown[]) => lireDossierDuBail(...a),
}));
vi.mock('./suiviLocataireRepo', () => ({ enregistrerSuiviLocataire: (...a: unknown[]) => enregistrerSuiviLocataire(...a) }));

import { enregistrerConditionsFicheLocataire, lireConditionsFicheLocataire } from './conditionsFicheLocataireRepo';

const AUTEUR = { id: null, libelle: '_TEST' };
const COND = { version: 'v1', conditions: { commentaire: 'b' }, entretien: null, suivi: { pirate: true } };
const SUIVI = { bailId: 551, activiteId: 3, version: 'v1', suivi: { negociateurId: 2 } };

beforeEach(() => { bailEnCours = '551'; appels.length = 0; vi.clearAllMocks(); });

describe('enregistrerConditionsFicheLocataire', () => {
  it('blocs 3 et 4 : contrôle du bloc 3 AVANT toute écriture, puis le bloc 4, puis le bloc 3 sur la version RELUE', async () => {
    const r = await enregistrerConditionsFicheLocataire(541, { bailId: 551, conditions: COND, suivi: SUIVI }, AUTEUR);
    expect(r.etat).toBe('ok');
    expect(appels).toEqual(['preparer', 'suivi4', 'relire', 'modifier3']);
    expect(preparerDossier).toHaveBeenCalledWith({ bailId: 551 }, { version: 'v1', conditions: { commentaire: 'b' }, entretien: null }, { ficheLocataire: true });
    expect(enregistrerSuiviLocataire).toHaveBeenCalledWith(541, { ...SUIVI, bailId: 551 }, AUTEUR);
    // le bloc 4 ne part jamais par le chemin du bloc 3 ; la version est celle relue après notre propre écriture
    expect(modifierDossierLocation).toHaveBeenCalledWith({ bailId: 551 }, { version: 'v2', conditions: { commentaire: 'b' }, entretien: null }, AUTEUR, { ficheLocataire: true });
    expect(r.etat === 'ok' && r.data.changements.map((c) => c.bloc)).toEqual([4, 3]);
  });

  it('bloc 3 seul : sa propre version, pas de relecture, pas de bloc 4', async () => {
    await enregistrerConditionsFicheLocataire(541, { bailId: 551, conditions: COND, suivi: null }, AUTEUR);
    expect(appels).toEqual(['preparer', 'modifier3']);
    expect((modifierDossierLocation.mock.calls[0] as unknown[])[1]).toMatchObject({ version: 'v1' });
  });

  it('bloc 3 refusé au contrôle : RIEN n’est écrit (ni bloc 4 ni bloc 3)', async () => {
    preparerDossier.mockResolvedValueOnce({ etat: 'refus', motif: 'Prélèvement : répondez Oui ou Non.' } as never);
    const r = await enregistrerConditionsFicheLocataire(541, { bailId: 551, conditions: COND, suivi: SUIVI }, AUTEUR);
    expect(r).toEqual({ etat: 'refus', motif: 'Prélèvement : répondez Oui ou Non.' });
    expect(enregistrerSuiviLocataire).not.toHaveBeenCalled();
    expect(modifierDossierLocation).not.toHaveBeenCalled();
  });

  it('bloc 4 enregistré puis bloc 3 en échec : le message le DIT', async () => {
    modifierDossierLocation.mockResolvedValueOnce({ etat: 'refus', motif: 'Loyer mensuel : un montant.' } as never);
    const r = await enregistrerConditionsFicheLocataire(541, { bailId: 551, conditions: COND, suivi: SUIVI }, AUTEUR);
    expect(r).toEqual({ etat: 'refus', motif: 'Le suivi commercial a été enregistré ; les conditions d’entrée non : Loyer mensuel : un montant.' });
  });

  it('un bail qui n’est plus le bail en cours : conflit, rien n’est écrit ; sans bail en cours : « sans_bail »', async () => {
    expect((await enregistrerConditionsFicheLocataire(541, { bailId: 400, conditions: COND }, AUTEUR)).etat).toBe('conflit');
    bailEnCours = null;
    expect((await enregistrerConditionsFicheLocataire(541, { bailId: 551, conditions: COND }, AUTEUR)).etat).toBe('sans_bail');
    expect(appels).toEqual([]);
  });

  it('la lecture : le bail en cours, ou « sans_bail »', async () => {
    await lireConditionsFicheLocataire(541);
    expect(lireDossierDuBail).toHaveBeenCalledWith(551);
    bailEnCours = null;
    expect(await lireConditionsFicheLocataire(541)).toEqual({ etat: 'sans_bail' });
  });

  it('AUCUN MAIL : le module n’envoie rien (ni transport, ni file d’envoi)', async () => {
    const { readFileSync } = await import('node:fs');
    const src = readFileSync('app/lib/location/conditionsFicheLocataireRepo.ts', 'utf8');
    expect(src).not.toMatch(/envoyer|transport|gestion_envoi|nodemailer|smtp/i);
  });
});
