// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { RecapCoutsCa } from './RecapCoutsCa';
import { URL_COUTS } from '../../../../lib/mon-espace/couts';
import { moisGestion } from '../../../../lib/transaction/gestionVue';
import { coutsDuPoint } from '../../../../lib/mon-espace/couts';
import { eur } from '../../../../lib/transaction/format';
import { E_COUTS, RETROS_COUTS, VENTES_COUTS } from '../../../../lib/mon-espace/__fixtures__/couts';
import type { GestionMois } from '../../../../lib/transaction/modele';

const acces = vi.hoisted(() => ({ autorise: true }));
vi.mock('./acces', () => ({ accesRecapCouts: async () => acces.autorise, REFUS_RECAP_COUTS: 'Le récapitulatif des coûts et du CA est réservé aux comptes qui ont la case « Les coûts » (Administratif › Comptes).' }));
vi.mock('../_composants/EnTetePage', () => ({ LienRetour: ({ href }: { href: string }) => createElement('a', { href, 'data-retour-lien': '' }, '← Retour') }));
import Page from './recapitulatif/page';

/**
 * 🔴🔴 « COÛTS ET CA » — LE TABLEAU RÉCAPITULATIF (Arno, 13/11/2026), le VRAI composant, la route simulée (rien n'est écrit en base) :
 * les deux sections, l'édition sur place avec la fenêtre « Revenir / Valider », les MÊMES gestes que la saisie du mois, la relecture (la valeur
 * est celle de toute l'application), les imports en lecture, et l'accès refusé (page ET route) à un compte sans « Les coûts ».
 */
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const JOUR = '2026-11-13';
const g = (mois: number, x: Partial<GestionMois> = {}): GestionMois => ({ id: 202600 + mois, annee: 2026, mois, nbLots: null, honorairesHt: 1000, adhocHt: 200, mongaHt: 50,
  salarieHt: null, resteHt: null, note: null, origine: 'saisie', ...x });
let gestion: GestionMois[]; let posts: Record<string, unknown>[]; let statut: number; let lectures: number;
let container: HTMLDivElement; let root: Root;
const donnees = () => ({ aujourdhui: JOUR, ventes: VENTES_COUTS, retrocessions: RETROS_COUTS, statutsNegociateurs: {}, locationCa: null, gestion, coutsSaisis: [], saisie: true,
  validations: [], monga: true, caGestion: true, versionsGestion: { '2026-09': { version: 3, origine: 'import' }, '2026-10': { version: 9, origine: 'saisie' } } });
beforeEach(() => {
  window.history.replaceState(null, '', '/admin/mon-espace/recapitulatif?agence=criterimmo');
  try { window.localStorage.setItem('trx-affichage-montants', 'ht'); } catch { /* sans stockage */ }
  gestion = [g(9, { origine: 'import', honorairesHt: 18000 }), g(10)]; posts = []; statut = 200; lectures = 0;
  container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
  globalThis.fetch = vi.fn(async (url: string, init?: RequestInit) => {
    const u = String(url);
    if (u === URL_COUTS && init?.method === 'POST') {
      const c = JSON.parse(String(init.body)) as Record<string, unknown>; posts.push(c);
      // le « serveur » : la même ligne du mois que le Suivi CA › Gestion
      if (c.action === 'gestion-poste') gestion = gestion.map((x) => (x.mois === c.mois ? { ...x, [c.poste === 'adhoc' ? 'adhocHt' : 'mongaHt']: c.montantHt as number } : x));
      if (c.action === 'ca-gestion') gestion = gestion.map((x) => (x.mois === c.mois ? { ...x, gliHt: c.montantHt as number, gliTvaTaux: c.tauxTva as number } : x));
      return { ok: true, status: 200, json: async () => ({ etat: 'ok', data: { id: null, version: 12 } }) };
    }
    if (u === URL_COUTS) { lectures += 1; return statut === 200 ? { ok: true, status: 200, json: async () => ({ etat: 'ok', data: donnees() }) } : { ok: false, status: statut, json: async () => ({ etat: 'refus' }) }; }
    return { ok: false, status: 500, json: async () => ({}) };
  }) as unknown as typeof fetch;
});
afterEach(() => { act(() => { root.unmount(); }); container.remove(); vi.restoreAllMocks(); });
const calmer = async () => { await act(async () => { for (let k = 0; k < 16; k++) await Promise.resolve(); }); };
const cliquer = async (sel: string) => { await act(async () => { (container.querySelector(sel) as HTMLElement).dispatchEvent(new MouseEvent('click', { bubbles: true })); }); await calmer(); };
const taper = async (sel: string, v: string) => { await act(async () => { const e = container.querySelector(sel) as HTMLInputElement;
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(e, v); e.dispatchEvent(new Event('input', { bubbles: true })); }); await calmer(); };
const texte = (sel: string): string => container.querySelector(sel)?.textContent?.replace(/\s/g, ' ') ?? '';
const montant = (x: number) => eur(x).replace(/\s/g, ' ');
const rendre = async () => { await act(async () => { root.render(createElement(RecapCoutsCa)); }); await calmer(); };

