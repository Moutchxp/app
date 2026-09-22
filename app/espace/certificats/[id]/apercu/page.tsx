import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { internauteConnecteDepuisCookies } from '../../../../lib/internaute/gardeEspace';
import { resoudrePdfCertificat } from '../../../../lib/internaute/espace';
import { Bandeau } from '../../../Bandeau';
import ApercuDocument from '../../../ApercuDocument';
import { TITRE_ESPACE, TITRE_APERCU, estDocumentApercu } from '../../../presentation';

// Runtime Node (session + driver pg). JAMAIS de cache : l'écran dépend de la session et de l'état base.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Votre document — Sans Vis-à-Vis®',
  description: 'Aperçu d’un document de votre certificat — Sans Vis-à-Vis®.',
};

type Props = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ [cle: string]: string | string[] | undefined }>;
};

/** Premier passage d'un paramètre pouvant arriver en tableau (`?x=1&x=2`) — défensif, comme sur `/verifier`. */
function premier(v: string | string[] | undefined): string | null {
  return Array.isArray(v) ? (v[0] ?? null) : (v ?? null);
}

/**
 * ÉCRAN D'APERÇU d'un document de certificat — `/espace/certificats/[id]/apercu?doc=…&analyse=…`.
 *
 * Un ÉCRAN et non une surcouche : le bouton « Retour » de Safari et le balayage arrière fonctionnent comme
 * l'internaute s'y attend sur iPhone, et « Retour » ramène à la liste avec l'analyse d'où l'on vient DÉPLIÉE.
 *
 * GARDE, à l'identique de la livraison des octets (`api/internaute/espace/certificats/[id]/telecharger`) :
 *  1. session valide (`internauteConnecteDepuisCookies`) — sinon redirection vers la connexion, AUCUNE donnée lue ;
 *  2. propriété du certificat (`resoudrePdfCertificat`, MÊME gate unique, jointure `internaute_projet.internaute_id`)
 *     — un certificat qui n'est pas à lui donne le MÊME `notFound()` qu'un certificat inexistant (indistinguable).
 * La garde de la route de livraison reste en place et s'applique de nouveau à chaque octet servi : cet écran ne la
 * remplace pas, il évite seulement d'afficher un cadre vide à qui n'a rien à y voir.
 *
 * `analyse` ne sert QU'À rouvrir un accordéon dans la propre liste de l'internaute : valeur purement cosmétique,
 * validée en entier numérique, jamais utilisée pour lire quoi que ce soit.
 */
export default async function ApercuPage({ params, searchParams }: Props) {
  const internauteId = await internauteConnecteDepuisCookies();
  if (!internauteId) redirect('/espace/connexion');

  const { id } = await params;
  if (!/^\d+$/.test(id)) notFound();
  const certificatId = Number(id);

  const sp = await searchParams;
  const doc = premier(sp.doc);
  if (!estDocumentApercu(doc)) notFound(); // valeur non prévue → aucun écran, aucune lecture

  const analyseBrute = premier(sp.analyse);
  const analyseId = analyseBrute !== null && /^\d+$/.test(analyseBrute) ? Number(analyseBrute) : null;

  // ── MÊME gate de propriété que la livraison des octets ──
  let resolution;
  try {
    resolution = await resoudrePdfCertificat(internauteId, certificatId);
  } catch {
    notFound(); // indisponibilité base → écran neutre, jamais de détail technique
  }
  if (resolution.statut === 'introuvable') notFound(); // pas à lui / inexistant → indistinguable

  // Le nominatif n'existe qu'une fois déposé ; l'anonymisé et le visuel sont régénérés et restent disponibles.
  const disponible = doc !== 'nominatif' || resolution.statut === 'ok';

  return (
    <main className="mx-auto flex w-full max-w-[560px] flex-col">
      <Bandeau titre={TITRE_ESPACE} />
      <div className="flex flex-col gap-5 px-5 py-6">
        <h1 className="svv-verif-title text-lg font-extrabold text-svv-ink">{TITRE_APERCU[doc]}</h1>
        <ApercuDocument certificatId={certificatId} doc={doc} analyseId={analyseId} disponible={disponible} />
      </div>
    </main>
  );
}
