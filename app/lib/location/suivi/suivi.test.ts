import { describe, expect, it } from 'vitest';
import {
  MOT_COLLEGUE_OBLIGATOIRE,
  aRattacher, collegueADate, htVersTtc, lireMontant, verifierCommercial, lireTauxPourcent, origineRetenue, ttcVersHt, verifierActivite, verifierApporteur, verifierRegle,
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
    const r = verifierActivite({ dateSignature: '2026-03-12', honoProprietaireHt: '416,67', honoLocataireHt: '', apporteurTaux: '10', negociateurId: 5 }, { origineObligatoire: false });
    expect(r).toMatchObject({ ok: true, valeurs: { type: 'bail', honoProprietaireHt: 416.67, honoLocataireHt: 0, apporteurId: null, apporteurTaux: null, negociateurId: 5 } });
    expect(verifierActivite({ dateSignature: '2026-03-12', apporteurId: 3, apporteurTaux: '7,5', type: 'avenant', origineContact: 'apporteur' }))
      .toMatchObject({ ok: true, valeurs: { type: 'avenant', apporteurId: 3, apporteurTaux: 0.075 } });
    expect(verifierActivite({ dateSignature: '2026-03-12', honoLocataireHt: 'abc' }).ok).toBe(false);
  });
  it('apporteur : nom, type de la liste, taux, date d’effet', () => {
    expect(verifierApporteur({ nom: '  Kin  Immo ', type: 'agence', taux: '10', depuis: '2026-01-01' }))
      .toEqual({ ok: true, nom: 'Kin Immo', type: 'agence', taux: 0.1, depuis: '2026-01-01', societe: null, telephone: null, email: null, collegueId: null,
        mode: 'one_shot', tauxGestion: 0, compteId: null, dureeAnnees: null });   // 413 — par défaut « One shot », gestion 0 % ; 419 — externe, durée sans objet
    expect(verifierApporteur({ nom: '', type: 'agence', depuis: '2026-01-01' }).ok).toBe(false);
    expect(verifierApporteur({ nom: 'X', type: 'ami', depuis: '2026-01-01' }).ok).toBe(false);
    expect(verifierApporteur({ nom: 'X', type: 'internet', taux: '10' }).ok).toBe(false);
  });
  it('règle de commission : 15 %, primes 150 / 15', () => {
    expect(verifierRegle({ depuis: '2026-01-01', tauxNegociateur: '15', primeLogement: '150', primeParking: '15' }))
      .toEqual({ ok: true, regle: { depuis: '2026-01-01', tauxNegociateur: 0.15, primeLogement: 150, primeParking: 15, primeLocal: null } });
    // Arno (24/10/2026) — le local : facultatif (vide = le logement), lu en euros s'il est saisi, refusé s'il est illisible.
    expect(verifierRegle({ depuis: '2026-11-01', tauxNegociateur: '15', primeLogement: '150', primeParking: '15', primeLocal: '150' }))
      .toEqual({ ok: true, regle: { depuis: '2026-11-01', tauxNegociateur: 0.15, primeLogement: 150, primeParking: 15, primeLocal: 150 } });
    expect(verifierRegle({ depuis: '2026-11-01', tauxNegociateur: '15', primeLogement: '150', primeParking: '15', primeLocal: '' }).ok).toBe(true);
    expect(verifierRegle({ depuis: '2026-11-01', tauxNegociateur: '15', primeLogement: '150', primeParking: '15', primeLocal: 'cent' }).ok).toBe(false);
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
    expect(lireParametres(null)).toEqual({ disponible: false, apporteurs: [], negociateurs: [], moi: null, collegues: [], regles: [], annuaire: false });
    expect(lireParametres({ disponible: true, apporteurs: [{ id: 1, nom: 'A', type: 'agence', archive: false }], negociateurs: [], moi: 2 }))
      .toMatchObject({ disponible: true, moi: 2, apporteurs: [{ baremes: [] }] });
  });
});

