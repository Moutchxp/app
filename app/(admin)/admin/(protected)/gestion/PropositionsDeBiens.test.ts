// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { PropositionsDeBiens } from './PropositionsDeBiens';
// LOT FICHES-RETOUCHES — la MÊME fonction que l'écran : deux formatages, ce serait deux vérités.
import { formaterTelephone } from '../../../../lib/gestion/telephoneAffichage';

/**
 * 🔴 LOT AFFECTATION-PAR-BIEN — « UNE PROPOSITION À TRANCHER » : DES BIENS, ÉPROUVÉS À L'ÉCRAN.
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * LE DÉFAUT QU'ON CORRIGE, sur le cas réel d'Arno : le mail « Contestation de la retenue de 450 € sur dépôt de
 * garantie » affichait « PROPRIÉTAIRE MARTY Jean-François (310) ». Ce qui est protégé ici :
 *   ① chaque ligne est un BIEN — jamais une personne ;
 *   ② chacune porte son PROPRIÉTAIRE et son LOCATAIRE à la date du mail (« vacant » quand il n'y en a pas) ;
 *   ③ le MOTIF est écrit en clair ;
 *   ④ plusieurs biens sont cochables ;
 *   ⑤ 🔴 RIEN n'est écrit avant « Valider » — ouvrir, cocher, décocher : aucune requête d'écriture ;
 *   ⑥ une ancienne proposition « propriétaire » est rendue comme la LISTE DE SES BIENS, sans rien réécrire.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;
let appels: { url: string; methode: string }[];
let contexte: Record<string, unknown> | null;

/**
 * Une personne de l'annuaire. LOT FICHE-PROPOSITION : elle porte ses moyens de contact.
 * LOT CONTACTS-ET-EVENEMENT : chaque coordonnée porte le LIBELLÉ de sa colonne d'origine. Le raccourci ci-dessous
 * accepte une simple chaîne et lui donne un libellé numéroté, comme le fait l'import.
 */
/**
 * 🔴 LOT FICHES-RETOUCHES — LA COORDONNÉE PORTE DEUX FORMES, et le raccourci les fabrique toutes les deux :
 * `valeur` est la forme CANONIQUE (celle qu'on compare, et celle du lien `tel:`), `affichage` est celle qu'on LIT
 * (« 06 03 05 07 03 »). L'écran rend la seconde ; les épreuves ci-dessous vérifient donc la seconde.
 */
const coord = (l: string) => (v: unknown, i: number) => (typeof v === 'string'
  ? { valeur: v, affichage: formaterTelephone(v, ''), libelle: `${l} ${i + 1}` }
  : { ...(v as object), affichage: (v as { affichage?: string; valeur: string }).affichage
    ?? formaterTelephone((v as { valeur: string }).valeur, '') });
const partie = (role: string, nom: string, o: Record<string, unknown> = {}) => ({
  role, cle: nom, nom, ...o,
  emails: ((o.emails as unknown[]) ?? []).map(coord('Email')),
  telephones: ((o.telephones as unknown[]) ?? []).map(coord('Mobile')),
});
const bien = (cle: string, o: Record<string, unknown> = {}) => ({
  cle, libelle: `18 rue Danton, Levallois-Perret — lot ${cle}`, adresse: '18 rue Danton',
  commune: 'Levallois-Perret', typeBien: 'appartement',
  // LOT FICHE-PROPOSITION — l'adresse COMPLÈTE et les caractéristiques de l'import, calculées côté serveur.
  adresseComplete: '18 rue Danton, 92300 Levallois-Perret',
  caracteristiques: [{ libelle: 'Nature', valeur: 'Appartement' }, { libelle: 'Type', valeur: 'Type 4' }],
  parties: [partie('proprietaire', 'MARTY Jean-François'), partie('locataire', 'DUPONT Claire')],
  recommande: false, dejaRattache: false,
  motif: 'un des 2 biens de MARTY Jean-François', cas: 'c', certitude: 'a_trancher', ...o,
});
const CONTEXTE = (o: Record<string, unknown> = {}) => ({
  messageId: 900, filId: 101, dateMail: '2026-09-28', nbMailsDuFil: 1,
  proprietaire: { cle: 'P1', nom: 'MARTY Jean-François' },
  examen: { issue: 'a_trancher', motif: '2 bien(s) proposé(s), à trancher' },
  pieces: [], biens: [bien('310a'), bien('310b')], disponible: true, ...o,
});

