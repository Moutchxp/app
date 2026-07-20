import { describe, it, expect, vi } from 'vitest';
import { choixDepuisRatio, brancherChoix, orchestrerIllimite, LONGUEUR_MIN_MDP } from './choixOffre';

const MDP_OK = 'motdepasse-solide-1'; // ≥ 12

describe('choixDepuisRatio — le slider ne valide qu’à fond', () => {
  it('centre / faible amplitude → null (neutre, curseur revient au centre)', () => {
    expect(choixDepuisRatio(0)).toBeNull();
    expect(choixDepuisRatio(-0.5)).toBeNull();
    expect(choixDepuisRatio(0.5)).toBeNull();
  });
  it('à fond à GAUCHE → unique ; à fond à DROITE → illimité', () => {
    expect(choixDepuisRatio(-1)).toBe('unique');
    expect(choixDepuisRatio(1)).toBe('illimite');
    expect(choixDepuisRatio(-0.95)).toBe('unique');
    expect(choixDepuisRatio(0.95)).toBe('illimite');
  });
});

describe('brancherChoix — câblage gauche→unique / droite→illimité', () => {
  it('unique → surUnique (jamais surIllimite)', () => {
    const surUnique = vi.fn();
    const surIllimite = vi.fn();
    brancherChoix('unique', { surUnique, surIllimite });
    expect(surUnique).toHaveBeenCalledTimes(1);
    expect(surIllimite).not.toHaveBeenCalled();
  });
  it('illimite → surIllimite (jamais surUnique)', () => {
    const surUnique = vi.fn();
    const surIllimite = vi.fn();
    brancherChoix('illimite', { surUnique, surIllimite });
    expect(surIllimite).toHaveBeenCalledTimes(1);
    expect(surUnique).not.toHaveBeenCalled();
  });
});

describe('orchestrerIllimite — compte AVANT émission, sans consentement, PDF pour tous', () => {
  it('(b)(c) succès → crée le compte AVANT d’émettre, avec { jeton, motDePasse } SEULEMENT', async () => {
    const ordre: string[] = [];
    const creerCompte = vi.fn(async () => {
      ordre.push('creer');
      return { ok: true, status: 200 };
    });
    const emettre = vi.fn(() => {
      ordre.push('emettre');
    });
    const r = await orchestrerIllimite({ jeton: 'JETON', motDePasse: MDP_OK, creerCompte, emettre });

    expect(r).toEqual({ statut: 'compte_cree' });
    expect(ordre).toEqual(['creer', 'emettre']); // création AVANT émission (ordre garanti)
    expect(creerCompte).toHaveBeenCalledWith('JETON', MDP_OK); // aucun consentement : uniquement jeton + mot de passe
    expect(emettre).toHaveBeenCalledTimes(1);
  });

  it('mot de passe < 12 → refus AVANT tout appel, AUCUNE émission (l’internaute corrige)', async () => {
    const creerCompte = vi.fn();
    const emettre = vi.fn();
    const r = await orchestrerIllimite({ jeton: 'JETON', motDePasse: 'court', creerCompte, emettre });
    expect(r.statut).toBe('mot_de_passe_invalide');
    if (r.statut === 'mot_de_passe_invalide') expect(r.erreurs[0]).toContain(String(LONGUEUR_MIN_MDP));
    expect(creerCompte).not.toHaveBeenCalled();
    expect(emettre).not.toHaveBeenCalled();
  });

  it('serveur 422 (politique) → mot_de_passe_invalide, PAS d’émission', async () => {
    const creerCompte = vi.fn(async () => ({ ok: false, status: 422, erreurs: ['Le mot de passe est trop simple.'] }));
    const emettre = vi.fn();
    const r = await orchestrerIllimite({ jeton: 'JETON', motDePasse: MDP_OK, creerCompte, emettre });
    expect(r).toEqual({ statut: 'mot_de_passe_invalide', erreurs: ['Le mot de passe est trop simple.'] });
    expect(emettre).not.toHaveBeenCalled();
  });

  it('jeton absent (email pré-existant) → compte impossible MAIS certificat émis (PDF pour tous)', async () => {
    const creerCompte = vi.fn();
    const emettre = vi.fn();
    const r = await orchestrerIllimite({ jeton: null, motDePasse: MDP_OK, creerCompte, emettre });
    expect(r).toEqual({ statut: 'compte_indisponible' });
    expect(creerCompte).not.toHaveBeenCalled();
    expect(emettre).toHaveBeenCalledTimes(1); // le certificat reste dû
  });

  it('échec non-422 (401/404/503/réseau=status 0) → certificat émis quand même (PDF pour tous)', async () => {
    for (const status of [401, 404, 503, 0]) {
      const creerCompte = vi.fn(async () => ({ ok: false, status }));
      const emettre = vi.fn();
      const r = await orchestrerIllimite({ jeton: 'JETON', motDePasse: MDP_OK, creerCompte, emettre });
      expect(r).toEqual({ statut: 'compte_indisponible' });
      expect(emettre).toHaveBeenCalledTimes(1);
    }
  });

  it('CORRECTIF émission ATTENDUE : orchestrerIllimite ne résout qu’APRÈS la fin de emettre() (plus de fire-and-forget)', async () => {
    let emisTermine = false;
    const emettre = vi.fn(async () => {
      await Promise.resolve();
      emisTermine = true;
    });
    const creerCompte = vi.fn(async () => ({ ok: true, status: 200 }));
    const r = await orchestrerIllimite({ jeton: 'JETON', motDePasse: MDP_OK, creerCompte, emettre });
    expect(r).toEqual({ statut: 'compte_cree' });
    expect(emisTermine).toBe(true); // l'émission est TERMINÉE quand orchestrerIllimite rend la main
  });

  it('CORRECTIF aiguillage — 422 COORDONNÉES (motif coordonnees) → certificat émis (PDF pour tous), statut DISTINCT du mot de passe', async () => {
    const creerCompte = vi.fn(async () => ({ ok: false, status: 422, motif: 'coordonnees' as const }));
    const emettre = vi.fn();
    const r = await orchestrerIllimite({ jeton: 'JETON', motDePasse: MDP_OK, creerCompte, emettre });
    expect(r).toEqual({ statut: 'coordonnees_incompletes' });
    expect(emettre).toHaveBeenCalledTimes(1); // le certificat reste dû
  });

  it('CORRECTIF aiguillage — 422 MOT DE PASSE (motif mot_de_passe) → PAS d’émission (l’internaute corrige)', async () => {
    const creerCompte = vi.fn(async () => ({ ok: false, status: 422, erreurs: ['trop simple'], motif: 'mot_de_passe' as const }));
    const emettre = vi.fn();
    const r = await orchestrerIllimite({ jeton: 'JETON', motDePasse: MDP_OK, creerCompte, emettre });
    expect(r).toEqual({ statut: 'mot_de_passe_invalide', erreurs: ['trop simple'] });
    expect(emettre).not.toHaveBeenCalled();
  });
});
