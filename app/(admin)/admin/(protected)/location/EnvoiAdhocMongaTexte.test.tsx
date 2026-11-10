// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { EnvoiAdhocMonga } from './EnvoiAdhocMonga';
import { listeProposee, type DonneesNouvelleLocation } from '../../../../lib/location/mailNouvelleLocation';

/**
 * 🔴🔴 Défaut constaté par Arno le 11/11/2026 (fiche lot-176, thème Sombre) : dans « Envoi ADHOC & MONGA », « Modifier le texte » ne faisait RIEN
 * de visible — l'éditeur s'ouvrait en couche d'ordre 60, SOUS la fenêtre (ordre 80), tout en bas de la page. On clique réellement le bouton :
 * l'éditeur est DANS la fenêtre, juste sous le bouton, la page défile jusqu'à lui, le bouton dit « Fermer l'éditeur », l'aperçu suit la frappe.
 */
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const DONNEES: DonneesNouvelleLocation = {
  bailId: 536, entree: '2026-11-01', bien: { voie: '25 rue Fictive', codePostal: '92400', commune: 'Courbevoie' },
  statut: { sorte: 'deja', pastille: ['PROPRIÉTAIRE', 'DÉJÀ EN GESTION'], objet: 'x', phrase: 'Propriétaire déjà en gestion', mandat: null },
  proprietaires: [], lots: [], gli: { etat: 'oui', sorte: 'gli', titre: 'GLI', detail: null } as never, locataires: [], garants: [],
  bail: { loyer: null, lignes: [] }, driveUrl: null, expediteur: 'gestion@criterimmo.fr',
};
const json = (corps: unknown) => ({ ok: true, status: 200, json: async () => corps }) as unknown as Response;
let container: HTMLDivElement; let root: Root; let defile: Element[];
beforeEach(() => {
  container = document.createElement('div'); container.className = 'svv-adm-root'; document.body.appendChild(container); root = createRoot(container);
  defile = [];
  Element.prototype.scrollIntoView = function (this: Element) { defile.push(this); } as never;
  global.fetch = vi.fn(async () => json({ etat: 'ok', data: {
    bailId: 536, objet: 'Nouvelle location', html: '<p>Aperçu</p>', texte: 'x', expediteur: 'gestion@criterimmo.fr', donnees: DONNEES, auteurNom: 'Arno Test',
    destinataires: listeProposee([{ adresse: 'gestion.criterimmo@gmail.com', libelle: 'ADHOC' }], { email: 'a@exemple.test', nom: 'Arno Test' }), dernierEnvoi: null, envoiPossible: true,
  } })) as unknown as typeof fetch;
});
afterEach(() => { act(() => { root.unmount(); }); container.remove(); vi.restoreAllMocks(); });
const calmer = async () => { await act(async () => { for (let i = 0; i < 10; i++) await Promise.resolve(); }); };
const clic = async (el: Element | null) => { expect(el).not.toBeNull(); await act(async () => { el!.dispatchEvent(new MouseEvent('click', { bubbles: true })); }); await calmer(); };