beforeEach(() => {
  container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
  appels = [];
  contexte = CONTEXTE();
  global.fetch = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    const u = String(url);
    appels.push({ url: u, methode: init?.method ?? 'GET' });
    if (u.includes('/classement?message=')) {
      return {
        ok: true,
        json: async () => (contexte === null ? { etat: 'erreur' } : { etat: 'ok', contexte }),
      } as unknown as Response;
    }
    return { ok: true, json: async () => ({ ok: true }) } as unknown as Response;
  }) as unknown as typeof fetch;
});
afterEach(() => { act(() => { root.unmount(); }); container.remove(); vi.restoreAllMocks(); });

const calmer = async () => { await act(async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); }); };
const monter = async (props: Record<string, unknown> = {}) => {
  await act(async () => {
    root.render(createElement(PropositionsDeBiens, {
      messageId: 900, occupe: false, onChange: () => {}, onClasser: () => {}, ...props,
    } as never));
  });
  await calmer();
};
const boutons = () => [...container.querySelectorAll('button')] as HTMLButtonElement[];
const boutonPar = (m: RegExp) => boutons().find((b) => m.test(b.textContent ?? ''));
const cliquer = async (e: Element | null | undefined) => {
  await act(async () => { (e as HTMLElement | undefined)?.click(); }); await calmer();
};
const cases = () => [...container.querySelectorAll('input[type="checkbox"]')] as HTMLInputElement[];
const ecritures = () => appels.filter((a) => a.methode !== 'GET');

describe('🔴 ① chaque ligne est un BIEN, jamais une personne', () => {
  it('le bloc annonce des biens, avec leur adresse et leur n° de lot', async () => {
    await monter();
    expect(container.textContent).toContain('2 propositions à trancher');
    expect(container.textContent).toContain('18 rue Danton, 92300 Levallois-Perret');
    expect(container.textContent).toContain('— lot 310a');
    expect(cases()).toHaveLength(2);
  });

  it('🔴 aucune ligne ne s’intitule « Propriétaire … » comme cible', async () => {
    await monter();
    const titres = [...container.querySelectorAll('.pdb-nom')].map((e) => e.textContent ?? '');
    expect(titres.every((t) => t.includes('lot'))).toBe(true);
  });
});

describe('🔴 ② ③ le couple du bien, à la date du mail, et le motif en clair', () => {
  /**
   * 🔴 LOT FICHE-PROPOSITION — LA MISE EN PAGE A CHANGÉ, ET C'EST LE CHANGEMENT DEMANDÉ. Le couple tenait sur une
   * ligne « Propriétaire : … · Locataire : … ». Il est désormais STRUCTURÉ : le propriétaire en tête du groupe,
   * les locataires dans la colonne de droite du bien, chacun avec ses contacts.
   */
  it('le propriétaire est en tête du groupe, le locataire dans la colonne de droite', async () => {
    await monter();
    expect(container.querySelector('.pdb-proprios')?.textContent).toContain('MARTY Jean-François');
    expect(container.querySelector('.pdb-col--loc')?.textContent).toContain('DUPONT Claire');
  });

  it('🔴 un bien sans locataire à cette date est dit « vacant » — un blanc n’est pas une réponse', async () => {
    contexte = CONTEXTE({ biens: [bien('310a', { parties: [partie('proprietaire', 'MARTY Jean-François')] })] });
    await monter();
    expect(container.querySelector('.pdb-col--loc')?.textContent).toContain('Vacant à cette date');
  });

  it('le motif est affiché tel quel, et la certitude aussi', async () => {
    contexte = CONTEXTE({
      biens: [bien('445', {
        certitude: 'quasi_certaine', motif: 'locataire en place à la date du mail (x@y.fr)', cas: 'a',
      })],
    });
    await monter();
    expect(container.textContent).toContain('locataire en place à la date du mail');
    expect(container.textContent).toContain('Quasi certain');
  });

  it('ce que le moteur conclut est rappelé en tête', async () => {
    await monter();
    expect(container.textContent).toContain('2 bien(s) proposé(s), à trancher');
  });
});

