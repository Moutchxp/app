'use client';

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { CSS_PROPOSITIONS_SYNDIC, motOrigine, type SyndicConnuVu } from './PropositionsSyndic';
import { nomAvecVille, type FicheSyndic as DonneesSyndic } from '../../../../lib/gestion/syndics';
import { clesDeLAdresse, grouperBiensParAdresse, ordonnerContactsSyndic, type NouveauContactSyndic } from '../../../../lib/location/syndicLocation';

/**
 * ══ 🔴🔴 MODALE « SYNDIC DE LA COPROPRIÉTÉ » OUVERTE DEPUIS LA TUILE LOCATION (Arno, 17/10/2026) ═══════════════════════
 *
 * Variante « location » de la modale de la Gestion (`FicheSyndic variante="location"`), et d'elle SEULE — la Gestion
 * garde son encadré (`EncadreSyndicConnu`) inchangé.
 * « Sous l'encadré “Un syndic est déjà connu pour cette adresse”, UNE seule ligne de 3 boutons de même hauteur (empilés au
 * téléphone) : “Le rattacher à ce bien” (rouge, principal), “Voir le détail” (blanc), “Non, créer un autre syndic”
 * (blanc). “Voir le détail” déplie DANS la modale toutes les informations déjà connues de ce syndic dans l'annuaire de la
 * Gestion — lecture seule. “Masquer le détail” replie ; les 3 boutons restent. » (Arno) — et lui seul (le bouton en double du
 * détail est retiré). Le lien « Ouvrir la fiche syndic ↗ » est retiré du détail (accord d'Arno, 18/10/2026).
 */
export function EncadreSyndicConnuLocation({ syndics, onRattacher, onNon, envoi = false }: {
  syndics: readonly SyndicConnuVu[];
  onRattacher: (s: SyndicConnuVu) => void;
  onNon: () => void;
  envoi?: boolean;
}) {
  const [vu, setVu] = useState(0);
  const [detail, setDetail] = useState(false);
  if (syndics.length === 0) return null;
  const ids = [...new Set(syndics.map((s) => s.syndic.id))];
  const plusieurs = ids.length > 1;
  const courant = syndics[Math.min(vu, syndics.length - 1)];
  return (
    <>
      <style>{CSS_PROPOSITIONS_SYNDIC + CSS_SYNDIC_LOCATION}</style>
      <div className="psy-bandeau psy-bandeau--connu" role="group" aria-label="Un syndic est déjà connu pour cette adresse" data-syndic-connu>
        <p className="psy-titre">{plusieurs ? 'Plusieurs syndics sont déjà connus pour cette adresse :' : 'Un syndic est déjà connu pour cette adresse :'}</p>
        {plusieurs && <p className="psy-conflit">⚠ Conflit possible : {ids.length} syndics pour une même adresse — à vérifier.</p>}
        <ul className="psy-liste">
          {syndics.map((s, i) => (
            <li key={`${s.syndic.id}-${s.copro.cle}`} className="psy-ligne">
              {plusieurs
                ? <label className="syl-choix"><input type="radio" name="syl-syndic" checked={i === vu} onChange={() => { setVu(i); setDetail(false); }} />
                  <span className="psy-mot"><strong>{nomAvecVille(s.syndic.nom, s.syndic.ville)}</strong> ({motOrigine(s)})</span></label>
                : <span className="psy-mot"><strong>{nomAvecVille(s.syndic.nom, s.syndic.ville)}</strong> ({motOrigine(s)})</span>}
            </li>
          ))}
        </ul>
      </div>
      <div className="syl-trois" data-trois-boutons>
        <button type="button" className="svv-btn svv-btn-primary gst-btn" onClick={() => onRattacher(courant)} disabled={envoi}>Le rattacher à ce bien</button>
        <button type="button" className="svv-btn svv-btn-outline gst-btn" onClick={() => setDetail((x) => !x)} aria-expanded={detail}>
          {detail ? 'Masquer le détail' : 'Voir le détail'}</button>
        <button type="button" className="svv-btn svv-btn-outline gst-btn" onClick={onNon} disabled={envoi}>Non, créer un autre syndic</button>
      </div>
      {detail && <DetailSyndicLecture syndicId={courant.syndic.id} coproCle={courant.copro.cle} />}
    </>
  );
}

