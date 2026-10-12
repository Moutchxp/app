// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { RattachementsDuFil } from './RattachementsDuFil';
import { TITRE_BIENS_SUIVIS } from '../../../../lib/gestion/ficheRattachement';

/**
 * ══ 🔴🔴 LOT MODALE-MODIFIER-RATTACHEMENT-4-POSITIONS — « MODIFIER LE RATTACHEMENT », MONTÉE POUR DE VRAI ══════════
 *
 * Demande d'Arno (11/10/2026), bloc par bloc. Ce fichier éprouve la porte PONCTUELLE (historique d'un bien → mail →
 * « Modifier le rattachement ») ; les deux autres portes de la même fenêtre sont éprouvées par `VisualiserUnifie`.
 *
 * 🔒 AUCUNE DONNÉE RÉELLE : un fil inventé, des lots inventés, `fetch` simulé — rien ne sort, rien n'est écrit.
 */
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const MAIL = 9123;
const personne = (role: 'proprietaire' | 'locataire', nom: string, expediteur = false) => ({
  role, cle: `${role}-${nom}`, id: 12, nom, civilite: null, expediteur,
  telephones: [{ libelle: 'Mobile 1', valeur: '0611223344', affichage: '06 11 22 33 44', note: null }],
  emails: [{ libelle: 'Email 1', valeur: `${nom.toLowerCase().replace(/\W+/g, '.')}@exemple.test`,
    affichage: `${nom.toLowerCase().replace(/\W+/g, '.')}@exemple.test`, note: null }],
});
const FICHE = {
  filId: 77, objet: 'Fuite', nbMailsDuFil: 13, horsGestion: false, messageRecentId: MAIL,
  enTete: { messageId: MAIL, de: 'c.jullien@exemple.test', deNom: 'JULLIEN', recuLe: '2025-11-21T10:00:00Z', objet: 'Fuite' },
  disponible: true,
  biens: [{
    cle: 'L-176', lotId: 176, adresseComplete: '15 rue Carle Hebert, 92400 COURBEVOIE', numeroLot: '176',
    nature: 'Appartement', typeBien: 'Studio', surfaceM2: 28, statut: 'classe',
    dateMail: '2025-11-21', nbMails: 1, dossierDriveId: 'dossier-176', lienIds: [100],
    personnes: [personne('proprietaire', 'JULLIEN - GARRIDO Cédric', true), personne('locataire', 'COLSON Manon')],
  }],
};
const LIENS = [{
  id: 100, messageId: MAIL, pieceId: null, cible: { sorte: 'lot', cle: 'L-176', id: null }, libelle: 'lot 176',
  origine: 'manuel', statut: 'confirme', confiance: null, regle: null, motif: null, adresses: [], parUnHumain: true,
  creeLe: null, creePar: null, statutLe: null, statutPar: null,
}];
const CONTEXTE = {
  messageId: MAIL, filId: 77, dateMail: '2025-11-21', nbMailsDuFil: 13, proprietaire: null,
  examen: { issue: 'sans_candidat', motif: '' }, pieces: [], disponible: true, biens: [] as unknown[],
};
/** 🔴 LOT PROPOSITIONS-MEME-PROPRIETAIRE — ce que la route rend avec `elargi=1` sur le cas d'Arno (mail 26188). */
const proposeMemeProprio = (cle: string, adresse: string, commune: string) => ({
  cle, libelle: `${adresse}, ${commune} — lot ${cle}`, adresse, commune, nature: 'Appartement', typeBien: 'Type 2',
  caracteristiques: [], adresseComplete: `${adresse}, ${commune}`,
  parties: [{ role: 'proprietaire', cle: 'P146', nom: 'JULLIEN - GARRIDO Cédric', emails: [], telephones: [] }],
  recommande: false, motif: 'même propriétaire que 25 rue Edith Cavell — JULLIEN - GARRIDO Cédric',
  cas: 'c', certitude: 'a_trancher', replie: false, dejaRattache: false,
});
const MEME_PROPRIO = [
  proposeMemeProprio('373', '15 rue Carle Hebert', 'COURBEVOIE'),
  proposeMemeProprio('58', '155 avenue Paul Vaillant Couturier', 'GENTILLY'),
  proposeMemeProprio('432', '1bis Rue Manessier', 'Nogent-sur-Marne'),
  proposeMemeProprio('224', '31 rue Camille Pelletan', 'LEVALLOIS PERRET'),
];
let lectures: string[] = [];
const SUIVI = {
  etat: 'ok', mails: [9100, 9101, 9102, 9103, 9104, 9105, 9106, 9107, 9108, 9109, 9110, 9111, MAIL],
  periodes: [{ id: 5, depuisMessageId: 9100, classement: { sorte: 'biens', biens: [{ cle: 'L-176', libelle: 'lot 176' }] } }],
  exceptions: [],
};

