import { NextResponse } from "next/server";

type ICiteRecord = {
  pmid?: string;
  relative_citation_ratio?: number;
};

type ICiteResponse = {
  data?: ICiteRecord[];
};

const chunkArray = <T,>(items: T[], size: number) => {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
};

export async function POST(request: Request) {
  const { pmids } = (await request.json()) as { pmids?: string[] };
  const uniquePmids = Array.from(new Set((pmids ?? []).filter(Boolean)));
  if (uniquePmids.length === 0) {
    return NextResponse.json({ data: {} });
  }

  const results: Record<string, number> = {};
  const batches = chunkArray(uniquePmids, 200);

  for (const batch of batches) {
    let response: Response;
    try {
      response = await fetch(
        `https://icite.od.nih.gov/api/pubs?pmids=${encodeURIComponent(batch.join(","))}`,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : "Fetch failed";
      console.error("iCite batch failed", { message });
      continue;
    }

    if (!response.ok) {
      console.error("iCite batch failed", { status: response.status });
      continue;
    }

    const payload = (await response.json()) as ICiteResponse;
    for (const record of payload.data ?? []) {
      if (!record.pmid) {
        continue;
      }
      const rcr = record.relative_citation_ratio;
      if (typeof rcr === "number" && Number.isFinite(rcr)) {
        results[record.pmid] = rcr;
      }
    }
  }

  return NextResponse.json({ data: results });
}
