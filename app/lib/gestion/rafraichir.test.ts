import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  aRafraichir, empreinteSuivante, listePeutSeRecharger, memeEmpreinte, memeVeille, mentionCourrierNouveau,
  peutBattre, veilleAAfficher, veilleSuivante,
  EMPREINTE_VIDE, PERIODE_BATTEMENT_MS, VEILLE_VIVE_VIDE, type Empreinte, type VeilleVive,
} from './rafraichir';
import { etatVeille } from './ecran';

/**
 * LOT ÉCRAN-VIVANT — L'ÉCRAN SE MET-IL À JOUR TOUT SEUL, SANS RIEN CASSER NI RIEN DÉTRUIRE ?
 *
 * 🔴 LES DEUX INCIDENTS QUE CE FICHIER EMPÊCHE DE REVIVRE :
 *   ① 26/09/2026 — l'écran ne se chargeait qu'une fois. Il a affiché « dernière passe il y a 46 s » pendant une
 *      heure, et la Réception est restée figée sur le dernier mail connu au chargement. La relève, elle,
 *      fonctionnait : 83 messages étiquetés depuis la veille, 83 en base, aucun manquant ;
 *   ② la boucle de rendu qui a saturé la mémoire dans `BoiteMail` — un état recréé à chaque appel provoquait un
 *      rendu, qui rappelait l'effet, qui recréait l'état.
 *
 * 🔒 Aucune donnée réelle : des nombres.
 */

const emp = (o: Partial<Empreinte> = {}): Empreinte => ({ messageMax: 100, filMax: 50, passeId: 1000, ...o });

describe('l’empreinte : trois nombres, et rien de plus', () => {
  it('deux empreintes identiques se reconnaissent', () => {
    expect(memeEmpreinte(emp(), emp())).toBe(true);
  });

  it('chacun des trois nombres suffit à la distinguer', () => {
    expect(memeEmpreinte(emp(), emp({ messageMax: 101 }))).toBe(false);
    expect(memeEmpreinte(emp(), emp({ filMax: 51 }))).toBe(false);
    expect(memeEmpreinte(emp(), emp({ passeId: 1001 }))).toBe(false);
  });

  it('l’empreinte vide est trois zéros — « on n’a rien pu mesurer », jamais « il y a du neuf »', () => {
    expect(EMPREINTE_VIDE).toEqual({ messageMax: 0, filMax: 0, passeId: 0 });
  });
});

describe('🔴 ce qui empêche la boucle de rendu qui a saturé la mémoire', () => {
  it('🔴 rien n’a changé ⇒ la MÊME RÉFÉRENCE est rendue, donc aucun rendu inutile', () => {
    const avant = emp();
    expect(empreinteSuivante(avant, emp())).toBe(avant);        // `toBe` : identité, pas égalité
  });

  it('quelque chose a changé ⇒ la nouvelle référence', () => {
    const avant = emp();
    const apres = emp({ messageMax: 101 });
    expect(empreinteSuivante(avant, apres)).toBe(apres);
  });

  it('🔴 MILLE battements sans changement ne fabriquent AUCUN objet neuf', () => {
    // C'est la mesure qui tient lieu de preuve de non-régression mémoire : si `empreinteSuivante` rendait un objet
    // neuf à chaque appel, la référence changerait, chaque battement provoquerait un rendu, et tout effet qui en
    // dépend repartirait — le mécanisme exact de l'incident `BoiteMail`.
    let courante = emp();
    const origine = courante;
    const vues = new Set<Empreinte>([courante]);
    for (let i = 0; i < 1000; i += 1) courante = empreinteSuivante(courante, emp());
    expect(courante).toBe(origine);
    expect(vues.size).toBe(1);
  });

  it('et mille battements AVEC changement n’en gardent qu’une à la fois', () => {
    // Rien ne s'accumule : on remplace, on n'ajoute jamais.
    let courante = emp();
    for (let i = 1; i <= 1000; i += 1) courante = empreinteSuivante(courante, emp({ messageMax: 100 + i }));
    expect(courante.messageMax).toBe(1100);
  });
});