/** Nombre d'adresses visibles d'emblée dans « Immeubles et biens gérés » ; au-delà, défilement interne (Arno). */
export const ADRESSES_VISIBLES = 3;

/**
 * Le détail EN LECTURE SEULE d'un syndic, tel que l'annuaire de la Gestion le connaît (mêmes données, aucune copie).
 * « 3 BLOCS nettement séparés, chacun avec un titre, un cadre et un espace entre eux : “Syndic”, “Contacts du syndic (N)”,
 * “Immeubles et biens gérés (N)” — regroupés PAR ADRESSE, triés commune → voie → numéro, 3 adresses visibles. » (Arno,
 * 17/10/2026). Le repli se fait par le SEUL bouton « Masquer le détail » de la ligne des 3 boutons.
 */
export function DetailSyndicLecture({ syndicId, coproCle = null }: {
  syndicId: number;
  /** L'immeuble (clé de copropriété) de l'adresse du bien : ses contacts passent en tête, avec un repère (Arno, 18/10/2026). */
  coproCle?: string | null;
}) {
  const [f, setF] = useState<DonneesSyndic | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const zone = useRef<HTMLDivElement | null>(null);
  const [hauteur, setHauteur] = useState<number | null>(null);
  const [relire, setRelire] = useState(0);
  const [ajout, setAjout] = useState<NouveauContactSyndic | null>(null);
  const [motifAjout, setMotifAjout] = useState<string | null>(null);
  const [envoi, setEnvoi] = useState(false);
  const [ajoute, setAjoute] = useState<string | null>(null);
  useEffect(() => {
    let vivant = true;
    void fetch(`/api/admin/gestion/syndics/${syndicId}`, { cache: 'no-store' })
      .then((r) => r.json() as Promise<{ etat?: string; fiche?: DonneesSyndic; message?: string }>)
      .then((j) => { if (!vivant) return; if (j.etat === 'ok' && j.fiche) setF(j.fiche); else setErreur(j.message ?? 'Lecture impossible.'); })
      .catch(() => { if (vivant) setErreur('Lecture impossible : le serveur n’a pas répondu.'); });
    return () => { vivant = false; };
  }, [syndicId, relire]);
  const groupes = useMemo(() => (f === null ? [] : grouperBiensParAdresse(f.coproprietes)), [f]);
  const limite = groupes.length > ADRESSES_VISIBLES;
  // La hauteur de la zone = le bas de la 3e adresse (mesuré : une adresse peut porter 1 ou 12 lots).
  useLayoutEffect(() => {
    if (!limite || zone.current === null) { setHauteur(null); return; }
    const g = zone.current.querySelectorAll<HTMLElement>('[data-groupe-adresse]')[ADRESSES_VISIBLES - 1];
    const h = g ? g.offsetTop - zone.current.offsetTop + g.offsetHeight : 0;
    setHauteur(h > 0 ? h + 2 : null);
  }, [limite, groupes]);
  if (erreur !== null) return <p className="fsy-alerte" role="alert">{erreur}</p>;
  if (f === null) return <p className="fsy-discret">Chargement du détail…</p>;
  const rien = <span className="syl-rien">non renseigné</span>;
  const adresse = [f.adresse, [f.codePostal, f.ville].filter((x) => x).join(' ')].filter((x) => x).join(', ');
  const telephones = [f.telephone, f.telephone2].filter((x) => x).join(' · ');
  const nbLots = groupes.reduce((n, g) => n + g.lots.length, 0);
  const contacts = ordonnerContactsSyndic(f.contacts, coproCle === null ? new Set<string>() : clesDeLAdresse(coproCle, f.coproprietes));
  // « + Ajouter un contact » : il rejoint l'annuaire du syndic de la GESTION (la porte unique `enregistrerSyndic`, côté serveur).
  const enregistrerAjout = async (c: NouveauContactSyndic): Promise<void> => {
    if ((c.nom ?? '').trim() === '') { setMotifAjout('Le nom du contact est obligatoire.'); return; }
    if ((c.email ?? '').trim() === '' && (c.telephone ?? '').trim() === '') { setMotifAjout('Un téléphone ou un e-mail.'); return; }
    setEnvoi(true);
    try {
      const r = await fetch('/api/admin/location', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'ajouter-contact-syndic', syndicId: f.id, contact: c }) });
      const j = await r.json() as { etat?: string; motif?: string; message?: string };
      if (j.etat !== 'ok') { setMotifAjout(j.motif ?? j.message ?? 'Enregistrement impossible.'); return; }
      setAjout(null); setMotifAjout(null);
      setAjoute(`${[c.prenom, (c.nom ?? '').toUpperCase()].filter((x) => (x ?? '').trim() !== '').join(' ')} rejoint l’annuaire de ce syndic (visible dans la Gestion).`);
      setRelire((x) => x + 1);
    } catch { setMotifAjout('Enregistrement impossible : le serveur n’a pas répondu.'); } finally { setEnvoi(false); }
  };
  return (
    <div className="syl-detail" aria-label="Détail du syndic (lecture seule)" data-detail-syndic>
      <section className="syl-bloc" aria-labelledby="syl-t-syndic" data-bloc="syndic">
        <h4 id="syl-t-syndic" className="syl-bloc-titre">Syndic</h4>
        <p className="syl-nom">{f.nom}</p>
        <dl className="syl-grille">
          {/* La raison sociale n'est montrée que si elle diffère du nom (l'annuaire n'en distingue pas aujourd'hui). */}
          <div><dt>Adresse</dt><dd>{adresse || rien}</dd></div>
          <div><dt>Téléphone</dt><dd>{telephones || rien}</dd></div>
          <div><dt>E-mail</dt><dd>{f.email || rien}</dd></div>
        </dl>
        {f.note ? <p className="syl-note"><span className="syl-etiquette">Notes</span>{f.note}</p> : null}
      </section>
      <section className="syl-bloc" aria-labelledby="syl-t-contacts" data-bloc="contacts">
        <h4 id="syl-t-contacts" className="syl-bloc-titre">Contacts du syndic ({f.contacts.length})</h4>
        {ajoute !== null && <p className="syl-ajoute" role="status">{ajoute}</p>}
        <ul className="syl-cartes">
          {contacts.map(({ contact: c, associe }) => {
            const tel = c.coordonnees.filter((k) => k.sorte === 'telephone').map((k) => k.valeur).join(' · ');
            const mel = c.coordonnees.filter((k) => k.sorte === 'email').map((k) => k.valeur).join(' · ');
            return (
              <li key={c.id} className={`syl-carte${associe ? ' syl-carte--associe' : ''}`} data-carte-contact data-associe={associe ? 'oui' : undefined}>
                {associe ? <span className="syl-repere">Déjà associé à cette adresse</span> : null}
                <strong>{[c.civilite, c.prenom, c.nom].filter((x) => x).join(' ') || 'Contact'}</strong>
                {c.titre ? <span className="syl-fonction">{c.titre}</span> : null}
                {tel ? <span>{tel}</span> : null}
                {mel ? <span className="syl-mel">{mel}</span> : null}
                {!tel && !mel ? <span className="syl-rien">aucune coordonnée</span> : null}
              </li>
            );
          })}
          {ajout === null ? (
            <li className="syl-carte syl-carte--plus">
              <button type="button" className="syl-plus" onClick={() => { setAjout({ civilite: null, nom: '', prenom: '', fonction: '', telephone: '', email: '' }); setMotifAjout(null); setAjoute(null); }}
                data-ajouter-contact-syndic>+ Ajouter un contact</button>
            </li>
          ) : (
            <li className="syl-carte syl-carte--form" data-form-contact-syndic>
              <div className="syl-form">
                <label>Civilité
                  <select value={ajout.civilite ?? ''} onChange={(e) => { const v = e.target.value; setAjout((x) => (x === null ? x : { ...x, civilite: v === 'M.' || v === 'Mme' ? v : null })); }}>
                    <option value="">—</option><option value="M.">M.</option><option value="Mme">Mme</option>
                  </select></label>
                {(['nom', 'prenom', 'fonction', 'telephone', 'email'] as const).map((k) => (
                  <label key={k}>{k === 'nom' ? 'Nom *' : k === 'prenom' ? 'Prénom' : k === 'fonction' ? 'Fonction' : k === 'telephone' ? 'Téléphone' : 'E-mail'}
                    <input value={ajout[k] ?? ''} inputMode={k === 'telephone' ? 'tel' : k === 'email' ? 'email' : undefined}
                      placeholder={k === 'fonction' ? 'gestionnaire, comptable…' : undefined}
                      onChange={(e) => { const v = e.target.value; setAjout((x) => (x === null ? x : { ...x, [k]: v })); }} /></label>
                ))}
              </div>
              {motifAjout !== null && <p className="fsy-alerte" role="alert">{motifAjout}</p>}
              <div className="syl-form-boutons">
                <button type="button" className="svv-btn svv-btn-outline gst-btn" onClick={() => { setAjout(null); setMotifAjout(null); }}>Annuler</button>
                <button type="button" className="svv-btn svv-btn-primary gst-btn" disabled={envoi} onClick={() => { void enregistrerAjout(ajout); }}>Enregistrer le contact</button>
              </div>
              <p className="syl-rien">Il rejoint l’annuaire de ce syndic dans la Gestion.</p>
            </li>
          )}
        </ul>
      </section>
      <section className="syl-bloc" aria-labelledby="syl-t-biens" data-bloc="biens">
        <h4 id="syl-t-biens" className="syl-bloc-titre">Immeubles et biens gérés ({groupes.length})</h4>
        {groupes.length === 0 ? <p className="syl-rien">Aucun immeuble en cours.</p> : (
          <div ref={zone} className={`syl-biens${limite ? ' syl-biens--limite' : ''}`} style={hauteur !== null ? { maxHeight: hauteur } : undefined}
            tabIndex={limite ? 0 : undefined} aria-label={limite ? `${groupes.length} adresses, ${nbLots} biens — faire défiler` : undefined} data-zone-biens>
            {groupes.map((g) => (
              <div key={`${g.commune ?? ''}|${g.adresse}`} className="syl-groupe" data-groupe-adresse>
                <p className="syl-adresse"><strong>{g.adresse}</strong>{[g.codePostal, g.commune].some((x) => x) ? <span> · {[g.codePostal, g.commune].filter((x) => x).join(' ')}</span> : null}</p>
                {g.lots.length === 0 ? <p className="syl-rien">aucun bien du portefeuille</p> : (
                  <ul className="syl-lots">
                    {g.lots.map((l) => (
                      <li key={l.id} data-lot>
                        <span className="syl-num">lot {l.numero}</span>
                        {l.type ? <span>{l.type}</span> : null}
                        {(l.proprietaires ?? []).length > 0 ? <span className="syl-proprio">{(l.proprietaires ?? []).join(', ')}</span> : null}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </div>
        )}
        {limite ? <p className="syl-rien" data-indice-defilement>↓ Faire défiler : {groupes.length - ADRESSES_VISIBLES} autre{groupes.length - ADRESSES_VISIBLES > 1 ? 's' : ''} adresse{groupes.length - ADRESSES_VISIBLES > 1 ? 's' : ''}</p> : null}
      </section>
      <p className="syl-rien">Lecture seule : la fiche se modifie dans l’annuaire des syndics de la Gestion.</p>
    </div>
  );
}

const CSS_SYNDIC_LOCATION = `
.syl-trois{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;margin:12px 0}
.syl-trois .svv-btn{width:100%;min-height:52px;height:100%;box-sizing:border-box;border:1px solid transparent}
.syl-trois .svv-btn-outline{border-color:var(--color-svv-line-strong)}
/* Texte du bouton rouge en couleur de SURFACE (convention de la tuile Location) : lisible sur le rouge clair du Sombre. */
.syl-trois .svv-btn-primary{color:var(--color-svv-surface)}
.syl-choix{display:flex;gap:8px;align-items:center;cursor:pointer}
/* Le détail : 3 blocs encadrés, séparés ; le ROSE du syndic de la Gestion (mêmes variables), Clair comme Sombre. */
.syl-detail{display:flex;flex-direction:column;gap:16px;margin:4px 0 14px;color:var(--color-svv-ink)}
.syl-bloc{border:1px solid var(--color-svv-syndic-bord);border-radius:12px;padding:12px 14px 14px;background:var(--color-svv-surface);display:flex;flex-direction:column;gap:10px}
.syl-bloc-titre{margin:-12px -14px 0;padding:8px 14px;border-radius:11px 11px 0 0;background:var(--color-svv-syndic-fond);color:var(--color-svv-syndic-texte);font-size:.82rem;font-weight:800;text-transform:uppercase;letter-spacing:.03em;border-bottom:1px solid var(--color-svv-syndic-bord)}
.syl-nom{margin:0;font-size:1.35rem;font-weight:800;line-height:1.2}
.syl-grille{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(200px,100%),1fr));gap:8px 14px;margin:0}
.syl-grille dt,.syl-etiquette{font-size:.76rem;color:var(--color-svv-muted);text-transform:uppercase;letter-spacing:.02em}
.syl-grille dd{margin:0;overflow-wrap:anywhere}
.syl-etiquette{display:block;margin-bottom:2px}
.syl-note{margin:0;white-space:pre-wrap}
.syl-cartes{list-style:none;margin:0;padding:0;display:grid;grid-template-columns:repeat(auto-fill,minmax(min(220px,100%),1fr));gap:10px}
.syl-carte{border:1px solid var(--color-svv-line);border-radius:10px;padding:9px 11px;background:var(--color-svv-field);display:flex;flex-direction:column;gap:2px;font-size:.9rem;min-width:0}
.syl-carte strong{font-size:.97rem}
.syl-fonction{color:var(--color-svv-muted)}
/* Le contact déjà associé à un bien de CETTE adresse : en tête, liseré et étiquette au rose du syndic (Arno, 18/10/2026). */
.syl-carte--associe{border:2px solid var(--color-svv-syndic-bord);border-left-width:6px}
.syl-repere{align-self:flex-start;margin-bottom:4px;border-radius:999px;padding:1px 9px;font-size:.72rem;font-weight:800;background:var(--color-svv-syndic-fond);color:var(--color-svv-syndic-texte);border:1px solid var(--color-svv-syndic-bord)}
.syl-carte--plus{padding:0;border-style:dashed;border-color:var(--color-svv-line-strong);background:var(--color-svv-surface)}
.syl-plus{width:100%;height:100%;min-height:88px;border:0;background:transparent;font:inherit;font-weight:700;color:var(--color-svv-ink);cursor:pointer;border-radius:10px}
.syl-plus:focus-visible{outline:2px solid var(--color-svv-red);outline-offset:2px}
.syl-carte--form{grid-column:1/-1;gap:10px}
.syl-form{display:grid;grid-template-columns:repeat(auto-fill,minmax(min(170px,100%),1fr));gap:8px 12px}
.syl-form label{display:flex;flex-direction:column;gap:3px;font-size:.8rem;font-weight:700;color:var(--color-svv-ink)}
.syl-form input,.syl-form select{font:inherit;font-weight:400;font-size:.95rem;min-height:40px;padding:6px 9px;border:1px solid var(--color-svv-line-strong);border-radius:8px;background:var(--color-svv-surface);color:var(--color-svv-ink)}
.syl-form-boutons{display:flex;flex-wrap:wrap;gap:8px;justify-content:flex-end}
.syl-form-boutons .svv-btn{width:auto}
.syl-form-boutons .svv-btn-primary{color:var(--color-svv-surface)}
.syl-ajoute{margin:0;font-size:.88rem;color:var(--color-svv-green-ink);font-weight:700}
.syl-mel{overflow-wrap:anywhere}
.syl-biens{display:flex;flex-direction:column;gap:8px}
.syl-biens--limite{max-height:19rem;overflow-y:auto;overscroll-behavior:contain;padding-right:4px}
.syl-groupe{border:1px solid var(--color-svv-line);border-radius:10px;padding:8px 11px;background:var(--color-svv-field)}
.syl-adresse{margin:0 0 4px}
.syl-lots{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:3px;font-size:.88rem}
.syl-lots li{display:flex;flex-wrap:wrap;gap:2px 10px}
.syl-num{font-weight:700}
.syl-proprio{color:var(--color-svv-muted)}
.syl-rien{color:var(--color-svv-muted);font-style:italic;font-size:.88rem;margin:0}
@media (max-width:640px){ .syl-trois{grid-template-columns:1fr} }
`;
