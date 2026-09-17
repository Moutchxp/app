import { describe, it, expect } from 'vitest';
import { correspondVivier, rechercherDansVivier, type PermisVivier } from './rechercheVivier';

const p = (over: Partial<PermisVivier> = {}): PermisVivier => ({
  dossierId: 1, numDau: '07510124V0034', type: 'PC', codeInsee: '75056', communeNom: 'Paris',
  canal: 'formulaire', categorie: 'immeuble_neuf', dateAutorisation: '2024-06-01', adresse: null, ...over,
});

describe('D3 — correspondVivier (n° de permis OU ville)', () => {
  it('match par num_dau (casse/espaces/tirets ignorés)', () => {
    expect(correspondVivier(p(), '07510124V0034')).toBe(true);
    expect(correspondVivier(p(), 'v0034')).toBe(true);            // sous-chaîne, minuscule
    expect(correspondVivier(p(), '0751-0124 V0034')).toBe(true);  // tirets/espaces ignorés
  });
  it('match par ville (nom ou code INSEE)', () => {
    expect(correspondVivier(p(), 'paris')).toBe(true);
    expect(correspondVivier(p(), '75056')).toBe(true);
  });
  it('requête vide → aucun match (jamais tout le vivier)', () => {
    expect(correspondVivier(p(), '')).toBe(false);
    expect(correspondVivier(p(), '   ')).toBe(false);
  });
  it('aucune correspondance → false', () => {
    expect(correspondVivier(p({ numDau: 'PC1', communeNom: 'Nanterre', codeInsee: '92050' }), 'lyon')).toBe(false);
  });
});

describe('recherche par ADRESSE — tolérante (virgule, accents, casse, espaces, apostrophes, tirets)', () => {
  it('virgule après le numéro : « 25 rue du Commerce » ≡ « 25, rue du Commerce »', () => {
    const permis = p({ adresse: '25 RUE DU COMMERCE' });
    for (const q of ['25 rue du Commerce', '25, rue du Commerce', '25,rue du commerce', '25   RUE   DU   COMMERCE']) {
      expect(correspondVivier(permis, q), q).toBe(true);
    }
  });

  it('accents : « rue de l’Hôtel » ≡ « rue de l hotel » (donnée accentuée, saisie sans accent)', () => {
    const permis = p({ adresse: "RUE DE L'HÔTEL" });
    for (const q of ['rue de l hotel', 'rue de l’hotel', "RUE DE L'HÔTEL", 'HOTEL']) {
      expect(correspondVivier(permis, q), q).toBe(true);
    }
  });

  it('apostrophe droite ≡ typographique ; tiret ≡ espace', () => {
    expect(correspondVivier(p({ adresse: "RUE D'ABOUKIR" }), 'd’aboukir')).toBe(true);   // droite (donnée) ≡ typo (saisie)
    expect(correspondVivier(p({ adresse: 'RUE D’ABOUKIR' }), "d'aboukir")).toBe(true);   // typo (donnée) ≡ droite (saisie)
    expect(correspondVivier(p({ adresse: 'RUE SAINT-MARTIN' }), 'saint martin')).toBe(true); // tiret (donnée) ≡ espace (saisie)
    expect(correspondVivier(p({ adresse: 'RUE SAINT MARTIN' }), 'saint-martin')).toBe(true); // espace (donnée) ≡ tiret (saisie)
  });

  it('SYMÉTRIE : la normalisation s’applique aux DEUX côtés (peu importe lequel porte l’accent/la ponctuation)', () => {
    const formes = ['RUE DE L’HÔTEL-DIEU', "rue de l'hotel dieu", '  RUE  DE  L HOTEL DIEU  ', 'rue-de-l’hôtel,dieu'];
    for (const stocke of formes) {
      for (const saisie of formes) {
        expect(correspondVivier(p({ adresse: stocke }), saisie), `stocke=«${stocke}» saisie=«${saisie}»`).toBe(true);
      }
    }
  });

  it('adresse ABSENTE (null) : jamais un faux match, et la recherche par ville/num continue de marcher', () => {
    const sansAdresse = p({ adresse: null, communeNom: 'Paris' });
    expect(correspondVivier(sansAdresse, 'rue du commerce')).toBe(false); // rien à matcher, pas de crash
    expect(correspondVivier(sansAdresse, 'paris')).toBe(true);            // la ville marche toujours
    expect(correspondVivier(sansAdresse, '07510124V0034')).toBe(true);   // le num_dau marche toujours
  });

  it('rechercherDansVivier ramène le permis par son adresse, scopé au process', () => {
    const vivier: PermisVivier[] = [
      p({ dossierId: 10, adresse: '25 RUE DU COMMERCE', canal: 'formulaire' }),
      p({ dossierId: 11, adresse: '3 AVENUE DE LA GARE', canal: 'formulaire' }),
    ];
    const r = rechercherDansVivier(vivier, '25, rue du commerce', 'formulaire', 50);
    expect(r.resultats.map((x) => x.dossierId)).toEqual([10]);
    expect(r.total).toBe(1);
  });
});

describe('D3 — rechercherDansVivier (scopé + mention non silencieuse de l’autre process)', () => {
  const vivier: PermisVivier[] = [
    p({ dossierId: 1, numDau: 'PARIS-A', communeNom: 'Paris', canal: 'formulaire' }),
    p({ dossierId: 2, numDau: 'PARIS-B', communeNom: 'Paris', canal: 'formulaire' }),
    p({ dossierId: 3, numDau: 'PARIS-C', communeNom: 'Paris', canal: 'email' }),      // même ville, AUTRE process
    p({ dossierId: 4, numDau: 'AUTRE', communeNom: 'Nanterre', canal: 'formulaire' }),
    p({ dossierId: 5, numDau: 'PARIS-D', communeNom: 'Paris', canal: 'courrier' }),   // hors process → jamais compté
  ];

  it('ne renvoie que le process actif ; compte l’autre process ; ignore le hors-process', () => {
    const r = rechercherDansVivier(vivier, 'paris', 'formulaire', 50);
    expect(r.resultats.map((x) => x.dossierId)).toEqual([1, 2]); // formulaire « Paris »
    expect(r.total).toBe(2);
    expect(r.autreProcess).toBe(1); // le « PARIS-C » email (le courrier n’est PAS compté comme un autre process)
  });

  it('depuis E-mail : 1 résultat email + mention « 2 dans Téléservice »', () => {
    const r = rechercherDansVivier(vivier, 'paris', 'email', 50);
    expect(r.resultats.map((x) => x.dossierId)).toEqual([3]);
    expect(r.autreProcess).toBe(2); // PARIS-A + PARIS-B (formulaire)
  });

  it('requête vide → aucun résultat, aucune mention', () => {
    expect(rechercherDansVivier(vivier, '', 'formulaire', 50)).toEqual({ resultats: [], total: 0, autreProcess: 0 });
  });

  it('cap borne les résultats mais pas le total', () => {
    const gros = Array.from({ length: 5 }, (_, i) => p({ dossierId: i + 10, numDau: `PARIS-${i}`, canal: 'formulaire' }));
    const r = rechercherDansVivier(gros, 'paris', 'formulaire', 2);
    expect(r.resultats).toHaveLength(2);
    expect(r.total).toBe(5);
  });
});