describe('🔴 le tableau', () => {
  it('12 mois + Total ; COÛTS (Vente, Location, Gestion) puis CA GESTION ; le mois d’octobre non complet est signalé dans son en-tête', async () => {
    await rendre();
    expect(container.querySelectorAll('[data-table-recap] thead th[data-mois-recap]').length).toBe(12);
    expect(texte('[data-table-recap] thead th:last-child')).toBe('Total');
    expect([...container.querySelectorAll('[data-section-recap]')].map((s) => s.getAttribute('data-section-recap'))).toEqual(['couts', 'ca-vente', 'ca-location', 'ca', 'total']);
    expect([...container.querySelectorAll('[data-famille-recap]')].map((s) => s.getAttribute('data-famille-recap'))).toEqual(['vente', 'location', 'gestion']);
    expect(container.querySelector('[data-mois-recap="2026-10"]')?.getAttribute('data-mois-incomplet')).toBe('oui');
    expect(container.querySelector('[data-mois-recap="2026-11"]')?.getAttribute('data-mois-incomplet')).toBeNull();
    expect(container.querySelector('[data-cellule-recap="gestion-adhoc-2026-10"]')?.getAttribute('data-etat-cellule')).toBe('a-completer');
    // une seule comptabilité : la cellule = « Coûts et CA » du mois
    expect(texte('[data-cellule-recap="vente-total-2026-03"]')).toBe(montant(coutsDuPoint({ ...E_COUTS, gestion }, 'criterimmo', 2026, 3).vente.total.htC / 100));
  });
  it('la bascule « 12 derniers mois (glissant) » et les flèches ‹ › décalent la fenêtre', async () => {
    await rendre();
    await cliquer('[data-periode="glissant"]');
    expect(texte('[data-recap-fenetre]')).toBe('12 derniers mois (nov. 2025 – oct. 2026)');
    await cliquer('[data-decaler="-1"]');
    expect(texte('[data-recap-fenetre]')).toBe('12 derniers mois (oct. 2025 – sept. 2026)');
    await cliquer('[data-periode="annee"]'); await cliquer('[data-decaler="-1"]');
    expect(texte('[data-recap-fenetre]')).toBe('Année 2025 (janv.–déc.)');
  });
  it('MACJ : pas de CA gestion ; FUSION : en lecture seule (aucune cellule modifiable)', async () => {
    await rendre();
    await cliquer('[data-recap-agence="macj"]');
    expect(container.querySelector('[data-section-recap="ca"]')).toBeNull();
    await cliquer('[data-recap-agence="tous"]');
    expect(container.querySelector('[data-modifier-recap]')).toBeNull();
    expect(container.querySelector('[data-recap-fusion]')).not.toBeNull();
  });
});

