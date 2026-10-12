// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { EncartRattachement } from './EncartRattachement';
import { TITRE_BIENS_DU_MAIL } from '../../../../lib/gestion/ficheRattachement';
import { MOT_VALIDER_MAINTIEN, MOT_VALIDER_MODIFICATION } from '../../../../lib/gestion/porteeSuivi';

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
  /**
   * 🔴 LOT MODALE-RATTACHER-PROPRE — LES FAITS DU LOT, joints à la lecture. C'est d'eux que le TITRE se
   * compose (« adresse — Nature · Type »), et non du libellé figé ci-dessus, qui porte l'ancien format.
   */
  bien: {
    adresse: '22 Boulevard Richard Wallace', commune: 'PUTEAUX', nature: 'Appartement', typeBien: 'Type 2',
    immeuble: null,
  },
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
/** 🔴 LOT SUIVI-CONVERSATION — les périodes de la conversation. `null` = migration 290 absente. */
let suiviDuFil: { periodes: unknown[]; exceptions: unknown[]; mails: number[] } | null;

/** 🔴 LOT UNE-SEULE-FENETRE-DE-RATTACHEMENT — ce que la fenêtre commune lit : les liens montés, et leur bien. */
let liensDuFil: unknown[] = [];
const ficheDuFil = () => ({
  filId: 101, objet: 'Objet', nbMailsDuFil: 2, horsGestion: false, messageRecentId: 900,
  enTete: { messageId: 900, de: 'x@exemple.test', deNom: 'X', recuLe: '2026-03-10T10:00:00Z', objet: 'Objet' },
  disponible: true,
  biens: (liensDuFil as { cible: { sorte: string; cle: string | null }; statut: string }[])
    .filter((l) => l.cible.sorte === 'lot' && l.statut === 'confirme').slice(0, 1).map(() => ({
      cle: '442', lotId: 442, adresseComplete: '22 Boulevard Richard Wallace, 92800 PUTEAUX', numeroLot: '442',
      nature: 'Appartement', typeBien: 'Type 2', surfaceM2: null, statut: 'classe', dateMail: '2026-03-10', nbMails: 1,
      dossierDriveId: null, lienIds: [1], personnes: [],
    })),
});

