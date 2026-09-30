import { Form } from "@vicinae/api";
import { useState } from "react";
import useOneTimePasswordHistoryWarning from "~/utils/hooks/useOneTimePasswordHistoryWarning";
import usePasswordGenerator, { UsePasswordGeneratorResult } from "~/utils/hooks/usePasswordGenerator";
import { PasswordGeneratorOptions, PasswordType } from "~/types/passwords";
import FormActionPanel from "~/components/generatePassword/ActionPanel";
import { BitwardenProvider } from "~/context/bitwarden";
import RootErrorBoundary from "~/components/RootErrorBoundary";
import { useCliVersion } from "~/utils/hooks/useCliVersion";
import { capitalize } from "~/utils/strings";

const GeneratePasswordCommand = () => (
  <RootErrorBoundary>
    <BitwardenProvider>
      <GeneratePasswordForm />
    </BitwardenProvider>
  </RootErrorBoundary>
);

function GeneratePasswordForm() {
  const generator = usePasswordGenerator();
  const { options } = generator;

  // Options load asynchronously from LocalStorage on first render.
  if (!options) return <Form isLoading />;
  return <GeneratePasswordFormContent generator={generator} options={options} />;
}

const passwordTypeOptions: PasswordType[] = ["password", "passphrase"];

/** Bitwarden added the min-number and min-special options in this release. */
const MIN_CHAR_COUNT_SINCE = 2023.9;

function GeneratePasswordFormContent({
  generator,
  options,
}: {
  generator: UsePasswordGeneratorResult;
  options: PasswordGeneratorOptions;
}) {
  const { password, isGenerating, regeneratePassword } = generator;
  const cliVersion = useCliVersion();

  // Every field regenerates on change, so this is plain controlled state rather
  // than a validated submit form.
  const [values, setValues] = useState<PasswordGeneratorOptions>(options);

  useOneTimePasswordHistoryWarning();

  function update<K extends keyof PasswordGeneratorOptions>(key: K, value: PasswordGeneratorOptions[K]) {
    setValues((current) => {
      const next = { ...current, [key]: value };
      void regeneratePassword(next);
      return next;
    });
  }

  return (
    <Form
      isLoading={isGenerating}
      actions={<FormActionPanel password={password} regeneratePassword={regeneratePassword} />}
    >
      <Form.Description title="Generated password" text={password ?? "Generating..."} />
      <Form.Separator />
      <Form.Dropdown
        id="type"
        title="Type"
        autoFocus
        value={values.passphrase ? "passphrase" : "password"}
        onChange={(value) => update("passphrase", value === "passphrase")}
      >
        {passwordTypeOptions.map((type) => (
          <Form.Dropdown.Item key={type} value={type} title={capitalize(type)} />
        ))}
      </Form.Dropdown>

      {values.passphrase ? (
        <>
          <Form.TextField
            id="words"
            title="Number of words"
            placeholder="3 - 20"
            value={values.words}
            onChange={(value) => update("words", value)}
          />
          <Form.TextField
            id="separator"
            title="Word separator"
            placeholder="this-is-a-passphrase"
            value={values.separator}
            onChange={(value) => update("separator", value)}
          />
          <Form.Checkbox
            id="capitalize"
            title="Capitalize"
            label="This-Is-A-Passphrase"
            value={!!values.capitalize}
            onChange={(value) => update("capitalize", value)}
          />
          <Form.Checkbox
            id="includeNumber"
            title="Include number"
            label="This2-Is-A-Passphrase"
            value={!!values.includeNumber}
            onChange={(value) => update("includeNumber", value)}
          />
        </>
      ) : (
        <>
          <Form.TextField
            id="length"
            title="Length of the password"
            placeholder="5 - 128"
            value={values.length}
            onChange={(value) => update("length", value)}
          />
          <Form.Checkbox
            id="uppercase"
            title="Uppercase characters"
            label="ABCDEFGHIJLMNOPQRSTUVWXYZ"
            value={!!values.uppercase}
            onChange={(value) => update("uppercase", value)}
          />
          <Form.Checkbox
            id="lowercase"
            title="Lowercase characters"
            label="abcdefghijklmnopqrstuvwxyz"
            value={!!values.lowercase}
            onChange={(value) => update("lowercase", value)}
          />
          <Form.Checkbox
            id="number"
            title="Numeric characters"
            label="0123456789"
            value={!!values.number}
            onChange={(value) => update("number", value)}
          />
          {cliVersion >= MIN_CHAR_COUNT_SINCE && values.number && (
            <Form.TextField
              id="minNumber"
              title="Minimum numbers"
              placeholder="1"
              value={values.minNumber}
              onChange={(value) => update("minNumber", value)}
            />
          )}
          <Form.Checkbox
            id="special"
            title="Special characters"
            label="!@#$%^&*()_+-=[]{}|;:,./<>?"
            value={!!values.special}
            onChange={(value) => update("special", value)}
          />
          {cliVersion >= MIN_CHAR_COUNT_SINCE && values.special && (
            <Form.TextField
              id="minSpecial"
              title="Minimum special"
              placeholder="1"
              value={values.minSpecial}
              onChange={(value) => update("minSpecial", value)}
            />
          )}
        </>
      )}
    </Form>
  );
}

export default GeneratePasswordCommand;
