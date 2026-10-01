// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { EncartRattachement } from './EncartRattachement';

/**
 * 🔴 LOT FICHE-PROPOSITION — LA LIGNE DES BIENS RATTACHÉS, ET OÙ S'OUVRE LA RECHERCHE.
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * Deux demandes d'Arno, toutes deux mesurables à l'écran :
 *   ④ la ligne s'intitule « Bien(s) rattaché(s) : » — elle parle des BIENS, jamais des événements, et son ancien
 *      intitulé « Rattaché à » pouvait se lire comme « rattaché à une carte », qui est l'autre question du module ;
 *   ④ au clic sur « + Rattacher à… », la recherche s'ouvre JUSTE SOUS cette ligne. Elle s'ouvrait tout en bas de
 *      l'encart : on cliquait en haut, et le champ de saisie apparaissait hors du regard.
 *
 * 🔴 ET RIEN N'EST RETIRÉ : les gestes de la ligne (Modifier, Retirer, + Rattacher à…) sont tous encore là.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

const lien = (o: Record<string, unknown> = {}) => ({
  id: 1, messageId: 900, pieceId: null, cible: { sorte: 'lot', cle: '442', id: null },
  libelle: '22 Boulevard Richard Wallace, PUTEAUX — lot 442', origine: 'manuel', statut: 'confirme',
  confiance: null, regle: 'a', motif: null, adresses: [], parUnHumain: true,
  creeLe: null, creePar: null, statutLe: null, statutPar: null, ...o,
});

/** LOT CONTACTS-ET-EVENEMENT — ce que la route rend pour l'événement de ce mail. Piloté par le test. */
let evenementDuMail: Record<string, unknown> | null;
/**
 * 🔴 CORRECTIF DU 28/09/2026 — LA 268 VIENT DE LA RÉPONSE DU SERVEUR, plus d'une propriété du composant.
 *
 * Ces deux tests passaient `evenementQualifie` en propriété. Ils prouvaient donc le composant… mais pas le
 * CÂBLAGE : dans l'application, personne ne passait cette propriété, et sa valeur par défaut `false` faisait
 * annoncer « 268 à appliquer » sur une base à jour. On pilote désormais le drapeau par la RÉPONSE de la route,
 * c'est-à-dire par le chemin réel.
 */
let migration268: boolean;
let appels: { url: string; methode: string; corps: unknown }[];

beforeEach(() => {
  container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
  evenementDuMail = null;
  migration268 = true;
  appels = [];
  global.fetch = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    const u = String(url);
    const methode = init?.method ?? 'GET';
    appels.push({
      url: u, methode,
      corps: typeof init?.body === 'string' ? JSON.parse(init.body) : null,
    });
    // L'événement effectif du mail : c'est le sujet des tests de la partie B.
    if (u.includes('/affectation')) {
      if (methode === 'GET') {
        return {
          ok: true, json: async () => ({ etat: 'ok', evenement: evenementDuMail, qualifie: migration268 }),
        } as unknown as Response;
      }
      return { ok: true, json: async () => ({ ok: true }) } as unknown as Response;
    }
    // La recherche de l'annuaire, et le contexte des propositions : ni l'une ni l'autre n'est le sujet ici.
    if (u.includes('/classement?message=')) {
      return { ok: true, json: async () => ({ etat: 'ok', contexte: { disponible: true, biens: [] } }) } as unknown as Response;
    }
    // La recherche d'événements : volontairement VIDE ici, et SANS le champ `evenements` — c'est le cas qui
    //   faisait tomber le sélecteur avant ce lot, et qu'on veut donc garder sous le test.
    return { ok: true, json: async () => ({ etat: 'ok', data: [] }) } as unknown as Response;
  }) as unknown as typeof fetch;
});
afterEach(() => { act(() => { root.unmount(); }); container.remove(); vi.restoreAllMocks(); });

const calmer = async () => { await act(async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); }); };
const monter = async (liens: unknown[], props: Record<string, unknown> = {}) => {
  await act(async () => {
    root.render(createElement(EncartRattachement, {
      messageId: 900, filId: 101, liens, onChange: () => {}, ...props,
    } as never));
  });
  await calmer();
};
const boutons = () => [...container.querySelectorAll('button')] as HTMLButtonElement[];
const boutonPar = (m: RegExp) => boutons().find((b) => m.test(b.textContent ?? ''));
const cliquer = async (e: Element | null | undefined) => {
  await act(async () => { (e as HTMLElement | undefined)?.click(); }); await calmer();
};

