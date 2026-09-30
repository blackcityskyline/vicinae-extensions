import { List } from "@vicinae/api";
import type { Image } from "@vicinae/api";
import type { ReactNode } from "react";

import { Icon } from "~/utils/icons";

/**
 * The single empty-state component every list uses.
 *
 * Three states have to be distinguished and none of them may be blank: still
 * loading, a failure the user can act on, and a successful search that matched
 * nothing. A list that only says "No results" leaves the user with nothing to do
 * next, which is the UX-001 failure the maintainers' rules call out.
 */
export default function ListEmptyView({
  isLoading,
  error,
  title,
  description,
  icon = Icon.Bubble,
  actions,
}: {
  isLoading?: boolean | undefined;
  error?: Error | undefined;
  title: string;
  description: string;
  icon?: Image.ImageLike;
  actions?: ReactNode;
}) {
  if (isLoading) {
    return (
      <List.EmptyView
        icon={Icon.ArrowClockwise}
        title="Loading"
        description="Fetching results from GitHub."
      />
    );
  }

  if (error) {
    return (
      <List.EmptyView
        icon={Icon.Warning}
        title={error.message}
        description="Check the token and its scopes in this extension's preferences, then try again."
      />
    );
  }

  return <List.EmptyView icon={icon} title={title} description={description} actions={actions} />;
}
