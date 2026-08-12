import { describe, it, expect, vi } from 'vitest';

// db/client mocké : l'agrégateur reçoit ses lectures par INJECTION (test node-pur), aucune vraie requête.
vi.mock('../db/client', () => ({ query: vi.fn(), withTransaction: vi.fn() }));

import { chargerSuiviSaisines, RAISON_INDETERMINEE, type DepsSuiviSaisines, type LigneSaisineDB } from './saisinesSuivi';
import type { DemandeSaisissable, SaisiesEligibles } from './saisineCadaRepo';

const SAIS = (over: Partial<DemandeSaisissable> = {}): DemandeSaisissable => ({
  demandeId: 42, reference: 'SVAV-DEM-2026-000042', communeNom: 'Asnières-sur-Seine', profil: 'entreprise',
  envoyeLe: new Date('2026-03-14T10:00:00Z'), refusTaciteLe: new Date('2026-04-14T10:00:00Z'), forclusionLe: new Date('2026-06-14T10:00:00Z'),
  joursAvantForclusion: 30, dossiersActifs: 3, dossiersDus: 2, voie: 'refus_tacite', dossiersExclusRefusNonAcquis: 0, ...over,
});
const LIGNE = (over: Partial<LigneSaisineDB> = {}): LigneSaisineDB => ({
  saisine_id: 1, demande_id: 42, reference: 'SVAV-DEM-2026-000042', commune_nom: 'Asnières-sur-Seine',
  statut: 'brouillon', generee_le: '2026-05-01T09:00:00Z', envoyee_le: null, objet: 'Saisine', corps: 'CORPS',
  avis_recu_le: null, avis_sens: null, ...over,
});

function deps(over: Partial<DepsSuiviSaisines> = {}): DepsSuiviSaisines {
  return {
    eligibles: async (): Promise<SaisiesEligibles> => ({ saisissables: [], indeterminees: [] }),
    lignes: async () => [],
    cadaEmail: async () => 'cada@cada.fr',
    urlFormulaire: async () => 'https://www.cada.fr/formulaire-de-saisine',
    ...over,
  };
}

describe('X4 — chargerSuiviSaisines : classification des saisines par statut/avis', () => {
  it('brouillon → file de dépôt (corps inclus, pour copie) ; envoyee sans avis → en cours ; avec avis → reçue ; abandonnee → abandonnée', async () => {
    const data = await chargerSuiviSaisines(deps({
      lignes: async () => [
        LIGNE({ saisine_id: 1, statut: 'brouillon', corps: 'CORPS-BROUILLON' }),
        LIGNE({ saisine_id: 2, statut: 'envoyee', envoyee_le: '2026-05-10T09:00:00Z', avis_recu_le: null }),
        LIGNE({ saisine_id: 3, statut: 'envoyee', envoyee_le: '2026-05-10T09:00:00Z', avis_recu_le: '2026-06-01T09:00:00Z', avis_sens: 'favorable' }),
        LIGNE({ saisine_id: 4, statut: 'abandonnee' }),
      ],
    }));
    expect(data.fileADeposer.map((x) => x.saisineId)).toEqual([1]);
    expect(data.fileADeposer[0].corps).toBe('CORPS-BROUILLON');
    expect(data.enCours.map((x) => x.saisineId)).toEqual([2]);
    expect(data.recues.map((x) => x.saisineId)).toEqual([3]);
    expect(data.recues[0].avisSens).toBe('favorable');
    expect(data.abandonnees.map((x) => x.saisineId)).toEqual([4]);
  });

  it('saisissables + indéterminées viennent de lireSaisinesEligibles ; dates → ISO ; indéterminée porte la RAISON', async () => {
    const data = await chargerSuiviSaisines(deps({
      eligibles: async () => ({ saisissables: [SAIS({ demandeId: 42 })], indeterminees: [SAIS({ demandeId: 43 })] }),
    }));
    expect(data.saisissables).toHaveLength(1);
    expect(data.saisissables[0]).toMatchObject({ demandeId: 42, joursAvantForclusion: 30, dossiersDus: 2 });
    expect(data.saisissables[0].envoyeLe).toBe('2026-03-14T10:00:00.000Z');   // Date → ISO
    expect(data.saisissables[0].forclusionLe).toBe('2026-06-14T10:00:00.000Z');
    expect(data.indeterminees[0].raison).toBe(RAISON_INDETERMINEE);
  });

  it('cadaEmailVide = true seulement si l’adresse CADA est vide (espaces compris)', async () => {
    expect((await chargerSuiviSaisines(deps({ cadaEmail: async () => '' }))).cadaEmailVide).toBe(true);
    expect((await chargerSuiviSaisines(deps({ cadaEmail: async () => '  ' }))).cadaEmailVide).toBe(true);
    expect((await chargerSuiviSaisines(deps({ cadaEmail: async () => 'cada@cada.fr' }))).cadaEmailVide).toBe(false);
  });
});