/**
 * 🔴 LOT CONTACTS-ET-EVENEMENT — DEUX LIGNES, ET IL FAUT LES DISTINGUER. L'encart porte maintenant le bloc
 * « Événement rattaché : » EN TÊTE, puis « Bien(s) classé(s) : ». Les deux partagent la mise en page (`ert-tete`) :
 * un sélecteur qui les confondrait désignerait un jour l'autre. `bev-tete` marque celle de l'événement.
 */
const ligneBiens = () => container.querySelector('.ert-tete:not(.bev-tete)');
const ligneEvenement = () => container.querySelector('.ert-tete.bev-tete');

describe('🔴 la ligne des biens s’intitule « Bien(s) rattaché(s) : »', () => {
  it('le titre est celui des BIENS, et plus « Rattaché à »', async () => {
    await monter([lien()]);
    expect(ligneBiens()?.querySelector('.ert-titre')?.textContent).toBe('Bien(s) rattaché(s) :');
  });

  it('🔴 il ne parle PAS d’événement : c’est l’autre question du module', async () => {
    await monter([lien()]);
    expect((ligneBiens()?.querySelector('.ert-titre')?.textContent ?? '').toLowerCase())
      .not.toContain('événement');
  });

  /**
   * 🔴🔴 LOT CLASSER-SUR-CHAQUE-MAIL — CE TEST A CHANGÉ DE PROMESSE, PARCE QUE LE LIEN A ÉTÉ SUPPRIMÉ.
   *
   * IL DISAIT : « …et garde son bouton », en parlant du lien rouge « Rattacher à un bien ». Demande d'Arno :
   * « Il prend la place physique du lien rouge “Rattacher à un bien”, qui est SUPPRIMÉ. » Ce sont désormais les
   * DEUX CASES, à l'extrémité droite, qui portent le geste — et elles en portent trois, pas une.
   */
  it('🔴🔴 sans aucun lien : « rien pour l’instant », et les DEUX CASES à droite', async () => {
    await monter([]);
    expect(ligneBiens()?.querySelector('.ert-vide')?.textContent).toBe('rien pour l’instant');
    // Le lien rouge a disparu…
    expect(boutonPar(/^Rattacher à un bien$/)).toBeUndefined();
    // …et les deux cases du module de classement l'ont remplacé.
    const cases = [...container.querySelectorAll('.ccl-case')];
    expect(cases).toHaveLength(2);
    expect(cases[0].textContent).toContain('Rattacher');
    expect(cases[0].className).toContain('ccl-case--rouge');
    expect(cases[1].textContent).toContain('Interne');
  });

  /** 🔴 « Version compacte, à la hauteur du bloc » (Arno) : c'est le même composant, dans sa variante compacte. */
  it('🔴 le module est en version COMPACTE, et à l’extrémité droite de la rangée', async () => {
    await monter([]);
    const rangee = container.querySelector('.ert-rangee');
    expect(rangee).not.toBeNull();
    const ccl = rangee?.querySelector('.ccl');
    expect(ccl?.className).toContain('ccl--compact');
    // DERNIER de la rangée : c'est ce que veut dire « à l'extrémité droite ».
    expect(rangee?.lastElementChild).toBe(ccl);
  });

  it('🔴 RIEN N’EST RETIRÉ : le lien garde « Modifier » et « Retirer »', async () => {
    await monter([lien()]);
    expect(boutonPar(/^Modifier$/)).toBeDefined();
    expect(boutonPar(/^Retirer$/)).toBeDefined();
  });
});

/**
 * ══ 🔴🔴 LOT CLASSER-SUR-CHAQUE-MAIL — LE PANNEAU EN LIGNE EST DEVENU **LA MODALE** ══════════════════════════
 *
 * ARNO (point 4) : « Clic sur la case verte “Rattaché” → la modale “Rattacher ce mail à…” s'ouvre avec les biens
 * actuellement rattachés COCHÉS, plus les propositions et le moteur de recherche. »
 *
 * 🔴 C'EST LA MÊME FENÊTRE QUE LA RÉDACTION, et c'est tout l'objet de ce lot : un seul geste, une seule fenêtre,
 * des deux côtés de l'application. Le panneau `MenuRattachementBien` n'est pas mort pour autant — il reste la
 * fenêtre « Visualiser / Modifier » de l'en-tête.
 */
