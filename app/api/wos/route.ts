import { NextResponse } from "next/server";
import { classifyPaper, type Publication } from "@/lib/publicationService";

type WosSearchRequest = {
  facultyNames: string[];
  startDate?: string;
  endDate?: string;
};

type WosResponse = Record<string, unknown>;

type WosRecord = Record<string, unknown>;

const buildAuthorQuery = (facultyNames: string[]) => {
  if (facultyNames.length === 0) {
    return "";
  }
  return facultyNames.map((name) => `AU=("${name}")`).join(" OR ");
};

const toYear = (dateValue?: string) => {
  if (!dateValue || dateValue.length < 4) {
    return null;
  }
  const year = Number.parseInt(dateValue.slice(0, 4), 10);
  return Number.isFinite(year) ? year : null;
};

const buildYearQuery = (startDate?: string, endDate?: string) => {
  const startYear = toYear(startDate);
  const endYear = toYear(endDate);
  if (!startYear && !endYear) {
    return "";
  }
  const currentYear = new Date().getFullYear();
  if (startYear && endYear) {
    return `PY=(${startYear}-${endYear})`;
  }
  if (startYear) {
    return `PY=(${startYear}-${currentYear})`;
  }
  return `PY=(1900-${endYear})`;
};

const getText = (value: unknown): string | null => {
  if (typeof value === "string" && value.trim()) {
    return value.trim();
  }
  if (typeof value === "number") {
    return value.toString();
  }
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    const content = record.content ?? record.text ?? record.value;
    return getText(content);
  }
  return null;
};

