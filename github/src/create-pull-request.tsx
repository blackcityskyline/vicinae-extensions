import { Action, ActionPanel, Form, showToast, Toast } from "@vicinae/api";
import { useCachedPromise } from "@raycast/utils";
import { useState } from "react";

import { createPullRequest, listAccessibleRepositories, listBranches } from "~/api/github";
import { Icon } from "~/utils/icons";

/**
 * Create a pull request.
 *
 * The branch list is the 100 most recent branches of the chosen repository,
 * which is the same cap GitHub's own picker uses; `Form.Dropdown` filters them
 * locally as the user types.
 */
export default function CreatePullRequest() {
  const [repository, setRepository] = useState("");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [head, setHead] = useState("");
  const [base, setBase] = useState("");
  const [draft, setDraft] = useState(false);
  const [error, setError] = useState<{ repository?: string; title?: string; branch?: string }>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { data: repositories } = useCachedPromise(
    () => listAccessibleRepositories("pushed"),
    [],
  );

  const [owner = "", name = ""] = repository.split("/");
  const hasRepository = owner !== "" && name !== "";

  const { data: branches } = useCachedPromise((repoOwner: string, repoName: string) => listBranches(repoOwner, repoName), [owner, name], {
    execute: hasRepository,
  });

  async function submit() {
    const problems: typeof error = {};
    if (!hasRepository) problems.repository = "Choose a repository.";
    if (title.trim() === "") problems.title = "Give the pull request a title.";
    if (base === "") problems.branch = "Choose a base branch.";
    if (Object.keys(problems).length > 0) {
      setError(problems);
      return;
    }

    setError({});
    setIsSubmitting(true);
    try {
      const pullRequest = await createPullRequest(owner, name, {
        title: title.trim(),
        body,
        head: head === "" ? base : head,
        base,
        draft,
      });

      await showToast({
        title: draft ? "Opened a draft pull request" : "Opened a pull request",
        message: pullRequest.html_url,
        style: Toast.Style.Success,
      });
      setTitle("");
      setBody("");
      setHead("");
      setDraft(false);
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
          <Action.SubmitForm title="Create Pull Request" icon={Icon.Check} onSubmit={submit} />
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
        id="title"
        title="Title"
        placeholder="Summarise the change"
        value={title}
        onChange={setTitle}
        error={error.title}
      />
      <Form.TextArea
        id="body"
        title="Description"
        placeholder="What this changes and why. Markdown is supported."
        value={body}
        onChange={setBody}
      />

      {hasRepository ? (
        <>
          <Form.Dropdown
            id="base"
            title="Base Branch"
            placeholder="Select the branch to merge into"
            value={base}
            onChange={setBase}
            error={error.branch}
            filtering
          >
            {(branches ?? []).map((branch) => (
              <Form.Dropdown.Item key={branch.commit.sha} value={branch.name} title={branch.name} />
            ))}
          </Form.Dropdown>

          <Form.Dropdown
            id="head"
            title="Compare Branch"
            placeholder="Defaults to the base branch"
            value={head}
            onChange={setHead}
            filtering
          >
            <Form.Dropdown.Item value="" title="Same as base" />
            {(branches ?? []).map((branch) => (
              <Form.Dropdown.Item key={branch.commit.sha} value={branch.name} title={branch.name} />
            ))}
          </Form.Dropdown>
        </>
      ) : null}

      <Form.Checkbox id="draft" title="Draft" label="Open as a draft" value={draft} onChange={setDraft} />
    </Form>
  );
}
