import React from "react";
import { Action, ActionPanel, Form, Icon, Keyboard, showToast, Toast } from "@raycast/api";
import { usePromise } from "@raycast/utils";
import { useDebouncedValue, useSelectedLanguagesSet, useTextState, usePreferences } from "./hooks";
import { LanguageCode, supportedLanguagesByCode, languages, english } from "./languages";
import { AUTO_DETECT, simpleTranslate } from "./simple-translate";
import { LanguagesManagerList } from "./LanguagesManager";
import { definitionsAsText, synonymsAsText } from "./rich";
import { ConfigurableCopyPasteActions, OpenOnGoogleTranslateWebsiteAction } from "./actions";

export default function TranslateForm() {
  const [selectedLanguageSet, setSelectedLanguageSet] = useSelectedLanguagesSet();
  const langFrom = selectedLanguageSet.langFrom;
  const langTo = Array.isArray(selectedLanguageSet.langTo) ? selectedLanguageSet.langTo[0] : selectedLanguageSet.langTo;
  const { proxy } = usePreferences();
  const textInputRef = React.useRef<Form.TextArea>(null);
  const toLangInputRef = React.useRef<Form.Dropdown>(null);
  const fromLangInputRef = React.useRef<Form.Dropdown>(null);
  const setLangFrom = (l: LanguageCode) => setSelectedLanguageSet({ ...selectedLanguageSet, langFrom: l });
  const setLangTo = (l: LanguageCode) => setSelectedLanguageSet({ ...selectedLanguageSet, langTo: [l] });
  const fromLangObj = supportedLanguagesByCode[langFrom] ?? english;
  const toLangObj = supportedLanguagesByCode[langTo] ?? english;

  const [text, setText] = useTextState();
  const debouncedValue = useDebouncedValue(text, 500);

  // Memoised on purpose. Upstream passes `{langFrom, langTo: [...], proxy}` written
  // out inline, which is a new object on every render; the effect behind usePromise
  // then re-runs on every render, marks the previous answer stale, and throws it
  // away. The first translation lands — it came with the auto-pasted text — and
  // nothing after it ever does: clearing the field, changing the languages and
  // typing something new all leave the old translation on screen.
  const languageOptions = React.useMemo(
    () => ({ langFrom: fromLangObj.code, langTo: [toLangObj.code], proxy }),
    [fromLangObj.code, toLangObj.code, proxy],
  );

  const { data: translated, isLoading } = usePromise(
    simpleTranslate,
    [debouncedValue, languageOptions],
    {
      onError(error) {
        showToast({
          style: Toast.Style.Failure,
          title: error.name,
          message: error.message,
        });
      },
    },
  );

  const handleChange = (value: string) => {
    if (value.length > 5000) {
      setText(value.slice(0, 5000));
      showToast({
        style: Toast.Style.Failure,
        title: "Limit",
        message: "Max length (5000 chars) for a single translation exceeded",
      });
    } else {
      setText(value);
    }
  };

  const autoDetectedLanguage = React.useMemo(() => {
    if (langFrom === AUTO_DETECT && translated) {
      return supportedLanguagesByCode[translated.langFrom];
    }

    return null;
  }, [translated, langFrom]);

  return (
    <Form
      isLoading={isLoading}
      actions={
        <ActionPanel>
          <ActionPanel.Section title="Generals">
            <ConfigurableCopyPasteActions defaultActionsPrefix="Translated" value={translated?.translatedText ?? ""} />
            {/* A form owns its field values, so submitting hands over what is
                actually in the Text field even when onChange never reaches the
                component — which is exactly the stuck case: the field shows new text
                and the translation on screen is still for the old one. Setting the
                text to what is in the field re-runs the translation through the same
                path as typing, debounce included. */}
            <Action.SubmitForm
              title="Refresh Translation"
              icon={Icon.ArrowClockwise}
              shortcut={{ modifiers: ["cmd"], key: "r" }}
              onSubmit={(values) => {
                const typed = (values as { text?: unknown }).text;
                if (typeof typed === "string") setText(typed);
              }}
            />
            <Action.CopyToClipboard
              title="Copy Text"
              content={text ?? ""}
              shortcut={Keyboard.Shortcut.Common.CopyName}
            />
            <Action.CopyToClipboard
              title="Copy Synonyms"
              content={translated ? synonymsAsText(translated.rich.synonyms) : ""}
            />
            <Action.CopyToClipboard
              title="Copy Definitions"
              content={translated ? definitionsAsText(translated.rich.definitions) : ""}
            />
            <Action.CopyToClipboard
              title="Copy Pronunciation"
              shortcut={Keyboard.Shortcut.Common.Pin}
              content={translated?.pronunciationText ?? ""}
            />
            <OpenOnGoogleTranslateWebsiteAction translationText={text} translation={{ langFrom, langTo }} />
            <Action.Push
              icon={Icon.Pencil}
              title="Manage Language Sets…"
              shortcut={{ macOS: { modifiers: ["cmd"], key: "l" }, Windows: { modifiers: ["ctrl"], key: "l" } }}
              target={<LanguagesManagerList />}
            />
          </ActionPanel.Section>
          <ActionPanel.Section title="Settings">
            <Action
              shortcut={{
                macOS: { modifiers: ["cmd", "shift"], key: "s" },
                Windows: { modifiers: ["ctrl", "shift"], key: "s" },
              }}
              onAction={() => {
                if (autoDetectedLanguage?.code) {
                  setSelectedLanguageSet({
                    langFrom: langTo,
                    langTo: [supportedLanguagesByCode[autoDetectedLanguage.code].code],
                  });
                } else {
                  setSelectedLanguageSet({ langFrom: langTo, langTo: [langFrom] });
                }
              }}
              title={`${autoDetectedLanguage?.name ?? fromLangObj.name} <-> ${toLangObj.name}`}
            />
            <Action
              shortcut={{
                macOS: { modifiers: ["cmd", "shift"], key: "f" },
                Windows: { modifiers: ["ctrl", "shift"], key: "f" },
              }}
              title="Change from Language"
              onAction={() => {
                fromLangInputRef.current?.focus();
              }}
            />
            <Action
              shortcut={{
                macOS: { modifiers: ["cmd", "shift"], key: "t" },
                Windows: { modifiers: ["ctrl", "shift"], key: "t" },
              }}
              title="Change to Language"
              onAction={() => {
                toLangInputRef.current?.focus();
              }}
            />
          </ActionPanel.Section>
        </ActionPanel>
      }
    >
      <Form.TextArea id="text" title="Text" value={text} onChange={handleChange} ref={textInputRef} />
      <Form.Dropdown
        id="language_from"
        title="From"
        value={autoDetectedLanguage?.code ?? langFrom}
        onChange={(v) => {
          setLangFrom(v as LanguageCode);
          textInputRef.current?.focus();
        }}
        storeValue
        ref={fromLangInputRef}
      >
        {autoDetectedLanguage && (
          <Form.Dropdown.Item value={autoDetectedLanguage.code} title={`${autoDetectedLanguage.name} (Auto-detect)`} />
        )}
        {languages.map((lang) => (
          <Form.Dropdown.Item key={lang.code} value={lang.code} title={lang.name} />
        ))}
      </Form.Dropdown>
      <Form.Dropdown
        id="language_to"
        title="To"
        value={langTo}
        onChange={(v) => {
          setLangTo(v as LanguageCode);
          textInputRef.current?.focus();
        }}
        storeValue
        ref={toLangInputRef}
      >
        {languages
          .filter((lang) => lang.code !== AUTO_DETECT)
          .map((lang) => (
            <Form.Dropdown.Item key={lang.code} value={lang.code} title={lang.name} />
          ))}
      </Form.Dropdown>
      {/* Upstream means this as output, but a Form.TextArea with `value` and no
          `onChange` is not read-only on Vicinae: you can type into it, it keeps
          whatever was typed, and its `value` prop does not push a new answer into
          it afterwards. So the first translation arrives with the auto-pasted text
          and the field is then just an input holding the user's keystrokes.

          The Form.Descriptions below it take the same state and do update, so the
          translation is shown as one of those. */}
      <Form.Description title="Translation" text={translated?.translatedText ?? ""} />
      <Form.Description title="Pronunciation" text={translated?.pronunciationText ?? ""} />

      {/* Everything below comes out of the response the reference already receives
          and discards. Each field is left out entirely when it is empty, because a
          translated paragraph has no dictionary at all — which is the normal case,
          not an error. */}
      {translated?.rich.corrected ? (
        <Form.Description title="Corrected" text={translated.rich.corrected} />
      ) : null}
      {translated?.rich.synonyms.length ? (
        <Form.Description title="Synonyms" text={synonymsAsText(translated.rich.synonyms)} />
      ) : null}
      {translated?.rich.examples.length ? (
        <Form.Description title="Also" text={translated.rich.examples.join("\n")} />
      ) : null}
      {translated?.rich.definitions.length ? (
        <Form.Description title="Definitions" text={definitionsAsText(translated.rich.definitions)} />
      ) : null}
    </Form>
  );
}
