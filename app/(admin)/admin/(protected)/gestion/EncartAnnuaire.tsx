'use client';

import { useEffect, useState } from 'react';
import type { IndiceAnnuaire } from '../../../../lib/gestion/annuaireRepo';

/**
 * LOT ANNUAIRE-1 — LE PONT ENTRE LA BOÎTE MAIL ET L'ANNUAIRE.
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * 🔴 CE QU'IL RÉPOND, EN UNE LIGNE : « celui qui vous écrit est le propriétaire de 12 rue X, Puteaux ». C'est la
 * question qu'on se pose en ouvrant un mail d'un nom qu'on ne reconnaît pas, et qui coûtait jusqu'ici d'ouvrir
 * WIPPIMMO à côté.
 *
 * 🔴 LE RAPPROCHEMENT SE FAIT PAR L'ADRESSE E-MAIL, JAMAIS PAR LE NOM. Rapprocher par nom afficherait « Propriétaire
 * de 12 rue X » sur le courrier d'un homonyme — une erreur invisible, qui ferait répondre à la mauvaise personne.
 * L'adresse, elle, ne ment pas.
 *
 * 🔒 STRICTEMENT EN LECTURE, ET SANS AUCUN EFFET SUR LE CLASSEMENT. Cet encart n'affecte rien, ne classe rien, ne
 * touche ni à l'échange, ni à sa carte, ni à son état. Il affiche, et il emmène.
 *
 * ⚠️ IL NE S'AFFICHE QUE S'IL A QUELQUE CHOSE À DIRE. Annuaire pas installé, expéditeur inconnu, réponse en échec :
 * rien du tout. Un encart « expéditeur non trouvé » sur chaque mail d'un inconnu serait du bruit permanent — et le
 * bruit finit par cacher le signal.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */
export function EncartAnnuaire({ adresses, onFiche }: {
  /** Les adresses des expéditeurs de l'échange ouvert. Dédoublonnées et bornées côté route. */
  adresses: readonly string[];
  /** Ouvre la fiche correspondante dans l'écran « Annuaire ». Absent = l'encart n'est pas cliquable. */
  onFiche?: (sorte: 'proprietaire' | 'locataire', id: number) => void;
}) {
  const [indices, setIndices] = useState<IndiceAnnuaire[]>([]);
  // Une clé stable : sans elle, un tableau recréé à chaque rendu relancerait la requête en boucle.
  const cle = [...new Set(adresses.map((a) => a.trim().toLowerCase()).filter((a) => a !== ''))].sort().join(',');

  useEffect(() => {
    if (cle === '') { setIndices([]); return; }
    let vivant = true;
    void (async () => {
      try {
        const res = await fetch(`/api/admin/gestion/annuaire?emails=${encodeURIComponent(cle)}`, { cache: 'no-store' });
        const d = (await res.json()) as { etat?: string; data?: IndiceAnnuaire[] };
        if (vivant) setIndices(d.etat === 'ok' ? (d.data ?? []) : []);
      } catch {
        // Silence volontaire : l'annuaire est un CONFORT ici. Une erreur rouge au-dessus d'un mail ferait croire
        //   que le mail lui-même a un problème.
        if (vivant) setIndices([]);
      }
    })();
    return () => { vivant = false; };
  }, [cle]);

  if (indices.length === 0) return null;

  return (
    <div className="eca" role="note">
      <style>{CSS_ENCART_ANNUAIRE}</style>
      {indices.map((i) => (
        <p key={`${i.role}-${i.id}`} className="eca-ligne">
          <span className="eca-role">{i.role === 'proprietaire' ? 'Propriétaire' : 'Locataire'}</span>
          {onFiche
            ? <button type="button" className="eca-lien" onClick={() => onFiche(i.role, i.id)}>{i.nom}</button>
            : <span className="eca-nom">{i.nom}</span>}
          {/* UN SEUL logement est nommé ; au-delà, on dit COMBIEN plutôt que d'en choisir un au hasard. */}
          {i.logement && <span className="eca-lieu">{i.nbLogements > 1 ? `de ${i.logement} et ${i.nbLogements - 1} autre${i.nbLogements > 2 ? 's' : ''}` : `de ${i.logement}`}</span>}
        </p>
      ))}
    </div>
  );
}

export const CSS_ENCART_ANNUAIRE = `
/* Un encart discret, jamais une alerte : ce n'est pas un problème, c'est un renseignement. Le RÔLE est écrit en
   toutes lettres — l'information ne tient à aucune couleur. */
.eca{display:flex;flex-direction:column;gap:2px;margin:0 0 .6rem;padding:8px 12px;border-radius:10px;
  border:1px solid var(--color-svv-line);background:var(--color-svv-field);overflow-wrap:anywhere}
.eca-ligne{display:flex;flex-wrap:wrap;align-items:baseline;gap:.4rem;margin:0;font-size:.82rem;
  color:var(--color-svv-ink);line-height:1.45}
.eca-role{font-size:.7rem;font-weight:700;text-transform:uppercase;letter-spacing:.02em;color:var(--color-svv-muted)}
.eca-nom{font-weight:700}
.eca-lien{background:none;border:0;padding:0;margin:0;font:inherit;font-size:.82rem;font-weight:700;
  color:var(--color-svv-ink);text-decoration:underline;text-underline-offset:3px;cursor:pointer;min-height:44px}
.eca-lien:focus-visible{outline:2px solid var(--color-svv-red);outline-offset:2px}
.eca-lieu{color:var(--color-svv-muted)}
`;
