import { beforeEach, describe, expect, it, vi } from 'vitest';

/** 🔴 Arno (17/11/2026, « Adresses uniformisées », lot 2) — le contrôle serveur de l'adresse d'une personne. Base Adresse Nationale simulée. */
const h = vi.hoisted(() => ({ etat: 'trouvee' as 'trouvee' | 'introuvable' | 'muet', appels: 0 }));
vi.mock('./verificationAdresseRepo', () => ({ etatsAdresses: async () => { h.appels += 1; return [h.etat]; } }));
vi.mock('../location/sondeLocation', () => ({ colonneExisteMemo: async () => true }));
import { AUCUNE_ADRESSE, adresseDeLaLigne, controlerAdresse } from './adresseSaisieRepo';

const LILAS = { adresse: '3 Rue des Lilas', codePostal: '75011', commune: 'PARIS' };
beforeEach(() => { h.etat = 'trouvee'; h.appels = 0; });

describe('le contrôle', () => {
  it('sans la migration 480 : la saisie d’avant, rien de contrôlé ni d’écrit en plus', async () => {
    expect(await controlerAdresse(false, AUCUNE_ADRESSE, { adresse: 'n’importe quoi' }, undefined)).toEqual({ ok: true, ecrire: false });
    expect(h.appels).toBe(0);
  });
  it('une adresse de la liste RETROUVÉE : nature « liste » ; introuvable ou service muet : refus clair, rien n’est enregistré', async () => {
    expect(await controlerAdresse(true, AUCUNE_ADRESSE, LILAS, { nature: 'liste' })).toEqual({ ok: true, ecrire: true, nature: 'liste', pays: null });
    h.etat = 'introuvable';
    expect(await controlerAdresse(true, AUCUNE_ADRESSE, LILAS, { nature: 'liste' })).toEqual({ ok: false,
      motif: 'L’adresse 3 Rue des Lilas, 75011 PARIS est introuvable dans la Base Adresse Nationale : choisissez-la dans les suggestions, ou confirmez « Adresse hors liste » (ou « Adresse à l’étranger »). Rien n’est enregistré.' });
    h.etat = 'muet';
    expect(await controlerAdresse(true, AUCUNE_ADRESSE, LILAS, { nature: 'liste' })).toMatchObject({ ok: false, motif: expect.stringContaining('le service national des adresses ne répond pas') });
  });
  it('hors liste confirmée, étranger avec pays : sans appel au service ; une adresse non touchée : rien', async () => {
    expect(await controlerAdresse(true, AUCUNE_ADRESSE, LILAS, { nature: 'hors_liste', horsListeConfirme: true })).toEqual({ ok: true, ecrire: true, nature: 'hors_liste', pays: null });
    expect(await controlerAdresse(true, AUCUNE_ADRESSE, { adresse: 'Rue de la Loi 16', codePostal: '1000', commune: 'Bruxelles' }, { nature: 'etranger', pays: 'Belgique' }))
      .toEqual({ ok: true, ecrire: true, nature: 'etranger', pays: 'Belgique' });
    const avant = adresseDeLaLigne({ adresse: '3 Rue des Lilas', code_postal: '75011', commune: 'PARIS', adresse_nature: null, adresse_pays: null });
    expect(await controlerAdresse(true, avant, LILAS, undefined)).toEqual({ ok: true, ecrire: false });
    expect(h.appels).toBe(0);
  });
  it('le corps n’est pas cru au-delà de sa forme : une nature inconnue vaut « liste », donc vérifiée', async () => {
    h.etat = 'introuvable';
    expect((await controlerAdresse(true, AUCUNE_ADRESSE, LILAS, { nature: 'n’importe' } as never)).ok).toBe(false);
    expect(h.appels).toBe(1);
  });
  it('la ligne d’une carte de contact : son adresse postale', () => {
    expect(adresseDeLaLigne({ adresse: 'x@exemple.test', adresse_postale: '2 rue B', code_postal: '75012', commune: 'PARIS', adresse_nature: 'hors_liste', adresse_pays: null }, 'adresse_postale'))
      .toEqual({ adresse: '2 rue B', codePostal: '75012', commune: 'PARIS', nature: 'hors_liste', pays: null });
  });
});
