import { describe, it, expect } from 'vitest';
import { parseAdresseOcr, parseLogementsOcr, parseSurfaceOcr, parseStationnementOcr, parseDestinationsOcr, lireCerfaScan, type LecteurCerfa } from './lireCerfaScan';
import { planDepuisLectures } from './ecritureCerfaScan';

/** N10-O — lecture Cerfa scanné, BOUCHONNÉE (aucun appel API, aucun pdftoppm). Markdown OCR = extraits RÉELS mesurés le 21/08. */

describe('parsers OCR (déterministes)', () => {
  it('adresse : numéro + voie + CP (espaces retirés) + localité', () => {
    const md = 'Numéro : 30 Voie : rue Louis Lumière\nLieu-dit : X Localité : Paris\nCode postal : 7 5 0 2 0';
    expect(parseAdresseOcr(md)).toEqual({ statut: 'valeur', valeur: '30 rue Louis Lumière 75020 Paris' });
  });
  it('logements : « 0 » écrit → valeur 0 (PAS vide) ; libellé sans nombre → vide', () => {
    expect(parseLogementsOcr('- Nombre total de logements créés : 0 dont individuels :')).toEqual({ statut: 'valeur', valeur: '0' });
    expect(parseLogementsOcr('- Nombre total de logements créés :  dont individuels :')).toEqual({ statut: 'vide' });
  });
  it('surface : dernière colonne de « Surfaces totales »', () => {
    expect(parseSurfaceOcr('|  **Surfaces totales (en m²)** |   | 0 | 9470 | 0 | 0 | 0 | 9470  |')).toEqual({ statut: 'valeur', valeur: '9470' });
  });
  it('stationnement : « Après réalisation » sans nombre → vide (jamais 0)', () => {
    expect(parseStationnementOcr('### 4.7 Stationnement\nAvant réalisation du projet :\nAprès réalisation du projet :\nNombre de places :')).toEqual({ statut: 'vide' });
  });
  it('destinations : seule « Équipements sportifs » porte une surface', () => {
    const md = '|  Habitation | Logement |  |  |  |  |  |   |\n|   |  Équipements sportifs | 0 | 9470 | 0 | 0 | 0 | 9470  |\n|   |  Bureau |  |  |  |  |  |   |';
    const d = parseDestinationsOcr(md);
    expect(d['Équipements sportifs']).toEqual({ statut: 'valeur', valeur: '9470' });
    expect(d['Logement']).toEqual({ statut: 'vide' });
    expect(d['Bureau']).toEqual({ statut: 'vide' });
  });
});

// Markdown OCR par page (index 0-based) — seules les pages triées portent du contenu.
const MD = (() => { const a: string[] = Array(16).fill('');
  a[4] = 'Numéro : 30 Voie : rue Louis Lumière\nLocalité : Paris\nCode postal : 7 5 0 2 0';           // page 5
  a[6] = '- Nombre total de logements créés : 0 dont individuels :';                                    // page 7
  a[8] = '|   |  Équipements sportifs | 0 | 9470 | 0 | 0 | 0 | 9470  |\n|  **Surfaces totales (en m²)** |   | 0 | 9470 | 0 | 0 | 0 | 9470  |'; // page 9
  a[9] = '### 4.7 Stationnement\nAprès réalisation du projet :\nNombre de places :';                    // page 10
  return a; })();

const lecteur = (visionImpl: LecteurCerfa['vision']): LecteurCerfa => ({ ocr: async () => MD, rasteriser: () => 'FAKE_B64', vision: visionImpl });

// vision qui CONCORDE avec l'OCR (cas réel 0037)
const visionAccord: LecteurCerfa['vision'] = async (_img, prompt) => {
  if (prompt.includes('Localisation du (ou des) terrain')) return { numero: '30', voie: 'rue Louis Lumière', code_postal: '75020', localite: 'Paris' };
  if (prompt.includes('logements créés')) return { logements_crees: { etat: 'renseigne', valeur: '0' } };
  if (prompt.includes('places de stationnement')) return { apres: { etat: 'vide', valeur: null } };
  if (prompt.includes('Surfaces totales')) return { surface_plancher_totale: { etat: 'rempli', valeur: 9470 } };
  if (prompt.includes('Pour CHAQUE sous-destination')) return { resultats: [{ sous_destination: 'Équipements sportifs', etat: 'renseignee', valeur: '9470' }] };
  return {};
};

