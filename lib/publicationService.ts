export type PublicationType = "Primary Research" | "Review";
export type PublicationSource = "PubMed" | "Scopus" | "Web of Science";

export type Publication = {
  id: string;
  title: string;
  authors: string;
  journal: string;
  date: string;
  citationCount: number;
  aiPublicationType: PublicationType;
  abstract: string;
  source: PublicationSource;
  sources?: PublicationSource[];
  doi?: string;
  url?: string;
  sourceUrls?: Partial<Record<PublicationSource, string>>;
  rcr?: number;
};

const mockPublications: Publication[] = [
  {
    id: "mock-001",
    title: "Simulation-Based Learning and Clinical Readiness in Undergraduate Nursing",
    authors: "Jordan Lee, Maria Alvarez, Priya Shah",
    journal: "Journal of Nursing Education",
    date: "2023-06-12",
    citationCount: 34,
    aiPublicationType: "Primary Research",
    abstract:
      "A multi-site study assessing the impact of simulation-based learning on clinical readiness scores among undergraduate nursing cohorts.",
    source: "PubMed",
  },
  {
    id: "mock-002",
    title: "Evidence-Based Interventions for Nurse Burnout: A Systematic Review",
    authors: "Amelia Grant, Kelvin Brooks",
    journal: "Nursing Outlook",
    date: "2022-11-03",
    citationCount: 57,
    aiPublicationType: "Review",
    abstract:
      "This systematic review synthesizes evidence-based interventions that reduce burnout and improve retention among registered nurses.",
    source: "PubMed",
  },
  {
    id: "mock-003",
    title: "Telehealth Adoption in Rural Maternal Care",
    authors: "Priya Shah, Thomas Nguyen, Jordan Lee",
    journal: "Telemedicine and e-Health",
    date: "2024-02-19",
    citationCount: 12,
    aiPublicationType: "Primary Research",
    abstract:
      "A longitudinal cohort analysis measuring telehealth adoption and maternal outcomes across rural health networks.",
    source: "PubMed",
  },
];

const inferPublicationType = (abstract: string): PublicationType => {
  const normalized = abstract.toLowerCase();
  if (
    normalized.includes("systematic review") ||
    normalized.includes("meta-analysis") ||
    normalized.includes("scoping review")
  ) {
    return "Review";
  }
  return "Primary Research";
};

export async function classifyPaper(abstract: string): Promise<PublicationType> {
  const {
    LITELLM_BASE_URL,
    LITELLM_API_KEY,
  } = process.env;

  if (LITELLM_BASE_URL && LITELLM_API_KEY) {
    try {
      const response = await fetch(`${LITELLM_BASE_URL.replace(/\/$/, "")}/v1/chat/completions`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LITELLM_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          temperature: 0,
          messages: [
            {
              role: "system",
              content:
                "You label abstracts as either Primary Research or Review. Reply with exactly one of those labels.",
            },
            {
              role: "user",
              content: `Abstract:\\n${abstract}`,
            },
          ],
        }),
      });

      if (response.ok) {
        const data = (await response.json()) as {
          choices?: { message?: { content?: string } }[];
        };
        const content = data.choices?.[0]?.message?.content?.trim() ?? "";
        if (content === "Primary Research" || content === "Review") {
          return content;
        }
      }
    } catch {
      // Fall back to heuristic.
    }
  }

  return inferPublicationType(abstract);
}

export type PublicationResult = {
  publications: Publication[];
  errors: string[];
};

type ScopusEntry = {
  "dc:identifier"?: string;
  "dc:title"?: string;
  "dc:creator"?: string;
  "prism:publicationName"?: string;
  "prism:coverDate"?: string;
  "prism:doi"?: string;
  "citedby-count"?: string;
  "dc:description"?: string;
};

type ScopusSearchResponse = {
  "search-results"?: {
    "opensearch:totalResults"?: string;
    "opensearch:startIndex"?: string;
    "opensearch:itemsPerPage"?: string;
    entry?: ScopusEntry[];
  };
};

