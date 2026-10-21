'use client';

import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { FORMAT_ADRESSE, htmlNouvelleLocation, verifierDestinataires, type DestinatairePropose, type DonneesNouvelleLocation } from '../../../../lib/location/mailNouvelleLocation';

/**
 * ══ 🔴🔴 LOCATION — LE BOUTON « ENVOI ADHOC & MONGA » ET SA FENÊTRE DE CONFIRMATION (Arno, 21/10/2026) ══════════════════════
 * Après « Enregistrer » dans « Nouveau locataire », et sur la fiche locataire (bail en cours) : un GROS bouton bordeaux, pleine
 * largeur au téléphone. Après un envoi, il devient « Renvoyer à ADHOC & MONGA », avec « Envoyé le … à … par … à … ».
 * Au clic, AVANT tout envoi, la fenêtre de confirmation : l'aperçu du mail et la liste des destinataires — EN TÊTE la personne
 * connectée (« Vous (…) · copie personnelle »), puis la liste configurée. Chaque ligne se modifie (adresse, libellé) et se
 * supprime, copie personnelle comprise ; « + Ajouter un destinataire ». Ces changements ne valent QUE pour cet envoi.
 * 🔴 RIEN NE PART SANS « Envoyer » : l'ouverture ne fait qu'une lecture (GET). Échec : « Envoi impossible » + la raison +
 *    « Réessayer ». Réussite : « Mail envoyé à N destinataires ».
 */

const API = '/api/admin/location/nouvelle-location';

/** Le signal d'un envoi réussi (l'Historique du bien se relit) : `detail` = l'identifiant du bail. */
export const EVENEMENT_ENVOI_LOCATION = 'svav:envoi-nouvelle-location';

export interface EnvoiLu { quand: string; par: string; destinataires: string[]; objet: string; mention: string }
interface Apercu {
  bailId: number; objet: string; html: string; texte: string; expediteur: string;
  destinataires: DestinatairePropose[]; dernierEnvoi: EnvoiLu | null; envoiPossible: boolean;
  /** Les données du mail et le nom de la personne connectée : l'aperçu se refait en direct avec le message d'accompagnement. */
  donnees?: DonneesNouvelleLocation; auteurNom?: string;
}
type Ligne = DestinatairePropose & { cle: number };

let compteur = 0;
const avecCle = (l: readonly DestinatairePropose[]): Ligne[] => l.map((d) => ({ ...d, cle: ++compteur }));

/** Le message d'une ligne (format, doublon), ou `null`. PUR. */
export function erreurLigne(l: readonly { adresse: string }[], i: number): string | null {
  const a = l[i].adresse.trim();
  if (a === '') return 'Adresse e-mail à renseigner.';
  if (!FORMAT_ADRESSE.test(a)) return 'Ce n’est pas une adresse e-mail valide.';
  if (l.findIndex((x) => x.adresse.trim().toLowerCase() === a.toLowerCase()) !== i) return 'Cette adresse figure déjà dans la liste.';
  return null;
}

/** La date d'un envoi pour l'info-bulle du bouton discret (« Envoyé le 21/10/2026 à 14:32 par … »). PUR. */
export function infoBulleEnvoi(e: EnvoiLu | null): string | undefined {
  return e === null ? undefined : e.mention;
}

