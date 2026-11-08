import {
	Action,
	ActionPanel,
	Alert,
	Color,
	Form,
	Icon,
	Keyboard,
	List,
	Toast,
	confirmAlert,
	showToast,
	useNavigation,
} from "@vicinae/api";
import { useCallback, useEffect, useState } from "react";

import {
	PATHS,
	type Profile,
	applyProfile,
	deleteProfile,
	readProfiles,
	saveProfile,
} from "~/api/mihomo.ts";
import { errorText } from "~/utils/error.ts";

function SaveForm() {
	const { pop } = useNavigation();
	const [busy, setBusy] = useState(false);

	async function submit(values: Form.Values) {
		const name = String(values.name ?? "").trim();
		setBusy(true);
		const toast = await showToast({ style: Toast.Style.Animated, title: `Saving ${name || "profile"}` });
		try {
			const message = await saveProfile(name);
			toast.style = Toast.Style.Success;
			toast.title = message;
			pop();
			return true;
		} catch (cause) {
			toast.style = Toast.Style.Failure;
			toast.title = "Could not save the profile";
			toast.message = errorText(cause);
			return false;
		} finally {
			setBusy(false);
		}
	}

	return (
		<Form
			isLoading={busy}
			navigationTitle="Save Current as Profile"
			actions={
				<ActionPanel>
					<Action.SubmitForm title="Save Profile" onSubmit={submit} />
				</ActionPanel>
			}
		>
			<Form.TextField id="name" title="Profile name" placeholder="home" autoFocus />
			<Form.Description text="The current config.yaml becomes a profile in ~/.config/mihomo/profiles." />
		</Form>
	);
}

export default function Command() {
	const [profiles, setProfiles] = useState<Profile[]>([]);
	const [loading, setLoading] = useState(true);
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const refresh = useCallback(async () => {
		try {
			setProfiles(readProfiles());
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

	async function run(title: string, action: () => Promise<string>) {
		setBusy(true);
		const toast = await showToast({ style: Toast.Style.Animated, title });
		try {
			const message = await action();
			toast.style = Toast.Style.Success;
			toast.title = message;
		} catch (cause) {
			toast.style = Toast.Style.Failure;
			toast.title = `${title} failed`;
			toast.message = errorText(cause);
		} finally {
			setBusy(false);
			await refresh();
		}
	}

	async function apply(profile: Profile) {
		const confirmed = await confirmAlert({
			title: `Apply ${profile.name}?`,
			message: "config.yaml is replaced by this profile and mihomo reloads.",
			primaryAction: { title: "Apply", style: Alert.ActionStyle.Destructive },
		});
		if (confirmed) await run(`Applying ${profile.name}`, () => applyProfile(profile.name));
	}

	async function remove(profile: Profile) {
		const confirmed = await confirmAlert({
			title: `Delete ${profile.name}?`,
			message: "The profile file is removed. config.yaml stays as it is.",
			primaryAction: { title: "Delete", style: Alert.ActionStyle.Destructive },
		});
		if (confirmed) await run(`Deleting ${profile.name}`, () => deleteProfile(profile.name));
	}

	return (
		<List
			isLoading={loading || busy}
			navigationTitle="Profiles"
			searchBarPlaceholder="Filter profiles"
		>
			{error ? (
				<List.EmptyView icon={Icon.Warning} title="Cannot read the profiles" description={error} />
			) : !profiles.length && !loading ? (
				<List.EmptyView
					icon={Icon.Folder}
					title="No profiles"
					description="Save the current config to switch between layouts."
					actions={
						<ActionPanel>
							<Action.Push title="Save Current as Profile" icon={Icon.SaveDocument} target={<SaveForm />} />
						</ActionPanel>
					}
				/>
			) : (
				<List.Section title={`${profiles.length} profiles`}>
					{profiles.map((profile) => (
						<List.Item
							key={profile.name}
							id={profile.name}
							title={profile.name}
							subtitle={profile.active ? "active" : "saved"}
							icon={profile.active ? Icon.CheckCircle : Icon.Folder}
							keywords={[profile.active ? "active" : "saved"]}
							accessories={[
								...(profile.active ? [{ tag: { value: "active", color: Color.Green } }] : []),
								{ text: { value: `${profile.name}.yaml` } },
							]}
							actions={
								<ActionPanel>
									<Action
										title="Apply Profile"
										icon={Icon.Switch}
										onAction={() => void apply(profile)}
									/>
									<Action.Push
										title="Save Current as Profile"
										icon={Icon.SaveDocument}
										target={<SaveForm />}
									/>
									<Action
										title="Delete Profile"
										icon={Icon.Trash}
										style={Action.Style.Destructive}
										onAction={() => void remove(profile)}
									/>
									<Action.CopyToClipboard
										title="Copy Profile Name"
										content={profile.name}
										shortcut={Keyboard.Shortcut.Common.Copy}
									/>
									<Action.Open
										title="Open Profile"
										target={`${PATHS.profiles}/${profile.name}.yaml`}
										icon={Icon.Cog}
									/>
									<Action title="Refresh" icon={Icon.ArrowClockwise} onAction={() => void refresh()} />
								</ActionPanel>
							}
						/>
					))}
				</List.Section>
			)}
		</List>
	);
}