describe('🔴 modifier dans le tableau', () => {
  it('ADHOC d’octobre : sur place → la fenêtre (ancienne → nouvelle valeur) ; « Revenir » n’envoie rien ; « Valider » : le geste de la saisie du mois, puis la relecture', async () => {
    await rendre();
    await cliquer('[data-modifier-recap="gestion-adhoc-2026-10"]');
    await taper('[data-editeur-montant]', '3000');
    await cliquer('[data-editeur-enregistrer]');
    expect([...container.querySelectorAll('[data-changement-recap]')].map((l) => l.textContent?.replace(/\s/g, ' '))).toEqual([`ADHOC — Octobre 2026 : montant HT ${montant(200)} → ${montant(3000)}`]);
    await cliquer('[data-recap-revenir]');
    expect(posts).toEqual([]);
    expect(container.querySelector('[data-recap-confirmation]')).toBeNull();
    const avant = lectures;
    await cliquer('[data-editeur-enregistrer]'); await cliquer('[data-recap-valider]');
    expect(posts).toEqual([{ action: 'gestion-poste', annee: 2026, mois: 10, poste: 'adhoc', montantHt: 3000, version: 9 }]);
    expect(lectures).toBe(avant + 1);
    expect(texte('[data-cellule-recap="gestion-adhoc-2026-10"]')).toBe(montant(3000));
    expect(container.querySelector('[data-recap-message="ok"]')?.textContent).toMatch(/^Enregistré : ADHOC — Octobre 2026/);
    // propagée : la même ligne du mois, lue par la saisie du mois et le Suivi CA (CA net) — aucune seconde valeur
    expect(moisGestion(gestion, 2026, 10).adhocC).toBe(300000);
    expect(coutsDuPoint({ ...E_COUTS, gestion }, 'criterimmo', 2026, 10).gestion!.adhoc.htC).toBe(300000);
  });
  it('GLI d’octobre : montant, taux et ✓ ; trois changements dans la fenêtre ; le CA global se relit (1 000 + 250 €)', async () => {
    await rendre();
    await cliquer('[data-modifier-recap="ca-gli-2026-10"]');
    await taper('[data-editeur-montant]', '250'); await taper('[data-editeur-taux]', '10');
    await act(async () => { (container.querySelector('[data-editeur-complet]') as HTMLInputElement).click(); }); await calmer();
    await cliquer('[data-editeur-enregistrer]');
    expect(container.querySelectorAll('[data-changement-recap]').length).toBe(3);
    await cliquer('[data-recap-valider]');
    expect(posts.map((p) => p.action)).toEqual(['ca-gestion', 'valider']);
    expect(posts[0]).toMatchObject({ poste: 'gli', montantHt: 250, tauxTva: 10, version: 9 });
    expect(posts[1]).toMatchObject({ validation: { societe: 'criterimmo', famille: 'gestion', poste: 'gli', annee: 2026, mois: 10 }, valide: true });
    expect(texte('[data-cellule-recap="ca-total-2026-10"]')).toBe(montant(1250));
  });
  it('🔴 septembre 2026 (import) : les honoraires en lecture avec « corriger dans Suivi CA › Gestion » ; le CA global n’est jamais modifiable', async () => {
    await rendre();
    expect(container.querySelector('[data-modifier-recap="ca-honoraires-2026-09"]')).toBeNull();
    expect(container.querySelector('[data-corriger-recap="ca-honoraires-2026-09"]')?.getAttribute('href')).toBe('/admin/transaction/gestion?vue=mois&annee=2026&mois=9');
    expect(container.querySelector('[data-modifier-recap^="ca-total"]')).toBeNull();
    expect(container.querySelector('[data-modifier-recap^="couts-total"]')).toBeNull();
    // salaires chargés : la saisie du mois, au bon mois
    expect(container.querySelector('[data-saisie-recap="gestion-salaires-2026-10"]')?.getAttribute('href')).toBe('/admin/mon-espace?espace=criterimmo&onglet=couts&saisie=2026-10&partie=couts');
  });
});

