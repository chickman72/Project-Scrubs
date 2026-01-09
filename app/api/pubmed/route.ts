import { NextResponse } from "next/server";
import { classifyPaper, type Publication } from "@/lib/publicationService";

type PubMedSearchRequest = {
  facultyNames: string[];
  startDate?: string;
  endDate?: string;
};

type ESearchResponse = {
  esearchresult?: {
    idlist?: string[];
  };
};

type ESummaryAuthor = {
  name?: string;
};

type ESummaryItem = {
  uid: string;
  title?: string;
  fulljournalname?: string;
  pubdate?: string;
  authors?: ESummaryAuthor[];
};

type ESummaryResponse = {
  result?: {
    uids?: string[];
    [key: string]: ESummaryItem | string[] | undefined;
  };
};

const buildAuthorQuery = (facultyNames: string[]) => {
  if (facultyNames.length === 0) {
    return "";
  }
  return facultyNames.map((name) => `${name}[Author]`).join(" OR ");
};

const decodeXmlEntities = (value: string) =>
  value
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");

const stripTags = (value: string) => value.replace(/<[^>]+>/g, "");

const parseAbstracts = (xml: string): Map<string, string> => {
  const map = new Map<string, string>();
  const articleBlocks = xml.match(/<PubmedArticle[\s\S]*?<\/PubmedArticle>/g) ?? [];

  for (const block of articleBlocks) {
    const pmidMatch = block.match(/<PMID[^>]*>(\d+)<\/PMID>/);
    if (!pmidMatch) {
      continue;
    }
    const pmid = pmidMatch[1];
    const abstractMatches = [...block.matchAll(/<AbstractText[^>]*>([\s\S]*?)<\/AbstractText>/g)];
    const abstractText = abstractMatches
      .map((match) => decodeXmlEntities(stripTags(match[1]).trim()))
      .filter(Boolean)
      .join(" ");

    if (abstractText) {
      map.set(pmid, abstractText);
    }
  }

  return map;
};

const toPublication = async (
  item: ESummaryItem,
  abstract: string,
): Promise<Publication> => {
  const aiPublicationType = await classifyPaper(abstract);

  return {
    id: item.uid,
    title: item.title ?? "Untitled publication",
    authors: item.authors?.map((author) => author.name).filter(Boolean).join(", ") || "N/A",
    journal: item.fulljournalname ?? "Unknown journal",
    date: item.pubdate ?? "Unknown date",
    citationCount: 0,
    aiPublicationType,
    abstract,
    source: "PubMed",
  };
};

export async function POST(request: Request) {
  const { facultyNames, startDate, endDate } =
    (await request.json()) as PubMedSearchRequest;

  const apiKey =
    process.env.PUBMED_API_KEY ?? process.env.NEXT_PUBLIC_PUBMED_API_KEY;
  const baseUrl =
    process.env.PUBMED_BASE_URL ?? process.env.NEXT_PUBLIC_PUBMED_BASE_URL;

  if (!apiKey || !baseUrl) {
    return NextResponse.json(
      { error: "PubMed API key or base URL is missing." },
      { status: 500 },
    );
  }

  const term = buildAuthorQuery(facultyNames);
  if (!term) {
    return NextResponse.json({ publications: [] });
  }

  const searchParams = new URLSearchParams({
    db: "pubmed",
    term,
    retmax: "25",
    retmode: "json",
    api_key: apiKey,
  });

  if (startDate) {
    searchParams.set("mindate", startDate);
    searchParams.set("datetype", "pdat");
  }

  if (endDate) {
    searchParams.set("maxdate", endDate);
    searchParams.set("datetype", "pdat");
  }

  const fetchWithTimeout = async (url: string, timeoutMs = 25000) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      return await fetch(url, { signal: controller.signal });
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
    searchResponse = await fetchWithRetry(
      `${baseUrl}/esearch.fcgi?${searchParams.toString()}`,
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Fetch failed";
    return NextResponse.json(
      { error: `PubMed search timed out: ${message}` },
      { status: 504 },
    );
  }
  if (!searchResponse.ok) {
    return NextResponse.json(
      { error: "PubMed search failed." },
      { status: searchResponse.status },
    );
  }

  const searchData = (await searchResponse.json()) as ESearchResponse;
  const ids = searchData.esearchresult?.idlist ?? [];

  if (ids.length === 0) {
    return NextResponse.json({ publications: [] });
  }

  const summaryParams = new URLSearchParams({
    db: "pubmed",
    id: ids.join(","),
    retmode: "json",
    api_key: apiKey,
  });

  let summaryResponse: Response;
  try {
    summaryResponse = await fetchWithRetry(
      `${baseUrl}/esummary.fcgi?${summaryParams.toString()}`,
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Fetch failed";
    return NextResponse.json(
      { error: `PubMed summary timed out: ${message}` },
      { status: 504 },
    );
  }

  if (!summaryResponse.ok) {
    return NextResponse.json(
      { error: "PubMed summary fetch failed." },
      { status: summaryResponse.status },
    );
  }

  const summaryData = (await summaryResponse.json()) as ESummaryResponse;
  const items = summaryData.result?.uids ?? [];
  const fetchParams = new URLSearchParams({
    db: "pubmed",
    id: ids.join(","),
    retmode: "xml",
    api_key: apiKey,
  });

  let fetchResponse: Response | null = null;
  try {
    fetchResponse = await fetchWithRetry(
      `${baseUrl}/efetch.fcgi?${fetchParams.toString()}`,
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Fetch failed";
    return NextResponse.json(
      { error: `PubMed abstract timed out: ${message}` },
      { status: 504 },
    );
  }

  const abstracts = fetchResponse && fetchResponse.ok
    ? parseAbstracts(await fetchResponse.text())
    : new Map<string, string>();

  const publications = await Promise.all(
    items
      .map((uid) => summaryData.result?.[uid] as ESummaryItem | undefined)
      .filter((item): item is ESummaryItem => Boolean(item))
      .map((item) => toPublication(item, abstracts.get(item.uid) ?? "")),
  );

  return NextResponse.json({ publications });
}
