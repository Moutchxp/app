import { describe, it, expect, vi } from 'vitest';

/**
 * M5-fix — SOURCE du bug. `permis_empreinte.dossier_id` est un `bigint` : le pilote `pg` le renvoie en CHAÎNE. `LigneSuivi.dossierId`
 * est typé `number` — le type MENTAIT. Ce dossierId alimente `ouvert`, relayé tel quel au POST, qui exigeait un `number`. On mocke
 * `query` pour rendre un dossier_id EN CHAÎNE (comme pg) et on prouve que `listerSuivi` honore son type : dossierId revient en NOMBRE.
 */
vi.mock('../db/client', () => ({
  query: async () => ({
    rows: [{
      dossier_id: '11430', // ← pg renvoie le bigint en chaîne
      num_dau: '07512024V0037', code_insee: '75112', commune: 'Paris', type: 'PC', adresse: null, nature: null,
      ratt_etat: null, verdict: null, jours: 0, reevalue: null, date_autorisation: null, date_declenchement: null,
    }],
  }),
  pool: {}, closePool: async () => undefined,
}));

import { listerSuivi } from './rattachementSuiviRepo';

describe('M5-fix — listerSuivi : dossierId (bigint pg → chaîne) est honoré en NOMBRE', () => {
  it('un dossier_id renvoyé en chaîne par pg devient un dossierId numérique', async () => {
    const { lignes } = await listerSuivi();
    expect(lignes).toHaveLength(1);
    expect(lignes[0].dossierId).toBe(11430);
    expect(typeof lignes[0].dossierId).toBe('number'); // le contrat sur lequel le POST s'appuie
  });
});
