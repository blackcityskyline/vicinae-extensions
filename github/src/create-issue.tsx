import { Action, ActionPanel, Form, showToast, Toast } from "@vicinae/api";
import { useCachedPromise } from "@raycast/utils";
import { useState } from "react";

import { createIssue, listAccessibleRepositories, listAssignees, listLabels } from "~/api/github";
import { Icon } from "~/utils/icons";

/**
 * Create an issue.
 *
 * The repository list is the viewer's own repositories rather than a global
 * search: you file issues on repositories you have access to, and enumerating
 * them keeps the dropdown working offline and instantly. Controlled fields are
 * used instead of `useForm` so there is no `Form.Values` type bridge between
 * `@raycast/utils` and `@vicinae/api`.
 */
export default function CreateIssue() {
  const [repository, setRepository] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [label, setLabel] = useState("");
  const [assignee, setAssignee] = useState("");
  const [error, setError] = useState<{ repository?: string; title?: string }>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { data: repositories } = useCachedPromise(
    () => listAccessibleRepositories("pushed"),
    [],
  );

  const [owner = "", name = ""] = repository.split("/");

  const { data: labels } = useCachedPromise((repoOwner: string, repoName: string) => listLabels(repoOwner, repoName), [owner, name], {
    execute: owner !== "" && name !== "",
  });

  const { data: assignees } = useCachedPromise((repoOwner: string, repoName: string) => listAssignees(repoOwner, repoName), [owner, name], {
    execute: owner !== "" && name !== "",
  });

  async function submit() {
    // Both problems are reported at once: fixing them one round trip at a time
    // is pointless when both are visible in the same form.
    const problems: typeof error = {};
    if (repository === "") problems.repository = "Choose a repository.";
    if (title.trim() === "") problems.title = "Give the issue a title.";
    if (problems.repository !== undefined || problems.title !== undefined) {
      setError(problems);
      return;
    }

    setError({});
    setIsSubmitting(true);
    try {
      const issue = await createIssue(owner, name, {
        title: title.trim(),
        body: description,
        labels: label === "" ? [] : [label],
        assignees: assignee === "" ? [] : [assignee],
      });

      await showToast({
        title: `Opened #${issue.number}`,
        message: issue.html_url,
        style: Toast.Style.Success,
      });
      setTitle("");
      setDescription("");
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
          <Action.SubmitForm title="Create Issue" icon={Icon.Check} onSubmit={submit} />
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
        placeholder="Summarise the problem"
        value={title}
        onChange={setTitle}
        error={error.title}
      />
      <Form.TextArea
        id="description"
        title="Description"
        placeholder="What happened, what you expected, how to reproduce. Markdown is supported."
        value={description}
        onChange={setDescription}
      />

      {labels !== undefined && labels.length > 0 ? (
        <Form.Dropdown id="label" title="Label" value={label} onChange={setLabel} placeholder="No label">
          {labels.map((item) => (
            <Form.Dropdown.Item
              key={item.name}
              value={item.name}
              title={item.name}
              icon={{ source: `https://github.com/labels/${item.color}.png`, tintColor: `#${item.color}` }}
            />
          ))}
        </Form.Dropdown>
      ) : null}

      {assignees !== undefined && assignees.length > 0 ? (
        <Form.Dropdown
          id="assignee"
          title="Assignee"
          value={assignee}
          onChange={setAssignee}
          placeholder="Unassigned"
        >
          {assignees.map((item) => (
            <Form.Dropdown.Item
              key={item.id}
              value={item.login}
              title={item.login}
              icon={item.avatar_url}
            />
          ))}
        </Form.Dropdown>
      ) : null}
    </Form>
  );
}
