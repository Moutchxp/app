import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { EnTetePage } from './_composants/EnTetePage';
import { liensVisibles } from './menuAdmin';

/**
 * 🔴🔴 Arno (22/10/2026) — « Sur toute page qui n'est pas la première page de sa tuile et qui n'a pas déjà de bouton de
 * retour, ajoute en haut à gauche, au-dessus du titre, un lien « ← Retour » qui ramène à la page précédente de la tuile
 * (son parent logique, pas l'historique du navigateur). »
 *
 * L'INVENTAIRE : chaque sous-page d'une tuile, le fichier qui porte son lien de retour, et l'adresse visée. Une sous-page
 * ajoutée plus tard fait rougir ce garde tant qu'elle n'y est pas inscrite — avec son lien.
 */
const RACINE = 'app/(admin)/admin/(protected)';
const L = `${RACINE}/location`;
// EnTeteLocation (retour par défaut : « ← Location » ; Arno, 23/10/2026 : « Modifier » la fiche du bien y passe le retour vers la fiche).
// Arno (24/10/2026) — le lien peut refermer une modale (`surClic`, « Caractéristiques du bien loué ») : il reste le même lien.
// 🔴 Arno (11/11/2026) — LE lien de retour COMMUN (`LienRetour`, `_composants/NavigationRetour`) : vers l'origine si elle est connue, sinon ce parent.
const RETOUR_LOCATION = { fichier: `${L}/commun.tsx`, lien: "<LienRetour href={retourVers?.href ?? '/admin/location'} mot={retourVers?.mot ?? 'Location'} surClic={retourVers?.surClic} />" };
/** Arno (23/10/2026) — « Modifier » la fiche du bien : « ← Fiche du bien », vers la fiche de la tuile d'où l'on vient. */
const RETOUR_FICHE_BIEN = [RETOUR_LOCATION, { fichier: `${L}/CreationBien.tsx`, lien: '<EnTeteLocation titre="Modifier le bien" retourVers={modification.dansModale === true ? { ...modification.retour, surClic: annulerModification } : modification.retour}' }];
const FICHE = { fichier: `${RACINE}/gestion/FicheCommune.tsx`, lien: '<LienRetour href="/admin/location" mot="Location" />' };

