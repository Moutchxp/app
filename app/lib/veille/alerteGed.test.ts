import { describe, it, expect } from 'vitest';
import {
  expirationEffective, seuilAlerte, alertesDues, fenetreManquee, pieceEstLourde, dureeLienSigne,
  sujetAlerte, composerCorpsForward, SEUIL_PIECE_LOURDE_OCTETS, DUREE_LIEN_SIGNE_MIN_S,
} from './alerteGed';

const RECU = new Date('2026-08-10T13:24:00Z');
const iso = (d: Date) => d.toISOString();

describe('G1 — délai & seuils', () => {
  it('expirationEffective : l’expiration L1 si captée, sinon réception + 7 j', () => {
    expect(iso(expirationEffective(RECU, new Date('2026-08-17T13:24:00Z')))).toBe('2026-08-17T13:24:00.000Z');
    expect(iso(expirationEffective(RECU, null))).toBe('2026-08-17T13:24:00.000Z'); // 10 + 7
  });
  it('seuilAlerte : J-3 = expiration − 3 j ; 24 h = expiration − 24 h', () => {
    const exp = new Date('2026-08-17T13:24:00Z');
    expect(iso(seuilAlerte(exp, 'j3'))).toBe('2026-08-14T13:24:00.000Z');
    expect(iso(seuilAlerte(exp, 'h24'))).toBe('2026-08-16T13:24:00.000Z');
  });
});

describe('G1 — alertesDues : chaque seuil une fois, rattrapage marqué en retard, permis classé éteint le rebours', () => {
  const exp = new Date('2026-08-17T13:24:00Z');
  const base = { expiration: exp, classe: false, dejaEnvoyes: [] as ('j3' | 'h24')[] };

  it('avant le seuil J-3 → rien', () => {
    expect(alertesDues({ ...base, maintenant: new Date('2026-08-14T12:00:00Z') })).toEqual([]);
  });
  it('à J-3 (à l’heure, < 1 h) → j3 seul, PAS en retard', () => {
    const d = alertesDues({ ...base, maintenant: new Date('2026-08-14T13:30:00Z') });
    expect(d.map((x) => x.type)).toEqual(['j3']);
    expect(d[0].enRetard).toBe(false);
  });
  it('à 24 h, j3 déjà envoyé → h24 seul', () => {
    const d = alertesDues({ ...base, dejaEnvoyes: ['j3'], maintenant: new Date('2026-08-16T13:30:00Z') });
    expect(d.map((x) => x.type)).toEqual(['h24']);
  });
  it('INTERRUPTION longue : les deux seuils passés, rien envoyé → j3 ET h24, chacun EN RETARD', () => {
    const d = alertesDues({ ...base, maintenant: new Date('2026-08-16T20:00:00Z') }); // > seuil j3 (14) et > seuil h24 (16 13:24)
    expect(d.map((x) => x.type)).toEqual(['j3', 'h24']);
    expect(d.every((x) => x.enRetard)).toBe(true);
  });
  it('permis CLASSÉ → aucune alerte (rebours éteint)', () => {
    expect(alertesDues({ ...base, classe: true, maintenant: new Date('2026-08-16T20:00:00Z') })).toEqual([]);
  });
  it('après expiration → rien (fenêtre manquée, pas d’envoi inutile)', () => {
    expect(alertesDues({ ...base, maintenant: new Date('2026-08-18T00:00:00Z') })).toEqual([]);
  });
  it('fenetreManquee : expiré et non classé → true ; classé → false', () => {
    expect(fenetreManquee({ expiration: exp, classe: false, maintenant: new Date('2026-08-18T00:00:00Z') })).toBe(true);
    expect(fenetreManquee({ expiration: exp, classe: true, maintenant: new Date('2026-08-18T00:00:00Z') })).toBe(false);
  });
});

describe('G1 — pièces lourdes & durée du lien signé', () => {
  it('pieceEstLourde : > 20 Mo → true ; ≤ → false ; taille inconnue → false (on tente la pièce jointe)', () => {
    expect(pieceEstLourde(SEUIL_PIECE_LOURDE_OCTETS + 1)).toBe(true);
    expect(pieceEstLourde(SEUIL_PIECE_LOURDE_OCTETS)).toBe(false);
    expect(pieceEstLourde(null)).toBe(false);
  });
  it('dureeLienSigne : temps restant si > 72 h, sinon PLANCHER 72 h (le lien doit survivre à la lecture)', () => {
    const exp = new Date('2026-08-17T13:24:00Z');
    // à 100 h de l’expiration → le temps restant (> plancher)
    expect(dureeLienSigne(exp, new Date('2026-08-13T09:24:00Z'))).toBe(100 * 3600);
    // à 24 h → sous le plancher → 72 h ; à 1 h → 72 h. Aux seuils d’envoi (≤ J-3 = 72 h) le plancher domine toujours.
    expect(dureeLienSigne(exp, new Date('2026-08-16T13:24:00Z'))).toBe(DUREE_LIEN_SIGNE_MIN_S);
    expect(dureeLienSigne(exp, new Date('2026-08-17T12:24:00Z'))).toBe(DUREE_LIEN_SIGNE_MIN_S);
  });
});