beforeEach(() => {
  container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
  liensDuFil = [];
  evenementDuMail = null;
  migration268 = true;
  appels = [];
  suiviDuFil = null;
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
    /**
     * 🔴🔴 LOT SUIVI-CONVERSATION — LES PÉRIODES. Par défaut `sans_schema` : c'est l'état d'AUJOURD'HUI
     * (migration 290 livrée non appliquée), et les épreuves d'avant ce lot doivent continuer de passer tel
     * quel. Les épreuves du suivi, elles, posent `suiviDuFil` et obtiennent le nouveau chemin.
     */
    if (u.includes('/gestion/suivi')) {
      return {
        ok: true,
        json: async () => (suiviDuFil === null ? { etat: 'sans_schema' } : { etat: 'ok', ...suiviDuFil }),
      } as unknown as Response;
    }
    /* 🔴 LOT UNE-SEULE-FENETRE-DE-RATTACHEMENT — la fiche et les liens que lit la fenêtre commune. */
    if (u.includes('/rattachements?fiche=')) {
      return { ok: true, json: async () => ({ etat: 'ok', data: ficheDuFil() }) } as unknown as Response;
    }
    if (u.includes('/rattachements?fil=')) {
      return { ok: true, json: async () => ({ etat: 'ok', data: liensDuFil }) } as unknown as Response;
    }
    // 🔴 LOT MODALE-RATTACHER-PROPRE — la fiche que la pastille « i » demande, par la CLÉ du lot.
    if (u.includes('lotCle=')) {
      return {
        ok: true,
        json: async () => ({ etat: 'ok', data: {
          id: 55, numero: '442', nature: 'Appartement', typeBien: 'Type 2', immeuble: null,
          adresse: '22 Boulevard Richard Wallace', commune: 'PUTEAUX', codePostal: '92800',
          debut: '2020-06-01', fin: null, absent: false, surfaceM2: null, driveDossierId: null,
          proprietaireId: null, proprietaireCle: null, proprietaireNom: 'MARTY Jean', proprietaireContacts: [],
          occupations: [], proprietaires: [], occupants: [],
          modifiable: true, suppressionDisponible: true, evenementsOuverts: 0,
        } }),
      } as unknown as Response;
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
  liensDuFil = liens;
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

  /**
   * ══ 🔴🔴 LOT BLOC-CLASSER-COMPACT — « Modifier » ET « Retirer » ONT ÉTÉ RETIRÉS (accord explicite d'Arno) ══
   *
   * CE TEST DISAIT : « RIEN N'EST RETIRÉ : le lien garde “Modifier” et “Retirer” ». Ce n'est plus vrai, et
   * c'est voulu : « Ces actions passent par la case verte » (Arno). Changer de bien, c'est décocher l'un et
   * cocher l'autre dans la modale ; retirer, c'est décocher — et « Valider — aucun bien » retire tout.
   *
   * 🔴 CE QUI RESTE SUR LA LIGNE : l'adresse (qui ouvre l'historique d'un clic) et « automatique » s'il y a
   * lieu. C'est exactement ce qu'Arno décrit, et rien de plus.
   */
  it('🔴🔴 la ligne ne porte plus « Modifier » ni « Retirer »', async () => {
    await monter([lien()]);
    expect(boutonPar(/^Modifier$/)).toBeUndefined();
    expect(boutonPar(/^Retirer$/)).toBeUndefined();
  });

  /** 🔴 LE LIBELLÉ « LOGEMENT » A DISPARU AUSSI : l'adresse suit DIRECTEMENT le titre de la ligne. */
  it('🔴 « BIEN(S) RATTACHÉ(S) : » est suivi DIRECTEMENT de l’adresse', async () => {
    await monter([lien()]);
    const texte = (ligneBiens()?.textContent ?? '').replace(/\s+/g, ' ');
    expect(texte).not.toContain('LOGEMENT');
    expect(texte).not.toContain('Logement');
    // ⚠️ `textContent` NE REND PAS L'ESPACE que la mise en page pose entre deux éléments souples : on
    //   vérifie donc l'ENCHAÎNEMENT, qui est ce qu'Arno demande (« suivi DIRECTEMENT de l'adresse »).
    expect(texte).toContain('Bien(s) rattaché(s) :22 Boulevard Richard Wallace');
  });

  /** ⚠️ « automatique » NE S'ÉCRIT QUE S'IL Y A LIEU : un lien posé à la main n'a rien à signaler. */
  it('⚠️ « automatique » n’apparaît que pour un lien du moteur', async () => {
    await monter([{ ...lien(), parUnHumain: true }]);
    expect(ligneBiens()?.textContent).not.toContain('automatique');
    await monter([{ ...lien(), parUnHumain: false }]);
    expect(ligneBiens()?.textContent).toContain('automatique');
    // …et « à la main » ne s'écrit plus du tout : c'est le cas normal.
    expect(ligneBiens()?.textContent).not.toContain('à la main');
  });
});

/**
 * ══ 🔴🔴 LOT UNE-SEULE-FENETRE-DE-RATTACHEMENT — LES CASES OUVRENT LA FENÊTRE COMMUNE ═════════════════════════════════
 *
 * DÉCISION D'ARNO (12/10/2026) : la fenêtre « Bien(s) rattaché(s) à ce mail » de « Modifier le rattachement »
 * REMPLACE « Rattacher ce mail à… ». Les deux cases du bloc (rouge « Rattacher », verte « Rattaché ») l'ouvrent : le
 * bien rattaché y est une carte cochée, les propositions et le moteur de recherche en dessous, la glissière de la
 * portée, et « Autres classements » en bas.
 *
 * (Ces épreuves remplacent celles de la modale « Rattacher ce mail à… », lot CLASSER-SUR-CHAQUE-MAIL : même parcours,
 * même écriture — un lien RETIRÉ, jamais supprimé.)
 */
describe('🔴🔴 la fenêtre commune « Bien(s) rattaché(s) à ce mail »', () => {
  const titre = () => container.querySelector('#rdf-titre');
  const caseDuBienSuivi = () => container.querySelector('.rdf-suivi-carte input[type="checkbox"]') as HTMLInputElement | null;

  it('elle n’est pas là au repos', async () => {
    await monter([lien()]);
    expect(titre()).toBeNull();
  });

  it('🔴 la case ROUGE l’ouvre, avec le moteur de recherche', async () => {
    await monter([]);
    await cliquer(container.querySelector('.ccl-case--rouge'));
    expect(titre()?.textContent).toBe(TITRE_BIENS_DU_MAIL);
    expect(container.textContent ?? '').toContain('Moteur de recherche');
    // 🔴 L'ancienne fenêtre n'est plus montée : une seule fenêtre.
    expect(container.querySelector('.rec-voile')).toBeNull();
  });

  /** 🔴 « avec les biens actuellement rattachés COCHÉS » : la carte du bien suivi, cochée. */
  it('🔴🔴 la case VERTE l’ouvre avec le bien déjà rattaché COCHÉ et VISIBLE', async () => {
    await monter([lien()]);
    await cliquer(container.querySelector('.ccl-case--verte'));
    expect(caseDuBienSuivi()?.checked).toBe(true);
    expect(container.querySelector('.rdf-suivis')?.textContent).toContain('22 Boulevard Richard Wallace');
    // Sans modification, le bouton final dit qu'il ne change rien.
    expect(boutonPar(new RegExp(`^${MOT_VALIDER_MAINTIEN}$`))).toBeDefined();
  });

  it('🔴🔴 décocher tout : la glissière passe sur « One shot », et le bouton dit la modification', async () => {
    await monter([lien()]);
    await cliquer(container.querySelector('.ccl-case--verte'));
    await cliquer(caseDuBienSuivi());
    expect(container.querySelector('.rdf-suivi-carte')?.textContent).toContain('sera retiré');
    expect(boutonPar(new RegExp(`^${MOT_VALIDER_MODIFICATION}$`))?.disabled).toBe(false);
  });

  /** 🔴 « valider retire tous les rattachements » : un PATCH `retire`, jamais une suppression (sans la 290). */
  it('🔴🔴 valider à 0 RETIRE le rattachement, sans rien supprimer', async () => {
    await monter([lien()]);
    await cliquer(container.querySelector('.ccl-case--verte'));
    await cliquer(caseDuBienSuivi());
    await cliquer(boutonPar(new RegExp(`^${MOT_VALIDER_MODIFICATION}$`)));
    /* LOT HISTORIQUE-SORTIE-PAR-BIEN-ET-SIX-BOUTONS — décocher un bien confirmé sort le mail du suivi de ce bien : la
       question d'Arno est posée d'abord, et on y répond « Sortir du suivi ». */
    expect(document.querySelector('.red-conf-question')?.textContent).toContain('Il restera dans les autres historiques et pourra être restauré.');
    await cliquer([...document.querySelectorAll('.red-conf button')].find((b) => b.textContent === 'Sortir du suivi'));
    const patch = appels.find((a) => a.methode === 'PATCH' && a.url.includes('/rattachements'));
    expect(patch?.corps).toMatchObject({ lienId: 1, statut: 'retire' });
    // …et aucune suppression n'est jamais émise.
    expect(appels.some((a) => a.methode === 'DELETE' && a.url.includes('/rattachements'))).toBe(false);
  });

  /** 🔴🔴 LE PARCOURS COMPLET QU'ARNO DEMANDE EN TEST : « passer de Rattaché à Interne ». */
  it('🔴🔴 de RATTACHÉ à INTERNE, de bout en bout', async () => {
    const vus: boolean[] = [];
    await monter([lien()], { interne: false, onInterne: (a: boolean) => { vus.push(a); } });
    expect(container.querySelector('.ccl-case--verte')?.textContent).toContain('Rattaché');

    await cliquer(container.querySelector('.ccl-case--verte'));
    await cliquer(caseDuBienSuivi());
    await cliquer(boutonPar(new RegExp(`^${MOT_VALIDER_MODIFICATION}$`)));
    await cliquer([...document.querySelectorAll('.red-conf button')].find((b) => b.textContent === 'Sortir du suivi'));
    expect(appels.find((a) => a.methode === 'PATCH')?.corps).toMatchObject({ statut: 'retire' });

    // ⚠️ LE PARENT REND LA VÉRITÉ : le lien retiré, la conversation recharge et ne le passe plus.
    await monter([], { interne: false, onInterne: (a: boolean) => { vus.push(a); } });
    expect(container.querySelectorAll('button.ccl-case')).toHaveLength(2);
    await cliquer([...container.querySelectorAll('button.ccl-case')][1]);
    expect(vus).toEqual([true]);
  });

  it('la croix la referme sans rien écrire', async () => {
    await monter([lien()]);
    await cliquer(container.querySelector('.ccl-case--verte'));
    await cliquer(container.querySelector('.rdf-croix'));
    expect(titre()).toBeNull();
    expect(appels.some((a) => a.methode !== 'GET')).toBe(false);
  });

  it('[Fermer] en pied la referme sans rien écrire', async () => {
    await monter([lien()]);
    await cliquer(container.querySelector('.ccl-case--verte'));
    await cliquer(boutonPar(/^Fermer$/));
    expect(titre()).toBeNull();
    expect(appels.some((a) => a.methode !== 'GET')).toBe(false);
  });

  /** 🔴 RIEN N'EST PERDU : « Hors gestion… » est dans le bloc « Autres classements », en bas de la fenêtre. */
  it('🔴 « Hors gestion, ou classer par pièce… » est dans « Autres classements »', async () => {
    await monter([]);
    await cliquer(container.querySelector('.ccl-case--rouge'));
    const autres = container.querySelector('.rdf-autres');
    expect(autres?.textContent).toContain('Autres classements');
    expect(autres?.textContent).toContain('Hors gestion, ou classer par pièce');
    // Il ferme la fenêtre commune avant d'ouvrir la fenêtre de classement : jamais deux boîtes empilées.
    await cliquer([...(autres?.querySelectorAll('button') ?? [])].find((b) => /Hors gestion/.test(b.textContent ?? '')));
    expect(titre()).toBeNull();
  });

  it('🔴 « Classer dans une carte » et « Classer sans suite » y sont pour un mail « À classer », mêmes gestes', async () => {
    const choisis: string[] = [];
    await monter([], {
      aClasser: true,
      actionsDePied: [
        { cle: 'classer', libelle: 'Classer dans une carte', onChoisir: () => { choisis.push('classer'); } },
        { cle: 'sans_suite', libelle: 'Classer sans suite', onChoisir: () => { choisis.push('sans_suite'); } },
      ],
    });
    await cliquer(container.querySelector('.ccl-case--rouge'));
    const autres = container.querySelector('.rdf-autres');
    expect(autres?.textContent).toContain('Classer dans une carte');
    expect(autres?.textContent).toContain('Classer sans suite');
    await cliquer([...(autres?.querySelectorAll('button') ?? [])].find((b) => b.textContent === 'Classer sans suite'));
    expect(choisis).toEqual(['sans_suite']);
    expect(titre()).toBeNull();
  });
});

/**
 * ══ 🔴🔴 LOT BLOC-CLASSER-COMPACT — « TOUT TIENT SUR 2 LIGNES » ═══════════════════════════════════════════════
 *
 * ARNO : « Ligne 1 : ÉVÉNEMENT RATTACHÉ… (inchangée). Ligne 2 : BIEN(S) RATTACHÉ(S) : … Le module de droite est
 * centré verticalement sur la hauteur des DEUX lignes. Le texte de gauche prend la place restante (min-width: 0)
 * et ne passe jamais sous le module. »
 *
 * ⚠️ CE QUI SE VÉRIFIE ICI EST LA STRUCTURE, pas les pixels : jsdom ne met rien en page. La structure est
 * pourtant ce qui DÉCIDE de la mise en page — un module frère de la ligne 2 ne peut pas se centrer sur deux
 * lignes, quelle que soit la feuille de style.
 */
describe('🔴🔴 le bloc tient sur deux lignes, le module à droite des deux', () => {
  it('🔴🔴 la rangée n’a que DEUX enfants : la colonne de gauche, et le module', async () => {
    await monter([lien()]);
    const rangee = container.querySelector('.ert-rangee') as HTMLElement;
    expect(rangee.children).toHaveLength(2);
    expect(rangee.children[0].className).toContain('ert-colonne');
    expect(rangee.children[1].className).toContain('ccl');
  });

  it('🔴 la colonne porte les DEUX lignes : l’événement, puis les biens', async () => {
    await monter([lien()]);
    const colonne = container.querySelector('.ert-colonne') as HTMLElement;
    expect(colonne.querySelector('.bev-tete')).not.toBeNull();
    expect(colonne.querySelector('.ert-tete--biens')).not.toBeNull();
    // …et le module n'est PAS dedans : il est à côté, donc à droite des deux.
    expect(colonne.querySelector('.ccl')).toBeNull();
  });

  /**
   * 🔴🔴 LES TROIS RÈGLES QUI EMPÊCHENT L'ADRESSE DE POUSSER LE MODULE, et il faut les trois : ne pas
   * s'enrouler, pouvoir rétrécir, et ne laisser se comprimer QUE l'adresse.
   */
  it('🔴🔴 la ligne 2 ne s’enroule pas, peut rétrécir, et seule l’adresse se coupe', async () => {
    const { CSS_ENCART_RATTACHEMENT: css } = await import('./EncartRattachement');
    expect(css).toContain('.ert-tete--biens{flex-wrap:nowrap;min-width:0;overflow:hidden}');
    expect(css).toContain('.ert-tete--biens>*{flex:0 0 auto}');
    expect(css).toContain('.ert-premier>.ert-lien--coupe{flex:0 1 auto;min-width:0}');
    expect(css).toContain('text-overflow:ellipsis');
    // 🔴 LA COLONNE PEUT RÉTRÉCIR : sans `min-width:0`, le texte imposerait sa largeur naturelle.
    expect(css).toContain('.ert-colonne{display:flex;flex-direction:column;gap:6px;flex:1 1 auto;min-width:0}');
  });

  /** 🔴 UNE MARGE INTÉRIEURE ÉGALE, ET LE MODULE QUI NE TOUCHE PAS LE BORD (10 à 12 px, demande d'Arno). */
  it('🔴 la capsule garde 10 px en haut, en bas et sur les côtés', async () => {
    const { CSS_ENCART_RATTACHEMENT: css } = await import('./EncartRattachement');
    expect(css).toContain('padding:10px;');
    // L'interligne entre les deux lignes est RÉGULIER, et le même que celui de la colonne.
    expect(css).toContain('gap:6px');
  });

  /** 🔴 À LARGEUR RÉDUITE, le module passe SOUS les deux lignes, en pleine largeur. */
  it('🔴 sous 560 px, la rangée s’empile', async () => {
    const { CSS_ENCART_RATTACHEMENT: css } = await import('./EncartRattachement');
    const bloc = css.slice(css.indexOf('@media (max-width:560px)'));
    expect(bloc).toContain('flex-direction:column');
    expect(bloc).toContain('align-items:stretch');
    // 🔴 EN PLEINE LARGEUR, et pas seulement « a la ligne » : c'est le mot d'Arno.
    expect(bloc).toContain('.ert-rangee>.ccl--compact{width:100%}');
    // ⚠️ ET AUCUN ENTRE-DEUX : sans `nowrap`, le module decrocherait en gardant sa largeur, colle a gauche.
    expect(css).toContain('.ert-rangee{display:flex;flex-wrap:nowrap;');
  });

  /**
   * 🔴🔴 MÊME LARGEUR DANS LES DEUX ÉTATS, « pour qu'il n'y ait pas de saut à l'animation » : la largeur est
   * portée par le CONTENEUR, jamais par son contenu.
   */
  it('🔴🔴 le module a la même largeur à deux boutons et en case verte', async () => {
    const { CSS_CHAMP_CLASSEMENT: css } = await import('./ChampClassement');
    expect(css).toContain('.ccl--compact{gap:3px;width:clamp(210px, 30%, 320px);flex:0 0 auto;');
    // …et sa hauteur suit le bloc : les cases remplissent ce que le conteneur leur donne.
    expect(css).toContain('.ccl--compact .ccl-case{min-height:38px;height:100%');
    // ⚠️ …MAIS BORNÉE : déplié, le bloc triple de hauteur et la case verte deviendrait un pavé.
    expect(css).toContain('flex:1 1 auto;max-height:72px');
    expect(container.querySelector('.ccl-refaire')).toBeNull();
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
  /** ⚠️ LES TITRES VIENNENT DES FAITS DU LOT, plus du libellé figé : c'est tout l'objet du lot MODALE-…-PROPRE. */
  const COURT = {
    ...lien(), id: 1, libelle: '4 rue Hugo — lot 12',
    bien: { adresse: '4 rue Hugo', commune: null, nature: 'Studio', typeBien: null, immeuble: null },
  };
  const AUTRE = {
    ...lien(), id: 2, cible: { sorte: 'lot', cle: '99', id: null },
    libelle: '2 rue Mars et Roty, 92800 PUTEAUX — Appartement Type 2 — lot 99',
    bien: {
      adresse: '2 rue Mars et Roty', commune: 'PUTEAUX', nature: 'Appartement meublé', typeBien: 'Type 2',
      immeuble: null,
    },
  };
  const TITRE_COURT = '4 rue Hugo — Studio';
  const TITRE_AUTRE = '2 rue Mars et Roty, PUTEAUX — Appartement meublé · Type 2';

  it('🔴 un seul bien court : son libellé ENTIER, et aucun « voir plus »', async () => {
    await monter([COURT]);
    expect(ligneBiens()?.textContent).toContain(TITRE_COURT);
    // 🔴🔴 ET PLUS AUCUN NUMÉRO DE LOT DANS LE TITRE.
    expect(ligneBiens()?.textContent).not.toContain('lot 12');
    expect(boutonPar(/^voir plus/)).toBeUndefined();
  });

  it('🔴 plusieurs biens : seul le PREMIER est montré, avec « voir plus » et le compte', async () => {
    await monter([COURT, AUTRE]);
    expect(ligneBiens()?.textContent).toContain(TITRE_COURT);
    expect(ligneBiens()?.textContent).not.toContain('Mars et Roty');
    expect(boutonPar(/^voir plus \(2\)$/)).toBeDefined();
  });

  it('🔴🔴 « voir plus » déplie TOUS les biens, une ligne chacun — puis « voir moins » replie', async () => {
    await monter([COURT, AUTRE]);
    await cliquer(boutonPar(/^voir plus/));
    const lignes = [...container.querySelectorAll('.ert-liste .ert-ligne')];
    // Deux biens, plus la ligne qui porte « voir moins ».
    expect(lignes).toHaveLength(3);
    expect(container.textContent).toContain(TITRE_COURT);
    expect(container.textContent).toContain(TITRE_AUTRE);

    await cliquer(boutonPar(/^voir moins$/));
    expect(container.textContent).not.toContain('Mars et Roty');
    expect(boutonPar(/^voir plus/)).toBeDefined();
  });

  /**
   * ══ 🔴🔴 LOT AUCUNE-PROPOSITION-ET-ANIMATION-INVERSE — « VOIR PLUS » SEULEMENT S'IL Y A QUELQUE CHOSE EN PLUS
   *
   * CE TEST DISAIT L'INVERSE (« un libellé long mérite “voir plus” même tout seul »), parce que la troncature
   * était DEVINÉE sur la longueur. Arno : « le lien ne s'affiche que si la vue dépliée montre AU MOINS une
   * information absente de la ligne de base. Un seul bien, entièrement visible → pas de lien. » Un libellé long
   * qui tient n'est plus une raison d'ouvrir ; seule la coupure réelle en est une, et l'écran la MESURE.
   */
  it('🔴🔴 un seul bien, même long : AUCUN lien tant que rien n’est coupé', async () => {
    await monter([AUTRE]);
    expect(boutonPar(/^voir plus/)).toBeUndefined();
  });

  /** 🔴 L'AUTRE RAISON D'OUVRIR : une mention que la ligne ne porte pas. */
  it('🔴🔴 un bien posé sur UNE PIÈCE : le lien revient, car la ligne ne le dit pas', async () => {
    await monter([{ ...lien(), pieceId: 7 }]);
    expect(boutonPar(/^voir plus/)).toBeDefined();
    await cliquer(boutonPar(/^voir plus/));
    expect(container.querySelector('.ert-deplie')?.textContent).toContain('cette pièce seulement');
  });

  /**
   * 🔴 LE DÉPLIAGE VIT SOUS LA LIGNE 2, DANS LA COLONNE DE GAUCHE — jamais dans la rangée de la ligne 2, qui
   * ne s'enroule pas. Sans cela, déplier pousserait le module de droite hors du bloc.
   */
  it('🔴 le dépliage est SOUS la ligne 2, et ne touche pas au module', async () => {
    await monter([COURT, AUTRE]);
    await cliquer(boutonPar(/^voir plus/));
    const colonne = container.querySelector('.ert-colonne');
    const deplie = container.querySelector('.ert-deplie');
    expect(deplie).not.toBeNull();
    expect(colonne?.contains(deplie as Node)).toBe(true);
    // Le module est le FRÈRE de la colonne, pas son contenu : il reste à droite, intouché.
    expect(colonne?.querySelector('.ccl')).toBeNull();
    expect(container.querySelector('.ert-rangee > .ccl')).not.toBeNull();
  });

  /** 🔴 ET LE DÉPLIAGE NON PLUS NE PORTE « Modifier » / « Retirer » : une seule logique, repliée ou dépliée. */
  it('🔴 déplié, les lignes ne portent pas plus de gestes que repliées', async () => {
    await monter([COURT, AUTRE]);
    await cliquer(boutonPar(/^voir plus/));
    expect(boutonPar(/^Modifier$/)).toBeUndefined();
    expect(boutonPar(/^Retirer$/)).toBeUndefined();
  });
});

/**
 * ══ 🔴🔴 LOT UNE-SEULE-FENETRE-DE-RATTACHEMENT — LA PORTÉE : LA GLISSIÈRE REMPLACE LE BLOC À TROIS CHOIX ══════════════
 *
 * DÉCISION D'ARNO (12/10/2026) : « Les trois boutons ronds “Ce mail uniquement / Ce mail et la conversation à venir /
 * Toute la conversation” sont remplacés par la glissière : One shot / Ce mail + futurs échanges / Toute la
 * conversation. Mêmes effets. » (Ces épreuves remplacent celles du bloc « Suivi dans la conversation ».)
 */
describe('🔴🔴 la portée, sur la glissière de la fenêtre commune', () => {
  const PERIODE = {
    id: 1, depuisMessageId: 800, classement: { sorte: 'biens', biens: [{ cle: '442', libelle: 'lot 442' }] },
  };
  const ouvrir = async () => {
    await monter([lien()]);
    await cliquer(container.querySelector('.ccl-case--verte'));
  };
  const ouvrirEtChanger = async () => {
    await ouvrir();
    await cliquer(container.querySelector('.rdf-suivi-carte input[type="checkbox"]'));
  };
  const position = (mot: string) =>
    [...container.querySelectorAll('[role="radio"]')].find((e) => (e.textContent ?? '').includes(mot));

  it('🔴🔴 plus aucun bouton rond : les quatre positions de la glissière', async () => {
    suiviDuFil = { periodes: [PERIODE], exceptions: [], mails: [800, 900] };
    await ouvrir();
    expect(container.querySelectorAll('input[type="radio"]')).toHaveLength(0);
    expect([...container.querySelectorAll('[role="radio"]')].map((e) => e.textContent))
      .toEqual(['Origine', 'One shot', 'Ce mail + futurs échanges', 'Toute la conversation']);
    expect(container.textContent).not.toContain('Suivi dans la conversation');
  });

  it('🔴🔴 « Toute la conversation » alerte, et bloque la validation tant qu’on n’a pas confirmé', async () => {
    suiviDuFil = {
      periodes: [PERIODE], exceptions: [{ messageId: 801, classement: { sorte: 'biens', biens: [] } }],
      mails: [800, 801, 900],
    };
    await ouvrirEtChanger();
    await cliquer(position('Toute la conversation'));
    const alerte = container.querySelector('.rdf-alerte-texte')?.textContent ?? '';
    // Les AUTRES mails, moins ceux qui portent une exception (règle du modèle, `motConfirmationConversation`).
    expect(alerte).toContain('1 mail de cette conversation sera mis à jour');
    expect(alerte).toContain('1 exception est conservée');
    expect(boutonPar(new RegExp(`^${MOT_VALIDER_MODIFICATION}$`))?.disabled).toBe(true);
    await cliquer(container.querySelector('.rdf-alerte input[type="checkbox"]'));
    expect(boutonPar(new RegExp(`^${MOT_VALIDER_MODIFICATION}$`))?.disabled).toBe(false);
  });

  /** ⚠️ CHANGER DE POSITION REDEMANDE LA CONFIRMATION : on ne garde pas un « oui » donné pour autre chose. */
  it('⚠️ revenir sur une autre position remet la confirmation à zéro', async () => {
    suiviDuFil = { periodes: [PERIODE], exceptions: [], mails: [800, 900] };
    await ouvrirEtChanger();
    await cliquer(position('Toute la conversation'));
    await cliquer(container.querySelector('.rdf-alerte input[type="checkbox"]'));
    await cliquer(position('One shot'));
    await cliquer(position('Toute la conversation'));
    expect(boutonPar(new RegExp(`^${MOT_VALIDER_MODIFICATION}$`))?.disabled).toBe(true);
  });

  /** 🔴🔴 LA VALIDATION ENVOIE LA DÉCISION, EN UNE REQUÊTE — par la route du suivi, avec la portée choisie. */
  it('🔴🔴 valider envoie le classement ET la portée (« One shot » = `mail`)', async () => {
    suiviDuFil = { periodes: [PERIODE], exceptions: [], mails: [800, 900] };
    await ouvrirEtChanger();
    await cliquer(boutonPar(new RegExp(`^${MOT_VALIDER_MODIFICATION}$`)));
    const envoi = appels.find((a) => a.methode === 'POST' && a.url.includes('/gestion/suivi'));
    expect(envoi?.corps).toMatchObject({
      filId: 101, messageId: 900, choix: 'mail',
      classement: { sorte: 'biens', biens: [] },
    });
    // ⚠️ ET AUCUN GESTE MAIL PAR MAIL : la décision passe par UNE porte.
    expect(appels.some((a) => a.methode === 'PATCH')).toBe(false);
  });

  it('🔴 « Ce mail + futurs échanges » écrit la période (`suite`)', async () => {
    suiviDuFil = { periodes: [PERIODE], exceptions: [], mails: [800, 900] };
    await ouvrirEtChanger();
    await cliquer(position('Ce mail + futurs échanges'));
    await cliquer(boutonPar(new RegExp(`^${MOT_VALIDER_MODIFICATION}$`)));
    expect(appels.find((a) => a.methode === 'POST' && a.url.includes('/gestion/suivi'))?.corps)
      .toMatchObject({ choix: 'suite' });
  });
});

/**
 * ══ 🔴🔴 LOT MODALE-RATTACHER-PROPRE — LE TITRE SANS NUMÉRO, ET LA PASTILLE « i » ══════════════════════════════
 *
 * ARNO : « dans la ligne “BIEN(S) RATTACHÉ(S)” ainsi que dans le “voir plus”, le titre d'un bien devient
 * “adresse — Type de bien”. Le numéro de lot n'apparaît plus dans le titre. […] Même pastille dans la ligne
 * “BIEN(S) RATTACHÉ(S)” et dans le “voir plus”. »
 */
describe('🔴🔴 le titre du bien, et sa pastille, dans le bloc gris', () => {
  it('🔴🔴 le titre vient des FAITS du lot, pas du libellé figé en base', async () => {
    await monter([lien()]);
    const texte = ligneBiens()?.textContent ?? '';
    expect(texte).toContain('22 Boulevard Richard Wallace, PUTEAUX — Appartement · Type 2');
    expect(texte).not.toContain('lot 442');
  });

  /** ⚠️ SANS L'ANNUAIRE (migration 253 absente), on retombe sur le libellé enregistré : un nom d'hier vaut
   *  mieux qu'un bien sans nom. */
  it('⚠️ sans les faits du lot, le libellé enregistré fait le repli', async () => {
    await monter([{ ...lien(), bien: null }]);
    expect(ligneBiens()?.textContent).toContain('22 Boulevard Richard Wallace, PUTEAUX — lot 442');
  });

  it('🔴 la pastille est sur la ligne, et elle ouvre le descriptif', async () => {
    await monter([lien()]);
    const p = ligneBiens()?.querySelector('.ifb-pastille') as HTMLButtonElement;
    expect(p).not.toBeNull();
    await cliquer(p);
    // 🔴 LOT BULLE-INFO-ET-S12 — DANS LE DOCUMENT, PLUS DANS LE CONTENEUR : la bulle passe par un portail.
    const f = document.querySelector('.ifb-bulle');
    expect(f?.textContent).toContain('442');
    expect(f?.textContent).toContain('MARTY Jean');
    expect(f?.textContent).toContain('Ouvrir la fiche du bien');
  });

  it('🔴 et chaque bien du « voir plus » a la sienne', async () => {
    const AUTRE = {
      ...lien(), id: 2, cible: { sorte: 'lot', cle: '99', id: null },
      bien: { adresse: '2 rue Mars', commune: 'PUTEAUX', nature: 'Parking', typeBien: 'Garage', immeuble: null },
    };
    await monter([lien(), AUTRE]);
    await cliquer(boutonPar(/^voir plus/));
    expect(container.querySelectorAll('.ert-deplie .ifb-pastille')).toHaveLength(2);
    // 🔴 ET LE PARKING S'ÉCRIT SANS SON TYPE : la nature dit tout (module `titreBien`).
    expect(container.querySelector('.ert-deplie')?.textContent).toContain('2 rue Mars, PUTEAUX — Parking');
  });
});

/**
 * ══ 🔴🔴 LOT PROPOSITIONS-EMAILS-MULTIPLES — LA PASTILLE S'OUVRE AU SURVOL, ET NE RÉPÈTE PAS LA LIGNE ══════════
 *
 * ARNO (01/10/2026, point 3) : « Elle s'ouvre AU SURVOL (court délai d'environ 150 ms, se referme quand la souris
 * quitte la pastille et la fenêtre). Elle s'ouvre aussi au focus clavier. Au toucher (mobile), un appui l'ouvre.
 * Elle n'affiche que ce qui n'est PAS déjà sur la ligne. »
 */
describe('🔴🔴 la pastille « i » : survol, focus, et aucun doublon', () => {
  const pastille = () => ligneBiens()?.querySelector('.ifb-pastille') as HTMLElement;
  const racine = () => ligneBiens()?.querySelector('.ifb') as HTMLElement;
  /** 🔴 LOT BULLE-INFO-ET-S12 — la bulle est rendue dans `document.body` (portail), pour n'être jamais coupée. */
  const fenetre = () => document.querySelector('.ifb-bulle');
  const survoler = async (e: HTMLElement) => {
    await act(async () => { e.dispatchEvent(new MouseEvent('mouseover', { bubbles: true })); });
  };
  const quitter = async (e: HTMLElement) => {
    await act(async () => { e.dispatchEvent(new MouseEvent('mouseout', { bubbles: true })); });
  };
  const attendre = async (ms: number) => { await act(async () => { vi.advanceTimersByTime(ms); }); await calmer(); };

  beforeEach(() => { vi.useFakeTimers({ shouldAdvanceTime: true }); });
  afterEach(() => { vi.useRealTimers(); });

  /** 🔴 LE DÉLAI N'EST PAS UN CONFORT : sans lui, traverser une liste ouvrirait (et chargerait) chaque fenêtre. */
  it('🔴🔴 le survol n’ouvre PAS tout de suite…', async () => {
    await monter([lien()]);
    await survoler(pastille());
    expect(fenetre()).toBeNull();
    await attendre(100);
    expect(fenetre()).toBeNull();
  });

  it('🔴🔴 …et l’ouvre après le court délai', async () => {
    await monter([lien()]);
    await survoler(pastille());
    await attendre(200);
    expect(fenetre()).not.toBeNull();
  });

  /** ⚠️ QUITTER LA RACINE, PAS LE BOUTON : la fenêtre et la pastille sont le même ensemble. */
  it('🔴 quitter la pastille ET la fenêtre referme — après le délai de grâce', async () => {
    await monter([lien()]);
    await survoler(pastille());
    await attendre(200);
    expect(fenetre()).not.toBeNull();
    await quitter(racine());
    /**
     * 🔴🔴 LOT BULLE-INFO-ET-S12 — LA FERMETURE EST DÉSORMAIS DIFFÉRÉE, et ce n'est pas un détail d'essai : c'est
     * exactement ce qui rend le lien « Ouvrir la fiche du bien » atteignable (constat (b) d'Arno). Pendant la
     * grâce, la bulle est ENCORE LÀ — et elle le reste si la souris y entre.
     */
    expect(fenetre()).not.toBeNull();
    await attendre(250);
    expect(fenetre()).toBeNull();
  });

  it('⚠️ repartir avant la fin du délai n’ouvre rien du tout', async () => {
    await monter([lien()]);
    await survoler(pastille());
    await attendre(80);
    await quitter(racine());
    await attendre(400);
    expect(fenetre()).toBeNull();
  });

  it('🔴 le focus clavier l’ouvre, sans attendre', async () => {
    await monter([lien()]);
    await act(async () => { pastille().focus(); });
    await calmer();
    expect(fenetre()).not.toBeNull();
  });

  /** 🔴 AU TOUCHER, AUCUN SURVOL N'EXISTE : l'appui reste la porte, et il ne coche pas la case. */
  it('🔴 un appui (toucher) l’ouvre, et la referme', async () => {
    await monter([lien()]);
    await cliquer(pastille());
    expect(fenetre()).not.toBeNull();
    await cliquer(pastille());
    expect(fenetre()).toBeNull();
  });

  /**
   * 🔴🔴 AUCUN DOUBLON. La ligne écrit « 22 Boulevard Richard Wallace, PUTEAUX — Appartement · Type 2 » : la
   * fenêtre ne doit répéter ni l'adresse, ni la nature, ni le type — mais garder le n° de lot et le reste.
   */
  it('🔴🔴 elle n’affiche pas ce qui est déjà sur la ligne', async () => {
    await monter([lien()]);
    await cliquer(pastille());
    const libelles = [...(fenetre()?.querySelectorAll('.ifb-libelle') ?? [])].map((x) => x.textContent);
    expect(libelles).not.toContain('Adresse');
    expect(libelles).not.toContain('Nature');
    expect(libelles).not.toContain('Type');
    // …et ce qui n'est PAS sur la ligne reste : le n° de lot, la gestion, le propriétaire.
    expect(libelles).toContain('N° de lot');
    expect(libelles).toContain('Propriétaire');
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
    /* 🔴 LOT URGENCE-EVENEMENT, POINT 2 — le niveau `haute` s'écrit désormais « Intermédiaire ». La clé stockée
       n'a pas bougé ; c'est son LIBELLÉ qui vient de la source unique (`NIVEAUX_URGENCE`). */
    expect(l).toContain('Urgence : Intermédiaire');
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
    /**
     * 🔴 LOT URGENCE-EVENEMENT, POINT 2 — « Critique » EST DEVENU « Urgent », ici comme partout. Arno : « Le
     * niveau le plus haut s'appelle “Urgent” partout (création, modification, carte, fiche, filtres, bulles). »
     * Ce formulaire est la CRÉATION, et c'est donc le premier endroit où le mot devait changer.
     */
    expect(options).toContain('Normal');
    expect(options).toContain('Intermédiaire');
    expect(options).toContain('Urgent');
    expect(options).not.toContain('Critique');
  });
});

describe('🔴 B3 — rien n’est perdu', () => {
  it('les biens déjà classés restent visibles — et leurs gestes sont dans la case verte', async () => {
    await monter([lien()]);
    expect(ligneBiens()?.textContent).toContain('22 Boulevard Richard Wallace');
    // Le geste n'a pas disparu, il a UNE porte : la case verte ouvre la modale (modifier, décocher, valider).
    expect(container.querySelector('.ccl-case--verte')).not.toBeNull();
  });

  it('la recherche manuelle d’un bien reste accessible — par la case verte', async () => {
    await monter([lien()]);
    await cliquer(container.querySelector('.ccl-case--verte'));
    expect(container.querySelector('.rec-saisie')).not.toBeNull();
  });
});