export function EnvoiAdhocMonga({ bailId, dernierEnvoi = null, ouvrirAuMontage = false, variante = 'gros' }: {
  bailId: number; dernierEnvoi?: EnvoiLu | null;
  /** Arno (21/10/2026) — « Enregistrer et envoyer à ADHOC & MONGA » : la fenêtre s'ouvre d'elle-même, une fois, au montage. */
  ouvrirAuMontage?: boolean;
  /**
   * Arno (21/10/2026) — `discret` : le petit bouton des cartes de bien et de la fiche du bien (« Envoyer à ADHOC & MONGA », ou
   * « Renvoyer… » avec la date de l'envoi en info-bulle). La fenêtre est la même.
   */
  variante?: 'gros' | 'discret';
}) {
  const [ouvert, setOuvert] = useState(false);
  const [apercu, setApercu] = useState<Apercu | null>(null);
  const [lecture, setLecture] = useState<string | null>(null);
  const [lignes, setLignes] = useState<Ligne[]>([]);
  const [envoi, setEnvoi] = useState<'repos' | 'envoi' | 'echec'>('repos');
  const [motif, setMotif] = useState<string | null>(null);
  const [succes, setSucces] = useState<string | null>(null);
  const [dernier, setDernier] = useState<EnvoiLu | null>(dernierEnvoi);
  /** Arno (21/10/2026) — le message d'accompagnement (facultatif, sans limite) : repris dans le mail et dans le journal. */
  const [message, setMessage] = useState('');
  const zoneMessage = useRef<HTMLTextAreaElement | null>(null);
  // La zone s'agrandit avec le texte (jamais de barre de défilement interne).
  useEffect(() => {
    const z = zoneMessage.current;
    if (z === null) return;
    z.style.height = 'auto';
    z.style.height = `${z.scrollHeight + 2}px`;
  }, [message, apercu]);
  const titre = useId();
  const premier = useRef<HTMLButtonElement | null>(null);
  useEffect(() => { setDernier(dernierEnvoi); }, [dernierEnvoi]);

  const ouvrir = useCallback(async (): Promise<void> => {
    setOuvert(true); setApercu(null); setLecture(null); setEnvoi('repos'); setMotif(null); setSucces(null); setMessage('');
    try {
      const r = await fetch(`${API}?bail=${bailId}`, { headers: { Accept: 'application/json' } });
      const d = await r.json() as { etat?: string; data?: Apercu; message?: string; motif?: string };
      if (d.etat !== 'ok' || d.data === undefined) { setLecture(d.etat === 'inconnu' ? 'Ce bail n’existe plus.' : d.message ?? d.motif ?? 'Lecture impossible.'); return; }
      setApercu(d.data);
      setLignes(avecCle(d.data.destinataires));
      if (d.data.dernierEnvoi !== null) setDernier(d.data.dernierEnvoi);
    } catch {
      setLecture('Lecture impossible : le serveur n’a pas répondu.');
    }
  }, [bailId]);
  // « Enregistrer et envoyer » : la fenêtre s'ouvre d'elle-même, UNE fois (jamais un envoi : seul « Envoyer » envoie).
  const dejaOuvert = useRef(false);
  useEffect(() => {
    if (!ouvrirAuMontage || dejaOuvert.current) return;
    dejaOuvert.current = true;
    void ouvrir();
  }, [ouvrirAuMontage, ouvrir]);
  const fermer = useCallback(() => { if (envoi !== 'envoi') setOuvert(false); }, [envoi]);
  useEffect(() => {
    if (!ouvert) return;
    const clavier = (e: KeyboardEvent): void => { if (e.key === 'Escape') fermer(); };
    window.addEventListener('keydown', clavier);
    return () => window.removeEventListener('keydown', clavier);
  }, [ouvert, fermer]);
  // Le focus va sur « Fermer », jamais sur « Envoyer » : une touche Entrée ne doit rien faire partir.
  useEffect(() => { if (ouvert) premier.current?.focus(); }, [ouvert]);

  const erreurs = lignes.map((_, i) => erreurLigne(lignes, i));
  const valide = lignes.length > 0 && erreurs.every((e) => e === null);
  const changer = (cle: number, champ: 'adresse' | 'libelle', v: string): void => {
    setLignes((l) => l.map((x) => (x.cle === cle ? { ...x, [champ]: v } : x))); setMotif(null);
  };

  const envoyer = async (): Promise<void> => {
    const v = verifierDestinataires(lignes.map((l) => ({ adresse: l.adresse, libelle: l.libelle })));
    if (!v.ok) { setMotif(v.motif); return; }
    setEnvoi('envoi'); setMotif(null);
    try {
      const r = await fetch(API, { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bailId, destinataires: v.liste, ...(message.trim() === '' ? {} : { message }) }) });
      const d = await r.json() as { etat?: string; motif?: string; data?: { n: number; envoi: EnvoiLu } };
      if (d.etat === 'ok' && d.data !== undefined) {
        setDernier(d.data.envoi);
        if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent(EVENEMENT_ENVOI_LOCATION, { detail: bailId }));
        setSucces(`Mail envoyé à ${d.data.n} destinataire${d.data.n > 1 ? 's' : ''}.`);
        setEnvoi('repos'); setOuvert(false);
        return;
      }
      setEnvoi('echec');
      setMotif(d.etat === 'sans_schema' ? 'la mise à jour de la base (migration 395) n’est pas appliquée : le journal des envois manque.'
        : d.etat === 'inconnu' ? 'ce bail n’existe plus.' : d.motif ?? 'raison inconnue.');
    } catch {
      setEnvoi('echec'); setMotif('le serveur n’a pas répondu.');
    }
  };

  return (
    <div className={variante === 'discret' ? 'eam eam--discret' : 'eam'} data-envoi-adhoc={bailId} data-variante={variante}>
      <style>{CSS_ENVOI}</style>
      {variante === 'discret' ? (
        <>
          <button type="button" className="eam-discret" onClick={() => { void ouvrir(); }} title={infoBulleEnvoi(dernier)} data-ouvrir-envoi>
            {dernier === null ? 'Envoyer à ADHOC & MONGA' : 'Renvoyer à ADHOC & MONGA'}
          </button>
          {/* La réussite est dite au lecteur d'écran ; à l'œil, le bouton devient « Renvoyer… » (date en info-bulle). */}
          {succes !== null && <span className="eam-invisible" role="status" data-envoi-ok>{succes}</span>}
        </>
      ) : (
        <>
          <button type="button" className="eam-gros" onClick={() => { void ouvrir(); }} data-ouvrir-envoi>
            {dernier === null ? 'Envoi ADHOC & MONGA' : 'Renvoyer à ADHOC & MONGA'}
          </button>
          {succes !== null && <p className="eam-ok" role="status" data-envoi-ok>{succes}</p>}
          {dernier !== null && <p className="eam-mention" data-mention-envoi>{dernier.mention}</p>}
        </>
      )}

      {ouvert && (() => { const fenetre = (
        <div className="eam-voile" onMouseDown={(e) => { if (e.target === e.currentTarget) fermer(); }}>
          <div className="eam-fenetre" role="dialog" aria-modal="true" aria-labelledby={titre} data-fenetre-envoi>
            <header className="eam-tete">
              <h2 id={titre}>Envoi ADHOC &amp; MONGA</h2>
              <button ref={premier} type="button" className="eam-x" aria-label="Fermer" onClick={fermer}>×</button>
            </header>
            <div className="eam-corps">
              {apercu === null ? <p className="eam-muet" role="status">{lecture ?? 'Préparation du mail…'}</p> : (
                <>
                  {!apercu.envoiPossible && (
                    <p className="eam-alerte" role="status" data-envoi-sans-migration>Mise à jour de la base à appliquer (migration 395) : l’aperçu se lit,
                      mais l’envoi reste indisponible tant que le journal des envois n’existe pas.</p>
                  )}
                  <dl className="eam-entete">
                    <dt>De</dt><dd>{apercu.expediteur}</dd>
                    <dt>Objet</dt><dd data-objet-mail>{apercu.objet}</dd>
                  </dl>
                  <label className="eam-message" data-message-accompagnement>
                    <span>Message d’accompagnement <span className="eam-muet">(facultatif)</span></span>
                    <textarea ref={zoneMessage} rows={3} value={message} onChange={(e) => { setMessage(e.target.value); setMotif(null); }}
                      placeholder="ex. Bonjour Laura, le bail démarre le 1er novembre — ce message apparaît dans le mail, juste après l’introduction." data-message />
                  </label>
                  <section aria-label="Destinataires" className="eam-dest" data-destinataires>
                    <h3>Destinataires <span className="eam-muet">({lignes.length})</span></h3>
                    <p className="eam-muet eam-petit">Les changements ne valent que pour cet envoi : la liste par défaut ne change pas.</p>
                    <ol>
                      {lignes.map((l, i) => (
                        <li key={l.cle} data-ligne-destinataire={i} data-personnelle={l.personnelle === true ? 'oui' : undefined}>
                          <label className="eam-champ"><span>Adresse e-mail</span>
                            <input type="email" value={l.adresse} onChange={(e) => changer(l.cle, 'adresse', e.target.value)} aria-invalid={erreurs[i] !== null} data-adresse /></label>
                          <label className="eam-champ"><span>Libellé</span>
                            <input value={l.libelle} onChange={(e) => changer(l.cle, 'libelle', e.target.value)} data-libelle /></label>
                          <button type="button" className="eam-suppr" aria-label={`Retirer ${l.adresse || 'cette ligne'}`}
                            onClick={() => { setLignes((x) => x.filter((y) => y.cle !== l.cle)); setMotif(null); }} data-retirer>×</button>
                          {erreurs[i] !== null && <p className="eam-erreur" role="alert">{erreurs[i]}</p>}
                        </li>
                      ))}
                    </ol>
                    {lignes.length === 0 && <p className="eam-erreur" role="alert">Ajoutez au moins un destinataire.</p>}
                    <button type="button" className="svv-btn svv-btn-outline gst-btn eam-ajout" onClick={() => { setLignes((x) => [...x, ...avecCle([{ adresse: '', libelle: '' }])]); setMotif(null); }}
                      data-ajouter-destinataire>+ Ajouter un destinataire</button>
                  </section>
                  <section aria-label="Aperçu du mail" className="eam-apercu">
                    <h3>Aperçu du mail</h3>
                    <iframe title="Aperçu du mail Nouvelle location" sandbox="" data-apercu-mail
                      srcDoc={apercu.donnees === undefined || message.trim() === '' ? apercu.html
                        : htmlNouvelleLocation({ ...apercu.donnees, message: { auteur: apercu.auteurNom ?? '', texte: message } })} />
                  </section>
                </>
              )}
            </div>
            <footer className="eam-pied">
              {envoi === 'echec' && motif !== null && <p className="eam-erreur eam-echec" role="alert" data-envoi-echec><strong>Envoi impossible</strong> : {motif}</p>}
              {envoi !== 'echec' && motif !== null && <p className="eam-erreur" role="alert">{motif}</p>}
              <div className="eam-boutons">
                <button type="button" className="svv-btn svv-btn-outline gst-btn" onClick={fermer} disabled={envoi === 'envoi'} data-annuler-envoi>Annuler</button>
                <button type="button" className="eam-envoyer" onClick={() => { void envoyer(); }}
                  disabled={apercu === null || !apercu.envoiPossible || !valide || envoi === 'envoi'} data-envoyer>
                  {envoi === 'envoi' ? 'Envoi…' : envoi === 'echec' ? 'Réessayer' : 'Envoyer'}</button>
              </div>
            </footer>
          </div>
        </div>
      );
      // La variante discrète vit dans une carte qui se soulève au survol (transform) et rogne ce qui dépasse : la fenêtre est
      // rendue dans `.svv-adm-root` (porteur des jetons du thème), sinon elle serait coupée. La variante d'origine reste à sa place.
      return variante === 'discret' && typeof document !== 'undefined' ? createPortal(fenetre, document.querySelector('.svv-adm-root') ?? document.body) : fenetre; })()}
    </div>
  );
}