describe('🔴 accès : réservé aux comptes qui ont « Les coûts »', () => {
  it('la route répond 403 : le refus seul, aucun tableau', async () => {
    statut = 403;
    await rendre();
    expect(container.querySelector('[data-recap-refus]')).not.toBeNull();
    expect(container.querySelector('[data-table-recap]')).toBeNull();
  });
  it('la page (serveur) : un compte sans « Les coûts » ne reçoit que le refus — ni le tableau, ni son composant', async () => {
    acces.autorise = false;
    const html = renderToStaticMarkup(await Page());
    expect(html).toContain('data-recap-refuse');
    expect(html).not.toMatch(/data-recap-couts-ca|data-recap-chargement|Récapitulatif des coûts et du CA —/);
    acces.autorise = true;
    expect(renderToStaticMarkup(await Page())).toContain('data-recap-chargement');
  });
});

describe('🔴 CA GESTION : « Coûts de gestion » et « CA net de gestion » (lecture seule, dérivés)', () => {
  const cellule = (cle: string) => container.querySelector(`[data-cellule-recap="${cle}"]`) as HTMLElement;
  it('octobre : coûts de gestion = sous-total gestion ; CA net 1 000 − 250 = 750 € en vert, « provisoire » (à compléter) ; aucune modification possible', async () => {
    await rendre();
    expect(texte('[data-cellule-recap="ca-couts-gestion-2026-10"]')).toBe(texte('[data-cellule-recap="gestion-total-2026-10"]'));
    expect(texte('[data-cellule-recap="ca-net-2026-10"]')).toBe(montant(750));
    expect(cellule('ca-net-2026-10').className).toContain('rcp-positif');
    expect([cellule('ca-net-2026-10').getAttribute('data-etat-cellule'), cellule('ca-net-2026-10').getAttribute('title')]).toEqual(['provisoire', 'calcul provisoire : données à compléter']);
    expect(cellule('ca-net-2026-10').className).toContain('rcp-a-completer');
    expect(container.querySelector('[data-ligne-recap="ca-net"] [data-modifier-recap], [data-ligne-recap="ca-couts-gestion"] [data-modifier-recap]')).toBeNull();
    // la colonne Total : la somme des mois affichés (septembre importé 18 000 − 250 ; octobre 1 000 − 250)
    expect(texte('[data-total-recap="ca-net"]')).toBe(montant(18000 - 250 + 1000 - 250));
  });
  it('ADHOC d’octobre porté à 3 000 € dans le tableau : coûts de gestion et CA net se relisent — −2 050 € en rouge, signe « − »', async () => {
    await rendre();
    await cliquer('[data-modifier-recap="gestion-adhoc-2026-10"]');
    await taper('[data-editeur-montant]', '3000');
    await cliquer('[data-editeur-enregistrer]'); await cliquer('[data-recap-valider]');
    expect(texte('[data-cellule-recap="ca-couts-gestion-2026-10"]')).toBe(montant(3050));
    expect(texte('[data-cellule-recap="ca-net-2026-10"]')).toBe(`−${montant(2050)}`);
    expect(cellule('ca-net-2026-10').className).toContain('rcp-negatif');
  });
  it('TTC : chaque mode le sien — CA TTC − coûts TTC (1 200 − 300 = 900 €)', async () => {
    window.localStorage.setItem('trx-affichage-montants', 'ttc');
    await rendre();
    expect(texte('[data-cellule-recap="ca-net-2026-10"]')).toBe(montant(900));
  });
});

