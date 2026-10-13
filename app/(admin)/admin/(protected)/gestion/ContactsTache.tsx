'use client';

import { useState } from 'react';
import {
  chercherContacts, etatCopie, grouperParFamille, libelleCoordonnee, lienTelephone, MOT_FAMILLE,
  SEUIL_RECHERCHE_CONTACTS, type ContactSource, type ContactTache,
} from '../../../../lib/gestion/contactsTache';
import { tonDuGroupe } from '../../../../lib/gestion/historiqueBien';
import { horodatageLisible } from '../../../../lib/gestion/taches';

/**
 * ══ 🔴🔴 LOT TACHES-1-BIS — LES CONTACTS D'UNE TÂCHE, À L'ÉCRAN ═══════════════════════════════════════════════════
 *
 * DEUX COMPOSANTS :
 *   · `ChoixContacts` — dans la fenêtre, entre « Événement du bien lié » et « Rappels » : les contacts du bien
 *     regroupés par famille, une case par contact, AUCUN coché par défaut, une recherche au-delà de 8 ;
 *   · `ContactsAffiches` — dans le DÉTAIL d'une tâche : les contacts copiés, téléphones cliquables (tel:), e-mails
 *     qui ouvrent le composeur « Nouveau message » existant (adresse pré-remplie, RIEN n'est envoyé), et la mention
 *     discrète « Coordonnées modifiées depuis » avec « Mettre à jour ».
 *
 * 🔴 LES COULEURS SONT CELLES DU BLOC PARTIES, DEMANDÉES À `tonDuGroupe` (source unique) : ce fichier ne choisit
 * aucune couleur, il compose une classe de ton (rouge, vert, violet, rose, bleu, gris), et chaque ton lit le MÊME
 * jeton du thème que le liseré du bloc PARTIES.
 *
 * ⚠️ AUCUN IMPORT QUI TIRE `pg`.
 */

/** Un contact proposé à la case : la fiche d'aujourd'hui, ou la copie d'un contact qui n'est plus lié au bien. */
export interface ContactPropose extends ContactSource { plusLie?: boolean }

export function ChoixContacts({ proposes, choisis, onBasculer, desactive = false }: {
  proposes: readonly ContactPropose[];
  choisis: readonly string[];
  onBasculer: (cle: string) => void;
  desactive?: boolean;
}) {
  const [recherche, setRecherche] = useState('');
  const avecRecherche = proposes.length > SEUIL_RECHERCHE_CONTACTS;
  const visibles = avecRecherche ? chercherContacts(proposes, recherche) : [...proposes];
  return (
    <fieldset className="tchc" disabled={desactive}>
      <legend className="tch-etiquette">Contacts de la tâche</legend>
      {proposes.length === 0 && <p className="tchc-vide">Aucun contact n’est lié à la fiche de ce bien.</p>}
      {avecRecherche && (
        <input type="search" className="tchc-recherche" placeholder="Chercher un contact (nom, famille, téléphone…)"
          aria-label="Chercher un contact" value={recherche} onChange={(e) => setRecherche(e.target.value)} />
      )}
      {avecRecherche && visibles.length === 0 && <p className="tchc-vide">Aucun contact ne correspond.</p>}
      {grouperParFamille(visibles).map((g) => (
        <div key={g.famille} className={`tchc-groupe tchc-groupe--${tonDuGroupe(g.famille)}`} data-famille={g.famille}>
          <p className="tchc-famille">{MOT_FAMILLE[g.famille]}</p>
          {g.contacts.map((c) => (
            <label key={c.cle} className="tchc-case">
              <input type="checkbox" checked={choisis.includes(c.cle)} onChange={() => onBasculer(c.cle)} />
              <span className="tchc-nom">
                {c.nom}
                {c.qualite && <span className="tchc-qualite"> · {c.qualite}</span>}
                {c.plusLie && <span className="tchc-qualite"> · n’est plus lié à ce bien</span>}
              </span>
            </label>
          ))}
        </div>
      ))}
    </fieldset>
  );
}