let container: HTMLDivElement;
let root: Root;
let ecritures: { url: string; corps: unknown }[];

beforeEach(() => {
  container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
  ecritures = [];
  lectures = [];
  CONTEXTE.biens = [];
  global.fetch = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    const u = String(url);
    if ((init?.method ?? 'GET') !== 'GET') {
      ecritures.push({ url: u, corps: JSON.parse(String(init?.body ?? 'null')) });
      return { ok: true, json: async () => ({ ok: true, trace: { filId: 77, exceptions: [1], periodes: [] } }) } as unknown as Response;
    }
    if (u.includes('rattachements?fiche=')) return { ok: true, json: async () => ({ etat: 'ok', data: FICHE }) } as unknown as Response;
    if (u.includes('rattachements?fil=')) return { ok: true, json: async () => ({ etat: 'ok', data: LIENS }) } as unknown as Response;
    if (u.includes('/gestion/suivi')) return { ok: true, json: async () => SUIVI } as unknown as Response;
    lectures.push(u);
    if (u.includes('/gestion/classement')) return { ok: true, json: async () => ({ etat: 'ok', contexte: CONTEXTE }) } as unknown as Response;
    if (u.includes('/affectation')) return { ok: true, json: async () => ({ etat: 'ok', evenement: null, qualifie: true }) } as unknown as Response;
    return { ok: true, json: async () => ({ etat: 'ok' }) } as unknown as Response;
  }) as unknown as typeof fetch;
});
afterEach(() => { act(() => { root.unmount(); }); container.remove(); vi.restoreAllMocks(); });

const calmer = async () => { await act(async () => { for (let i = 0; i < 14; i++) await Promise.resolve(); }); };
let ferme = 0;
const monter = async () => {
  ferme = 0;
  await act(async () => {
    root.render(createElement(RattachementsDuFil, {
      filId: 77, titre: 'Fuite', messageId: MAIL, ponctuel: true, onFerme: () => { ferme += 1; }, onGeste: () => {},
    } as never));
  });
  await calmer();
};
const cliquer = async (e: Element) => { await act(async () => { (e as HTMLElement).click(); }); await calmer(); };
const bouton = (motif: RegExp) => [...container.querySelectorAll('button')].find((b) => motif.test(b.textContent ?? ''));

