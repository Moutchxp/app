import { describe, it, expect, afterEach } from 'vitest';
import { urlDila, DILA_URL_DEFAUT } from './dilaIngest';

/**
 * S30 — l'ingestion DILA lit l'URL depuis la BASE (config_veille.dila_url), pas d'une constante en dur. `importerAnnuaireDila`
 * charge `chargerConfigVeille()` puis appelle `urlDila(config)` : on verrouille ici la RÉSOLUTION (la base fait foi, l'env
 * n'est qu'un secours). Preuve du point D sans réseau ni DB.
 */
const sauv = process.env.DILA_URL;
afterEach(() => { if (sauv === undefined) delete process.env.DILA_URL; else process.env.DILA_URL = sauv; });

describe('S30 — urlDila : la BASE fait foi ; $DILA_URL n’est qu’un secours', () => {
  it('config.dilaUrl (base) PRIME, même si $DILA_URL est défini', () => {
    process.env.DILA_URL = 'https://env.example/override';
    expect(urlDila({ dilaUrl: 'https://base.example/annuaire' })).toBe('https://base.example/annuaire');
  });

  it('base vide → secours $DILA_URL', () => {
    process.env.DILA_URL = 'https://env.example/secours';
    expect(urlDila({ dilaUrl: '   ' })).toBe('https://env.example/secours');
  });

  it('base vide ET pas d’env → repli ultime DILA_URL_DEFAUT', () => {
    delete process.env.DILA_URL;
    expect(urlDila({ dilaUrl: '' })).toBe(DILA_URL_DEFAUT);
  });
});
