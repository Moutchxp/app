import { describe, it, expect, vi } from 'vitest';
import { pageExclueRgpd, verdictDepuisReponse, executerReperagePlanches, PROMPT_PLANCHE, type LecteurPlanches } from './reperePlanches';

/** LOT 62 — repérage des planches par image : logique PURE (filtre RGPD, normalisation du verdict, orchestration). AUCUN appel API. */

describe('pageExclueRgpd — pré-filtre RGPD par page, EN ABSTENTION', () => {
  it('écarte au moindre signal de donnée personnelle (e-mail, téléphone, signature, naissance, civilité+nom)', () => {
    expect(pageExclueRgpd('contact : jean.dupont@mairie.fr').exclue).toBe(true);
    expect(pageExclueRgpd('Téléphone : 06 19 98 05 75').exclue).toBe(true);
    expect(pageExclueRgpd('Signature numérique de X').exclue).toBe(true);
    expect(pageExclueRgpd('né le 3 mai 1980').exclue).toBe(true);
    expect(pageExclueRgpd('en présence de Monsieur Dupont').exclue).toBe(true);
  });
  it('écarte un cartouche émetteur (rédaction/vérification/validation) nommant des personnes', () => {
    const e = pageExclueRgpd('Date | Indice | Suivi | Rédaction J.TRESCARTES | Vérification H.NAULIN | Validation C.RICHARDSON');
    expect(e.exclue).toBe(true);
    expect(e.motif).toMatch(/cartouche émetteur/i);
  });
  it('page SANS texte → abstention (invérifiable), on n’envoie pas', () => {
    expect(pageExclueRgpd('').exclue).toBe(true);
    expect(pageExclueRgpd('   ').motif).toMatch(/sans texte/i);
  });
  it('une adresse de PROJET ou une référence cadastrale n’est PAS un signal (localise le projet, pas une personne)', () => {
    expect(pageExclueRgpd('Plan de masse — 1 Rue Ferragus, 93300 Aubervilliers. Parcelles Z1, Z2, AB157.').exclue).toBe(false);
    expect(pageExclueRgpd('COMPOSANTES DE L’ENSEMBLE IMMOBILIER — le socle commercial en rez-de-chaussée.').exclue).toBe(false);
  });
});

describe('verdictDepuisReponse — normalise en un verdict SÛR, jamais une valeur inventée', () => {
  it('oui/plan reconnu ; oui sans catégorie → plan', () => {
    expect(verdictDepuisReponse({ planche: 'oui', categorie: 'facade' })).toEqual({ verdict: 'oui', categorie: 'facade' });
    expect(verdictDepuisReponse({ planche: 'oui' })).toEqual({ verdict: 'oui', categorie: 'plan' });
  });
  it('non → aucune ; réponse inexploitable → incertain/aucune', () => {
    expect(verdictDepuisReponse({ planche: 'non', categorie: 'plan' })).toEqual({ verdict: 'non', categorie: 'aucune' });
    expect(verdictDepuisReponse({})).toEqual({ verdict: 'incertain', categorie: 'aucune' });
    expect(verdictDepuisReponse({ planche: 'bidon' })).toEqual({ verdict: 'incertain', categorie: 'aucune' });
  });
});

describe('executerReperagePlanches — RGPD écarte AVANT tout envoi ; PRÉSENCE seulement', () => {
  const lecteur = (rep: Record<number, Record<string, unknown>>, spyVision?: (img: string, prompt: string) => void): LecteurPlanches => {
    let appel = 0;
    return {
      rasteriser: (_pdf, page) => `IMG_p${page}`,
      vision: async (img, prompt) => { spyVision?.(img, prompt); appel += 1; const pages = Object.keys(rep).map(Number).sort((a, b) => a - b); return rep[pages[appel - 1]] ?? {}; },
    };
  };

  it('écarte la page à donnée personnelle, envoie les autres, et ne rend QUE {page,verdict,categorie}', async () => {
    // p1 = cartouche émetteur (écartée) ; p2 = plan (oui) ; p3 = prose (non).
    const textes = [
      'Rédaction J.X | Vérification H.Y | Validation C.Z',
      'PLAN DE MASSE des constructions',
      'Présentation des enjeux du projet, en prose.',
    ];
    const visionParPage: Record<number, Record<string, unknown>> = { 2: { planche: 'oui', categorie: 'plan' }, 3: { planche: 'non', categorie: 'aucune' } };
    const spy = vi.fn();
    // le lecteur répond dans l'ORDRE des pages envoyées (p2 puis p3)
    const lect: LecteurPlanches = { rasteriser: (_p, page) => `IMG${page}`, vision: async (img, prompt) => { spy(img, prompt); return img === 'IMG2' ? visionParPage[2] : visionParPage[3]; } };
    const r = await executerReperagePlanches({ textesPages: async () => textes, pdf: async () => Buffer.from('PDF'), lecteur: lect });

    expect(r.pagesEnvoyees).toEqual([2, 3]);                                   // p1 écartée
    expect(r.pagesEcartees).toEqual([{ page: 1, motif: expect.stringMatching(/cartouche émetteur/i) }]);
    expect(spy).toHaveBeenCalledTimes(2);                                       // la page écartée n'est JAMAIS envoyée
    expect(spy).toHaveBeenCalledWith(expect.any(String), PROMPT_PLANCHE);       // question FERMÉE, la même pour toutes
    expect(r.verdicts).toEqual([
      { page: 2, verdict: 'oui', categorie: 'plan' },
      { page: 3, verdict: 'non', categorie: 'aucune' },
    ]);
    // PRÉSENCE seulement : aucune clé de CONTENU (cote, altitude, valeur…) ne sort du repérage.
    for (const v of r.verdicts) expect(Object.keys(v).sort()).toEqual(['categorie', 'page', 'verdict']);
    void lecteur; // (helper conservé pour lisibilité)
  });

  it('toutes les pages écartées (aucun texte) → aucun envoi réseau', async () => {
    const spy = vi.fn();
    const lect: LecteurPlanches = { rasteriser: () => 'X', vision: async (img, prompt) => { spy(img, prompt); return {}; } };
    const r = await executerReperagePlanches({ textesPages: async () => ['', '  '], pdf: async () => Buffer.from('x'), lecteur: lect });
    expect(spy).not.toHaveBeenCalled();
    expect(r.pagesEnvoyees).toEqual([]);
    expect(r.pagesEcartees.map((e) => e.page)).toEqual([1, 2]);
    expect(r.verdicts).toEqual([]);
  });
});