describe('① le bloc « Biens actuellement suivi(s) dans cette conversation »', () => {
  it('🔴 le titre est intégré au cadre du bloc, et remplace « 1 bien rattaché à ce mail »', async () => {
    await monter();
    const bloc = container.querySelector('section.rdf-suivis');
    expect(bloc?.querySelector('h3')?.textContent).toBe(TITRE_BIENS_SUIVIS);
    expect(bloc?.querySelector('.rdf-suivi-carte')).not.toBeNull();
    expect(container.querySelector('.rdf-compteur')).toBeNull();
    expect(container.textContent).not.toContain('1 bien rattaché à ce mail');
  });

  it('🔴 chaque bien est une carte au format du composant partagé : case, titre, « i », parties, motif', async () => {
    await monter();
    const carte = container.querySelector('.rdf-suivi-carte') as HTMLElement;
    expect(carte.className).toContain('rec-bien');
    expect((carte.querySelector('.rec-choix input[type="checkbox"]') as HTMLInputElement).checked).toBe(true);
    expect(carte.querySelector('.rec-bien-nom')?.textContent).toBe('15 rue Carle Hebert, COURBEVOIE — Appartement · Studio');
    expect(carte.querySelector('.rec-choix .ifb-bouton, .rec-choix button')).not.toBeNull();
    const parties = carte.querySelector('.rec-deux-lignes')?.textContent ?? '';
    expect(parties).toContain('Propriétaire JULLIEN - GARRIDO Cédric');
    expect(parties).toContain('Locataire (à la date du mail) COLSON Manon');
    expect(carte.querySelector('.rec-motif')?.textContent).toBe('déjà rattaché — décochez pour le retirer');
  });

  it('🔴 une ligne repliable unique, au nom du propriétaire ; dépliée, le détail actuel', async () => {
    await monter();
    const carte = container.querySelector('.rdf-suivi-carte') as HTMLElement;
    const details = carte.querySelectorAll('details.rdf-suivi-detail');
    expect(details).toHaveLength(1);
    const d = details[0] as HTMLDetailsElement;
    expect(d.open).toBe(false);
    expect(d.querySelector('summary')?.textContent).toContain('JULLIEN - GARRIDO Cédric');
    /* Le détail : les deux parties, MOBILE / E-MAIL avec Copier, Fiche annuaire, détail par mail. */
    expect(d.querySelectorAll('.rdf-personne')).toHaveLength(2);
    expect(d.textContent).toContain('06 11 22 33 44');
    expect([...d.querySelectorAll('button')].filter((b) => /Copier/.test(b.textContent ?? '')).length).toBeGreaterThan(0);
    expect(d.textContent).toContain('Fiche annuaire');
    expect(d.textContent).toContain('Voir le détail par mail');
  });

  /**
   * 🔴🔴 LOT PILULE-ROUGE-MAISON-EXPEDITEUR-UNIQUE-TRAME-VERTE — UN SEUL CARTOUCHE, QUI NOMME (cas d'Arno : mail de
   * Valentin TALHOUARN, locataire en couple « YOUENOU et TALHOUARN Marine et Valentin »).
   */
  const avecExpediteur = async (de: string, deNom: string | null, emailLocataire: string) => {
    const tete = FICHE.enTete;
    const loc = FICHE.biens[0].personnes[1];
    const emails = loc.emails;
    FICHE.enTete = { ...tete, de, deNom } as typeof tete;
    loc.emails = [{ libelle: 'Email 2', valeur: emailLocataire, affichage: emailLocataire, note: null }];
    try { await monter(); } finally { FICHE.enTete = tete; loc.emails = emails; }
  };
  it('🔴 « Expéditeur : Valentin TALHOUARN », sur la ligne LOCATAIRE seulement — plus rien sur la ligne repliable', async () => {
    await avecExpediteur('valentin.talhouarn@gmail.com', 'Valentin TALHOUARN', 'Valentin.Talhouarn@gmail.com');
    const carte = container.querySelector('.rdf-suivi-carte') as HTMLElement;
    const lignes = [...carte.querySelectorAll('.rec-deux-lignes .rec-ligne-parties')];
    expect(lignes[0].querySelector('.rec-expediteur')).toBeNull();
    expect(lignes[1].querySelector('.rec-expediteur')?.textContent).toBe('Expéditeur : Valentin TALHOUARN');
    expect(carte.querySelector('summary .rec-expediteur')).toBeNull();
    expect(carte.querySelectorAll('.rec-expediteur')).toHaveLength(1);
  });
  it('🔴 la fiche dépliée « ▶ … » ne répète pas le cartouche : un seul visible par bien', async () => {
    await avecExpediteur('valentin.talhouarn@gmail.com', 'Valentin TALHOUARN', 'valentin.talhouarn@gmail.com');
    const carte = container.querySelector('.rdf-suivi-carte') as HTMLElement;
    expect(carte.querySelectorAll('.rec-expediteur, .rdf-expediteur')).toHaveLength(1);
    expect(carte.querySelector('.rdf-suivi-detail .rdf-expediteur')).toBeNull();
    expect(carte.querySelector('.rdf-suivi-detail .rdf-personne--expediteur')).toBeNull();
  });
  it('🔴 sans nom dans l’en-tête : l’adresse e-mail', async () => {
    await avecExpediteur('valentin.talhouarn@gmail.com', null, 'valentin.talhouarn@gmail.com');
    expect(container.querySelector('.rdf-suivi-carte .rec-expediteur')?.textContent).toBe('Expéditeur : valentin.talhouarn@gmail.com');
  });
  it('🔴 l’expéditeur n’est aucune partie du bien : pas de cartouche', async () => {
    await avecExpediteur('gestion@sansvisavis.com', 'Gestion CRITERIMMO', 'valentin.talhouarn@gmail.com');
    expect(container.querySelector('.rdf-suivi-carte .rec-expediteur')).toBeNull();
  });

  it('🔴 « Ouvrir le Drive du bien » et « Historique du bien » ne sont plus dans cette modale', async () => {
    await monter();
    expect(container.querySelector('.rdf-raccourcis')).toBeNull();
    expect(container.textContent).not.toMatch(/Drive du bien/);
    expect(container.textContent).not.toMatch(/Historique du bien/);
  });

  it('décocher la carte annonce le retrait', async () => {
    await monter();
    await cliquer(container.querySelector('.rdf-suivi-carte input.rdf-garde') as Element);
    const carte = container.querySelector('.rdf-suivi-carte') as HTMLElement;
    expect(carte.className).toContain('rdf-suivi-carte--retire');
    expect(carte.textContent).toContain('sera retiré');
  });
});