describe('🔴🔴 « Modifier le texte » dans la fenêtre « Envoi ADHOC & MONGA » : l’éditeur s’ouvre VISIBLE', () => {
  for (const variante of ['gros', 'discret'] as const) {
    it(`variante ${variante} : clic réel → éditeur dans la fenêtre, juste sous le bouton, défilement jusqu’à lui, « Fermer l’éditeur »`, async () => {
      await act(async () => { root.render(createElement(EnvoiAdhocMonga, { bailId: 536, variante })); });
      await clic(container.querySelector('[data-ouvrir-envoi]'));
      const fenetre = document.querySelector('[data-fenetre-envoi]')!;
      const bouton = fenetre.querySelector('[data-modifier-texte="nouvelle_location"]') as HTMLButtonElement;
      expect(bouton.textContent).toBe('Modifier le texte');
      await clic(bouton);
      const editeur = fenetre.querySelector('[data-editeur-texte="nouvelle_location"]');
      expect(editeur).not.toBeNull();                                                     // DANS la fenêtre (plus en bas de page)
      expect(editeur!.closest('[data-texte-modifiable]')).toBe(bouton.closest('[data-texte-modifiable]')); // juste sous le bouton
      expect(editeur!.closest('.mis-voile, .tmm-voile')).toBeNull();                      // aucune couche qui pourrait passer dessous
      expect(defile).toContain(editeur);                                                  // la page défile jusqu'à lui
      expect(bouton.textContent).toBe('Fermer l’éditeur');
      expect(bouton.getAttribute('aria-expanded')).toBe('true');
      // L'aperçu suit la frappe.
      const zone = editeur!.querySelector('[data-partie-modifiable="conclusion"] textarea') as HTMLTextAreaElement;
      await act(async () => { Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(zone, 'Le bail démarre lundi.'); zone.dispatchEvent(new Event('input', { bubbles: true })); });
      expect(editeur!.querySelector('[data-apercu-texte]')?.textContent).toContain('Le bail démarre lundi.\n\nMerci et belle journée,');
      // « Appliquer » : l'aperçu du vrai mail (iframe) suit, « Texte modifié » ; « Fermer l'éditeur » le referme.
      await clic(editeur!.querySelector('[data-appliquer-texte]'));
      expect(fenetre.querySelector('iframe[data-apercu-mail]')?.getAttribute('srcdoc')).toContain('Le bail démarre lundi.');
      expect(fenetre.querySelector('[data-texte-modifie]')?.textContent).toBe('Texte modifié');
      await clic(bouton);
      expect(fenetre.querySelector('[data-editeur-texte]')).not.toBeNull();
      await clic(bouton);
      expect(fenetre.querySelector('[data-editeur-texte]')).toBeNull();
      expect(bouton.textContent).toBe('Modifier le texte');
    });
  }
});

describe('🔴 Arno (11/11/2026) — aucun destinataire configuré : la fenêtre le dit, avec le lien vers les préférences', () => {
  it('aucun partenaire proposé ; l’avertissement et le lien « Paramètres Location › Destinataires mails »', async () => {
    global.fetch = vi.fn(async () => json({ etat: 'ok', data: {
      bailId: 536, objet: 'Nouvelle location', html: '<p>Aperçu</p>', texte: 'x', expediteur: 'gestion@criterimmo.fr', donnees: DONNEES, auteurNom: 'Arno Test',
      destinataires: listeProposee([], { email: 'a@exemple.test', nom: 'Arno Test' }), configures: 0, dernierEnvoi: null, envoiPossible: true,
    } })) as unknown as typeof fetch;
    await act(async () => { root.render(createElement(EnvoiAdhocMonga, { bailId: 536 })); });
    await clic(container.querySelector('[data-ouvrir-envoi]'));
    const f = document.querySelector('[data-fenetre-envoi]')!;
    expect(f.querySelector('[data-aucun-destinataire-configure]')?.textContent).toContain('Aucun destinataire n’est configuré pour les nouvelles locations');
    expect(f.querySelector('[data-lien-preferences-destinataires]')?.getAttribute('href')).toBe('/admin/location/outils/parametres?onglet=destinataires');
    // Seule la copie personnelle de la personne connectée : aucun partenaire.
    expect([...f.querySelectorAll('[data-ligne-destinataire] [data-adresse]')].map((x) => (x as HTMLInputElement).value)).toEqual(['a@exemple.test']);
  });
  it('des destinataires configurés : aucun avertissement', async () => {
    await act(async () => { root.render(createElement(EnvoiAdhocMonga, { bailId: 536 })); });
    await clic(container.querySelector('[data-ouvrir-envoi]'));
    expect(document.querySelector('[data-aucun-destinataire-configure]')).toBeNull();
  });
});