describe('🔴🔴 la MODALE « Rattacher ce mail à… », la même qu’à la rédaction', () => {
  it('elle n’est pas là au repos', async () => {
    await monter([lien()]);
    expect(container.querySelector('.rec-voile')).toBeNull();
  });

  it('🔴 la case ROUGE l’ouvre, avec le moteur de recherche', async () => {
    await monter([]);
    await cliquer(container.querySelector('.ccl-case--rouge'));
    const modale = container.querySelector('.rec-voile');
    expect(modale).not.toBeNull();
    expect(modale?.textContent ?? '').toContain('Rattacher ce mail à');
    expect(modale?.textContent ?? '').toContain('Moteur de recherche');
  });

  /** 🔴 « avec les biens actuellement rattachés COCHÉS » — c'est le correctif du compteur bloqué à « 1 ». */
  it('🔴🔴 la case VERTE la rouvre avec le bien déjà rattaché COCHÉ et VISIBLE', async () => {
    await monter([lien()]);
    await cliquer(container.querySelector('.ccl-case--verte'));
    const cases = [...container.querySelectorAll('.rec-biens input[type="checkbox"]')] as HTMLInputElement[];
    expect(cases).toHaveLength(1);
    expect(cases[0].checked).toBe(true);
    expect(container.querySelector('.rec-biens')?.textContent).toContain('22 Boulevard Richard Wallace');
    // Le compteur du bouton dit le VRAI nombre, celui des cases visibles.
    expect(boutonPar(/^Valider — 1 bien\(s\)$/)).toBeDefined();
  });

  /**
   * 🔴🔴 LE DÉFAUT D'ARNO, REJOUÉ : « il reste bloqué à “1” alors que rien n'est coché dans la liste visible ».
   * Décocher la seule case doit faire tomber le compteur à zéro — et le bouton s'intituler « aucun bien ».
   */
  it('🔴🔴 décocher tout : le compteur tombe à ZÉRO, et le bouton le dit', async () => {
    await monter([lien()]);
    await cliquer(container.querySelector('.ccl-case--verte'));
    await cliquer(container.querySelector('.rec-biens input[type="checkbox"]'));
    expect(boutonPar(/^Valider — aucun bien$/)).toBeDefined();
    expect(boutonPar(/^Valider — aucun bien$/)?.disabled).toBe(false);
  });

  /** 🔴 « valider retire tous les rattachements » : un PATCH `retire`, jamais une suppression. */
  it('🔴🔴 valider à 0 RETIRE le rattachement, sans rien supprimer', async () => {
    await monter([lien()]);
    await cliquer(container.querySelector('.ccl-case--verte'));
    await cliquer(container.querySelector('.rec-biens input[type="checkbox"]'));
    await cliquer(boutonPar(/^Valider — aucun bien$/));
    const patch = appels.find((a) => a.methode === 'PATCH' && a.url.includes('/rattachements'));
    expect(patch?.corps).toMatchObject({ lienId: 1, statut: 'retire' });
    // …et aucune suppression n'est jamais émise.
    expect(appels.some((a) => a.methode === 'DELETE' && a.url.includes('/rattachements'))).toBe(false);
  });

  /**
   * 🔴🔴 LE PARCOURS COMPLET QU'ARNO DEMANDE EN TEST : « passer de Rattaché à Interne ».
   *
   * Il tient en trois temps, et aucun n'est évident seul : on décoche, on valide à zéro (le lien est RETIRÉ, pas
   * supprimé), les deux cases reviennent — et c'est seulement là que « Interne » devient choisissable.
   */
  it('🔴🔴 de RATTACHÉ à INTERNE, de bout en bout', async () => {
    const vus: boolean[] = [];
    await monter([lien()], { interne: false, onInterne: (a: boolean) => { vus.push(a); } });
    expect(container.querySelector('.ccl-case--verte')?.textContent).toContain('Rattaché');

    await cliquer(container.querySelector('.ccl-case--verte'));
    await cliquer(container.querySelector('.rec-biens input[type="checkbox"]'));
    await cliquer(boutonPar(/^Valider — aucun bien$/));
    expect(appels.find((a) => a.methode === 'PATCH')?.corps).toMatchObject({ statut: 'retire' });

    // ⚠️ LE PARENT REND LA VÉRITÉ : le lien retiré, la conversation recharge et ne le passe plus.
    await monter([], { interne: false, onInterne: (a: boolean) => { vus.push(a); } });
    expect(container.querySelectorAll('.ccl-case')).toHaveLength(2);
    await cliquer([...container.querySelectorAll('.ccl-case')][1]);
    expect(vus).toEqual([true]);
  });

  it('la croix la referme sans rien écrire', async () => {
    await monter([lien()]);
    await cliquer(container.querySelector('.ccl-case--verte'));
    await cliquer(container.querySelector('.rec-croix'));
    expect(container.querySelector('.rec-voile')).toBeNull();
    expect(appels.some((a) => a.methode !== 'GET')).toBe(false);
  });

  /** 🔴 RIEN N'EST PERDU : la portée et « Hors gestion… » sont repris au pied de la modale. */
  it('🔴 la portée et « Hors gestion… » sont au pied de la modale', async () => {
    await monter([]);
    await cliquer(container.querySelector('.ccl-case--rouge'));
    const modale = container.querySelector('.rec-voile');
    expect(modale?.textContent ?? '').toContain('Toute la conversation');
    expect(modale?.textContent ?? '').toContain('Hors gestion, ou classer par pièce');
  });
});