type WosDocument = {
  uid?: string;
  UID?: string;
  static_data?: Record<string, unknown>;
  dynamic_data?: Record<string, unknown>;
};

type WosResponse = {
  data?: unknown;
  documents?: WosDocument[];
  hits?: WosDocument[];
  records?: WosDocument[];
  metadata?: Record<string, unknown>;
  meta?: Record<string, unknown>;
  links?: Record<string, unknown>;
};

const getTextValue = (value: unknown): string | null => {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }
  if (typeof value === "number") {
    return value.toString();
  }
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return getTextValue(record.content ?? record.text ?? record.value ?? record.title);
  }
  return null;
};

const getFirstTextValue = (values: unknown[]): string | null => {
  for (const value of values) {
    const text = getTextValue(value);
    if (text) {
      return text;
    }
  }
  return null;
};

const ensureArray = (value: unknown): unknown[] => {
  if (Array.isArray(value)) {
    return value;
  }
  if (value == null) {
    return [];
  }
  return [value];
};

const normalizeDoi = (doi?: string | null) =>
  doi ? doi.trim().toLowerCase() : "";

const normalizeTitle = (title: string) =>
  title.toLowerCase().replace(/[^a-z0-9]+/g, "");

const buildDoiUrl = (doi?: string | null) => {
  const normalized = normalizeDoi(doi);
  return normalized ? `https://doi.org/${normalized}` : undefined;
};

export const mergePublications = (
  pubmedPublications: Publication[],
  scopusPublications: Publication[],
  wosPublications: Publication[],
): Publication[] => {
  const merged = new Map<string, Publication>();
  const byDoi = new Map<string, Publication>();
  const byTitle = new Map<string, Publication>();
  const sourcePriority: PublicationSource[] = ["Scopus", "Web of Science", "PubMed"];

  const upsert = (publication: Publication) => {
    const doiKey = normalizeDoi(publication.doi);
    const titleKey = normalizeTitle(publication.title);
    if (!doiKey && !titleKey) {
      return;
    }

    const existing =
      (doiKey ? byDoi.get(doiKey) : undefined) ??
      (titleKey ? byTitle.get(titleKey) : undefined);

    const sources = new Set<PublicationSource>(
      publication.sources ?? [publication.source],
    );

    const sourceUrls: Partial<Record<PublicationSource, string>> = {
      ...(publication.sourceUrls ?? {}),
      ...(publication.url ? { [publication.source]: publication.url } : {}),
    };

    if (!existing) {
      const mergedPublication = {
        ...publication,
        sources: Array.from(sources),
        url: buildDoiUrl(publication.doi) ?? publication.url,
        sourceUrls,
      };
      const key = doiKey || titleKey;
      if (key) {
        merged.set(key, mergedPublication);
      }
      if (doiKey) {
        byDoi.set(doiKey, mergedPublication);
      }
      if (titleKey) {
        byTitle.set(titleKey, mergedPublication);
      }
      return;
    }

    const existingSources = new Set<PublicationSource>(existing.sources ?? [existing.source]);
    for (const source of sources) {
      existingSources.add(source);
    }

    const mergedDoi = normalizeDoi(existing.doi) ? existing.doi : publication.doi;
    const mergedUrl = buildDoiUrl(mergedDoi) ?? existing.url ?? publication.url;
    const mergedCitationCount = Math.max(existing.citationCount, publication.citationCount);
    const mergedRcr = existing.rcr ?? publication.rcr;

    const selectedSource =
      sourcePriority.find((source) => existingSources.has(source)) ?? existing.source;

    const mergedSourceUrls = {
      ...(existing.sourceUrls ?? {}),
      ...sourceUrls,
    };

    const updated: Publication = {
      ...existing,
      doi: mergedDoi,
      url: mergedUrl,
      citationCount: mergedCitationCount,
      rcr: mergedRcr,
      source: selectedSource,
      sources: Array.from(existingSources),
      sourceUrls: mergedSourceUrls,
    };

    if (doiKey) {
      byDoi.set(doiKey, updated);
    }
    if (titleKey) {
      byTitle.set(titleKey, updated);
    }
    merged.set(doiKey || titleKey, updated);
  };

  for (const publication of pubmedPublications) {
    upsert(publication);
  }
  for (const publication of scopusPublications) {
    upsert(publication);
  }
  for (const publication of wosPublications) {
    upsert(publication);
  }

  return Array.from(merged.values());
};

