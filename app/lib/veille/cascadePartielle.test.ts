import { describe, it, expect } from 'vitest';
import { etapeCascadePartielle, texteRelancePartielle, texteAnnonceCada, type EntreeCascadePartielle } from './cascadePartielle';

const J = new Date('2026-05-01T00:00:00Z');           // première réclamation (partiel_le)
const BUTOIR = new Date('2026-06-05T00:00:00Z');       // CASC-2 : J + 1 mois + 4 j (01/05 → 01/06 → 05/06)
const REGLAGES = { relanceJours: 10, nbRelancesAvantAnnonce: 2, annonceJours: 10, saisineJours: 4 };
const base = (over: Partial<EntreeCascadePartielle> = {}): EntreeCascadePartielle =>
  ({ premiereReclamation: J, relancesEnvoyees: 0, annonceEnvoyee: false, aujourdhui: J, butoirCasc2: BUTOIR, reglages: REGLAGES, ...over });
const jour = (iso: string) => new Date(`${iso}T12:00:00Z`);

describe('CASC-3 — etapeCascadePartielle (moteur pur)', () => {
  it('J+10 après la 1re réclamation → relance 1 due', () => {
    const r = etapeCascadePartielle(base({ aujourdhui: jour('2026-05-11') }));
    expect(r).toMatchObject({ etape: 'relance', rang: 1 });
    expect(r.dateDue?.toISOString().slice(0, 10)).toBe('2026-05-11');
  });

  it('avant J+10 → aucune, prochaine = date de la relance 1', () => {
    const r = etapeCascadePartielle(base({ aujourdhui: jour('2026-05-05') }));
    expect(r.etape).toBe('aucune');
    expect(r.prochaineDate?.toISOString().slice(0, 10)).toBe('2026-05-11');
  });

  it('AUTO-PARTIEL — le BUTOIR CADA (annonce + saisine) est ANCRÉ à partiel_le : INCHANGÉ quel que soit le nombre de relances envoyées', () => {
    // annonce : sa date ne dépend QUE de partiel_le + config (jamais du compteur de relances) — over-count compris.
    const annonce2 = etapeCascadePartielle(base({ relancesEnvoyees: 2, aujourdhui: jour('2026-06-30') }));
    const annonce9 = etapeCascadePartielle(base({ relancesEnvoyees: 9, aujourdhui: jour('2026-06-30') }));
    expect(annonce2.etape).toBe('annonce');
    expect(annonce9.dateDue?.toISOString()).toBe(annonce2.dateDue?.toISOString()); // même date d'annonce
    // saisine proposable (relances faites + annonce envoyée) : max(annonce+saisineJours, butoir CASC-2) — identique quel que soit le sur-comptage.
    const sai2 = etapeCascadePartielle(base({ relancesEnvoyees: 2, annonceEnvoyee: true, aujourdhui: jour('2026-12-31') }));
    const sai7 = etapeCascadePartielle(base({ relancesEnvoyees: 7, annonceEnvoyee: true, aujourdhui: jour('2026-12-31') }));
    expect(sai2.etape).toBe('saisine_proposable');
    expect(sai7.dateDue?.toISOString()).toBe(sai2.dateDue?.toISOString()); // butoir CADA identique
  });

  it('J+20 avec relance 1 déjà envoyée → relance 2 due', () => {
    const r = etapeCascadePartielle(base({ relancesEnvoyees: 1, aujourdhui: jour('2026-05-21') }));
    expect(r).toMatchObject({ etape: 'relance', rang: 2 });
    expect(r.dateDue?.toISOString().slice(0, 10)).toBe('2026-05-21');
  });

  it('J+30 avec les 2 relances envoyées → annonce CADA due', () => {
    const r = etapeCascadePartielle(base({ relancesEnvoyees: 2, aujourdhui: jour('2026-05-31') }));
    expect(r.etape).toBe('annonce');
    expect(r.dateDue?.toISOString().slice(0, 10)).toBe('2026-05-31');
  });

  it('après l’annonce, saisine proposable = la PLUS TARDIVE de (annonce+4j) et du butoir CASC-2', () => {
    // annonce = 31/05, +4 = 04/06 ; butoir CASC-2 = 05/06 → on retient 05/06 (jamais avant le butoir)
    const avant = etapeCascadePartielle(base({ relancesEnvoyees: 2, annonceEnvoyee: true, aujourdhui: jour('2026-06-04') }));
    expect(avant.etape).toBe('aucune');
    expect(avant.prochaineDate?.toISOString().slice(0, 10)).toBe('2026-06-05');
    const apres = etapeCascadePartielle(base({ relancesEnvoyees: 2, annonceEnvoyee: true, aujourdhui: jour('2026-06-05') }));
    expect(apres.etape).toBe('saisine_proposable');
    expect(apres.dateDue?.toISOString().slice(0, 10)).toBe('2026-06-05');
  });

  it('cascade AVANCÉE : chaque étape franchie n’est pas re-proposée (relances envoyées → on vise l’annonce)', () => {
    const r = etapeCascadePartielle(base({ relancesEnvoyees: 2, aujourdhui: jour('2026-05-25') })); // avant l'annonce
    expect(r.etape).toBe('aucune');
    expect(r.prochaineDate?.toISOString().slice(0, 10)).toBe('2026-05-31');
  });
});

describe('CASC-3 — générateurs de texte (purs, distincts)', () => {
  it('relance : ne cite QUE les pièces manquantes ACTUELLES (jamais la liste d’origine)', () => {
    const t = texteRelancePartielle(1, ['etage']); // masse/coupe déjà reçus entre-temps → non cités
    expect(t.corps).toContain('les plans des étages');
    expect(t.corps).not.toContain('plan de masse');
    expect(t.corps).not.toContain('plan de coupe');
    expect(t.objet.toLowerCase()).toContain('première relance');
  });

  it('relance rang 2 : libellé distinct de la rang 1', () => {
    expect(texteRelancePartielle(2, ['cerfa']).objet.toLowerCase()).toContain('deuxième relance');
  });

  it('annonce : factuelle, mentionne la CADA et la date proposable, jamais comminatoire', () => {
    const t = texteAnnonceCada(['cerfa'], new Date('2026-06-05T00:00:00Z'));
    expect(t.corps).toContain('CADA');
    expect(t.corps).toContain('05/06/2026');
    expect(t.corps).toContain('le formulaire Cerfa');
    expect(t.corps).not.toMatch(/mise en demeure|sommation|sous peine/i);
  });
});
