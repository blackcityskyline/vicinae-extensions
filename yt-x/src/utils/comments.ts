/**
 * YouTube comments, as the watch-next call answers them. A reply carries the comments that
 * are visible on the page and a list of entities in `frameworkUpdates`; the text, the author
 * and the like count live in the entity, matched by `commentKey`. Replies are not in the
 * thread at all — a second call behind `repliesToken` fetches them.
 */


type Raw = Record<string, unknown>;
type Entities = Map<string, Raw>;

function asRecord(value: unknown): Raw | null {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Raw) : null;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function asText(value: unknown): string | undefined {
  return typeof value === "string" && value !== "" ? value : undefined;
}

function dig(value: unknown, ...keys: Array<string | number>): unknown {
  let current: unknown = value;
  for (const key of keys) {
    current = typeof key === "number" ? asArray(current)[key] : asRecord(current)?.[key];
    if (current === undefined) return undefined;
  }
  return current;
}

export type Comment = {
  id: string;
  author: string;
  text: string;
  published?: string;
  /** `71K` as YouTube prints it. */
  likes?: string;
  avatar?: string;
  channelId?: string;
};

export type Thread = {
  comment: Comment;
  /** The second call that holds the replies. */
  repliesToken?: string;
  /** What the thread claims, e.g. `688`. */
  replyCount?: string;
};

function entitiesOf(value: unknown): Entities {
  const entities: Entities = new Map();
  for (const mutation of asArray(dig(value, "frameworkUpdates", "entityBatchUpdate", "mutations"))) {
    const key = asText(dig(mutation, "entityKey"));
    const payload = asRecord(dig(mutation, "payload", "commentEntityPayload"));
    if (key !== undefined && payload) entities.set(key, payload);
  }
  return entities;
}

function continuationItems(value: unknown): unknown[] {
  const items: unknown[] = [];
  for (const endpoint of asArray(dig(value, "onResponseReceivedEndpoints"))) {
    items.push(...asArray(dig(endpoint, "reloadContinuationItemsCommand", "continuationItems")));
    items.push(...asArray(dig(endpoint, "appendContinuationItemsAction", "continuationItems")));
  }
  return items;
}

function tokenOf(value: unknown): string | undefined {
  return (
    asText(dig(value, "continuationItemRenderer", "continuationEndpoint", "continuationCommand", "token")) ??
    // "Show more replies" hangs its token off a button
    asText(dig(value, "continuationItemRenderer", "button", "buttonRenderer", "command", "continuationCommand", "token"))
  );
}

/** A thread wraps its view model one level deeper than a reply does. */
function viewModelOf(value: unknown): Raw | null {
  const record = asRecord(value);
  return asRecord(record?.commentViewModel) ?? record;
}

/** One comment: the renderer names it, the entity holds what it says. */
function commentOf(value: unknown, entities: Entities): Comment | null {
  const viewModel = viewModelOf(value);
  const key = asText(dig(viewModel, "commentKey"));
  const id = asText(dig(viewModel, "commentId"));
  const entity = entities.get(key ?? "");
  if (id === undefined || entity === undefined) return null;

  const properties = asRecord(entity.properties);
  const text = asText(dig(properties, "content", "content"));
  const author = asText(dig(entity, "author", "displayName"));
  if (text === undefined || author === undefined) return null;

  const published = asText(dig(properties, "publishedTime"));
  const likes = asText(dig(entity, "toolbar", "likeCountNotliked"));
  const avatar = asText(dig(entity, "author", "avatarThumbnailUrl"));
  const channelId = asText(dig(entity, "author", "channelId"));

  return {
    id,
    author,
    text,
    ...(published ? { published } : {}),
    ...(likes ? { likes } : {}),
    ...(avatar ? { avatar } : {}),
    ...(channelId ? { channelId } : {}),
  };
}

function threadOf(value: unknown, entities: Entities): Thread | null {
  const thread = asRecord(dig(value, "commentThreadRenderer"));
  if (!thread) return null;

  const comment = commentOf(thread.commentViewModel, entities);
  if (!comment) return null;

  const replies = asRecord(dig(thread, "replies", "commentRepliesRenderer"));
  const token = asText(dig(replies, "contents", 0, "continuationItemRenderer", "continuationEndpoint", "continuationCommand", "token"));
  const entity = entities.get(asText(dig(viewModelOf(thread.commentViewModel), "commentKey")) ?? "");
  const replyCount = asText(dig(entity, "toolbar", "replyCount"));

  return {
    comment,
    ...(token === undefined ? {} : { repliesToken: token }),
    ...(replyCount === undefined ? {} : { replyCount }),
  };
}

/** A page of top-level threads, and the token for the next one. */
export function parseCommentsPage(value: unknown): { threads: Thread[]; continuation?: string } {
  const entities = entitiesOf(value);
  const threads: Thread[] = [];
  let continuation: string | undefined;

  for (const item of continuationItems(value)) {
    const thread = threadOf(item, entities);
    if (thread) {
      threads.push(thread);
      continue;
    }
    continuation = tokenOf(item) ?? continuation;
  }

  return { threads, ...(continuation === undefined ? {} : { continuation }) };
}

/** A page of replies to one thread, and the token for more of them. */
export function parseRepliesPage(value: unknown): { replies: Comment[]; continuation?: string } {
  const entities = entitiesOf(value);
  const replies: Comment[] = [];
  let continuation: string | undefined;

  for (const item of continuationItems(value)) {
    const reply = commentOf(dig(item, "commentViewModel"), entities);
    if (reply) {
      replies.push(reply);
      continue;
    }
    continuation = tokenOf(item) ?? continuation;
  }

  return { replies, ...(continuation === undefined ? {} : { continuation }) };
}

function findSection(value: unknown): Raw | null {
  if (Array.isArray(value)) {
    for (const entry of value) {
      const found = findSection(entry);
      if (found) return found;
    }
    return null;
  }

  const record = asRecord(value);
  if (!record) return null;

  const section = asRecord(record.itemSectionRenderer);
  if (section?.sectionIdentifier === "comment-item-section") return section;

  for (const entry of Object.values(record)) {
    const found = findSection(entry);
    if (found) return found;
  }
  return null;
}

/** The watch-next reply only links the comments; this is the token that opens them. */
export function commentsToken(value: unknown): string | undefined {
  return tokenOf(asArray(dig(findSection(value), "contents"))[0]);
}