describe('④ la ligne « Événement rattaché », repliable', () => {
  it('🔴 une seule ligne repliée ; dépliée, « Lier à un événement » et « Créer un événement »', async () => {
    await monter();
    const d = container.querySelector('details.rdf-evt') as HTMLDetailsElement;
    expect(d).not.toBeNull();
    expect(d.open).toBe(false);
    /* 🔴 LOT EVENEMENT-RATTACHE-COHERENT, PARTIE 3 — un bloc encadré ; replié, UNE ligne : titre, « aucun », chevron. */
    expect(d.className).toContain('rdf-evt-bloc');
    const resume = d.querySelector('summary') as HTMLElement;
    expect(resume.querySelector('.rdf-evt-titre')?.textContent).toBe('Événement rattaché :');
    expect(resume.querySelector('.rdf-evt-aucun')?.textContent).toBe('aucun');
    expect(resume.querySelector('.rdf-capsule-evt')).toBeNull();
    expect(resume.lastElementChild?.className).toBe('rdf-evt-chevron');
    expect(bouton(/^Lier à un événement$/)).toBeDefined();
    expect(bouton(/^Créer un événement$/)).toBeDefined();
    expect(d.contains(bouton(/^Lier à un événement$/) as Node)).toBe(true);
  });
});

describe('la croix', () => {
  it('🔴 fermer par la croix : rien n’est écrit', async () => {
    await monter();
    await cliquer(container.querySelector('.rdf-suivi-carte input.rdf-garde') as Element);
    await cliquer(container.querySelector('.rdf-croix') as Element);
    expect(ferme).toBe(1);
    expect(ecritures).toEqual([]);
  });
});

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   ⑤ ⑥ LA GLISSIÈRE À QUATRE POSITIONS ET LE BOUTON FINAL
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