describe('🔴 ④ plusieurs biens cochables, et la pré-coche vient du moteur', () => {
  it('aucune case n’est cochée quand le moteur n’en recommande aucune (cas c)', async () => {
    await monter();
    expect(cases().every((c) => c.checked === false)).toBe(true);
    expect(boutonPar(/^Valider$/)?.disabled).toBe(true);
    expect(container.textContent).toContain('Aucun bien coché');
  });

  it('la case pré-cochée par le moteur l’est à l’écran, et une seule fois', async () => {
    contexte = CONTEXTE({ biens: [bien('310a', { recommande: true }), bien('310b')] });
    await monter();
    expect(cases().map((c) => c.checked)).toEqual([true, false]);
    // …et la décocher ne la fait pas revenir au rendu suivant.
    await cliquer(cases()[0]);
    expect(cases().map((c) => c.checked)).toEqual([false, false]);
  });

  it('cocher DEUX biens en pose deux : un mail parle parfois de deux appartements', async () => {
    await monter();
    await cliquer(cases()[0]);
    await cliquer(cases()[1]);
    expect(container.textContent).toContain('1 mail classé sur 2 biens');
    await cliquer(boutonPar(/^Valider$/));
    const posts = ecritures();
    expect(posts).toHaveLength(2);
    expect(posts.every((a) => a.methode === 'POST' && a.url.includes('/rattachements'))).toBe(true);
  });
});

describe('🔴 ⑤ rien n’est écrit avant « Valider »', () => {
  it('ouvrir, cocher, décocher : aucune requête d’écriture', async () => {
    await monter();
    await cliquer(cases()[0]);
    await cliquer(cases()[1]);
    await cliquer(cases()[0]);
    expect(ecritures()).toEqual([]);
  });

  it('la lecture, elle, n’a lieu qu’UNE fois : pas une requête par ligne', async () => {
    await monter();
    expect(appels.filter((a) => a.url.includes('/classement?message='))).toHaveLength(1);
  });
});

describe('🔴 ⑥ une ancienne proposition « propriétaire » devient la liste de ses biens', () => {
  it('elle est montrée comme des biens, avec le motif qui dit d’où elle vient', async () => {
    contexte = CONTEXTE({
      biens: [
        bien('310a', { motif: 'ancienne proposition « propriétaire MARTY Jean-François » — voici ses biens' }),
        bien('310b', { motif: 'ancienne proposition « propriétaire MARTY Jean-François » — voici ses biens' }),
      ],
    });
    await monter();
    expect(container.textContent).toContain('ancienne proposition « propriétaire MARTY Jean-François »');
    // 🔴 ET RIEN N'EST RÉÉCRIT EN BASE tant que personne n'a validé.
    expect(ecritures()).toEqual([]);
  });
});

describe('les états où le bloc ne rend rien', () => {
  it('aucun bien proposable ⇒ le bloc disparaît, il n’affiche pas un cadre vide', async () => {
    contexte = CONTEXTE({ biens: [] });
    await monter();
    expect(container.querySelector('.pdb-liste')).toBeNull();
  });

  it('annuaire ou migration absents ⇒ rien non plus, et surtout aucune erreur rouge', async () => {
    contexte = CONTEXTE({ disponible: false, biens: [] });
    await monter();
    expect(container.textContent).not.toContain('erreur');
    expect(container.querySelector('.pdb-liste')).toBeNull();
  });

  it('une réponse de serveur plus ancienne que ce lot ne fait pas tomber l’écran', async () => {
    // Pas de `biens`, pas d'`examen`, pas de `pieces` : `undefined.length` ferait s'écrouler le bandeau.
    contexte = { messageId: 900, disponible: true };
    await monter();
    expect(container.querySelector('.pdb-liste')).toBeNull();
  });
});

/* ══════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   🔴 LOT FICHE-PROPOSITION — LA FICHE : PROPRIÉTAIRES EN HAUT, DEUX COLONNES, BOUTONS « COPIER »
   ══════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */
