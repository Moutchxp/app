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
const RETOUR_LOCATION = { fichier: `${L}/commun.tsx`, lien: "<a href={retourVers?.href ?? '/admin/location'}\n        onClick={retourVers?.surClic === undefined ? undefined : (e) => { e.preventDefault(); retourVers.surClic?.(); }}>← {retourVers?.mot ?? 'Location'}</a>" };
/** Arno (23/10/2026) — « Modifier » la fiche du bien : « ← Fiche du bien », vers la fiche de la tuile d'où l'on vient. */
const RETOUR_FICHE_BIEN = [RETOUR_LOCATION, { fichier: `${L}/CreationBien.tsx`, lien: '<EnTeteLocation titre="Modifier le bien" retourVers={modification.dansModale === true ? { ...modification.retour, surClic: annulerModification } : modification.retour}' }];
const FICHE = { fichier: `${RACINE}/gestion/FicheCommune.tsx`, lien: '<a href="/admin/location">← Location</a>' };

const SOUS_PAGES: Record<string, { fichier: string; lien: string }[]> = {
  'gestion/bien/[id]/modifier': [...RETOUR_FICHE_BIEN, { fichier: 'app/lib/gestion/ficheBienAdresses.ts', lien: "{ href: `/admin/gestion?ecran=annuaire&fiche=lot-${lotId}`, mot: 'Fiche du bien' }" }],
  'location/bien/[id]/modifier': [...RETOUR_FICHE_BIEN, { fichier: 'app/lib/gestion/ficheBienAdresses.ts', lien: "{ href: `/admin/location/bien/${lotId}`, mot: 'Fiche du bien' }" }],
  'gestion/rapprochement-dossiers': [{ fichier: `${RACINE}/gestion/rapprochement-dossiers/page.tsx`, lien: 'retour={URL_ACCUEIL_GESTION}' }],
  'location/bien/[id]': [FICHE, { fichier: `${L}/bien/[id]/page.tsx`, lien: '<LienRetour href="/admin/location" />' }],
  'location/proprietaire/[id]': [FICHE, { fichier: `${L}/proprietaire/[id]/page.tsx`, lien: '<LienRetour href="/admin/location" />' }],
  'location/locataire/[id]': [FICHE, { fichier: `${L}/locataire/[id]/page.tsx`, lien: '<LienRetour href="/admin/location" />' },
    { fichier: `${L}/SortieLocataires.tsx`, lien: '<a href="/admin/location/locataires">← Ajouter ou supprimer un locataire</a>' }],
  'location/syndic/[id]': [RETOUR_LOCATION, { fichier: `${L}/syndic/[id]/page.tsx`, lien: '<LienRetour href="/admin/location" />' }],
  'location/clients': [{ fichier: `${L}/ClientsEtBiens.tsx`, lien: '<a href="/admin/location">← Location</a>' }],
  'location/honoraires': [{ fichier: `${L}/honoraires/HonorairesGestion.tsx`, lien: '<a href="/admin/location">← Location</a>' }],
  'location/locataires': [{ fichier: `${L}/EcransLocation.tsx`, lien: '<a href="/admin/location">← Location</a>' }],
  'location/locataires/ajouter': [{ fichier: `${L}/SortieLocataires.tsx`, lien: '<a href="/admin/location/locataires">← Locataires</a>' }],
  'location/locataires/supprimer': [{ fichier: `${L}/SortieLocataires.tsx`, lien: '<a href="/admin/location/locataires">← Locataires</a>' }],
  'location/nouveau-bien': [RETOUR_LOCATION, { fichier: `${L}/CreationBien.tsx`, lien: '<EnTeteLocation titre="Ajouter un nouveau bien"' }],
  'location/nouveau-locataire': [RETOUR_LOCATION, { fichier: `${L}/CreationLocataire.tsx`, lien: '<EnTeteLocation titre="Nouveau locataire"' }],
  'location/nouveau-proprietaire': [RETOUR_LOCATION, { fichier: `${L}/CreationProprietaires.tsx`, lien: '<EnTeteLocation titre="Créer un nouveau propriétaire"' }],
  'location/nouveau': [RETOUR_LOCATION, { fichier: `${L}/CreationProprietaireBien.tsx`, lien: '<EnTeteLocation titre="Nouveau propriétaire + bien"' }],
  'location/outils': [RETOUR_LOCATION, { fichier: `${L}/EcransLocation.tsx`, lien: '<EnTeteLocation titre="Outils de suivi"' }],
  // Arno (23/10/2026) — les deux briques des « Outils de suivi » : retour vers les outils.
  'location/outils/mois': [{ fichier: `${L}/EcransLocation.tsx`, lien: '<a href="/admin/location/outils">← Outils de suivi</a>' }],
  'location/outils/annee': [{ fichier: `${L}/EcransLocation.tsx`, lien: '<a href="/admin/location/outils">← Outils de suivi</a>' }],
  // 🔴 Arno (25/10/2026) — « Paramètres Location » en page, depuis Outils de suivi (OUTILS_SUIVI = '/admin/location/outils').
  'location/outils/parametres': [{ fichier: `${L}/ParametresLocation.tsx`, lien: '<a href={OUTILS_SUIVI} data-retour-outils>← Outils de suivi</a>' },
    { fichier: `${L}/parametresAdresse.ts`, lien: "export const OUTILS_SUIVI = '/admin/location/outils';" }],
  'location/proprietaires': [{ fichier: `${L}/EcransLocation.tsx`, lien: '<a href="/admin/location">← Location</a>' }],
  'location/proprietaires/supprimer': [{ fichier: `${L}/EcransLocation.tsx`, lien: '<a href="/admin/location/proprietaires">← Propriétaires et biens</a>' }],
  'location/proprietaires/archiver': [{ fichier: `${L}/ArchivageProprietaire.tsx`, lien: '<a href="/admin/location/proprietaires/supprimer">← Supprimer un propriétaire ou un bien</a>' }],
  // TRANSACTION (27/10/2026) — les trois tuiles de la Transaction : retour vers l'accueil de la tuile.
  // LOT L (Arno, 28/10/2026) — CRITERIMMO et MACJ sont sous « Transaction » (/admin/transaction/ventes) ; « Gestion » et « CA global » sous l'accueil.
  'transaction/criterimmo': [{ fichier: `${RACINE}/transaction/criterimmo/page.tsx`, lien: 'retour="/admin/transaction/ventes"' }],
  'transaction/gestion': [{ fichier: `${RACINE}/transaction/gestion/page.tsx`, lien: 'retour="/admin/transaction"' }],
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
    expect(html).toContain('<a href="/admin/gestion?ecran=partage" class="svv-page-retour-lien" data-retour-tuile="">← Retour</a>');
  });
  it('sans `retour` : rien de changé', () => {
    expect(renderToStaticMarkup(createElement(EnTetePage, { titre: 'T', intro: 'I' }))).not.toContain('Retour');
  });
  it('cible tactile ≥ 44 px', () => {
    expect(readFileSync('app/globals.css', 'utf8')).toMatch(/\.svv-page-retour-lien\{[^}]*min-height:44px/);
  });
});
