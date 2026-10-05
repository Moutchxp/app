'use client';

import { useId, useState } from 'react';
import { detailPartieDestinataire, type PartieDestinataire }
  from '../../../../lib/gestion/historiqueBien';

/**
 * ══ 🔴🔴 LOT HISTORIQUE-BIEN-14, POINT 2 — « → ENVOYÉ À LA PARTIE … », SOUS LA DATE ══════════════════════════════
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * DEMANDE D'ARNO (05/10/2026), mot pour mot : « Dans le résumé des pièces (et sur les miniatures du mail déplié),
 * pour toute pièce ENVOYÉE PAR NOUS, ajoute SOUS LA DATE une ligne par partie destinataire : flèche rouge
 * "→ envoyé à la partie propriétaire", flèche verte "→ envoyé à la partie locataire", flèche bleue "→ envoyé à la
 * partie tiers indépendant" ; gris "→ envoyé à un destinataire non affecté" si besoin. Si plusieurs parties sont
 * destinataires, une ligne par partie. Chaque ligne se termine par un petit "i" cerclé. Au survol (ET AU CLIC AU
 * CLAVIER), une info-bulle liste toutes les adresses de cette partie à qui la pièce a été envoyée (À / Cc, nom et
 * adresse). »
 *
 * ═══ 🔴 POURQUOI UN FICHIER À PART, ET NON DEUX RENDUS ══════════════════════════════════════════════════════════
 *
 * Ces lignes paraissent à DEUX endroits — les cartes du résumé des pièces et les miniatures du mail déplié — et
 * elles disent la même chose. Les écrire deux fois, c'était se donner deux jeux de couleurs, deux ordres de
 * lignes et deux info-bulles qui auraient divergé au premier correctif. Un composant, deux montages.
 *
 * ═══ 🔴🔴 LE « i » EST UN VRAI BOUTON, ET IL LE FALLAIT ═════════════════════════════════════════════════════════
 *
 * Arno demande l'info-bulle « au survol ET au clic au clavier ». Un `title` seul ne répond qu'au survol : sur un
 * téléphone, et pour qui navigue au clavier, il n'existe pas — c'est l'exigence transverse du dépôt (« pas
 * d'interaction dépendant du survol seul »). Le bouton porte donc les DEUX : le `title` pour la souris, et un
 * panneau qu'il ouvre et ferme pour tout le monde. Cible de 44 px, `aria-expanded`, et le panneau est relié au
 * bouton par `aria-controls` — un lecteur d'écran annonce donc ce qu'il vient d'ouvrir.
 *
 * ⚠️ TOUT CE QUI SE DÉCIDE EST DANS LE MODULE PUR : la liste des parties, leur ordre, leur ton, leur phrase et le
 * texte du détail (`partiesDestinataires`, `detailPartieDestinataire`). Ce fichier place et peint.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */
export function DestinatairesDePiece({ parties }: {
  /** Les parties destinataires, déjà calculées par le module pur. Vide ⇒ rien n'est rendu. */
  parties: readonly PartieDestinataire[];
}) {
  if (parties.length === 0) return null;
  return (
    <ul className="ddp">
      {parties.map((p) => <LigneDestinataire key={p.cle} p={p} />)}
    </ul>
  );
}

