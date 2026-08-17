import { XMLParser } from 'fast-xml-parser';

interface PrcXmlElement {
  name: string;
  attributes: Record<string, string>;
  children: PrcXmlElement[];
  text: string;
}

type OrderedXmlNode = Record<string, unknown>;

const identityFieldPattern = /(?:^|_)(?:id|no)$/i;

const parser = new XMLParser({
  preserveOrder: true,
  ignoreAttributes: false,
  attributeNamePrefix: '',
  parseTagValue: false,
  trimValues: true,
});

function parseElements(nodes: unknown): PrcXmlElement[] {
  if (!Array.isArray(nodes)) return [];

  const elements: PrcXmlElement[] = [];

  for (const rawNode of nodes as OrderedXmlNode[]) {
    if (!rawNode || typeof rawNode !== 'object') continue;

    const name = Object.keys(rawNode).find(
      (key) => key !== ':@' && key !== '#text' && key !== '?xml',
    );
    if (!name) continue;

    const attributesValue = rawNode[':@'];
    const attributes: Record<string, string> = {};
    if (attributesValue && typeof attributesValue === 'object') {
      for (const [key, value] of Object.entries(attributesValue)) {
        attributes[key] = String(value);
      }
    }

    const content = rawNode[name];
    const children = parseElements(content);
    let text = '';

    if (Array.isArray(content)) {
      text = content
        .map((item) => {
          if (!item || typeof item !== 'object' || !('#text' in item)) {
            return '';
          }
          return String((item as OrderedXmlNode)['#text'] ?? '');
        })
        .join('')
        .trim();
    }

    elements.push({ name, attributes, children, text });
  }

  return elements;
}

function elementSegment(element: PrcXmlElement, fallbackIndex: number): string {
  if (element.attributes.hash) {
    return `${element.name}[hash=${element.attributes.hash}]`;
  }
  if (element.attributes.index !== undefined) {
    return `${element.name}[index=${element.attributes.index}]`;
  }
  return `${element.name}[${fallbackIndex}]`;
}

function getRecordIdentities(element: PrcXmlElement): string[] {
  if (element.name !== 'struct') return [];

  return element.children
    .filter(
      (child) =>
        child.children.length === 0 &&
        child.text !== '' &&
        Boolean(child.attributes.hash) &&
        identityFieldPattern.test(child.attributes.hash),
    )
    .map(
      (child) => `${child.attributes.hash}=${encodeURIComponent(child.text)}`,
    );
}

function collectClaims(
  element: PrcXmlElement,
  parentPaths: string[],
  fallbackIndex: number,
  claims: Map<string, string>,
) {
  if (element.children.length === 0) {
    const segment = elementSegment(element, fallbackIndex);
    for (const parentPath of parentPaths) {
      claims.set(`${parentPath}/${segment}`, element.text);
    }
    return;
  }

  const identities = getRecordIdentities(element);
  const paths = identities.length
    ? parentPaths.flatMap((parentPath) =>
        identities.map((identity) => `${parentPath}/struct[${identity}]`),
      )
    : parentPaths.map(
        (parentPath) =>
          `${parentPath}/${elementSegment(element, fallbackIndex)}`,
      );

  const occurrences = new Map<string, number>();
  for (const child of element.children) {
    const occurrence = occurrences.get(child.name) || 0;
    occurrences.set(child.name, occurrence + 1);
    collectClaims(child, paths, occurrence, claims);
  }
}

function createClaimMap(content: string): Map<string, string> | null {
  try {
    const roots = parseElements(parser.parse(content));
    if (roots.length === 0) return null;

    const claims = new Map<string, string>();
    roots.forEach((root, index) => collectClaims(root, [''], index, claims));
    return claims.size > 0 ? claims : null;
  } catch {
    return null;
  }
}

/**
 * PRCXML files are merge patches. They conflict only when both patches assign
 * different values to the same logical field. Positional struct indexes are
 * ignored when a database record exposes a stable *_id or *_no field.
 */
export function prcXmlContentsConflict(
  firstContent: string,
  secondContent: string,
): boolean {
  const firstClaims = createClaimMap(firstContent);
  const secondClaims = createClaimMap(secondContent);

  // Invalid or unsupported PRCXML stays conservative: same path is a conflict.
  if (!firstClaims || !secondClaims) return true;

  for (const [claim, firstValue] of firstClaims) {
    const secondValue = secondClaims.get(claim);
    if (secondValue !== undefined && secondValue !== firstValue) {
      return true;
    }
  }

  return false;
}
