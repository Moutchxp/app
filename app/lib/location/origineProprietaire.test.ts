import { describe, expect, it } from 'vitest';
import {
  heritable, locationsAReporter, memeOrigine, mentionsOrigine, origineProposeeDesLocations, planOrigineProprietaires, prerempliOrigine,
  verifierOrigineProprietaire, type ChampsOrigineLocation, type OrigineDuBien,
} from './origineProprietaire';
import { origineApresCases } from './suivi/suivi';

/**
 * 🔴 Arno (25/10/2026, migration 425) — L'ORIGINE DU CONTACT PORTÉE PAR LE PROPRIÉTAIRE, héritée par ses locations. Données fictives.
 */
const vide: ChampsOrigineLocation = { origineContact: '', origineContactPrecision: '', apporteurId: '', collegueId: '' };
const bien = (o: Partial<OrigineDuBien> = {}): OrigineDuBien => ({ proprietaireId: 7, nom: 'DUPONT Jean',
  origine: { origine: 'apporteur', precision: null, apporteurId: 12, collegueId: null }, coproprietairesDifferents: false, ...o });

describe('🔴 l’origine OBLIGATOIRE à la création d’un propriétaire', () => {
  it('vide : refusée ; « Origine inconnue — à compléter » : acceptée (jamais de champ vide)', () => {
    expect(verifierOrigineProprietaire({}).ok).toBe(false);
    expect(verifierOrigineProprietaire({ origine: '' }).ok).toBe(false);
    expect(verifierOrigineProprietaire({ origine: 'inconnue' })).toEqual({ ok: true, valeur: { origine: 'inconnue', precision: null, apporteurId: null, collegueId: null, collegueLibelle: null } });
  });
  it('les mêmes règles que le bloc 4 : apporteur → l’apporteur ; collègue → le collègue ; personnalisé → son texte (80 au plus)', () => {
    expect(verifierOrigineProprietaire({ origine: 'apporteur' }).ok).toBe(false);
    expect(verifierOrigineProprietaire({ origine: 'apporteur', apporteurId: 12 })).toMatchObject({ ok: true, valeur: { origine: 'apporteur', apporteurId: 12 } });
    expect(verifierOrigineProprietaire({ origine: 'collegue' }).ok).toBe(false);
    expect(verifierOrigineProprietaire({ origine: 'collegue', collegueId: '5' })).toMatchObject({ ok: true, valeur: { collegueId: 5 } });
    expect(verifierOrigineProprietaire({ origine: 'personnalise', precision: '  ' }).ok).toBe(false);
    expect(verifierOrigineProprietaire({ origine: 'personnalise', precision: 'x'.repeat(81) }).ok).toBe(false);
    expect(verifierOrigineProprietaire({ origine: 'personnalise', precision: ' Salon  immo ' })).toMatchObject({ ok: true, valeur: { precision: 'Salon immo' } });
  });
  it('« Relocation » et « Propriétaire déjà client » ne sont pas des origines de propriétaire (propres à une location)', () => {
    expect(verifierOrigineProprietaire({ origine: 'relocation' }).ok).toBe(false);
    expect(verifierOrigineProprietaire({ origine: 'proprietaire_deja_client' }).ok).toBe(false);
  });
});

