type ICiteResponse = {
  data?: Record<string, number>;
};

export const fetchiCiteData = async (pmids: string[]) => {
  const uniquePmids = Array.from(new Set(pmids.filter(Boolean)));
  if (uniquePmids.length === 0) {
    return new Map<string, number>();
  }

  const response = await fetch("/api/icite", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ pmids: uniquePmids }),
  });

  if (!response.ok) {
    return new Map<string, number>();
  }

  const payload = (await response.json()) as ICiteResponse;
  const results = new Map<string, number>();
  for (const [pmid, rcr] of Object.entries(payload.data ?? {})) {
    if (typeof rcr === "number" && Number.isFinite(rcr)) {
      results.set(pmid, rcr);
    }
  }

  return results;
};