export function ContactsAffiches({ contacts, sources, onEcrire, onMettreAJour, occupe = false }: {
  contacts: readonly ContactTache[];
  /** La fiche d'aujourd'hui ; `null` tant qu'elle n'est pas lue — aucune mention de changement n'est alors affichée. */
  sources: readonly ContactSource[] | null;
  onEcrire?: (email: string) => void;
  onMettreAJour?: (cle: string) => void;
  occupe?: boolean;
}) {
  if (contacts.length === 0) return null;
  return (
    <section className="tchc-affiches" aria-label="Contacts de la tâche">
      <h3 className="tch-etiquette">Contacts</h3>
      {grouperParFamille(contacts).map((g) => (
        <div key={g.famille} className={`tchc-groupe tchc-groupe--${tonDuGroupe(g.famille)}`}>
          {g.contacts.map((c) => {
            const etat = sources === null ? 'a_jour' : etatCopie(c, sources);
            return (
              <div key={c.cle} className="tchc-fiche" data-contact={c.cle} data-etat-copie={etat}>
                <p className="tchc-nom">
                  <b>{c.nom}</b> · {MOT_FAMILLE[c.famille]}{c.qualite ? ` · ${c.qualite}` : ''}
                </p>
                {c.organisation && <p className="tchc-ligne">Cabinet : {c.organisation}</p>}
                {c.coordonnees.map((k, i) => (
                  <p key={i} className="tchc-ligne">
                    <span className="tchc-libelle">{libelleCoordonnee(k)} : </span>
                    {k.sorte === 'telephone'
                      ? <a className="tchc-lien" href={lienTelephone(k.valeur)}>{k.affichage ?? k.valeur}</a>
                      : onEcrire
                        ? (
                          <button type="button" className="tchc-lien tchc-lien-bouton" onClick={() => onEcrire(k.valeur)}
                            title="Écrire un nouveau message à cette adresse (rien n’est envoyé sans vous)">
                            {k.valeur}
                          </button>
                        )
                        : <span>{k.valeur}</span>}
                  </p>
                ))}
                {c.adresse && <p className="tchc-ligne">Adresse : {c.adresse}</p>}
                <p className="tchc-copie">
                  Coordonnées copiées le {horodatageLisible(c.copieLe)}
                  {etat === 'plus_lie' && ' · n’est plus lié à ce bien (coordonnées conservées)'}
                </p>
                {etat === 'modifie' && (
                  <p className="tchc-modifie">
                    Coordonnées modifiées depuis
                    {onMettreAJour && (
                      <button type="button" className="svv-btn svv-btn-outline gst-btn tchc-maj" disabled={occupe}
                        onClick={() => onMettreAJour(c.cle)}>
                        Mettre à jour
                      </button>
                    )}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      ))}
    </section>
  );
}

/* ⚠️ CSS DANS UN GABARIT : jamais d'accent grave dans un commentaire ci-dessous.
   LES TONS : les MEMES jetons que le liseré des familles du bloc PARTIES (hdb-groupe--rouge, --vert, --violet,
   --rose, --bleu, --gris). Aucune couleur nouvelle. */
export const CSS_CONTACTS_TACHE = `
.tchc{display:flex;flex-direction:column;gap:6px;margin:0;padding:6px 8px;border:1px solid var(--color-svv-line);
  border-radius:.5rem;min-width:0}
.tchc-vide{margin:0;font-size:.84rem;color:var(--color-svv-muted)}
.tchc-recherche{min-height:40px;padding:0 .5rem;border:1px solid var(--color-svv-line-strong);border-radius:.4rem;
  background:var(--color-svv-field);color:var(--color-svv-ink);font:inherit}
.tchc-groupe{display:flex;flex-direction:column;gap:2px;padding:.25rem .4rem .3rem .55rem;border:1px solid var(--color-svv-line);
  border-left-width:4px;border-radius:.5rem;background:var(--color-svv-surface);min-width:0}
.tchc-groupe--rouge{border-left-color:var(--color-svv-red)}
.tchc-groupe--vert{border-left-color:var(--color-svv-green)}
.tchc-groupe--violet{border-left-color:var(--color-svv-violet)}
.tchc-groupe--violet .tchc-case input{accent-color:var(--color-svv-violet)}
.tchc-groupe--rose{border-left-color:var(--color-svv-syndic-bord)}
.tchc-groupe--rose .tchc-case input{accent-color:var(--color-svv-syndic-texte)}
.tchc-groupe--bleu{border-left-color:var(--color-svv-blue)}
.tchc-groupe--gris{border-left-color:var(--color-svv-line-strong)}
.tchc-famille{margin:0;font-size:.76rem;font-weight:700;color:var(--color-svv-muted);text-transform:uppercase;letter-spacing:.02em}
.tchc-case{display:flex;align-items:center;gap:.45rem;min-height:36px;font-size:.88rem;min-width:0}
.tchc-nom{min-width:0;overflow-wrap:anywhere;margin:0;font-size:.88rem;color:var(--color-svv-ink)}
.tchc-qualite{color:var(--color-svv-muted)}
.tchc-affiches{display:flex;flex-direction:column;gap:6px}
.tchc-fiche{display:flex;flex-direction:column;gap:1px;padding:.2rem 0}
.tchc-fiche + .tchc-fiche{border-top:1px dashed var(--color-svv-line)}
.tchc-ligne{margin:0;font-size:.85rem;color:var(--color-svv-ink);overflow-wrap:anywhere}
.tchc-libelle{color:var(--color-svv-muted)}
.tchc-lien{color:var(--color-svv-blue);text-decoration:underline}
.tchc-lien-bouton{background:none;border:0;padding:0;font:inherit;cursor:pointer;text-align:left;overflow-wrap:anywhere;
  min-height:28px}
.tchc-lien:focus-visible{outline:2px solid var(--color-svv-red);outline-offset:2px}
.tchc-copie{margin:2px 0 0;font-size:.76rem;color:var(--color-svv-muted)}
.tchc-modifie{display:flex;flex-wrap:wrap;align-items:center;gap:.5rem;margin:2px 0 0;font-size:.8rem;
  color:var(--color-svv-urgence-orange-texte)}
.tchc-maj{width:auto;min-height:36px;padding:0 .7rem;font-size:.8rem}
.tchc-apercu{margin:0;padding:6px 8px;border:1px dashed var(--color-svv-line-strong);border-radius:.4rem;
  background:var(--color-svv-field);color:var(--color-svv-ink);font:inherit;font-size:.82rem;white-space:pre-wrap;
  overflow-wrap:anywhere}
`;
