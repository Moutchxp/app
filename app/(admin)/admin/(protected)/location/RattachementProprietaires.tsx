'use client';

import { useEffect, useState } from 'react';
import { EtatLecture, useLecture } from './commun';
import { Ligne } from '../gestion/CartesPersonnes';
import type { ChampsSaisis } from '../gestion/CartesPersonnes';
import { BadgeCarte } from './SaisieCartes';
import {
  refusSelection, selectionParDefaut, type ContactProprietaire, type PersonneProprietaire, type PersonnesARattacher, type Selection,
} from '../../../../lib/location/rattachementProprietaires';

/**
 * ══ 🔴🔴 TUILE LOCATION — « QUI RATTACHER À CE BIEN ? » ET LES CARTES DU BLOC 1 (Arno, 18/10/2026) ══════════════════════
 *
 * « Quand on choisit un résultat de la recherche, ouvrir JUSTE EN DESSOUS un panneau dépliant (pas de modale) “Qui rattacher
 * à ce bien ?”, en 2 groupes, une ligne par carte avec case à cocher : “Personnes propriétaires” (étiquette rouge) et
 * “Contacts du propriétaire” (étiquette grise). Par défaut SEULE la personne cherchée est cochée. “Rattacher la sélection”
 * (rouge) et “Annuler”. » Puis « les cartes choisies s'affichent EN BAS DU BLOC 1, groupées (Propriétaires puis Contacts),
 * au format des cartes de la Gestion, en LECTURE SEULE ; lien “Modifier dans la fiche ↗” ; une croix retire la carte de CE
 * bien uniquement. » (Arno) — La croix ne touche que la page : aucune fiche n'est modifiée.
 */

const coordonnees = (telephone: string | null, email: string | null): string => [telephone, email].filter((x) => (x ?? '') !== '').join(' · ');

export function PanneauQuiRattacher({ proprietaireId, dejaProprietaires, dejaContacts, onValider, onAnnuler }: {
  proprietaireId: number;
  dejaProprietaires: readonly number[];
  dejaContacts: readonly ContactProprietaire[];
  onValider: (proprietaires: PersonneProprietaire[], contacts: ContactProprietaire[]) => void;
  onAnnuler: () => void;
}) {
  const lecture = useLecture<PersonnesARattacher>(`personnesLiees=${proprietaireId}`);
  const [sel, setSel] = useState<Selection | null>(null);
  const [motif, setMotif] = useState<string | null>(null);
  const data = lecture.etat.etat === 'ok' ? lecture.etat.data : null;
  useEffect(() => { if (data !== null) setSel(selectionParDefaut(data)); }, [data]);
  const contactDeja = (c: ContactProprietaire): boolean =>
    dejaContacts.some((x) => x.id === c.id || x.email.trim().toLowerCase() === c.email.trim().toLowerCase());
  const basculer = (k: keyof Selection, id: number, oui: boolean): void => {
    setMotif(null);
    setSel((s) => (s === null ? s : { ...s, [k]: oui ? [...s[k], id] : s[k].filter((x) => x !== id) }));
  };
  return (
    <section className="loc-qui" aria-labelledby="loc-qui-titre" data-qui-rattacher>
      <h4 id="loc-qui-titre" className="loc-qui-titre">Qui rattacher à ce bien ?</h4>
      {data === null || sel === null ? <EtatLecture etat={lecture.etat} /> : (
        <>
          <div className="loc-qui-groupe" data-groupe="proprietaires">
            <p className="loc-qui-groupe-titre"><BadgeCarte cote="proprietaire" sorte="client" /> Personnes propriétaires <span className="loc-muet">({data.proprietaires.length})</span></p>
            <ul className="loc-qui-liste">
              {data.proprietaires.map((p) => {
                const deja = dejaProprietaires.includes(p.id);
                return (
                  <li key={p.id}><label className={`loc-qui-ligne${deja ? ' loc-qui-ligne--deja' : ''}`}>
                    <input type="checkbox" checked={deja || sel.proprietaires.includes(p.id)} disabled={deja}
                      onChange={(e) => basculer('proprietaires', p.id, e.target.checked)} data-coche-proprietaire={p.id} />
                    <span className="loc-qui-mots">
                      <span className="loc-qui-nom"><strong>{p.nom}</strong>{p.id === data.choisie ? <span className="loc-qui-cherche"> · personne cherchée</span> : null}
                        {deja ? <span className="loc-qui-cherche"> · déjà rattachée</span> : null}</span>
                      <span className="loc-muet">{coordonnees(p.telephone, p.email) || 'aucune coordonnée'}</span>
                      <small className="loc-muet">{p.biens.length === 0 ? 'Aucun bien du portefeuille' : `Possède déjà : ${p.biens.join(' · ')}`}</small>
                    </span>
                  </label></li>
                );
              })}
            </ul>
          </div>
          <div className="loc-qui-groupe" data-groupe="contacts">
            <p className="loc-qui-groupe-titre"><BadgeCarte cote="proprietaire" sorte="contact" /> Contacts du propriétaire <span className="loc-muet">({data.contacts.length})</span></p>
            {data.contacts.length === 0 ? <p className="loc-muet" style={{ margin: 0 }}>Aucun contact rattaché à ces propriétaires dans la Gestion.</p> : (
              <ul className="loc-qui-liste">
                {data.contacts.map((c) => {
                  const deja = contactDeja(c);
                  return (
                    <li key={c.id}><label className={`loc-qui-ligne${deja ? ' loc-qui-ligne--deja' : ''}`}>
                      <input type="checkbox" checked={deja || sel.contacts.includes(c.id)} disabled={deja}
                        onChange={(e) => basculer('contacts', c.id, e.target.checked)} data-coche-contact={c.id} />
                      <span className="loc-qui-mots">
                        <span className="loc-qui-nom"><strong>{c.nom}</strong>{c.qualite ? <span> · {c.qualite}</span> : null}{deja ? <span className="loc-qui-cherche"> · déjà rattaché</span> : null}</span>
                        <span className="loc-muet">{coordonnees(c.telephone, c.email)}</span>
                        <small className="loc-muet">Contact sur : {c.biens.join(' · ')}</small>
                      </span>
                    </label></li>
                  );
                })}
              </ul>
            )}
          </div>
          {motif !== null && <p className="loc-manque" role="alert">{motif}</p>}
          <div className="loc-boutons loc-qui-boutons">
            <button type="button" className="svv-btn svv-btn-outline gst-btn" onClick={onAnnuler}>Annuler</button>
            <button type="button" className="svv-btn svv-btn-primary gst-btn" onClick={() => {
              // « Au moins une personne propriétaire cochée » — celles déjà rattachées au bien comptent (cochées d'office).
              const m = refusSelection({ ...sel, proprietaires: data.proprietaires.filter((p) => dejaProprietaires.includes(p.id) || sel.proprietaires.includes(p.id)).map((p) => p.id) });
              if (m !== null) { setMotif(m); return; }
              onValider(data.proprietaires.filter((p) => sel.proprietaires.includes(p.id) && !dejaProprietaires.includes(p.id)),
                data.contacts.filter((c) => sel.contacts.includes(c.id) && !contactDeja(c)));
            }}>Rattacher la sélection</button>
          </div>
        </>
      )}
    </section>
  );
}

