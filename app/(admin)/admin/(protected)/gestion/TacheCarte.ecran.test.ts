// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement, Fragment } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { RecapTachesDuBien } from './TachesDuBien';
import { TableauTaches } from './TableauTaches';
import { MOT_ACTION } from './LigneTache';
import { blocContacts, type ContactTache } from '../../../../lib/gestion/contactsTache';
import { ajouterJours, jourParisDe, type Tache } from '../../../../lib/gestion/taches';

/**
 * ══ 🔴🔴 LOT FICHE-CARTE-TACHE — LA CARTE D'UNE TÂCHE SUR LA FICHE DU BIEN (Arno, 13/10/2026) ════════════════════
 * Titre ; ligne clé (📅, couleur, 👤 Confiée à, badge) ; commentaire en entier ; pièces ; un encadré par contact ;
 * boutons « ✓ Tâche réalisée », « Décaler », « ✏ Modifier », « ✗ Tâche annulée ». Les VRAIS composants, routes simulées.
 */
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const AUJ = jourParisDe(new Date());
const CONTACTS: ContactTache[] = [
  { cle: 'proprietaire:12', famille: 'proprietaire', nom: 'Mme Durand', qualite: null, organisation: null, adresse: null,
    coordonnees: [{ sorte: 'telephone', libelle: 'Portable', valeur: '0612345678', affichage: '06 12 34 56 78' },
      { sorte: 'email', libelle: null, valeur: 'durand@example.test', affichage: null }], copieLe: '2026-10-13T08:00:00Z' },
  { cle: 'locataire:7', famille: 'locataire', nom: 'M. Martin', qualite: null, organisation: null, adresse: null,
    coordonnees: [{ sorte: 'telephone', libelle: 'Fixe', valeur: '0145000000', affichage: null },
      { sorte: 'telephone', libelle: 'Bureau', valeur: '0146000000', affichage: null }], copieLe: '2026-10-13T08:00:00Z' },
];
const t = (p: Partial<Tache>): Tache => ({
  id: 0, lotId: 27, lotCle: '26', adresseBien: '7 avenue de l’Union', evenement: null, objet: 'x', note: null,
  jour: AUJ, heure: null, rappels: [], etat: 'a_faire', confieeA: 2, confieeALibelle: 'Arnaud Jorel',
  creeLe: '', creeParLibelle: '', majLe: '2026-10-01T08:00:00.000Z', faiteLe: null, faiteParLibelle: null,
  annuleeLe: null, annuleeParLibelle: null, nbContacts: 0, ...p,
});

