import { NextResponse } from "next/server";
import { classifyPaper, type Publication } from "@/lib/publicationService";

type ScopusSearchRequest = {
  facultyNames: string[];
  startDate?: string;
  endDate?: string;
};

type ScopusAuthor = {
  authname?: string;
};

type ScopusEntry = {
  "dc:identifier"?: string;
  "dc:title"?: string;
  "dc:creator"?: string;
  "prism:publicationName"?: string;
  "prism:coverDate"?: string;
  "citedby-count"?: string;
  "dc:description"?: string;
  author?: ScopusAuthor[];
};

type ScopusSearchResponse = {
  "search-results"?: {
    entry?: ScopusEntry[];
  };
};

const buildAuthorQuery = (facultyNames: string[]) => {
  if (facultyNames.length === 0) {
    return "";
  }
  return facultyNames.map((name) => `AUTHOR-NAME("${name}")`).join(" OR ");
};

const toYear = (dateValue?: string) => {
  if (!dateValue || dateValue.length < 4) {
    return null;
  }
  const year = Number.parseInt(dateValue.slice(0, 4), 10);
  return Number.isFinite(year) ? year : null;
};

const buildYearFilter = (startDate?: string, endDate?: string) => {
  const startYear = toYear(startDate);
  const endYear = toYear(endDate);
  const filters: string[] = [];
  if (startYear) {
    filters.push(`PUBYEAR > ${startYear - 1}`);
  }
  if (endYear) {
    filters.push(`PUBYEAR < ${endYear + 1}`);
  }
  return filters.join(" AND ");
};

const toPublication = async (entry: ScopusEntry, index: number): Promise<Publication> => {
  const abstract = entry["dc:description"] ?? "";
  const aiPublicationType = await classifyPaper(abstract);

  const authorNames =
    entry.author?.map((author) => author.authname).filter(Boolean).join(", ") ||
    entry["dc:creator"] ||
    "N/A";

  const identifier = entry["dc:identifier"]?.replace("SCOPUS_ID:", "scopus-");
  const id = identifier || `scopus-${index}`;

  return {
    id,
    title: entry["dc:title"] ?? "Untitled publication",
    authors: authorNames,
    journal: entry["prism:publicationName"] ?? "Unknown journal",
    date: entry["prism:coverDate"] ?? "Unknown date",
    citationCount: Number.parseInt(entry["citedby-count"] ?? "0", 10) || 0,
    aiPublicationType,
    abstract,
    source: "Scopus",
  };
};

export async function POST(request: Request) {
  const requestId = `scopus-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const logPrefix = `[Scopus][${requestId}]`;
  const { facultyNames, startDate, endDate } =
    (await request.json()) as ScopusSearchRequest;

  const apiKey =
    process.env.SCOPUS_API_KEY ?? process.env.NEXT_PUBLIC_SCOPUS_API_KEY;
  const baseUrl =
    process.env.SCOPUS_BASE_URL ?? process.env.NEXT_PUBLIC_SCOPUS_BASE_URL;

  console.log(`${logPrefix} Incoming search`, {
    facultyNamesCount: facultyNames?.length ?? 0,
    startDate,
    endDate,
    hasApiKey: Boolean(apiKey),
    apiKeyTail: apiKey ? apiKey.slice(-4) : null,
    baseUrl,
  });

  if (!apiKey || !baseUrl) {
    console.error(`${logPrefix} Missing configuration`, {
      hasApiKey: Boolean(apiKey),
      hasBaseUrl: Boolean(baseUrl),
    });
    return NextResponse.json(
      { error: "Scopus API key or base URL is missing." },
      { status: 500 },
    );
  }

  const authorQuery = buildAuthorQuery(facultyNames);
  if (!authorQuery) {
    console.log(`${logPrefix} No author query provided`);
    return NextResponse.json({ publications: [] });
  }

  const yearFilter = buildYearFilter(startDate, endDate);
  const query = yearFilter ? `${authorQuery} AND ${yearFilter}` : authorQuery;
  const requestUrl = `${baseUrl}/search/scopus?${searchParams.toString()}`;

  console.log(`${logPrefix} Query built`, {
    query,
    yearFilter,
    requestUrl,
  });

  const searchParams = new URLSearchParams({
    query,
    view: "COMPLETE",
    count: "25",
  });

  const fetchWithTimeout = async (url: string, timeoutMs = 25000) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      return await fetch(url, {
        signal: controller.signal,
        headers: {
          "X-ELS-APIKey": apiKey,
          Accept: "application/json",
        },
      });
    } finally {
      clearTimeout(timer);
    }
  };

  const fetchWithRetry = async (url: string, attempts = 3) => {
    let lastError: unknown;
    for (let attempt = 0; attempt < attempts; attempt += 1) {
      try {
        return await fetchWithTimeout(url, 25000);
      } catch (error) {
        lastError = error;
      }
    }
    throw lastError;
  };

  let searchResponse: Response;
  try {
    searchResponse = await fetchWithRetry(requestUrl);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Fetch failed";
    console.error(`${logPrefix} Fetch failed`, { message });
    return NextResponse.json(
      { error: `Scopus search timed out: ${message}` },
      { status: 504 },
    );
  }

  if (!searchResponse.ok) {
    let responseBody: string | undefined;
    try {
      responseBody = await searchResponse.clone().text();
    } catch (error) {
      responseBody = `Unable to read response body: ${
        error instanceof Error ? error.message : "Unknown error"
      }`;
    }
    console.error(`${logPrefix} Scopus error response`, {
      status: searchResponse.status,
      statusText: searchResponse.statusText,
      headers: Object.fromEntries(searchResponse.headers.entries()),
      responseBody,
    });
    return NextResponse.json(
      { error: "Scopus search failed." },
      { status: searchResponse.status },
    );
  }

  const searchData = (await searchResponse.json()) as ScopusSearchResponse;
  const entries = searchData["search-results"]?.entry ?? [];
  console.log(`${logPrefix} Scopus response entries`, {
    count: entries.length,
  });
  if (entries.length === 0) {
    return NextResponse.json({ publications: [] });
  }

  const publications = await Promise.all(
    entries.map((entry, index) => toPublication(entry, index)),
  );

  return NextResponse.json({ publications });
}
