import { describe, it, expect } from 'vitest';
import { compterMisesAJourActionnables, misesAJourSansProcedure, sourcesAvecProcedure } from './pastilleSources';
import { construireEtatSources, type LectureSource, type LectureDetection } from './sourcesFraicheur';
import { construireAffichageProtocoles } from './protocolesReingestion';

/**
 * FRAÎCHEUR / F7 — logique PURE de la pastille. Couvre : compte nominal ; source (c) détectée périmée EXCLUE du compte mais
 * présente dans le regroupement dédié ; compte à zéro ; protocoles illisibles → null (jamais « 0 »). Le classement (a)/(b)/(c)
 * vient du parseur de protocoles (≥ 1 bloc de commande), jamais d'une liste en dur.
 */

const MAINTENANT = new Date('2026-08-23T09:00:00Z');
const D = (o: Partial<LectureDetection>): LectureDetection =>
  ({ source: 'x', actif: true, verifieLe: '2026-08-22T09:00:00Z', succes: true, dernierSuccesLe: '2026-08-22T09:00:00Z', editionDistante: null, dateDistante: null, motif: null, ...o });

/** Trois sources périmées : dila (a), prada (a), bdtopo_adresse (c) — via les mêmes builders que l'écran. */
function lignes() {
  const lectures: LectureSource[] = [
    { cle: 'bdtopo_adresse', millesime: null, substitut: 'dernière modif 2026-03-20', dateReference: '2026-03-20', vide: false },
    { cle: 'dila', millesime: '2026-08-03', substitut: null, dateReference: '2026-08-03', vide: false },
    { cle: 'prada', millesime: '2026-07', substitut: null, dateReference: '2026-07-01', vide: false },
  ];
  const detections: LectureDetection[] = [
    D({ source: 'bdtopo_adresse', editionDistante: '2026-06-15', dateDistante: '2026-06-15' }),
    D({ source: 'dila', editionDistante: '2026-08-21', dateDistante: '2026-08-21' }),
    D({ source: 'prada', editionDistante: '2026-08', dateDistante: '2026-08-01' }),
  ];
  return construireEtatSources(lectures, MAINTENANT, detections);
}

/** Protocoles : dila + prada ont un bloc de commande (a) ; bdtopo_adresse n'en a pas (c). */
const PROTOS = [
  '<!-- SOURCE: dila -->', '## DILA', 'CAS (a).', '```bash', 'npm run dila:ingest', '```',
  '<!-- SOURCE: prada -->', '## PRADA', 'CAS (a).', '```bash', 'npm run prada:ingest', '```',
  '<!-- SOURCE: bdtopo_adresse -->', '## BD TOPO adresse', 'CAS (c) aucune procédure connue.',
].join('\n');
const ORDRE = [{ cle: 'dila', nom: 'DILA' }, { cle: 'prada', nom: 'PRADA' }, { cle: 'bdtopo_adresse', nom: 'BD TOPO adresse / BAN' }];
const proto = () => construireAffichageProtocoles(PROTOS, ORDRE);

describe('sourcesAvecProcedure — dérivée du parseur (≥ 1 bloc de commande)', () => {
  it('dila/prada (avec commande) ont une procédure ; bdtopo_adresse (sans) non', () => {
    const s = sourcesAvecProcedure(proto());
    expect(s.has('dila')).toBe(true);
    expect(s.has('prada')).toBe(true);
    expect(s.has('bdtopo_adresse')).toBe(false);
  });
});

describe('compterMisesAJourActionnables', () => {
  it('compte NOMINAL : deux sources (a) périmées → 2 ; la (c) périmée n’y entre pas', () => {
    expect(compterMisesAJourActionnables(lignes(), proto())).toBe(2);
  });

  it('source (c) détectée périmée → EXCLUE du compte MAIS présente dans le regroupement dédié', () => {
    const sansProc = misesAJourSansProcedure(lignes(), proto());
    expect(sansProc.map((l) => l.cle)).toEqual(['bdtopo_adresse']);
    // et elle n'a pas gonflé le compte :
    expect(compterMisesAJourActionnables(lignes(), proto())).toBe(2);
  });

  it('compte à ZÉRO : aucune source périmée → 0 (le rendu n’affichera aucune pastille)', () => {
    const lectures: LectureSource[] = [{ cle: 'dila', millesime: '2026-08-21', substitut: null, dateReference: '2026-08-21', vide: false }];
    const detections: LectureDetection[] = [D({ source: 'dila', editionDistante: '2026-08-21', dateDistante: '2026-08-21' })]; // à jour
    const l = construireEtatSources(lectures, MAINTENANT, detections);
    expect(compterMisesAJourActionnables(l, proto())).toBe(0);
  });

  it('protocoles ILLISIBLES (fichier absent) → null, JAMAIS 0 (mesure en échec ≠ absence de mise à jour)', () => {
    expect(compterMisesAJourActionnables(lignes(), construireAffichageProtocoles(null))).toBeNull();
  });
});