const SOUS_PAGES: Record<string, { fichier: string; lien: string }[]> = {
  'gestion/bien/[id]/modifier': [...RETOUR_FICHE_BIEN, { fichier: 'app/lib/gestion/ficheBienAdresses.ts', lien: "{ href: `/admin/gestion?ecran=annuaire&fiche=lot-${lotId}`, mot: 'Fiche du bien' }" }],
  'location/bien/[id]/modifier': [...RETOUR_FICHE_BIEN, { fichier: 'app/lib/gestion/ficheBienAdresses.ts', lien: "{ href: `/admin/location/bien/${lotId}`, mot: 'Fiche du bien' }" }],
  'gestion/rapprochement-dossiers': [{ fichier: `${RACINE}/gestion/rapprochement-dossiers/page.tsx`, lien: 'retour={URL_ACCUEIL_GESTION}' }],
  'location/bien/[id]': [FICHE, { fichier: `${L}/bien/[id]/page.tsx`, lien: '<LienRetour href="/admin/location" />' }],
  'location/proprietaire/[id]': [FICHE, { fichier: `${L}/proprietaire/[id]/page.tsx`, lien: '<LienRetour href="/admin/location" />' }],
  'location/locataire/[id]': [FICHE, { fichier: `${L}/locataire/[id]/page.tsx`, lien: '<LienRetour href="/admin/location" />' },
    { fichier: `${L}/SortieLocataires.tsx`, lien: '<LienRetour href="/admin/location/locataires" mot="Ajouter ou supprimer un locataire" />' }],
  'location/syndic/[id]': [RETOUR_LOCATION, { fichier: `${L}/syndic/[id]/page.tsx`, lien: '<LienRetour href="/admin/location" />' }],
  // 🔴 Arno (10/11/2026) — le module « Préavis » en pleine page.
  'location/preavis': [RETOUR_LOCATION, { fichier: `${L}/preavis/page.tsx`, lien: '<LienRetour href="/admin/location" />' }],
  // 🔴 Arno (13/11/2026) — le récapitulatif des coûts et du CA gestion : « ← Retour » vers la page d'origine (Mon espace par défaut)
  'mon-espace/recapitulatif': [{ fichier: 'app/(admin)/admin/(protected)/mon-espace/recapitulatif/page.tsx', lien: '<LienRetour href="/admin/mon-espace" />' }],
  'location/clients': [{ fichier: `${L}/ClientsEtBiens.tsx`, lien: '<LienRetour href="/admin/location" mot="Location" />' }],
  'location/honoraires': [{ fichier: `${L}/honoraires/HonorairesGestion.tsx`, lien: '<LienRetour href="/admin/location" mot="Location" />' }],
  'location/locataires': [{ fichier: `${L}/EcransLocation.tsx`, lien: '<LienRetour href="/admin/location" mot="Location" />' }],
  'location/locataires/ajouter': [{ fichier: `${L}/SortieLocataires.tsx`, lien: '<LienRetour href="/admin/location/locataires" mot="Locataires" />' }],
  'location/locataires/supprimer': [{ fichier: `${L}/SortieLocataires.tsx`, lien: '<LienRetour href="/admin/location/locataires" mot="Locataires" />' }],
  'location/nouveau-bien': [RETOUR_LOCATION, { fichier: `${L}/CreationBien.tsx`, lien: '<EnTeteLocation titre="Ajouter un nouveau bien"' }],
  'location/nouveau-locataire': [RETOUR_LOCATION, { fichier: `${L}/CreationLocataire.tsx`, lien: '<EnTeteLocation titre="Nouveau locataire"' }],
  'location/nouveau-proprietaire': [RETOUR_LOCATION, { fichier: `${L}/CreationProprietaires.tsx`, lien: '<EnTeteLocation titre="Créer un nouveau propriétaire"' }],
  'location/nouveau': [RETOUR_LOCATION, { fichier: `${L}/CreationProprietaireBien.tsx`, lien: '<EnTeteLocation titre="Nouveau propriétaire + bien"' }],
  'location/outils': [RETOUR_LOCATION, { fichier: `${L}/EcransLocation.tsx`, lien: '<EnTeteLocation titre="Outils de suivi"' }],
  // Arno (23/10/2026) — les deux briques des « Outils de suivi » : retour vers les outils.
  'location/outils/mois': [{ fichier: `${L}/EcransLocation.tsx`, lien: '<LienRetour href="/admin/location/outils" mot="Outils de suivi" />' }],
  'location/outils/annee': [{ fichier: `${L}/EcransLocation.tsx`, lien: '<LienRetour href="/admin/location/outils" mot="Outils de suivi" />' }],
  // 🔴 Arno (25/10/2026) — « Paramètres Location » en page, depuis Outils de suivi (OUTILS_SUIVI = '/admin/location/outils').
  'location/outils/parametres': [{ fichier: `${L}/ParametresLocation.tsx`, lien: '<LienRetour href={OUTILS_SUIVI} mot="Outils de suivi" data-retour-outils="" />' },
    { fichier: `${L}/parametresAdresse.ts`, lien: "export const OUTILS_SUIVI = '/admin/location/outils';" }],
  'location/proprietaires': [{ fichier: `${L}/EcransLocation.tsx`, lien: '<LienRetour href="/admin/location" mot="Location" />' }],
  'location/proprietaires/supprimer': [{ fichier: `${L}/EcransLocation.tsx`, lien: '<LienRetour href="/admin/location/proprietaires" mot="Propriétaires et biens" />' }],
  'location/proprietaires/archiver': [{ fichier: `${L}/ArchivageProprietaire.tsx`, lien: '<LienRetour href="/admin/location/proprietaires/supprimer" mot="Supprimer un propriétaire ou un bien" />' }],
  // TRANSACTION (27/10/2026) — les trois tuiles de la Transaction : retour vers l'accueil de la tuile.
  // LOT L (Arno, 28/10/2026) — CRITERIMMO et MACJ sont sous « Transaction » (/admin/transaction/ventes) ; « Gestion » et « CA global » sous l'accueil.
  'transaction/criterimmo': [{ fichier: `${RACINE}/transaction/criterimmo/page.tsx`, lien: 'retour="/admin/transaction/ventes"' }],
  // 🔴 LOT DM — la FUSION des deux sociétés, sous « Transaction vente »
  'transaction/fusion': [{ fichier: `${RACINE}/transaction/fusion/page.tsx`, lien: 'retour="/admin/transaction/ventes"' }],
  // 🔴 LOT DX — « Location & Gestion » sous l'accueil ; la Location, la Gestion et leur FUSION sous « Location & Gestion »
  'transaction/gestion': [{ fichier: `${RACINE}/transaction/gestion/page.tsx`, lien: 'retour="/admin/transaction/location-gestion"' }],
  'transaction/location': [{ fichier: `${RACINE}/transaction/location/page.tsx`, lien: 'retour="/admin/transaction/location-gestion"' }],
  'transaction/location-gestion': [{ fichier: `${RACINE}/transaction/location-gestion/page.tsx`, lien: 'retour="/admin/transaction"' }],
  'transaction/location-gestion/fusion': [{ fichier: `${RACINE}/transaction/location-gestion/fusion/page.tsx`, lien: 'retour="/admin/transaction/location-gestion"' }],
  'transaction/global': [{ fichier: `${RACINE}/transaction/global/page.tsx`, lien: 'retour="/admin/transaction"' }],
  'transaction/macj': [{ fichier: `${RACINE}/transaction/macj/page.tsx`, lien: 'retour="/admin/transaction/ventes"' }],
  'transaction/ventes': [{ fichier: `${RACINE}/transaction/ventes/page.tsx`, lien: 'retour="/admin/transaction"' }],
};
/** Hors tuile : l'accueil de l'admin, la boîte de recette (mode recette seul), « Mes tâches » (sans entrée de menu). */
const HORS_TUILE = ['', 'recette', 'taches'];

