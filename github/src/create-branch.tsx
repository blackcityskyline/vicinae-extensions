import { Action, ActionPanel, Clipboard, Form, showToast, Toast } from "@vicinae/api";
import { useCachedPromise } from "@raycast/utils";
import { useState } from "react";

import { listAccessibleRepositories, createBranch, listBranches } from "~/api/github";
import { Icon } from "~/utils/icons";

/**
 * Branch off an existing branch.
 *
 * GitHub's create-reference endpoint needs the commit SHA the new branch points
 * at, not a branch name, so the base branch is resolved to its SHA before the
 * call rather than guessing.
 */
export default function CreateBranch() {
  const [repository, setRepository] = useState("");
  const [name, setName] = useState("");
  const [base, setBase] = useState("");
  const [error, setError] = useState<{ repository?: string; name?: string; base?: string }>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { data: repositories } = useCachedPromise(
    () => listAccessibleRepositories("pushed"),
    [],
  );

  const [owner = "", repoName = ""] = repository.split("/");
  const hasRepository = owner !== "" && repoName !== "";

  const { data: branches } = useCachedPromise((repoOwner: string, repoName: string) => listBranches(repoOwner, repoName), [owner, repoName], {
    execute: hasRepository,
  });

  async function submit() {
    const problems: typeof error = {};
    if (!hasRepository) problems.repository = "Choose a repository.";
    if (name.trim() === "") problems.name = "Name the new branch.";
    if (base === "") problems.base = "Choose a branch to branch off.";
    if (Object.keys(problems).length > 0) {
      setError(problems);
      return;
    }

    const source = (branches ?? []).find((branch) => branch.name === base);
    if (source === undefined) {
      setError({ base: "That branch no longer exists. Pick another." });
      return;
    }

    setError({});
    setIsSubmitting(true);
    try {
      await createBranch(owner, repoName, { ref: name.trim(), sha: source.commit.sha });
      await showToast({
        title: `Created ${name.trim()}`,
        message: `from ${base}`,
        style: Toast.Style.Success,
      });
      setName("");
    } catch (submitError) {
      await showToast({ title: (submitError as Error).message, style: Toast.Style.Failure });
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Form
      isLoading={isSubmitting}
      actions={
        <ActionPanel>
          <Action.SubmitForm title="Create Branch" icon={Icon.Check} onSubmit={submit} />
          <Action
            title="Copy Checkout Command"
            icon={Icon.Terminal}
            onAction={async () => {
              await Clipboard.copy(`git checkout -b ${name.trim() || "my-branch"} ${base || "main"}`);
              await showToast({ title: "Copied checkout command", style: Toast.Style.Success });
            }}
          />
        </ActionPanel>
      }
    >
      <Form.Dropdown
        id="repository"
        title="Repository"
        placeholder="Select a repository"
        value={repository}
        onChange={setRepository}
        error={error.repository}
      >
        {(repositories ?? []).map((item) => (
          <Form.Dropdown.Item
            key={item.id}
            value={item.full_name}
            title={item.full_name}
            icon={item.owner.avatar_url}
          />
        ))}
      </Form.Dropdown>

      <Form.TextField
        id="name"
        title="New Branch Name"
        placeholder="fix/typo-in-readme"
        value={name}
        onChange={setName}
        error={error.name}
      />

      {hasRepository ? (
        <Form.Dropdown
          id="base"
          title="Branch Off"
          placeholder="Select the base branch"
          value={base}
          onChange={setBase}
          error={error.base}
          filtering
        >
          {(branches ?? []).map((branch) => (
            <Form.Dropdown.Item key={branch.commit.sha} value={branch.name} title={branch.name} />
          ))}
        </Form.Dropdown>
      ) : null}
    </Form>
  );
}
