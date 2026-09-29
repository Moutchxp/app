import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  brouillonAQuelqueChose, DELAI_FRAPPE_MS, DELAI_GESTE_MS, delaiPour, MOTS_ENREGISTREMENT,
  signatureBrouillon, sorteDuChangement, texteUtile,
} from './brouillonEnregistrement';
import type { Brouillon } from './redaction';

/**
 * LOT BROUILLONS-GMAIL — L'ENREGISTREMENT EN CONTINU, ÉPROUVÉ SANS ÉCRAN.
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * 🔴 CE QUI EXISTAIT, MESURÉ À L'ÉCRAN LE 29/09/2026 AVANT D'Y TOUCHER — et c'est le point de départ de ce lot :
 *   · une minuterie de 1 200 ms (premier enregistrement observé à +1,6 s) ;
 *   · RIEN à la fermeture, à la réduction, au rechargement ni à la fermeture de l'onglet ;
 *   · aucun indicateur ;
 *   · un DOUBLON systématique : un brouillon neuf partait deux fois (+1,6 s puis +3,6 s), parce que recevoir son
 *     identifiant relançait la minuterie. Une écriture sur deux ne servait à rien.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */

const NEUF: Brouillon = {
  voie: 'nouveau', a: [], cc: [], cci: [], objet: '', corps: '\n\nService Gestion',
  citation: null, destinatairesApproximatifs: false, filId: null, repondALeMessageId: null,
};

describe('🔴 les deux délais', () => {
  it('deux secondes après la frappe — le réglage demandé par Arno', () => {
    expect(DELAI_FRAPPE_MS).toBe(2000);
    expect(delaiPour('frappe')).toBe(2000);
  });

  /** ⚠️ Ajouter un destinataire ou joindre un fichier ne se répète pas trente fois par seconde : on n'attend pas. */
  it('un quart de seconde pour un geste discret (destinataire, objet, pièce)', () => {
    expect(DELAI_GESTE_MS).toBe(250);
    expect(delaiPour('geste')).toBe(250);
  });
});

describe('🔴🔴 la signature : ce qui compte comme un changement', () => {
  it('🔴 recevoir son identifiant n’est PAS un changement — c’est ce qui doublait les écritures', () => {
    const avant = { ...NEUF, corps: 'bonjour' };
    // Le brouillon revient avec son identifiant : rien de ce qui part en base n'a bougé.
    const apres = { ...avant, id: 4242 } as Brouillon & { id: number };
    expect(signatureBrouillon(apres)).toBe(signatureBrouillon(avant));
    expect(sorteDuChangement(avant, apres)).toBe('aucun');
  });

  it('le corps qui bouge est une FRAPPE ; un destinataire ou un objet, un GESTE', () => {
    expect(sorteDuChangement(NEUF, { ...NEUF, corps: 'a' })).toBe('frappe');
    expect(sorteDuChangement(NEUF, { ...NEUF, corpsHtml: '<p>a</p>' })).toBe('frappe');
    expect(sorteDuChangement(NEUF, { ...NEUF, a: ['x@y.test'] })).toBe('geste');
    expect(sorteDuChangement(NEUF, { ...NEUF, objet: 'Devis' })).toBe('geste');
    expect(sorteDuChangement(NEUF, { ...NEUF, cci: ['z@y.test'] })).toBe('geste');
  });

  /** ⚠️ Un changement MIXTE compte comme une frappe : la personne écrit, on ne la bouscule pas. */
  it('⚠️ corps + destinataire ensemble : c’est une frappe', () => {
    expect(sorteDuChangement(NEUF, { ...NEUF, corps: 'a', a: ['x@y.test'] })).toBe('frappe');
  });

  it('la citation fait partie de ce qui s’écrit : l’oublier ne réécrirait jamais un brouillon cité', () => {
    expect(signatureBrouillon({ ...NEUF, citation: 'Le 12/09, Paul a écrit :' }))
      .not.toBe(signatureBrouillon(NEUF));
  });

  it('le premier état est toujours un changement (on ne sait pas ce qu’il y avait avant)', () => {
    expect(sorteDuChangement(null, NEUF)).toBe('geste');
  });
});

