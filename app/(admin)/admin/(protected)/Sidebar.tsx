'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { liensVisibles, ordonner } from './menuAdmin';
import { SelecteurTheme } from './SelecteurTheme';
import type { Perms, RoleAdmin } from '../../../lib/admin/session';

/**
 * LOT 5-FUSION-B — l'élément dans lequel un écran en plein écran vient poser SA colonne (portail React), et
 * l'attribut qu'il pose sur la racine du document pour que le CSS d'ici s'applique. Exportés pour qu'il n'existe
 * qu'UNE chaîne de chaque côté : un identifiant recopié à la main d'un fichier à l'autre finit toujours par dériver,
 * et le portail tomberait alors dans le vide, en silence.
 */
export const ID_EMPLACEMENT_MODE = 'svv-adm-mode';
export const ATTR_PLEIN_ECRAN = 'data-gst-plein';
/** Sur téléphone seulement : quel des deux écrans on regarde — la colonne du mode, ou son contenu. */
export const ATTR_MOBILE = 'data-gst-mobile';

export function Sidebar({ role, perms, ordreModules }: { role: RoleAdmin; perms: Perms; ordreModules?: unknown }) {
  const pathname = usePathname();
  const [ouvert, setOuvert] = useState(false);
  // Filtrage RÔLE D'ABORD (cf. menuAdmin) : administrateur → tout + « Administratif » ; collaborateur → ses perms.
  // Puis `ordonner()` applique l'ordre personnalisé (migration 030) — MÊME appel que la grille du tableau de bord.
  // CONFORT uniquement ; proxy.ts reste la seule autorité. `ordonner` ne peut jamais élargir au-delà du rôle.
  const MODULES = ordonner(liensVisibles(role, perms), ordreModules);

  async function deconnexion() {
    try {
      await fetch('/api/admin/session', { method: 'DELETE' });
    } finally {
      window.location.assign('/admin/login');
    }
  }

  return (
    <>
      <style>{CSS}</style>
      <aside className="svv-adm-sidebar">
        <div className="svv-adm-brand-row">
          <Link href="/admin" className="svv-adm-brand" onClick={() => setOuvert(false)}>
            Admin <span className="svv-adm-brand-mark">SVAV®</span>
          </Link>
          <button
            type="button"
            className="svv-adm-burger"
            aria-label={ouvert ? 'Fermer la navigation' : 'Ouvrir la navigation'}
            aria-expanded={ouvert}
            onClick={() => setOuvert((v) => !v)}
          >
            <span className="svv-adm-burger-bars" aria-hidden="true">
              ≡
            </span>
          </button>
        </div>

        {/* LOT 5-FUSION-B — EMPLACEMENT DU MODE. Vide et invisible en temps normal : un écran qui passe en plein écran
            (aujourd'hui la boîte de gestion) y dépose SA colonne, par un portail React, et pose
            `data-gst-plein="1"` sur la racine du document. Le CSS ci-dessous masque alors les liens de modules — et
            EUX SEULS : la marque « Admin SVAV® » au-dessus, la déconnexion et le thème en dessous restent en place.
            L'écran partagé, lui, ne touche à rien.

            POURQUOI UN PORTAIL, et pas une colonne dessinée dans la page : la barre latérale est un FRÈRE du contenu
            dans la coquille de l'admin, jamais son parent. Redessiner une deuxième colonne à côté aurait donné deux
            barres sur les grands écrans, et deux marques « Admin SVAV® ». */}
        <div id={ID_EMPLACEMENT_MODE} className="svv-adm-mode" />

        <nav className="svv-adm-nav" data-open={ouvert}>
          {MODULES.map((m) => {
            const actif = pathname === m.slug || pathname.startsWith(m.slug + '/');
            return (
              <Link
                key={m.slug}
                href={m.slug}
                className="svv-adm-link"
                data-actif={actif}
                aria-current={actif ? 'page' : undefined}
                onClick={() => setOuvert(false)}
              >
                {m.libelle}
              </Link>
            );
          })}

          <button type="button" className="svv-adm-logout" onClick={deconnexion}>
            Déconnexion
          </button>

          {/* LOT 37 — bascule de thème (Clair/Sombre/Système). Dans la nav : sur mobile elle vit dans le menu burger, sur desktop en pied de sidebar. */}
          <div className="svv-adm-theme">
            <span className="svv-adm-theme-lbl">Thème</span>
            <SelecteurTheme />
          </div>
        </nav>
      </aside>
    </>
  );
}