let taches: Tache[];
let gestes: { id: number; corps: Record<string, unknown> }[];
let lectures: string[];
let ecrits: string[];
let container: HTMLDivElement;
let root: Root;
beforeEach(() => {
  taches = [
    t({ id: 7, objet: 'Visite technique', heure: '09:30', note: 'Clés chez le gardien.\nSonner deux fois.',
      contacts: CONTACTS, nbContacts: 2, pieces: [{ driveId: 'abc123', nom: 'devis.pdf', typeMime: 'application/pdf',
        lien: 'https://drive.google.com/file/d/abc123/view', ajouteLe: '', ajouteParLibelle: '' }], nbPieces: 1,
      acceptation: { statut: 'acceptee', automatique: true, destinataireId: 2, destinataireLibelle: 'Arnaud Jorel', demandeurId: 2,
        demandeurLibelle: 'Arnaud Jorel', demandeLe: '', reponduLe: null, reponduParLibelle: null, motif: null, mailEtat: 'aucun', mailLe: null } }),
    t({ id: 8, objet: 'Relancer le plombier', jour: ajouterJours(AUJ, -1), note: '   ' }),
    t({ id: 9, objet: 'Ancienne', etat: 'faite', faiteLe: new Date().toISOString() /* LOT TERMINEES-7-JOURS : récente, donc affichée */, faiteParLibelle: 'Arnaud' }),
  ];
  gestes = []; lectures = []; ecrits = [];
  vi.stubGlobal('fetch', vi.fn(async (u: unknown, init?: { method?: string; body?: string }) => {
    const url = String(u);
    const m = /\/api\/admin\/gestion\/taches\/(\d+)$/.exec(url);
    if (m && init?.method === 'PATCH') {
      const corps = JSON.parse(String(init.body)) as Record<string, unknown>;
      gestes.push({ id: Number(m[1]), corps });
      if (corps.geste === 'annuler') {
        taches = taches.map((x) => (x.id === Number(m[1]) ? { ...x, etat: 'annulee', annuleeLe: new Date().toISOString(), annuleeParLibelle: 'Arnaud' } : x));
      }
      return Response.json({ etat: 'ok', id: Number(m[1]), message: 'Tâche annulée.' });
    }
    if (m) {
      lectures.push(m[1]);
      return Response.json({ etat: 'ok', tache: taches.find((x) => x.id === Number(m[1])), traces: [], contacts: [], pieces: [] });
    }
    if (url.includes('collaborateurs')) return Response.json({ etat: 'ok', collaborateurs: [{ id: 2, libelle: 'Arnaud Jorel' }], moi: 2 });
    if (url.includes('/taches/contacts')) return Response.json({ etat: 'ok', contacts: [] });
    if (url.includes('evenements')) return Response.json({ etat: 'ok', evenements: [] });
    if (url.includes('reglage')) return Response.json({ etat: 'ok', envoiMail: false, modifiable: false });
    const bien = new URL(url, 'http://x').searchParams.get('bien');
    return Response.json({ etat: 'ok', taches: bien === null ? taches.map(({ contacts: _c, pieces: _p, ...x }) => x) : taches, moi: 2, tronque: false });
  }));
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => { act(() => { root.unmount(); }); container.remove(); vi.unstubAllGlobals(); });

const calmer = async () => { await act(async () => { for (let i = 0; i < 15; i++) await Promise.resolve(); }); };
/** 🔴 LOT TACHES-LIGNES-COMPACTES — les lignes sont repliées par défaut : on les déplie d'un clic, comme Arno. */
const deplierLignes = async (portee: string) => {
  for (const l of [...container.querySelectorAll<HTMLElement>(`${portee} [data-depliee="non"] .tch-l1`)]) {
    await act(async () => { l.click(); });
  }
  await act(async () => { for (let i = 0; i < 14; i++) await Promise.resolve(); });
};
const monter = async () => {
  await act(async () => {
    root.render(createElement(Fragment, null,
      createElement('div', { id: 'fiche' }, createElement(RecapTachesDuBien, { lotId: 27, onEcrire: (e: string) => { ecrits.push(e); } })),
      createElement('div', { id: 'general' }, createElement(TableauTaches, { onOuvrirBien: () => {} }))));
  });
  await calmer();
  await act(async () => { container.querySelector<HTMLButtonElement>('#fiche [data-repli-taches]')!.click(); });
  await calmer();
  await deplierLignes('#fiche');
  await deplierLignes('#general');
};
const carte = (id: number) => container.querySelector(`#fiche [data-tache="${id}"]`) as HTMLElement;
const boutonDe = (el: Element, mot: string) => [...el.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent?.includes(mot));

describe('🔴 la carte, de haut en bas', () => {
  it('🔴 LOT FICHE-CARTE-4-BLOCS — titre, quand/qui, notes (+ pièces), contacts, puis la barre d’actions', async () => {
    await monter();
    const ordre = [...carte(7).querySelectorAll('[data-ordre]')].map((e) => e.getAttribute('data-ordre'));
    expect(ordre).toEqual(['titre', 'cle', 'notes', 'contacts', 'actions']);
    expect([...carte(7).querySelectorAll('.tch-carte-etiquette')].map((e) => e.textContent))
      .toEqual(['Quand / Qui', 'Notes', 'Pièces jointes', 'Contacts (2)']);
    expect(carte(7).querySelector('.tch-carte-pied [data-ordre="actions"]')).not.toBeNull();
    // Dépliée dans une liste, le bandeau porte « ▾ » : un clic la replie.
    expect(carte(7).querySelector('.tch-carte-titre')?.textContent).toBe('▾ Visite technique');
    const cle = carte(7).querySelector('.tch-carte-cle')!;
    expect(cle.querySelector('.tch-date')?.textContent).toMatch(/^📅 .+ · 9 h 30$/);
    expect(cle.textContent).toContain('Aujourd’hui');
    expect(cle.querySelector('.tch-carte-qui')?.textContent).toBe('👤 Confiée à Arnaud Jorel');
    expect(cle.querySelector('[data-acceptation]')?.textContent).toBe('✓ Acceptée');
  });
  it('le commentaire en entier, retours à la ligne conservés ; note vide = aucun cadre', async () => {
    await monter();
    expect(carte(7).querySelector('.tch-carte-note')?.textContent).toBe('Clés chez le gardien.\nSonner deux fois.');
    expect(carte(8).querySelector('.tch-carte-note')).toBeNull();
    // Ni note ni pièce : le bloc NOTES n'existe pas (pas de cadre vide).
    expect(carte(8).querySelector('[data-ordre="notes"]')).toBeNull();
  });
  it('pièces : une ligne par fichier, cliquable vers le Drive', async () => {
    await monter();
    const a = carte(7).querySelector<HTMLAnchorElement>('[data-ordre="notes"] .tch-carte-pieces a');
    expect(a?.href).toBe('https://drive.google.com/file/d/abc123/view');
    expect(a?.textContent).toBe('devis.pdf ↗');
  });
  it('🔴 un encadré par contact (liseré de sa famille) ; téléphones tel: ; e-mail → composeur ; aucun bloc « Contacts » en double', async () => {
    await monter();
    const encadres = [...carte(7).querySelectorAll('.tchc-encadre')];
    expect(encadres).toHaveLength(2);
    expect(encadres[0].className).toContain('tchc-groupe--');
    expect(encadres[0].querySelector('.tchc-nom')?.textContent).toBe('Mme Durand · Propriétaire');
    expect(encadres[1].querySelector('.tchc-nom b')?.textContent).toBe('M. Martin');
    const tels = [...encadres[1].querySelectorAll<HTMLAnchorElement>('a[href^="tel:"]')];
    expect(tels.map((x) => x.closest('p')?.textContent)).toEqual(['Fixe : 0145000000', 'Bureau : 0146000000']);
    await act(async () => { boutonDe(encadres[0], 'durand@example.test')!.click(); });
    expect(ecrits).toEqual(['durand@example.test']);
    // Le bloc « Contacts » généré (celui de l'agenda et des mails) n'apparaît nulle part sur la carte.
    expect(carte(7).textContent).not.toContain(blocContacts(CONTACTS).split('\n')[1]);
    expect(carte(7).querySelector('.tchc-apercu')).toBeNull();
  });
});

describe('🔴 l’agenda, toujours dit sur la carte', () => {
  const ag = (etat: string, texte: string, peutReessayer: boolean) => ({ etat, texte, motif: null, peutReessayer }) as Tache['agendaCarte'];
  it('« Pas encore dans l’agenda » + « Envoyer » → la synchronisation existante (geste reessayerAgenda)', async () => {
    taches = taches.map((x) => (x.id === 8 ? { ...x, agendaCarte: ag('pas_encore', 'Pas encore dans l’agenda', true) }
      : x.id === 7 ? { ...x, agendaCarte: ag('dans_agenda', '📅 Dans l’agenda Google de Arnaud Jorel', false) } : x));
    await monter();
    expect(carte(7).querySelector('[data-agenda]')?.textContent).toBe('📆 Dans l’agenda Google de Arnaud Jorel');
    expect(carte(8).querySelector('[data-agenda]')?.textContent).toBe('Pas encore dans l’agenda' + 'Envoyer');
    await act(async () => { carte(8).querySelector<HTMLButtonElement>('[data-action="agenda"]')!.click(); });
    await calmer();
    expect(gestes).toEqual([{ id: 8, corps: { geste: 'reessayerAgenda' } }]);
  });
});

describe('🔴 LOT CARTE-REPLI-BANDEAU — sur la fiche aussi, le bandeau replie', () => {
  it('un clic sur le bandeau ramène la ligne compacte ; Modifier ne replie pas', async () => {
    await monter();
    await act(async () => { boutonDe(carte(8), 'Modifier')!.click(); });
    await calmer();
    expect(carte(8).classList.contains('tch-carte')).toBe(true);
    await act(async () => { (carte(8).querySelector('.tch-carte-titre') as HTMLElement).click(); });
    await calmer();
    expect(carte(8).getAttribute('data-depliee')).toBe('non');
    expect([...carte(8).children].map((c) => c.className)).toEqual(['tch-l1', 'tch-l2']);
  });
});

describe('🔴 les boutons', () => {
  it('« ✓ Tâche réalisée », « Décaler », « ✏ Modifier », « ✗ Tâche annulée » — les mêmes dans le récapitulatif', async () => {
    await monter();
    for (const ecran of ['fiche', 'general']) {
      const l = container.querySelector(`#${ecran} [data-tache="8"] .tch-actions`)!;
      expect([...l.querySelectorAll('button')].map((b) => b.textContent)).toEqual([
        MOT_ACTION.realisee, MOT_ACTION.annulee, MOT_ACTION.decaler, MOT_ACTION.modifier]);
    }
    expect(MOT_ACTION).toEqual({ realisee: '✓ Tâche réalisée', decaler: 'Décaler', modifier: '✏ Modifier', annulee: '✗ Tâche annulée' });
  });
  it('« ✏ Modifier » ouvre la fenêtre « Tâche — <adresse> » sur la BONNE tâche', async () => {
    await monter();
    await act(async () => { boutonDe(carte(8), 'Modifier')!.click(); });
    await calmer();
    // (Les cartes dépliées du récapitulatif lisent aussi leur détail : on regarde la DERNIÈRE lecture, celle du clic.)
    expect(lectures.at(-1)).toBe('8');
    expect(container.querySelector('.tchf-titre')?.textContent).toBe('Tâche — 7 avenue de l’Union');
    expect((container.querySelector('.tchf input[type="text"]') as HTMLInputElement).value).toBe('Relancer le plombier');
  });
  it('« ✗ Tâche annulée » : confirmation « Annuler cette tâche ? » ; Non ne fait rien ; Oui annule', async () => {
    await monter();
    await act(async () => { boutonDe(carte(8), 'Tâche annulée')!.click(); });
    expect(carte(8).querySelector('.tch-confirmer-question')?.textContent).toBe('Annuler cette tâche ?');
    await act(async () => { carte(8).querySelector<HTMLButtonElement>('[data-action="annuler-non"]')!.click(); });
    expect(gestes).toEqual([]);
    await act(async () => { boutonDe(carte(8), 'Tâche annulée')!.click(); });
    await act(async () => { carte(8).querySelector<HTMLButtonElement>('[data-action="annuler-oui"]')!.click(); });
    await calmer();
    expect(gestes).toEqual([{ id: 8, corps: { geste: 'annuler' } }]);
  });
  it('tâche réalisée ou annulée : même carte, grisée, seul « ✏ Modifier » reste', async () => {
    await monter();
    const c = carte(9);
    expect(c.getAttribute('data-couleur')).toBe('terminee');
    expect(c.closest('details')).not.toBeNull();
    expect([...c.querySelectorAll('.tch-actions button')].map((b) => b.textContent)).toEqual([MOT_ACTION.modifier]);
  });
});