/** Les cartes rattachées, en bas du bloc 1 : Propriétaires puis Contacts, en lecture seule. */
export function CartesDuBloc({ proprietaires, contacts, saisis, onRetirerProprietaire, onRetirerContact, onRetirerSaisi }: {
  proprietaires: readonly PersonneProprietaire[];
  contacts: readonly ContactProprietaire[];
  /** Les contacts saisis à l'écran « Créer un nouveau propriétaire » : créés avec le bien. */
  saisis: readonly ChampsSaisis[];
  onRetirerProprietaire: (id: number) => void;
  onRetirerContact: (id: number) => void;
  onRetirerSaisi: (i: number) => void;
}) {
  const croix = (mot: string, f: () => void) => (
    <div className="cp-tete-actions"><button type="button" className="cp-icone" aria-label={`Retirer ${mot} de ce bien`} title="Retirer de ce bien (la fiche n’est pas modifiée)" onClick={f}>✕</button></div>
  );
  return (
    <div className="loc-cartes-bloc" data-cartes-bloc>
      {proprietaires.length > 0 && (
        <div className="loc-cartes-groupe" data-proprietaires>
          <h4>Propriétaires ({proprietaires.length})</h4>
          <div className="loc-cartes-lues">
            {proprietaires.map((p) => (
              <article key={p.id} className="cp-carte loc-carte-lue" data-carte-proprietaire={p.id}>
                <header className="cp-tete">
                  <div className="cp-tete-mots"><p className="cp-nom">{p.nom}</p><p className="cp-tete-caps"><BadgeCarte cote="proprietaire" sorte="client" /></p></div>
                  {croix(p.nom, () => onRetirerProprietaire(p.id))}
                </header>
                <div className="cp-lignes">
                  <Ligne libelle="Téléphone">{p.telephone ?? <span className="loc-muet">non renseigné</span>}</Ligne>
                  <Ligne libelle="E-mail" tronque infobulle={p.email ?? undefined}>{p.email ?? <span className="loc-muet">non renseigné</span>}</Ligne>
                  {/* Arno (21/10/2026) : UN BIEN PAR LIGNE — jamais deux sur la même ligne, plus de « · » ; une adresse longue peut
                      passer sur deux lignes, le bien suivant recommence à la ligne ; « Biens » en face du premier. */}
                  <Ligne libelle="Biens" enHaut={p.biens.length > 0}>{p.biens.length === 0 ? <span className="loc-muet">aucun</span> : (
                    <ul className="loc-biens-carte" data-biens-proprietaire>{p.biens.map((b, i) => <li key={`${i}-${b}`}>{b}</li>)}</ul>
                  )}</Ligne>
                </div>
                <a className="loc-carte-lien" href={`/admin/location/proprietaire/${p.id}`} target="_blank" rel="noopener noreferrer">Modifier dans la fiche ↗</a>
              </article>
            ))}
          </div>
        </div>
      )}
      {contacts.length + saisis.length > 0 && (
        <div className="loc-cartes-groupe" data-contacts-proprietaire>
          <h4>Contacts ({contacts.length + saisis.length})</h4>
          <div className="loc-cartes-lues">
            {contacts.map((c) => (
              <article key={c.id} className="cp-carte cp-carte--contact loc-carte-lue" data-carte-contact-existant={c.id}>
                <header className="cp-tete">
                  <div className="cp-tete-mots"><p className="cp-nom">{c.nom}</p><p className="cp-tete-caps"><BadgeCarte cote="proprietaire" sorte="contact" /></p></div>
                  {croix(c.nom, () => onRetirerContact(c.id))}
                </header>
                <div className="cp-lignes">
                  <Ligne libelle="Qualité">{c.qualite ?? <span className="loc-muet">non renseignée</span>}</Ligne>
                  <Ligne libelle="Téléphone">{c.telephone ?? <span className="loc-muet">non renseigné</span>}</Ligne>
                  <Ligne libelle="E-mail" tronque infobulle={c.email}>{c.email}</Ligne>
                </div>
                <a className="loc-carte-lien" href={`/admin/location/bien/${c.lotId}`} target="_blank" rel="noopener noreferrer">Modifier dans la fiche ↗</a>
              </article>
            ))}
            {saisis.map((c, i) => {
              const nom = [(c.nom ?? '').toUpperCase(), c.prenom].filter((x) => x).join(' ');
              const tel = (c.coordonnees ?? []).find((k) => k.sorte === 'telephone')?.valeur ?? null;
              const mel = (c.coordonnees ?? []).find((k) => k.sorte === 'email')?.valeur ?? null;
              return (
                <article key={`${nom}-${i}`} className="cp-carte cp-carte--contact loc-carte-lue" data-carte-contact-saisi={i}>
                  <header className="cp-tete">
                    <div className="cp-tete-mots"><p className="cp-nom">{nom}</p><p className="cp-tete-caps"><BadgeCarte cote="proprietaire" sorte="contact" /></p></div>
                    {croix(nom, () => onRetirerSaisi(i))}
                  </header>
                  <div className="cp-lignes">
                    <Ligne libelle="Qualité">{c.qualite ?? <span className="loc-muet">non renseignée</span>}</Ligne>
                    <Ligne libelle="Téléphone">{tel ?? <span className="loc-muet">non renseigné</span>}</Ligne>
                    <Ligne libelle="E-mail" tronque infobulle={mel ?? undefined}>{mel ?? <span className="loc-muet">non renseigné</span>}</Ligne>
                  </div>
                  <p className="loc-muet loc-carte-lien">Nouveau contact : enregistré avec le bien.</p>
                </article>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

export const CSS_RATTACHEMENT = `
/* Les biens d'un propriétaire dans sa carte : un par ligne, un léger espacement entre deux (Arno, 21/10/2026). */
.loc-biens-carte{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:.4rem;flex:1 1 100%;min-width:0}
.loc-biens-carte>li{margin:0;padding:0;line-height:1.35}
.loc-qui{border:2px solid var(--color-svv-line-strong);border-radius:18px;padding:16px 18px;background:var(--color-svv-surface);display:flex;flex-direction:column;gap:14px}
.loc-qui-titre{margin:0;font-size:1.1rem;font-weight:800;color:var(--color-svv-ink)}
.loc-qui-groupe{display:flex;flex-direction:column;gap:8px}
.loc-qui-groupe-titre{margin:0;display:flex;align-items:center;gap:8px;flex-wrap:wrap;font-weight:700;color:var(--color-svv-ink)}
.loc-qui-liste{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:8px}
.loc-qui-ligne{display:flex;gap:12px;align-items:flex-start;border:1px solid var(--color-svv-line);border-radius:12px;padding:10px 12px;background:var(--color-svv-field);cursor:pointer;color:var(--color-svv-ink)}
.loc-qui-ligne input{width:22px;height:22px;margin-top:1px;flex:0 0 auto;accent-color:var(--color-svv-red)}
.loc-qui-ligne--deja{cursor:default}
.loc-qui-mots{display:flex;flex-direction:column;gap:2px;min-width:0;overflow-wrap:anywhere}
.loc-qui-nom{display:block}
.loc-qui-cherche{font-weight:600;color:var(--color-svv-muted)}
.loc-qui-boutons{justify-content:flex-end}
.loc-cartes-bloc{display:flex;flex-direction:column;gap:14px}
.loc-cartes-groupe h4{margin:0 0 8px;font-size:.98rem;color:var(--color-svv-ink)}
.loc-cartes-lues{display:flex;flex-wrap:wrap;gap:12px}
.loc-carte-lue{width:min(24rem,100%)}
.loc-carte-lien{align-self:flex-start;margin:2px 0 0;font-size:.86rem;font-weight:700;color:var(--color-svv-ink)}
`;