/**
 * La FICHE LOCATAIRE : le même bouton pour chaque bail EN COURS du locataire (du plus récent au plus ancien). Rien s'il n'a pas
 * de bail en cours. La lecture passe par la même route (droit « Location »).
 */
export function BlocEnvoiFicheLocataire({ locataireId }: { locataireId: number }) {
  const [baux, setBaux] = useState<{ bailId: number; titre: string; entree: string | null; dernierEnvoi: EnvoiLu | null }[] | null>(null);
  useEffect(() => {
    let vivant = true;
    fetch(`${API}?locataire=${locataireId}`, { headers: { Accept: 'application/json' } })
      .then((r) => r.json())
      .then((d: { etat?: string; data?: unknown }) => { if (vivant) setBaux(d.etat === 'ok' && Array.isArray(d.data) ? d.data as never : []); })
      .catch(() => { if (vivant) setBaux([]); });
    return () => { vivant = false; };
  }, [locataireId]);
  if (baux === null || baux.length === 0) return null;
  return (
    <section className="svv-card eam-fiche" aria-label="Envoi ADHOC & MONGA" data-envoi-fiche-locataire>
      {baux.map((b) => (
        <div key={b.bailId} className="eam-fiche-bail" data-bail-en-cours={b.bailId}>
          <p className="eam-fiche-titre"><strong>Bail en cours</strong> · {b.titre}{b.entree ? ` · entrée le ${b.entree.split('-').reverse().join('/')}` : ''}</p>
          <EnvoiAdhocMonga bailId={b.bailId} dernierEnvoi={b.dernierEnvoi} />
        </div>
      ))}
    </section>
  );
}

