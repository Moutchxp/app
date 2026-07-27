import { describe, it, expect } from 'vitest';
import type { CanalContact } from './mairieContact';
import {
  type CandidatDossier, type ConfigDemandeur, type Lot,
  identiteManquante, proposerLots, genererTexte, piecesDepuisConfig, formaterReferenceDemande,
} from './demande';

let seq = 0;
function cand(over: Partial<CandidatDossier> = {}): CandidatDossier {
  seq += 1;
  return {
    dossierId: seq, codeInsee: '92050', communeNom: 'Nanterre', canal: 'email' as CanalContact,
    numDau: `PC${seq}`, dateReelleAutorisation: '2025-03-10', adresse: '10 RUE X', cadastre: ['AB 0012'], ...over,
  };
}
const HIST_VIDE = { dejaRattaches: new Set<number>(), demandesCeMoisParCommune: new Map<string, number>() };
const P = { dossiersParDemande: 5, demandesParCommuneParMois: 1 };

const CONFIG: ConfigDemandeur = {
  raisonSociale: 'CRITERIMMO', formeJuridique: 'SARL', siegeAdresse: '191 av. Charles de Gaulle, 92200 Neuilly',
  representantNom: 'A. Jorel', representantQualite: 'gérant', emailContact: 'contact@sansvisavis.com', telephone: '',
};

describe('Sitadel S7 — identité du demandeur', () => {
  it('identité complète → aucun manque', () => { expect(identiteManquante(CONFIG)).toEqual([]); });
  it('champ vide (hors telephone) → listé, telephone jamais requis', () => {
    expect(identiteManquante({ ...CONFIG, siegeAdresse: '' })).toEqual(['adresse du siège']);
    expect(identiteManquante({ ...CONFIG, telephone: '' })).toEqual([]); // telephone optionnel
    expect(identiteManquante({ ...CONFIG, raisonSociale: '', emailContact: '' })).toEqual(['raison sociale', 'e-mail de contact']);
  });
});

describe('Sitadel S7 — constitution des lots (pure)', () => {
  it('respecte le plafond de dossiers par demande', () => {
    const c = Array.from({ length: 7 }, () => cand());
    const lots = proposerLots(c, { ...P, demandesParCommuneParMois: 3 }, HIST_VIDE);
    expect(lots).toHaveLength(2);          // 7 dossiers, 5/demande → 5 + 2
    expect(lots[0].dossiers).toHaveLength(5);
    expect(lots[1].dossiers).toHaveLength(2);
  });

  it('respecte le plafond MENSUEL par commune (1/mois → 1 seul lot même avec beaucoup de dossiers)', () => {
    const c = Array.from({ length: 12 }, () => cand());
    expect(proposerLots(c, P, HIST_VIDE)).toHaveLength(1);
    // déjà 1 demande ce mois → quota épuisé → aucun lot
    expect(proposerLots(c, P, { ...HIST_VIDE, demandesCeMoisParCommune: new Map([['92050', 1]]) })).toHaveLength(0);
  });

  it('un dossier déjà rattaché (demande active) n’est jamais reproposé', () => {
    const a = cand(); const b = cand();
    const lots = proposerLots([a, b], { ...P, demandesParCommuneParMois: 5 }, { ...HIST_VIDE, dejaRattaches: new Set([a.dossierId]) });
    expect(lots).toHaveLength(1);
    expect(lots[0].dossiers.map((d) => d.dossierId)).toEqual([b.dossierId]);
  });

  it('commune en canal « inconnu » (ou orpheline) → aucune demande', () => {
    expect(proposerLots([cand({ canal: 'inconnu' })], P, HIST_VIDE)).toHaveLength(0);
    expect(proposerLots([cand({ canal: null })], P, HIST_VIDE)).toHaveLength(0);
    expect(proposerLots([cand({ communeNom: null })], P, HIST_VIDE)).toHaveLength(0);
  });
});

describe('Sitadel S7 — texte de la demande', () => {
  const lot: Lot = { codeInsee: '92050', communeNom: 'Nanterre', canal: 'email', dossiers: [cand({ numDau: 'PC0001' }), cand({ numDau: 'PC0002' })] };
  const pieces = piecesDepuisConfig('PC2,PC3');
  const { objet, corps } = genererTexte(lot, CONFIG, 'SVAV-DEM-2026-000001', pieces);

  it('contient les DEUX pièces, la référence, et TOUS les dossiers du lot', () => {
    expect(corps).toContain('la pièce PC2');
    expect(corps).toContain('la pièce PC3');
    expect(corps).toContain('SVAV-DEM-2026-000001');
    expect(objet).toContain('SVAV-DEM-2026-000001');
    expect(corps).toContain('PC0001');
    expect(corps).toContain('PC0002');
    expect(corps).toContain('L311-1');
  });

  it('ne contient AUCUN motif / justification d’intérêt / usage prévu', () => {
    const interdits = /\b(motif|parce que|afin de|en vue de|pour (notre|nos|mon|mes|le compte)|justif|intérêt|usage|raison de la demande)\b/i;
    expect(corps).not.toMatch(interdits);
  });

  it('les libellés de pièces viennent de la config (PC2 seule)', () => {
    const un = genererTexte(lot, CONFIG, 'SVAV-DEM-2026-000002', piecesDepuisConfig('PC2'));
    expect(un.corps).toContain('la pièce PC2');
    expect(un.corps).not.toContain('la pièce PC3');
  });

  it('destinataire/texte FIGÉ : muter la source après coup ne change pas le texte déjà généré (instantané figé)', () => {
    const cfgMut: ConfigDemandeur = { ...CONFIG };
    const fige = genererTexte(lot, cfgMut, 'SVAV-DEM-2026-000003', pieces).corps;
    cfgMut.emailContact = 'AUTRE@ailleurs.fr'; // modif du « registre » après génération
    expect(fige).toContain('contact@sansvisavis.com'); // le texte produit reste l'instantané
    expect(fige).not.toContain('AUTRE@ailleurs.fr');
  });

  it('formaterReferenceDemande : SVAV-DEM-AAAA-NNNNNN', () => {
    expect(formaterReferenceDemande(2026, 42)).toBe('SVAV-DEM-2026-000042');
  });
});
