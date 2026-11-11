'use client';

import type { ReactNode } from 'react';
import { dateFrPreavis } from '../../../../lib/location/preavis';
import { NON_RENSEIGNE, nomFiche, type FicheIntervention, type PersonneFiche } from '../../../../lib/location/ficheIntervention';

/**
 * ══ 🔴🔴 LA LIGNE DE PRÉAVIS DÉPLIÉE, EN TROIS BLOCS (spec d'Arno du 11/11/2026, lot 1) — Location ET Gestion (même composant) ══════════
 *   ① LOCATAIRE(S) · ② PROPRIÉTAIRE(S) · ③ LOGEMENT ET ANNEXES — chacun son titre et son encadré, dans cet ordre. Une information absente :
 * « non renseigné », avec le lien vers la fiche du bien pour la compléter. Les autres informations connues du logement suivent (rien
 * n'est retiré). Interne à l'agence : ces coordonnées ne sortent jamais vers un locataire ou un propriétaire. ⚠️ AUCUN IMPORT QUI TIRE `pg`.
 */
export function FicheInterventionPreavis({ f, lienBien }: { f: FicheIntervention; lienBien: string }) {
  // « non renseigné » + le lien pour compléter : la fiche du BIEN pour le logement ; 🔴 Arno (11/11/2026, lot 5) — pour un locataire ou un
  // propriétaire, SA fiche (« compléter la fiche du locataire / du propriétaire »), la même adresse que les liens « Voir la fiche » de l'écran.
  const manqueVers = (href: string, quoi: string) => <span className="fip-manque" data-non-renseigne>{NON_RENSEIGNE} — <a href={href} data-lien-completer>compléter la fiche {quoi}</a></span>;
  const manque = manqueVers(lienBien, 'du bien');
  const coords = (p: PersonneFiche, m: ReactNode) => (
    <dl className="fip-dl">
      <div><dt>Téléphone</dt><dd>{p.telephones.length === 0 ? m : p.telephones.map((t) => <a key={t} href={`tel:${t.replace(/\s+/g, '')}`}>{t}</a>)}</dd></div>
      <div><dt>E-mail</dt><dd>{p.emails.length === 0 ? m : p.emails.map((x) => <a key={x} href={`mailto:${x}`}>{x}</a>)}</dd></div>
    </dl>
  );
  // 🔴 Arno (11/11/2026, lot 5) — « Entrée dans les lieux » n'est plus répétée sous « Autres informations » (le bloc ① la porte, par locataire) :
  // retirée de CET affichage seulement (la fiche envoyée aux collègues reste inchangée).
  const autres = f.autres.filter((x) => x.cle !== 'entree');
  return (
    <div className="fip" data-fiche-intervention>
      <style>{CSS_FICHE_INTERVENTION}</style>
      <section className="fip-bloc" data-bloc-fiche="locataires" aria-labelledby={`fip-loc-${f.lotId}`}>
        <h4 id={`fip-loc-${f.lotId}`} className="fip-titre">① {f.locataires.length > 1 ? 'Locataires' : 'Locataire'}</h4>
        {f.locataires.length === 0 ? <p className="fip-vide">{manque}</p> : f.locataires.map((p, i) => (
          <div key={`${p.nom}-${i}`} className="fip-personne" data-fiche-locataire>
            <p className="fip-nom">{nomFiche(p)}</p>
            <p className="fip-entree" data-date-entree>Entré(e) dans le logement le <strong>{p.entree ? dateFrPreavis(p.entree) : NON_RENSEIGNE}</strong></p>
            {coords(p, p.locataireId !== undefined ? manqueVers(`/admin/location/locataire/${p.locataireId}`, 'du locataire') : manque)}
          </div>
        ))}
      </section>
      <section className="fip-bloc" data-bloc-fiche="proprietaires" aria-labelledby={`fip-pro-${f.lotId}`}>
        <h4 id={`fip-pro-${f.lotId}`} className="fip-titre">② {f.proprietaires.length > 1 ? 'Propriétaires' : 'Propriétaire'}</h4>
        {f.proprietaires.length === 0 ? <p className="fip-vide">{manque}</p> : f.proprietaires.map((p, i) => (
          <div key={`${p.nom}-${i}`} className="fip-personne" data-fiche-proprietaire>
            <p className="fip-nom">{p.id !== null ? <a href={`/admin/location/proprietaire/${p.id}`} data-lien-proprietaire>{nomFiche(p)}</a> : nomFiche(p)}</p>
            {coords(p, p.id !== null ? manqueVers(`/admin/location/proprietaire/${p.id}`, 'du propriétaire') : manque)}
          </div>
        ))}
      </section>
      <section className="fip-bloc" data-bloc-fiche="logement" aria-labelledby={`fip-log-${f.lotId}`}>
        <h4 id={`fip-log-${f.lotId}`} className="fip-titre">③ Logement et annexes</h4>
        <dl className="fip-dl">
          {f.logement.map((x) => <div key={x.cle} data-ligne-fiche={x.cle}><dt>{x.libelle}</dt><dd>{x.valeur ?? manque}</dd></div>)}
        </dl>
        <p className="fip-lots" data-lots-concernes>{f.nombreLots} lot{f.nombreLots > 1 ? 's' : ''} concerné{f.nombreLots > 1 ? 's' : ''} par ce préavis</p>
        {f.annexes.length > 0 && (
          <ul className="fip-annexes" data-annexes>
            {f.annexes.map((a, i) => (
              <li key={i} data-annexe>
                <strong>{a.type}</strong>
                <span>étage : {a.etage ?? manque}</span>
                <span>n° de lot : {a.numeroLot ?? manque}</span>
                <span>{a.place ? 'n° de place' : 'n°'} : {a.numero ?? manque}</span>
              </li>
            ))}
          </ul>
        )}
        {autres.length > 0 && (
          <div className="fip-autres" data-autres-infos>
            <p className="fip-sous">Autres informations du logement</p>
            <dl className="fip-dl">{autres.map((x) => <div key={x.cle} data-ligne={x.cle}><dt>{x.libelle}</dt><dd>{x.valeur}</dd></div>)}</dl>
          </div>
        )}
      </section>
    </div>
  );
}