/* 🔴 LOT GLISSIERE-PILULE — la glissière est un groupe de boutons radio : la position choisie est le radio coché. */
const groupe = () => container.querySelector('[role="radiogroup"]') as HTMLElement;
const choisi = () => container.querySelector('[role="radiogroup"] [role="radio"][aria-checked="true"]')?.textContent ?? null;
const libelle = (m: RegExp) => [...container.querySelectorAll('.gpo-libelle')].find((b) => m.test(b.textContent ?? '')) as HTMLButtonElement;
const definition = () => container.querySelector('.rdf-portee-definition')?.textContent ?? '';
const decocher = async () => cliquer(container.querySelector('.rdf-suivi-carte input.rdf-garde') as Element);
const touche = async (key: string) => { await act(async () => { (groupe().querySelector('[role="radio"][aria-checked="true"]') as HTMLElement).dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true })); }); await calmer(); };

describe('⑤ la glissière', () => {
  it('🔴 sans modification : ① Origine, ②③④ grisées et non sélectionnables (clic ni clavier)', async () => {
    await monter();
    expect(choisi()).toBe('Origine');
    expect(libelle(/One shot/).disabled).toBe(true);
    expect(libelle(/Ce mail \+ futurs échanges/).disabled).toBe(true);
    expect(libelle(/Toute la conversation/).disabled).toBe(true);
    await touche('ArrowRight');
    expect(choisi()).toBe('Origine');
    expect(definition()).toBe('Le suivi reste tel qu’il était. Aucune modification n’est enregistrée.');
    expect(bouton(/^Valider le maintien du suivi actuel$/)).toBeDefined();
  });

  it('🔴 la première modification passe AUTOMATIQUEMENT sur ② One shot, et rend ②③④ sélectionnables', async () => {
    await monter();
    await decocher();
    expect(choisi()).toBe('One shot');
    expect(libelle(/Toute la conversation/).disabled).toBe(false);
    expect(definition()).toBe('Modification ponctuelle : elle ne concerne QUE ce mail. Aucun autre mail, aucune conversation et aucun suivi ne sont modifiés.');
    expect(bouton(/^Valider la modification du suivi$/)).toBeDefined();
  });

  it('les définitions suivent la position ; les flèches du clavier déplacent le curseur', async () => {
    await monter();
    await decocher();
    await touche('ArrowRight');
    expect(choisi()).toBe('Ce mail + futurs échanges');
    expect(definition()).toContain('À partir de ce mail, et pour tous les prochains échanges');
    await cliquer(libelle(/Toute la conversation/));
    expect(choisi()).toBe('Toute la conversation');
    expect(definition()).toContain('anciens mails compris');
    await touche('ArrowLeft');
    expect(choisi()).toBe('Ce mail + futurs échanges');
  });

  it('🔴 revenir sur ① avec des modifications : la question, puis tout revient à l’état d’ouverture', async () => {
    await monter();
    await decocher();
    await cliquer(libelle(/Origine/));
    expect(container.querySelector('.rdf-portee-question')?.textContent).toContain('Revenir au suivi d’origine ? Vos modifications seront abandonnées');
    await cliquer(bouton(/^Non$/) as Element);
    expect(choisi()).toBe('One shot');
    expect((container.querySelector('.rdf-suivi-carte input.rdf-garde') as HTMLInputElement).checked).toBe(false);
    await cliquer(libelle(/Origine/));
    await cliquer(bouton(/^Oui$/) as Element);
    expect(choisi()).toBe('Origine');
    expect((container.querySelector('.rdf-suivi-carte input.rdf-garde') as HTMLInputElement).checked).toBe(true);
    expect(libelle(/One shot/).disabled).toBe(true);
    expect(ecritures).toEqual([]);
  });
});