const normalizeName = (value: string) =>
  value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

const extractNameParts = (value: string) => {
  const parts = normalizeName(value).split(" ").filter(Boolean);
  if (parts.length === 0) {
    return { parts: [], last: null, first: null, initial: null };
  }
  const last = parts[parts.length - 1];
  const first = parts[0];
  const initial = first ? first[0] : null;
  return { parts, last, first, initial };
};

const parseAuthorForMatching = (author: string) => {
  const trimmed = author.trim();
  if (!trimmed) {
    return { last: null, first: null, initial: null };
  }
  if (trimmed.includes(",")) {
    const [lastPart, ...rest] = trimmed.split(",");
    const last = normalizeName(lastPart);
    const firstPart = rest.join(" ").trim();
    const firstTokens = normalizeName(firstPart).split(" ").filter(Boolean);
    const first = firstTokens[0] ?? null;
    const initial = first ? first[0] : null;
    return { last: last || null, first, initial };
  }
  const parts = normalizeName(trimmed).split(" ").filter(Boolean);
  if (parts.length === 0) {
    return { last: null, first: null, initial: null };
  }
  if (parts.length === 2 && parts[1].length === 1) {
    return { last: parts[0], first: null, initial: parts[1] };
  }
  if (parts.length >= 2) {
    return { last: parts[parts.length - 1], first: parts[0], initial: parts[0][0] };
  }
  return { last: parts[0], first: null, initial: parts[0][0] };
};

const includesAuthorName = (authors: string[], authorName: string) => {
  const target = extractNameParts(authorName);
  if (target.parts.length === 0 || !target.last) {
    return false;
  }
  return authors.some((author) => {
    const normalizedAuthor = normalizeName(author);
    if (!normalizedAuthor) {
      return false;
    }
    if (target.parts.every((part) => normalizedAuthor.includes(part))) {
      return true;
    }
    const parsed = parseAuthorForMatching(author);
    if (!parsed.last) {
      return false;
    }
    if (parsed.last !== target.last) {
      return false;
    }
    if (target.first && parsed.first && parsed.first === target.first) {
      return true;
    }
    if (target.initial && parsed.initial && parsed.initial === target.initial) {
      return true;
    }
    return false;
  });
};

