/**
 * BORNE DU PROFIL D'AXE (lot LENTEUR DU MOTEUR SUR LiDAR RÉEL, 15/10/2026) — `profilOrigineAxe` ne lit plus le MNS au-delà de
 * la dernière cellule DANS l'origine (imax ; cellule 0 toujours lue). Épreuve : pour tout profil, l'automate de l'aile opposée
 * en U rend EXACTEMENT le même candidat avec le profil complet et avec le profil borné (MNS mis à null après imax).
 */
import { describe, it, expect, vi } from 'vitest';

vi.mock('./client', () => ({ query: vi.fn() }));

import { detecterAileOpposeeUSurAxe, type CelluleProfilOrigine } from './obstacles';

/** Le profil tel que la requête bornée le rend : MNS conservé jusqu'à imax (≥ 0), null au-delà. */
function borner(profil: CelluleProfilOrigine[]): CelluleProfilOrigine[] {
  let imax = 0;
  profil.forEach((c, i) => { if (c.dansOrigine) imax = i; });
  return profil.map((c, i) => (i <= imax ? c : { dansOrigine: c.dansOrigine, mnsBrutM: null }));
}

/** Générateur déterministe (LCG) : la même suite à chaque exécution. */
function alea(graine: number): () => number {
  let s = graine >>> 0;
  return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 2 ** 32; };
}

/** Un U : aile de départ, cour (creux), aile opposée (ré-entrée), puis la rue ; MNS bruité au-delà. */
function profilU(depart: number, cour: number, aile: number, toit: number, creux: number, rue: number): CelluleProfilOrigine[] {
  const p: CelluleProfilOrigine[] = [];
  for (let i = 0; i < depart; i++) p.push({ dansOrigine: true, mnsBrutM: toit });
  for (let i = 0; i < cour; i++) p.push({ dansOrigine: false, mnsBrutM: creux });
  for (let i = 0; i < aile; i++) p.push({ dansOrigine: true, mnsBrutM: toit + 0.5 });
  while (p.length < 400) p.push({ dansOrigine: false, mnsBrutM: rue + (p.length % 7) });
  return p;
}

describe('profilOrigineAxe borné : même candidat « aile opposée U » qu’avec les 400 cellules', () => {
  it('cas construits : U qui se déclenche, cour trop courte, pas de ré-entrée, origine absente, trous', () => {
    const cas: [CelluleProfilOrigine[], number][] = [
      [profilU(6, 12, 8, 50, 40, 60), 45],           // U franc : obstacle à la ré-entrée
      [profilU(6, 3, 8, 50, 40, 60), 45],            // cour trop courte : aucun candidat
      [profilU(6, 12, 0, 50, 40, 80), 45],           // pas d'aile opposée : la rue haute au-delà ne compte pas
      [profilU(6, 12, 8, 50, 40, 60), 99],           // aile sous l'œil : aucun candidat
      [profilU(0, 0, 0, 50, 40, 60), 45],            // jamais dans l'origine (snap en bordure)
      [profilU(6, 12, 8, 50, 40, 60).map((c, i) => (i % 3 === 0 ? { ...c, mnsBrutM: null } : c)), 45], // trous
    ];
    for (const [profil, hOeil] of cas) {
      expect(detecterAileOpposeeUSurAxe(borner(profil), hOeil)).toEqual(detecterAileOpposeeUSurAxe(profil, hOeil));
    }
    expect(detecterAileOpposeeUSurAxe(profilU(6, 12, 8, 50, 40, 60), 45)).not.toBeNull(); // le cas franc déclenche bien
  });

  it('20 000 profils aléatoires (origine morcelée, creux, trous, toits au-delà) : résultat identique', () => {
    const r = alea(20261015);
    let declenches = 0;
    for (let n = 0; n < 20000; n++) {
      const longueurOrigine = Math.floor(r() * 120);
      const profil: CelluleProfilOrigine[] = Array.from({ length: 400 }, (_, i) => ({
        dansOrigine: i < longueurOrigine && r() < 0.6,
        mnsBrutM: r() < 0.1 ? null : 30 + r() * 30,
      }));
      const hOeil = 30 + r() * 30;
      const complet = detecterAileOpposeeUSurAxe(profil, hOeil);
      if (complet) declenches++;
      expect(detecterAileOpposeeUSurAxe(borner(profil), hOeil)).toEqual(complet);
    }
    expect(declenches).toBeGreaterThan(100); // l'épreuve couvre bien des déclenchements, pas seulement des null
  });
});
