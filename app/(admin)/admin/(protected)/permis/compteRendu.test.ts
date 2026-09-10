import { describe, it, expect } from 'vitest';
import { libelleProvenance, provenanceChamp, etatChamp, divergenceNiveauxHorsSol, messageErreurCartouche, LIBELLE_NON_DECLARE, LIBELLE_NON_INSTRUIT } from './compteRendu';
import type { ScissionDescription } from '../../../../lib/permis/descriptionScission';

describe('libelleProvenance — vocabulaire lisible (jamais un nom de méthode brut)', () => {
  it('traduit chaque provenance', () => {
    expect(libelleProvenance('lidar')).toBe('mesure LiDAR');
    expect(libelleProvenance('plans_coupes')).toBe('plans et coupes');
    expect(libelleProvenance('cerfa')).toBe('déclaré au Cerfa');
    expect(libelleProvenance('petitionnaire')).toBe('déclaration du pétitionnaire');
    expect(libelleProvenance('teleservice')).toBe('généré par le téléservice');
    expect(libelleProvenance('saisie')).toBe('saisi à la main');
  });
});

describe('provenanceChamp — origine + méthode → provenance lisible', () => {
  it('la saisie prime', () => {
    expect(provenanceChamp('saisie', 'cerfa')).toBe('saisie');
  });
  it('mappe les méthodes d’extraction', () => {
    expect(provenanceChamp('extraite', 'cerfa')).toBe('cerfa');
    expect(provenanceChamp('extraite', 'recap')).toBe('cerfa');
    expect(provenanceChamp('extraite', 'enonce')).toBe('plans_coupes');
    expect(provenanceChamp('extraite', 'plan')).toBe('plans_coupes');
    expect(provenanceChamp('extraite', 'teleservice')).toBe('teleservice');
    expect(provenanceChamp('extraite', 'ia')).toBe('pieces');
  });
  it('un champ sans origine n’a pas de provenance', () => {
    expect(provenanceChamp(null, null)).toBeNull();
  });
});

describe('etatChamp — trois états distincts', () => {
  it('valeur présente → connu, avec provenance', () => {
    expect(etatChamp(true, 'extraite', 'cerfa')).toEqual({ statut: 'connu', provenance: 'cerfa' });
    expect(etatChamp(true, 'saisie', null)).toEqual({ statut: 'connu', provenance: 'saisie' });
  });
  it('valeur absente ET non portée par le Cerfa → non déclaré', () => {
    expect(etatChamp(false, null, null, true)).toEqual({ statut: 'non_declare' });
  });
  it('valeur absente sans marque d’absence → pas encore instruit', () => {
    expect(etatChamp(false, null, null, false)).toEqual({ statut: 'non_instruit' });
  });
  it('les deux libellés d’absence sont distincts', () => {
    expect(LIBELLE_NON_DECLARE).not.toBe(LIBELLE_NON_INSTRUIT);
  });
});

describe('messageErreurCartouche — piège du 401 (session expirée ≠ indisponible)', () => {
  it('401 / 403 → invite à se reconnecter, jamais « indisponible » ni « erreur »', () => {
    expect(messageErreurCartouche(401)).toBe('Session expirée, reconnectez-vous.');
    expect(messageErreurCartouche(403)).toBe('Session expirée, reconnectez-vous.');
    expect(messageErreurCartouche(401).toLowerCase()).not.toMatch(/indisponible|erreur/);
  });
  it('autre statut → message de retry (sans paniquer)', () => {
    expect(messageErreurCartouche(500)).not.toMatch(/Session expirée/);
  });
});

describe('divergenceNiveauxHorsSol — cas réel 470 (généré R+4 vs humain R+5)', () => {
  const scission = (valeurs: ScissionDescription['valeurs'], humain: string | null): ScissionDescription => ({ genere: 'x', humain, valeurs });
  it('détecte le conflit et RETIENT la valeur humaine (précédence)', () => {
    const d = divergenceNiveauxHorsSol(scission({ niveauxHorsSol: 4, niveauxSousSol: null, destination: null, surfaceCreeeM2: 2590 }, "un bâtiment allant jusqu'au R+5 avec deux locaux"));
    expect(d).toEqual({ genere: 4, humain: 5, retenu: 5 });
  });
  it('pas de conflit si valeurs égales, ou pas de R+N humain, ou pas de part générée', () => {
    expect(divergenceNiveauxHorsSol(scission({ niveauxHorsSol: 5, niveauxSousSol: null, destination: null, surfaceCreeeM2: null }, 'projet à R+5'))).toBeNull();
    expect(divergenceNiveauxHorsSol(scission({ niveauxHorsSol: 4, niveauxSousSol: null, destination: null, surfaceCreeeM2: null }, 'sans mention de niveaux'))).toBeNull();
    expect(divergenceNiveauxHorsSol(scission(null, "jusqu'au R+5"))).toBeNull();
  });
});
