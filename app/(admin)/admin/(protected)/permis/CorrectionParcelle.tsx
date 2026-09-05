'use client';

import { useCallback, useState } from 'react';
import { descriptionActeurParcelle } from '../../../../lib/permis/acteurParcelle';

/**
 * LOT 101 — GESTE MANUEL « rattacher une parcelle à la main » quand la référence Sitadel est fausse/introuvable (impasse « parcelle non
 * rattachée » : ex. 468, DK 649 inexistante ↔ DI 649). PRINCIPE : l'app PROPOSE des candidates AVEC LEUR SURFACE (le pouvoir de
 * vérification d'Arno), ARNO CHOISIT (ou saisit la référence exacte), rien n'est appliqué en silence. La correction est PERSISTÉE +
 * TRACÉE et RÉVERSIBLE. Zone hors canvas → tokens `--color-svv-*`.
 *
 * PL-A — PROVENANCE HONNÊTE (né de l'incident verif-lot101) : on n'écrit « rattachée à la main » QUE si l'auteur est un compte admin
 * identifiable (`acteurNom` résolu, ou 'admin'). Sinon on nomme l'auteur BRUT (« référence corrigée par verif-lot101 ») — jamais
 * « à la main » pour un harnais/CLI. La date (maj_le) est toujours affichée. Règle partagée avec la planche (cf. acteurParcelle).
 */
interface Candidat { idu: string; section: string; numero: string; contenance: number | null; motif: string }

