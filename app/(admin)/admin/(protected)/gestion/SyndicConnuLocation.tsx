'use client';

import { useEffect, useState } from 'react';
import { CSS_PROPOSITIONS_SYNDIC, motOrigine, type SyndicConnuVu } from './PropositionsSyndic';
import { nomAvecVille, type FicheSyndic as DonneesSyndic } from '../../../../lib/gestion/syndics';

/**
 * ══ 🔴🔴 MODALE « SYNDIC DE LA COPROPRIÉTÉ » OUVERTE DEPUIS LA TUILE LOCATION (Arno, 17/10/2026) ═══════════════════════
 *
 * Variante « location » de la modale de la Gestion (`FicheSyndic variante="location"`), et d'elle SEULE — la Gestion
 * garde son encadré (`EncadreSyndicConnu`) inchangé.
 * « Sous l'encadré “Un syndic est déjà connu pour cette adresse”, UNE seule ligne de 3 boutons de même hauteur (empilés au
 * téléphone) : “Le rattacher à ce bien” (rouge, principal), “Voir le détail” (blanc), “Non, créer un autre syndic”
 * (blanc). “Voir le détail” déplie DANS la modale toutes les informations déjà connues de ce syndic dans l'annuaire de la
 * Gestion — lecture seule, avec “Ouvrir la fiche syndic ↗”. “Masquer le détail” replie ; les 3 boutons restent. » (Arno)
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
      {detail && <DetailSyndicLecture syndicId={courant.syndic.id} onMasquer={() => setDetail(false)} />}
    </>
  );
}

/** Le détail EN LECTURE SEULE d'un syndic, tel que l'annuaire de la Gestion le connaît (mêmes données, aucune copie). */
export function DetailSyndicLecture({ syndicId, onMasquer }: { syndicId: number; onMasquer: () => void }) {
  const [f, setF] = useState<DonneesSyndic | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  useEffect(() => {
    let vivant = true;
    void fetch(`/api/admin/gestion/syndics/${syndicId}`, { cache: 'no-store' })
      .then((r) => r.json() as Promise<{ etat?: string; fiche?: DonneesSyndic; message?: string }>)
      .then((j) => { if (!vivant) return; if (j.etat === 'ok' && j.fiche) setF(j.fiche); else setErreur(j.message ?? 'Lecture impossible.'); })
      .catch(() => { if (vivant) setErreur('Lecture impossible : le serveur n’a pas répondu.'); });
    return () => { vivant = false; };
  }, [syndicId]);
  if (erreur !== null) return <p className="fsy-alerte" role="alert">{erreur}</p>;
  if (f === null) return <p className="fsy-discret">Chargement du détail…</p>;
  const rien = <span className="syl-rien">non renseigné</span>;
  const adresse = [f.adresse, [f.codePostal, f.ville].filter((x) => x).join(' ')].filter((x) => x).join(', ');
  const telephones = [f.telephone, f.telephone2].filter((x) => x).join(' · ');
  return (
    <section className="syl-detail" aria-label="Détail du syndic (lecture seule)" data-detail-syndic>
      <div className="syl-detail-tete">
        <h3>{f.nom}</h3>
        <span className="syl-detail-liens">
          <a href={`/admin/location/syndic/${f.id}`} target="_blank" rel="noopener noreferrer">Ouvrir la fiche syndic ↗</a>
          <button type="button" className="svv-btn svv-btn-outline gst-btn" onClick={onMasquer}>Masquer le détail</button>
        </span>
      </div>
      <dl className="syl-grille">
        <div><dt>Raison sociale</dt><dd>{f.nom}</dd></div>
        <div><dt>Adresse</dt><dd>{adresse || rien}</dd></div>
        <div><dt>Téléphone</dt><dd>{telephones || rien}</dd></div>
        <div><dt>E-mail</dt><dd>{f.email || rien}</dd></div>
      </dl>
      <h4>Contacts internes <span className="syl-compte">{f.contacts.length}</span></h4>
      {f.contacts.length === 0 ? <p className="syl-rien">Aucun contact interne connu.</p> : (
        <ul className="syl-liste">
          {f.contacts.map((c) => (
            <li key={c.id}>
              <strong>{[c.civilite, c.prenom, c.nom].filter((x) => x).join(' ') || 'Contact'}</strong>
              {c.titre ? <span> · {c.titre}</span> : null}
              <span className="syl-coord">{c.coordonnees.map((k) => k.valeur).join(' · ') || 'aucune coordonnée'}</span>
            </li>
          ))}
        </ul>
      )}
      <h4>Immeubles et biens du portefeuille gérés <span className="syl-compte">{f.coproprietes.length}</span></h4>
      {f.coproprietes.length === 0 ? <p className="syl-rien">Aucune copropriété en cours.</p> : (
        <ul className="syl-liste">
          {f.coproprietes.map((c) => (
            <li key={c.id}>
              <strong>{c.libelle}</strong>{[c.codePostal, c.commune].filter((x) => x).length > 0 ? <span> · {[c.codePostal, c.commune].filter((x) => x).join(' ')}</span> : null}
              <span className="syl-coord">{c.lots.length === 0 ? 'aucun bien du portefeuille'
                : c.lots.map((l) => [l.adresse, l.numero ? `lot ${l.numero}` : null].filter((x) => x).join(' — ')).join(' · ')}</span>
            </li>
          ))}
        </ul>
      )}
      <h4>Notes</h4>
      <p className="syl-note">{f.note ? f.note : rien}</p>
      <p className="syl-rien">Lecture seule : la fiche se modifie dans l’annuaire des syndics de la Gestion.</p>
    </section>
  );
}

