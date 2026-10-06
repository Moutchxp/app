import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { creerMinuterie, enTete, lireUnTour, PREFIXE_SUITE } from './relever-gestion-continu';

/**
 * LOT 5-DIRECT — L'ATTENTE ENTRE DEUX TOURS DE LA RELÈVE CONTINUE.
 *
 * 🔴 CE QUE CES TESTS EMPÊCHENT DE REVENIR, et ce n'est pas théorique — c'est arrivé le 25/09/2026, en production,
 * le jour même où le job launchd a été installé. La minuterie portait un `unref()`. Une minuterie déréférencée ne
 * retient plus Node : la connexion IMAP étant refermée entre deux tours, le processus SORTAIT pendant l'attente,
 * proprement (code 0), après UN SEUL tour. `KeepAlive` le relançait, une passe avait bien lieu chaque minute, et
 * tout avait l'air normal — trois en-têtes et trois PID différents dans le journal ont montré le contraire.
 *
 * La leçon tient en une phrase : un processus de longue durée qui sort tout seul ressemble, de loin, à un processus
 * qui tourne. Seul `hasRef()` le dit sans ambiguïté, et c'est donc lui qu'on interroge ici.
 */

describe('les options du CLI', () => {
  it('« --un-tour » n’est reconnu que s’il est écrit', () => {
    expect(lireUnTour(['node', 'x', '--un-tour'])).toBe(true);
    expect(lireUnTour(['node', 'x'])).toBe(false);
  });

  /** Devant un terminal muet, « ça tourne » et « c'est bloqué » se ressemblent : l'en-tête sort AVANT la connexion. */
  it('l’en-tête dit le mode et où se règle l’intervalle', () => {
    expect(enTete(false).join('\n')).toContain('en continu');
    expect(enTete(true).join('\n')).toContain('UN SEUL TOUR');
    expect(enTete(false).join('\n')).toContain('releve_continue_secondes');
  });
});

describe('la minuterie entre deux tours', () => {
  it('attend le délai demandé, en secondes', async () => {
    const programmer = vi.fn((rappel: () => void, _ms: number) => { rappel(); return 'jeton'; });
    const m = creerMinuterie({ programmer, annuler: () => {} });
    await m.attendre(45);
    expect(programmer.mock.calls[0][1]).toBe(45_000);
  });

  /** SIGTERM ne doit pas attendre la fin du délai : `launchctl bootout` rendrait la main une minute plus tard. */
  it('le réveil résout l’attente TOUT DE SUITE, et annule la minuterie', async () => {
    let rappel: (() => void) | null = null;
    const annuler = vi.fn();
    const m = creerMinuterie({ programmer: (r) => { rappel = r; return 'jeton'; }, annuler });
    const attente = m.attendre(600);
    m.reveiller();
    await attente;                       // résolue sans que la minuterie n'ait jamais sonné
    expect(annuler).toHaveBeenCalledWith('jeton');
    expect(rappel).not.toBeNull();       // elle avait bien été programmée
  });

  it('un réveil sans attente en cours ne casse rien', () => {
    const m = creerMinuterie({ programmer: () => 'jeton', annuler: () => {} });
    expect(() => m.reveiller()).not.toThrow();
  });

  it('après le délai, un réveil tardif reste sans effet', async () => {
    const annuler = vi.fn();
    const m = creerMinuterie({ programmer: (r) => { r(); return 'jeton'; }, annuler });
    await m.attendre(1);
    m.reveiller();
    expect(annuler).not.toHaveBeenCalled();
  });

  /**
   * 🔴 LE TEST DE NON-RÉGRESSION. Avec la vraie minuterie de Node : elle doit RETENIR le processus. `hasRef()` à
   * faux signifierait que Node peut sortir pendant l'attente — exactement le défaut du 25/09/2026, qui réduisait la
   * relève continue à un tour par démarrage.
   */
  it('la VRAIE minuterie retient le processus : elle n’est jamais déréférencée', () => {
    let jeton: ReturnType<typeof setTimeout> | null = null;
    const m = creerMinuterie({
      // On intercepte le jeton rendu par le vrai `setTimeout`, sans changer la façon dont il est créé.
      programmer: (rappel, ms) => { jeton = setTimeout(rappel, ms); return jeton; },
      annuler: (j) => clearTimeout(j as ReturnType<typeof setTimeout>),
    });
    void m.attendre(600);
    expect(jeton).not.toBeNull();
    expect(jeton!.hasRef()).toBe(true);
    m.reveiller(); // on ne laisse pas dix minutes de minuterie derrière soi
  });
});

/**
 * ══ 🔴🔴 LOT ACCUEIL-GESTION, POINT 0 — LE JOURNAL DE LA SUITE SE RECONNAÎT À SON PRÉFIXE ════════════════════════
 *
 * La boucle ne recopie dans son journal QUE les lignes de la suite de relève (avis de non-remise, biens cochés
 * avant l'envoi, échanges réexaminés, mails Monga lus). Elle les reconnaît au préfixe « suite : ».
 *
 * 🔴 POURQUOI CE GARDE EXISTE, ET CE QU'IL A COÛTÉ DE NE PAS L'AVOIR. Passer le journal ENTIER a été essayé puis
 * mesuré dans le vrai fichier de log : cinq lignes de plus À CHAQUE TOUR (« recherche des messages de la
 * fenêtre… », « passe terminée… », « corbeille… », « étoiles… »), soit ~7 000 lignes par jour dans un journal
 * qu'on ouvre quand quelque chose ne va pas. D'où le filtre — et d'où cette épreuve : une onzième ligne de suite
 * écrite sans le préfixe serait INVISIBLE, en silence, et personne ne le saurait avant d'en avoir besoin.
 */
describe('🔴 le préfixe des lignes de la suite', () => {
  it('toutes les lignes de `suiteReleveReel` le portent, sans exception', () => {
    const code = readFileSync('app/lib/gestion/suiteReleveReel.ts', 'utf8');
    const lignes = [...code.matchAll(/journal\?\.\(\s*`([^`]*)`/g)].map((m) => m[1]);
    expect(lignes.length).toBeGreaterThanOrEqual(10);
    for (const l of lignes) expect(l.startsWith(PREFIXE_SUITE)).toBe(true);
  });

  it('⚠️ et la boucle NE RECOPIE QUE celles-là — pas le journal de la relève elle-même', () => {
    /* ⚠️ Les blancs sont normalisés : la ligne émise indente de deux espaces, qu'on ne veut pas figer ici. */
    const code = readFileSync('app/scripts/relever-gestion-continu.ts', 'utf8').replace(/\s+/g, ' ');
    expect(code).toContain('(l) => { if (l.startsWith(PREFIXE_SUITE)) console.log(');
    /* 🔴 ET LE JOURNAL N'EST PAS PASSÉ EN ENTIER : la forme nue aurait rouvert les ~7 000 lignes par jour. */
    expect(code).not.toContain('relever( true, (l) => console.log(');
  });
});
