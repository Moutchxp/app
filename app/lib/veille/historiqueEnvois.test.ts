import { describe, it, expect } from 'vitest';
import { ordonnerHistoriqueEnvois, origineRelanceDepuisAuteur, libelleRelanceReponse, type EnvoiBrut } from './historiqueEnvois';

/**
 * LOT 13-B — cœur PUR de l'historique de nos envois. On prouve : la demande INITIALE en tête, l'ordre chronologique, la FUSION des
 * deux sources (acheminement + journal), les GRADES corrects et NON fusionnés (ordinaire = noms propres, partielle = ordinaux), le cas
 * « aucun envoi », et le repli des plus anciennes.
 */
const initiale = (le: string, destinataire: string | null = null): EnvoiBrut => ({ le, categorie: 'initiale', variante: null, rang: null, destinataire });
const ordinaire = (le: string, variante: string): EnvoiBrut => ({ le, categorie: 'ordinaire', variante, rang: null, destinataire: null });
const partielle = (le: string, rang: number): EnvoiBrut => ({ le, categorie: 'partielle', variante: null, rang, destinataire: null });

describe('ordonnerHistoriqueEnvois — ordre, fusion, grades', () => {
  it('demande initiale en PREMIÈRE position, puis relances par ordre chronologique (fusion acheminement + journal)', () => {
    // Sources mélangées ET dans le désordre : une relance ordinaire, la partielle, l'initiale.
    const bruts = [ordinaire('2026-08-26T09:00:00Z', 'rappel'), partielle('2026-09-10T08:00:00Z', 1), initiale('2026-08-04T21:00:00Z')];
    const h = ordonnerHistoriqueEnvois(bruts);
    expect(h.map((e) => e.nature)).toEqual(['initiale', 'relance_ordinaire', 'relance_partielle']);
    expect(h[0].libelle).toBe('Demande initiale de communication');
  });

  it('GRADES ordinaires = noms propres (Rappel / Avis d’échéance / Saisine)', () => {
    const h = ordonnerHistoriqueEnvois([ordinaire('2026-01-01T00:00:00Z', 'rappel'), ordinaire('2026-02-01T00:00:00Z', 'avis'), ordinaire('2026-03-01T00:00:00Z', 'saisine')]);
    expect(h.map((e) => e.grade)).toEqual(['Rappel', 'Avis d’échéance', 'Saisine']);
    expect(h[0].libelle).toBe('Relance — Rappel');
  });

  it('GRADES partiels = ordinaux (« 1re relance », « 2e relance »…), vocabulaire NON fusionné avec l’ordinaire', () => {
    const h = ordonnerHistoriqueEnvois([partielle('2026-01-01T00:00:00Z', 1), partielle('2026-02-01T00:00:00Z', 2)]);
    expect(h.map((e) => e.grade)).toEqual(['1re relance', '2e relance']);
    expect(h[1].libelle).toBe('Relance partielle — 2e relance');
  });

  it('variante ordinaire inconnue → repli « Relance » (jamais un plantage)', () => {
    expect(ordonnerHistoriqueEnvois([ordinaire('2026-01-01T00:00:00Z', 'zzz')])[0].grade).toBe('Relance');
  });

  it('destinataire conservé quand connu', () => {
    expect(ordonnerHistoriqueEnvois([initiale('2026-08-04T21:00:00Z', 'mairie@ex.fr')])[0].destinataire).toBe('mairie@ex.fr');
  });

  it('aucun envoi → liste vide', () => {
    expect(ordonnerHistoriqueEnvois([])).toEqual([]);
  });

  it('LOT 30 (③) — « extra » (envoi supplémentaire non compté) → nature complement_extra, libellé « Envoi supplémentaire »', () => {
    const brut: EnvoiBrut = { le: '2026-09-06T09:00:00Z', categorie: 'extra', variante: null, rang: null, destinataire: 'urba@m.fr' };
    expect(ordonnerHistoriqueEnvois([brut])[0]).toMatchObject({ nature: 'complement_extra', grade: null, libelle: 'Envoi supplémentaire', destinataire: 'urba@m.fr' });
  });
  it('LOT 30 (③) — relance partielle COMPTÉE à la main : le drapeau manuel est conservé', () => {
    const brut: EnvoiBrut = { le: '2026-09-05T09:00:00Z', categorie: 'partielle', variante: null, rang: 2, destinataire: 'urba@m.fr', manuel: true };
    expect(ordonnerHistoriqueEnvois([brut])[0]).toMatchObject({ nature: 'relance_partielle', grade: '2e relance', manuel: true });
  });
});

describe('LOT 79 — origine d’une relance sur réponse dérivée de l’auteur (jamais présumée)', () => {
  it('auteur « auto » (ordonnanceur) → origine auto → titre « Relance automatique après réponse partielle »', () => {
    const brut: EnvoiBrut = { le: '2026-09-03T09:16:00Z', categorie: 'reponse', variante: null, rang: 1, destinataire: 'urba@m.fr', auteur: 'auto' };
    expect(ordonnerHistoriqueEnvois([brut])[0]).toMatchObject({ nature: 'relance_reponse', origine: 'auto', libelle: 'Relance automatique après réponse partielle' });
  });
  it('auteur = identité humaine → origine manuel → titre « Relance manuelle après réponse partielle »', () => {
    const brut: EnvoiBrut = { le: '2026-09-03T09:16:00Z', categorie: 'reponse', variante: null, rang: 1, destinataire: 'urba@m.fr', auteur: 'a.jorel@sansvisavis.com' };
    expect(ordonnerHistoriqueEnvois([brut])[0]).toMatchObject({ nature: 'relance_reponse', origine: 'manuel', libelle: 'Relance manuelle après réponse partielle' });
  });
  it('auteur absent (ligne historique sans trace) → origine indéterminée → libellé NEUTRE (jamais « automatique »)', () => {
    const brut: EnvoiBrut = { le: '2026-09-03T09:16:00Z', categorie: 'reponse', variante: null, rang: 1, destinataire: 'urba@m.fr', auteur: null };
    expect(ordonnerHistoriqueEnvois([brut])[0]).toMatchObject({ nature: 'relance_reponse', origine: 'indetermine', libelle: 'Relance après réponse partielle' });
  });

  it('origineRelanceDepuisAuteur : auto/systeme → auto ; vide/espaces/null → indéterminée ; autre → manuel', () => {
    expect(origineRelanceDepuisAuteur('auto')).toBe('auto');
    expect(origineRelanceDepuisAuteur('systeme')).toBe('auto');
    expect(origineRelanceDepuisAuteur(null)).toBe('indetermine');
    expect(origineRelanceDepuisAuteur('')).toBe('indetermine');
    expect(origineRelanceDepuisAuteur('   ')).toBe('indetermine');
    expect(origineRelanceDepuisAuteur('Arno')).toBe('manuel');
  });
  it('libelleRelanceReponse : mapping des trois origines', () => {
    expect(libelleRelanceReponse('auto')).toBe('Relance automatique après réponse partielle');
    expect(libelleRelanceReponse('manuel')).toBe('Relance manuelle après réponse partielle');
    expect(libelleRelanceReponse('indetermine')).toBe('Relance après réponse partielle');
  });
});
// LOT 15 — le repli des anciennes est désormais testé dans friseSuivi.test.ts (partitionnerFrise), sur la frise unifiée.
