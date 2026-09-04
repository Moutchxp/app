import { describe, it, expect } from 'vitest';
import { lireParcellesRecapCerfa } from './parcellesRecap';

/** LOT 66 — lecture PURE de la table « Références cadastrales » d'un récapitulatif de demande (télé-service). Aucune I/O. */

// Extrait FIDÈLE à la forme pdfjs mesurée sur le dossier 7424 (10 parcelles, préfixe « 0 »).
const RECAP_7424 =
  "… Basé sur le cerfa n° 13409 Demande de Permis de construire … " +
  "Références cadastrales Préfixe   Section   Numéro   Surface (m²)   Observation   Partielle  " +
  "0   Z   1   600   Non  0   Z   2   420   Non  0   Z   3   273   Non  0   Z   4   265   Non  " +
  "0   Z   194   224   Non  0   Z   124   825   Non  0   Z   6   272   Non  0   Z   195   557   Non  " +
  "0   AB   157   1320   Non  0   AB   160   259   Non  " +
  "Situation juridique du terrain  Êtes-vous titulaire d'un certificat d'urbanisme … : Non Le terrain est-il situé dans un lotissement ? : Non";

describe('lireParcellesRecapCerfa — lit TOUTES les parcelles de la table, sans plafond', () => {
  it('rend les 10 parcelles du dossier-témoin, préfixe NORMALISÉ à 000, superficie lue', () => {
    const { parcelles, anomalies } = lireParcellesRecapCerfa(RECAP_7424);
    expect(parcelles).toHaveLength(10);
    expect(anomalies).toEqual([]);
    expect(parcelles.every((p) => p.prefixe === '000')).toBe(true); // « 0 » du récap → « 000 » (clé des parcelles cadastrales)
    expect(parcelles.map((p) => `${p.section} ${p.numero}`)).toEqual(
      ['Z 1', 'Z 2', 'Z 3', 'Z 4', 'Z 194', 'Z 124', 'Z 6', 'Z 195', 'AB 157', 'AB 160'],
    );
    expect(parcelles.reduce((a, p) => a + (p.superficieM2 ?? 0), 0)).toBe(5015);
  });

  it('N’INVENTE RIEN hors table : « Non » de « Situation juridique » (après la table) ne crée aucune parcelle', () => {
    const { parcelles } = lireParcellesRecapCerfa(RECAP_7424);
    expect(parcelles).toHaveLength(10); // borne RE_FIN : la table s'arrête à « Situation juridique »
  });

  it('texte sans table « Références cadastrales » → aucune parcelle, aucune anomalie', () => {
    expect(lireParcellesRecapCerfa('un texte quelconque sans table cadastrale')).toEqual({ parcelles: [], anomalies: [] });
    expect(lireParcellesRecapCerfa('')).toEqual({ parcelles: [], anomalies: [] });
  });

  it('parcelle SANS superficie déclarée reste IDENTIFIÉE (superficie null), jamais perdue pour l’empreinte', () => {
    const t = 'Références cadastrales Préfixe Section Numéro Surface (m²) Observation Partielle  000   AB   12   Non';
    const { parcelles } = lireParcellesRecapCerfa(t);
    expect(parcelles).toEqual([{ prefixe: '000', section: 'AB', numero: '12', superficieM2: null }]);
  });

  it('N10-R — une ligne dont section/numéro sont illisibles reste ABSENTE, AVEC un motif (jamais un vide muet)', () => {
    const t = 'Références cadastrales Préfixe Section Numéro Surface (m²) Observation Partielle  ??? illisible garbage   Non  000   AB   12   50   Non';
    const { parcelles, anomalies } = lireParcellesRecapCerfa(t);
    expect(parcelles).toEqual([{ prefixe: '000', section: 'AB', numero: '12', superficieM2: 50 }]);
    expect(anomalies).toHaveLength(1);
    expect(anomalies[0]).toMatch(/illisible/i);
  });

  it('dédoublonne une même parcelle (section/numéro) vue deux fois dans la table', () => {
    const t = 'Références cadastrales Partielle  0   Z   1   600   Non  0   Z   1   600   Non';
    expect(lireParcellesRecapCerfa(t).parcelles).toHaveLength(1);
  });
});
