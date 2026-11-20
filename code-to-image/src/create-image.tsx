import { useEffect, useState } from "react";
import {
  Action,
  ActionPanel,
  Clipboard,
  Detail,
  Form,
  Icon,
  Toast,
  getPreferenceValues,
  showToast,
  useNavigation,
} from "@vicinae/api";
import { pathToFileURL } from "node:url";

import { renderImage } from "~/api/codetoimage";
import { lastChoices, loadCatalog, rememberChoices } from "~/api/state";
import {
  expandHome,
  validateCode,
  type Catalog,
  type Format,
} from "~/utils/snippet";

export default function Command() {
  const { push } = useNavigation();
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  const remembered = lastChoices();
  const [code, setCode] = useState("");
  const [codeError, setCodeError] = useState<string | undefined>();
  const [language, setLanguage] = useState(remembered.language ?? "python");
  const [theme, setTheme] = useState(remembered.theme ?? "github-dark");

  // Code on the clipboard is usually the reason this command was opened, but
  // it must never overwrite something the user already typed.
  useEffect(() => {
    let alive = true;
    Clipboard.readText()
      .then((text) => {
        if (!alive || !text.trim() || validateCode(text) !== null) return;
        setCode((current) => (current.trim() ? current : text));
      })
      .catch(() => {
        // An empty or unreadable clipboard is not an error here.
      });
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    let alive = true;
    setLoadError(null);
    void (async () => {
      const loaded = await loadCatalog();
      if (!alive) return;
      if (loaded.error) {
        setLoadError(loaded.error.message);
      } else {
        setCatalog(loaded.result);
      }
    })();
    return () => {
      alive = false;
    };
  }, [attempt]);

  if (loadError) {
    return (
      <Form
        navigationTitle="Create Image"
        actions={
          <ActionPanel>
            <Action
              title="Retry"
              icon={Icon.ArrowClockwise}
              shortcut="refresh"
              onAction={() => setAttempt((n) => n + 1)}
            />
            <Action.OpenInBrowser
              title="Open codetoimage.com"
              url="https://codetoimage.com"
              shortcut="open"
            />
          </ActionPanel>
        }
      >
        <Form.Description title="Cannot load languages and themes" text={loadError} />
      </Form>
    );
  }

  if (!catalog) {
    return (
      <Form isLoading navigationTitle="Create Image">
        <Form.Description
          title="Loading"
          text="Fetching languages and themes from codetoimage.com…"
        />
      </Form>
    );
  }

  const languages = catalog.languages;
  const themes = catalog.themes;
  const languageValue = languages.some((item) => item.id === language)
    ? language
    : (languages[0]?.id ?? "javascript");
  const themeValue = themes.some((item) => item.id === theme)
    ? theme
    : (themes[0]?.id ?? "github-dark");

  async function submit(values: Form.Values) {
    const snippet = String(values.code ?? "");
    const problem = validateCode(snippet);
    if (problem) {
      setCodeError(problem);
      return false;
    }
    setCodeError(undefined);

    const chosenLanguage = String(values.language ?? languageValue);
    const chosenTheme = String(values.theme ?? themeValue);
    const format: Format = values.format === "svg" ? "svg" : "png";
    const folder = expandHome(
      getPreferenceValues<Preferences>().saveFolder || "~/Pictures/code-to-image",
    );

    const toast = await showToast({
      style: Toast.Style.Animated,
      title: "Rendering image…",
      message: "codetoimage.com",
    });

    const rendered = await renderImage({
      code: snippet,
      language: chosenLanguage,
      theme: chosenTheme,
      format,
      lineNumbers: values.lineNumbers !== false,
      windowChrome: values.windowChrome !== false,
      folder,
    });

    if (rendered.error) {
      toast.style = Toast.Style.Failure;
      toast.title = "Render failed";
      toast.message = rendered.error.message;
      return false;
    }

    toast.style = Toast.Style.Success;
    toast.title = "Image saved";
    toast.message = rendered.result;
    rememberChoices(chosenLanguage, chosenTheme);

    push(
      <Rendered
        filePath={rendered.result}
        language={languages.find((item) => item.id === chosenLanguage)?.label ?? chosenLanguage}
        theme={themes.find((item) => item.id === chosenTheme)?.label ?? chosenTheme}
        format={format}
      />,
    );
    return false;
  }

  return (
    <Form
      navigationTitle="Create Image"
      actions={
        <ActionPanel>
          <Action.SubmitForm title="Render Image" icon={Icon.Image} onSubmit={submit} />
          <Action.OpenInBrowser
            title="Open codetoimage.com"
            url="https://codetoimage.com"
            shortcut="open"
          />
        </ActionPanel>
      }
    >
      <Form.TextArea
        id="code"
        title="Code"
        placeholder="Paste or type the snippet to render"
        value={code}
        error={codeError}
        onChange={(value) => {
          setCode(value);
          if (codeError) setCodeError(undefined);
        }}
      />
      <Form.Dropdown
        id="language"
        title="Language"
        value={languageValue}
        onChange={setLanguage}
      >
        {languages.map((item) => (
          <Form.Dropdown.Item
            key={item.id}
            title={item.label}
            value={item.id}
            icon={Icon.Code}
          />
        ))}
      </Form.Dropdown>
      <Form.Dropdown id="theme" title="Theme" value={themeValue} onChange={setTheme}>
        {themes.map((item) => (
          <Form.Dropdown.Item
            key={item.id}
            title={item.label}
            value={item.id}
            icon={Icon.Brush}
          />
        ))}
      </Form.Dropdown>
      <Form.Dropdown id="format" title="Format" defaultValue="png">
        <Form.Dropdown.Item title="PNG (2× pixels)" value="png" icon={Icon.Image} />
        <Form.Dropdown.Item title="SVG (vector)" value="svg" icon={Icon.Code} />
      </Form.Dropdown>
      <Form.Checkbox
        id="lineNumbers"
        title="Details"
        label="Show line numbers"
        defaultValue={true}
      />
      <Form.Checkbox
        id="windowChrome"
        title="Window"
        label="Wrap in a macOS-style window"
        defaultValue={true}
      />
      <Form.Description
        title="Rendering"
        text="The snippet is sent to codetoimage.com and rendered there; it is not stored. Nothing is sent until you press Render Image."
      />
    </Form>
  );
}