describe('🔴 ① les propriétaires, en haut, une carte par personne', () => {
  it('le bloc propriétaire précède les biens, avec nom, téléphone et e-mail', async () => {
    contexte = CONTEXTE({
      biens: [bien('310a', {
        parties: [
          partie('proprietaire', 'MARTY Jean-François', {
            emails: ['martyj.f@wanadoo.fr'], telephones: ['+33603050703'],
          }),
          partie('locataire', 'DUPONT Claire'),
        ],
      })],
    });
    await monter();
    const haut = container.querySelector('.pdb-proprios');
    expect(haut?.textContent).toContain('MARTY Jean-François');
    expect(haut?.textContent).toContain('martyj.f@wanadoo.fr');
    /* 🔴 LOT FICHES-RETOUCHES — L'ATTENTE EST RÉÉCRITE, LA RÈGLE EST INTACTE. Elle attendait « +33603050703»,
       la forme CANONIQUE. Arno a tranché : « Tout numéro affiché PAR L'APP est groupé par deux chiffres ». Ce qui
       était protégé — le numéro du propriétaire est bien là, sous son nom — l'est toujours, et mieux : on vérifie
       maintenant qu'il est LISIBLE. La forme canonique, elle, reste éprouvée sur le lien `tel:` plus bas. */
    expect(haut?.textContent).toContain('06 03 05 07 03');
    // …et il est bien AVANT la liste des biens dans le DOM.
    const html = container.innerHTML;
    expect(html.indexOf('pdb-proprios')).toBeLessThan(html.indexOf('pdb-liste'));
  });

  it('🔴 DEUX propriétaires différents ⇒ DEUX blocs : un seul ferait croire au même bailleur', async () => {
    contexte = CONTEXTE({
      biens: [
        bien('1', { parties: [partie('proprietaire', 'BAILLEUR A')] }),
        bien('2', { parties: [partie('proprietaire', 'BAILLEUR B')] }),
      ],
    });
    await monter();
    const blocs = [...container.querySelectorAll('.pdb-proprios')];
    expect(blocs).toHaveLength(2);
    expect(blocs[0].textContent).toContain('BAILLEUR A');
    expect(blocs[1].textContent).toContain('BAILLEUR B');
  });

  it('🔴 une INDIVISION reste UNE carte, avec ses deux adresses : découper le nom ferait deux fiches fausses', async () => {
    contexte = CONTEXTE({
      biens: [bien('1', {
        parties: [partie('proprietaire', 'MOTTAIS GRAINDORGE Didier et Sandrine', {
          emails: ['didier@x.fr', 'sandrine@x.fr'], telephones: ['+33600000000'],
        })],
      })],
    });
    await monter();
    const cartes = [...container.querySelectorAll('.pdb-proprios .pdb-carte')];
    expect(cartes).toHaveLength(1);
    expect(cartes[0].textContent).toContain('didier@x.fr');
    expect(cartes[0].textContent).toContain('sandrine@x.fr');
  });

  it('aucun propriétaire à l’annuaire : on le DIT, on ne laisse pas un blanc', async () => {
    contexte = CONTEXTE({ biens: [bien('1', { parties: [] })] });
    await monter();
    expect(container.querySelector('.pdb-proprios')?.textContent).toContain('Aucun propriétaire à l’annuaire');
  });

  it('une personne sans aucun contact : on le DIT aussi', async () => {
    await monter();
    expect(container.querySelector('.pdb-proprios')?.textContent).toContain('Aucun contact à l’annuaire');
  });
});

