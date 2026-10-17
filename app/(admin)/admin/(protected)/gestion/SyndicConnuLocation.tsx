'use client';

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { CSS_PROPOSITIONS_SYNDIC, motOrigine, type SyndicConnuVu } from './PropositionsSyndic';
import { nomAvecVille, type FicheSyndic as DonneesSyndic } from '../../../../lib/gestion/syndics';
import { grouperBiensParAdresse } from '../../../../lib/location/syndicLocation';

/**
 * ══ 🔴🔴 MODALE « SYNDIC DE LA COPROPRIÉTÉ » OUVERTE DEPUIS LA TUILE LOCATION (Arno, 17/10/2026) ═══════════════════════
 *
 * Variante « location » de la modale de la Gestion (`FicheSyndic variante="location"`), et d'elle SEULE — la Gestion
 * garde son encadré (`EncadreSyndicConnu`) inchangé.
 * « Sous l'encadré “Un syndic est déjà connu pour cette adresse”, UNE seule ligne de 3 boutons de même hauteur (empilés au
 * téléphone) : “Le rattacher à ce bien” (rouge, principal), “Voir le détail” (blanc), “Non, créer un autre syndic”
 * (blanc). “Voir le détail” déplie DANS la modale toutes les informations déjà connues de ce syndic dans l'annuaire de la
 * Gestion — lecture seule, avec “Ouvrir la fiche syndic ↗”. “Masquer le détail” replie ; les 3 boutons restent. » (Arno) — et lui seul (le bouton en double du détail est retiré).
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
      {detail && <DetailSyndicLecture syndicId={courant.syndic.id} />}
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
export function DetailSyndicLecture({ syndicId }: { syndicId: number }) {
  const [f, setF] = useState<DonneesSyndic | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const zone = useRef<HTMLDivElement | null>(null);
  const [hauteur, setHauteur] = useState<number | null>(null);
  useEffect(() => {
    let vivant = true;
    void fetch(`/api/admin/gestion/syndics/${syndicId}`, { cache: 'no-store' })
      .then((r) => r.json() as Promise<{ etat?: string; fiche?: DonneesSyndic; message?: string }>)
      .then((j) => { if (!vivant) return; if (j.etat === 'ok' && j.fiche) setF(j.fiche); else setErreur(j.message ?? 'Lecture impossible.'); })
      .catch(() => { if (vivant) setErreur('Lecture impossible : le serveur n’a pas répondu.'); });
    return () => { vivant = false; };
  }, [syndicId]);
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
        <a className="syl-lien" href={`/admin/location/syndic/${f.id}`} target="_blank" rel="noopener noreferrer">Ouvrir la fiche syndic ↗</a>
      </section>
      <section className="syl-bloc" aria-labelledby="syl-t-contacts" data-bloc="contacts">
        <h4 id="syl-t-contacts" className="syl-bloc-titre">Contacts du syndic ({f.contacts.length})</h4>
        {f.contacts.length === 0 ? <p className="syl-rien">Aucun contact connu.</p> : (
          <ul className="syl-cartes">
            {f.contacts.map((c) => {
              const tel = c.coordonnees.filter((k) => k.sorte === 'telephone').map((k) => k.valeur).join(' · ');
              const mel = c.coordonnees.filter((k) => k.sorte === 'email').map((k) => k.valeur).join(' · ');
              return (
                <li key={c.id} className="syl-carte" data-carte-contact>
                  <strong>{[c.civilite, c.prenom, c.nom].filter((x) => x).join(' ') || 'Contact'}</strong>
                  {c.titre ? <span className="syl-fonction">{c.titre}</span> : null}
                  {tel ? <span>{tel}</span> : null}
                  {mel ? <span className="syl-mel">{mel}</span> : null}
                  {!tel && !mel ? <span className="syl-rien">aucune coordonnée</span> : null}
                </li>
              );
            })}
          </ul>
        )}
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
.syl-lien{align-self:flex-start;color:var(--color-svv-syndic-texte);font-weight:700}
.syl-cartes{list-style:none;margin:0;padding:0;display:grid;grid-template-columns:repeat(auto-fill,minmax(min(220px,100%),1fr));gap:10px}
.syl-carte{border:1px solid var(--color-svv-line);border-radius:10px;padding:9px 11px;background:var(--color-svv-field);display:flex;flex-direction:column;gap:2px;font-size:.9rem;min-width:0}
.syl-carte strong{font-size:.97rem}
.syl-fonction{color:var(--color-svv-muted)}
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
