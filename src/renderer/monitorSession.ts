import type { ActivityItem, SessionRecord } from "../shared/sessionTypes";

export type TimelineItem = ActivityItem & {
  label: string;
};

/**
 * Renderer row model: same core fields as {@link SessionRecord}, plus mock-only
 * presentation fields until IPC wiring lands.
 */
export type MonitorSessionRow = SessionRecord & {
  titleLabel: string;
  shortId: string;
  updatedLabel: string;
  durationLabel: string;
  pendingCount: number;
  loading: boolean;
  collapsedSummary: string;
  timelineItems: TimelineItem[];
  activityItems: ActivityItem[];
  hoverSummary: string;
};