describe('⑥ le bouton final et ce qu’il écrit', () => {
  const suivis = () => ecritures.filter((e) => e.url.includes('/api/admin/gestion/suivi'));
  it('🔴 aucune modification : « Valider le maintien du suivi actuel » ferme sans rien écrire', async () => {
    await monter();
    await cliquer(bouton(/^Valider le maintien du suivi actuel$/) as Element);
    expect(ferme).toBe(1);
    expect(ecritures).toEqual([]);
  });

  it('🔴 ② One shot : l’exception « ce mail uniquement », seule', async () => {
    await monter();
    await decocher();
    await cliquer(bouton(/^Valider la modification du suivi$/) as Element);
    expect(suivis()).toHaveLength(1);
    expect(suivis()[0].corps).toMatchObject({ filId: 77, messageId: MAIL, choix: 'mail', classement: { sorte: 'biens', biens: [] } });
    expect(container.querySelector('.rdf-ponctuel-fait')?.textContent).toContain('Aucun autre mail, aucune période de suivi n’a bougé');
  });

  it('🔴 ③ Ce mail + futurs échanges : la fenêtre « la suite », par la même porte (son accolade et son point d’information viennent de la période, inchangés)', async () => {
    await monter();
    await decocher();
    await cliquer(libelle(/Ce mail \+ futurs échanges/));
    await cliquer(bouton(/^Valider la modification du suivi$/) as Element);
    expect(suivis()).toHaveLength(1);
    expect(suivis()[0].corps).toMatchObject({ messageId: MAIL, choix: 'suite' });
  });

  it('🔴 ④ Toute la conversation : la confirmation avec le nombre, puis `conversation`', async () => {
    await monter();
    await decocher();
    await cliquer(libelle(/Toute la conversation/));
    expect(container.querySelector('.rdf-alerte')?.textContent).toContain('12 mails de cette conversation seront mis à jour.');
    expect((bouton(/^Valider la modification du suivi$/) as HTMLButtonElement).disabled).toBe(true);
    await cliquer(container.querySelector('.rdf-alerte input[type="checkbox"]') as Element);
    await cliquer(bouton(/^Valider la modification du suivi$/) as Element);
    expect(suivis()).toHaveLength(1);
    expect(suivis()[0].corps).toMatchObject({ messageId: MAIL, choix: 'conversation' });
  });
});

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   🔴🔴 LOT PROPOSITIONS-MEME-PROPRIETAIRE — LES PROPOSITIONS DE CETTE MODALE
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

describe('propositions « même propriétaire », moteur vide à l’ouverture', () => {
  it('🔴 la modale demande les propositions élargies', async () => {
    await monter();
    expect(lectures.some((u) => u.includes(`/gestion/classement?message=${MAIL}&elargi=1`))).toBe(true);
  });

  it('🔴 le cas d’Arno : 4 propositions visibles, motif « même propriétaire », « 0 bien(s) coché(s) sur 4 affiché(s) »', async () => {
    CONTEXTE.biens = MEME_PROPRIO;
    await monter();
    const cartes = [...container.querySelectorAll('.rec-biens .rec-bien')].filter((c) => !c.classList.contains('rec-autres'));
    expect(cartes).toHaveLength(4);
    for (const c of cartes) {
      expect(c.querySelector('.rec-motif')?.textContent).toBe('même propriétaire que 25 rue Edith Cavell — JULLIEN - GARRIDO Cédric');
    }
    expect(container.querySelector('.rec-compte')?.textContent).toBe('0 bien(s) coché(s) sur 4 affiché(s).');
    expect(container.textContent).not.toContain('ajouté à la main');
    /* 🔴 AUCUNE COUPURE : ni cadre défilant, ni flèche « ⌄ », ni « voir les autres » pour quatre cartes. */
    expect(container.querySelector('.rec-biens')?.className).toBe('rec-biens');
    expect(container.querySelector('.rec-autres')).toBeNull();
  });

  it('🔴 une recherche ne survit jamais à la fermeture : à la réouverture, moteur vide et vraies propositions seules', async () => {
    CONTEXTE.biens = MEME_PROPRIO;
    await monter();
    const champ = container.querySelector('.rec-saisie') as HTMLInputElement;
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
      setter?.call(champ, 'jullien');
      champ.dispatchEvent(new Event('input', { bubbles: true }));
    });
    expect((container.querySelector('.rec-saisie') as HTMLInputElement).value).toBe('jullien');
    /* Fermer (la croix), puis rouvrir : c'est une fenêtre NEUVE. */
    await cliquer(container.querySelector('.rdf-croix') as Element);
    act(() => { root.unmount(); });
    root = createRoot(container);
    await monter();
    expect((container.querySelector('.rec-saisie') as HTMLInputElement).value).toBe('');
    expect(container.textContent).not.toContain('ajouté à la main');
    expect(container.querySelectorAll('.rec-biens .rec-bien')).toHaveLength(4);
  });
});

