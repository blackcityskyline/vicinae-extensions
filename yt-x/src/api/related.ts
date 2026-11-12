import { nextReply } from "~/api/innertube";
import type { Config, Entry } from "~/types";
import { parseRelated } from "~/utils/related";

/** The related column: yt-dlp answers one video, YouTube's watch-next call answers its neighbours. */
export async function relatedVideos(videoId: string, config: Config): Promise<Entry[]> {
  return parseRelated(await nextReply({ videoId }, config, "the related videos"));
}