/**
 * ══ 🔴🔴 LOT CLASSER-SUR-CHAQUE-MAIL — LA LIGNE « BIEN(S) RATTACHÉ(S) : » ET SON « voir plus » ════════════════
 *
 * ARNO (point 3) : « Affiche l'adresse complète du PREMIER bien (adresse — type — lot N). S'il y a plusieurs
 * biens, ou si l'adresse est tronquée : un petit lien “voir plus” au bout. Un clic déplie, juste en dessous,
 * l'adresse complète du premier bien puis tous les autres, une ligne chacun. “voir moins” replie. »
 */
describe('🔴🔴 la ligne montre le PREMIER bien, et se déplie', () => {
  const COURT = { ...lien(), id: 1, libelle: '4 rue Hugo — lot 12' };
  const AUTRE = {
    ...lien(), id: 2, cible: { sorte: 'lot', cle: '99', id: null },
    libelle: '2 rue Mars et Roty, 92800 PUTEAUX — Appartement Type 2 — lot 99',
  };

  it('🔴 un seul bien court : son libellé ENTIER, et aucun « voir plus »', async () => {
    await monter([COURT]);
    expect(ligneBiens()?.textContent).toContain('4 rue Hugo — lot 12');
    expect(boutonPar(/^voir plus/)).toBeUndefined();
  });

  it('🔴 plusieurs biens : seul le PREMIER est montré, avec « voir plus » et le compte', async () => {
    await monter([COURT, AUTRE]);
    expect(ligneBiens()?.textContent).toContain('4 rue Hugo — lot 12');
    expect(ligneBiens()?.textContent).not.toContain('lot 99');
    expect(boutonPar(/^voir plus \(2\)$/)).toBeDefined();
  });

  it('🔴🔴 « voir plus » déplie TOUS les biens, une ligne chacun — puis « voir moins » replie', async () => {
    await monter([COURT, AUTRE]);
    await cliquer(boutonPar(/^voir plus/));
    const lignes = [...container.querySelectorAll('.ert-liste .ert-ligne')];
    // Deux biens, plus la ligne qui porte « voir moins ».
    expect(lignes).toHaveLength(3);
    expect(container.textContent).toContain('4 rue Hugo — lot 12');
    expect(container.textContent).toContain('lot 99');

    await cliquer(boutonPar(/^voir moins$/));
    expect(container.textContent).not.toContain('lot 99');
    expect(boutonPar(/^voir plus/)).toBeDefined();
  });

  /** 🔴 « ou si l'adresse est tronquée » : un libellé long mérite « voir plus » même tout seul. */
  it('🔴 un seul bien, mais long : « voir plus » quand même, sans compte', async () => {
    await monter([AUTRE]);
    expect(boutonPar(/^voir plus$/)).toBeDefined();
  });

  /** 🔴 « Modifier » et « Retirer » RESTENT sur la ligne de gauche (Arno : « pour l'instant »). */
  it('🔴 « Modifier » et « Retirer » restent sur la ligne repliée', async () => {
    await monter([COURT, AUTRE]);
    expect(boutonPar(/^Modifier$/)).toBeDefined();
    expect(boutonPar(/^Retirer$/)).toBeDefined();
  });
});