/** Le bail en cours d'un bien (route `?lots=`), avec son dernier envoi. */
export interface BailEnCoursDuBien { bailId: number; entree: string | null; dernierEnvoi: EnvoiLu | null }

/**
 * Arno (21/10/2026) — LE BAIL EN COURS DE CHAQUE BIEN (une seule lecture pour toute la liste) : la carte du bien (fiche
 * propriétaire de la Gestion) et la fiche du bien n'affichent le bouton discret que s'il y en a un. Une lecture refusée (compte
 * sans le droit « Location ») ou en échec : aucun bouton, rien d'autre ne change.
 */
export function useBauxEnCoursDesBiens(lotIds: readonly number[]): Record<string, BailEnCoursDuBien> {
  const cle = [...new Set(lotIds.filter((x) => Number.isSafeInteger(x) && x > 0))].sort((a, b) => a - b).join(',');
  const [baux, setBaux] = useState<Record<string, BailEnCoursDuBien>>({});
  useEffect(() => {
    if (cle === '') { setBaux({}); return; }
    let vivant = true;
    fetch(`${API}?lots=${cle}`, { headers: { Accept: 'application/json' } })
      .then((r) => r.json())
      .then((d: { etat?: string; data?: unknown }) => {
        if (vivant) setBaux(d.etat === 'ok' && d.data !== null && typeof d.data === 'object' && !Array.isArray(d.data) ? d.data as Record<string, BailEnCoursDuBien> : {});
      })
      .catch(() => { if (vivant) setBaux({}); });
    return () => { vivant = false; };
  }, [cle]);
  return baux;
}