export async function fetchFromScopus(authorName: string): Promise<Publication[]> {
  const apiKey = process.env.SCOPUS_API_KEY ?? process.env.NEXT_PUBLIC_SCOPUS_API_KEY;
  if (!apiKey) {
    console.error("[Scopus] Missing API key");
    return [];
  }

  const searchParams = new URLSearchParams({
    query: `AUTHOR-NAME(${authorName})`,
  });
  const requestBaseUrl = "https://api.elsevier.com/content/search/scopus";

  try {
    const count = 25;
    let start = 0;
    let total: number | null = null;
    const entries: ScopusEntry[] = [];

    while (total == null || start < total) {
      const pageParams = new URLSearchParams(searchParams);
      pageParams.set("start", start.toString());
      pageParams.set("count", count.toString());
      const requestUrl = `${requestBaseUrl}?${pageParams.toString()}`;

      const response = await fetch(requestUrl, {
        headers: {
          "X-ELS-APIKey": apiKey,
          Accept: "application/json",
        },
      });

      if (!response.ok) {
        const errorBody = await response.text();
        console.error("[Scopus] Request failed", {
          status: response.status,
          statusText: response.statusText,
          errorBody,
        });
        return [];
      }

      const data = (await response.json()) as ScopusSearchResponse;
      const pageEntries = data["search-results"]?.entry ?? [];
      const totalText = data["search-results"]?.["opensearch:totalResults"];
      if (total == null && totalText) {
        const parsedTotal = Number.parseInt(totalText, 10);
        total = Number.isFinite(parsedTotal) ? parsedTotal : null;
      }

      if (pageEntries.length === 0) {
        break;
      }

      entries.push(...pageEntries);
      start += pageEntries.length;

      if (pageEntries.length < count && total == null) {
        break;
      }
    }

    const publications = await Promise.all(
      entries.map(async (entry, index) => {
        const abstract = entry["dc:description"] ?? "";
        const aiPublicationType = await classifyPaper(abstract);
        const doi = entry["prism:doi"]?.trim();
        const identifier = entry["dc:identifier"]?.replace("SCOPUS_ID:", "scopus-");
        const scopusId = entry["dc:identifier"]?.replace("SCOPUS_ID:", "");
        const id = doi ? `doi:${doi}` : identifier ?? `scopus-${index}`;
        const scopusUrl = scopusId
          ? `https://www.scopus.com/record/display.uri?scp=${scopusId}&origin=resultslist`
          : undefined;

        return {
          id,
          title: entry["dc:title"] ?? "Untitled publication",
          authors: entry["dc:creator"] ?? "N/A",
          journal: entry["prism:publicationName"] ?? "Unknown journal",
          date: entry["prism:coverDate"] ?? "Unknown date",
          citationCount: Number.parseInt(entry["citedby-count"] ?? "0", 10) || 0,
          aiPublicationType,
          abstract,
          source: "Scopus",
          doi,
          url: buildDoiUrl(doi) ?? scopusUrl,
          sourceUrls: scopusUrl ? { Scopus: scopusUrl } : undefined,
        } satisfies Publication;
      }),
    );

    return publications;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("[Scopus] Fetch failed", { message });
    return [];
  }
}