/**
 * ══ 🔴🔴 LES TROIS ÉTATS DU MODULE, AU-DESSUS D'UN MAIL ═══════════════════════════════════════════════════════
 *
 * ARNO (point 1) : « Mail non rattaché (À classer) → deux boutons. Mail rattaché / Interne / Hors gestion →
 * case verte correspondante. »
 */
describe('🔴🔴 l’état du module suit celui du mail', () => {
  const vert = () => container.querySelector('.ccl-case--verte');

  it('🔴 mail À CLASSER : deux boutons', async () => {
    await monter([]);
    expect(vert()).toBeNull();
    expect(container.querySelectorAll('.ccl-case')).toHaveLength(2);
  });

  it('🔴 mail RATTACHÉ : case verte « Rattaché », avec le résumé par catégorie', async () => {
    await monter([lien()]);
    expect(vert()?.textContent).toContain('Rattaché');
    // Aucune catégorie connue (l'annuaire ne l'a pas dite) ⇒ compté comme un logement, jamais un trou.
    expect(container.querySelector('.ccl-case-detail')?.textContent).toBe('1 logement');
  });

  it('🔴 un PARKING rattaché se compte comme tel', async () => {
    await monter([{ ...lien(), categorie: 'parking' }]);
    expect(container.querySelector('.ccl-case-detail')?.textContent).toBe('1 parking');
  });

  it('🔴 échange INTERNE : case verte « Interne »', async () => {
    await monter([], { interne: true, onInterne: () => {} });
    expect(vert()?.textContent).toContain('Interne');
  });

  it('🔴 mail HORS GESTION : case verte « Hors gestion »', async () => {
    await monter([], { horsGestion: true, onHorsGestion: () => {} });
    expect(vert()?.textContent).toContain('Hors gestion');
  });

  /** 🔴 LA CASE BLANCHE POSE « INTERNE » SUR L'ÉCHANGE — le geste existant, par la route existante. */
  it('🔴 cliquer « Interne » demande la marque de l’ÉCHANGE', async () => {
    const vus: boolean[] = [];
    await monter([], { interne: false, onInterne: (a: boolean) => { vus.push(a); } });
    await cliquer([...container.querySelectorAll('.ccl-case')][1]);
    expect(vus).toEqual([true]);
  });

  /** 🔴 ET LA CASE VERTE LA RETIRE : « le statut repasse à “À classer” tant qu'un nouveau choix n'est pas fait ». */
  it('🔴🔴 cliquer la case verte « Interne » RETIRE la marque', async () => {
    const vus: boolean[] = [];
    await monter([], { interne: true, onInterne: (a: boolean) => { vus.push(a); } });
    await cliquer(vert());
    expect(vus).toEqual([false]);
  });

  it('🔴🔴 cliquer la case verte « Hors gestion » retire la marque du MAIL', async () => {
    const vus: boolean[] = [];
    await monter([], { horsGestion: true, onHorsGestion: (a: boolean) => { vus.push(a); } });
    await cliquer(vert());
    expect(vus).toEqual([false]);
  });

  /** ⚠️ ON NE SAIT RIEN (migration 281 absente) : la case blanche est inerte, avec son motif. */
  it('⚠️ sans la migration 281, « Interne » est grisée et dit pourquoi', async () => {
    await monter([], { interne: null });
    const blanche = [...container.querySelectorAll('.ccl-case')][1] as HTMLButtonElement;
    expect(blanche.disabled).toBe(true);
    expect(blanche.getAttribute('title')).toContain('migration 281');
  });
});

/* ══════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   🔴 LOT CONTACTS-ET-EVENEMENT — PARTIE B : LE BLOC « ÉVÉNEMENT RATTACHÉ »
   ══════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */
describe('🔴 B1 — le bloc « Événement rattaché » est EN TÊTE', () => {
  it('il précède la ligne des biens : c’est la première question qu’on se pose', async () => {
    await monter([lien()]);
    const html = container.innerHTML;
    expect(html.indexOf('Événement rattaché')).toBeLessThan(html.indexOf('Bien(s) rattaché(s)'));
  });

  it('🔴 sans événement, il dit « aucun » ET que c’est FACULTATIF — pas un travail en retard', async () => {
    await monter([lien()]);
    expect(ligneEvenement()?.textContent).toContain('aucun');
    expect(ligneEvenement()?.textContent).toContain('facultatif');
  });

  it('avec un événement, il le nomme et dit SUR QUOI il est posé', async () => {
    evenementDuMail = {
      evenementId: 12, reference: 'GES-2026-000012', objet: 'Fuite salle de bain', etat: 'a_traiter',
      portee: 'mail', categorie: 'fuite_eau', urgence: 'haute',
    };
    await monter([lien()]);
    const l = ligneEvenement()?.textContent ?? '';
    expect(l).toContain('GES-2026-000012');
    expect(l).toContain('Fuite salle de bain');
    expect(l).toContain('posé sur ce mail');
    // La catégorie et l'urgence sont écrites en MOTS, jamais portées par une couleur seule.
    expect(l).toContain('Fuite d’eau');
    expect(l).toContain('Urgence : Haute');
  });

  it('un événement hérité de l’échange est dit comme tel', async () => {
    evenementDuMail = {
      evenementId: 12, reference: 'GES-2026-000012', objet: 'X', etat: 'a_traiter',
      portee: 'conversation', categorie: null, urgence: null,
    };
    await monter([lien()]);
    expect(ligneEvenement()?.textContent).toContain('posé sur la conversation');
  });
});