describe('faut-il recharger, et QUOI ?', () => {
  it('🔴 la première mesure ne recharge RIEN : il n’y a rien à comparer', () => {
    expect(aRafraichir(null, emp())).toEqual({ donnees: false, bandeau: false });
  });

  it('rien n’a changé ⇒ rien à faire', () => {
    expect(aRafraichir(emp(), emp())).toEqual({ donnees: false, bandeau: false });
  });

  it('🔴 une passe qui tourne SANS rien capturer ne fait pas relire tout l’écran', () => {
    // Sinon on relirait la file, les cartes, les compteurs, la veille et la copie CHAQUE MINUTE pour déplacer une
    // phrase de quelques secondes.
    expect(aRafraichir(emp(), emp({ passeId: 1001 }))).toEqual({ donnees: false, bandeau: true });
  });

  it('un message de plus fait relire les données ET le bandeau', () => {
    expect(aRafraichir(emp(), emp({ messageMax: 101 }))).toEqual({ donnees: true, bandeau: true });
  });

  it('un échange de plus aussi', () => {
    expect(aRafraichir(emp(), emp({ filMax: 51 }))).toEqual({ donnees: true, bandeau: true });
  });
});

describe('🔴 quand le battement se retient', () => {
  const ok = { visible: true, chargementEnCours: false, gesteEnCours: false, releveEnCours: false };

  it('il bat quand tout est calme', () => {
    expect(peutBattre(ok)).toBe(true);
  });

  it('🔴 jamais pendant un geste en vol — il remettrait la liste d’AVANT le geste qu’on vient de faire', () => {
    expect(peutBattre({ ...ok, gesteEnCours: true })).toBe(false);
    expect(peutBattre({ ...ok, chargementEnCours: true })).toBe(false);
    expect(peutBattre({ ...ok, releveEnCours: true })).toBe(false);
  });

  it('ni sur un onglet caché : personne ne le regarde, et le navigateur ralentit ses minuteries', () => {
    expect(peutBattre({ ...ok, visible: false })).toBe(false);
  });

  it('la période est nommée, jamais dispersée — deux fois plus rapide que la relève', () => {
    expect(PERIODE_BATTEMENT_MS).toBe(30_000);
  });
});

describe('🔴 ce qu’on ne détruit JAMAIS', () => {
  const calme = { rechercheEnCours: false, pagesSupplementaires: false, selectionEnCours: false };

  it('une liste au repos se relit d’elle-même', () => {
    expect(listePeutSeRecharger(calme)).toBe(true);
  });

  it('🔴 une recherche tapée n’est jamais effacée par un rafraîchissement', () => {
    expect(listePeutSeRecharger({ ...calme, rechercheEnCours: true })).toBe(false);
  });

  it('🔴 ni les pages déroulées par « Voir plus »', () => {
    expect(listePeutSeRecharger({ ...calme, pagesSupplementaires: true })).toBe(false);
  });

  it('ni une sélection en cours', () => {
    expect(listePeutSeRecharger({ ...calme, selectionEnCours: true })).toBe(false);
  });

  it('la mention annonce sans rien imposer, et se tait quand il n’y a rien', () => {
    expect(mentionCourrierNouveau(0)).toBe('');
    expect(mentionCourrierNouveau(-3)).toBe('');
    expect(mentionCourrierNouveau(1)).toContain('Un message est arrivé');
    expect(mentionCourrierNouveau(4)).toContain('4 messages sont arrivés');
  });
});