function Rendered(props: {
  filePath: string;
  language: string;
  theme: string;
  format: Format;
}) {
  const { pop } = useNavigation();
  const image = pathToFileURL(props.filePath).href;

  return (
    <Detail
      navigationTitle="Rendered Image"
      markdown={`![Rendered code](${image})`}
      metadata={
        <Detail.Metadata>
          <Detail.Metadata.Label title="Format" text={props.format.toUpperCase()} />
          <Detail.Metadata.Label title="Language" text={props.language} />
          <Detail.Metadata.Label title="Theme" text={props.theme} />
          <Detail.Metadata.Separator />
          <Detail.Metadata.Label title="File" text={props.filePath} />
        </Detail.Metadata>
      }
      actions={
        <ActionPanel>
          <Action
            title="Copy Image File"
            icon={Icon.CopyClipboard}
            shortcut="copy"
            onAction={async () => {
              await Clipboard.copy({ file: props.filePath });
              await showToast({ style: Toast.Style.Success, title: "Image copied" });
            }}
          />
          <Action.Open title="Open Image" target={props.filePath} shortcut="open" />
          <Action.ShowInFinder
            title="Show in File Manager"
            path={props.filePath}
            shortcut={{ modifiers: ["ctrl", "shift"], key: "f" }}
          />
          <Action.CopyToClipboard
            title="Copy File Path"
            content={props.filePath}
            shortcut="copy-path"
          />
          <Action
            title="Edit and Render Again"
            icon={Icon.Pencil}
            shortcut="edit"
            onAction={pop}
          />
        </ActionPanel>
      }
    />
  );
}
