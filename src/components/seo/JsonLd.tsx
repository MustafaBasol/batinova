import { serializeJsonLd } from "@/lib/seo/jsonld";

/**
 * Server-rendered JSON-LD. Data comes from our own builders (never raw user HTML);
 * the serializer escapes `<`, `>`, `&` and line separators so content cannot break out of the script tag.
 */
export function JsonLd({ data }: { data: unknown }) {
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(data) }} />;
}
