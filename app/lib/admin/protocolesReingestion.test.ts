import { describe, it, expect } from 'vitest';
import { parserProtocoles, construireAffichageProtocoles } from './protocolesReingestion';

/**
 * FRAÎCHEUR / F5 — parsing PUR des protocoles. Couvre : section complète (titre + prose + commande), cas (c) SANS bloc
 * copiable, fichier absent → sentinelle globale, section manquante → sentinelle par source, intro captée.
 */

// Fixture bâtie par lignes pour éviter l'échappement des barrières ``` dans un littéral de gabarit.
const TEXTE = [
  'Note d’ouverture : du plus sûr au plus risqué.',
  '',
  '<!-- SOURCE: cadastre -->',
  '## Cadastre — parcelles',
  '',
  'CE QUE ÇA APPORTE : les parcelles.',
  'CAS : (a) complet et outillé.',
  '',
  '```bash',
  'cd /Users/x/app',
  'set -a && source .env && set +a',
  'npm run cadastre:ingest -- --dep 75,78,92,93 --millesime 2026-06-01',
  '```',
  '',
  'VÉRIFICATION APRÈS : compter les lignes.',
  '',
  '<!-- SOURCE: lidar -->',
  '## LiDAR HD',
  '',
  'DONNÉES IRREPRODUCTIBLES AUJOURD’HUI.',
  'CAS : (c) aucune procédure connue.',
  'CE QU’IL FAUDRAIT : un pipeline de rasterisation.',
].join('\n');

const ORDRE_TEST = [
  { cle: 'cadastre', nom: 'Cadastre' },
  { cle: 'lidar', nom: 'LiDAR HD' },
  { cle: 'dila', nom: 'DILA' }, // volontairement ABSENT du texte → sentinelle « section manquante »
];

describe('parserProtocoles — section complète', () => {
  it('capte titre, prose et bloc de commande', () => {
    const { sections, intro } = parserProtocoles(TEXTE);
    expect(intro).toContain('Note d’ouverture');
    const cad = sections.get('cadastre')!;
    expect(cad.titre).toBe('Cadastre — parcelles');
    const commandes = cad.elements.filter((e) => e.type === 'commande');
    expect(commandes).toHaveLength(1);
    expect(commandes[0].type === 'commande' && commandes[0].commande).toContain('npm run cadastre:ingest');
    expect(commandes[0].type === 'commande' && commandes[0].commande).toContain('cd /Users/x/app');
    expect(cad.elements.some((e) => e.type === 'prose' && e.texte.includes('CE QUE ÇA APPORTE'))).toBe(true);
  });
});

describe('parserProtocoles — cas (c) : AUCUN bloc copiable', () => {
  it('une source sans procédure n’a que de la prose (zéro commande), et dit « aucune procédure connue »', () => {
    const lidar = parserProtocoles(TEXTE).sections.get('lidar')!;
    expect(lidar.elements.filter((e) => e.type === 'commande')).toHaveLength(0);
    expect(lidar.elements.some((e) => e.type === 'prose' && e.texte.includes('aucune procédure connue'))).toBe(true);
  });
});

describe('construireAffichageProtocoles — sentinelles distinctes', () => {
  it('fichier absent (null) → sentinelle GLOBALE, distincte d’un protocole vide', () => {
    const a = construireAffichageProtocoles(null);
    expect(a.fichierAbsent).toBe(true);
    expect(a.sections).toHaveLength(0);
  });

  it('section attendue absente du fichier → sentinelle « manquante » PAR SOURCE', () => {
    const a = construireAffichageProtocoles(TEXTE, ORDRE_TEST);
    expect(a.fichierAbsent).toBe(false);
    const dila = a.sections.find((s) => s.cle === 'dila')!;
    expect(dila.present).toBe(false);
    expect(dila.present === false && dila.nom).toBe('DILA');
    // Les présentes restent présentes :
    expect(a.sections.find((s) => s.cle === 'cadastre')!.present).toBe(true);
    expect(a.sections.find((s) => s.cle === 'lidar')!.present).toBe(true);
  });

  it('respecte l’ordre fourni (sûr → risqué)', () => {
    const a = construireAffichageProtocoles(TEXTE, ORDRE_TEST);
    expect(a.sections.map((s) => s.cle)).toEqual(['cadastre', 'lidar', 'dila']);
  });
});