describe('🔴 l’HÉRITAGE bien → location', () => {
  it('une location « à renseigner » reçoit l’origine du titulaire du bien, avec la mention « reprise du propriétaire <nom> »', () => {
    const r = prerempliOrigine(vide, bien());
    expect(r).toEqual({ reprise: true, champs: { origineContact: 'apporteur', origineContactPrecision: '', apporteurId: '12', collegueId: '' } });
    expect(mentionsOrigine(r.champs, bien())).toEqual(['reprise du propriétaire DUPONT Jean']);
  });
  it('« Origine inconnue » (ou aucune) n’est PAS héritée : la location reste « à renseigner »', () => {
    expect(heritable({ origine: 'inconnue', precision: null, apporteurId: null, collegueId: null })).toBe(false);
    expect(prerempliOrigine(vide, bien({ origine: { origine: 'inconnue', precision: null, apporteurId: null, collegueId: null } }))).toEqual({ champs: vide, reprise: false });
    expect(prerempliOrigine(vide, bien({ origine: null })).reprise).toBe(false);
    expect(prerempliOrigine(vide, null).reprise).toBe(false);
  });
  it('une origine déjà saisie sur la location n’est JAMAIS remplacée ; modifiée à la main : « différente de l’origine du propriétaire »', () => {
    const saisie: ChampsOrigineLocation = { ...vide, origineContact: 'internet' };
    expect(prerempliOrigine(saisie, bien())).toEqual({ champs: saisie, reprise: false });
    expect(mentionsOrigine(saisie, bien())).toEqual(['différente de l’origine du propriétaire']);
  });
  it('🔴 « Relocation » PRIME : la case impose son origine, le propriétaire ne la remplace pas ; « Nouvelle gestion » + déjà client aussi', () => {
    const cases = origineApresCases({ origine: null, auto: false, avecGestion: true, mandatGestion: false, dejaClient: false });
    expect(cases.origine).toBe('relocation');
    expect(prerempliOrigine({ ...vide, origineContact: cases.origine! }, bien()).reprise).toBe(false);
    expect(mentionsOrigine({ ...vide, origineContact: 'relocation' }, bien())).toEqual([]);
    const nouvelle = origineApresCases({ origine: null, auto: false, avecGestion: false, mandatGestion: true, dejaClient: true });
    expect(nouvelle.origine).toBe('proprietaire_deja_client');
    expect(prerempliOrigine({ ...vide, origineContact: nouvelle.origine! }, bien()).reprise).toBe(false);
    // Les cases laissent l'origine vide : celle du propriétaire.
    const libre = origineApresCases({ origine: null, auto: false, avecGestion: false, mandatGestion: true, dejaClient: false });
    expect(libre.origine).toBeNull();
    expect(prerempliOrigine(vide, bien()).reprise).toBe(true);
  });
  it('copropriétaires d’origines différentes : l’origine du titulaire, et la mention', () => {
    expect(mentionsOrigine(prerempliOrigine(vide, bien({ coproprietairesDifferents: true })).champs, bien({ coproprietairesDifferents: true })))
      .toEqual(['reprise du propriétaire DUPONT Jean', 'origines différentes entre copropriétaires']);
  });
});

describe('🔴 pas de rétroactivité : le report ne vise que les locations « à renseigner »', () => {
  it('seulement origine vide ET aucun apporteur déjà noté', () => {
    const l = [{ id: 1, origineContact: null, apporteurId: null }, { id: 2, origineContact: 'internet', apporteurId: null }, { id: 3, origineContact: null, apporteurId: 4 }];
    expect(locationsAReporter(l).map((x) => x.id)).toEqual([1]);
  });
});

describe('🔴 les propriétaires existants (script) : identiques → proposée ; divergentes et vides → listées, non touchées', () => {
  const loc = (o: string | null, a: number | null = null) => ({ origineContact: o, apporteurId: a });
  it('locations toutes identiques (les vides, « Relocation » et « Propriétaire déjà client » ignorées) → proposée', () => {
    const r = origineProposeeDesLocations([loc('apporteur', 12), loc(null), loc('relocation'), loc('proprietaire_deja_client'), loc('apporteur', 12)]);
    expect(r).toEqual({ sorte: 'proposee', origine: { origine: 'apporteur', precision: null, apporteurId: 12, collegueId: null }, nb: 2, vides: 3 });
  });
  it('divergentes : deux apporteurs différents ; vide : aucune origine utile', () => {
    expect(origineProposeeDesLocations([loc('apporteur', 12), loc('apporteur', 13)]).sorte).toBe('divergente');
    expect(origineProposeeDesLocations([loc(null), loc('relocation')]).sorte).toBe('vide');
    expect(origineProposeeDesLocations([]).sorte).toBe('vide');
  });
  it('un collègue sans compte (repris du fichier) se reconnaît à son nom', () => {
    const a = { origine: 'collegue' as const, precision: null, apporteurId: null, collegueId: null, collegueLibelle: 'Cédric Jullien' };
    expect(memeOrigine(a, { ...a, collegueLibelle: 'cédric jullien ' })).toBe(true);
    expect(memeOrigine(a, { ...a, collegueLibelle: 'Arnaud Jorel' })).toBe(false);
  });
  it('REJOUABLE : un propriétaire déjà renseigné n’est plus examiné', () => {
    const plan = planOrigineProprietaires([
      { id: 1, nom: 'A', origineActuelle: 'internet', locations: [loc('apporteur', 12)] },
      { id: 2, nom: 'B', origineActuelle: null, locations: [loc('apporteur', 12)] },
      { id: 3, nom: 'C', origineActuelle: null, locations: [loc('internet'), loc('passage_agence')] },
      { id: 4, nom: 'D', origineActuelle: null, locations: [] },
    ]);
    expect(plan.map((d) => [d.p.id, d.sorte])).toEqual([[1, 'deja'], [2, 'proposee'], [3, 'divergente'], [4, 'vide']]);
  });
});
