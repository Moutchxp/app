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

  it('sans aucun lien, la ligne dit « rien pour l’instant » et garde son bouton', async () => {
    await monter([]);
    expect(ligneBiens()?.querySelector('.ert-vide')?.textContent).toBe('rien pour l’instant');
    expect(boutonPar(/^Rattacher à un bien$/)).toBeDefined();
  });

  it('🔴 RIEN N’EST RETIRÉ : le lien garde « Modifier » et « Retirer »', async () => {
    await monter([lien()]);
    expect(boutonPar(/^Modifier$/)).toBeDefined();
    expect(boutonPar(/^Retirer$/)).toBeDefined();
  });
});

describe('🔴 le MENU s’ouvre JUSTE SOUS la ligne', () => {
  it('il n’est pas là au repos', async () => {
    await monter([lien()]);
    expect(container.querySelector('.mrb')).toBeNull();
  });

  /**
   * 🔴 LOT BIEN-RATTACHE — UNE SEULE ENTRÉE. Il y avait deux portes pour la même question : ce lien, et le bloc
   * des propositions ouvert en permanence. On cochait dans l'un, on validait dans l'autre.
   */
  it('🔴 au clic, il apparaît — et son VOISIN PRÉCÉDENT est la ligne elle-même', async () => {
    await monter([lien()]);
    await cliquer(boutonPar(/^Rattacher à un bien$/));

    const tete = ligneBiens();
    expect(tete).not.toBeNull();
    /**
     * 🔴 LA PREUVE DE POSITION, et non une preuve de présence. Avant ce lot, le sélecteur existait aussi — mais
     * tout en bas de l'encart. On vérifie donc qu'il suit IMMÉDIATEMENT la ligne dans le DOM : c'est exactement
     * ce qu'Arno a demandé, et c'est ce qui casserait si quelqu'un le redéplaçait.
     */
    const suivant = tete?.nextElementSibling;
    expect(suivant).not.toBeNull();
    expect(suivant?.classList.contains('mrb')).toBe(true);
    // 🔴 ET IL PORTE LA RECHERCHE : c'est la fusion des deux anciennes portes.
    expect(suivant?.textContent ?? '').toContain('Chercher un autre bien');
  });

  it('il se referme, et la ligne reprend son lien', async () => {
    await monter([lien()]);
    await cliquer(boutonPar(/^Rattacher à un bien$/));
    expect(boutonPar(/^Rattacher à un bien$/)).toBeUndefined();
    await cliquer(boutonPar(/^Annuler$/));
    expect(boutonPar(/^Rattacher à un bien$/)).toBeDefined();
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

  it('la recherche manuelle d’un bien reste accessible', async () => {
    await monter([lien()]);
    expect(boutonPar(/^Rattacher à un bien$/)).toBeDefined();
  });
});
