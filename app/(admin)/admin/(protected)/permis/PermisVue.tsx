'use client';

import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { formaterDateJour, libelleCommune, libelleEtat, ETATS_CONNUS, type CleCategorie } from '../../../../lib/sitadel/priorite';
import type { DossierAffiche, ResultatVeille } from '../../../../lib/sitadel/veilleRepo';
import type { CommuneRef, FusionRef } from '../../../../lib/sitadel/carteRepo';
import { CartePermis } from './CartePermis';
import { corpsPatchContact, noteAuChangementCanal, problemeContactUI, editionInitiale, type EtatEditionContact } from './contactForm';
import { SelecteurCanal } from './ContactRendu';

/**
 * Vue de la tuile « Permis de construire » (client) : filtres combinables + liste paginée CÔTÉ SERVEUR (jamais 29 670
 * lignes d'un coup), total filtré et compteurs par catégorie. La recherche libre (numéro / voie) tolère la troncature
 * du libellé (traitée en base par trigramme — cf. `priorite.ts`). LECTURE SEULE : aucune mutation.
 */

interface Categorie { cle: CleCategorie; libelle: string; rang: number }
interface Props { depuisParDefaut: string; categories: Categorie[] }

interface Filtres {
  departement: string; type: '' | 'PC' | 'PD'; rang: string;
  depuis: string; jusqua: string; surfaceMin: string; logementsMin: string; q: string;
  sansDestinataire: '' | '1'; etat: '' | '2' | '4' | '5' | '6';
}

const STATUT_LIBELLE: Record<string, string> = { presume: 'présumée', confirme: 'confirmée', invalide: 'invalide' };

type Edition = EtatEditionContact; // ordre des canaux + présélection téléservice : cf. contactForm.editionInitiale

type Etat =
  | { statut: 'chargement' }
  | { statut: 'erreur' }
  | { statut: 'ok'; data: ResultatVeille };

const TAILLE = 25;
const styleChamp: CSSProperties = { padding: '.4rem .5rem', border: '1px solid var(--color-svv-line)', borderRadius: '.4rem', fontSize: 14 };
const fmtNb = (n: number | null): string => (n === null ? '—' : n.toLocaleString('fr-FR'));
const fmtSurf = (n: number | null): string => (n === null ? '—' : `${Math.round(n).toLocaleString('fr-FR')} m²`);