/** Jetons du thème ; bordeaux = la couleur de marque (`--color-svv-red`) ; cibles ≥ 44 px ; plein écran au téléphone. */
export const CSS_ENVOI = `
.eam{display:flex;flex-direction:column;gap:6px;min-width:0}
.eam-gros{appearance:none;border:0;border-radius:14px;background:var(--color-svv-red);color:var(--color-svv-blanc);font:inherit;font-weight:800;font-size:1.05rem;letter-spacing:.01em;padding:14px 22px;min-height:52px;cursor:pointer;box-shadow:0 6px 16px -6px color-mix(in srgb, var(--color-svv-red) 55%, transparent);align-self:flex-start}
.eam-gros:hover{background:var(--color-svv-red-dark)}
/* Le bouton DISCRET (cartes de bien, fiche du bien — Arno, 21/10/2026) : un lien-bouton petit, souligné, cible ≥ 44 px. */
.eam--discret{display:inline-flex;flex-direction:row;align-items:center;gap:0;min-width:0}
.eam-discret{appearance:none;border:0;background:none;padding:0 2px;min-height:44px;font:inherit;font-size:.74rem;font-weight:700;color:var(--color-svv-ink);text-decoration:underline;text-underline-offset:2px;cursor:pointer;text-align:left;overflow-wrap:anywhere}
.eam-discret:hover{color:var(--color-svv-red)}
.eam-discret:focus-visible{outline:3px solid var(--color-svv-line-strong-hover);outline-offset:2px;border-radius:4px}
.eam-invisible{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}
.eam-gros:focus-visible,.eam-envoyer:focus-visible{outline:3px solid var(--color-svv-line-strong-hover);outline-offset:2px}
.eam-fiche{display:flex;flex-direction:column;gap:14px;margin-bottom:14px}
.eam-fiche-bail + .eam-fiche-bail{border-top:1px solid var(--color-svv-line);padding-top:14px}
.eam-fiche-titre{margin:0 0 8px;overflow-wrap:anywhere}
.eam-ok{margin:0;font-weight:700;color:var(--color-svv-green-ink)}
.eam-mention{margin:0;font-size:.88rem;color:var(--color-svv-muted);overflow-wrap:anywhere}
.eam-voile{position:fixed;inset:0;z-index:80;background:color-mix(in srgb, var(--color-svv-ink) 45%, transparent);display:flex;align-items:center;justify-content:center;padding:24px}
.eam-fenetre{background:var(--color-svv-surface);color:var(--color-svv-ink);border-radius:18px;width:min(820px,100%);max-height:calc(100vh - 48px);display:flex;flex-direction:column;box-shadow:0 30px 60px -20px color-mix(in srgb, var(--color-svv-ink) 45%, transparent);overflow:hidden}
.eam-tete{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:16px 20px;border-bottom:1px solid var(--color-svv-line)}
.eam-tete h2{margin:0;font-size:1.2rem}
.eam-x{width:44px;height:44px;border:0;border-radius:999px;background:var(--color-svv-field);color:var(--color-svv-ink);font-size:1.4rem;cursor:pointer}
.eam-corps{padding:16px 20px;overflow-y:auto;display:flex;flex-direction:column;gap:16px;min-height:0}
.eam-muet{color:var(--color-svv-muted)}
.eam-petit{margin:0;font-size:.85rem}
.eam-alerte{margin:0;padding:10px 12px;border-radius:10px;background:var(--color-svv-amber-soft);color:var(--color-svv-amber);border:1px solid var(--color-svv-amber)}
.eam-entete{display:grid;grid-template-columns:4.5rem 1fr;gap:4px 10px;margin:0}
.eam-entete dt{font-weight:800;color:var(--color-svv-muted)}
.eam-entete dd{margin:0;overflow-wrap:anywhere}
.eam-message{display:flex;flex-direction:column;gap:6px;font-weight:700}
.eam-message textarea{min-height:88px;resize:none;overflow:hidden;box-sizing:border-box;border:1px solid var(--color-svv-line-strong);border-radius:10px;padding:10px 12px;font:inherit;font-weight:400;font-size:.95rem;line-height:1.45;color:var(--color-svv-ink);background:var(--color-svv-surface);white-space:pre-wrap}
.eam-dest h3,.eam-apercu h3{margin:0 0 6px;font-size:1rem}
.eam-dest ol{list-style:none;margin:8px 0;padding:0;display:flex;flex-direction:column;gap:8px}
.eam-dest li{display:grid;grid-template-columns:minmax(0,1.3fr) minmax(0,1fr) 44px;gap:8px;align-items:end;padding:10px;border:1px solid var(--color-svv-line);border-radius:12px}
.eam-dest li[data-personnelle]{border-color:var(--color-svv-line-strong);background:var(--color-svv-field)}
.eam-champ{display:flex;flex-direction:column;gap:4px;min-width:0;font-size:.8rem;font-weight:700;color:var(--color-svv-muted)}
.eam-champ input{min-height:44px;border:1px solid var(--color-svv-line-strong);border-radius:10px;padding:0 10px;font:inherit;font-size:.95rem;color:var(--color-svv-ink);background:var(--color-svv-surface);min-width:0}
.eam-champ input[aria-invalid="true"]{border-color:var(--color-svv-red)}
.eam-suppr{width:44px;height:44px;border:1px solid var(--color-svv-line-strong);border-radius:10px;background:var(--color-svv-surface);color:var(--color-svv-ink);font-size:1.3rem;cursor:pointer}
.eam-erreur{grid-column:1 / -1;margin:0;color:var(--color-svv-red);font-weight:700;font-size:.88rem}
.eam-ajout{min-height:44px}
.eam-apercu iframe{display:block;width:100%;height:560px;border:1px solid var(--color-svv-line);border-radius:12px;background:var(--color-svv-field)}
.eam-pied{border-top:1px solid var(--color-svv-line);padding:12px 20px;display:flex;flex-direction:column;gap:8px}
.eam-echec{font-size:.95rem}
.eam-boutons{display:flex;justify-content:flex-end;gap:10px;flex-wrap:wrap}
.eam-boutons .gst-btn,.eam-boutons button{min-height:44px;width:auto;flex:0 0 auto}
.eam-ajout{width:auto !important}
.eam-envoyer{appearance:none;border:0;border-radius:12px;background:var(--color-svv-red);color:var(--color-svv-blanc);font:inherit;font-weight:800;padding:0 24px;min-height:44px;cursor:pointer}
.eam-envoyer:disabled{opacity:.5;cursor:not-allowed}
@media (max-width:640px){
  .eam-gros{align-self:stretch;width:100%}
  .eam-discret{width:auto}
  .eam-voile{padding:0;align-items:stretch}
  .eam-fenetre{width:100%;max-height:none;height:100%;border-radius:0}
  .eam-dest li{grid-template-columns:minmax(0,1fr) 44px}
  .eam-dest li .eam-champ:nth-of-type(2){grid-column:1 / 2}
  .eam-dest li .eam-suppr{grid-row:1;grid-column:2}
  .eam-apercu iframe{height:480px}
}
`;
