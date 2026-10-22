/**
 * The Lucide catalogue, built from the three endpoints `lucide.dev` serves:
 * `icon-nodes` (the drawing), `tags` and `categories` (the search words).
 *
 * Pure on purpose: the grid needs `buildIcons` once per cache miss, and a test
 * needs it without a network. Fetching and caching live in `useIcons.ts`.
 */

export type IconNode = [elementName: string, attrs: Record<string, string>];

export type IconNodes = Record<string, IconNode[]>;

export type LucideIcon = {
  name: string;
  content: string;
  path: string;
  keywords: string[];
};

type Attributes = Record<string, string | number>;

type Child = string | [string, Attributes, Child[]?];

export const defaultAttributes: Attributes = {
  xmlns: "http://www.w3.org/2000/svg",
  width: 24,
  height: 24,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  "stroke-width": 2,
  "stroke-linecap": "round",
  "stroke-linejoin": "round",
};

export function createLucideIcon(tag: string, attrs: Attributes, children: Child[] = []): string {
  const attrString = Object.entries(attrs)
    .map(([key, value]) => `${key}="${value}"`)
    .join(" ");
  const childrenString = children
    .map((child) => (typeof child === "string" ? child : createLucideIcon(child[0], child[1], child[2] ?? [])))
    .join("");

  return `<${tag} ${attrString}>${childrenString}</${tag}>`;
}

export const toPascalCase = (value: string): string => {
  const camelCase = value.replace(/^([A-Z])|[\s-_]+(\w)/g, (_match, first: string, next: string) =>
    next ? next.toUpperCase() : first.toLowerCase(),
  );

  return camelCase.charAt(0).toUpperCase() + camelCase.slice(1);
};

export const toKebabCase = (value: string): string =>
  value.replace(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase();

export const copyName = (name: string, pascalCase: boolean): string =>
  pascalCase ? toPascalCase(name) : name;

/**
 * One icon per name. Tags and categories overlap heavily (`clock` is in both),
 * so the keyword list is deduplicated once here rather than in every filter.
 */
export function buildIcons(
  iconNodes: IconNodes,
  tags: Record<string, string[]>,
  categories: Record<string, string[]>,
): LucideIcon[] {
  return Object.entries(iconNodes).map(([name, nodes]) => ({
    name,
    content: createLucideIcon(
      "svg",
      { ...defaultAttributes, class: `lucide lucide-${toKebabCase(name)}` },
      nodes.map(([tag, attrs]) => createLucideIcon(tag, attrs)),
    ),
    path: `https://lucide.dev/api/icons/${name}`,
    keywords: [...new Set([...(tags[name] ?? []), ...(categories[name] ?? [])])],
  }));
}

export function filterIcons(icons: LucideIcon[], searchText: string): LucideIcon[] {
  const query = searchText.trim().toLowerCase();
  if (query.length === 0) return icons;

  return icons.filter(
    (icon) =>
      icon.name.toLowerCase().includes(query) ||
      icon.keywords.some((keyword) => keyword.toLowerCase().includes(query)),
  );
}