export function PermisVue({ depuisParDefaut, categories }: Props) {
  const [filtres, setFiltres] = useState<Filtres>({
    departement: '', type: '', rang: '',
    depuis: depuisParDefaut, jusqua: '', surfaceMin: '', logementsMin: '', q: '', sansDestinataire: '', etat: '',
  });
  const [communesSel, setCommunesSel] = useState<string[]>([]); // codes INSEE sélectionnés (multi) — état PARTAGÉ carte ↔ champ
  const [ref, setRef] = useState<{ communes: CommuneRef[]; fusions: FusionRef[] } | null>(null);
  const [rechCommune, setRechCommune] = useState('');
  const [carteOuverte, setCarteOuverte] = useState(false);
  const [page, setPage] = useState(1);
  const [etat, setEtat] = useState<Etat>({ statut: 'chargement' });
  const [version, setVersion] = useState(0); // bumpé après une édition de contact → force le rechargement
  const [edition, setEdition] = useState<Edition | null>(null);

  /** Toute modif de filtre remet la pagination à 1 (jamais de setState d'effet). */
  const maj = (patch: Partial<Filtres>): void => { setFiltres((f) => ({ ...f, ...patch })); setPage(1); };

  /** (Dé)sélectionne une commune — MÊME état pour le champ et la carte. Reset pagination. */
  const basculerCommune = (code: string): void => {
    setCommunesSel((s) => (s.includes(code) ? s.filter((c) => c !== code) : [...s, code]));
    setPage(1);
  };
  const selectionSet = useMemo(() => new Set(communesSel), [communesSel]);

  const categoriesTriees = useMemo(() => [...categories].sort((a, b) => a.rang - b.rang), [categories]);
  const cle = JSON.stringify(filtres) + '|' + [...communesSel].sort().join(',');

  // Référentiel léger (noms + fusions) pour le multi-sélecteur, chargé une fois.
  useEffect(() => {
    let annule = false;
    void (async () => {
      try {
        const res = await fetch('/api/admin/permis/communes', { cache: 'no-store' });
        if (!annule && res.ok) setRef((await res.json()) as { communes: CommuneRef[]; fusions: FusionRef[] });
      } catch { /* le multi-sélecteur restera vide ; la carte reste utilisable */ }
    })();
    return () => { annule = true; };
  }, []);

  const nomCommune = (code: string): string => ref?.communes.find((c) => c.code === code)?.nom ?? code;
  // Suggestions du multi-sélecteur : par nom (insensible casse/accents, côté client) ou code, hors déjà sélectionnées.
  const suggestions = useMemo(() => {
    if (!ref || rechCommune.trim() === '') return [];
    const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '');
    const qn = norm(rechCommune.trim());
    const dep = filtres.departement;
    return ref.communes
      .filter((c) => (!dep || c.dep === dep) && !selectionSet.has(c.code) && (norm(c.nom).includes(qn) || c.code.startsWith(qn)))
      .slice(0, 8);
  }, [ref, rechCommune, filtres.departement, selectionSet]);

  /** Ouvre l'éditeur de contact pour la commune d'un dossier (pré-rempli avec le canal/valeur courants). */
  const ouvrirEdition = (d: DossierAffiche): void => setEdition(editionInitiale(d));

  /** Enregistre la correction manuelle du contact (source=saisie_manuelle, statut=confirme) puis recharge. */
  async function enregistrerContact(): Promise<void> {
    if (!edition) return;
    // S16 — refus côté UI d'un canal incohérent (ex. 'formulaire' sans URL), miroir de la contrainte DB : message clair.
    const probleme = problemeContactUI(edition);
    if (probleme) { setEdition({ ...edition, erreur: `Impossible d’enregistrer : ${probleme}.` }); return; }
    try {
      const res = await fetch('/api/admin/permis/contact', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(corpsPatchContact(edition)), // S15 : inclut `note` (trace, ex. adresse BASU conservée)
      });
      if (!res.ok) {
        const d = (await res.json().catch(() => ({}))) as { erreur?: string };
        setEdition({ ...edition, erreur: d.erreur ? `Refusé : ${d.erreur}.` : 'Enregistrement refusé.' });
        return;
      }
      setEdition(null);
      setVersion((v) => v + 1);
    } catch {
      setEdition({ ...edition, erreur: 'Enregistrement impossible.' });
    }
  }

  // Fetch débouncé (250 ms) sur (filtres, page). Patron admin : setState DANS l'IIFE async + garde anti-course.
  useEffect(() => {
    let annule = false;
    const t = setTimeout(() => {
      void (async () => {
        setEtat({ statut: 'chargement' });
        try {
          const p = new URLSearchParams();
          for (const [k, v] of Object.entries(filtres)) if (v !== '') p.set(k, v);
          for (const code of communesSel) p.append('communes', code);
          p.set('page', String(page));
          p.set('taille', String(TAILLE));
          const res = await fetch(`/api/admin/permis?${p.toString()}`, { cache: 'no-store' });
          if (annule) return;
          if (!res.ok) { setEtat({ statut: 'erreur' }); return; }
          const data = (await res.json()) as ResultatVeille;
          if (!annule) setEtat({ statut: 'ok', data });
        } catch {
          if (!annule) setEtat({ statut: 'erreur' });
        }
      })();
    }, 250);
    return () => { annule = true; clearTimeout(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cle, page, version]);

  const data = etat.statut === 'ok' ? etat.data : null;
  const nbPages = data ? Math.max(1, Math.ceil(data.total / TAILLE)) : 1;

  return (
    <div className="flex flex-col gap-4">
      {/* ── Filtres (tous combinables) ── */}
      <div className="svv-card" style={{ display: 'flex', flexWrap: 'wrap', gap: '.6rem', alignItems: 'flex-end' }}>
        <label className="flex flex-col gap-1" style={{ fontSize: 12 }}>Département
          <select value={filtres.departement} onChange={(e) => maj({ departement: e.target.value })} style={styleChamp}>
            <option value="">Tous</option>
            {['75', '92', '93', '78'].map((d) => <option key={d} value={d}>{d}</option>)}
          </select>
        </label>
        <div className="flex flex-col gap-1" style={{ fontSize: 12, position: 'relative', flex: '1 1 280px' }}>
          <span>Communes (nom ou code — plusieurs possibles)</span>
          <input
            value={rechCommune} onChange={(e) => setRechCommune(e.target.value)}
            placeholder="ex. Nanterre ou 92050" style={styleChamp}
          />
          {suggestions.length > 0 && (
            <ul style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 20, margin: 0, padding: 0, listStyle: 'none', background: '#fff', border: '1px solid var(--color-svv-line)', borderRadius: '.4rem', maxHeight: 220, overflowY: 'auto' }}>
              {suggestions.map((c) => (
                <li key={c.code}>
                  <button type="button" onClick={() => { basculerCommune(c.code); setRechCommune(''); }}
                    style={{ display: 'block', width: '100%', textAlign: 'left', padding: '.35rem .5rem', background: 'none', border: 0, cursor: 'pointer', fontSize: 13 }}>
                    {c.nom} <span style={{ color: 'var(--color-svv-muted)' }}>({c.code} · {c.dep})</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {communesSel.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '.3rem', marginTop: '.3rem' }}>
              {communesSel.map((code) => (
                <span key={code} style={{ display: 'inline-flex', alignItems: 'center', gap: '.3rem', background: 'var(--color-svv-field)', borderRadius: 999, padding: '.15rem .5rem', fontSize: 12 }}>
                  {nomCommune(code)}
                  <button type="button" onClick={() => basculerCommune(code)} aria-label={`Retirer ${nomCommune(code)}`} style={{ background: 'none', border: 0, cursor: 'pointer', color: 'var(--color-svv-red)' }}>×</button>
                </span>
              ))}
              <button type="button" onClick={() => { setCommunesSel([]); setPage(1); }} className="svv-link" style={{ fontSize: 12 }}>tout retirer</button>
            </div>
          )}
        </div>
        <button type="button" className="svv-btn svv-btn-outline" style={{ padding: '.4rem .7rem', fontSize: 13, alignSelf: 'flex-start' }} onClick={() => setCarteOuverte((v) => !v)}>
          {carteOuverte ? 'Masquer la carte' : 'Choisir sur la carte'}
        </button>
        <label className="flex flex-col gap-1" style={{ fontSize: 12 }}>Type
          <select value={filtres.type} onChange={(e) => maj({ type: e.target.value as Filtres['type'] })} style={styleChamp}>
            <option value="">Tous</option><option value="PC">PC</option><option value="PD">PD</option>
          </select>
        </label>
        <label className="flex flex-col gap-1" style={{ fontSize: 12 }}>Catégorie
          <select value={filtres.rang} onChange={(e) => maj({ rang: e.target.value })} style={styleChamp}>
            <option value="">Toutes</option>
            {categoriesTriees.map((c) => <option key={c.cle} value={String(c.rang)}>{c.libelle}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1" style={{ fontSize: 12 }}>État
          <select value={filtres.etat} onChange={(e) => maj({ etat: e.target.value as Filtres['etat'] })} style={styleChamp}>
            <option value="">Tous</option>
            {ETATS_CONNUS.map((code) => <option key={code} value={code}>{libelleEtat(code)}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1" style={{ fontSize: 12 }}>Depuis
          <input type="date" value={filtres.depuis} onChange={(e) => maj({ depuis: e.target.value })} style={styleChamp} />
        </label>
        <label className="flex flex-col gap-1" style={{ fontSize: 12 }}>Jusqu&rsquo;à
          <input type="date" value={filtres.jusqua} onChange={(e) => maj({ jusqua: e.target.value })} style={styleChamp} />
        </label>
        <button type="button" onClick={() => maj({ depuis: '', jusqua: '' })} className="svv-btn svv-btn-outline" style={{ padding: '.4rem .7rem', fontSize: 13 }}>
          Depuis toujours
        </button>
        <label className="flex flex-col gap-1" style={{ fontSize: 12 }}>Surface min (m²)
          <input type="number" min={0} value={filtres.surfaceMin} onChange={(e) => maj({ surfaceMin: e.target.value })} style={{ ...styleChamp, width: 110 }} />
        </label>
        <label className="flex flex-col gap-1" style={{ fontSize: 12 }}>Logements min
          <input type="number" min={0} value={filtres.logementsMin} onChange={(e) => maj({ logementsMin: e.target.value })} style={{ ...styleChamp, width: 110 }} />
        </label>
        <label className="flex flex-col gap-1" style={{ fontSize: 12, flex: '1 1 220px' }}>Recherche (n° de dossier ou voie)
          <input value={filtres.q} onChange={(e) => maj({ q: e.target.value })} placeholder="ex. ISSY-LES-MOULINEAUX" style={styleChamp} />
        </label>
        <label className="flex items-center gap-2" style={{ fontSize: 13, minHeight: 40 }}>
          <input type="checkbox" checked={filtres.sansDestinataire === '1'} onChange={(e) => maj({ sansDestinataire: e.target.checked ? '1' : '' })} />
          Sans destinataire
        </label>
      </div>

      {/* ── Carte de sélection (SVG, aucune tuile) ── */}
      {carteOuverte && <CartePermis selection={selectionSet} onToggle={basculerCommune} departement={filtres.departement || null} />}

      {/* ── Avertissement : la sélection inclut des dossiers d'anciens codes (fusions) ── */}
      {data && data.inclusions.length > 0 && (
        <div className="svv-page-note" style={{ marginTop: 0, fontSize: 13 }}>
          La sélection inclut aussi les dossiers déposés sous d&rsquo;anciens codes (communes fusionnées) :{' '}
          {data.inclusions.map((i, k) => (
            <span key={i.ancien}>{k > 0 ? ' · ' : ''}<strong>{i.n.toLocaleString('fr-FR')}</strong> sous {i.nomAncien ?? i.ancien} ({i.ancien})</span>
          ))}.
        </div>
      )}

      {/* ── Total + compteurs par catégorie ── */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '.5rem', alignItems: 'center', fontSize: 13 }}>
        <strong>{data ? `${data.total.toLocaleString('fr-FR')} dossier(s)` : '…'}</strong>
        {data?.comptes.map((c) => (
          <span key={c.rang} className="svv-pill" style={{ background: 'var(--color-svv-field)', padding: '.2rem .55rem', borderRadius: 999 }}>
            {c.libelle} : {c.n.toLocaleString('fr-FR')}
          </span>
        ))}
        {data && (
          <>
            <span className="svv-pill" style={{ background: '#fff4e0', color: '#8a5a00', padding: '.2rem .55rem', borderRadius: 999 }} title="Permis annulés (jamais sollicités)">
              Annulés : {fmtNb(data.compteursEtat?.annules ?? 0)}
            </span>
            <span className="svv-pill" style={{ background: '#fdecec', color: 'var(--color-svv-red)', padding: '.2rem .55rem', borderRadius: 999 }} title="Dossiers retirés du dernier millésime Sitadel">
              Absents du dernier millésime : {fmtNb(data.compteursEtat?.absents ?? 0)}
            </span>
            <span className="svv-pill" style={{ background: 'var(--color-svv-field)', color: 'var(--color-svv-muted)', padding: '.2rem .55rem', borderRadius: 999 }} title="Dossiers dont les lignes portaient des états divergents (état affiché = agrégat ; restent proposables)">
              États ambigus : {fmtNb(data.compteursEtat?.ambigus ?? 0)}
            </span>
          </>
        )}
      </div>

      {/* ── Aide : l'absence de déclaration d'ouverture de chantier ── */}
      <div className="svv-page-note" style={{ marginTop: 0, fontSize: 12, color: 'var(--color-svv-muted)' }}>
        L&rsquo;<strong>absence de déclaration d&rsquo;ouverture de chantier</strong> ne signifie pas qu&rsquo;il ne se passe rien : c&rsquo;est très majoritairement un <strong>retard de déclaration</strong>. Un permis simplement « Autorisé » reste donc un dossier pertinent — seuls les <strong>annulés</strong> et les <strong>retirés du fichier</strong> sont écartés des demandes.
      </div>

      {/* ── Édition manuelle d'une adresse de commune (source=saisie_manuelle, statut=confirme) ── */}
      {edition && (
        <div className="svv-card" style={{ display: 'flex', flexWrap: 'wrap', gap: '.6rem', alignItems: 'center' }}>
          <span style={{ fontSize: 13 }}>Contact de <strong>{edition.nom}</strong> ({edition.code}) :</span>
          <SelecteurCanal canal={edition.canal} suggestionTeleservice={edition.suggestionTeleservice}
            onCanal={(c) => setEdition({ ...edition, canal: c, note: noteAuChangementCanal(edition.canal, c, edition.adressePostale, edition.note), erreur: '' })} />
          {edition.canal === 'email' && (
            <input type="email" value={edition.email} placeholder="urbanisme@ville.fr"
              onChange={(e) => setEdition({ ...edition, email: e.target.value, erreur: '' })} style={{ ...styleChamp, flex: '1 1 260px' }} />
          )}
          {edition.canal === 'formulaire' && (
            <input type="url" value={edition.urlFormulaire} placeholder="https://ville.fr/urbanisme/contact"
              onChange={(e) => setEdition({ ...edition, urlFormulaire: e.target.value, erreur: '' })} style={{ ...styleChamp, flex: '1 1 260px' }} />
          )}
          {edition.canal === 'courrier' && (
            <input type="text" value={edition.adressePostale} placeholder="Service urbanisme, 1 place de la Mairie, 92000…"
              onChange={(e) => setEdition({ ...edition, adressePostale: e.target.value, erreur: '' })} style={{ ...styleChamp, flex: '1 1 320px' }} />
          )}
          <label style={{ display: 'flex', flexDirection: 'column', gap: '.2rem', flex: '1 1 100%', fontSize: 12, color: 'var(--color-svv-muted)' }}>
            Note (traçabilité — ex. adresse conservée en quittant le courrier)
            <input type="text" value={edition.note} placeholder="ex. Ancienne adresse courrier : …"
              onChange={(e) => setEdition({ ...edition, note: e.target.value, erreur: '' })} style={{ ...styleChamp, width: '100%', boxSizing: 'border-box' }} />
          </label>
          <button type="button" className="svv-btn svv-btn-primary" style={{ padding: '.4rem .8rem' }} onClick={() => void enregistrerContact()}>Enregistrer</button>
          <button type="button" className="svv-btn svv-btn-outline" style={{ padding: '.4rem .8rem' }} onClick={() => setEdition(null)}>Annuler</button>
          {edition.erreur && <span role="alert" style={{ color: 'var(--color-svv-red)', fontSize: 13 }}>{edition.erreur}</span>}
        </div>
      )}

      {/* ── Liste ── */}
      {etat.statut === 'erreur' && <div className="svv-card" style={{ color: 'var(--color-svv-red)' }}>Chargement impossible (réservé aux administrateurs).</div>}
      {etat.statut === 'chargement' && !data && <div className="svv-card" style={{ color: 'var(--color-svv-muted)' }}>Chargement…</div>}
      {data && (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ textAlign: 'left', color: 'var(--color-svv-muted)', borderBottom: '1px solid var(--color-svv-line)' }}>
                {['Catégorie', 'État', 'Date', 'Commune', 'Dép.', 'Destinataire', 'Surface', 'Logts', 'Adresse du terrain', 'Cadastre', 'N° dossier', 'Type'].map((h) => (
                  <th key={h} style={{ padding: '.4rem .5rem', whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.lignes.map((d: DossierAffiche) => (
                <tr key={`${d.type}-${d.id}`} style={{ borderBottom: '1px solid var(--color-svv-line)' }}>
                  <td style={{ padding: '.4rem .5rem', fontWeight: 600, whiteSpace: 'nowrap' }}>{d.libelleCategorie}</td>
                  <td style={{ padding: '.4rem .5rem', whiteSpace: 'nowrap', color: d.etatDau === '4' ? '#8a5a00' : !d.vuAuDernier ? 'var(--color-svv-red)' : 'inherit' }}>
                    {libelleEtat(d.etatDau)}{!d.vuAuDernier ? ' · retiré' : ''}
                    {d.etatAmbigu && <span style={{ color: 'var(--color-svv-muted)', fontSize: 11 }} title="Les lignes du dossier portaient des états divergents ; l’état affiché est l’agrégat. Reste proposable."> · ambigu</span>}
                  </td>
                  <td style={{ padding: '.4rem .5rem', whiteSpace: 'nowrap' }}>{formaterDateJour(d.dateReelleAutorisation)}</td>
                  <td style={{ padding: '.4rem .5rem', whiteSpace: 'nowrap' }}>{libelleCommune(d.communeNom, d.codeInsee)}</td>
                  <td style={{ padding: '.4rem .5rem' }}>{d.departement}</td>
                  <td style={{ padding: '.4rem .5rem', maxWidth: 260 }}>
                    {d.communeNom === null ? (
                      <span style={{ color: 'var(--color-svv-muted)', fontStyle: 'italic' }}>commune inconnue</span>
                    ) : (
                      <span>
                        {d.destCanal === 'email' && <span>{d.destEmail}</span>}
                        {d.destCanal === 'formulaire' && <a href={d.destUrlFormulaire ?? '#'} target="_blank" rel="noopener noreferrer" className="svv-link">formulaire web ↗</a>}
                        {d.destCanal === 'courrier' && <span title={d.destAdressePostale ?? ''}>✉ {(d.destAdressePostale ?? '').slice(0, 40)}{(d.destAdressePostale ?? '').length > 40 ? '…' : ''}</span>}
                        {(d.destCanal === 'inconnu' || d.destCanal === null) && <span style={{ color: 'var(--color-svv-red)' }}>sans destinataire</span>}
                        {d.destCanal && d.destCanal !== 'inconnu' && (
                          <span style={{ color: d.destStatut === 'confirme' ? 'var(--color-svv-green-ink)' : d.destStatut === 'invalide' ? 'var(--color-svv-red)' : 'var(--color-svv-muted)', fontSize: 11 }}>
                            {' '}({STATUT_LIBELLE[d.destStatut ?? 'presume']})
                          </span>
                        )}{' '}
                        <button type="button" onClick={() => ouvrirEdition(d)} style={{ background: 'none', border: 0, cursor: 'pointer', color: 'var(--color-svv-red)' }} aria-label="Modifier le contact">✎</button>
                      </span>
                    )}
                  </td>
                  <td style={{ padding: '.4rem .5rem', whiteSpace: 'nowrap' }}>{fmtSurf(d.type === 'PD' ? d.superficieTerrain : d.surfCreee)}</td>
                  <td style={{ padding: '.4rem .5rem' }}>{fmtNb(d.nbLgtTotCrees)}</td>
                  <td style={{ padding: '.4rem .5rem' }}>{[d.adrNumTer, d.adrLibvoieTer, d.adrLocaliteTer].filter(Boolean).join(' ') || '—'}</td>
                  <td style={{ padding: '.4rem .5rem', whiteSpace: 'nowrap' }}>{d.cadastre.length ? d.cadastre.join(' · ') : '—'}</td>
                  <td style={{ padding: '.4rem .5rem', whiteSpace: 'nowrap', fontFamily: 'var(--font-svv-mono, monospace)' }}>{d.numDau}</td>
                  <td style={{ padding: '.4rem .5rem' }}>{d.type}</td>
                </tr>
              ))}
              {data.lignes.length === 0 && (
                <tr><td colSpan={12} style={{ padding: '1rem .5rem', color: 'var(--color-svv-muted)' }}>Aucun dossier pour ces filtres.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Pagination ── */}
      {data && data.total > TAILLE && (
        <div style={{ display: 'flex', gap: '.6rem', alignItems: 'center', justifyContent: 'center', fontSize: 13 }}>
          <button type="button" className="svv-btn svv-btn-outline" style={{ padding: '.35rem .7rem' }} disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>Précédent</button>
          <span>Page {page} / {nbPages}</span>
          <button type="button" className="svv-btn svv-btn-outline" style={{ padding: '.35rem .7rem' }} disabled={page >= nbPages} onClick={() => setPage((p) => Math.min(nbPages, p + 1))}>Suivant</button>
        </div>
      )}
    </div>
  );
}
