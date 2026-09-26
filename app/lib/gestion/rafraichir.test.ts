import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  aRafraichir, empreinteSuivante, listePeutSeRecharger, memeEmpreinte, mentionCourrierNouveau, peutBattre,
  EMPREINTE_VIDE, PERIODE_BATTEMENT_MS, type Empreinte,
} from './rafraichir';

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
});
