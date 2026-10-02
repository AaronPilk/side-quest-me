import { z } from "zod";
import {
  seriesSaveSchema,
  seriesStartFromRunSchema,
  type SeriesDetail,
  type SeriesPart,
  type SeriesSave,
  type SeriesStartFromRun,
  type SeriesSummary,
  type SeriesTemplate,
} from "../../shared/series";
import { request } from "./api";
import { DEMO } from "./auth";
import { CONTENT_REVIEW_CONSENT_HEADER } from "../../shared/content-review";
import {
  demoSeriesDetail,
  demoSeriesList,
  demoSeriesPart,
  demoSeriesMutate,
  demoSeriesTemplates,
  demoSeriesStartFromRun,
} from "./demo-series";
export const seriesApi = {
  list: async (creatorId?: string, mine = false): Promise<SeriesSummary[]> =>
    DEMO
      ? demoSeriesList(creatorId, mine)
      : request(
          `/api/series${mine ? "/mine" : creatorId ? `?creatorId=${encodeURIComponent(z.uuid().parse(creatorId))}` : ""}`,
        ),
  detail: async (id: string): Promise<SeriesDetail> =>
    DEMO
      ? demoSeriesDetail(z.uuid().parse(id))
      : request(`/api/series/${z.uuid().parse(id)}`),
  part: async (
    id: string,
  ): Promise<{
    series: SeriesSummary;
    part: SeriesPart;
    canStart: boolean;
    reason: string | null;
  }> =>
    DEMO
      ? demoSeriesPart(z.uuid().parse(id))
      : request(`/api/series/parts/${z.uuid().parse(id)}`),
  templates: async (): Promise<SeriesTemplate[]> =>
    DEMO ? demoSeriesTemplates() : request("/api/series/templates"),
  startFromRun: async (
    input: SeriesStartFromRun,
    key = crypto.randomUUID(),
  ): Promise<SeriesDetail> => {
    const parsed = seriesStartFromRunSchema.parse(input);
    return DEMO
      ? demoSeriesStartFromRun(parsed, key)
      : request("/api/series/mutate", {
          method: "POST",
          headers: { "Idempotency-Key": key },
          body: JSON.stringify({ action: "start_from_run", input: parsed }),
        });
  },
  save: async (
    input: SeriesSave,
    key = crypto.randomUUID(),
    contentReviewConsent = false,
  ): Promise<SeriesDetail> => {
    const parsed = seriesSaveSchema.parse(input);
    return DEMO
      ? demoSeriesMutate("save", parsed, key)
      : request("/api/series/mutate", {
          method: "POST",
          headers: {
            "Idempotency-Key": key,
            ...(contentReviewConsent
              ? { [CONTENT_REVIEW_CONSENT_HEADER]: "true" }
              : {}),
          },
          body: JSON.stringify({ action: "save", input: parsed }),
        });
  },
  follow: async (
    id: string,
    following: boolean,
    key = crypto.randomUUID(),
  ): Promise<SeriesDetail> => {
    const input = { id: z.uuid().parse(id), following };
    return DEMO
      ? demoSeriesMutate("follow", input, key)
      : request("/api/series/mutate", {
          method: "POST",
          headers: { "Idempotency-Key": key },
          body: JSON.stringify({ action: "follow", input }),
        });
  },
};
