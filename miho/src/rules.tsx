import { Action, ActionPanel, Color, Icon, Keyboard, List } from "@vicinae/api";
import { useCallback, useEffect, useState } from "react";

import { readRules, type Rule } from "~/api/mihomo.ts";
import { errorText } from "~/utils/error.ts";
import { formatClock } from "~/utils/format.ts";

function ruleText(rule: Rule): string {
	return [rule.type.toUpperCase(), rule.payload, rule.proxy].filter(Boolean).join(",");
}

function ruleTitle(rule: Rule): string {
	if (rule.payload) return rule.payload;
	return rule.type === "Match" ? "MATCH" : rule.type || `Rule ${rule.index}`;
}

export default function Command() {
	const [rules, setRules] = useState<Rule[]>([]);
	const [error, setError] = useState<string | null>(null);
	const [loading, setLoading] = useState(true);

	const refresh = useCallback(async () => {
		try {
			setRules(await readRules());
			setError(null);
		} catch (cause) {
			setError(errorText(cause));
		} finally {
			setLoading(false);
		}
	}, []);

	useEffect(() => {
		void refresh();
	}, [refresh]);

	return (
		<List isLoading={loading} navigationTitle="Rules" searchBarPlaceholder="Filter by type, payload or outbound">
			{error ? (
				<List.EmptyView
					icon={Icon.Warning}
					title="Cannot read the rules"
					description={error}
					actions={
						<ActionPanel>
							<Action title="Try Again" icon={Icon.ArrowClockwise} onAction={() => void refresh()} />
						</ActionPanel>
					}
				/>
			) : !rules.length && !loading ? (
				<List.EmptyView icon={Icon.BulletPoints} title="No rules" description="The config has no rules." />
			) : (
				<List.Section title={`${rules.length} rules · evaluated top to bottom`}>
					{rules.map((rule) => (
						<List.Item
							key={rule.index}
							id={String(rule.index)}
							title={ruleTitle(rule)}
							subtitle={`${rule.type} → ${rule.proxy || "—"}`}
							icon={
								rule.disabled
									? Icon.CircleDisabled
									: rule.type === "Match"
										? Icon.Flag
										: Icon.BulletPoints
							}
							keywords={[rule.type, rule.payload, rule.proxy, rule.disabled ? "disabled" : ""]}
							accessories={[
								...(rule.disabled ? [{ tag: { value: "disabled", color: Color.Red } }] : []),
								{
									text: {
										value: rule.hits ? `${rule.hits} hits` : "unused",
										color: rule.hits ? Color.Green : Color.SecondaryText,
									},
									tooltip: rule.lastHit ? `Last hit ${formatClock(rule.lastHit)}` : "No match yet",
								},
							]}
							actions={
								<ActionPanel>
									<Action.CopyToClipboard
										title="Copy Rule"
										content={ruleText(rule)}
										shortcut={Keyboard.Shortcut.Common.Copy}
									/>
									<Action.CopyToClipboard title="Copy Payload" content={rule.payload || rule.type} />
									<Action.CopyToClipboard title="Copy Outbound" content={rule.proxy} />
									<Action
										title="Refresh"
										icon={Icon.ArrowClockwise}
										shortcut={Keyboard.Shortcut.Common.Refresh}
										onAction={() => void refresh()}
									/>
								</ActionPanel>
							}
						/>
					))}
				</List.Section>
			)}
		</List>
	);
}
