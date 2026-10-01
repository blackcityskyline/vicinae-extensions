import { Action, ActionPanel, Form, Icon, Keyboard, showToast, Toast } from "@vicinae/api";
import { useEffect, useMemo, useRef, useState, type ReactElement } from "react";

import { AUTO_DETECT, simpleTranslate, type Translation } from "~/api/google";
import { ConfigurableCopyPasteActions, OpenOnGoogleTranslateWebsiteAction } from "~/actions";
import { useDebouncedValue, useSelectedLanguagesSet, useTextState } from "~/hooks";
import { LanguagesManagerList } from "~/LanguagesManager";
import { asLanguage, languages } from "~/utils/languages";

const MAX_TEXT = 5000;

/** The reference's form: text in, translation out, language pickers either side. */
export default function TranslateForm(): ReactElement {
  const [selected, setSelected] = useSelectedLanguagesSet();
  const langFrom = selected.langFrom;
  const langTo = selected.langTo[0] ?? "en";


  const textRef = useRef<Form.TextArea>(null);
  const toRef = useRef<Form.Dropdown>(null);
  const fromRef = useRef<Form.Dropdown>(null);

  const fromObj = asLanguage(langFrom);
  const toObj = asLanguage(langTo);

  const [text, setText] = useTextState();
  const debounced = useDebouncedValue(text, 500);

  const options = useMemo(
    () => ({ langFrom: fromObj.code, langTo: [toObj.code] }),
    [fromObj.code, toObj.code],
  );

  const [translated, setTranslated] = useState<Translation | null>(null);

  useEffect(() => {
    let live = true;

    simpleTranslate(debounced, options).then(
      (result) => {
        if (live) setTranslated(result);
      },
      (error: unknown) => {
        if (!live) return;
        const failure = error instanceof Error ? error : new Error(String(error));
        setTranslated(null);
        void showToast({ style: Toast.Style.Failure, title: failure.name, message: failure.message });
      },
    );

    return () => {
      live = false;
    };
  }, [debounced, options]);

  const autoDetected = langFrom === AUTO_DETECT && translated ? asLanguage(translated.from) : null;

  const changeText = (value: string) => {
    if (value.length > MAX_TEXT) {
      setText(value.slice(0, MAX_TEXT));
      void showToast({
        style: Toast.Style.Failure,
        title: "Limit",
        message: `Max length (${MAX_TEXT} chars) for a single translation exceeded`,
      });
      return;
    }
    setText(value);
  };

  return (
    <Form
      isLoading={debounced !== text}
      actions={
        <ActionPanel>
          <ActionPanel.Section title="Generals">
            <ConfigurableCopyPasteActions defaultActionsPrefix="Translated" value={translated?.text ?? ""} />
            <Action.CopyToClipboard
              title="Copy Text"
              content={text}
              shortcut={Keyboard.Shortcut.Common.CopyName}
            />
            <Action.CopyToClipboard
              title="Copy Pronunciation"
              shortcut={Keyboard.Shortcut.Common.Pin}
              content={translated?.transliteration ?? ""}
            />
            <OpenOnGoogleTranslateWebsiteAction
              translationText={text}
              translation={{ from: translated?.from ?? langFrom, to: langTo }}
            />
            <Action.Push
              icon={Icon.Pencil}
              title="Manage Language Sets…"
              shortcut={{ modifiers: ["cmd"], key: "l" }}
              target={<LanguagesManagerList />}
            />
          </ActionPanel.Section>

          <ActionPanel.Section title="Settings">
            <Action
              shortcut={{ modifiers: ["cmd", "shift"], key: "s" }}
              title={`${autoDetected?.name ?? fromObj.name} <-> ${toObj.name}`}
              onAction={() =>
                setSelected(
                  autoDetected
                    ? { langFrom: langTo, langTo: [autoDetected.code] }
                    : { langFrom: langTo, langTo: [langFrom] },
                )
              }
            />
            <Action
              shortcut={{ modifiers: ["cmd", "shift"], key: "f" }}
              title="Change from Language"
              onAction={() => fromRef.current?.focus()}
            />
            <Action
              shortcut={{ modifiers: ["cmd", "shift"], key: "t" }}
              title="Change to Language"
              onAction={() => toRef.current?.focus()}
            />
          </ActionPanel.Section>
        </ActionPanel>
      }
    >
      <Form.TextArea id="text" title="Text" value={text} onChange={changeText} ref={textRef} />

      <Form.Dropdown
        id="language_from"
        title="From"
        value={autoDetected?.code ?? langFrom}
        ref={fromRef}
        storeValue
        onChange={(value) => {
          setSelected({ ...selected, langFrom: value });
          textRef.current?.focus();
        }}
      >
        {autoDetected ? (
          <Form.Dropdown.Item
            value={autoDetected.code}
            title={`${autoDetected.name} (Auto-detect)`}
          />
        ) : null}
        {languages.map((language) => (
          <Form.Dropdown.Item key={language.code} value={language.code} title={language.name} />
        ))}
      </Form.Dropdown>

      <Form.Dropdown
        id="language_to"
        title="To"
        value={langTo}
        ref={toRef}
        storeValue
        onChange={(value) => {
          setSelected({ ...selected, langTo: [value] });
          textRef.current?.focus();
        }}
      >
        {languages
          .filter((language) => language.code !== AUTO_DETECT)
          .map((language) => (
            <Form.Dropdown.Item key={language.code} value={language.code} title={language.name} />
          ))}
      </Form.Dropdown>

      <Form.TextArea
        id="result"
        title="Translation"
        value={translated?.text ?? ""}
        placeholder="Translation"
      />

      <Form.Description title="Pronunciation" text={translated?.transliteration ?? ""} />

      {/* What the reference does not show at all, and is most of why this port exists. */}
      {translated && (translated.synonyms.length > 0 || translated.examples.length > 0 || translated.definitions.length > 0) ? (
        <Form.Description
          title="Also"
          text={
            [
            ...translated.synonyms.map(
              (group) =>
                `${group.partOfSpeech}: ${group.words.map((word) => word.word).join(", ")}`,
            ),
            ...translated.examples.map((example) => `${translated.text} / ${example}`),
            ...translated.definitions.map(
              (entry) =>
                `${entry.partOfSpeech}: ${entry.text}${entry.example ? ` — “${entry.example}”` : ""}`,
            ),
          ].join("\n") || ""
          }
        />
      ) : null}
    </Form>
  );
}
