'use client';

import { useEffect, useState } from 'react';
import { API } from './commun';

/**
 * ══ 🔴🔴 « RATTACHER À LA COPROPRIÉTÉ <NOM> — <ADRESSES> ? » (Arno, 17/11/2026, « Adresses multiples d'une copropriété », lot 5) ═══════════════════════
 * « 3. À la création ou modification d'un bien dont l'adresse n'appartient à aucune copropriété mais tombe sur la parcelle d'une copropriété existante, le
 * système PROPOSE « Rattacher à la copropriété <nom> — <adresses> ? » ; rattacher ajoute cette adresse (avec son propre bloc digicode mère + filles, vide au
 * départ) après confirmation, jamais automatiquement (une parcelle peut porter deux copropriétés). » ; « partout où l'adresse d'un bien est saisie (« Nouveau
 * bien », « Modifier le bien », fiche du bien Gestion). La réponse « Non, c'est une autre copropriété » est mémorisée pour cette adresse et la question ne
 * revient plus. » — sous le champ d'adresse du bien ; rien ne s'écrit sans un clic.
 */
interface Proposition { coproprieteId: number; cle: string; nom: string; adresses: string[] }

export function PropositionRattachement({ adresse, onRattache }: { adresse: { libelle: string; codePostal: string; commune: string }; onRattache?: () => void }) {
  const [propositions, setPropositions] = useState<Proposition[]>([]);
  const [envoi, setEnvoi] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [n, setN] = useState(0);
  const prete = adresse.libelle.trim().length >= 5 && (adresse.codePostal.trim() !== '' || adresse.commune.trim() !== '');
  useEffect(() => {
    if (!prete) { setPropositions([]); return undefined; }
    let vivant = true;
    const t = setTimeout(() => {
      const q = `rattachementAdresse=${encodeURIComponent(adresse.libelle.trim())}&cp=${encodeURIComponent(adresse.codePostal.trim())}&commune=${encodeURIComponent(adresse.commune.trim())}`;
      void fetch(`${API}?${q}`, { cache: 'no-store' }).then((r) => r.json() as Promise<{ etat?: string; data?: Proposition[] }>)
        .then((d) => { if (vivant) setPropositions(d.etat === 'ok' && Array.isArray(d.data) ? d.data : []); }).catch(() => { if (vivant) setPropositions([]); });
    }, 500);
    return () => { vivant = false; clearTimeout(t); };
  }, [adresse.libelle, adresse.codePostal, adresse.commune, prete, n]);
  const envoyer = async (action: 'copro-rattacher-adresse' | 'copro-refuser-rattachement', p: Proposition): Promise<void> => {
    setEnvoi(true); setErreur(null); setMessage(null);
    try {
      const r = await fetch(API, { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, coproprieteId: p.coproprieteId, adresse: adresse.libelle.trim(), codePostal: adresse.codePostal.trim(), commune: adresse.commune.trim() }) });
      const d = (await r.json()) as { etat?: string; motif?: string; data?: { message?: string; memorise?: boolean } };
      if (d.etat !== 'ok') { setErreur(d.motif ?? 'Enregistrement refusé.'); return; }
      if (action === 'copro-rattacher-adresse') { setMessage(d.data?.message ?? 'Adresse rattachée.'); onRattache?.(); }
      else setMessage(d.data?.memorise === false ? 'Noté pour cette saisie (la base ne peut pas encore le mémoriser : migration 491).' : 'Noté : la question ne reviendra plus pour cette adresse.');
      setPropositions((x) => x.filter((y) => y.coproprieteId !== p.coproprieteId));
      setN((x) => x + 1);
    } catch { setErreur('Le serveur n’a pas répondu : rien n’est enregistré.'); } finally { setEnvoi(false); }
  };
  if (propositions.length === 0 && message === null && erreur === null) return null;
  return (
    <div className="loc-pleine prc" data-proposition-rattachement>
      <style>{CSS_PROPOSITION_RATTACHEMENT}</style>
      {propositions.map((p) => (
        <div key={p.coproprieteId} className="prc-boite" role="group" aria-label={`Rattacher à la copropriété ${p.nom}`} data-prc-copropriete={p.coproprieteId}>
          <p className="prc-question">Rattacher à la copropriété <strong>{p.nom}</strong> — {p.adresses.join(', ')} ?</p>
          <p className="prc-aide">Cette adresse est sur la même parcelle. Rattachée, elle reçoit son propre bloc de digicodes (vide).</p>
          <div className="prc-boutons">
            <button type="button" className="svv-btn svv-btn-outline gst-btn" disabled={envoi} onClick={() => { void envoyer('copro-refuser-rattachement', p); }} data-prc-non>Non, c’est une autre copropriété</button>
            <button type="button" className="svv-btn svv-btn-primary gst-btn" disabled={envoi} onClick={() => { void envoyer('copro-rattacher-adresse', p); }} data-prc-oui>Rattacher cette adresse</button>
          </div>
        </div>))}
      {message !== null && <p className="gst-info prc-message" role="status" data-prc-message>{message}</p>}
      {erreur !== null && <p className="cp-refus" role="alert" data-prc-erreur>{erreur}</p>}
    </div>
  );
}

/* Jetons du thème seulement. AUCUN ACCENT GRAVE DANS CE LITTERAL. */
export const CSS_PROPOSITION_RATTACHEMENT = `
.prc{display:flex;flex-direction:column;gap:10px;min-width:0}
.prc-boite{display:flex;flex-direction:column;gap:8px;padding:12px 14px;border-radius:14px;border:1px solid var(--color-svv-orange);background:var(--color-svv-orange-soft);color:var(--color-svv-ink);min-width:0}
.prc-question{margin:0;font-weight:600;overflow-wrap:anywhere}
.prc-aide{margin:0;font-size:.85rem;color:var(--color-svv-muted)}
.prc-boutons{display:flex;flex-wrap:wrap;gap:8px;justify-content:flex-end}
.prc .svv-btn-primary{color:var(--color-svv-surface)}
.prc-message{margin:0}
@media (max-width:480px){.prc-boutons > *{flex:1 1 100%}}
`;