export async function fetchFromWoS(authorName: string): Promise<Publication[]> {
  const apiKey = process.env.WOS_API_KEY ?? process.env.NEXT_PUBLIC_WOS_API_KEY;
  if (!apiKey) {
    console.error("[Web of Science] Missing API key");
    return [];
  }

  const limit = 50;
  const requestBaseUrl = "https://api.clarivate.com/apis/wos-starter/v1/documents";

  const buildAuthorVariants = (name: string) => {
    const trimmed = name.trim();
    if (!trimmed) {
      return [];
    }
    const parts = trimmed.split(/\s+/).filter(Boolean);
    if (parts.length === 1) {
      return [trimmed];
    }
    const lastName = parts[parts.length - 1];
    const firstName = parts[0];
    const firstInitial = firstName[0] ?? "";
    const variants = new Set<string>();
    variants.add(trimmed);
    if (firstInitial) {
      variants.add(`${lastName} ${firstInitial}`);
      variants.add(`${lastName}, ${firstInitial}`);
    }
    variants.add(`${lastName} ${firstName}`);
    variants.add(lastName);
    return Array.from(variants);
  };

  const extractDocuments = (payload: WosResponse): WosDocument[] => {
    if (Array.isArray(payload.data)) {
      return payload.data as WosDocument[];
    }
    if (Array.isArray(payload.documents)) {
      return payload.documents;
    }
    if (Array.isArray(payload.hits)) {
      return payload.hits;
    }
    if (Array.isArray(payload.records)) {
      return payload.records;
    }
    if (payload.data && typeof payload.data === "object") {
      const dataRecord = payload.data as Record<string, unknown>;
      const candidates = [
        dataRecord.documents,
        dataRecord.records,
        dataRecord.hits,
        dataRecord.results,
      ];
      for (const candidate of candidates) {
        if (Array.isArray(candidate)) {
          return candidate as WosDocument[];
        }
      }
    }
    return [];
  };

  const extractTotal = (payload: WosResponse): number | null => {
    const meta =
      payload.metadata ??
      payload.meta ??
      (payload.data && typeof payload.data === "object"
        ? ((payload.data as Record<string, unknown>).metadata as Record<string, unknown>)
        : undefined);
    if (meta) {
      const totalValue = getTextValue(
        (meta as Record<string, unknown>).total ??
          (meta as Record<string, unknown>).total_results ??
          (meta as Record<string, unknown>).totalRecords ??
          (meta as Record<string, unknown>).recordCount,
      );
      if (totalValue) {
        const total = Number.parseInt(totalValue, 10);
        if (Number.isFinite(total)) {
          return total;
        }
      }
    }
    const fallbackTotal = getTextValue(
      (payload as Record<string, unknown>).total ??
        (payload as Record<string, unknown>).total_results ??
        (payload as Record<string, unknown>).recordCount,
    );
    if (fallbackTotal) {
      const total = Number.parseInt(fallbackTotal, 10);
      if (Number.isFinite(total)) {
        return total;
      }
    }
    return null;
  };

  try {
    const fetchDocumentsForQuery = async (query: string) => {
      const documents: WosDocument[] = [];
      let page = 1;
      let totalPages: number | null = null;

      const baseParams = new URLSearchParams({
        q: query,
        limit: limit.toString(),
      });

      while (totalPages == null || page <= totalPages) {
        const pageParams = new URLSearchParams(baseParams);
        pageParams.set("page", page.toString());
        const requestUrl = `${requestBaseUrl}?${pageParams.toString()}`;
        const response = await fetch(requestUrl, {
          headers: {
            "X-ApiKey": apiKey,
            Accept: "application/json",
          },
        });

        if (!response.ok) {
          const errorBody = await response.text();
          console.error("[Web of Science] Request failed", {
            status: response.status,
            statusText: response.statusText,
            errorBody,
          });
          return [];
        }

        const data = (await response.json()) as WosResponse;
        const pageDocuments = extractDocuments(data);
        if (page === 1) {
          const total = extractTotal(data);
          if (total === 0) {
            return [];
          }
        }
        if (pageDocuments.length === 0) {
          break;
        }

        documents.push(...pageDocuments);

        if (totalPages == null) {
          const total = extractTotal(data);
          if (total != null) {
            totalPages = Math.max(1, Math.ceil(total / limit));
          }
        }

        if (pageDocuments.length < limit && totalPages == null) {
          break;
        }

        page += 1;
      }

      return documents;
    };

    const primaryQuery = `AU="${authorName}"`;
    let documents = await fetchDocumentsForQuery(primaryQuery);
    if (documents.length === 0) {
      const variants = buildAuthorVariants(authorName)
        .filter((variant) => variant !== authorName)
        .map((variant) => `AU="${variant}"`);
      if (variants.length > 0) {
        const fallbackQuery = variants.join(" OR ");
        documents = await fetchDocumentsForQuery(fallbackQuery);
      }
    }

    if (documents.length === 0) {
      return [];
    }

    const publicationsWithAuthors = await Promise.all(
      documents.map(async (document, index) => {
        const title = getFirstTextValue([document.title]) ?? "Untitled publication";

        const sourceNode = document.source as Record<string, unknown> | undefined;
        const journal = getFirstTextValue([sourceNode?.sourceTitle]) ?? "Unknown journal";
        const yearText = getFirstTextValue([sourceNode?.publishYear]);
        const date = yearText ?? "Unknown date";

        const namesNode = document.names as Record<string, unknown> | undefined;
        const authorsNode = namesNode?.authors as unknown;
        const authorsList = ensureArray(authorsNode)
          .map((author) =>
            getFirstTextValue([
              (author as Record<string, unknown>)?.displayName,
              (author as Record<string, unknown>)?.fullName,
              (author as Record<string, unknown>)?.name,
              author,
            ]),
          )
          .filter(Boolean) as string[];
        const authors = authorsList.length > 0 ? authorsList.join(", ") : "N/A";

        const citationsList = ensureArray(document.citations)
          .map((citation) => (citation as Record<string, unknown>)?.count)
          .filter((count) => count != null);
        const citationCountText = getFirstTextValue(citationsList);
        const citationCount = Number.parseInt(citationCountText ?? "0", 10) || 0;

        const identifiers = document.identifiers as Record<string, unknown> | undefined;
        const doi = getFirstTextValue([identifiers?.doi, identifiers?.DOI]);
        const links = document.links as Record<string, unknown> | undefined;
        const recordUrl = getFirstTextValue([links?.record]);

        const abstract = "";
        const aiPublicationType = await classifyPaper(abstract);
        const uid = document.uid ?? document.UID;
        const id = uid ?? `wos-${index}`;
        const wosUrl = recordUrl
          ?? (uid ? `https://www.webofscience.com/wos/woscc/full-record/${uid}` : undefined);

        return {
          publication: {
            id,
            title,
            authors,
            journal,
            date,
            citationCount,
            aiPublicationType,
            abstract,
            source: "Web of Science",
            doi,
            url: buildDoiUrl(doi) ?? wosUrl,
            sourceUrls: wosUrl ? { "Web of Science": wosUrl } : undefined,
          } satisfies Publication,
          authorsList,
        };
      }),
    );

    const filtered = publicationsWithAuthors
      .filter(({ authorsList }) => includesAuthorName(authorsList, authorName))
      .map(({ publication }) => publication);

    return filtered;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("[Web of Science] Fetch failed", { message });
    return [];
  }
}

