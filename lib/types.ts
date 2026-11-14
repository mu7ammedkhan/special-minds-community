import type { ChannelType, Kind, StaffRole } from "./options";

/** Shapes that travel from the server to the browser. Browser-safe. */

export type FileView = { id: number; kind: "image" | "audio" | "file"; name: string; mime: string; size: number; w: number | null; h: number | null; ms: number | null };

export type Author = {
  id: number; name: string; kind: Kind; staff: StaffRole | null; avatar: number | null; verified: string | null;
  /** Posted anonymously: name is empty; staff still see who (realName, realId). */
  anonymous?: boolean; realName?: string; realId?: number;
};

export type PollView = { options: string[]; counts: number[]; mine: number[]; voters: number; multi: boolean; closesAt: string | null; closed: boolean };

export type OppData = {
  role: string; city: string; area?: string; schedule?: string; childAge?: string; needs?: string; languages?: string[];
  gender?: "any" | "female" | "male"; start?: string; pay?: string; details?: string; status?: "open" | "filled"; filledAt?: string; nudge?: boolean;
};
export type EventData = { startsAt: string; endsAt?: string | null; place?: string; online?: string; capacity?: number | null };
export type ResourceData = { category?: string; url?: string };

export type PostView = {
  id: number; channelId: number | null; dmId: number | null; parentId: number | null;
  kind: "message" | "topic" | "opportunity" | "event" | "resource" | "poll" | "system";
  title: string | null; body: string; data: Record<string, unknown>;
  status: "published" | "pending" | "held" | "removed" | "scheduled"; holdReason: string | null; flagged: string | null; publishAt: string | null;
  pinned: boolean; locked: boolean; editedAt: string | null; replyCount: number; lastReplyAt: string | null; createdAt: string; updatedAt: string;
  author: Author; mine: boolean; anonymous: boolean;
  reactions: { emoji: string; count: number; mine: boolean }[];
  files: FileView[];
  mentions: Record<string, string>;
  bestAnswerId: number | null;
  poll?: PollView;
  opp?: { answer: "interested" | "not_for_me" | null; stage: string | null; interested: number | null; matched: boolean };
  event?: { rsvp: "going" | "maybe" | "no" | null; going: number; maybe: number };
  views?: number | null;
  /** Feed posts: the last comments, oldest first. */
  preview?: PostView[];
  can: { edit: boolean; remove: boolean; moderate: boolean; react: boolean; reply: boolean };
};

export type ChannelView = {
  id: number; spaceId: number; spaceSlug: string; slug: string; name: string; topic: string | null; type: ChannelType;
  visibility: "open" | "private" | "hidden"; joined: boolean; notify: "all" | "mentions" | "off";
  locked: boolean; announceOnly: boolean; allowAnonymous: boolean; childPhotos: boolean; caseTalk: boolean; tz: string;
  audience: "specialists" | "families" | "mixed";
  perms: { view: boolean; post: boolean; reply: boolean; react: boolean; upload: boolean };
  moderate: boolean;
  block: { reason: string; text: string } | null;
};

export type MemberChip = { id: number; name: string; kind: Kind; staff: StaffRole | null; avatar: number | null; verified: string | null };
