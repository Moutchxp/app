'use client';

import { useId, useState } from 'react';
import { detailFamilles, mentionDansFamille, type FamilleVue }
  from '../../../../lib/gestion/familleDestinataire';

/**
 * ══ 🔴🔴 LOT PJ-STATUT-ENVOI-FAMILLES — LE STATUT D'ENVOI, SUR LA MINIATURE D'UNE PIÈCE ═════════════════════════
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * DEMANDE D'ARNO (07/10/2026) : « une capsule par famille présente parmi les destinataires, jamais deux fois la
 * même famille, dans l'ordre Propriétaire, Locataire, Tiers indépendant, Interne, Extérieur. […] Dès qu'au moins
 * une capsule est affichée, un petit picto “i” à côté. Au survol (et au focus clavier), une bulle liste toutes les
 * adresses qui ont reçu cette pièce, GROUPÉES par famille avec le titre de famille dans sa couleur. »
 *
 * ═══ 🔴🔴 CE QUE CE FICHIER REMPLACE ════════════════════════════════════════════════════════════════════════════
 *
 * Il rendait, depuis le lot HISTORIQUE-BIEN-14, une LIGNE par partie (« → envoyé à la partie propriétaire »),
 * chacune avec SON « i » et SON panneau. Arno remplace les lignes par des CAPSULES et les N boutons par UN SEUL,
 * dont la bulle couvre toute la pièce. Rien n'est perdu : les mêmes adresses, les mêmes familles, le même détail —
 * et deux familles de plus (Interne, Extérieur) que les lignes ne savaient pas dire.
 *
 * ═══ 🔴 UN SEUL « i », ET C'EST TOUT L'INTÉRÊT ══════════════════════════════════════════════════════════════════
 *
 * Trois lignes faisaient trois boutons, donc trois arrêts de tabulation et trois panneaux à ouvrir pour lire cinq
 * adresses. La question qu'on se pose devant une pièce est « qui l'a reçue ? » — elle est UNE, et sa réponse aussi.
 *
 * ═══ 🔴🔴 LA BULLE S'OUVRE AU SURVOL **ET** AU FOCUS, SANS UNE RÈGLE `:hover` ═══════════════════════════════════
 *
 * L'exigence transverse du module interdit toute interaction qui dépende du survol SEUL, et son garde refuse un
 * `:hover` qui n'aurait pas son pendant au clavier. On ouvre donc le panneau depuis le COMPOSANT — survol, focus
 * et clic mènent au même état —, ce qui donne les trois sans une seule règle de survol en CSS. Le `title` reste en
 * plus, pour la bulle native du système.
 *
 * ⚠️ TOUT CE QUI SE DÉCIDE EST DANS LE MODULE PUR : les familles, leur ordre, leur ton, leurs mots et le texte du
 * détail (`famillesDestinataires`, `detailFamilles`). Ce fichier place et peint.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */
export function DestinatairesDePiece({ familles }: {
  /** Les familles destinataires, déjà calculées par le module pur. Vide ⇒ rien n'est rendu. */
  familles: readonly FamilleVue[];
}) {
  const [ouvert, setOuvert] = useState(false);
  /* ⚠️ UN IDENTIFIANT STABLE ET UNIQUE : la même pièce peut être montée deux fois (résumé du haut et du bas), et
     deux panneaux de même `id` auraient fait pointer `aria-controls` sur le mauvais. */
  const id = useId();
  if (familles.length === 0) return null;
  const detail = detailFamilles(familles);
  return (
    <div className="ddp">
      <div className="ddp-rangee">
        {/* ⚠️ LES CAPSULES SE REPLIENT (`flex-wrap`) PLUTÔT QUE DE SE COUPER : Arno demande qu'elles passent à la
            ligne « sans rien couper ». Une carte de pièce fait 160 px ; trois capsules n'y tiennent jamais. */}
        {familles.map((f) => (
          <span key={f.famille} className={`ddp-capsule ddp-capsule--${f.ton}`}>{f.mot}</span>
        ))}
        {/* 🔴 LE « i » N'EST LÀ QUE S'IL Y A UNE CAPSULE (Arno) — garanti par le retour anticipé ci-dessus. */}
        <button
          type="button"
          className="ddp-i"
          aria-expanded={ouvert}
          aria-controls={id}
          /* ⚠️ LE LIBELLÉ ACCESSIBLE DIT CE QU'ON OUVRE, et pas « i » : « i » n'est pas une information. */
          aria-label="Les adresses qui ont reçu cette pièce"
          title={detail}
          onMouseEnter={() => setOuvert(true)}
          onMouseLeave={() => setOuvert(false)}
          onFocus={() => setOuvert(true)}
          onBlur={() => setOuvert(false)}
          onClick={() => setOuvert((v) => !v)}>
          <span aria-hidden="true">i</span>
        </button>
      </div>
      {/* 🔴 LE PANNEAU EST DANS LE DOCUMENT quand il est ouvert, et jamais un `title` recopié : le `title` est pour
          la bulle du système, ceci est pour tous les autres. Même texte, une seule source. */}
      {ouvert && (
        <ul className="ddp-detail" id={id}>
          {familles.map((f) => (
            <li key={f.famille}>
              {/* 🔴 LE TITRE DE FAMILLE DANS SA COULEUR (Arno), et les adresses EN ENTIER à côté. */}
              <span className={`ddp-titre ddp-titre--${f.ton}`}>{f.titre} :</span>{' '}
              {f.adresses.map(mentionDansFamille).join(', ')}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * ══ 🔴 LES CINQ TONS SONT CEUX DU MODULE, ET AUCUNE COULEUR N'EST ÉCRITE EN DUR ══════════════════════════════════
 *
 * Rouge propriétaire et vert locataire sont les jetons TAMISÉS des capsules de rôle de l'Annuaire (Arno : « mêmes
 * jetons »). Bleu indépendant est la paire déjà posée au lot 97 — elle existait, avec sa variante Sombre et un
 * contraste mesuré (7,1:1 en Clair, 5,8:1 en Sombre) : il n'y avait rien à créer. Gris interne prend la surface
 * du module. Extérieur n'a PAS de fond, comme Arno le demande : un bord fin et le gris du texte.
 *
 * ⚠️ UN `#rrggbb` ÉCRIT ICI aurait donné la même teinte dans les deux thèmes — ce que le garde du dépôt interdit,
 * et il a raison : le bleu clair du mode Clair est illisible sur le fond du mode Sombre.
 * ⚠️ AUCUN ACCENT GRAVE DANS CES COMMENTAIRES : ils vivent DANS un litteral gabarit.
 */
export const CSS_DESTINATAIRES_PIECE = `
.ddp{margin:.15rem 0 0;min-width:0}
/* Les capsules et le « i » sur une rangee qui se replie : une carte de piece est etroite. */
.ddp-rangee{display:flex;flex-wrap:wrap;align-items:center;gap:3px;min-width:0}
/* ⚠️ LA CAPSULE NE SE COUPE PAS (Arno : « sans rien couper ») : elle passe a la ligne entiere, et son mot peut
   lui-meme revenir a la ligne plutot que de deborder de la carte. */
.ddp-capsule{display:inline-block;max-width:100%;padding:1px 7px;border-radius:999px;
  font-size:.66rem;font-weight:700;letter-spacing:.01em;line-height:1.3;white-space:normal;overflow-wrap:anywhere}
/* ── LES CINQ TONS ── fond pale + texte fonce, sur le modele des capsules de role de l'Annuaire. */
.ddp-capsule--rouge{background:var(--color-svv-red-soft);color:var(--color-svv-red-dark)}
.ddp-capsule--vert{background:var(--color-svv-green-soft);color:var(--color-svv-green-ink)}
.ddp-capsule--bleu{background:var(--color-svv-blue-soft);color:var(--color-svv-blue)}
.ddp-capsule--gris{background:var(--color-svv-field);color:var(--color-svv-ink)}
/* 🔴 EXTERIEUR : SANS FOND, bord fin, texte gris (Arno). C'est ce qui le distingue des quatre autres au premier
   coup d'oeil — il ne dit pas vers qui, il dit qu'on ne sait pas. */
.ddp-capsule--neutre{background:none;color:var(--color-svv-muted);
  border:1px solid var(--color-svv-line-strong);padding:0 6px}
/* 🔴 LE « i » CERCLE — 44 px de cible tactile, mais un TRACE de 16 px : la cible deborde le dessin, elle ne le
   grossit pas. Sans cela la rangee aurait fait 44 px de haut sous chaque piece. */
.ddp-i{flex:0 0 auto;display:inline-flex;align-items:center;justify-content:center;
  width:16px;height:16px;padding:0;margin:0;border:1px solid currentColor;border-radius:50%;
  background:none;font:inherit;font-size:.62rem;font-weight:700;line-height:1;
  color:var(--color-svv-muted);cursor:pointer;position:relative}
.ddp-i::after{content:"";position:absolute;inset:-14px;}
.ddp-i:focus-visible{outline:2px solid var(--color-svv-red);outline-offset:2px}
.ddp-i[aria-expanded="true"]{color:var(--color-svv-ink);border-width:2px}
/* La bulle : une liste sous la rangee, en retrait, qui ne tronque PAS — on vient y lire une adresse en entier. */
.ddp-detail{list-style:none;margin:.15rem 0 .15rem;padding:0 0 0 .8rem;
  display:flex;flex-direction:column;gap:1px;font-size:.7rem;color:var(--color-svv-ink);
  border-left:2px solid var(--color-svv-line);overflow-wrap:anywhere}
/* 🔴 LE TITRE DE FAMILLE PORTE SA COULEUR (Arno). Le TEXTE, et non un fond : c'est un titre, pas une capsule. */
.ddp-titre{font-weight:700}
.ddp-titre--rouge{color:var(--color-svv-red-dark)}
.ddp-titre--vert{color:var(--color-svv-green-ink)}
.ddp-titre--bleu{color:var(--color-svv-blue)}
.ddp-titre--gris{color:var(--color-svv-ink)}
.ddp-titre--neutre{color:var(--color-svv-muted)}
`;