export async function fetchPublications(
  facultyNames: string[],
  startDate?: string,
  endDate?: string,
): Promise<PublicationResult> {
  const useMock = process.env.NEXT_PUBLIC_USE_MOCK_PUBLICATIONS === "true";
  if (useMock) {
    return { publications: mockPublications, errors: [] };
  }

  const requestBody = JSON.stringify({ facultyNames, startDate, endDate });
  const headers = { "Content-Type": "application/json" };

  const [pubmedResult, scopusResult, wosResult] = await Promise.allSettled([
    fetch("/api/pubmed", { method: "POST", headers, body: requestBody }),
    fetch("/api/scopus", { method: "POST", headers, body: requestBody }),
    fetch("/api/wos", { method: "POST", headers, body: requestBody }),
  ]);

  const errors: string[] = [];
  const responses: { source: PublicationSource; response: Response }[] = [];

  if (pubmedResult.status === "fulfilled") {
    responses.push({ source: "PubMed", response: pubmedResult.value });
  } else {
    const message =
      pubmedResult.reason instanceof Error
        ? pubmedResult.reason.message
        : "Network error";
    errors.push(`PubMed request failed: ${message}`);
  }

  if (scopusResult.status === "fulfilled") {
    responses.push({ source: "Scopus", response: scopusResult.value });
  } else {
    const message =
      scopusResult.reason instanceof Error
        ? scopusResult.reason.message
        : "Network error";
    errors.push(`Scopus request failed: ${message}`);
  }

  if (wosResult.status === "fulfilled") {
    responses.push({ source: "Web of Science", response: wosResult.value });
  } else {
    const message =
      wosResult.reason instanceof Error
        ? wosResult.reason.message
        : "Network error";
    errors.push(`Web of Science request failed: ${message}`);
  }

  if (responses.length === 0) {
    return {
      publications: [],
      errors: errors.length > 0 ? errors : ["Unable to reach any data source."],
    };
  }

  const pubmedPublications: Publication[] = [];
  const scopusPublications: Publication[] = [];
  const wosPublications: Publication[] = [];

  for (const { source, response } of responses) {
    if (!response.ok) {
      const errorBody = await response.text();
      errors.push(
        `${source} request failed (${response.status}): ${errorBody || "Unknown error"}`,
      );
      continue;
    }
    const data = (await response.json()) as { publications?: Publication[] };
    const items = data.publications ?? [];
    if (source === "PubMed") {
      pubmedPublications.push(...items);
    } else if (source === "Scopus") {
      scopusPublications.push(...items);
    } else {
      wosPublications.push(...items);
    }
  }

  const publications = mergePublications(
    pubmedPublications,
    scopusPublications,
    wosPublications,
  );

  if (publications.length === 0 && errors.length > 0) {
    return { publications: [], errors };
  }

  return { publications, errors };
}
