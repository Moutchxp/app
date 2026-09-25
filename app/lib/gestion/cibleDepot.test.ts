import { describe, it, expect, vi } from 'vitest';
import { MIME_DOSSIER, type DossierDetail, type LecteurDossier } from './drive';
import {
  estRegroupement, refusRegroupement, verifierCibleDepot,
  RACINE_DRIVES_PARTAGES, RACINE_MON_DRIVE, RACINE_PARTAGES_AVEC_MOI,
} from './cibleDepot';

/**
 * LOT 5-PJ-D — LE DÉFAUT CONSTATÉ À L'ÉCRAN : « Drives partagés » et « Partagés avec moi » portaient un bouton
 * « Déposer ici ». Ce sont des REGROUPEMENTS, pas des dossiers. Retirer le bouton met l'écran d'accord avec la
 * réalité ; ces tests-ci tiennent l'autre moitié de la règle — le SERVEUR refuse, parce qu'une requête forgée, un
 * vieil onglet ou un appel rejoué arriveraient encore avec `svav:drives` dans le corps.
 */

const dossier = (id: string, nom = id): DossierDetail =>
  ({ id, nom, parents: [], driveId: null, mimeType: MIME_DOSSIER, corbeille: false });

function lecteur(table: Record<string, DossierDetail | { refus: string }>): { lire: LecteurDossier; appels: string[] } {
  const appels: string[] = [];
  const lire = vi.fn(async (id: string) => {
    appels.push(id);
    const v = table[id];
    if (v === undefined) return { ok: false as const, motif: 'Ce dossier n’existe plus dans le Drive.' };
    if ('refus' in v) return { ok: false as const, motif: v.refus };
    return { ok: true as const, valeur: v };
  });
  return { lire, appels };
}

describe('les deux regroupements ne sont pas des destinations', () => {
  it('ils sont reconnus comme tels, et eux seuls', () => {
    expect(estRegroupement(RACINE_DRIVES_PARTAGES)).toBe(true);
    expect(estRegroupement(RACINE_PARTAGES_AVEC_MOI)).toBe(true);
    expect(estRegroupement(RACINE_MON_DRIVE)).toBe(false);
    expect(estRegroupement('1a2b3c')).toBe(false);
  });

  it('le refus NOMME le regroupement et dit quoi faire — jamais « erreur 400 »', () => {
    expect(refusRegroupement(RACINE_DRIVES_PARTAGES)).toContain('Drives partagés');
    expect(refusRegroupement(RACINE_DRIVES_PARTAGES)).toContain('choisissez un dossier');
    expect(refusRegroupement(RACINE_PARTAGES_AVEC_MOI)).toContain('Partagés avec moi');
    expect(refusRegroupement('1a2b3c')).toBeNull();
  });

  it('un dépôt visant un regroupement est REFUSÉ, sans même interroger Google', async () => {
    const { lire, appels } = lecteur({});
    for (const id of [RACINE_DRIVES_PARTAGES, RACINE_PARTAGES_AVEC_MOI]) {
      const v = await verifierCibleDepot(id, lire);
      expect(v.ok).toBe(false);
      if (!v.ok) expect(v.motif).toContain('regroupement');
    }
    expect(appels).toHaveLength(0); // on ne demande pas à Google ce qu'on sait déjà
  });
});

describe('ce qui EST une destination valable', () => {
  it('« Mon Drive » est accepté sans aucune lecture : `root` est un alias que l’API résout elle-même', async () => {
    const { lire, appels } = lecteur({});
    expect(await verifierCibleDepot(RACINE_MON_DRIVE, lire)).toEqual({ ok: true });
    expect(appels).toHaveLength(0);
  });

  it('un dossier ordinaire est accepté', async () => {
    const { lire } = lecteur({ DOS: dossier('DOS', 'Dupont') });
    expect(await verifierCibleDepot('DOS', lire)).toEqual({ ok: true });
  });

  /**
   * LA RACINE D'UN DRIVE PARTAGÉ est, pour l'API, un dossier comme un autre (son identifiant est celui du Drive).
   * Aucun cas particulier n'est écrit pour elle : c'est la même vérification qui la couvre, et ce test le prouve.
   */
  it('la racine d’un Drive partagé est acceptée — c’est un dossier, et l’API le dit', async () => {
    const { lire } = lecteur({ DRV: { ...dossier('DRV', 'GESTION LOCATIVE'), driveId: 'DRV' } });
    expect(await verifierCibleDepot('DRV', lire)).toEqual({ ok: true });
  });
});

describe('ce qui ne l’est PAS', () => {
  it('une cible vide est refusée', async () => {
    const { lire } = lecteur({});
    const v = await verifierCibleDepot('   ', lire);
    expect(v.ok).toBe(false);
  });

  it('un FICHIER est refusé : on choisit une destination, un fichier n’en est pas une', async () => {
    const { lire } = lecteur({ F: { ...dossier('F', 'bail.pdf'), mimeType: 'application/pdf' } });
    const v = await verifierCibleDepot('F', lire);
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.motif).toContain('n’est pas un dossier');
  });

  it('un dossier à la corbeille est refusé : déposer dedans reviendrait à jeter le document', async () => {
    const { lire } = lecteur({ C: { ...dossier('C'), corbeille: true } });
    const v = await verifierCibleDepot('C', lire);
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.motif).toContain('corbeille');
  });

  it('un dossier disparu est refusé, avec le motif rendu par Google', async () => {
    const { lire } = lecteur({});
    const v = await verifierCibleDepot('PERDU', lire);
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.motif).toContain('n’existe plus');
  });
});
