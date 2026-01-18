export const benchmarks = {
  tenureTrack: {
    assistant: { hIndex: 4 },
    associate: { hIndex: 10 },
    professor: { hIndex: 20 },
  },
  nonTenure: {
    assistant: { hIndex: 1 },
    associate: { hIndex: 4 },
    professor: { hIndex: 8.5 },
  },
} as const;