describe('G1 — sujets (objets exacts du fondateur pour un lien ; « à classer » pour des pièces ; dédié pour non rattaché)', () => {
  it('lien en jeu : objets EXACTS, n° de permis présent', () => {
    expect(sujetAlerte('j3', { numDau: '0930012500081', aLienPerissable: true }))
      .toBe('ALERTE PERMIS DE CONSTRUIRE N°0930012500081 - DOSSIER A TELECHARGER DANS LA GED');
    expect(sujetAlerte('h24', { numDau: '0930012500081', aLienPerissable: true }))
      .toBe('URGENT PERMIS DE CONSTRUIRE N°0930012500081 24H POUR TELECHARGER EN GED AVANT PERTES DES DOCUMENTS');
  });
  it('pièces seules : « à classer », jamais de perte annoncée', () => {
    expect(sujetAlerte('j3', { numDau: '0930012500081', aLienPerissable: false })).toContain('À CLASSER');
    expect(sujetAlerte('h24', { numDau: '0930012500081', aLienPerissable: false })).not.toContain('PERTE');
  });
  it('non rattaché (permis inconnu) : sujet dédié « contenu non rattaché »', () => {
    expect(sujetAlerte('j3', { numDau: null, aLienPerissable: true })).toContain('NON RATTACHÉ');
    expect(sujetAlerte('h24', { numDau: null, aLienPerissable: true })).toContain('NON RATTACHÉ');
  });
});

describe('G1 — corps du forward : ce qui périt en tête, pièces déclarées en sécurité, permis, retard, message d’origine', () => {
  const baseE = {
    ctx: { numDau: '0930012500081', aLienPerissable: true },
    liensPerissables: [{ url: 'https://ged.paris.fr/share/s/Zk91Ab34Cd/folder', mention: 'expire le 17/08 (7 jours à compter du 10/08)' }],
    autresPermis: ['0930012500082'], communeNom: 'Paris', pieces: [] as { nomFichier: string; recuperee: boolean; jointe: boolean; lienSigne: string | null; motif: string | null }[],
    deAdresse: 'no-reply@paris.fr', deNom: null, objet: 'Réponse', recuLe: '2026-08-10T13:24:00Z', corpsTexte: 'Voici le lien.', enRetard: false,
  };

  it('lien en jeu : lien EN TÊTE + à-faire + permis + autres + message d’origine', () => {
    const c = composerCorpsForward({ type: 'j3', ...baseE });
    expect(c.indexOf('Lien(s) de téléchargement')).toBeLessThan(c.indexOf('Message d’origine')); // le lien AVANT le message d'origine
    expect(c).toContain('https://ged.paris.fr/share/s/Zk91Ab34Cd/folder');
    expect(c).toContain('téléverser dans la GED');
    expect(c).toContain('N°0930012500081');
    expect(c).toContain('Autres permis couverts par le même message : N°0930012500082');
    expect(c).toContain('Objet : Réponse');
  });

  it('pièces jointes : déclarées « déjà sauvegardées » (jointe) / lien signé (lourde) — jamais de perte annoncée sans lien', () => {
    const c = composerCorpsForward({ type: 'j3', ...baseE, ctx: { numDau: '0930012500081', aLienPerissable: false },
      liensPerissables: [], pieces: [{ nomFichier: 'a.pdf', recuperee: true, jointe: true, lienSigne: null, motif: null }, { nomFichier: 'gros.zip', recuperee: true, jointe: false, lienSigne: 'https://s3/signed', motif: null }] });
    expect(c).toContain('déjà sauvegardées');
    expect(c).toContain('a.pdf — jointe à ce mail');
    expect(c).toContain('gros.zip — trop volumineuse');
    expect(c).toContain('https://s3/signed');
    expect(c).not.toContain('AVANT PERTES');
  });

  it('T7-B — pièce NON récupérée (refus de dépôt) : avertissement explicite, JAMAIS « aucune perte possible »', () => {
    const c = composerCorpsForward({ type: 'j3', ...baseE, ctx: { numDau: '0930012500081', aLienPerissable: false },
      liensPerissables: [], pieces: [
        { nomFichier: 'plan-60mo.pdf', recuperee: false, jointe: false, lienSigne: null, motif: 'pièce trop volumineuse : 60 Mo (maximum 50 Mo)' },
        { nomFichier: 'a.pdf', recuperee: true, jointe: true, lienSigne: null, motif: null },
      ] });
    expect(c).toContain('plan-60mo.pdf — NON récupérée (pièce trop volumineuse : 60 Mo (maximum 50 Mo))');
    expect(c).toContain('à récupérer depuis le message d’origine');
    expect(c).not.toContain('aucune perte possible'); // ne rassure JAMAIS à tort
    expect(c).not.toContain('déjà sauvegardées de notre côté');
    expect(c).toContain('a.pdf — jointe à ce mail'); // les pièces récupérées restent listées normalement
  });

  it('en retard → mention explicite ; non rattaché → invite à rattacher', () => {
    expect(composerCorpsForward({ type: 'h24', ...baseE, enRetard: true })).toContain('EN RETARD');
    expect(composerCorpsForward({ type: 'j3', ...baseE, ctx: { numDau: null, aLienPerissable: true } })).toContain('n’a PAS pu être rattaché');
  });
});