describe('une ouverture = une fenêtre neuve', () => {
  it('🔴 l’historique du bien monte la fenêtre avec la clé du mail, et le menu avec celle du mail et de sa remise à zéro', async () => {
    const { readFileSync } = await import('node:fs');
    const h = readFileSync('app/(admin)/admin/(protected)/gestion/HistoriqueDuBien.tsx', 'utf8');
    expect(h).toContain('<RattachementsDuFil key={aModifier.messageId}');
    const r = readFileSync('app/(admin)/admin/(protected)/gestion/RattachementsDuFil.tsx', 'utf8');
    expect(r).toContain('<MenuRattachementBien key={`${mailId}-${cleMenu}`}');
  });
});

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   🔴🔴 LOT GLISSIERE-PILULE — LE DESSIN « PILULE » ET LES PROPOSITIONS REPLIABLES
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

describe('la glissière « pilule »', () => {
  it('🔴 quatre boutons radio d’un groupe, libellés sans numéro, dans l’ordre ; le choisi seul est tabulable', async () => {
    await monter();
    const radios = [...container.querySelectorAll('[role="radiogroup"] [role="radio"]')] as HTMLButtonElement[];
    expect(radios.map((r) => r.textContent)).toEqual(['Origine', 'One shot', 'Ce mail + futurs échanges', 'Toute la conversation']);
    expect(container.querySelector('[role="radiogroup"]')?.textContent).not.toMatch(/[①②③④]/);
    expect(radios.map((r) => r.getAttribute('aria-checked'))).toEqual(['true', 'false', 'false', 'false']);
    expect(radios.map((r) => r.tabIndex)).toEqual([0, -1, -1, -1]);
    /* Le dessin : une piste, quatre repères, un curseur avec sa poignée à trois traits (lot PILULE-TROIS-TRAITS). */
    expect(container.querySelectorAll('.gpo-piste .gpo-cran')).toHaveLength(4);
    const traits = [...container.querySelectorAll('.gpo-curseur svg.gpo-poignee rect')];
    expect(traits.map((r) => [r.getAttribute('width'), r.getAttribute('height'), r.getAttribute('rx')]))
      .toEqual([['2', '10', '1'], ['2', '15', '1'], ['2', '10', '1']]);
    /* 🔴 LOT PILULE-AFFINEE — 5 px d'écart entre deux traits de 2 px : 0 → 2, puis 7 → 9, puis 14. */
    expect(traits.map((r) => r.getAttribute('x'))).toEqual(['0', '7', '14']);
    expect(container.querySelector('.gpo-curseur .gpo-losange')).toBeNull();
  });

  it('🔴 au clavier, le focus suit la position choisie', async () => {
    await monter();
    await decocher();
    await touche('ArrowRight');
    expect(choisi()).toBe('Ce mail + futurs échanges');
    expect(document.activeElement?.textContent).toBe('Ce mail + futurs échanges');
    await touche('End');
    expect(choisi()).toBe('Toute la conversation');
    await touche('Home');
    /* ⚠️ Origine avec des modifications : la question d'abord — la glissière DEMANDE, elle ne décide pas. */
    expect(container.querySelector('.rdf-portee-question')).not.toBeNull();
  });

  it('🔴 le curseur est placé par la variable de position (0 → 1) et suit le choix', async () => {
    await monter();
    const x = () => (container.querySelector('.gpo-curseur') as HTMLElement).style.getPropertyValue('--gpo-x');
    expect(x()).toBe('0');
    await decocher();
    expect(Number(x())).toBeCloseTo(1 / 3);
    await cliquer(libelle(/Toute la conversation/));
    expect(x()).toBe('1');
  });
});

