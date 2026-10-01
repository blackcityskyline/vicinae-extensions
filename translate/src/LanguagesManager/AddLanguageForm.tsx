import { Action, ActionPanel, Form, showToast, Toast } from "@vicinae/api";
import { useState, type ReactElement } from "react";

import { AUTO_DETECT } from "~/api/google";
import type { LanguageCode } from "~/types";
import { languages } from "~/utils/languages";

/** Adds one source language and any number of targets, as in the reference. */
export function AddLanguageForm({
  onAddLanguage,
}: {
  onAddLanguage: (set: { langFrom: LanguageCode; langTo: LanguageCode[] }) => void;
}): ReactElement {
  const [targets, setTargets] = useState<LanguageCode[]>(["en"]);
  const options = languages.filter((language) => language.code !== AUTO_DETECT);

  return (
    <Form
      actions={
        <ActionPanel>
          <Action.SubmitForm
            title="Add Language Set"
            onSubmit={(values) => {
              const filled = targets.filter(Boolean);
              if (filled.length === 0) {
                void showToast({
                  style: Toast.Style.Failure,
                  title: "No target languages",
                  message: "Please select at least one target language",
                });
                return;
              }
              onAddLanguage({ langFrom: String(values.langFrom ?? AUTO_DETECT), langTo: filled });
            }}
          />
        </ActionPanel>
      }
    >
      <Form.Dropdown id="langFrom" title="Source Language" storeValue>
        {languages.map((language) => (
          <Form.Dropdown.Item key={language.code} value={language.code} title={language.name} />
        ))}
      </Form.Dropdown>

      {targets.map((value, index) => (
        <Form.Dropdown
          key={index}
          id={`langTo.${index}`}
          title={`Target Language ${index + 1}`}
          value={value}
          onChange={(next) =>
            setTargets(targets.map((target, at) => (at === index ? next : target)))
          }
        >
          <Form.Dropdown.Item value="" title="" />
          {options.map((language) => (
            <Form.Dropdown.Item key={language.code} value={language.code} title={language.name} />
          ))}
        </Form.Dropdown>
      ))}

      {targets.length === 0 || targets[targets.length - 1] ? (
        <Form.Dropdown
          id={`langTo.${targets.length}`}
          title={`Target Language ${targets.length}`}
          value=""
          onChange={(next) => setTargets([...targets, next])}
        >
          <Form.Dropdown.Item value="" title="" />
          {options.map((language) => (
            <Form.Dropdown.Item key={language.code} value={language.code} title={language.name} />
          ))}
        </Form.Dropdown>
      ) : null}
    </Form>
  );
}
