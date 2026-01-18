import type { Publication } from "@/lib/publicationService";

export class MetricsEngine {
  static calculateHIndex(papers: Publication[]) {
    const sorted = [...papers].sort((a, b) => b.citationCount - a.citationCount);
    let hIndex = 0;
    for (let i = 0; i < sorted.length; i += 1) {
      if (sorted[i].citationCount >= i + 1) {
        hIndex = i + 1;
      } else {
        break;
      }
    }
    return hIndex;
  }

  static calculateWeightedRCR(papers: Publication[]) {
    return papers.reduce((total, paper) => total + (paper.rcr ?? 0), 0);
  }
}