describe('🔴 ② les deux colonnes : le bien à gauche, ses locataires à droite', () => {
  it('chaque bien a ses deux colonnes', async () => {
    await monter();
    expect(container.querySelectorAll('.pdb-deux')).toHaveLength(2);
    expect(container.querySelectorAll('.pdb-col--bien')).toHaveLength(2);
    expect(container.querySelectorAll('.pdb-col--loc')).toHaveLength(2);
  });

  it('la colonne de gauche porte la case à cocher, l’adresse complète, le lot et les caractéristiques', async () => {
    await monter();
    const gauche = container.querySelector('.pdb-col--bien');
    expect(gauche?.querySelector('input[type="checkbox"]')).not.toBeNull();
    expect(gauche?.textContent).toContain('18 rue Danton, 92300 Levallois-Perret');
    expect(gauche?.textContent).toContain('lot 310a');
    expect(gauche?.textContent).toContain('Nature');
    expect(gauche?.textContent).toContain('Appartement');
    expect(gauche?.textContent).toContain('Type 4');
  });

  it('🔴 les CHAMPS ABSENTS de l’import ne sont pas affichés — pas même sous un tiret', async () => {
    contexte = CONTEXTE({ biens: [bien('310a', { caracteristiques: [] })] });
    await monter();
    const gauche = container.querySelector('.pdb-col--bien');
    expect(gauche?.querySelector('.pdb-carac')).toBeNull();
    expect(gauche?.textContent).not.toContain('Nature');
    // 🔴 Et surtout : rien d'inventé. La surface et l'étage ne sont pas dans l'import.
    expect((gauche?.textContent ?? '').toLowerCase()).not.toContain('surface');
    expect((gauche?.textContent ?? '').toLowerCase()).not.toContain('étage');
  });

  it('une réponse de serveur sans `caracteristiques` ne fait pas tomber l’écran', async () => {
    contexte = CONTEXTE({ biens: [{ ...bien('310a'), caracteristiques: undefined }] });
    await monter();
    expect(container.querySelector('.pdb-col--bien')).not.toBeNull();
  });

  it('la colonne de droite porte le locataire À LA DATE DU MAIL, sa période et ses contacts', async () => {
    contexte = CONTEXTE({
      biens: [bien('310a', {
        parties: [
          partie('proprietaire', 'MARTY Jean-François'),
          partie('locataire', 'ABIDI Aymen', {
            depuis: '2024-07-31', jusqua: '2026-09-12',
            emails: ['abidiaymen05@gmail.com'], telephones: ['+33605678857'],
          }),
        ],
      })],
    });
    await monter();
    const droite = container.querySelector('.pdb-col--loc');
    expect(droite?.textContent).toContain('à la date du mail');
    expect(droite?.textContent).toContain('ABIDI Aymen');
    expect(droite?.textContent).toContain('du 31/07/2024 au 12/09/2026');
    expect(droite?.textContent).toContain('abidiaymen05@gmail.com');
    // Même réécriture : la colonne de droite montre le numéro LU, groupé par deux.
    expect(droite?.textContent).toContain('06 05 67 88 57');
  });

  it('une COLOCATION rend DEUX cartes : n’en garder qu’une choisirait au hasard', async () => {
    contexte = CONTEXTE({
      biens: [bien('310a', {
        parties: [partie('locataire', 'L1'), partie('locataire', 'L2')],
      })],
    });
    await monter();
    expect(container.querySelectorAll('.pdb-col--loc .pdb-carte')).toHaveLength(2);
  });
});

describe('🔴 ③ le bouton « Copier », en face de chaque contact', () => {
  const contexteAvecContacts = () => CONTEXTE({
    biens: [bien('310a', {
      parties: [
        partie('proprietaire', 'MARTY Jean-François', {
          emails: ['martyj.f@wanadoo.fr'], telephones: ['+33603050703'],
        }),
        partie('locataire', 'DUPONT Claire', { emails: ['claire@x.fr'] }),
      ],
    })],
  });

  it('il y a un bouton par adresse ET par numéro', async () => {
    contexte = contexteAvecContacts();
    await monter();
    expect(boutons().filter((b) => /^Copier$/.test(b.textContent ?? ''))).toHaveLength(3);
  });

  it('🔴 un clic met la valeur dans le presse-papiers, et le DIT', async () => {
    const ecrit: string[] = [];
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: async (t: string) => { ecrit.push(t); } },
    });
    contexte = contexteAvecContacts();
    await monter();
    const premier = boutons().find((b) => /^Copier$/.test(b.textContent ?? ''));
    await cliquer(premier);
    /* 🔴 LOT FICHES-RETOUCHES — ON COPIE CE QU'ON LIT. L'attente portait la forme canonique ; elle porte
       maintenant la forme affichée. Ce n'est pas un détail : un numéro copié va dans un autre outil, un SMS, un
       carnet — et « +33603050703 » s'y relit aussi mal qu'ici. Le lien `tel:`, lui, reste bâti sur la canonique,
       et c'est éprouvé juste au-dessus : les espaces n'ont rien à faire dans un lien. */
    expect(ecrit).toEqual(['06 03 05 07 03']);
    // 🔴 LE RETOUR EST ÉCRIT : sans lui on reclique, et on ne sait jamais si le presse-papiers a pris.
    expect(premier?.textContent).toBe('Copié');
  });

  it('🔴 un presse-papiers qui refuse est DIT « Échec », jamais annoncé comme copié', async () => {
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: async () => { throw new Error('refusé'); } },
    });
    // `execCommand` n'existe pas dans jsdom : le second chemin échoue lui aussi, ce qui est le cas éprouvé ici.
    contexte = contexteAvecContacts();
    await monter();
    const premier = boutons().find((b) => /^Copier$/.test(b.textContent ?? ''));
    await cliquer(premier);
    expect(premier?.textContent).toBe('Échec');
  });

  it('les contacts sont aussi CLIQUABLES : `mailto:` pour écrire, `tel:` pour appeler', async () => {
    contexte = contexteAvecContacts();
    await monter();
    const liens = [...container.querySelectorAll('a')].map((a) => a.getAttribute('href'));
    expect(liens).toContain('mailto:martyj.f@wanadoo.fr');
    expect(liens).toContain('tel:+33603050703');
  });

  it('un numéro qui n’en est pas un reste du texte : un lien d’appel mort vaut moins que rien', async () => {
    contexte = CONTEXTE({
      biens: [bien('310a', { parties: [partie('proprietaire', 'X', { telephones: ['n° inconnu'] })] })],
    });
    await monter();
    expect([...container.querySelectorAll('a')].some((a) => (a.getAttribute('href') ?? '').startsWith('tel:')))
      .toBe(false);
    expect(container.textContent).toContain('n° inconnu');
  });
});

