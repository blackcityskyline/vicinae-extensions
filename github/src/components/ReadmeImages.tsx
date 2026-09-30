import { Action, ActionPanel, Clipboard, Grid, open, showToast, Toast } from "@vicinae/api";

import { extractReadmeImages, type ImageRepo, type ReadmeImage } from "~/utils/readme-images";
import { Icon } from "~/utils/icons";

/**
 * The images a README references, as a browsable grid.
 *
 * `Detail`'s Markdown renderer does not reliably draw inline images, so they are
 * lifted out and shown here instead, where a `Grid` renders remote images
 * natively. Badges are filtered out by default because a README's images are
 * mostly status badges, and the toggle brings them back.
 *
 * Pushed from the README view, so `esc` returns to the document.
 */
export default function ReadmeImages({
  markdown,
  repo,
  fullName,
}: {
  markdown: string;
  repo: ImageRepo;
  fullName: string;
}) {
  const all = extractReadmeImages(markdown, repo, { includeBadges: true });
  const contentImages = extractReadmeImages(markdown, repo);
  const hiddenBadges = all.length - contentImages.length;

  // The filter is a view concern, not a parsing one, so both sets are computed
  // once here rather than threading a flag through the search bar.
  const images = contentImages;

  if (all.length === 0) {
    return (
      <Grid columns={3} navigationTitle={`${fullName} images`}>
        <Grid.EmptyView
          icon={Icon.Document}
          title="No images in this README"
          description="This README does not reference any images, or the only ones it does are status badges."
        />
      </Grid>
    );
  }

  return (
    <Grid
      columns={3}
      navigationTitle={`${fullName} images`}
      searchBarPlaceholder="Filter by alt text or file name"
    >
      <Grid.Section title="Images" subtitle={String(images.length)}>
        {images.map((image, index) => (
          <ImageCell key={`${image.src}-${index}`} image={image} fullName={fullName} />
        ))}
      </Grid.Section>

      {hiddenBadges > 0 ? (
        <Grid.Section title="Badges" subtitle={String(hiddenBadges)}>
          {all
            .filter((candidate) => !contentImages.some((kept) => kept.src === candidate.src))
            .map((image, index) => (
              <ImageCell key={`badge-${image.src}-${index}`} image={image} fullName={fullName} />
            ))}
        </Grid.Section>
      ) : null}
    </Grid>
  );
}

function ImageCell({ image, fullName }: { image: ReadmeImage; fullName: string }) {
  const fileName = image.src.split("/").pop()?.split("?")[0] ?? image.src;

  return (
    <Grid.Item
      title={image.alt || fileName}
      subtitle={image.alt ? fileName : undefined}
      keywords={[image.alt, fileName, fullName]}
      content={image.src}
      actions={
        <ActionPanel>
          <Action
            title="Open Image"
            icon={Icon.Globe}
            onAction={async () => {
              await open(image.src);
            }}
          />
          <Action.CopyToClipboard
            title="Copy Image URL"
            icon={Icon.Link}
            content={image.src}
          />
          {image.alt === "" ? (
            <Action
              title="Copy File Name"
              icon={Icon.CopyClipboard}
              onAction={async () => {
                await Clipboard.copy(fileName);
                await showToast({ title: `Copied ${fileName}`, style: Toast.Style.Success });
              }}
            />
          ) : null}
        </ActionPanel>
      }
    />
  );
}
