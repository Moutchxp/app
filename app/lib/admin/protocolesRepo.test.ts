import { describe, it, expect, vi } from 'vitest';
import { lireFichierProtocoles, CHEMIN_PROTOCOLES } from './protocolesRepo';

/**
 * FRAÎCHEUR / F5 — lecture du fichier de protocoles. On teste le COMPORTEMENT (contenu renvoyé tel quel ; échec → null +
 * log, pas de catch muet) via un lecteur injecté, sans toucher au disque.
 */

describe('lireFichierProtocoles', () => {
  it('renvoie le contenu du fichier tel quel, et vise bien docs/PROTOCOLES_REINGESTION.md', async () => {
    let vu = '';
    const lecteur = async (chemin: string) => { vu = chemin; return '# Protocoles\n...'; };
    const txt = await lireFichierProtocoles(lecteur);
    expect(txt).toBe('# Protocoles\n...');
    expect(vu.endsWith(CHEMIN_PROTOCOLES)).toBe(true);
  });

  it('fichier absent / illisible → null (jamais une chaîne vide silencieuse) + erreur journalisée', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    const lecteur = async () => { throw new Error('ENOENT: fichier introuvable'); };
    const txt = await lireFichierProtocoles(lecteur);
    expect(txt).toBeNull();
    expect(err).toHaveBeenCalled();
    err.mockRestore();
  });
});
