'use client';

import { useEffect, useState, type CSSProperties } from 'react';
import { BoutonCopier } from './BoutonCopier';
import type { ChampCada } from '../../../../lib/veille/carteCadaChamps';

/**
 * CADA lot A — carte de COPIER-COLLER champ par champ pour le formulaire de saisine CADA. Ouverte à la demande (le fetch se fait
 * à l'ouverture) : les boutons repartent NON marqués, et un message d'en-tête rappelle les copies antérieures + si la saisine est
 * déposée (copier n'est pas déposer). Chaque copie réussie est tracée (best-effort). Un bouton réinitialise les marques.
 * ⚠️ Cette carte n'écrit JAMAIS que la saisine est déposée.
 */

interface MessageHistorique { present: boolean; entete: string; statutDepot: string }
interface CarteData {
  saisineId: number; reference: string; communeNom: string; champs: ChampCada[];
  urlFormulaire: string; cadaEmailVide: boolean; pdfUrl: string; message: MessageHistorique;
}

const styleLibelle: CSSProperties = { fontSize: 12, fontWeight: 700, color: 'var(--color-svv-ink)' };
const styleMuted: CSSProperties = { fontSize: 12, color: 'var(--color-svv-muted)' };
const styleValeur: CSSProperties = { whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontSize: 12.5, background: 'var(--color-svv-field)', padding: '.35rem .5rem', borderRadius: '.35rem' };

export function CarteCadaFormulaire({ saisineId }: { saisineId: number }) {
  const [ouvert, setOuvert] = useState(false);
  const [data, setData] = useState<CarteData | null>(null);
  const [erreur, setErreur] = useState('');
  const [rechargement, setRechargement] = useState(0);
  const [retour, setRetour] = useState('');

  useEffect(() => {
    if (!ouvert) return;
    let annule = false;
    void (async () => {
      setErreur('');
      try {
        const res = await fetch(`/api/admin/permis/saisines/carte?saisineId=${saisineId}`, { cache: 'no-store' });
        if (annule) return;
        if (res.ok) setData((await res.json()) as CarteData);
        else setErreur('Carte indisponible pour cette saisine.');
      } catch { if (!annule) setErreur('Carte indisponible pour cette saisine.'); }
    })();
    return () => { annule = true; };
  }, [ouvert, saisineId, rechargement]);

  // Trace best-effort d'une copie (jamais bloquante : la copie clipboard a déjà réussi côté client).
  const tracer = (champCle: string): void => {
    void fetch('/api/admin/permis/saisines/carte', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ saisineId, champCle }),
    }).catch(() => undefined);
  };

  async function reinitialiser(): Promise<void> {
    setRetour('');
    try {
      const res = await fetch('/api/admin/permis/saisines/carte', {
        method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ saisineId }),
      });
      if (res.ok) { setRetour('Marques de copie effacées pour cette saisine.'); setRechargement((v) => v + 1); }
      else setRetour('Réinitialisation impossible.');
    } catch { setRetour('Réinitialisation impossible.'); }
  }

  if (!ouvert) {
    return (
      <button type="button" className="svv-btn svv-btn-outline" style={{ padding: '.3rem .7rem' }} onClick={() => setOuvert(true)}>
        Préparer la saisie CADA (copier-coller)
      </button>
    );
  }

  return (
    <section aria-label="Carte de copier-coller pour le formulaire CADA" style={{ border: '1px solid var(--color-svv-line)', borderRadius: '.5rem', padding: '.6rem', display: 'flex', flexDirection: 'column', gap: '.5rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '.5rem', flexWrap: 'wrap' }}>
        <strong style={{ fontSize: 13 }}>Formulaire CADA — un bouton par champ</strong>
        <button type="button" className="svv-btn svv-btn-outline" style={{ padding: '.2rem .6rem', fontSize: 12 }} onClick={() => setOuvert(false)}>Fermer</button>
      </div>

      {erreur && <p role="status" style={{ ...styleMuted, color: 'var(--color-svv-red)' }}>{erreur}</p>}

      {data && (
        <>
          {/* Message d'en-tête : copies antérieures + état déposée/non déposée (copier n'est pas déposer). */}
          {data.message.present && (
            <div role="note" style={{ fontSize: 12, background: 'var(--color-svv-field)', padding: '.4rem .5rem', borderRadius: '.4rem', lineHeight: 1.4 }}>
              <div>{data.message.entete}</div>
              <div style={{ marginTop: '.2rem', fontWeight: 600 }}>{data.message.statutDepot}</div>
            </div>
          )}

          {/* Un champ = une ligne : libellé, valeur (ou « à saisir à la main »), bouton Copier. */}
          <ol style={{ listStyle: 'decimal inside', display: 'flex', flexDirection: 'column', gap: '.45rem', margin: 0, padding: 0 }}>
            {data.champs.map((c) => (
              <li key={c.cle} style={{ display: 'flex', flexDirection: 'column', gap: '.2rem' }}>
                <span style={styleLibelle}>{c.libelle}</span>
                {c.disponible
                  ? <span style={styleValeur}>{c.valeur}</span>
                  : <span style={{ ...styleMuted, fontStyle: 'italic' }}>Donnée absente — à saisir à la main sur le formulaire.</span>}
                <BoutonCopier valeur={c.valeur} libelle="Copier ce champ" disabled={!c.disponible} onCopie={() => tracer(c.cle)} />
              </li>
            ))}
          </ol>

          {/* Pièce jointe obligatoire + rappel des cases + lien du formulaire. */}
          <div style={{ borderTop: '1px solid var(--color-svv-line)', paddingTop: '.5rem', display: 'flex', flexDirection: 'column', gap: '.4rem' }}>
            <div style={{ display: 'flex', gap: '.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
              <span style={styleLibelle}>Fichier joint obligatoire</span>
              <a className="svv-btn svv-btn-primary" style={{ padding: '.3rem .7rem', textDecoration: 'none' }} href={data.pdfUrl} target="_blank" rel="noopener noreferrer">Télécharger la copie de la demande (PDF)</a>
            </div>
            <p role="note" style={{ ...styleMuted, margin: 0, lineHeight: 1.4 }}>
              Sur le formulaire, cochez la case <strong>« lettre de demande »</strong> (c’est la pièce jointe ci-dessus). Ne cochez <strong>PAS</strong> « réponse de l’administration » : il n’y a pas eu de réponse.
            </p>
            <a href={data.urlFormulaire} target="_blank" rel="noopener noreferrer" style={{ fontSize: 13 }}>Ouvrir le formulaire de saisine CADA ↗</a>
          </div>

          {/* Réinitialisation des marques de CETTE saisine. */}
          <div style={{ display: 'flex', gap: '.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
            <button type="button" className="svv-btn svv-btn-outline" style={{ padding: '.25rem .6rem', fontSize: 12 }} onClick={() => void reinitialiser()}>Réinitialiser les marques</button>
            {retour && <span role="status" style={styleMuted}>{retour}</span>}
          </div>
        </>
      )}
    </section>
  );
}