describe('🔴🔴 y a-t-il quelque chose à garder ? — les quatre critères d’Arno', () => {
  it('un destinataire suffit', () => {
    expect(brouillonAQuelqueChose({ ...NEUF, a: ['x@y.test'] }, NEUF)).toBe(true);
    expect(brouillonAQuelqueChose({ ...NEUF, cc: ['x@y.test'] }, NEUF)).toBe(true);
    expect(brouillonAQuelqueChose({ ...NEUF, cci: ['x@y.test'] }, NEUF)).toBe(true);
  });

  it('un objet suffit', () => {
    expect(brouillonAQuelqueChose({ ...NEUF, objet: 'Quittance' }, NEUF)).toBe(true);
    // ⚠️ Un objet fait d'espaces n'est pas un objet.
    expect(brouillonAQuelqueChose({ ...NEUF, objet: '   ' }, NEUF)).toBe(false);
  });

  it('une pièce jointe suffit', () => {
    expect(brouillonAQuelqueChose(NEUF, NEUF, true)).toBe(true);
  });

  it('du texte hors signature suffit', () => {
    expect(brouillonAQuelqueChose({ ...NEUF, corps: 'Bonjour,\n\nService Gestion' }, NEUF)).toBe(true);
  });

  /**
   * 🔴🔴 LE DÉFAUT VU EN BASE LE 29/09/2026 AU MATIN, brouillon n° 51. Ni destinataire, ni objet, ni pièce, et pour
   * corps la seule signature — pourtant il existait. Sa cause : SURLIGNER la signature change le HTML, et la
   * conversion HTML → texte réinsère alors un espace ou un saut de ligne. Le corps « différait » donc de l'original
   * d'un caractère invisible, et cela suffisait à créer un brouillon vide.
   */
  it('🔴🔴 mettre en forme la signature ne crée PAS de brouillon (défaut du n° 51)', () => {
    // Même texte, espaces réarrangés par la conversion HTML → texte : rien n'a été écrit.
    expect(brouillonAQuelqueChose({ ...NEUF, corps: '\n\n Service  Gestion ' }, NEUF)).toBe(false);
    expect(brouillonAQuelqueChose({ ...NEUF, corps: 'Service Gestion' }, NEUF)).toBe(false);
  });

  it('⚠️ la comparaison du corps se fait sur le TEXTE UTILE, et seulement pour cette question', () => {
    expect(texteUtile('  a   b \n c ')).toBe('a b c');
    expect(texteUtile('')).toBe('');
  });
});

describe('l’indicateur', () => {
  it('🔴 il ne dit RIEN tant qu’il n’y a rien à dire', () => {
    expect(MOTS_ENREGISTREMENT.repos).toBe('');
  });

  it('les deux mots demandés par Arno, et un troisième quand ça rate', () => {
    expect(MOTS_ENREGISTREMENT.enregistrement).toBe('Enregistrement…');
    expect(MOTS_ENREGISTREMENT.enregistre).toBe('Brouillon enregistré');
    expect(MOTS_ENREGISTREMENT.echec).toContain('non enregistré');
  });
});

/**
 * ══ 🔴 CE QUE L'ÉDITEUR DOIT FAIRE DE CE MODULE ════════════════════════════════════════════════════════════════
 * Le comportement est éprouvé pour de vrai dans `Redaction.enregistrement.test.ts`, qui monte l'éditeur. Ces
 * assertions-ci gardent le CÂBLAGE : c'est lui qui manquait entièrement avant ce lot.
 */
describe('🔴 le câblage dans l’éditeur', () => {
  const src = readFileSync('app/(admin)/admin/(protected)/gestion/Redaction.tsx', 'utf8');
  const code = src.replace(/\/\*[\s\S]*?\*\//g, ' ').split('\n')
    .filter((l) => !l.trimStart().startsWith('//')).join('\n');

  it('🔴 on part : `pagehide` ET `visibilitychange`, avec `keepalive`', () => {
    expect(code).toContain("window.addEventListener('pagehide', partir)");
    expect(code).toContain("document.addEventListener('visibilitychange', surVisibilite)");
    expect(code).toContain('keepalive: true');
    // Le repli quand le navigateur refuse la requête survivante.
    expect(code).toContain('navigator.sendBeacon');
  });

  it('🔴 la fermeture enregistre AVANT de fermer', () => {
    const fermer = code.slice(code.indexOf('const fermer = async ()'));
    expect(fermer.indexOf('await enregistrerMaintenant()')).toBeLessThan(fermer.indexOf('onFerme()'));
  });

  it('🔴 réduire enregistre', () => {
    expect(code).toContain('if (passeAReduite) void enregistrerMaintenant()');
  });

  it('🔴 l’ancienne minuterie de 1 200 ms n’existe plus', () => {
    expect(code).not.toContain('}, 1200)');
    expect(code).toContain('delaiPour(sorte)');
  });

  it('🔴 on n’écrit pas deux fois la même chose', () => {
    expect(code).toContain('if (signature === signatureEcrite.current) return;');
  });
});