export function CorrectionParcelle({ dossierId, parcelleId, refActuelle, aGeometrie, refRemplacee, origine, majPar, majLe, acteurNom, onFait }: {
  dossierId: number; parcelleId: number; refActuelle: string; aGeometrie: boolean; refRemplacee: string | null;
  origine?: 'saisie' | 'extraite' | null; majPar?: string | null; majLe?: string | null; acteurNom?: string | null; onFait: () => void;
}) {
  const [ouvert, setOuvert] = useState(false);
  const [candidats, setCandidats] = useState<Candidat[] | null>(null); // null = pas encore cherché
  const [superficie, setSuperficie] = useState<number | null>(null);
  const [enCours, setEnCours] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [saisieSection, setSaisieSection] = useState('');
  const [saisieNumero, setSaisieNumero] = useState('');

  const chercher = useCallback(async () => {
    setOuvert(true); setEnCours(true); setMsg(null);
    try {
      const res = await fetch('/api/admin/permis/caracteristiques', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'candidats_parcelle', dossierId, parcelleId }) });
      if (res.status === 401) { setMsg('Session expirée — reconnectez-vous.'); return; }
      const b = (await res.json().catch(() => ({}))) as { ok?: boolean; candidats?: Candidat[]; superficieDeclareeM2?: number | null };
      if (!res.ok || !b.ok) { setMsg('Recherche de candidates impossible, réessayez.'); return; }
      setCandidats(b.candidats ?? []); setSuperficie(b.superficieDeclareeM2 ?? null);
    } catch { setMsg('Recherche de candidates impossible, réessayez.'); }
    finally { setEnCours(false); }
  }, [dossierId, parcelleId]);

  const corriger = useCallback(async (section: string, numero: string) => {
    setEnCours(true); setMsg(null);
    try {
      const res = await fetch('/api/admin/permis/caracteristiques', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'corriger_parcelle', dossierId, parcelleId, section, numero }) });
      if (res.status === 401) { setMsg('Session expirée — reconnectez-vous.'); return; }
      const b = (await res.json().catch(() => ({}))) as { ok?: boolean; erreur?: string };
      if (!res.ok || !b.ok) { setMsg(b.erreur ?? 'Correction impossible, réessayez.'); return; } // ex. « cette référence n'existe pas au cadastre »
      setOuvert(false); setCandidats(null); onFait();
    } catch { setMsg('Correction impossible, réessayez.'); }
    finally { setEnCours(false); }
  }, [dossierId, parcelleId, onFait]);

  const annuler = useCallback(async () => {
    setEnCours(true); setMsg(null);
    try {
      const res = await fetch('/api/admin/permis/caracteristiques', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'annuler_correction_parcelle', dossierId, parcelleId }) });
      if (res.status === 401) { setMsg('Session expirée — reconnectez-vous.'); return; }
      const b = (await res.json().catch(() => ({}))) as { ok?: boolean };
      if (!res.ok || !b.ok) { setMsg('Annulation impossible, réessayez.'); return; }
      onFait();
    } catch { setMsg('Annulation impossible, réessayez.'); }
    finally { setEnCours(false); }
  }, [dossierId, parcelleId, onFait]);

  const lien: React.CSSProperties = { width: 'auto', padding: '.05rem .35rem', fontSize: 11 };
  const champ: React.CSSProperties = { border: '1px solid var(--color-svv-line)', borderRadius: '.3rem', padding: '.15rem .3rem', fontSize: 11, background: 'var(--color-svv-surface)', color: 'var(--color-svv-ink)' };

  // DÉJÀ CORRIGÉE / SAISIE → NOMMER L'ACTEUR honnêtement (jamais « à la main » pour un harnais/CLI) + permettre l'annulation.
  if (refRemplacee || origine === 'saisie') {
    const d = descriptionActeurParcelle({ majPar: majPar ?? null, majLe: majLe ?? null, acteurNom: acteurNom ?? null });
    return (
      <span style={{ fontSize: 11 }}>
        {' '}
        {d.aLaMain
          ? <><span style={{ color: 'var(--color-svv-blue)', fontWeight: 600 }}>rattachée à la main</span> par <strong style={{ color: 'var(--color-svv-ink)' }}>{d.qui}</strong></>
          : <span style={{ color: 'var(--color-svv-muted)' }}>référence corrigée par <strong style={{ color: 'var(--color-svv-ink)' }}>{d.qui}</strong> <span style={{ fontStyle: 'italic' }}>(pas un geste manuel identifié)</span></span>}
        {d.quand ? <span style={{ color: 'var(--color-svv-muted)' }}> le {d.quand}</span> : null}
        {refRemplacee ? <span style={{ color: 'var(--color-svv-muted)' }}> en remplacement de {refRemplacee}</span> : null}
        {refRemplacee ? <>{' '}<button type="button" className="svv-link" style={lien} disabled={enCours} onClick={() => void annuler()}>annuler la correction</button></> : null}
        {msg && <span role="alert" style={{ color: 'var(--color-svv-red)' }}> {msg}</span>}
      </span>
    );
  }
  // RATTACHÉE AUTOMATIQUEMENT (géométrie présente, non corrigée) → aucun geste.
  if (aGeometrie) return null;

  // NON RATTACHÉE → proposer la correction.
  return (
    <span style={{ fontSize: 11 }}>
      {!ouvert && <button type="button" className="svv-link" style={lien} onClick={() => void chercher()}>rattacher à la main…</button>}
      {ouvert && (
        <span style={{ display: 'inline-flex', flexDirection: 'column', gap: '.2rem', marginTop: '.2rem', padding: '.35rem .5rem', border: '1px solid var(--color-svv-line)', borderRadius: '.4rem', background: 'var(--color-svv-field)' }}>
          <span style={{ color: 'var(--color-svv-muted)' }}>Corriger le rattachement de <strong style={{ color: 'var(--color-svv-ink)' }}>{refActuelle}</strong>{superficie != null ? ` (surface créée déclarée ${superficie} m²)` : ''} :</span>
          {enCours && candidats === null && <span style={{ color: 'var(--color-svv-muted)' }}>recherche des candidates…</span>}
          {candidats !== null && candidats.length === 0 && <span style={{ color: 'var(--color-svv-muted)' }}>Aucune candidate plausible trouvée — saisissez la référence exacte ci-dessous.</span>}
          {candidats !== null && candidats.length > 0 && (
            <ul style={{ margin: 0, paddingLeft: '1.1rem', display: 'flex', flexDirection: 'column', gap: '.1rem' }}>
              {candidats.map((c) => (
                <li key={c.idu} style={{ wordBreak: 'break-word' }}>
                  <strong style={{ color: 'var(--color-svv-ink)' }}>{c.section} {c.numero}</strong>
                  <span style={{ color: 'var(--color-svv-muted)' }}> · cadastre {c.contenance ?? '—'} m²</span>
                  {' '}<button type="button" className="svv-link" style={lien} disabled={enCours} onClick={() => void corriger(c.section, c.numero)}>rattacher à celle-ci</button>
                </li>
              ))}
            </ul>
          )}
          {/* SAISIE LIBRE en repli — validée contre le cadastre (refusée si inexistante). */}
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '.25rem', flexWrap: 'wrap' }}>
            <span style={{ color: 'var(--color-svv-muted)' }}>ou saisir :</span>
            <input aria-label="section cadastrale" placeholder="section" value={saisieSection} onChange={(e) => setSaisieSection(e.target.value)} style={{ ...champ, width: 56 }} />
            <input aria-label="numéro cadastral" placeholder="n°" value={saisieNumero} onChange={(e) => setSaisieNumero(e.target.value)} style={{ ...champ, width: 56 }} />
            <button type="button" className="svv-link" style={lien} disabled={enCours || saisieSection.trim() === '' || saisieNumero.trim() === ''} onClick={() => void corriger(saisieSection, saisieNumero)}>valider</button>
            <button type="button" className="svv-link" style={lien} disabled={enCours} onClick={() => { setOuvert(false); setCandidats(null); setMsg(null); }}>fermer</button>
          </span>
          {msg && <span role="alert" style={{ color: 'var(--color-svv-red)' }}>{msg}</span>}
        </span>
      )}
    </span>
  );
}
