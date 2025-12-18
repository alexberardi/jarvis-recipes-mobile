import * as Crypto from 'expo-crypto';

const HTML_SNIPPET_CAP_BYTES = 300 * 1024;

export const extractJsonLdStrings = (html: string): string[] => {
  const regex = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  const blocks: string[] = [];
  let match;
  while ((match = regex.exec(html)) !== null) {
    if (match[1]) {
      const content = match[1].trim();
      if (content) blocks.push(content);
    }
  }
  return blocks;
};

export const capHtmlSnippet = (snippet: string | undefined | null): string | undefined => {
  if (!snippet) return undefined;
  const encoder = new TextEncoder();
  const bytes = encoder.encode(snippet);
  if (bytes.length <= HTML_SNIPPET_CAP_BYTES) return snippet;
  const trimmedBytes = bytes.slice(0, HTML_SNIPPET_CAP_BYTES);
  return new TextDecoder().decode(trimmedBytes);
};

export const computePayloadHash = async (jsonld: string[], htmlSnippet?: string) => {
  try {
    const encoder = new TextEncoder();
    const combined = jsonld.join('') + (htmlSnippet ?? '');
    const digest = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, combined);
    return digest;
  } catch {
    return undefined;
  }
};

export type ParsedExtraction = {
  jsonld: string[];
  htmlSnippet?: string;
  payloadHash?: string;
};

export const buildExtractionPayload = async (
  html: string,
  options: { fallbackHtml?: string },
): Promise<ParsedExtraction> => {
  const jsonld = extractJsonLdStrings(html);
  // Only include HTML snippet when JSON-LD is absent or clearly insufficient.
  const htmlSnippet = jsonld.length ? undefined : capHtmlSnippet(options.fallbackHtml ?? html);
  const payloadHash = await computePayloadHash(jsonld, htmlSnippet);
  return { jsonld, htmlSnippet, payloadHash };
};