describe('🔴 407 — origine du contact, apporteur rattaché, prime', () => {
  it('l’origine du contact est OBLIGATOIRE pour une nouvelle location', () => {
    expect(verifierActivite({ dateSignature: '2026-10-23' })).toEqual({ ok: false, motif: 'L’origine du contact est obligatoire.' });
    expect(verifierActivite({ dateSignature: '2026-10-23', origineContact: 'internet' }).ok).toBe(true);
  });
  it('« Collègue directement » exige le collègue ; « Apporteur d’affaires » exige l’apporteur', () => {
    expect(verifierCommercial({ origineContact: 'collegue' })).toEqual({ ok: false, motif: 'Choisissez le collègue (origine « Collègue directement »).' });
    expect(verifierCommercial({ origineContact: 'apporteur' })).toEqual({ ok: false, motif: 'Choisissez l’apporteur d’affaires dans l’annuaire.' });
    expect(verifierCommercial({ origineContact: 'collegue', collegueId: 4, apporteurId: 9 })).toMatchObject({ ok: true, valeurs: { collegueId: 4, apporteurId: null } });
    expect(verifierCommercial({ origineContact: 'apporteur', apporteurId: 9, commissionApporteur: '64,39' })).toMatchObject({ ok: true, valeurs: { apporteurId: 9, commissionApporteur: 64.39 } });
  });
  it('prime : « 150 € » (règle), « Personnalisé » avec son montant, « Aucune »', () => {
    expect(verifierCommercial({ origineContact: 'internet', primeMode: 'regle' })).toMatchObject({ ok: true, valeurs: { primeMode: 'regle', primeMontant: null } });
    expect(verifierCommercial({ origineContact: 'internet', primeMode: 'personnalise' })).toEqual({ ok: false, motif: 'Prime de gestion personnalisée : saisissez le montant (ex. 15).' });
    expect(verifierCommercial({ origineContact: 'internet', primeMode: 'personnalise', primeMontant: '15' })).toMatchObject({ ok: true, valeurs: { primeMontant: 15 } });
    expect(verifierCommercial({ origineContact: 'internet', primeMode: 'aucune', primeMontant: '15' })).toMatchObject({ ok: true, valeurs: { primeMode: 'aucune', primeMontant: null } });
  });
  it('un nouvel apporteur a son collègue de rattachement (obligatoire) ; un e-mail mal écrit est refusé', () => {
    expect(verifierApporteur({ nom: 'X', type: 'partenaire', depuis: '2026-01-01' }, { collegueObligatoire: true }))
      .toEqual({ ok: false, motif: MOT_COLLEGUE_OBLIGATOIRE });
    expect(verifierApporteur({ nom: 'X', type: 'partenaire', depuis: '2026-01-01', collegueId: 5, email: 'x@y.fr', societe: '  SAS  Y ' }, { collegueObligatoire: true }))
      .toMatchObject({ ok: true, collegueId: 5, email: 'x@y.fr', societe: 'SAS Y' });
    expect(verifierApporteur({ nom: 'X', type: 'partenaire', depuis: '2026-01-01', email: 'pas un mail' }).ok).toBe(false);
  });
  it('🔴 le changement de collègue est DATÉ : les affaires passées restent au collègue de l’époque', () => {
    const a = { collegues: [{ depuis: '2026-01-01', collegueId: 2, collegueLibelle: 'Arnaud Jorel' }, { depuis: '2026-07-01', collegueId: 5, collegueLibelle: 'Jean-Baptiste PONS' }] };
    expect(collegueADate(a, '2026-06-30')?.collegueLibelle).toBe('Arnaud Jorel');
    expect(collegueADate(a, '2026-07-01')?.collegueLibelle).toBe('Jean-Baptiste PONS');
    expect(collegueADate(a, '2025-12-01')?.collegueLibelle).toBe('Arnaud Jorel');
  });
  it('« à rattacher » : aucun collègue (une base sans la 407 ne dit rien)', () => {
    expect(aRattacher({ collegues: [] })).toBe(true);
    expect(aRattacher({ collegues: [{ depuis: '2026-01-01', collegueId: 2, collegueLibelle: 'A' }] })).toBe(false);
    expect(aRattacher({})).toBe(false);
    expect(collegueADate({ collegues: [] }, '2026-01-01')).toBeNull();
  });
});

describe('🔴 Arno (24/10/2026, 415) — l’origine « Propriétaire déjà client »', () => {
  it('juste après « Relocation » ; proposée seulement avec la 415 ; libellé', async () => {
    const { originesProposees, libelleOrigineContact, verifierCommercial } = await import('./suivi');
    expect(originesProposees(true, true)).toEqual(['collegue', 'apporteur', 'internet', 'recommandation', 'relocation', 'proprietaire_deja_client', 'passage_agence', 'campagne', 'personnalise']);
    expect(originesProposees(true, false)).not.toContain('proprietaire_deja_client');
    expect(originesProposees(false, false)).not.toContain('personnalise');
    expect(libelleOrigineContact('proprietaire_deja_client')).toBe('Propriétaire déjà client');
    expect(verifierCommercial({ origineContact: 'proprietaire_deja_client' })).toMatchObject({ ok: true, valeurs: { origineContact: 'proprietaire_deja_client' } });
  });
});
