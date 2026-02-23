export type Tal = {
  slug: string;
  name: string;
  description: string;
  category: string;
  tags: string[];
  featuredScore: number;
  createdAt: string;
  thinking: string;
};

export type Act = {
  slug: string;
  name: string;
  description: string;
  steps: string[];
};

export type DanceStyleExample = {
  input: string;
  output: string;
  label?: string;
  notes?: string;
};

export type DanceExemplarSet = {
  styleExamples: DanceStyleExample[];
  antiPatterns?: Array<{
    bad: string;
    better?: string;
    reason?: string;
  }>;
};

export type Dance = {
  slug: string;
  name: string;
  description: string;
  category: string;
  rules: string;
  exemplarSet?: DanceExemplarSet;
};

export type TalDanceRelation = {
  recommendedDanceCategories: string[];
  recommendedDanceSlugs: string[];
};

export type RecommendedCombos = {
  schemaVersion: string;
  updatedAt: string;
  talToDance: Record<string, TalDanceRelation>;
};

export type TalSummary = {
  slug: string;
  name: string;
  category: string;
  tags: string[];
  description: string;
  featuredScore: number;
  createdAt: string;
  recommendedDanceCategories: string[];
  recommendedDanceSlugs: string[];
};

export type DanceSummary = {
  slug: string;
  name: string;
  category: string;
  description: string;
  tone: string[];
  structure: string[];
  rhythm: string | null;
};

export type ComboSummary = {
  talSlug: string;
  talName: string;
  danceSlug: string;
  danceName: string;
  danceCategory: string | null;
  rank: number;
};

export type DataSummary = {
  schemaVersion: string;
  updatedAt: string;
  counts: {
    tals: number;
    dances: number;
    combos: number;
  };
  talSummaries: TalSummary[];
  danceSummaries: DanceSummary[];
  comboSummaries: ComboSummary[];
};

export type GptsTalBrief = {
  s: string;
  n: string;
  c: string;
  t: string[];
  d: string;
  f: number;
};

export type GptsDanceBrief = {
  s: string;
  n: string;
  c: string;
  t: string[];
  st: string[];
  d: string;
};

export type GptsNeedHint = {
  id: string;
  kw: string[];
  tc: string[];
  dc: string[];
  ts: string[];
  ds: string[];
};

export type GptsBootstrap = {
  v: string;
  u: string;
  c: { t: number; d: number };
  cat: { t: string[]; d: string[] };
  top: { t: string[]; d: string[] };
  h: GptsNeedHint[];
};

export type GptsRecoMap = Record<
  string,
  {
    dc: string[];
    ds: string[];
  }
>;