const CSS_SYNDIC_LOCATION = `
.syl-trois{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;margin:12px 0}
.syl-trois .svv-btn{width:100%;min-height:52px;height:100%;box-sizing:border-box;border:1px solid transparent}
.syl-trois .svv-btn-outline{border-color:var(--color-svv-line-strong)}
/* Texte du bouton rouge en couleur de SURFACE (convention de la tuile Location) : lisible sur le rouge clair du Sombre. */
.syl-trois .svv-btn-primary{color:var(--color-svv-surface)}
.syl-choix{display:flex;gap:8px;align-items:center;cursor:pointer}
.syl-detail{border:1px solid var(--color-svv-line);border-radius:12px;padding:12px 14px;background:var(--color-svv-field);color:var(--color-svv-ink);display:flex;flex-direction:column;gap:8px;margin:0 0 12px}
.syl-detail-tete{display:flex;flex-wrap:wrap;justify-content:space-between;align-items:center;gap:8px}
.syl-detail-tete h3{margin:0;font-size:1.05rem}
.syl-detail-liens{display:flex;flex-wrap:wrap;align-items:center;gap:12px}
.syl-detail-liens a{color:var(--color-svv-ink);font-weight:700}
.syl-detail-liens .svv-btn{width:auto}
.syl-detail h4{margin:6px 0 0;font-size:.9rem;color:var(--color-svv-ink)}
.syl-grille{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(200px,100%),1fr));gap:8px 14px;margin:0}
.syl-grille dt{font-size:.78rem;color:var(--color-svv-muted);text-transform:uppercase;letter-spacing:.02em}
.syl-grille dd{margin:0}
.syl-liste{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:6px}
.syl-liste li{display:flex;flex-wrap:wrap;gap:2px 6px;align-items:baseline}
.syl-coord{flex-basis:100%;font-size:.86rem;color:var(--color-svv-muted)}
.syl-compte{display:inline-block;border-radius:999px;padding:0 8px;font-size:.75rem;background:var(--color-svv-surface);color:var(--color-svv-muted)}
.syl-note{margin:0;white-space:pre-wrap}
.syl-rien{color:var(--color-svv-muted);font-style:italic;font-size:.88rem;margin:0}
@media (max-width:640px){ .syl-trois{grid-template-columns:1fr} }
`;
