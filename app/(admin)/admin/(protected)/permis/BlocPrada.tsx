'use client';

import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { EncartArbitrages, CarteAmbiguite, type ArbitrageAffiche, type AmbiguiteAffiche } from './DemandesRendu';

/**
 * Bloc PRADA de l'onglet Demandes (chantier S14e) : encart d'arbitrages (info seule) + résolution des rapprochements
 * AMBIGUS (rattachement manuel ou écartement). Mobile-first (cartes, pas de tableau qui déborde). Réutilise le référentiel
 * de communes de la tuile Permis (/api/admin/permis/communes) pour la recherche. AUCUN envoi.
 */
interface CommuneRef { code: string; nom: string; dep: string }
type EtatLigne = { recherche: string; codeSel: string | null };

const styleInput: CSSProperties = { width: '100%', boxSizing: 'border-box', padding: '.35rem .5rem', border: '1px solid var(--color-svv-line)', borderRadius: '.4rem', fontSize: 13 };
const normaliser = (s: string): string => s.toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '');

export function BlocPrada() {
  const [arbitrages, setArbitrages] = useState<ArbitrageAffiche[]>([]);
  const [ambiguites, setAmbiguites] = useState<AmbiguiteAffiche[]>([]);
  const [communes, setCommunes] = useState<CommuneRef[]>([]);
  const [lignes, setLignes] = useState<Record<number, EtatLigne>>({});
  const [msg, setMsg] = useState('');
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let annule = false;
    void (async () => {
      try {
        const res = await fetch('/api/admin/permis/prada', { cache: 'no-store' });
        if (!annule && res.ok) { const d = (await res.json()) as { arbitrages: ArbitrageAffiche[]; ambiguites: AmbiguiteAffiche[] }; setArbitrages(d.arbitrages); setAmbiguites(d.ambiguites); }
      } catch { /* bloc PRADA indisponible : le reste de l'écran reste utilisable */ }
    })();
    return () => { annule = true; };
  }, [version]);

  useEffect(() => {
    let annule = false;
    void (async () => {
      try {
        const res = await fetch('/api/admin/permis/communes', { cache: 'no-store' });
        if (!annule && res.ok) { const d = (await res.json()) as { communes: CommuneRef[] }; setCommunes(d.communes); }
      } catch { /* recherche de commune indisponible */ }
    })();
    return () => { annule = true; };
  }, []);

  const majLigne = (id: number, patch: Partial<EtatLigne>): void => setLignes((s) => {
    const courant: EtatLigne = s[id] ?? { recherche: '', codeSel: null };
    return { ...s, [id]: { ...courant, ...patch } };
  });

  const suggestionsPour = (id: number, dep: string | null): CommuneRef[] => {
    const q = (lignes[id]?.recherche ?? '').trim();
    if (q === '') return [];
    const qn = normaliser(q);
    return communes.filter((c) => (!dep || c.dep === dep) && (normaliser(c.nom).includes(qn) || c.code.startsWith(qn))).slice(0, 6);
  };
  const nomCommune = (code: string): string => communes.find((c) => c.code === code)?.nom ?? code;

  async function agir(importId: number, body: Record<string, unknown>, ok: string): Promise<void> {
    setMsg('');
    try {
      const res = await fetch('/api/admin/permis/prada', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ importId, ...body }) });
      if (res.ok) { setMsg(ok); setVersion((v) => v + 1); }
      else { const d = (await res.json().catch(() => ({}))) as { erreur?: string }; setMsg(d.erreur ? `Refusé : ${d.erreur}.` : 'Action refusée.'); }
    } catch { setMsg('Action impossible.'); }
  }

  const arbitragesMemo = useMemo(() => arbitrages, [arbitrages]);
  if (arbitrages.length === 0 && ambiguites.length === 0) return null;

  return (
    <div className="flex flex-col gap-3">
      <EncartArbitrages arbitrages={arbitragesMemo} />

      {ambiguites.length > 0 && (
        <section role="group" aria-label="Rapprochements PRADA ambigus à trancher" className="flex flex-col gap-2">
          <div style={{ fontSize: 13 }}>
            <strong>{ambiguites.length} rapprochement(s) ambigu(s)</strong> — aucune commune du périmètre ne correspond exactement au nom. Rattachez à la main, ou écartez si ce n’est pas une commune du périmètre.
          </div>
          {msg && <span role="status" style={{ fontSize: 13, color: 'var(--color-svv-green-ink)' }}>{msg}</span>}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '.6rem' }}>
            {ambiguites.map((a) => {
              const et = lignes[a.id] ?? { recherche: '', codeSel: null };
              const sugg = suggestionsPour(a.id, a.departement);
              return (
                <CarteAmbiguite key={a.id} a={a}>
                  <div className="flex flex-col gap-1">
                    <label style={{ fontSize: 12, color: 'var(--color-svv-muted)' }}>Rattacher à la commune
                      <input value={et.recherche} onChange={(e) => majLigne(a.id, { recherche: e.target.value, codeSel: null })}
                        placeholder="nom ou code INSEE" style={styleInput} aria-label={`Rechercher la commune pour ${a.nomAdministration ?? a.id}`} />
                    </label>
                    {et.codeSel === null && sugg.length > 0 && (
                      <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexWrap: 'wrap', gap: '.3rem' }}>
                        {sugg.map((c) => (
                          <li key={c.code}>
                            <button type="button" className="svv-btn svv-btn-outline" style={{ padding: '.2rem .5rem', fontSize: 12 }}
                              onClick={() => majLigne(a.id, { codeSel: c.code, recherche: c.nom })}>{c.nom} ({c.code})</button>
                          </li>
                        ))}
                      </ul>
                    )}
                    {et.codeSel !== null && (
                      <span style={{ fontSize: 12 }}>Sélectionnée : <strong>{nomCommune(et.codeSel)} ({et.codeSel})</strong></span>
                    )}
                    <div style={{ display: 'flex', gap: '.4rem', flexWrap: 'wrap', marginTop: '.2rem' }}>
                      <button type="button" className="svv-btn svv-btn-primary" style={{ padding: '.3rem .7rem', opacity: et.codeSel ? 1 : 0.5 }}
                        disabled={et.codeSel === null} onClick={() => et.codeSel && void agir(a.id, { action: 'rattacher', codeInsee: et.codeSel }, `Rattaché à ${nomCommune(et.codeSel)}.`)}>Rattacher</button>
                      <button type="button" className="svv-btn svv-btn-outline" style={{ padding: '.3rem .7rem' }}
                        onClick={() => void agir(a.id, { action: 'ecarter' }, 'Ligne écartée (hors périmètre).')}>Écarter (hors périmètre)</button>
                    </div>
                  </div>
                </CarteAmbiguite>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}
