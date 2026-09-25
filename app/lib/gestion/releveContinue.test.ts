import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  boucleContinue, etatApres, suiteDuTour, REGLAGES_CONTINU_DEFAUT,
  type DepsContinu, type EtatContinu, type IssuePasse, type ReglagesContinu,
} from './releveContinue';
import { CONFIG_GESTION_DEFAUT, intervalleContinuValide, RELEVE_CONTINUE_MAX_S, RELEVE_CONTINUE_MIN_S } from './config';

/**
 * LOT 5-DIRECT — LA RELÈVE CONTINUE. MESURÉ avant ce lot : un mail mettait 1 500 minutes (25 h) à apparaître, parce que
 * la relève n'avait AUCUN déclencheur automatique. Trois choses peuvent rendre ce lot inutile, et chacune est éprouvée :
 *   ① la boucle s'arrête d'elle-même — le retard revient, et personne ne s'en aperçoit ;
 *   ② elle lance une capture pendant qu'une autre tourne — deux passes sur la même boîte se marchent dessus ;
 *   ③ elle martèle Gmail quand il refuse — le meilleur moyen de se faire fermer la porte plus longtemps.
 */

const reglages: ReglagesContinu = { ...REGLAGES_CONTINU_DEFAUT, intervalleS: 60 };
const neuf: EtatContinu = { echecsConsecutifs: 0 };
const issue = (o: Partial<IssuePasse> = {}): IssuePasse => ({ resultat: 'ok', captures: 0, ...o });

describe('🔴 ① elle ne s’arrête JAMAIS d’elle-même', () => {
  it('ne rien trouver est son état NORMAL, pas une raison de s’arrêter', () => {
    const s = suiteDuTour(issue({ captures: 0 }), neuf, reglages);
    expect(s.attendreS).toBe(60);
    expect(s.motif).toContain('rien de nouveau');
  });

  it('…et elle le DIT à chaque tour : un silence ne doit pas ressembler à un arrêt', () => {
    expect(suiteDuTour(issue({ captures: 0 }), neuf, reglages).motif).toContain('prochaine relève dans 60 s');
    expect(suiteDuTour(issue({ captures: 3 }), neuf, reglages).motif).toContain('3 message(s) capturé(s)');
  });

  it('aucun compte configuré ne l’arrête pas non plus : elle repartira le jour où il y en aura un', () => {
    expect(suiteDuTour(issue({ resultat: 'inactif', captures: null }), neuf, reglages).attendreS).toBe(60);
  });

  it('AUCUNE situation ne rend « arrêter » — la décision n’a même pas ce mot', () => {
    for (const r of ['ok', 'erreur', 'occupe', 'inactif'] as const) {
      const s = suiteDuTour(issue({ resultat: r, captures: null }), neuf, reglages);
      expect(s.attendreS).toBeGreaterThan(0);
      expect(Object.keys(s)).toEqual(['attendreS', 'motif']);
    }
  });
});

describe('🔴 ② le verrou : jamais deux captures en même temps', () => {
  it('verrou pris → on attend peu et on repasse, on ne force RIEN', () => {
    const s = suiteDuTour(issue({ resultat: 'occupe', captures: null }), neuf, reglages);
    expect(s.attendreS).toBe(REGLAGES_CONTINU_DEFAUT.attenteVerrouS);
    expect(s.motif).toContain('verrou');
  });

  it('l’attente sur verrou est COURTE : on veut reprendre dès qu’il se libère', () => {
    expect(REGLAGES_CONTINU_DEFAUT.attenteVerrouS).toBeLessThan(CONFIG_GESTION_DEFAUT.releveContinueSecondes);
  });

  it('la boucle passe par `relever`, donc par le verrou existant — elle n’en pose pas un second', () => {
    const src = readFileSync('app/lib/gestion/releveContinue.ts', 'utf8');
    // Ce module ne connaît ni verrou, ni base, ni IMAP : il rappelle la passe, un point c'est tout.
    expect(src.split('\n').filter((l) => /^\s*import\b/.test(l))).toEqual([]);
    expect(/verrouGestion|pg_try_advisory_lock|ImapFlow/.test(src)).toBe(false);
  });

  it('un tour n’en déclenche qu’UN : la boucle attend la fin avant de redemander', async () => {
    let enCours = 0;
    let maxSimultane = 0;
    let tours = 0;
    const deps: DepsContinu = {
      relever: async () => {
        enCours += 1; maxSimultane = Math.max(maxSimultane, enCours);
        await Promise.resolve();
        enCours -= 1; tours += 1;
        return issue();
      },
      intervalle: async () => 60,
      attendre: async () => {},
      journal: () => {},
      continuer: () => tours < 5,
      maintenant: () => new Date('2026-09-24T12:00:00Z'),
    };
    await boucleContinue(deps);
    expect(maxSimultane).toBe(1);
  });
});