/** 🔴 CE QUE LE BATTEMENT NE DOIT JAMAIS FAIRE, vérifié sur la source de l'écran. */
describe('les garanties du battement dans l’écran', () => {
  const sansCommentaires = (src: string): string => src
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .split('\n').filter((l) => !l.trimStart().startsWith('//') && !l.trimStart().startsWith('*')).join('\n');

  const vue = sansCommentaires(readFileSync('app/(admin)/admin/(protected)/gestion/GestionVue.tsx', 'utf8'));
  const boite = sansCommentaires(readFileSync('app/(admin)/admin/(protected)/gestion/BoiteMail.tsx', 'utf8'));
  /**
   * ⚠️ ON DÉCOUPE DU DÉBUT DU BATTEMENT À SA FIN, et non jusqu'à une déclaration voisine : `redaction` est déclaré
   * bien AVANT dans le fichier, si bien qu'une tranche prise jusqu'à lui était VIDE — et deux assertions passaient
   * alors sur une chaîne vide, c'est-à-dire ne prouvaient rien. Le tableau de dépendances de l'effet est son repère
   * de fin, et il est unique.
   */
  const debutBattement = vue.indexOf('const empreinte = useRef');
  const finBattement = vue.indexOf('}, [rafraichirDiscret, gesteEnCours, releveEnCours]);');
  const battement = vue.slice(debutBattement, finBattement);

  it('🔴 la minuterie est TOUJOURS annulée — sinon elle survit au démontage et s’empile', () => {
    expect(vue).toContain('clearInterval(minuterie)');
    expect(vue).toContain("document.removeEventListener('visibilitychange', surVisibilite)");
  });

  it('🔴 l’empreinte vit dans une RÉFÉRENCE, pas dans un état : la comparer ne déclenche aucun rendu', () => {
    expect(vue).toContain('const empreinte = useRef<Empreinte | null>(null)');
    expect(vue).not.toContain('useState<Empreinte');
  });

  it('🔴 un battement ne peut pas se chevaucher lui-même', () => {
    expect(vue).toContain('const enVol = useRef(false)');
    expect(vue).toContain('if (!vivant || enVol.current) return;');
    expect(vue).toContain('enVol.current = false');
  });

  it('🔴 le rafraîchissement DISCRET ne referme aucun panneau et ne blanchit pas l’écran', () => {
    const discret = vue.slice(vue.indexOf('const rafraichirDiscret'), vue.indexOf('const empreinte = useRef'));
    expect(discret).not.toContain('setPanneau(null)');
    expect(discret).not.toContain("setVue({ etat: 'charge' })");
    // …alors que le rechargement DEMANDÉ, lui, fait les deux : c'est la différence entre les deux chemins.
    const demande = vue.slice(vue.indexOf('const charger = useCallback'), vue.indexOf('const rafraichirDiscret'));
    expect(demande).toContain('setPanneau(null)');
  });

  it('la tranche du battement n’est pas vide — sans quoi les assertions ci-dessous ne prouveraient rien', () => {
    expect(debutBattement).toBeGreaterThan(0);
    expect(finBattement).toBeGreaterThan(debutBattement);
    expect(battement.length).toBeGreaterThan(400);
  });

  it('🔴 le battement n’interroge QUE l’empreinte — jamais l’écran complet', () => {
    expect(battement).toContain("fetch('/api/admin/gestion/empreinte'");
    expect(battement).not.toContain("fetch('/api/admin/gestion'");
  });

  it('l’heure avance à CHAQUE battement, même sans changement — c’est le correctif du « il y a 46 s » figé', () => {
    expect(battement).toContain('setMaintenant(new Date())');
    // Et l'appel n'est pas enfermé dans la branche « les données ont changé ».
    const avantBranche = battement.slice(0, battement.indexOf('if (quoi.donnees)'));
    expect(avantBranche).toContain('setMaintenant(new Date())');
  });

  it('🔴 la liste ne se relit que si elle peut le faire sans rien perdre', () => {
    expect(boite).toContain('listePeutSeRecharger(');
    expect(boite).toContain('if (!peutSeRecharger) return;');
  });

  it('🔴 la taille de page n’est PAS importée de `boiteRepo` : ce module tire `pg`', () => {
    // L'importer dans un composant client a fait tomber toute l'application le 24/09/2026.
    expect(boite).not.toContain('PAGE_BOITE');
    const imports = [...boite.matchAll(/^import\s+(?!type\b)[^;]*from\s*'([^']*)'/gm)].map((m) => m[1]);
    expect(imports.filter((i) => /boiteRepo|db\/client/.test(i))).toHaveLength(0);
  });

  it('le bouton « Rafraîchir » n’a pas été retiré', () => {
    expect(vue).toContain('Rafraîchir');
  });

  /**
   * ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
   * 🔴 LE DRAPEAU `bandeau` EST CONSOMMÉ — ET C'EST LE CŒUR DU CORRECTIF DU 27/09/2026.
   *
   * `aRafraichir` le calculait déjà pour exactement le bon cas (« une passe a eu lieu, mais aucun message n'est
   * arrivé »), et RIEN ne le lisait. L'horloge avançait toutes les 30 s, l'heure de la dernière passe restait celle
   * du chargement de la page, et au bout de dix intervalles le bandeau annonçait « arrêtée » alors que la relève
   * tournait chaque minute. Un drapeau calculé que personne ne lit est pire qu'un drapeau absent : il donne
   * l'impression que le cas est traité.
   * ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
   */
  it('🔴 le battement met à jour l’état de veille À CHAQUE tour, hors de la branche « les données ont changé »', () => {
    expect(battement).toContain('setVeilleVive(');
    const avantBranche = battement.slice(0, battement.indexOf('if (quoi.donnees)'));
    expect(avantBranche).toContain('setVeilleVive(');
    // Et par `veilleSuivante`, qui garde la même référence quand rien n'a changé : pas de rendu inutile.
    expect(battement).toContain('veilleSuivante(v, apres.veille');
  });

  it('🔴 le bandeau ET l’en-tête jugent sur la valeur FRAÎCHE, pas sur celle du chargement', () => {
    // Une seule source pour les deux : c'est ce qui a manqué le 27/09, où l'en-tête disait « 01:31 » à côté d'un
    // bandeau « arrêtée depuis 12 min » — deux lectures du même fait, l'une gelée, l'autre vivante.
    expect(vue).toContain('veilleAAfficher(');
    // Par FRAGMENTS, pas sur la forme exacte de l'appel : `mesureLe` s'y est ajouté, et le figer aurait cassé sans
    //   rien apprendre. Ce qui compte est que la valeur fraîche entre dans le calcul et dans l'en-tête.
    expect(vue).toMatch(/etatVeille\(\{[^}]*\.\.\.veilleFraiche/);
    expect(vue).toContain('derniereReleveLe: veilleFraiche.derniereLe ?? d.derniereReleveLe');
    // 🔴 Et la date du dernier battement RÉUSSI voyage avec, sans quoi « je ne sais pas » ne pourrait pas être dit.
    expect(vue).toMatch(/etatVeille\(\{[^}]*mesureLe/);
    expect(vue).toContain('setMesureLe(new Date().toISOString())');
  });

  it('la route du battement rapporte l’état de veille, sans requête de plus', () => {
    const route = readFileSync('app/(admin)/api/admin/gestion/empreinte/route.ts', 'utf8');
    expect(route).toContain('WITH derniere AS');
    expect(route).toContain('passe_le');
    expect(route).toContain('mail_le');
    /**
     * 🔒 TOUJOURS AUCUNE DONNÉE PERSONNELLE. On inspecte le SQL ÉMIS, pas le texte du fichier : le mot « objet »
     * figure légitimement dans le commentaire qui explique justement qu'on ne le lit pas. Un garde qui crie sur ses
     * propres commentaires finit par être désarmé.
     */
    const sql = (/const \{ rows \} = await query<[\s\S]*?>\(\s*`([\s\S]*?)`\)/.exec(route)?.[1] ?? '')
      .split('\n').filter((l) => !l.trimStart().startsWith('--')).join('\n');
    expect(sql.length).toBeGreaterThan(200); // le SQL a bien été retrouvé : sinon le test ne prouverait rien
    for (const interdit of ['objet', 'de_adresse', 'corps_texte', 'destinataires']) {
      expect(sql, interdit).not.toContain(interdit);
    }
  });
});

/**
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * 🔴 LE TEST QUI AURAIT ATTRAPÉ LA FAUSSE ALERTE DU 27/09/2026 — demandé par Arno.
 *
 * Preuve à l'appui de son côté : `svv-gestion-continu.log` montre une passe CHAQUE MINUTE de 01:05 à 01:45 sans un
 * seul trou, et `gestion_releve_run` porte les 41 lignes correspondantes. Le bandeau annonçait pourtant « arrêtée
 * depuis 12 min ». Aucun test ne pouvait le voir, parce qu'aucun ne faisait avancer l'HORLOGE et les PASSES ensemble.
 *
 * Les deux scénarios ci-dessous sont donc joués tour par tour, comme le battement les vit réellement.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */
describe('🔴 quinze minutes de passes vides, et onze minutes sans passe', () => {
  const T0 = Date.parse('2026-09-27T01:05:00Z');
  const REGLAGES = { erreur: null, intervalleS: 60, toleranceIntervalles: 10 };

  /**
   * Joue `minutes` minutes de battements (deux par minute, comme en vrai : 30 s de période).
   * `passeAvance` dit si l'ordonnanceur tourne. Rend l'état du bandeau à la FIN.
   */
  const jouer = (minutes: number, passeAvance: boolean) => {
    // Ce que la PAGE portait à son chargement : la passe de T0. Elle ne sera plus jamais relue.
    const page = { derniereLe: new Date(T0).toISOString(), resultat: 'ok' as const, dernierMailLe: null };
    let vive: VeilleVive | null = null;
    let empreinteVue: Empreinte | null = null;
    let maintenant = T0;

    for (let tour = 1; tour <= minutes * 2; tour += 1) {
      maintenant = T0 + tour * 30_000;
      const passeNum = passeAvance ? Math.floor(tour / 2) : 0;
      // La charge utile que la route rend à ce battement. Aucun message n'arrive JAMAIS : messageMax est constant.
      const apres: Empreinte = { messageMax: 100, filMax: 50, passeId: 1000 + passeNum };
      const veilleRoute: VeilleVive = {
        derniereLe: new Date(T0 + passeNum * 60_000).toISOString(),
        resultat: 'ok',
        dernierMailLe: null,
      };
      aRafraichir(empreinteVue, apres);          // appelé comme dans le battement, pour la forme exacte
      empreinteVue = empreinteVue === null ? apres : empreinteSuivante(empreinteVue, apres);
      // 🔴 CE PAS EST LE CORRECTIF. Avant, il n'existait pas : `vive` restait `null` et le bandeau jugeait `page`.
      vive = veilleSuivante(vive, veilleRoute);
    }
    return etatVeille({ ...REGLAGES, ...veilleAAfficher(page, vive) }, new Date(maintenant));
  };

  it('🔴 QUINZE MINUTES DE PASSES VIDES → AUCUN BANDEAU. C’est le défaut signalé', () => {
    const e = jouer(15, true);
    expect(e.niveau).toBe('ok');
    expect(e.texte).not.toContain('arrêtée');
    // Et la phrase dit une ancienneté FRAÎCHE, pas quinze minutes.
    expect(e.texte).toContain('dernière passe');
  });

  it('🔴 ONZE MINUTES SANS AUCUNE PASSE → BANDEAU. L’alerte doit rester capable de crier', () => {
    const e = jouer(11, false);
    expect(e.niveau).toBe('arretee');
    expect(e.texte).toContain('arrêtée depuis');
  });

  it('à dix intervalles pile, on ne crie pas encore : le seuil est un dépassement, pas une égalité', () => {
    expect(jouer(10, false).niveau).toBe('ok');
  });

  /**
   * ⚠️ ET LA PREUVE QUE LE TEST EST BIEN CALIBRÉ : sans le pas `veilleSuivante` — c'est-à-dire le code d'AVANT —
   * quinze minutes de passes vides déclenchent le bandeau. Un test qui passerait aussi sur le code fautif ne
   * prouverait rien.
   */
  it('🔴 sans la mise à jour du battement, les mêmes quinze minutes CRIENT — le code d’avant', () => {
    const page = { derniereLe: new Date(T0).toISOString(), resultat: 'ok' as const, dernierMailLe: null };
    const avant = etatVeille({ ...REGLAGES, ...page }, new Date(T0 + 15 * 60_000));
    expect(avant.niveau).toBe('arretee');
    expect(avant.texte).toContain('arrêtée depuis 15 min');
  });
});
