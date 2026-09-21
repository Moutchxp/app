import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { messageReleve, type ReponseReleve } from './useReleveBoite';

/**
 * R-Réponses — le bouton « Relever la boîte maintenant » de l'onglet Réponses réutilise EXACTEMENT la logique de Réglages (hook
 * partagé `useReleveBoite`, jamais une copie). Deux volets :
 *  1) `messageReleve` (PUR) : trois cas honnêtes et DISTINCTS — succès / échec de boîte / SESSION EXPIRÉE (401-403). C'est ici que
 *     se joue la dette « mensonge d'interface 401 » : une session expirée ne doit jamais s'afficher comme une panne de la boîte.
 *  2) Câblage (scan de source) : une SEULE implémentation de la relève (dans le hook), utilisée par les DEUX onglets ; le bouton de
 *     Réglages reste présent ; le bouton de Réponses est placé au-dessus de « État de la relève » et réservé aux administrateurs.
 */

const OK = (over: Partial<{ messagesLus: number; retenus: number; rattaches: number; enregistrees: number; depotsGed: number; echecsDepot: number }> = {}): ReponseReleve => ({
  resultat: 'ok',
  compteurs: { messagesLus: 4, retenus: 1, rattaches: 1, enregistrees: 1, depotsGed: 0, echecsDepot: 0, ...over },
});

describe('messageReleve — trois cas honnêtes et distincts', () => {
  it('SESSION EXPIRÉE (401) : message « reconnectez-vous », JAMAIS une panne de boîte, aucun rafraîchissement', () => {
    const r = messageReleve(401, null);
    expect(r.message.ton).toBe('erreur');
    expect(r.message.texte).toBe('Session expirée, reconnectez-vous.');
    expect(r.message.texte).not.toMatch(/boîte|relève a échoué|serveur/i); // n'accuse pas la boîte
    expect(r.succes).toBe(false);
  });

  it('SESSION EXPIRÉE (403 : compte révoqué) : même message que le 401 (source unique messageErreurCartouche)', () => {
    expect(messageReleve(403, null)).toEqual(messageReleve(401, null));
  });

  it('SUCCÈS (sans échec de dépôt) : compteurs en clair, texte IDENTIQUE à l’ancien message de Réglages, rafraîchissement demandé', () => {
    const r = messageReleve(200, OK({ messagesLus: 4, rattaches: 1, enregistrees: 1, depotsGed: 0 }));
    expect(r.message.ton).toBe('ok');
    expect(r.message.texte).toBe('Relève terminée : 4 message(s) lu(s), 1 rattaché(s), 1 enregistré(s), 0 pièce(s) versée(s) en GED.');
    expect(r.succes).toBe(true); // seul le succès rafraîchit l'écran Réponses
  });

  it('SUCCÈS avec pièces non versées : suffixe « voir les archives » (jamais un échec silencieux), toujours un succès', () => {
    const r = messageReleve(200, OK({ depotsGed: 3, echecsDepot: 2 }));
    expect(r.message.ton).toBe('ok');
    expect(r.message.texte).toContain('3 pièce(s) versée(s) en GED — 2 pièce(s) non versée(s) (voir les archives).');
    expect(r.succes).toBe(true);
  });

  it('BOÎTE INACTIVE (aucune boîte configurée) : info, pas une erreur, aucun rafraîchissement', () => {
    const r = messageReleve(200, { resultat: 'inactif', message: 'Aucune boîte configurée : rien à relever (ce n’est pas une erreur).' });
    expect(r.message.ton).toBe('info');
    expect(r.message.texte).toContain('Aucune boîte configurée');
    expect(r.succes).toBe(false);
  });

  it('ÉCHEC de la relève (connexion à la boîte / erreur serveur) : message d’échec du serveur, DISTINCT de la session expirée', () => {
    const r = messageReleve(200, { resultat: 'erreur', message: 'La relève a échoué : imap indisponible' });
    expect(r.message.ton).toBe('erreur');
    expect(r.message.texte).toBe('La relève a échoué : imap indisponible');
    expect(r.message.texte).not.toBe('Session expirée, reconnectez-vous.'); // ne se confond jamais avec l'expiration
    expect(r.succes).toBe(false);
    // 503 (erreur interne renvoyée par la route) suit le même chemin : erreur, jamais « session expirée ».
    expect(messageReleve(503, { resultat: 'erreur', message: 'Relève impossible : erreur interne du serveur.' }).message.ton).toBe('erreur');
  });
});

const lire = (nom: string) => readFileSync(fileURLToPath(new URL(nom, import.meta.url)), 'utf8');

describe('câblage — une seule implémentation, partagée par les deux onglets', () => {
  const HOOK = lire('./useReleveBoite.ts');
  const REGLAGES = lire('./ReglagesVue.tsx');
  const REPONSES = lire('./ReponsesVue.tsx');
  const TUILE = lire('./PermisTuile.tsx');

  it('l’APPEL de relève (fetch POST) n’est écrit QUE dans le hook (jamais recopié dans une vue)', () => {
    expect(HOOK).toContain("fetch('/api/admin/permis/relever', { method: 'POST' })");
    // On cible l'APPEL `fetch(...)`, pas la simple mention du chemin (qui figure légitimement dans les commentaires d'aiguillage).
    expect(REGLAGES).not.toContain("fetch('/api/admin/permis/relever'"); // Réglages ne poste plus lui-même : il passe par le hook
    expect(REPONSES).not.toContain("fetch('/api/admin/permis/relever'"); // Réponses non plus
  });

  it('les DEUX onglets utilisent le hook partagé useReleveBoite', () => {
    expect(REGLAGES).toContain('useReleveBoite');
    expect(REPONSES).toContain('useReleveBoite');
  });

  it('le bouton de Réglages reste présent et inchangé (même libellé, plus aucune copie du handler)', () => {
    expect(REGLAGES).toContain('Relever la boîte maintenant');
    expect(REGLAGES).not.toContain('async function releverBoiteMaintenant'); // handler retiré : la logique vit dans le hook
  });

  it('le bouton de Réponses est réservé aux administrateurs et placé AU-DESSUS de « État de la relève »', () => {
    expect(REPONSES).toContain('<BoutonReleverBoite estAdministrateur={estAdministrateur}');
    expect(REPONSES.indexOf('<BoutonReleverBoite')).toBeLessThan(REPONSES.indexOf('<BlocEtatReleve')); // ordre de rendu : bouton d'abord
    expect(TUILE).toContain('estAdministrateur={estAdministrateur}'); // le drapeau admin est bien threadé jusqu'à ReponsesVue
  });

  it('après un succès, l’onglet Réponses se rafraîchit sans recharger la page (rafraichir + pastille)', () => {
    expect(REPONSES).toContain('const apresReleve = useCallback(() => { rafraichir(); onRecompter?.(); }');
    expect(REPONSES).toContain('useReleveBoite(apresReleve)');
  });
});