/* ══════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   🔴 LOT CONTACTS-ET-EVENEMENT — A3 : UNE CARTE PAR PERSONNE, AUCUNE COORDONNÉE ORPHELINE
   ══════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */
describe('🔴 A3 — chaque coordonnée porte un NOM et un LIBELLÉ', () => {
  /** Le cas d'Arno : fil 36488, lot 494, « MARS AVENIR » avec deux téléphones et deux e-mails en vrac. */
  const marsAvenir = () => CONTEXTE({
    biens: [bien('494', {
      libelle: '2 Rue Mars et Roty, PUTEAUX — lot 494',
      adresseComplete: '2 Rue Mars et Roty, 92800 PUTEAUX',
      parties: [
        { ...partie('proprietaire', 'MARS AVENIR'), civilite: 'Sté',
          telephones: [
            { valeur: '+33669142807', affichage: '06 69 14 28 07', libelle: 'Mobile 1' },
            { valeur: '+33760201010', affichage: '07 60 20 10 10', libelle: 'Mobile 2' }],
          emails: [{ valeur: 'a.jorel@sansvisavis.com', libelle: 'Email 1' },
            { valeur: 'c.jullien@sansvisavis.com', libelle: 'Email 2' }] },
        { ...partie('locataire', 'SARL MACJ'),
          telephones: [{ valeur: '+33760201010', affichage: '07 60 20 10 10', libelle: 'Mobile 1' }],
          emails: [{ valeur: 'c.jullien@sansvisavis.com', libelle: 'Email 1' }] },
      ],
    })],
  });

  /**
   * ══ 🔴 RÈGLE RÉÉCRITE LE 30/09/2026 (lot CONTACT-LIGNES) ═══════════════════════════════════════════════════
   *
   * ELLE ATTENDAIT LE LIBELLÉ D'ORIGINE sur chaque ligne (« Mobile 1 », « Mobile 2 », « Email 2 »). Arno a
   * tranché : le titre porte le TYPE — MOBILE, FIXE, E-MAIL — et ne s'écrit QU'UNE FOIS par groupe.
   *
   * CE QUE LA RÈGLE PROTÉGEAIT — « plus rien en vrac » : chaque coordonnée est sous un nom, et sa nature est
   * dite — est intact, et c'est ce qu'on éprouve ici. Ce qui change, c'est QUEL mot la dit : « Mobile » plutôt
   * que « Mobile 1 ». Le numéro de colonne ne parlait qu'à celui qui avait lu l'export.
   */
  it('🔴 CHAQUE coordonnée est sous un nom, et son TYPE est dit une fois par groupe', async () => {
    contexte = marsAvenir();
    await monter();
    const carte = container.querySelector('.pdb-proprios .pdb-carte');
    expect(carte?.textContent).toContain('MARS AVENIR');
    expect(carte?.textContent).toContain('06 69 14 28 07');
    expect(carte?.textContent).toContain('07 60 20 10 10');
    expect(carte?.textContent).toContain('c.jullien@sansvisavis.com');
    // Le TYPE, écrit une seule fois par groupe : un « Mobile », un « E-mail », et pas un de plus.
    const titres = [...(carte?.querySelectorAll('.pdb-etiquette') ?? [])]
      .map((e) => e.textContent ?? '').filter((t) => t.trim() !== '');
    expect(titres).toEqual(['Mobile', 'E-mail']);
  });

  /**
   * ══ 🔴 RÈGLE RÉÉCRITE (lot CONTACT-LIGNES) ═════════════════════════════════════════════════════════════════
   * Elle exigeait une étiquette NON VIDE sur CHAQUE ligne — c'était le bon garde tant que chaque ligne portait
   * la sienne. Maintenant que le titre ne s'écrit qu'une fois par groupe, les lignes SUIVANTES ont une cellule
   * de titre vide, exprès : c'est cela, « le titre n'apparaît qu'une fois, en face du premier ».
   *
   * CE QUE LA RÈGLE PROTÉGEAIT — aucune coordonnée rendue SANS qu'on sache ce qu'elle est — se vérifie
   * désormais au GROUPE : le premier de chaque groupe porte son titre, et aucun groupe n'est anonyme.
   */
  it('🔴 aucune coordonnée n’est rendue sans que son groupe soit titré', async () => {
    contexte = marsAvenir();
    await monter();
    const contacts = [...container.querySelectorAll('.pdb-proprios .pdb-contact')];
    expect(contacts.length).toBe(4);
    // La 1re et la 3e portent le titre de leur groupe ; la 2e et la 4e sont des suites, et leur case est vide.
    const titres = contacts.map((c) => (c.querySelector('.pdb-etiquette')?.textContent ?? '').trim());
    expect(titres).toEqual(['Mobile', '', 'E-mail', '']);
    // 🔴 LA CELLULE EXISTE TOUJOURS, même vide : sans elle, la valeur remonterait d'une colonne.
    for (const c of contacts) expect(c.querySelector('.pdb-etiquette')).not.toBeNull();
  });

  it('🔴 chaque contact est dans une CARTE qui porte un nom : aucune coordonnée orpheline', async () => {
    contexte = marsAvenir();
    await monter();
    for (const c of [...container.querySelectorAll('.pdb-contact')]) {
      const carte = c.closest('.pdb-carte');
      expect(carte).not.toBeNull();
      expect((carte?.querySelector('.pdb-personne')?.textContent ?? '').trim()).not.toBe('');
    }
  });

  it('une SOCIÉTÉ est dite « Société » : on ne cherche pas un prénom qui n’existe pas', async () => {
    contexte = marsAvenir();
    await monter();
    expect(container.querySelector('.pdb-proprios .pdb-qualite')?.textContent).toBe('Société');
  });

  /** ⚠️ MÊME RÉÉCRITURE, MÊME MOTIF : le bouton nomme le TYPE de ce qu'il copie, et non le numéro de colonne. */
  it('le bouton Copier nomme la coordonnée QU’IL copie, type compris', async () => {
    contexte = marsAvenir();
    await monter();
    const libelles = boutons().map((b) => b.getAttribute('aria-label') ?? '');
    expect(libelles).toContain('Copier Mobile de MARS AVENIR');
    expect(libelles).toContain('Copier E-mail de MARS AVENIR');
  });

  it('le locataire suit la même règle, dans sa colonne', async () => {
    contexte = marsAvenir();
    await monter();
    const droite = container.querySelector('.pdb-col--loc');
    expect(droite?.textContent).toContain('SARL MACJ');
    // Le TYPE, pas le numéro de colonne — la même règle que pour le propriétaire.
    expect(droite?.textContent).toContain('Mobile');
    expect(droite?.textContent).toContain('07 60 20 10 10');
  });

  /**
   * ⚠️ RÉÉCRITE (lot CONTACT-LIGNES) : sans la migration 267, `libelleContact` rend « E-mail » et « E-mail 2 ».
   * Les deux se rangent dans le MÊME type, et le titre ne s'écrit donc qu'une fois. Ce que la règle protégeait —
   * un libellé jamais vide, même sans la colonne d'origine — tient toujours : le groupe est titré.
   */
  it('🔴 sans la migration 267, le TYPE reste écrit : générique, mais jamais vide', async () => {
    // C'est ce que rend `libelleContact` côté serveur quand la colonne d'origine est inconnue.
    contexte = CONTEXTE({
      biens: [bien('1', {
        parties: [{ ...partie('proprietaire', 'DUPONT Jean'),
          emails: [{ valeur: 'a@x.fr', libelle: 'E-mail' }, { valeur: 'b@x.fr', libelle: 'E-mail 2' }] }],
      })],
    });
    await monter();
    const etiquettes = [...container.querySelectorAll('.pdb-etiquette')].map((e) => e.textContent);
    expect(etiquettes).toEqual(['E-mail', '']);
  });
});