describe('🔴 ③ elle ne martèle pas', () => {
  it('un échec fait attendre, et l’attente DOUBLE à chaque échec d’affilée', () => {
    expect(suiteDuTour(issue({ resultat: 'erreur' }), { echecsConsecutifs: 0 }, reglages).attendreS).toBe(30);
    expect(suiteDuTour(issue({ resultat: 'erreur' }), { echecsConsecutifs: 1 }, reglages).attendreS).toBe(60);
    expect(suiteDuTour(issue({ resultat: 'erreur' }), { echecsConsecutifs: 3 }, reglages).attendreS).toBe(240);
  });

  it('…mais elle est PLAFONNÉE : insister n’a jamais fait rendre la main plus vite', () => {
    expect(suiteDuTour(issue({ resultat: 'erreur' }), { echecsConsecutifs: 20 }, reglages).attendreS)
      .toBe(REGLAGES_CONTINU_DEFAUT.backoffMaxS);
  });

  it('un SUCCÈS remet le compteur à zéro : seuls les échecs d’AFFILÉE allongent l’attente', () => {
    expect(etatApres(issue({ resultat: 'erreur' }), { echecsConsecutifs: 2 }).echecsConsecutifs).toBe(3);
    expect(etatApres(issue(), { echecsConsecutifs: 5 }).echecsConsecutifs).toBe(0);
    expect(etatApres(issue({ resultat: 'occupe' }), { echecsConsecutifs: 5 }).echecsConsecutifs).toBe(0);
  });

  it('de bout en bout : elle patiente, puis repart quand le serveur revient', async () => {
    const resultats: IssuePasse['resultat'][] = ['erreur', 'erreur', 'ok', 'ok'];
    const dodos: number[] = [];
    let i = 0;
    await boucleContinue({
      relever: async () => issue({ resultat: resultats[i++] }),
      intervalle: async () => 60,
      attendre: async (s) => { dodos.push(s); },
      journal: () => {},
      continuer: () => i < resultats.length,
      maintenant: () => new Date('2026-09-24T12:00:00Z'),
    });
    expect(dodos).toEqual([30, 60, 60]); // deux attentes croissantes, puis l'intervalle ordinaire
  });
});

