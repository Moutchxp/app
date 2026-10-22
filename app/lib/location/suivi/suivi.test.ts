import { describe, expect, it } from 'vitest';
import {
  htVersTtc, lireMontant, lireTauxPourcent, origineRetenue, ttcVersHt, verifierActivite, verifierApporteur, verifierRegle,
  verifierRetrocession, versionADate,
} from './suivi';
import { htDepuisTtc, lireParametres, ttcDepuisHt } from '../../../(admin)/admin/(protected)/location/SuiviCommercial';

describe('🔴 honoraires saisis en HT, TTC déduit à 20 % (décision d’Arno)', () => {
  it('HT ↔ TTC au centime, et l’aller-retour rend toujours le HT saisi', () => {
    expect(htVersTtc(416.67)).toBe(500);
    expect(ttcVersHt(500)).toBe(416.67);
    for (let c = 0; c < 200000; c += 37) {
      const ht = c / 100;
      expect(ttcVersHt(htVersTtc(ht))).toBe(ht);
    }
  });
  it('les cases de l’écran : « 416,67 » HT ⇄ « 500,00 » TTC ; vide ⇄ vide ; illisible ne touche pas le TTC', () => {
    expect(ttcDepuisHt('416,67')).toBe('500,00');
    expect(htDepuisTtc('500')).toBe('416,67');
    expect(ttcDepuisHt('')).toBe('');
    expect(htDepuisTtc('')).toBe('');
    expect(ttcDepuisHt('41a')).toBeNull();
    expect(htDepuisTtc('41a')).toBe('');
  });
  it('montants : virgule, espaces, « € » ; jamais plus de deux décimales ; jamais négatif', () => {
    expect(lireMontant('1 234,56 €')).toBe(1234.56);
    expect(lireMontant('')).toBeNull();
    expect(lireMontant('12,345')).toBeUndefined();
    expect(lireMontant('-3')).toBeUndefined();
    expect(lireMontant(-3)).toBeUndefined();
  });
  it('taux en % → fraction ; hors [0 ; 100] refusé', () => {
    expect(lireTauxPourcent('10')).toBe(0.1);
    expect(lireTauxPourcent('12,5 %')).toBe(0.125);
    expect(lireTauxPourcent('')).toBeNull();
    expect(lireTauxPourcent('101')).toBeUndefined();
  });
});

describe('🔴 barèmes datés : la version en vigueur À LA DATE DE SIGNATURE, jamais rétroactive', () => {
  const v = [{ depuis: '2026-01-01', taux: 0.1 }, { depuis: '2026-07-01', taux: 0.15 }];
  it('avant, entre, après', () => {
    expect(versionADate(v, '2025-12-31')).toBeNull();
    expect(versionADate(v, '2026-06-30')?.taux).toBe(0.1);
    expect(versionADate(v, '2026-07-01')?.taux).toBe(0.15);
    expect(versionADate([...v].reverse(), '2026-09-15')?.taux).toBe(0.15);
  });
});

describe('saisies vérifiées (navigateur et serveur)', () => {
  it('suivi du bail : la date de signature est OBLIGATOIRE ; sans apporteur, aucun taux retenu', () => {
    expect(verifierActivite({ dateSignature: '' })).toEqual({ ok: false, motif: 'La date de signature du bail est obligatoire.' });
    expect(verifierActivite({ dateSignature: '2026-02-30' }).ok).toBe(false);
    const r = verifierActivite({ dateSignature: '2026-03-12', honoProprietaireHt: '416,67', honoLocataireHt: '', apporteurTaux: '10', negociateurId: 5 });
    expect(r).toMatchObject({ ok: true, valeurs: { type: 'bail', honoProprietaireHt: 416.67, honoLocataireHt: 0, apporteurId: null, apporteurTaux: null, negociateurId: 5 } });
    expect(verifierActivite({ dateSignature: '2026-03-12', apporteurId: 3, apporteurTaux: '7,5', type: 'avenant' }))
      .toMatchObject({ ok: true, valeurs: { type: 'avenant', apporteurId: 3, apporteurTaux: 0.075 } });
    expect(verifierActivite({ dateSignature: '2026-03-12', honoLocataireHt: 'abc' }).ok).toBe(false);
  });
  it('apporteur : nom, type de la liste, taux, date d’effet', () => {
    expect(verifierApporteur({ nom: '  Kin  Immo ', type: 'agence', taux: '10', depuis: '2026-01-01' }))
      .toEqual({ ok: true, nom: 'Kin Immo', type: 'agence', taux: 0.1, coutFixe: 0, depuis: '2026-01-01' });
    expect(verifierApporteur({ nom: '', type: 'agence', depuis: '2026-01-01' }).ok).toBe(false);
    expect(verifierApporteur({ nom: 'X', type: 'ami', depuis: '2026-01-01' }).ok).toBe(false);
    expect(verifierApporteur({ nom: 'X', type: 'internet', taux: '10' }).ok).toBe(false);
  });
  it('règle de commission : 15 %, primes 150 / 15', () => {
    expect(verifierRegle({ depuis: '2026-01-01', tauxNegociateur: '15', primeLogement: '150', primeParking: '15' }))
      .toEqual({ ok: true, regle: { depuis: '2026-01-01', tauxNegociateur: 0.15, primeLogement: 150, primeParking: 15 } });
    expect(verifierRegle({ depuis: '2026-01-01', tauxNegociateur: '', primeLogement: '150', primeParking: '15' }).ok).toBe(false);
  });
  it('rétrocession : mois, montant > 0, libellé, négociateur', () => {
    expect(verifierRetrocession({ mois: '2026-08', montant: '200', libelle: 'Alex Coms', negociateurLibelle: 'Jean-Baptiste PONS', negociateurId: 5 }))
      .toEqual({ ok: true, negociateurId: 5, negociateurLibelle: 'Jean-Baptiste PONS', mois: '2026-08-01', montant: 200, libelle: 'Alex Coms' });
    expect(verifierRetrocession({ mois: '2026-08', montant: '0', libelle: 'x', negociateurLibelle: 'y' }).ok).toBe(false);
    expect(verifierRetrocession({ mois: '2026-08', montant: '5', libelle: '', negociateurLibelle: 'y' }).ok).toBe(false);
  });
  it('origine client : la correction l’emporte sur la déduction', () => {
    expect(origineRetenue('nouveau', null)).toBe('nouveau');
    expect(origineRetenue('nouveau', 'deja')).toBe('deja');
  });
  it('une réponse d’une autre forme = suivi indisponible (jamais `undefined.some`)', () => {
    expect(lireParametres({ id: 3 }).disponible).toBe(false);
    expect(lireParametres(null)).toEqual({ disponible: false, apporteurs: [], negociateurs: [], moi: null });
    expect(lireParametres({ disponible: true, apporteurs: [{ id: 1, nom: 'A', type: 'agence', archive: false }], negociateurs: [], moi: 2 }))
      .toMatchObject({ disponible: true, moi: 2, apporteurs: [{ baremes: [] }] });
  });
});