describe('🔴 B1 — lier, créer, délier', () => {
  it('« Délier » n’apparaît PAS quand il n’y a rien à délier', async () => {
    await monter([lien()]);
    expect(boutonPar(/^Délier$/)).toBeUndefined();
  });

  it('…et il apparaît dès qu’un événement est lié', async () => {
    evenementDuMail = { evenementId: 12, reference: 'R', objet: 'X', etat: 'a_traiter', portee: 'mail',
      categorie: null, urgence: null };
    await monter([lien()]);
    expect(boutonPar(/^Délier$/)).toBeDefined();
  });

  it('🔴 « Lier à un événement » ouvre la recherche JUSTE SOUS la ligne de l’événement', async () => {
    await monter([lien()]);
    const ouvrir = boutons().find((b) => (b.textContent ?? '').trim() === 'Lier à un événement');
    await cliquer(ouvrir);
    const suivant = ligneEvenement()?.nextElementSibling;
    // La portée d'abord, puis la recherche : les deux sont sous la ligne, jamais en bas de page.
    expect(suivant?.textContent ?? '').toContain('Portée');
    expect(suivant?.nextElementSibling?.textContent ?? '').toContain('Lier à un événement');
  });

  it('la PORTÉE est le même choix que pour le classement, « ce mail » par défaut', async () => {
    await monter([lien()]);
    await cliquer(boutonPar(/^Créer un événement$/));
    const radios = [...container.querySelectorAll('input[name="bev-portee"]')] as HTMLInputElement[];
    expect(radios).toHaveLength(2);
    expect(radios[0].checked).toBe(true);
    expect(container.textContent).toContain('Ce mail uniquement');
    expect(container.textContent).toContain('Toute la conversation');
  });

  it('🔴 RIEN n’est écrit tant qu’on n’a pas validé : ouvrir le formulaire n’écrit pas', async () => {
    await monter([lien()]);
    await cliquer(boutonPar(/^Créer un événement$/));
    expect(appels.filter((a) => a.methode !== 'GET')).toEqual([]);
  });

  it('🔴 créer un événement le rattache AU BIEN, à son propriétaire et à son locataire', async () => {
    await monter([lien()]);
    await cliquer(boutonPar(/^Créer un événement$/));
    await cliquer(boutonPar(/^Créer et lier$/));

    const ecriture = appels.find((a) => a.methode === 'POST');
    expect(ecriture).toBeDefined();
    // Portée « ce mail » ⇒ la route du MESSAGE, jamais celle de l'échange.
    expect(ecriture?.url).toContain('/messages/900/affectation');
    const nouveau = (ecriture?.corps as { nouveau?: { objet?: string; parties?: unknown[] } }).nouveau;
    // Le titre est pré-rempli par le bien classé : c'est ce qu'on écrirait à la main neuf fois sur dix.
    expect(nouveau?.objet).toContain('lot 442');
    expect(nouveau?.parties).toContainEqual(
      { sorte: 'lot', cle: '442', libelle: '22 Boulevard Richard Wallace, PUTEAUX — lot 442' });
  });

  it('la portée « toute la conversation » écrit sur l’ÉCHANGE, l’autre chemin', async () => {
    await monter([lien()]);
    await cliquer(boutonPar(/^Créer un événement$/));
    const radios = [...container.querySelectorAll('input[name="bev-portee"]')] as HTMLInputElement[];
    await cliquer(radios[1]);
    await cliquer(boutonPar(/^Créer et lier$/));
    expect(appels.find((a) => a.methode === 'POST')?.url).toContain('/fils/101/affectation');
  });

  it('un titre vide est refusé, et rien n’est écrit', async () => {
    await monter([]);   // aucun bien classé ⇒ le titre n'est pas pré-rempli
    await cliquer(boutonPar(/^Créer un événement$/));
    await cliquer(boutonPar(/^Créer et lier$/));
    expect(appels.filter((a) => a.methode === 'POST')).toEqual([]);
    expect(container.textContent).toContain('Donnez un titre');
  });

  it('🔴 « Délier » passe par un DELETE — rien n’est supprimé, l’affectation reste datée en base', async () => {
    evenementDuMail = { evenementId: 12, reference: 'R', objet: 'X', etat: 'a_traiter', portee: 'mail',
      categorie: null, urgence: null };
    await monter([lien()]);
    await cliquer(boutonPar(/^Délier$/));
    expect(appels.find((a) => a.methode === 'DELETE')?.url).toContain('/messages/900/affectation');
  });

  it('sans la migration 268, ni catégorie ni urgence ne sont proposées — et on DIT pourquoi', async () => {
    migration268 = false;
    await monter([lien()]);
    await cliquer(boutonPar(/^Créer un événement$/));
    expect(container.querySelectorAll('select')).toHaveLength(0);
    expect(container.textContent).toContain('268 à appliquer');
  });

  it('🔴 LA 268 SE DEMANDE AU SERVEUR : aucune propriété à passer, sinon l’écran parle d’une base qu’il n’a pas lue',
    async () => {
      // C'est le défaut du 28/09/2026 : `evenementQualifie` valait `false` par défaut, la conversation ne le
      // passait pas, et le bloc annonçait « 268 à appliquer » sur une base à jour. Le montage ci-dessous ne passe
      // AUCUNE propriété de migration — et le choix doit quand même apparaître, parce que la ROUTE l'a dit.
      migration268 = true;
      await monter([lien()]);
      await cliquer(boutonPar(/^Créer un événement$/));
      expect(container.textContent).not.toContain('268 à appliquer');
      expect(container.querySelectorAll('select').length).toBeGreaterThan(0);
    });

  it('avec la migration 268, les quatre catégories d’Arno et les trois urgences sont offertes', async () => {
    await monter([lien()]);
    await cliquer(boutonPar(/^Créer un événement$/));
    const options = [...container.querySelectorAll('option')].map((o) => o.textContent);
    expect(options).toContain('Travaux');
    expect(options).toContain('Fuite d’eau');
    expect(options).toContain('Administratif');
    expect(options).toContain('Litige');
    expect(options).toContain('Critique');
  });
});

describe('🔴 B3 — rien n’est perdu', () => {
  it('les biens déjà classés restent visibles, avec Modifier et Retirer', async () => {
    await monter([lien()]);
    expect(ligneBiens()?.textContent).toContain('22 Boulevard Richard Wallace');
    expect(boutonPar(/^Modifier$/)).toBeDefined();
    expect(boutonPar(/^Retirer$/)).toBeDefined();
  });

  it('la recherche manuelle d’un bien reste accessible — par la case verte', async () => {
    await monter([lien()]);
    await cliquer(container.querySelector('.ccl-case--verte'));
    expect(container.querySelector('.rec-saisie')).not.toBeNull();
  });
});