describe('l’intervalle vit en base, et se relit à chaque tour', () => {
  it('le défaut est 60 s — un mail apparaît dans la minute', () => {
    expect(CONFIG_GESTION_DEFAUT.releveContinueSecondes).toBe(60);
  });

  it('une valeur absente, nulle ou aberrante retombe sur le défaut', () => {
    for (const v of [undefined, null, 0, -5, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(intervalleContinuValide(v as number)).toBe(60);
    }
  });

  it('les bornes mordent des DEUX côtés', () => {
    expect(intervalleContinuValide(3)).toBe(RELEVE_CONTINUE_MIN_S);
    expect(intervalleContinuValide(99_999)).toBe(RELEVE_CONTINUE_MAX_S);
    expect(intervalleContinuValide(30)).toBe(30);
  });

  it('🔴 il est RELU à chaque tour : changer le réglage n’exige aucun redémarrage', async () => {
    const intervalles = [60, 30, 15];
    const dodos: number[] = [];
    let i = 0;
    await boucleContinue({
      relever: async () => issue(),
      intervalle: async () => intervalles[i],
      attendre: async (s) => { dodos.push(s); i += 1; },
      journal: () => {},
      continuer: () => i < intervalles.length,
      maintenant: () => new Date('2026-09-24T12:00:00Z'),
    });
    expect(dodos).toEqual([60, 30, 15]);
  });

  it('les bornes du code et celles de la migration 238 disent la MÊME chose', () => {
    const mig = readFileSync('db/migrations/238_gestion_releve_continue.sql', 'utf8');
    expect(mig).toContain(`BETWEEN ${RELEVE_CONTINUE_MIN_S} AND ${RELEVE_CONTINUE_MAX_S}`);
    expect(mig).toContain(`DEFAULT ${CONFIG_GESTION_DEFAUT.releveContinueSecondes}`);
  });
});

describe('garanties STATIQUES — aucune connexion réelle, aucune nouveauté réseau', () => {
  const cli = readFileSync('app/scripts/relever-gestion-continu.ts', 'utf8');

  it('le CLI réutilise la relève EXISTANTE : il n’ouvre aucune connexion par lui-même', () => {
    expect(cli).toContain("await import('../lib/gestion/releveReelle')");
    // Sur les lignes de CODE seulement : le commentaire d'en-tête CITE `imapflow` pour expliquer pourquoi les imports
    //   sont dynamiques — c'est voulu, et une assertion sur la prose rougirait pour une bonne explication.
    const code = cli.split('\n').filter((l) => !/^\s*(\*|\/\/|\/\*)/.test(l)).join('\n');
    expect(/imapflow|ImapFlow|nodemailer|creerClient/.test(code)).toBe(false);
  });

  it('il s’arrête PROPREMENT : le tour en cours se termine, le verrou est rendu', () => {
    expect(cli).toContain("process.on('SIGINT'");
    expect(cli).toContain("process.on('SIGTERM'");
    expect(cli).toContain('arrêt après le tour en cours');
  });

  /**
   * ⚠️ CE TEST EXIGEAIT « NON INSTALLÉ », et cette phrase-là est devenue FAUSSE le 25/09/2026 : le job est activé,
   * par décision d'Arno, après l'incident des dix heures sans relève. On ne garde donc pas l'assertion « pas encore
   * installé » — figer un état transitoire fait rougir un test pour une bonne nouvelle. Ce qui reste, et qui compte,
   * c'est la FORME du job : longue durée, sans relais, sans secret.
   */
  it('le job launchd est de type LONGUE DURÉE, sans shell, sans secret', () => {
    const plist = readFileSync('ops/com.sansvisavis.gestion-continu.plist', 'utf8');
    // Les assertions « ne contient PAS » portent sur le PLIST EFFECTIF, jamais sur l'en-tête documentaire : celui-ci
    //   CITE `/bin/zsh` pour expliquer pourquoi on ne s'en sert plus, et un test qui rougit sur une bonne explication
    //   finit par être contourné (même arbitrage que pour `imapflow`, plus haut).
    const effectif = plist.replace(/<!--[\s\S]*?-->/g, '');
    // `KeepAlive` et NON `StartInterval` : ce dernier lancerait un second processus par-dessus le premier.
    expect(plist).toContain('<key>KeepAlive</key>');
    expect(effectif).not.toContain('<key>StartInterval</key>');
    // Le job vise le MÊME point d'entrée que `npm run gestion:relever-continu` : deux définitions qui divergent, et
    //   l'ordonnanceur lancerait autre chose que ce qu'on éprouve.
    expect(effectif).toContain('app/scripts/relever-gestion-continu.ts');
    // AUCUN SHELL : l'ancienne version passait par `/bin/zsh -lc` et dépendait du shell de login pour trouver `node`.
    //   Une panne d'ordonnanceur est silencieuse — moins il y a de relais, mieux c'est.
    expect(effectif).not.toContain('/bin/zsh');
    // MESURÉ le 25/09/2026 : sans ces deux variables, `pg` n'envoie aucun nom d'utilisateur (le DATABASE_URL n'en
    //   porte pas) et PostgreSQL refuse la connexion — FATAL 28000.
    expect(effectif).toContain('<key>USER</key>');
    expect(effectif).toContain('<key>LOGNAME</key>');
    // 🔒 AUCUN SECRET : ils restent dans `.env`, que le CLI charge lui-même en chemin absolu.
    expect(effectif).not.toContain('DATABASE_URL');
    expect(effectif).not.toContain('postgresql://');
  });

  it('le bouton « Relever maintenant » n’est pas touché : il reste le déclencheur manuel', () => {
    const route = readFileSync('app/(admin)/api/admin/gestion/relever/route.ts', 'utf8');
    expect(route).toContain('DÉCLENCHEUR MANUEL');
  });
});