describe('le bloc « Propositions » repliable', () => {
  it('🔴 ouvert par défaut, une croix réelle ; repliée : une ligne, la sélection conservée, rouvert à l’identique', async () => {
    CONTEXTE.biens = MEME_PROPRIO;
    await monter();
    const croix = container.querySelector('button[aria-label="Replier les propositions"]') as HTMLButtonElement;
    expect(croix).not.toBeNull();
    expect(croix.textContent).toBe('×');
    /* On coche une proposition, puis on replie. */
    await cliquer(container.querySelector('.rec-biens .rec-bien input[type="checkbox"]') as Element);
    expect(container.querySelector('.rec-compte')?.textContent).toBe('1 bien(s) coché(s) sur 4 affiché(s).');
    await cliquer(croix);
    expect(container.querySelector('.rec-replie-ligne')?.textContent).toBe('Propositions — 4 biens · 1 coché');
    expect(container.querySelectorAll('.rec-biens .rec-bien')).toHaveLength(0);
    /* Rien ne disparaît : « Sélectionner tous les biens » et le moteur de recherche restent là. */
    expect(bouton(/^(Sélectionner|Désélectionner) tous les biens$/)).toBeDefined();
    expect(container.querySelector('.rec-saisie')).not.toBeNull();
    expect(document.activeElement?.textContent).toContain('Afficher');
    /* Rouvrir : les quatre cartes, la case toujours cochée. */
    await cliquer(bouton(/Afficher/) as Element);
    expect(container.querySelectorAll('.rec-biens .rec-bien')).toHaveLength(4);
    expect(container.querySelector('.rec-compte')?.textContent).toBe('1 bien(s) coché(s) sur 4 affiché(s).');
    expect((container.querySelector('.rec-biens .rec-bien input[type="checkbox"]') as HTMLInputElement).checked).toBe(true);
    expect(ecritures).toEqual([]);
  });

  it('🔴 aucune proposition : rien ne change, pas de croix', async () => {
    await monter();
    expect(container.querySelector('button[aria-label="Replier les propositions"]')).toBeNull();
  });
});

describe('🔴🔴 la trame verte = case cochée', () => {
  it('bien suivi : vert coché d’office, la trame part au décochage et revient au recochage', async () => {
    await monter();
    const carte = () => container.querySelector('.rdf-suivi-carte') as HTMLElement;
    expect(carte().classList.contains('rec-bien--coche')).toBe(true);
    await decocher();
    expect(carte().classList.contains('rec-bien--coche')).toBe(false);
    await decocher();
    expect(carte().classList.contains('rec-bien--coche')).toBe(true);
    expect(ecritures).toEqual([]);
  });
  it('proposition : verte cochée, plus verte décochée', async () => {
    CONTEXTE.biens = MEME_PROPRIO;
    await monter();
    const prop = () => container.querySelector('.rec-biens .rec-bien') as HTMLElement;
    expect(prop().classList.contains('rec-bien--coche')).toBe(false);
    await cliquer(prop().querySelector('input[type="checkbox"]') as Element);
    expect(prop().classList.contains('rec-bien--coche')).toBe(true);
    await cliquer(prop().querySelector('input[type="checkbox"]') as Element);
    expect(prop().classList.contains('rec-bien--coche')).toBe(false);
    expect(ecritures).toEqual([]);
  });
});