describe('lireCerfaScan + plan — 07512024V0037 : OCR et vision s’accordent → tout écrit', () => {
  it('les 5 champs sont en accord → plan écrit adresse, surface, logements(0), destinations ; stationnement vide non écrit', async () => {
    const lectures = await lireCerfaScan(Buffer.from('x'), lecteur(visionAccord));
    const { plan } = planDepuisLectures('CERFA.pdf', lectures);
    const retenus = plan.journal.filter((l) => l.role === 'retenue').map((l) => l.champ);
    expect(retenus).toContain('adresse_terrain');
    expect(retenus).toContain('surface_plancher_m2');
    expect(retenus).toContain('nb_logements');             // 0 écrit (vrai 0)
    expect(retenus).toContain('destinations');
    expect(plan.destinations).toEqual(['Équipements sportifs']);
    expect(plan.scalaires.find((s) => s.cle === 'nbLogements')!.valeur).toBe('0');
    // stationnement : vide des deux côtés → PAS écrit, PAS 0
    expect(retenus).not.toContain('nb_places_stationnement');
    expect(plan.journal.some((l) => l.champ === 'nb_places_stationnement' && l.valeur === 0)).toBe(false);
    // provenance destinations honnête
    expect(plan.journal.find((l) => l.champ === 'destinations' && l.role === 'retenue')!.extrait).toContain('surface déclarée en W2');
  });
});

describe('lireCerfaScan + plan — désaccord : la vision invente, rien écrit sur ce champ', () => {
  it('vision voit une surface différente → surface_plancher_m2 en désaccord, non écrit, DEUX lectures journalisées', async () => {
    const visionMenteuse: LecteurCerfa['vision'] = async (img, prompt) => {
      if (prompt.includes('Surfaces totales')) return { surface_plancher_totale: { etat: 'rempli', valeur: 8888 } }; // ≠ OCR 9470
      return visionAccord(img, prompt);
    };
    const lectures = await lireCerfaScan(Buffer.from('x'), lecteur(visionMenteuse));
    const { plan } = planDepuisLectures('CERFA.pdf', lectures);
    expect(plan.scalaires.some((s) => s.cle === 'surfacePlancherM2')).toBe(false);
    const lignes = plan.journal.filter((l) => l.champ === 'surface_plancher_m2');
    expect(lignes).toHaveLength(2);
    expect(lignes.every((l) => l.role === 'ecartee')).toBe(true);
    expect(lignes.some((l) => l.extrait.includes('9470'))).toBe(true); // OCR
    expect(lignes.some((l) => l.extrait.includes('8888'))).toBe(true); // vision
  });
});

import { etatVersLecture } from './lireCerfaScan';

describe('N10-P — etatVersLecture : la VALEUR prime sur le mot d’état', () => {
  it('une valeur présente SURVIT à n’importe quel mot d’état (« valide », « valeur », mot inventé)', () => {
    for (const etat of ['valide', 'valeur', 'rempli', 'renseignee', 'coché', 'bidule-inventé', '']) {
      expect(etatVersLecture(etat, '9470')).toEqual({ statut: 'valeur', valeur: '9470' });
    }
  });
  it('un « 0 » lu survit aussi (vide ≠ 0 : 0 est une valeur)', () => {
    expect(etatVersLecture('valide', '0')).toEqual({ statut: 'valeur', valeur: '0' });
  });
  it('PAS de valeur + état de vide → VIDE (jamais 0)', () => {
    for (const [e, v] of [['vide', null], ['vide', ''], ['non renseigné', null], ['absent', '—']] as const) {
      expect(etatVersLecture(e, v)).toEqual({ statut: 'vide' });
    }
  });
  it('PAS de valeur et mot d’état non concluant → ILLISIBLE', () => {
    expect(etatVersLecture('valeur', '')).toEqual({ statut: 'illisible' });   // dit « rempli » mais rien lu → on ne fabrique pas
    expect(etatVersLecture('illisible', 'None')).toEqual({ statut: 'illisible' });
  });
});

describe('N10-P — reproduction du faux désaccord : vision « valide/9470 » → surface ÉCRITE (plus jetée)', () => {
  it('OCR 9470 + vision {etat:valide, valeur:9470} → accord, écrit', async () => {
    const visionValide: LecteurCerfa['vision'] = async (_img, prompt) => {
      if (prompt.includes('Surface totale')) return { surface_plancher_totale: { etat: 'valide', valeur: 9470 } }; // le mot qui faisait tout planter
      return visionAccord(_img, prompt);
    };
    const lectures = await lireCerfaScan(Buffer.from('x'), lecteur(visionValide));
    expect(lectures.scalaires.surfacePlancherM2.vision).toEqual({ statut: 'valeur', valeur: '9470' });
    const { plan } = planDepuisLectures('CERFA.pdf', lectures);
    expect(plan.scalaires.find((s) => s.cle === 'surfacePlancherM2')!.valeur).toBe('9470');
    // la garde reste : stationnement vide → non écrit
    expect(plan.scalaires.some((s) => s.cle === 'nbPlacesStationnement')).toBe(false);
  });
})