const CSS = `
.svv-adm-shell{min-height:100dvh;display:flex;flex-direction:column}
.svv-adm-content{flex:1;display:flex;flex-direction:column;min-width:0}
.svv-adm-bandeau{border-bottom:1px solid var(--color-svv-line);padding:.6rem 1rem;font-size:.8rem;color:var(--color-svv-muted);background:var(--color-svv-field)}
.svv-adm-main{flex:1;padding:1.25rem;min-width:0}

.svv-adm-sidebar{background:var(--color-svv-surface);border-bottom:1px solid var(--color-svv-line)}
.svv-adm-brand-row{display:flex;align-items:center;justify-content:space-between;padding:.6rem 1rem;min-height:56px}
.svv-adm-brand{display:inline-flex;align-items:center;gap:.4rem;font-weight:800;color:var(--color-svv-ink);text-decoration:none;font-size:1rem}
.svv-adm-brand-mark{color:var(--color-svv-red)}
.svv-adm-burger{display:inline-flex;align-items:center;justify-content:center;min-width:44px;min-height:44px;border:1px solid var(--color-svv-line);border-radius:.6rem;background:var(--color-svv-surface);color:var(--color-svv-ink);cursor:pointer}
.svv-adm-burger-bars{font-size:1.4rem;line-height:1}

.svv-adm-nav{display:none;flex-direction:column;gap:.25rem;padding:.25rem .75rem 1rem}
.svv-adm-nav[data-open="true"]{display:flex}
.svv-adm-link{display:flex;align-items:center;min-height:44px;padding:.5rem .75rem;border-radius:.6rem;color:var(--color-svv-gray);text-decoration:none;font-weight:600;font-size:.95rem}
.svv-adm-link:hover{background:var(--color-svv-field)}
.svv-adm-link[data-actif="true"]{background:var(--color-svv-green-soft);color:var(--color-svv-green-ink)}
.svv-adm-logout{display:flex;align-items:center;min-height:44px;margin-top:.5rem;padding:.5rem .75rem;border:1px solid var(--color-svv-line);border-radius:.6rem;background:var(--color-svv-surface);color:var(--color-svv-red);font-weight:700;font-size:.95rem;cursor:pointer;text-align:left}
.svv-adm-logout:hover{background:var(--color-svv-field)}
.svv-adm-theme{margin-top:.75rem;padding-top:.75rem;border-top:1px solid var(--color-svv-line)}
.svv-adm-theme-lbl{display:block;font-size:.7rem;font-weight:700;letter-spacing:.03em;text-transform:uppercase;color:var(--color-svv-muted);margin-bottom:.35rem}

/* ── LOT 5-FUSION-B : LA COLONNE DU MODE ────────────────────────────────────────────────────────────────────────── */
/* Vide, elle ne prend RIEN : aucune bordure, aucune marge, aucun espace réservé. L'écran partagé ne voit aucun
   changement — et c'est la condition pour que ce lot ne touche qu'au plein écran. */
.svv-adm-mode:empty{display:none}
.svv-adm-mode{padding:.25rem .75rem}

/* EN PLEIN ÉCRAN : les liens de modules s'effacent, et EUX SEULS. La marque reste au-dessus (elle ramène à l'accueil,
   d'où tous les modules sont atteignables), la déconnexion et le thème restent en dessous, en format compact. */
:root[data-gst-plein="1"] .svv-adm-link{display:none}
:root[data-gst-plein="1"] .svv-adm-logout{margin-top:0;min-height:40px;padding:.35rem .6rem;font-size:.85rem}
:root[data-gst-plein="1"] .svv-adm-theme{margin-top:.5rem;padding-top:.5rem}
:root[data-gst-plein="1"] .svv-adm-theme-lbl{margin-bottom:.2rem}

/* TÉLÉPHONE : deux écrans, jamais deux colonnes de 160 px. La colonne du mode d'abord, son contenu ensuite, et un
   retour explicite entre les deux (rendu par l'écran, pas par le CSS). La barre du haut ne bouge pas. */
@media (max-width:767px){
  :root[data-gst-mobile="colonne"] .svv-adm-content{display:none}
  :root[data-gst-mobile="contenu"] .svv-adm-mode{display:none}
}

@media (min-width:768px){
  .svv-adm-shell{flex-direction:row}
  .svv-adm-sidebar{width:240px;flex:0 0 240px;border-right:1px solid var(--color-svv-line);border-bottom:0;height:100dvh;position:sticky;top:0;display:flex;flex-direction:column}
  .svv-adm-burger{display:none}
  .svv-adm-nav{display:flex !important}
  /* La colonne du mode prend la hauteur libre et défile SEULE ; déconnexion et thème restent collés en bas. */
  :root[data-gst-plein="1"] .svv-adm-mode{flex:1;min-height:0;overflow-y:auto}
  :root[data-gst-plein="1"] .svv-adm-nav{margin-top:auto;padding-bottom:.75rem;border-top:1px solid var(--color-svv-line);padding-top:.5rem}
}
`;