/* AUCUN ACCENT GRAVE DANS CE LITTERAL. Jetons du theme ; cibles de 44 px ; une colonne au telephone. */
export const CSS_FICHE_INTERVENTION = `
.fip{grid-column:1 / -1;display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;min-width:0}
@media (max-width:900px){.fip{grid-template-columns:1fr}}
.fip-bloc{border:1px solid var(--color-svv-line-strong);border-radius:12px;padding:10px 12px;background:var(--color-svv-surface);min-width:0;display:flex;flex-direction:column;gap:8px}
.fip-titre{margin:0;font-size:.82rem;font-weight:900;letter-spacing:.05em;text-transform:uppercase;color:var(--color-svv-ink)}
.fip-personne{display:flex;flex-direction:column;gap:2px;padding-top:6px;border-top:1px dashed var(--color-svv-line)}
.fip-personne:first-of-type{border-top:0;padding-top:0}
.fip-nom{margin:0;font-weight:800;font-size:1rem;overflow-wrap:anywhere}
.fip-entree{margin:0;padding:4px 8px;border-radius:8px;background:color-mix(in srgb, var(--color-svv-green-ink) 12%, transparent);color:var(--color-svv-ink);font-size:.9rem}
.fip-dl{margin:0;display:grid;grid-template-columns:auto 1fr;gap:2px 10px;min-width:0}
.fip-dl > div{display:contents}
.fip-dl dt{color:var(--color-svv-muted);font-size:.85rem}
.fip-dl dd{margin:0;overflow-wrap:anywhere;display:flex;flex-wrap:wrap;gap:2px 10px}
.fip-dl a{color:var(--color-svv-ink);min-height:28px;display:inline-flex;align-items:center}
.fip-manque{color:var(--color-svv-muted);font-style:italic}
.fip-manque a{font-style:normal;text-decoration:underline}
.fip-vide{margin:0}
.fip-lots{margin:0;font-weight:800}
.fip-annexes{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:6px}
.fip-annexes li{display:flex;flex-wrap:wrap;gap:2px 10px;padding:6px 8px;border-radius:8px;background:var(--color-svv-field);overflow-wrap:anywhere}
.fip-autres{display:flex;flex-direction:column;gap:4px;padding-top:6px;border-top:1px dashed var(--color-svv-line)}
.fip-sous{margin:0;font-size:.8rem;font-weight:800;color:var(--color-svv-muted)}
`;
