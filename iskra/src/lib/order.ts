/**
 * The ids a user wrote in an order preference, in their order. Commas,
 * whitespace and `>` all separate. An id that names nothing known is dropped
 * rather than disabling the rest of the chain, and so is a repeat.
 */
export const namedOrder = (raw: string, known: readonly string[]): string[] => [
	...new Set(raw.toLowerCase().split(/[\s,>]+/)),
]
	.filter((id) => known.includes(id));

/**
 * The full fallback chain: the user's ids first, then every remaining one in the
 * built-in order, so installing a tool makes it reachable without editing the
 * preference.
 */
export const fullOrder = (raw: string, known: readonly string[]): string[] => {
	const named = namedOrder(raw, known);
	return [...named, ...known.filter((id) => !named.includes(id))];
};
