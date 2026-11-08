import { Action, ActionPanel, Form, Toast, showToast, useNavigation } from "@vicinae/api";
import { useState } from "react";

import { addSubscription, updateSubscription } from "~/api/mihomo.ts";
import { errorText } from "~/utils/error.ts";
import type { Subscription } from "~/utils/subscriptions.ts";

export function SubscriptionForm({ initial }: { initial?: Subscription }) {
	const { pop } = useNavigation();
	const editing = Boolean(initial);
	const [busy, setBusy] = useState(false);

	async function submit(values: Form.Values) {
		const name = String(values.name ?? "")
			.trim()
			.toLowerCase();
		const url = String(values.url ?? "").trim();
		const interval = Number(values.interval ?? 3600);
		setBusy(true);
		const toast = await showToast({
			style: Toast.Style.Animated,
			title: editing ? `Updating ${initial?.name}` : `Adding ${name}`,
		});
		try {
			const message = editing
				? await updateSubscription(initial?.name ?? "", { url, interval })
				: await addSubscription({ name, url, interval });
			toast.style = Toast.Style.Success;
			toast.title = message;
			pop();
			return true;
		} catch (cause) {
			toast.style = Toast.Style.Failure;
			toast.title = "Could not save the subscription";
			toast.message = errorText(cause);
			return false;
		} finally {
			setBusy(false);
		}
	}

	return (
		<Form
			isLoading={busy}
			navigationTitle={editing ? "Edit Subscription" : "Add Subscription"}
			actions={
				<ActionPanel>
					<Action.SubmitForm
						title={editing ? "Save Subscription" : "Add Subscription"}
						onSubmit={submit}
					/>
				</ActionPanel>
			}
		>
			{editing ? (
				<Form.Description title="Name" text={initial?.name ?? ""} />
			) : (
				<Form.TextField id="name" title="Name" placeholder="provider-name" autoFocus />
			)}
			<Form.TextField id="url" title="URL" placeholder="https://…" defaultValue={initial?.url ?? ""} />
			<Form.TextField
				id="interval"
				title="Auto-update interval (seconds)"
				placeholder="3600"
				defaultValue={String(initial?.interval ?? 3600)}
			/>
			<Form.Description text="The provider joins every group that already has a use list." />
		</Form>
	);
}
