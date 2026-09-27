import { describe, it, expect } from 'vitest';
import {
  celleEnPlein, changerEtat, fermer, FENETRES_MAX, MOTIF_TROP_DE_FENETRES, ouvrir, rangDepuisLaDroite,
  type FenetreRedaction,
} from './fenetresRedaction';

/**
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * 🔴 LOT REDACTION-GMAIL — LES FENÊTRES DE RÉDACTION (demande d'Arno : « comme Gmail »).
 *
 * CE QUE CE FICHIER PROTÈGE :
 *   ① DEUX AU PLUS. Une fenêtre ouverte est un message NON ENVOYÉ ; au-delà de deux, on en oublie une derrière
 *      l'autre. La troisième demande rend un MESSAGE qui dit quoi faire — un clic sans effet se lit comme une panne ;
 *   ② UNE FENÊTRE RÉDUITE COMPTE. Sinon on en réduit deux, on en ouvre deux autres, et les premières disparaissent ;
 *   ③ ROUVRIR LA MÊME NE FAIT PAS DE DOUBLON : « Répondre » cliqué deux fois rétablit la fenêtre, il n'en crée pas
 *      une seconde sur le même brouillon — et ne doit pas buter sur la limite ;
 *   ④ UNE SEULE EN PLEIN ÉCRAN : deux voiles empilés rendraient la fenêtre du dessous inatteignable au clavier.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */

const f = (cle: string, etat: FenetreRedaction['etat'] = 'ouverte'): FenetreRedaction => ({ cle, etat });

describe('🔴 ① deux fenêtres au plus', () => {
  it('la première et la deuxième s’ouvrent', () => {
    const a = ouvrir([], 'n1');
    expect(a.ok).toBe(true);
    const b = ouvrir(a.ok ? a.fenetres : [], 'n2');
    expect(b.ok && b.fenetres.map((x) => x.cle)).toEqual(['n1', 'n2']);
  });

  it('🔴 la TROISIÈME est refusée, avec un message qui dit quoi faire', () => {
    const r = ouvrir([f('n1'), f('n2')], 'n3');
    expect(r.ok).toBe(false);
    expect(r.ok === false && r.motif).toBe(MOTIF_TROP_DE_FENETRES);
    expect(r.ok === false && r.motif).toContain('Fermez-en un');
    // …et le brouillon en cours n'est pas menacé : le message le dit aussi.
    expect(r.ok === false && r.motif).toContain('conservé');
  });

  it('la limite est bien celle qui est publiée', () => {
    expect(FENETRES_MAX).toBe(2);
  });

  /** 🔴 ② Une fenêtre RÉDUITE porte un brouillon tout autant qu'une fenêtre ouverte. */
  it('🔴 ② une fenêtre RÉDUITE compte dans la limite', () => {
    expect(ouvrir([f('n1', 'reduite'), f('n2', 'reduite')], 'n3').ok).toBe(false);
  });

  it('une fenêtre en PLEIN ÉCRAN compte aussi', () => {
    expect(ouvrir([f('n1', 'plein'), f('n2')], 'n3').ok).toBe(false);
  });

  it('fermer une fenêtre libère la place', () => {
    const restantes = fermer([f('n1'), f('n2')], 'n1');
    expect(restantes.map((x) => x.cle)).toEqual(['n2']);
    expect(ouvrir(restantes, 'n3').ok).toBe(true);
  });

  it('fermer une clé inconnue ne change rien, et ne jette pas', () => {
    expect(fermer([f('n1')], 'jamais-vue').map((x) => x.cle)).toEqual(['n1']);
    expect(fermer([], 'x')).toEqual([]);
  });
});

describe('🔴 ③ rouvrir la même fenêtre', () => {
  it('🔴 ne crée pas de doublon, et ne bute pas sur la limite', () => {
    const r = ouvrir([f('rep:900'), f('n2')], 'rep:900');
    expect(r.ok).toBe(true);
    expect(r.ok && r.fenetres).toHaveLength(2);
    expect(r.ok && r.fenetres.filter((x) => x.cle === 'rep:900')).toHaveLength(1);
  });

  it('une fenêtre RÉDUITE qu’on redemande est RÉTABLIE, pas laissée repliée', () => {
    const r = ouvrir([f('rep:900', 'reduite')], 'rep:900');
    expect(r.ok && r.fenetres[0].etat).toBe('ouverte');
  });

  it('…et elle repasse au premier plan (dernière de la liste)', () => {
    const r = ouvrir([f('a'), f('b')], 'a');
    expect(r.ok && r.fenetres.map((x) => x.cle)).toEqual(['b', 'a']);
  });
});

describe('🔴 ④ réduire, agrandir, rétablir', () => {
  it('les trois états se posent', () => {
    expect(changerEtat([f('a')], 'a', 'reduite')[0].etat).toBe('reduite');
    expect(changerEtat([f('a')], 'a', 'plein')[0].etat).toBe('plein');
    expect(changerEtat([f('a', 'plein')], 'a', 'ouverte')[0].etat).toBe('ouverte');
  });

  /** 🔴 Deux voiles empilés rendraient la fenêtre du dessous inatteignable au clavier. */
  it('🔴 une SEULE fenêtre en plein écran : l’autre redescend à « ouverte »', () => {
    const r = changerEtat([f('a', 'plein'), f('b')], 'b', 'plein');
    expect(r.find((x) => x.cle === 'b')?.etat).toBe('plein');
    expect(r.find((x) => x.cle === 'a')?.etat).toBe('ouverte');
    expect(celleEnPlein(r)?.cle).toBe('b');
  });

  it('sans plein écran, `celleEnPlein` rend `null` — pas de voile posé pour rien', () => {
    expect(celleEnPlein([f('a'), f('b', 'reduite')])).toBeNull();
    expect(celleEnPlein([])).toBeNull();
  });

  it('changer l’état d’une clé inconnue ne touche à rien', () => {
    const avant = [f('a'), f('b')];
    expect(changerEtat(avant, 'inconnue', 'reduite')).toEqual(avant);
  });
});

/** ⚠️ CÔTE À CÔTE, JAMAIS SUPERPOSÉES : superposées, la seconde masquerait la première. */
describe('la place des fenêtres ancrées', () => {
  it('la dernière ouverte est la plus à droite', () => {
    const fs = [f('a'), f('b')];
    expect(rangDepuisLaDroite(fs, 'b')).toBe(0);
    expect(rangDepuisLaDroite(fs, 'a')).toBe(1);
  });

  it('celle en plein écran ne prend pas de place dans la rangée — elle est centrée', () => {
    const fs = [f('a', 'plein'), f('b')];
    expect(rangDepuisLaDroite(fs, 'b')).toBe(0);
  });

  it('une clé inconnue ne jette pas', () => {
    expect(rangDepuisLaDroite([f('a')], 'x')).toBe(0);
  });
});