const getFirstText = (values: unknown[]): string | null => {
  for (const value of values) {
    const text = getText(value);
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

const extractRecords = (payload: WosResponse): WosRecord[] => {
  const data = payload.Data as Record<string, unknown> | undefined;
  const recordsNode =
    (data?.Records as Record<string, unknown> | undefined) ??
    (payload.records as Record<string, unknown> | undefined);
  const recordList =
    (recordsNode?.records as Record<string, unknown> | undefined)?.REC ??
    recordsNode?.REC ??
    payload.Records;
  return ensureArray(recordList).filter(
    (item): item is WosRecord => Boolean(item && typeof item === "object"),
  );
};

const extractTitle = (record: WosRecord) => {
  const titles =
    (record.static_data as Record<string, unknown> | undefined)?.summary ??
    (record.summary as Record<string, unknown> | undefined);
  const titleNode = (titles as Record<string, unknown> | undefined)?.titles;
  const titleList = ensureArray(
    (titleNode as Record<string, unknown> | undefined)?.title,
  );
  const itemTitle =
    titleList.find((title) => (title as Record<string, unknown>)?.type === "item") ??
    titleList[0];
  return getFirstText([
    itemTitle,
    record.title,
    (record as Record<string, unknown>)["title"],
  ]);
};

const extractJournal = (record: WosRecord) => {
  const titles =
    (record.static_data as Record<string, unknown> | undefined)?.summary ??
    (record.summary as Record<string, unknown> | undefined);
  const titleNode = (titles as Record<string, unknown> | undefined)?.titles;
  const titleList = ensureArray(
    (titleNode as Record<string, unknown> | undefined)?.title,
  );
  const sourceTitle =
    titleList.find((title) => (title as Record<string, unknown>)?.type === "source") ??
    titleList[0];
  return getFirstText([sourceTitle, record.journal, record["sourceTitle"]]);
};

const extractAuthors = (record: WosRecord) => {
  const namesNode =
    (record.static_data as Record<string, unknown> | undefined)?.summary ??
    (record.summary as Record<string, unknown> | undefined);
  const names = ensureArray(
    (namesNode as Record<string, unknown> | undefined)?.names,
  ).flatMap((node) =>
    ensureArray((node as Record<string, unknown> | undefined)?.name),
  );
  const authorNames = names
    .map((name) =>
      getFirstText([
        (name as Record<string, unknown>)?.display_name,
        (name as Record<string, unknown>)?.full_name,
        name,
      ]),
    )
    .filter(Boolean) as string[];
  return authorNames.length > 0 ? authorNames.join(", ") : null;
};

const extractAbstract = (record: WosRecord) => {
  const abstracts =
    (record.static_data as Record<string, unknown> | undefined)?.fullrecord_metadata ??
    (record.fullrecord_metadata as Record<string, unknown> | undefined);
  const abstractNode = (abstracts as Record<string, unknown> | undefined)?.abstracts;
  const abstractList = ensureArray(
    (abstractNode as Record<string, unknown> | undefined)?.abstract,
  );
  const abstractText = abstractList.flatMap((item) =>
    ensureArray((item as Record<string, unknown> | undefined)?.abstract_text),
  );
  return getFirstText(abstractText) ?? "";
};

const extractDate = (record: WosRecord) => {
  const pubInfo =
    (record.static_data as Record<string, unknown> | undefined)?.summary ??
    (record.summary as Record<string, unknown> | undefined);
  const pubNode = (pubInfo as Record<string, unknown> | undefined)?.pub_info;
  const year = getFirstText([
    (pubNode as Record<string, unknown> | undefined)?.pubyear,
    record.pubyear,
  ]);
  if (year) {
    return year;
  }
  return getFirstText([record.date, record["pub_date"]]) ?? "Unknown date";
};

const extractCitationCount = (record: WosRecord) => {
  const dynamicData = record.dynamic_data as Record<string, unknown> | undefined;
  const citations = dynamicData?.citation_related as Record<string, unknown> | undefined;
  const tcList = citations?.tc_list as Record<string, unknown> | undefined;
  const siloCount = tcList?.silo_tc as Record<string, unknown> | undefined;
  const count = getFirstText([
    siloCount?.local_count,
    tcList?.local_count,
    record.citation_count,
  ]);
  return Number.parseInt(count ?? "0", 10) || 0;
};

const extractIdentifier = (record: WosRecord, fallbackIndex: number) => {
  const uid = getFirstText([record.UID, record.uid, record.id, record["identifier"]]);
  return uid ?? `wos-${fallbackIndex}`;
};

const toPublication = async (record: WosRecord, index: number): Promise<Publication> => {
  const abstract = extractAbstract(record);
  const aiPublicationType = await classifyPaper(abstract);

  return {
    id: extractIdentifier(record, index),
    title: extractTitle(record) ?? "Untitled publication",
    authors: extractAuthors(record) ?? "N/A",
    journal: extractJournal(record) ?? "Unknown journal",
    date: extractDate(record),
    citationCount: extractCitationCount(record),
    aiPublicationType,
    abstract,
    source: "Web of Science",
  };
};

export async function POST(request: Request) {
  const { facultyNames, startDate, endDate } =
    (await request.json()) as WosSearchRequest;

  const apiKey = process.env.WOS_API_KEY ?? process.env.NEXT_PUBLIC_WOS_API_KEY;
  const baseUrl = process.env.WOS_BASE_URL ?? process.env.NEXT_PUBLIC_WOS_BASE_URL;

  if (!apiKey || !baseUrl) {
    return NextResponse.json(
      { error: "Web of Science API key or base URL is missing." },
      { status: 500 },
    );
  }

  const authorQuery = buildAuthorQuery(facultyNames);
  if (!authorQuery) {
    return NextResponse.json({ publications: [] });
  }

  const yearQuery = buildYearQuery(startDate, endDate);
  const userQuery = yearQuery ? `${authorQuery} AND ${yearQuery}` : authorQuery;

  const searchParams = new URLSearchParams({
    databaseId: "WOS",
    usrQuery: userQuery,
    count: "25",
    firstRecord: "1",
  });

  const fetchWithTimeout = async (url: string, timeoutMs = 25000) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      return await fetch(url, {
        signal: controller.signal,
        headers: {
          "X-ApiKey": apiKey,
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
    searchResponse = await fetchWithRetry(`${baseUrl}?${searchParams.toString()}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Fetch failed";
    return NextResponse.json(
      { error: `Web of Science search timed out: ${message}` },
      { status: 504 },
    );
  }

  if (!searchResponse.ok) {
    return NextResponse.json(
      { error: "Web of Science search failed." },
      { status: searchResponse.status },
    );
  }

  const searchData = (await searchResponse.json()) as WosResponse;
  const records = extractRecords(searchData);
  if (records.length === 0) {
    return NextResponse.json({ publications: [] });
  }

  const publications = await Promise.all(
    records.map((record, index) => toPublication(record, index)),
  );

  return NextResponse.json({ publications });
}