describe('🔴 CA VENTE et CA LOCATION (Arno, 13/11/2026) — à l’écran', () => {
  const cel = (cle: string) => container.querySelector(`[data-cellule-recap="${cle}"]`) as HTMLElement;
  it('sous le total des coûts : CA vente (sarcelle), CA location (ocre), CA gestion (violet) ; le CA mène à sa source ; trois lignes chacune', async () => {
    await rendre();
    expect([...container.querySelectorAll('[data-section-recap]')].map((x) => [x.getAttribute('data-section-recap'), /trx-serie--(\d+)/.exec(x.className)?.[1] ?? null]))
      .toEqual([['couts', null], ['ca-vente', '6'], ['ca-location', '7'], ['ca', '4'], ['total', null]]); // le CA NET TOTAL : neutre, aucune série de couleur
    expect([...container.querySelectorAll('[data-section-recap="ca-vente"] [data-ligne-recap]')].map((x) => x.getAttribute('data-ligne-recap'))).toEqual(['cav-ca', 'cav-couts', 'cav-net']);
    expect(container.querySelector('[data-source-recap="cav-ca-2026-06"]')?.getAttribute('href')).toBe('/admin/transaction/criterimmo?vue=mois&annee=2026&mois=6');
    expect(container.querySelector('[data-source-recap="cal-ca-2026-06"]')?.getAttribute('href')).toBe('/admin/transaction/location?vue=mois&annee=2026&mois=6');
    expect(texte('[data-cellule-recap="cav-couts-2026-06"]')).toBe(texte('[data-cellule-recap="vente-total-2026-06"]'));
  });
  it('🔴 B — mars : la part de CRITERIMMO, et la mention « dont 1 666,70 € reversés à MACJ — vente partagée », la vente en infobulle', async () => {
    await rendre();
    expect(texte('[data-reverse-recap="cav-ca-2026-03"]')).toBe(`dont ${montant(1666.7)} reversés à MACJ — vente partagée`);
    expect(container.querySelector('[data-reverse-recap="cav-ca-2026-03"]')?.getAttribute('title')).toBe(`Ventes partagées : PARTAGÉE (${eur(1666.7)} HT reversés)`);
    expect(texte('[data-source-recap="cav-ca-2026-03"]')).toBe(montant(1666.69));
    expect(container.querySelector('[data-reverse-recap="cav-ca-2026-06"]')).toBeNull();
  });
  it('le CA net de vente : vert (≥ 0), « provisoire » (un coût de vente à compléter) ; un net négatif : rouge avec « − »', async () => {
    await rendre();
    expect(cel('cav-net-2026-06').className).toContain('rcp-positif');
    expect(cel('cav-net-2026-06').getAttribute('title')).toBe('calcul provisoire : données à compléter');
    // octobre : aucune vente, ADHOC à 3 000 € → la gestion ; la vente d'octobre : 0 € de CA et 0 € de coûts → 0 € vert
    expect(texte('[data-cellule-recap="cav-net-2026-10"]')).toBe(montant(0));
    expect(cel('cal-net-2026-10').className).toMatch(/rcp-(positif|negatif)/);
  });
  it('🔴 le CA NET TOTAL : tout en bas, un bandeau à part (espace au-dessus), la somme des trois CA net ; vert ≥ 0, rouge avec « − » < 0 ; provisoire : l’infobulle', async () => {
    await rendre();
    expect(texte('.rcp-titre')).toBe('Récapitulatif des coûts et du CA — CRITERIMMO');
    const sections = [...container.querySelectorAll('[data-section-recap]')];
    const bas = sections.at(-1)!;
    expect(bas.getAttribute('data-section-recap')).toBe('total');
    expect(bas.querySelector('.rcp-espace')).not.toBeNull();
    expect(bas.querySelector('.rcp-section-titre')).toBeNull();
    expect(texte('[data-ligne-recap="total-net"] th')).toBe('CA NET TOTAL (vente + location + gestion)');
    const centimes = (sel: string) => { const s = texte(sel); const v = Number(s.replace(/[^\d,]/g, '').replace(',', '.')); return (s.includes('−') ? -v : v); };
    for (const mo of ['2026-03', '2026-06', '2026-10']) {
      const somme = ['cav-net', 'cal-net', 'ca-net'].reduce((x, c) => x + centimes(`[data-cellule-recap="${c}-${mo}"]`), 0);
      expect(centimes(`[data-cellule-recap="total-net-${mo}"]`)).toBeCloseTo(somme, 2);
      const classe = cel(`total-net-${mo}`).className;
      expect(classe).toContain(centimes(`[data-cellule-recap="total-net-${mo}"]`) < 0 ? 'rcp-negatif' : 'rcp-positif');
      if (centimes(`[data-cellule-recap="total-net-${mo}"]`) < 0) expect(texte(`[data-cellule-recap="total-net-${mo}"]`)).toMatch(/^−/);
    }
    expect(cel('total-net-2026-10').getAttribute('title')).toBe('calcul provisoire : données à compléter');
    expect(cel('total-net-2026-10').className).toContain('rcp-a-completer');
    expect(container.querySelector('[data-total-recap="total-net"]')).not.toBeNull();
    await cliquer('[data-recap-agence="macj"]');
    expect(texte('[data-ligne-recap="total-net"] th')).toBe('CA NET TOTAL (vente)');
  });
  it('🔴 la séparation COÛTS / CA : partie « Coûts », bandeau TOTAL DES COÛTS (espace au-dessus), espace net, partie « Chiffre d’affaires », puis CA VENTE ; montants du total inchangés', async () => {
    await rendre();
    const ordre = [...container.querySelectorAll('[data-partie-recap], [data-bandeau-recap], [data-section-recap="ca-vente"] .rcp-section-titre, .rcp-espace')]
      .map((x) => x.getAttribute('data-partie-recap') ? `partie:${x.getAttribute('data-partie-recap')}` : x.getAttribute('data-bandeau-recap') ? `bandeau:${x.getAttribute('data-bandeau-recap')}`
        : x.classList.contains('rcp-espace') ? (x.classList.contains('rcp-espace--partie') ? 'espace-partie' : 'espace') : 'titre:ca-vente');
    expect(ordre).toEqual(['partie:couts', 'espace', 'bandeau:couts', 'espace-partie', 'partie:ca', 'titre:ca-vente', 'espace', 'bandeau:ca']);
    expect(texte('[data-partie-recap="couts"]')).toBe('Coûts');
    expect(texte('[data-partie-recap="ca"]')).toBe('Chiffre d’affaires');
    expect(texte('[data-ligne-recap="couts-total"] th')).toBe('TOTAL DES COÛTS (vente + location + gestion)');
    expect(container.querySelector('[data-ligne-recap="couts-total"]')?.className).toContain('rcp-bandeau--couts');
    expect(container.querySelector('[data-ligne-recap="total-net"]')?.className).toContain('rcp-bandeau--ca');
    // les montants : ceux de « Coûts et CA » du mois, comme avant
    for (const mo of [3, 6, 10]) expect(texte(`[data-cellule-recap="couts-total-2026-${String(mo).padStart(2, '0')}"]`))
      .toBe(montant(coutsDuPoint({ ...E_COUTS, gestion }, 'criterimmo', 2026, mo).total.htC / 100));
    expect(cel('couts-total-2026-10').getAttribute('title')).toBe('calcul provisoire : données à compléter');
    await cliquer('[data-recap-agence="macj"]');
    expect(texte('[data-ligne-recap="couts-total"] th')).toBe('TOTAL DES COÛTS (vente)');
    expect(container.querySelector('[data-partie-recap="ca"]')).not.toBeNull();
  });
  it('MACJ : la section CA VENTE seule', async () => {
    await rendre();
    await cliquer('[data-recap-agence="macj"]');
    expect([...container.querySelectorAll('[data-section-recap]')].map((x) => x.getAttribute('data-section-recap'))).toEqual(['couts', 'ca-vente', 'total']);
  });
});
