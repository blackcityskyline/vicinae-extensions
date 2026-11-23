import { Action, ActionPanel, Clipboard, Detail, Form, Icon, useNavigation } from "@vicinae/api";
import { existsSync } from "node:fs";
import { useEffect, useState } from "react";

import { readQrCodes } from "~/api/scan";
import { imageSource } from "~/utils/scan";

type Source = { kind: "reading" } | { kind: "none" } | { kind: "image"; image: string };

/**
 * The other half of Text to QR Code: an image in, the text it holds out. Takes an
 * image path as its argument, or the image copied to the clipboard, or a copied
 * path; the file picker is there for the other cases. A screen region is what
 * `iskra`'s Scan QR does.
 */
export default function QrToText(props: { arguments?: Arguments.QrToText }) {
	const argument = props.arguments?.image;
	const [source, setSource] = useState<Source>({ kind: "reading" });

	useEffect(() => {
		Clipboard.read()
			.then((clipboard) => ({ file: clipboard.file, text: clipboard.text }))
			.catch(() => ({ file: undefined, text: undefined }))
			.then((clipboard) => {
				const image = imageSource(argument, clipboard, existsSync);
				setSource(image ? { kind: "image", image } : { kind: "none" });
			});
	}, [argument]);

	if (source.kind === "reading") return <Detail markdown="Reading the image…" />;
	if (source.kind === "none") {
		return (
			<Detail
				markdown={
					"## No QR code found\n\nCopy an image, copy the path of one, or pass it as this command's argument. For a code on screen, use `iskra`'s Scan QR."
				}
				actions={<ChooseImage />}
			/>
		);
	}

	return <QrCodes image={source.image} />;
}

/**
 * Where the image comes from when the argument and the clipboard are not it: the
 * file dialog, or the path typed by hand when the dialog is the awkward way.
 */
function PickImage() {
	const { push } = useNavigation();
	const [path, setPath] = useState("");
	const [error, setError] = useState("");

	function submit(values: Form.Values) {
		const typed = String(values.path ?? "").trim();
		const picked = (values.images as string[] | undefined)?.[0];
		const image = picked || typed;

		if (!image) {
			setError("Pick an image or type its path.");
			return;
		}
		if (!picked && !existsSync(typed)) {
			setError("No file at that path.");
			return;
		}
		push(<QrCodes image={image} />);
	}

	return (
		<Form
			actions={
				<ActionPanel>
					<Action.SubmitForm title="Read QR Code" icon={Icon.MagnifyingGlass} shortcut="save" onSubmit={submit} />
				</ActionPanel>
			}
		>
			<Form.FilePicker
				id="images"
				title="Image"
				canChooseFiles
				canChooseDirectories={false}
				allowMultipleSelection={false}
				info="The image to read, chosen from the file dialog."
			/>
			<Form.TextField
				id="path"
				title="Or a Path"
				placeholder="/home/you/Pictures/code.png"
				value={path}
				error={error}
				onChange={(next) => {
					setPath(next);
					setError("");
				}}
			/>
		</Form>
	);
}

function ChooseImage() {
	return (
		<ActionPanel>
			<Action.Push
				title="Choose Image…"
				icon={Icon.Finder}
				shortcut={{ modifiers: ["ctrl"], key: "o" }}
				target={<PickImage />}
			/>
		</ActionPanel>
	);
}

/** The path to read is known: scan it and show what it holds. */
function QrCodes({ image }: { image: string }) {
	const [shown, setShown] = useState<{ kind: "reading" } | { kind: "none" } | { kind: "failed"; message: string } | { kind: "found"; codes: string[] }>({
		kind: "reading",
	});

	useEffect(() => {
		let active = true;
		setShown({ kind: "reading" });
		readQrCodes(image)
			.then((codes) => {
				if (!active) return;
				setShown(codes.length === 0 ? { kind: "none" } : { kind: "found", codes });
			})
			.catch((failure: Error) => {
				if (active) setShown({ kind: "failed", message: failure.message });
			});
		return () => {
			active = false;
		};
	}, [image]);

	if (shown.kind === "reading") return <Detail markdown="Reading the image…" />;
	if (shown.kind === "none") {
		return (
			<Detail
				navigationTitle="QR Result"
				markdown={`## No QR code found\n\n\`${image}\` holds no readable code.`}
				actions={<ChooseImage />}
			/>
		);
	}
	if (shown.kind === "failed") {
		return (
			<Detail
				navigationTitle="QR Result"
				markdown={`## Could not read the image\n\n${shown.message}`}
				actions={<ChooseImage />}
			/>
		);
	}

	const text = shown.codes.join("\n");
	const links = shown.codes.filter((code) => /^https?:\/\//i.test(code));

	return (
		<Detail
			navigationTitle="QR Result"
			markdown={`# ${shown.codes.length > 1 ? `${shown.codes.length} codes` : "QR code"}\n\n${shown.codes.map((code) => `- ${code}`).join("\n")}`}
			metadata={
				<Detail.Metadata>
					<Detail.Metadata.Label title="Codes" text={String(shown.codes.length)} />
					<Detail.Metadata.Label title="Image" text={image} />
				</Detail.Metadata>
			}
			actions={
				<ActionPanel>
					<Action.CopyToClipboard title="Copy Text" content={text} shortcut="copy" />
					<Action.Paste title="Paste Text" content={text} shortcut={{ modifiers: ["ctrl"], key: "i" }} />
					<ActionPanel.Section>
						<Action.Push
							title="Choose Image…"
							icon={Icon.Finder}
							shortcut={{ modifiers: ["ctrl"], key: "o" }}
							target={<PickImage />}
						/>
					</ActionPanel.Section>
					{links.length > 0 ? (
						<ActionPanel.Section>
							{links.map((code) => (
								<Action.OpenInBrowser key={code} title="Open Link" url={code} icon={Icon.Globe01} />
							))}
						</ActionPanel.Section>
					) : null}
				</ActionPanel>
			}
		/>
	);
}
