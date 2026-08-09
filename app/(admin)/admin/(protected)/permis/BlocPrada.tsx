'use client';

import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { EncartArbitrages, BlocInjoignables, CarteAmbiguite, CarteInjoignable, retirerCommune, type ArbitrageAffiche, type AmbiguiteAffiche, type CommuneInjoignableAffiche } from './DemandesRendu';

/**
 * Bloc PRADA de l'onglet Demandes (S14e/S15) : encart d'arbitrages (info seule), résolution des rapprochements AMBIGUS, et
 * SAISIE des communes injoignables par e-mail (S15, réutilise PATCH /contact). Mobile-first (cartes, pas de tableau qui
 * déborde). Réutilise le référentiel de communes de la tuile Permis (/api/admin/permis/communes) pour la recherche.
 * AUCUN envoi.
 */
interface CommuneRef { code: string; nom: string; dep: string }
type EtatLigne = { recherche: string; codeSel: string | null };

const styleInput: CSSProperties = { width: '100%', boxSizing: 'border-box', padding: '.35rem .5rem', border: '1px solid var(--color-svv-line)', borderRadius: '.4rem', fontSize: 13 };
const normaliser = (s: string): string => s.toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '');

export function BlocPrada() {
  const [arbitragesOuvert, setArbitragesOuvert] = useState(false); // C2 : encart PRADA replié par défaut (état non mémorisé entre visites)
  const [injOuvert, setInjOuvert] = useState(false); // C3 : bloc « sans adresse » replié par défaut (état non mémorisé)
  const [arbitrages, setArbitrages] = useState<ArbitrageAffiche[]>([]);
  const [ambiguites, setAmbiguites] = useState<AmbiguiteAffiche[]>([]);
  const [injoignables, setInjoignables] = useState<CommuneInjoignableAffiche[]>([]);
  const [emailInj, setEmailInj] = useState<Record<string, string>>({});   // saisie e-mail par commune injoignable
  const [errInj, setErrInj] = useState<Record<string, string>>({});       // échec affiché DANS la carte injoignable
  const [communes, setCommunes] = useState<CommuneRef[]>([]);
  const [lignes, setLignes] = useState<Record<number, EtatLigne>>({});
  const [okMsg, setOkMsg] = useState('');                       // confirmation de succès (la carte concernée a disparu)
  const [errLigne, setErrLigne] = useState<Record<number, string>>({}); // échec affiché DANS la carte concernée
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let annule = false;
    void (async () => {
      try {
        const res = await fetch('/api/admin/permis/prada', { cache: 'no-store' });
        if (!annule && res.ok) { const d = (await res.json()) as { arbitrages: ArbitrageAffiche[]; ambiguites: AmbiguiteAffiche[]; injoignables: CommuneInjoignableAffiche[] }; setArbitrages(d.arbitrages); setAmbiguites(d.ambiguites); setInjoignables(d.injoignables ?? []); }
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
    setOkMsg('');
    setErrLigne((s) => { const n = { ...s }; delete n[importId]; return n; });
    try {
      const res = await fetch('/api/admin/permis/prada', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ importId, ...body }) });
      if (res.ok) {
        setAmbiguites((prev) => prev.filter((x) => x.id !== importId)); // la carte disparaît + compteur à jour, sans reload
        setOkMsg(ok);
        setVersion((v) => v + 1); // reconcilie (liste autoritative + arbitrages, ex. si le rattachement crée un arbitrage)
      } else {
        const d = (await res.json().catch(() => ({}))) as { erreur?: string };
        setErrLigne((s) => ({ ...s, [importId]: d.erreur ? `Refusé : ${d.erreur}.` : 'Action refusée.' }));
      }
    } catch {
      setErrLigne((s) => ({ ...s, [importId]: 'Action impossible.' }));
    }
  }

  /** S15 — enregistre l'e-mail d'une commune injoignable via la route /contact EXISTANTE (canal=email, statut=confirme). */
  async function enregistrerEmailInjoignable(code: string): Promise<void> {
    const email = (emailInj[code] ?? '').trim();
    setErrInj((s) => { const n = { ...s }; delete n[code]; return n; });
    if (email === '') { setErrInj((s) => ({ ...s, [code]: 'Saisir une adresse e-mail.' })); return; }
    try {
      const res = await fetch('/api/admin/permis/contact', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ codeInsee: code, canal: 'email', email, urlFormulaire: '', adressePostale: '', note: '' }),
      });
      if (res.ok) {
        setInjoignables((prev) => retirerCommune(prev, code)); // retrait optimiste → la liste tombe (16 → 15) sans reload
        setOkMsg(`Adresse enregistrée pour ${code}.`);
      } else {
        const d = (await res.json().catch(() => ({}))) as { erreur?: string };
        setErrInj((s) => ({ ...s, [code]: d.erreur ? `Refusé : ${d.erreur}.` : 'Enregistrement refusé.' }));
      }
    } catch { setErrInj((s) => ({ ...s, [code]: 'Enregistrement impossible.' })); }
  }

  const arbitragesMemo = useMemo(() => arbitrages, [arbitrages]);
  if (arbitrages.length === 0 && ambiguites.length === 0 && injoignables.length === 0) return null;

  return (
    <div className="flex flex-col gap-3">
      <EncartArbitrages arbitrages={arbitragesMemo} ouvert={arbitragesOuvert} onToggle={() => setArbitragesOuvert((o) => !o)} />

      {ambiguites.length > 0 && (
        <section role="group" aria-label="Rapprochements PRADA ambigus à trancher" className="flex flex-col gap-2">
          <div style={{ fontSize: 13 }}>
            <strong>{ambiguites.length} rapprochement(s) ambigu(s)</strong> — aucune commune du périmètre ne correspond exactement au nom. Rattachez à la main, ou écartez si ce n’est pas une commune du périmètre.
          </div>
          {okMsg && <span role="status" style={{ fontSize: 13, color: 'var(--color-svv-green-ink)' }}>{okMsg}</span>}
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
                    {/* Retour affiché DANS la carte, sous le bouton cliqué (le succès, lui, fait disparaître la carte). */}
                    {errLigne[a.id] && <span role="alert" style={{ fontSize: 12, color: 'var(--color-svv-red)', fontWeight: 600 }}>{errLigne[a.id]}</span>}
                  </div>
                </CarteAmbiguite>
              );
            })}
          </div>
        </section>
      )}

      {/* C3 — bloc repliable (fermé par défaut). Le retour de saisie (okMsg) est passé au slot TOUJOURS visible → il survit
          au repli. L'action d'enregistrement, la règle « sans adresse » et les cartes restent inchangées. */}
      <BlocInjoignables injoignables={injoignables} ouvert={injOuvert} onToggle={() => setInjOuvert((o) => !o)}
        retour={okMsg ? <span role="status" style={{ fontSize: 13, color: 'var(--color-svv-green-ink)' }}>{okMsg}</span> : null}>
        <div style={{ fontSize: 13 }}>
          (ni contact, ni PRADA) — saisissez une adresse pour les rendre adressables. Enregistrée en « confirmée ».
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '.6rem', marginTop: '.4rem' }}>
          {injoignables.map((c) => (
            <CarteInjoignable key={c.codeInsee} c={c}>
              <input type="email" value={emailInj[c.codeInsee] ?? ''} placeholder="urbanisme@ville.fr" style={styleInput}
                aria-label={`Adresse e-mail pour ${c.nom}`}
                onChange={(e) => { const v = e.target.value; setEmailInj((s) => ({ ...s, [c.codeInsee]: v })); }} />
              <div style={{ display: 'flex', gap: '.4rem', flexWrap: 'wrap', marginTop: '.2rem' }}>
                <button type="button" className="svv-btn svv-btn-primary" style={{ padding: '.3rem .7rem' }}
                  onClick={() => void enregistrerEmailInjoignable(c.codeInsee)}>Enregistrer l’adresse</button>
              </div>
              {errInj[c.codeInsee] && <span role="alert" style={{ fontSize: 12, color: 'var(--color-svv-red)', fontWeight: 600 }}>{errInj[c.codeInsee]}</span>}
            </CarteInjoignable>
          ))}
        </div>
      </BlocInjoignables>
    </div>
  );
}
