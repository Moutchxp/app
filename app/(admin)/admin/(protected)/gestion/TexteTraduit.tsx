'use client';
/**
 * ══ 🔴🔴 LOT GESTION-TRADUCTION (Arno, 10/11/2026) — LE TEXTE D'UNE ÉTAPE, TRADUIT S'IL Y A LIEU, L'ORIGINAL TOUJOURS À PORTÉE ═══════════
 *
 * ARNO : « La traduction s'affiche sous le titre “Traduit automatiquement de l'[espagnol / anglais / …]”, avec un lien “Voir l'original”
 * qui affiche le texte d'origine. Un commentaire déjà en français ne change pas. » Et : « Si la traduction échoue, le commentaire
 * s'affiche en original avec la mention “Traduction indisponible”. »
 *
 * 🔴 SANS TRADUCTION, LE RENDU EST EXACTEMENT CELUI D'AVANT : la même balise, la même classe, le même texte — rien d'ajouté. C'est ce qui
 * garantit qu'un commentaire français (et toute étape qui n'a pas de traduction) ne change pas d'un pixel.
 *
 * Rendu par les trois endroits qui montrent le texte d'une étape : la bulle du « i », la bulle de détail, le panneau de correction.
 */
import { useState } from 'react';
import {
  affichageTexte, MOT_MASQUER_ORIGINAL, MOT_TRADUCTION_INDISPONIBLE, MOT_VOIR_ORIGINAL, type TraductionEtape,
} from '../../../../lib/gestion/traductionCommentaire';

export function TexteTraduit({ texte, traduction, classe, balise = 'p' }: {
  texte: string;
  traduction?: TraductionEtape | null;
  /** La classe du texte à l'endroit où il est rendu (`fav-bulle-texte`, `fav-commentaire-texte`, `pce-mail-texte`). */
  classe: string;
  balise?: 'p' | 'span';
}) {
  const [voirOriginal, setVoirOriginal] = useState(false);
  const Balise = balise;
  const a = affichageTexte(texte, traduction);
  if (a.mode === 'original') return <Balise className={classe}>{texte}</Balise>;
  if (a.mode === 'indisponible') {
    return (
      <div className="trad" data-traduction="indisponible">
        <style>{CSS_TEXTE_TRADUIT}</style>
        <Balise className={classe}>{a.original}</Balise>
        <span className="trad-indispo" role="note">{MOT_TRADUCTION_INDISPONIBLE}</span>
      </div>
    );
  }
  return (
    <div className="trad" data-traduction="traduite">
      <style>{CSS_TEXTE_TRADUIT}</style>
      <span className="trad-titre">{a.titre}</span>
      <Balise className={classe} lang="fr">{a.traduit}</Balise>
      <button type="button" className="trad-lien" aria-expanded={voirOriginal} onClick={() => setVoirOriginal((v) => !v)}>
        {voirOriginal ? MOT_MASQUER_ORIGINAL : MOT_VOIR_ORIGINAL}
      </button>
      {voirOriginal && (
        <Balise className={`${classe} trad-original`} lang={traduction?.langue ?? undefined} data-original>{a.original}</Balise>
      )}
    </div>
  );
}

/* AUCUN ACCENT GRAVE ICI : cette feuille vit DANS un litteral gabarit. Couleurs : jetons du depot seulement. */
export const CSS_TEXTE_TRADUIT = `
.trad{display:flex;flex-direction:column;gap:2px;min-width:0}
.trad-titre{font-size:.68rem;font-style:italic;color:var(--color-svv-muted)}
.trad-indispo{font-size:.68rem;font-style:italic;color:var(--color-svv-muted)}
.trad-lien{align-self:flex-start;padding:2px 0;min-height:24px;font:inherit;font-size:.7rem;color:var(--color-svv-ink);
  background:none;border:0;text-decoration:underline;cursor:pointer}
.trad-lien:hover,.trad-lien:focus-visible{color:var(--color-svv-red)}
.trad-original{padding-left:6px;border-left:2px solid var(--color-svv-line);color:var(--color-svv-muted)}
`;
