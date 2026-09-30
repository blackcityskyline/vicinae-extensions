import { Action, ActionPanel, List, Toast, environment, showToast } from "@vicinae/api";
import { useEffect, useState } from "react";

/**
 * Entry point for the `hello` command declared in package.json.
 *
 * `mode: "view"` commands export a React component; `mode: "no-view"` commands
 * export a plain async function. See docs/api-porting.md.
 */
export default function HelloCommand() {
  const [items, setItems] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Replace with the real work. Keep logic in its own module under src/ so it
    // can be unit tested without rendering anything.
    setItems(["First item", "Second item"]);
    setIsLoading(false);
  }, []);

  return (
    <List isLoading={isLoading} searchBarPlaceholder="Search items">
      {items.map((item) => (
        <List.Item
          key={item}
          title={item}
          actions={
            <ActionPanel>
              <Action.CopyToClipboard title="Copy" content={item} />
              <Action
                title="Show Info"
                onAction={async () => {
                  await showToast(Toast.Style.Success, `Running ${environment.commandName}`);
                }}
              />
            </ActionPanel>
          }
        />
      ))}
      <List.EmptyView title="Nothing here yet" description="Replace the placeholder data in src/hello.tsx" />
    </List>
  );
}
