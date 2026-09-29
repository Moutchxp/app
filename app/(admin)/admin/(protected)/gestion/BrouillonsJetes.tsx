'use client';

import { useEffect, useState } from 'react';
import { nettoyerObjet } from '../../../../lib/gestion/objet';

/**
 * LOT LECTURE-HTML-FIL-TROMBONE — LES BROUILLONS MIS À LA CORBEILLE, DANS LA LISTE « CORBEILLE ».
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * 🔴🔴 POURQUOI UN BLOC À PART, ET NON DES LIGNES MÊLÉES AUX MAILS.
 *
 * Un brouillon n'est pas un mail : il n'a ni date de réception, ni expéditeur, ni identifiant chez Gmail. Or la
 * liste des mails se pagine PAR CURSEUR sur la date de réception (lot 5a) — y insérer des lignes d'une autre
 * horloge ferait sauter des échanges d'une page à l'autre. C'est exactement la raison pour laquelle les envois en
 * échec ont déjà leur propre bandeau (`BandeauEnvois`), et la même solution s'impose ici.
 *
 * 🔴 ET SURTOUT : CETTE CORBEILLE-LÀ EST LA NÔTRE, PAS CELLE DE GMAIL. La liste des mails montre l'état de Gmail ;
 * ce bloc montre un état local. Les mêler sans le dire laisserait croire qu'un brouillon jeté est parti dans la
 * corbeille de Gmail — il n'y est pas, il n'y a jamais été, et « Gmail les efface au bout de 30 jours » ne
 * s'applique pas à lui. D'où la capsule « Brouillon », écrite en toutes lettres sur chaque ligne.
 *
 * ⚠️ IL NE S'AFFICHE QUE S'IL A QUELQUE CHOSE À DIRE. Aucun brouillon jeté ⇒ rien du tout, pas même un titre.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */

interface BrouillonJete {
  id: number;
  objet: string;
  destinataires: string[];
  majLe: string;
}

export function BrouillonsJetes({ version, onGeste, onChange }: {
  /** Incrémenté par l'écran après un geste : le bloc se relit. `0` = premier chargement. */
  version: number;
  onGeste: (message: string) => void;
  /** Prévient l'écran qu'un brouillon est sorti de la corbeille — le compteur et la liste doivent suivre. */
  onChange: () => void;
}) {
  const [liste, setListe] = useState<BrouillonJete[]>([]);
  const [occupe, setOccupe] = useState<number | null>(null);

  useEffect(() => {
    let vivant = true;
    void (async () => {
      try {
        const res = await fetch('/api/admin/gestion/brouillons?corbeille=1', { cache: 'no-store' });
        const d = (await res.json()) as { liste?: BrouillonJete[] };
        if (vivant) setListe(d.liste ?? []);
      } catch {
        // Silence volontaire : ce bloc est un COMPLÉMENT de la corbeille. Une erreur rouge au-dessus de la liste
        //   des mails ferait croire que la liste elle-même a un problème.
        if (vivant) setListe([]);
      }
    })();
    return () => { vivant = false; };
  }, [version]);

  if (liste.length === 0) return null;

  const reintegrer = async (b: BrouillonJete): Promise<void> => {
    setOccupe(b.id);
    try {
      const res = await fetch(`/api/admin/gestion/brouillons?id=${b.id}`, { method: 'PATCH' });
      const d = (await res.json().catch(() => ({}))) as { ok?: boolean; message?: string; erreur?: string };
      onGeste(d.ok === true
        ? (d.message ?? 'Brouillon réintégré.')
        : (d.erreur ?? 'Réintégration impossible.'));
      if (d.ok === true) { setListe((l) => l.filter((x) => x.id !== b.id)); onChange(); }
    } catch {
      onGeste('Réintégration impossible : le serveur n’a pas répondu.');
    } finally {
      setOccupe(null);
    }
  };

  return (
    <section className="bjt" aria-label="Brouillons à la corbeille">
      <style>{CSS_BROUILLONS_JETES}</style>
      <p className="bjt-titre">
        {liste.length} brouillon{liste.length > 1 ? 's' : ''} à la corbeille
        {' — '}
        <span className="bjt-note">
          celle de l’application, pas celle de Gmail : rien n’est effacé au bout de 30 jours.
        </span>
      </p>
      <ul className="bjt-liste">
        {liste.map((b) => (
          <li key={b.id} className="bjt-ligne">
            {/* ⚠️ LE MOT, PAS SEULEMENT UNE COULEUR : « Brouillon » se lit en niveaux de gris et au lecteur d'écran. */}
            <span className="bjt-capsule">Brouillon</span>
            <span className="bjt-objet">{nettoyerObjet(b.objet) || '(sans objet)'}</span>
            <span className="bjt-dest">
              {b.destinataires.length === 0 ? 'sans destinataire' : `à ${b.destinataires.join(', ')}`}
            </span>
            <button type="button" className="svv-btn svv-btn-outline gst-btn bjt-bouton"
              disabled={occupe === b.id} onClick={() => void reintegrer(b)}>
              Réintégrer
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

/* Aucun accent grave dans ce littéral : un seul le terminerait (piège consigne huit fois dans ce depot). */
export const CSS_BROUILLONS_JETES = `
.bjt{margin:0 0 .8rem;padding:10px 12px;border-radius:10px;border:1px solid var(--color-svv-line);
  background:var(--color-svv-field)}
.bjt-titre{margin:0 0 6px;font-size:.82rem;font-weight:700;color:var(--color-svv-ink)}
.bjt-note{font-weight:400;color:var(--color-svv-muted)}
.bjt-liste{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:6px}
.bjt-ligne{display:flex;flex-wrap:wrap;align-items:center;gap:8px;min-width:0}
.bjt-capsule{flex:0 0 auto;display:inline-flex;align-items:center;min-height:22px;padding:.05rem .45rem;
  border-radius:999px;font-size:.7rem;font-weight:700;color:#fff;background:var(--color-svv-red)}
.bjt-objet{flex:1 1 12rem;min-width:0;font-size:.85rem;font-weight:600;color:var(--color-svv-ink);
  overflow-wrap:anywhere}
.bjt-dest{flex:0 1 auto;font-size:.8rem;color:var(--color-svv-muted);overflow-wrap:anywhere}
.bjt-bouton{flex:0 0 auto}
@media (max-width:640px){.bjt-bouton{flex-basis:100%}}
`;
