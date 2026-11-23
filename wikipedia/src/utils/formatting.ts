import type { WikiNode } from "~/utils/api";
import { pageLink } from "~/utils/links";

export function toTitleCase(str: string): string {
	const spaced = str.replace(/([A-Z])/g, " $1");
	return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

export function toSentenceCase(str: string): string {
	return str.charAt(0).toUpperCase() + str.slice(1);
}

export function escapeRegExp(str: string): string {
	return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Turns the article's own link titles into markdown links. Without any links
 * there is nothing to replace: an empty alternation would match at every word
 * boundary and bracket the whole text.
 */
export function replaceLinks(text: string, language: string, links: string[] = [], openInBrowser = true): string {
	if (!text || links.length === 0) return text;
	const pattern = new RegExp(`\\b(${links.map(escapeRegExp).join("|")})\\b`, "g");
	return text.replace(pattern, (link: string) => `[${link}](${pageLink(link, language, openInBrowser)})`);
}

/**
 * The sections worth their own view: the same filter `renderContent` applies, so
 * a submenu never offers one the article body leaves out.
 */
export function sectionNodes(nodes: WikiNode[] | undefined): WikiNode[] {
	return (nodes ?? []).filter(
		(node) => (Boolean(node.content) || (node.items?.length ?? 0) > 0) && !excludedSections.includes(node.title),
	);
}

export function renderContent(
	nodes: WikiNode[],
	level: number,
	links: string[] = [],
	language = "en",
	openLinksInBrowser = true,
): string {
	if (!nodes) return "";
	return nodes
		.filter((node) => Boolean(node.content) || (node.items?.length ?? 0) > 0)
		.filter((node) => !excludedSections.includes(node.title))
		.map((node) => {
			const title = `${"#".repeat(level)} ${node.title}`;
			const content = replaceLinks(node.content, language, links, openLinksInBrowser);
			const items = node.items
				? renderContent(node.items, level + 1, links, language, openLinksInBrowser)
				: "";
			return `${title}\n\n${content}\n\n${items}`;
		})
		.join("\n\n");
}

type MetadataValue = unknown;

function isExcludedValue(value: MetadataValue): boolean {
	return excludedMetatadataValues.includes(String(value));
}

export function processMetadata(metadata?: Record<string, MetadataValue>) {
	return Object.entries(metadata ?? {})
		.filter(([label]) => !excludedMetatadataLabels.includes(label.toLowerCase()))
		.filter(([label]) => Number.isNaN(Number.parseInt(label, 10)))
		.filter(([, value]) => !isExcludedValue(value))
		.map(([label, value]) => ({
			key: label,
			title: toTitleCase(label),
			value,
		}));
}

export const excludedSections = [
	"See also",
	"References",
	"External links",
	"Further reading",
	"Notes",
	"Bibliography",
	"Sources",
	"Citations",
	"Footnotes",
	"Véase también",
	"Referencias",
	"Enlaces externos",
	"Otras lecturas",
	"Notas",
	"Bibliografía",
	"Fuentes",
	"Citas",
	"Notas al pie",
	"Siehe auch",
	"Verweise",
	"Externe Links",
	"Weiteres Lesen",
	"Anmerkungen",
	"Literaturverzeichnis",
	"Quellen",
	"Zitate",
	"Fußnoten",
	"Voir également",
	"Les références",
	"Liens externes",
	"Lecture complémentaire",
	"Remarques",
	"Bibliographie",
	"Sources",
	"Citations",
	"Notes de bas de page",
	"Смотрите также",
	"Использованная литература",
	"Внешние ссылки",
	"Дальнейшее чтение",
	"Примечания",
	"Библиография",
	"Цитаты",
	"Сноски",
	"Veja também",
	"Referências",
	"Links externos",
	"Leitura adicional",
	"Notas",
	"Bibliografia",
	"Fontes",
	"Citações",
	"Notas de rodapé",
	"Guarda anche",
	"Riferimenti",
	"Link esterno",
	"Ulteriori letture",
	"Appunti",
	"Bibliografia",
	"Fonti",
	"Citazioni",
	"Note a piè di pagina",
	"Ayrıca bakınız",
	"Referanslar",
	"Dış bağlantılar",
	"Daha fazla okuma",
	"Notlar",
	"Kaynakça",
	"Kaynaklar",
	"Alıntılar",
	"Dipnotlar",
	"Δείτε επίσης",
	"Βιβλιογραφικές αναφορές",
	"Εξωτερικοί σύνδεσμοι",
	"Περαιτέρω ανάγνωση",
	"Σημειώσεις",
	"Βιβλιογραφία",
	"Πηγές",
	"Αναφορές",
	"Υποσημειώσεις",
];

export const excludedMetatadataLabels = [
	"image",
	"cat",
	"subcat",
	"sortkey",
	"italictitle",
	"wikisource",
	"listadesplegable",
];

export const excludedMetatadataValues = ["true", "false", "si", "no", "altura"];

export function formatMetadataValue(label: string, value?: Date | null | string): string {
	if (value instanceof Date) {
		return value.toLocaleDateString();
	}
	if (!value) {
		return "N/A";
	}
	if (label === "coordinates") {
		return value.toString().split("|").slice(0, 2).join(", ");
	}
	return value.toString();
}
