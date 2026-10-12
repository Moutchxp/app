'use client';

import { useEffect, useState } from 'react';
import { CapsuleEvenement, CSS_CAPSULE_EVENEMENT } from './CapsuleEvenement';
import {
  lectureEvenement, resumeBlocEvenement, trierParUrgence, type EvenementLu,
} from '../../../../lib/gestion/evenementRattache';

/**
 * ══ 🔴🔴 LOT UN-SEUL-BOUTON-RATTACHER — « ÉVÉNEMENT RATTACHÉ », EN LECTURE, DANS LA FENÊTRE « RATTACHER » ═══════════════
 *
 * Arno : sur un mail « À classer », un seul point d'entrée — « Rattacher à un logement ». La fenêtre qu'il ouvre dit
 * donc aussi l'événement du mail, EN LECTURE, comme « Modifier le rattachement » : la même ligne repliée (le même
 * calcul pur, `lectureEvenement` + `resumeBlocEvenement`, la même capsule). Les gestes sur l'événement ne sont pas
 * ici : ils sont sous l'en-tête du mail (« Lier à un événement », « Créer un événement »), et la phrase y renvoie.
 *
 * 🔒 LECTURE SEULE : la route `/messages/<id>/affectation` en GET, celle de toutes les fenêtres. Rien n'est écrit.
 */
export function EvenementRattacheResume({ messageId, renvoi }: { messageId: number; renvoi: string }) {
  const [lu, setLu] = useState<{ rattaches: EvenementLu[]; duBien: EvenementLu[]; horsPeriode: EvenementLu | null } | null>(null);
  useEffect(() => {
    let vivant = true;
    void fetch(`/api/admin/gestion/messages/${messageId}/affectation`, { cache: 'no-store' })
      .then((r) => r.json() as Promise<{
        etat?: string; lus?: { rattaches?: EvenementLu[]; duBien?: EvenementLu[] };
        evenement?: { evenementId: number; reference: string; objet: string; categorie: string | null; urgence: string | null } | null;
      }>)
      .then((d) => {
        if (!vivant) return;
        const e = d.etat === 'ok' ? d.evenement ?? null : null;
        setLu({
          rattaches: d.lus?.rattaches ?? [], duBien: d.lus?.duBien ?? [],
          horsPeriode: e === null ? null : {
            id: e.evenementId, reference: e.reference, objet: e.objet, ouvert: false, categorie: e.categorie, urgence: e.urgence,
          },
        });
      })
      .catch(() => { if (vivant) setLu({ rattaches: [], duBien: [], horsPeriode: null }); });
    return () => { vivant = false; };
  }, [messageId]);

  if (lu === null) {
    return <p className="eer"><span className="eer-titre">Événement rattaché</span> <span className="eer-gris">lecture…</span></p>;
  }
  const rattaches = lu.rattaches.length > 0 ? trierParUrgence(lu.rattaches) : (lu.horsPeriode ? [lu.horsPeriode] : []);
  const resume = resumeBlocEvenement(lectureEvenement(lu.rattaches, lu.duBien), rattaches);
  return (
    <div className="eer" role="note">
      <style>{CSS_CAPSULE_EVENEMENT}</style>
      <style>{CSS_EVENEMENT_RATTACHE_RESUME}</style>
      <p className="eer-ligne">
        <span className="eer-titre">Événement rattaché{resume.cas === 'rattache' ? '' : ' :'}</span>
        {resume.cas !== 'rattache' && <span className="eer-gris">{resume.mot}</span>}
        {resume.capsules.map((e) => <CapsuleEvenement key={e.id} e={e} />)}
        {resume.cas === 'rattache' && resume.mot !== null && <span className="eer-gris">{resume.mot}</span>}
      </p>
      <p className="eer-renvoi">{renvoi}</p>
    </div>
  );
}

/** Le renvoi, dans la conversation : les gestes sur l'événement sont sous l'en-tête du mail. */
export const RENVOI_EVENEMENT_CONVERSATION =
  'Pour lier ce mail à un événement ou en créer un : « Lier à un événement » ou « Créer un événement », sous l’en-tête du mail.';

/* AUCUN ACCENT GRAVE DANS CE BLOC : il vit dans un litteral de gabarit. Rien ne deborde : tout se replie. */
export const CSS_EVENEMENT_RATTACHE_RESUME = `
.eer{display:flex;flex-direction:column;gap:4px;margin:0;padding:8px 10px;min-width:0;border:1px solid var(--color-svv-line);
  border-radius:.6rem;background:var(--color-svv-surface);box-sizing:border-box}
.eer-ligne{display:flex;flex-wrap:wrap;align-items:center;gap:.35rem .5rem;margin:0;min-width:0}
.eer-titre{font-size:.72rem;font-weight:700;letter-spacing:.04em;text-transform:uppercase;color:var(--color-svv-muted)}
.eer-gris{font-size:.8rem;font-weight:600;color:var(--color-svv-muted)}
.eer-ligne>.cev{flex:0 1 auto}
.eer-renvoi{margin:0;font-size:.76rem;font-style:italic;color:var(--color-svv-muted);overflow-wrap:anywhere}
`;