function pages(dossier: string): string[] {
  return readdirSync(dossier).flatMap((n) => {
    const p = join(dossier, n);
    if (statSync(p).isDirectory()) return pages(p);
    return n === 'page.tsx' ? [relative(RACINE, dossier)] : [];
  });
}

describe('🔴🔴 « ← Retour » sur chaque sous-page de tuile', () => {
  const accueils = liensVisibles('administrateur', {} as never).map((l) => l.slug.replace('/admin/', ''));
  const toutes = pages(RACINE).sort();

  it('l’inventaire est complet : toute page est un accueil de tuile, hors tuile, ou une sous-page inscrite', () => {
    const sous = toutes.filter((p) => !accueils.includes(p) && !HORS_TUILE.includes(p));
    expect(sous).toEqual(Object.keys(SOUS_PAGES).sort());
  });
  for (const [page, liens] of Object.entries(SOUS_PAGES)) {
    it(`${page} : lien de retour vers son parent`, () => {
      for (const { fichier, lien } of liens) expect(readFileSync(fichier, 'utf8'), fichier).toContain(lien);
    });
  }
  it('`EnTeteLocation` pose « ← Location » par défaut (retour = true)', () => {
    expect(readFileSync(RETOUR_LOCATION.fichier, 'utf8')).toContain("retour = true");
  });
});

describe('le lien « ← Retour » de l’en-tête standard', () => {
  it('au-dessus du titre, vers l’adresse donnée, même classe partout', () => {
    const html = renderToStaticMarkup(createElement(EnTetePage, { titre: 'T', intro: 'I', retour: '/admin/gestion?ecran=partage' }));
    expect(html.indexOf('← Retour')).toBeGreaterThan(-1);
    expect(html.indexOf('← Retour')).toBeLessThan(html.indexOf('<h1'));
    // 🔴 Arno (11/11/2026) — le lien commun : même adresse parente et même classe ; vers l'origine quand elle est connue (navigateur).
    expect(html).toMatch(/<a href="\/admin\/gestion\?ecran=partage" class="svv-page-retour-lien" data-retour-lien="" data-retour-origine="non" data-retour-tuile="">← Retour<\/a>/);
  });
  it('sans `retour` : rien de changé', () => {
    expect(renderToStaticMarkup(createElement(EnTetePage, { titre: 'T', intro: 'I' }))).not.toContain('Retour');
  });
  it('cible tactile ≥ 44 px', () => {
    expect(readFileSync('app/globals.css', 'utf8')).toMatch(/\.svv-page-retour-lien\{[^}]*min-height:44px/);
  });
});

describe('🔴🔴 Arno (11/11/2026) — UN SEUL mécanisme de retour (pas une copie par page)', () => {
  it('chaque « ← … » de retour de la Location passe par le lien commun `LienRetour` ; le suivi est monté une fois, dans le gabarit', () => {
    const tsx: string[] = [];
    const parcourir = (d: string): void => { for (const n of readdirSync(d)) { const p = join(d, n); if (statSync(p).isDirectory()) parcourir(p); else if (/\.tsx$/.test(n) && !/\.test\.tsx$/.test(n)) tsx.push(p); } };
    parcourir(`${RACINE}/location`);
    tsx.push(`${RACINE}/gestion/FicheCommune.tsx`);
    const brutes = tsx.flatMap((f) => [...readFileSync(f, 'utf8').matchAll(/<p className="(loc-retour|fco-retour|hon-retour|plo-retour-page)"[^>]*>(?!\s*<LienRetour)/g)].map((m) => `${f} : ${m[0]}`));
    expect(brutes).toEqual([]);
    const gabarit = readFileSync(`${RACINE}/layout.tsx`, 'utf8');
    expect(gabarit.match(/<SuiviNavigationRetour \/>/g)).toHaveLength(1);
  });
});
