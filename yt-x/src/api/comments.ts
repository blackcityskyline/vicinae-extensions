import { nextReply } from "~/api/innertube";
import type { Config } from "~/types";
import {
  commentsToken,
  parseCommentsPage,
  parseRepliesPage,
  type Comment,
  type Thread,
} from "~/utils/comments";

export type CommentsPage = { threads: Thread[]; continuation?: string };
export type RepliesPage = { replies: Comment[]; continuation?: string };

/** The first page: the watch reply only links the section, so one more call opens it. */
export async function comments(videoId: string, config: Config): Promise<CommentsPage> {
  const watch = await nextReply({ videoId }, config, "the comments");
  const token = commentsToken(watch);
  if (token === undefined) throw new Error("This video has no comments section");

  let page = parseCommentsPage(await nextReply({ videoId, continuation: token }, config, "the comments"));
  // some videos answer a header first and the threads on the token that header carries
  while (page.threads.length === 0 && page.continuation !== undefined) {
    page = parseCommentsPage(
      await nextReply({ videoId, continuation: page.continuation }, config, "the comments"),
    );
  }
  return page;
}

export async function moreComments(videoId: string, continuation: string, config: Config): Promise<CommentsPage> {
  return parseCommentsPage(await nextReply({ videoId, continuation }, config, "the comments"));
}

export async function commentReplies(videoId: string, continuation: string, config: Config): Promise<RepliesPage> {
  return parseRepliesPage(await nextReply({ videoId, continuation }, config, "the replies"));
}
