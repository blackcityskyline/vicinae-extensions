import { Action, ActionPanel, Detail, Icon, environment } from "@vicinae/api";
import { useEffect, useState } from "react";
import { readOsAgeDays } from "~/api/os-age";
import { readDesktopShell } from "~/api/desktop-shell";
import { readDistroLogo, readSystemInfo } from "~/api/system";
import { readThemePalette, writePaletteImage } from "~/api/theme";
import { artMarkdown, logoArt } from "~/utils/logo";
import { buildSpec, type Spec } from "~/utils/spec";

type State =
	| { status: "loading" }
	| { status: "ready"; spec: Spec; markdown: string; palette?: Palette }
	| { status: "error"; missing: boolean; message: string };

const FACT_ICONS: Record<string, Icon> = {
	OS: Icon.Desktop,
	Kernel: Icon.ComputerChip,
	"WM/DE": Icon.AppWindow,
	Packages: Icon.Box,
	Shell: Icon.Terminal,
	"OS age": Icon.Clock,
	Uptime: Icon.Gauge,
	Vicinae: Icon.Rocket,
	Font: Icon.Text,
};

/** A metadata row is plain text, so the squares arrive as a rich-text image. */
type Palette = { url: string; width: number; height: number };

const INSTALL_HINT = "```\nsudo pacman -S fastfetch\n```";

export default function SystemInformation() {
	const [state, setState] = useState<State>({ status: "loading" });

	async function load() {
		const result = await readSystemInfo();
		if (!result.ok) {
			setState({ status: "error", missing: result.reason === "missing", message: result.message });
			return;
		}
		const spec = buildSpec(result.modules, {
			osAgeDays: readOsAgeDays(),
			launcher: environment.vicinaeVersion.tag,
			shell: readDesktopShell(),
		});
		const art = logoArt(result.modules);
		const image = readDistroLogo();
		setState({
			status: "ready",
			spec,
			palette: writePaletteImage(readThemePalette()),
			markdown: art ? artMarkdown(art) : image ? `![](${image}?raycast-height=200)` : `# ${spec.user}`,
		});
	}

	useEffect(() => {
		void load();
	}, []);

	const actions = (
		<ActionPanel>
			{state.status === "ready" ? (
				<Action.CopyToClipboard title="Copy Summary" icon={Icon.CopyClipboard} content={state.spec.summary} shortcut="copy" />
			) : null}
			<Action title="Refresh" icon={Icon.ArrowClockwise} shortcut="refresh" onAction={load} />
			{state.status === "error" && state.missing ? (
				<Action.CopyToClipboard title="Copy Install Command" icon={Icon.CopyClipboard} content="sudo pacman -S fastfetch" shortcut="copy" />
			) : null}
		</ActionPanel>
	);

	if (state.status === "ready") {
		return (
			<Detail
				navigationTitle="Vicifetch"
				markdown={state.markdown}
				actions={actions}
				metadata={
					<Detail.Metadata>
						<Detail.Metadata.Label title="User" text={state.spec.user} icon={Icon.Person} />
						<Detail.Metadata.Separator />
						{state.spec.facts.map((fact) => (
							<Detail.Metadata.Label key={fact.label} title={fact.label} text={fact.value} icon={FACT_ICONS[fact.label]} />
						))}
						{state.palette ? (
							<Detail.Metadata.Label
								title="Colors"
								text={`<img src="${state.palette.url}" width="${state.palette.width}" height="${state.palette.height}">`}
							/>
						) : null}
					</Detail.Metadata>
				}
			/>
		);
	}

	const markdown =
		state.status === "error"
			? [
					"# Vicifetch",
					"",
					state.missing
						? `This extension reads the machine through **fastfetch**, which is not on \`PATH\`. ${state.message}`
						: "fastfetch did not return usable data.",
					"",
					state.missing ? INSTALL_HINT : "",
					"",
					state.missing ? "Install it, then press **Refresh**." : `\`${state.message}\``,
				].join("\n")
			: "# Vicifetch\n\nReading the machine…";

	return (
		<Detail
			navigationTitle="Vicifetch"
			markdown={markdown}
			actions={actions}
			isLoading={state.status === "loading"}
		/>
	);
}
