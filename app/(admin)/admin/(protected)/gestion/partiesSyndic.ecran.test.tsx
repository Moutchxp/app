// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { readFileSync } from 'node:fs';
import { PartiesSurDeuxLignes } from './ListeBiensACocher';
import { viderMemoireExpediteurSyndical } from './useExpediteurSyndical';

/**
 * ══ 🔴🔴 LOT PARTIES-SYNDIC-ET-IMMEUBLE — LE CARTOUCHE EXPÉDITEUR ET LE CÂBLAGE DES VUES ══════════════════════════════
 * 🔒 AUCUNE DONNÉE RÉELLE : `fetch` simulé, rien n'est écrit.
 */
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;
let appels: string[];

beforeEach(() => {
  viderMemoireExpediteurSyndical();
  container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
  appels = [];
  global.fetch = vi.fn(async (url: string | URL | Request) => {
    appels.push(String(url));
    return { ok: true, json: async () => ({ etat: 'ok', parBien: {
      219: { role: 'Syndic — Responsable de copropriété', nom: 'M. Arnaud JOREL' },
    } }) } as unknown as Response;
  }) as unknown as typeof fetch;
});
afterEach(() => { act(() => { root.unmount(); }); container.remove(); vi.restoreAllMocks(); });

const calmer = async () => { await act(async () => { await new Promise((r) => setTimeout(r, 0)); for (let i = 0; i < 10; i++) await Promise.resolve(); }); };
const PARTIES = [{ role: 'proprietaire', nom: 'JULLIEN - GARRIDO Cédric' }, { role: 'locataire', nom: 'TALHOUARN Valentin' }];

describe('🔴🔴 le cartouche EXPÉDITEUR sur une troisième ligne « Syndic & immeuble »', () => {
  it('l’expéditeur n’est ni propriétaire ni locataire, et la fiche syndic le reconnaît ⇒ ligne rose, rôle, cartouche', async () => {
    await act(async () => {
      root.render(createElement('div', null,
        createElement(PartiesSurDeuxLignes, { parties: PARTIES, expediteur: null, nomExpediteur: 'Arnaud JOREL', bienCle: '219', messageIdExpediteur: 57468 }),
        createElement(PartiesSurDeuxLignes, { parties: PARTIES, expediteur: null, nomExpediteur: 'Arnaud JOREL', bienCle: '373', messageIdExpediteur: 57468 })));
    });
    await calmer();
    /* 🔴 UNE requête pour les deux cartes du même mail, par identifiant — jamais d'adresse dans l'URL. */
    expect(appels).toEqual(['/api/admin/gestion/expediteur-syndic?message=57468&biens=219,373']);
    const lignes = [...container.querySelectorAll('.rec-ligne-parties--syndic')];
    expect(lignes).toHaveLength(1);
    expect(lignes[0].textContent).toBe('Syndic & immeuble M. Arnaud JOREL — Syndic — Responsable de copropriété Expéditeur : Arnaud JOREL');
    expect(lignes[0].querySelector('.rec-puce-syndic')).not.toBeNull();
  });
  it('le propriétaire ou un locataire porte l’adresse De: ⇒ son rôle l’emporte, aucune requête, aucune ligne de plus', async () => {
    await act(async () => {
      root.render(createElement(PartiesSurDeuxLignes, {
        parties: PARTIES, expediteur: 'proprietaire', nomExpediteur: 'X', bienCle: '219', messageIdExpediteur: 57468,
      }));
    });
    await calmer();
    expect(appels).toEqual([]);
    expect(container.querySelector('.rec-ligne-parties--syndic')).toBeNull();
  });
});

describe('🔴 partout où les parties s’affichent', () => {
  const lire = (f: string) => readFileSync(f, 'utf8');
  const G = 'app/(admin)/admin/(protected)/gestion/';
  it('la route des parties rend la reconnaissance, en lecture seule', () => {
    const r = lire('app/(admin)/api/admin/gestion/historique/parties/route.ts');
    expect(r).toContain('const syndicaux = await syndicauxDuBien(');
    expect(r).toContain('        syndicaux,\n');
  });
  it('historique du bien : groupes, liserés, frise, pièces — et la légende', () => {
    const h = lire(`${G}HistoriqueDuBien.tsx`);
    expect(h).toContain('() => avecSyndical(categoriesFusionnees, syndicaux)');
    expect(h).toContain('grouperParCategorie(interlocuteursEtClients, categoriesParties, adressesClientes)');
    expect(h).toContain('tonDeLExpediteur(l, categories, syndicaux)');
    expect(h).toContain('famillesDestinataires(x, categoriesFusionnees, regles, syndicaux)');
    expect(h).toContain("const roleSyndical = g.cle === 'syndic_immeuble'");
    expect(lire(`${G}FriseDuBien.tsx`)).toContain('categories, syndicaux);');
  });
  it('vue conversation : les capsules d’envoi des pièces', () => {
    expect(lire(`${G}Conversation.tsx`)).toContain('categoriesDuBienRattache, regles, syndicauxDuBienRattache)');
  });
  it('les fenêtres de rattachement passent le mail et le bien au cartouche', () => {
    expect(lire(`${G}ListeBiensACocher.tsx`).match(/bienCle=\{b\.cle\} messageIdExpediteur=/g)).toHaveLength(2);
    expect(lire(`${G}RattachementsDuFil.tsx`)).toContain('bienCle={bien.cle} messageIdExpediteur={expediteurMail?.messageId ?? null}');
  });
  it('🎨 le rose est le jeton des puces des compositeurs, sur chaque surface', () => {
    expect(lire(`${G}HistoriqueDuBien.tsx`)).toContain('.hdb-barre--rose{border-left-color:var(--color-svv-syndic-bord)');
    expect(lire(`${G}HistoriqueDuBien.tsx`)).toContain('.hdb-legende-pastille--rose{');
    expect(lire(`${G}HistoriqueDuBien.tsx`)).toContain('.hdb-groupe--rose{border-left-color:var(--color-svv-syndic-bord)}');
    expect(lire(`${G}FriseDuBien.tsx`)).toContain('.frs-trait--rose{background:var(--color-svv-syndic-bord)}');
    expect(lire(`${G}VieDuBien.tsx`)).toContain('.vdb-pastille--rose{background:var(--color-svv-syndic-bord)}');
    expect(lire(`${G}DestinatairesDePiece.tsx`)).toContain('.ddp-capsule--rose{');
    expect(lire(`${G}Redaction.tsx`)).toContain('.red-pastille--syndic,.red-pastille--immeuble{--red-puce-ton:var(--color-svv-syndic-bord)');
  });
});