function LigneDestinataire({ p }: { p: PartieDestinataire }) {
  const [ouvert, setOuvert] = useState(false);
  /* ⚠️ UN IDENTIFIANT STABLE ET UNIQUE : la même pièce peut être montée deux fois (résumé du haut et du bas), et
     deux panneaux de même `id` auraient fait pointer `aria-controls` sur le mauvais. */
  const id = useId();
  const detail = detailPartieDestinataire(p);
  return (
    <li className={`ddp-ligne ddp-ligne--${p.ton}`}>
      <span className="ddp-mot">{p.mot}</span>
      <button
        type="button"
        className="ddp-i"
        aria-expanded={ouvert}
        aria-controls={id}
        /* ⚠️ LE LIBELLÉ ACCESSIBLE DIT CE QU'ON OUVRE, et pas « i » : « i » n'est pas une information. */
        aria-label={`Les adresses — ${p.mot.replace('→ ', '')}`}
        title={detail}
        onClick={() => setOuvert((v) => !v)}>
        <span aria-hidden="true">i</span>
      </button>
      {/* 🔴 LE PANNEAU EST TOUJOURS DANS LE DOCUMENT quand il est ouvert, et jamais un `title` recopié : le
          `title` est pour la souris, ceci est pour tous les autres. Même texte, une seule source. */}
      {ouvert && (
        <ul className="ddp-detail" id={id}>
          {p.adresses.map((d) => (
            <li key={`${d.champ}-${d.adresse}`}>
              <span className="ddp-champ">{d.champ}</span>
              {d.nom === null || d.nom.trim() === ''
                ? d.adresse
                : <>{d.nom} <span className="ddp-adresse">{d.adresse}</span></>}
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}

/**
 * ══ 🔴 LES QUATRE TONS SONT CEUX DES ENCARTS, ET AUCUNE COULEUR N'EST ÉCRITE EN DUR ══════════════════════════════
 *
 * Rouge propriétaire, vert locataire, bleu tiers indépendant, gris non affecté : les MÊMES jetons que les bords
 * des encarts et que les barres du listing. Un `#rrggbb` écrit ici aurait donné la même teinte dans les deux
 * thèmes — ce que le garde de ce dépôt interdit, et il a raison : le bleu clair du mode Clair est illisible sur
 * le fond du mode Sombre.
 *
 * ⚠️ LA FLÈCHE EST DANS LE MOT, pas dans la feuille : elle vient du module pur (« → envoyé à … »), donc elle est
 * LUE par un lecteur d'écran. Une flèche posée en `::before` aurait été muette.
 */
export const CSS_DESTINATAIRES_PIECE = `
.ddp{list-style:none;margin:.15rem 0 0;padding:0;display:flex;flex-direction:column;gap:1px;min-width:0}
.ddp-ligne{display:flex;flex-wrap:wrap;align-items:center;gap:.25rem;min-width:0;font-size:.72rem}
/* 🔴 DEFAUT VU A L'ECRAN (bien-324, carte du 30/12/2025) : « → envoyé à la partie tiers indépendant » est plus
   long que la carte, et le « i » passait SEUL a la ligne suivante — on ne savait plus a quelle phrase il se
   rapporte. Une base de flex NULLE (flex:1 1 0) fait que le mot se retrecit le premier, et le « i » ne quitte
   jamais sa ligne. Un min-width:0 seul ne suffisait pas : la base auto du mot valait sa largeur de texte. */
.ddp-mot{flex:1 1 0;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
/* ── LES QUATRE TONS ── Le MOT porte la couleur : c'est lui qu'on lit, et la flèche en fait partie. */
.ddp-ligne--rouge .ddp-mot{color:var(--color-svv-red)}
.ddp-ligne--vert .ddp-mot{color:var(--color-svv-green)}
.ddp-ligne--bleu .ddp-mot{color:var(--color-svv-blue)}
.ddp-ligne--gris .ddp-mot{color:var(--color-svv-ink-soft)}
/* 🔴 LE « i » CERCLE — 44 px de cible tactile, mais un TRACE de 16 px : la cible deborde le dessin, elle ne le
   grossit pas. Sans cela la ligne aurait fait 44 px de haut sous chaque pièce. */
.ddp-i{flex:0 0 auto;display:inline-flex;align-items:center;justify-content:center;
  width:16px;height:16px;padding:0;margin:0;border:1px solid currentColor;border-radius:50%;
  background:none;font:inherit;font-size:.62rem;font-weight:700;line-height:1;
  color:var(--color-svv-ink-soft);cursor:pointer;position:relative}
.ddp-i::after{content:"";position:absolute;inset:-14px;}
.ddp-i:focus-visible{outline:2px solid var(--color-svv-red);outline-offset:2px}
.ddp-i[aria-expanded="true"]{color:var(--color-svv-ink);border-width:2px}
/* Le detail : une liste sous la ligne, en retrait, qui ne tronque PAS — on vient y lire une adresse en entier. */
.ddp-detail{list-style:none;margin:.1rem 0 .15rem;padding:0 0 0 .8rem;flex:1 0 100%;
  display:flex;flex-direction:column;gap:1px;font-size:.7rem;color:var(--color-svv-ink-soft);
  border-left:2px solid var(--color-svv-line);overflow-wrap:anywhere}
.ddp-champ{display:inline-block;min-width:1.6rem;font-weight:700;color:var(--color-svv-ink)}
.ddp-adresse{color:var(--color-svv-muted)}
`;
