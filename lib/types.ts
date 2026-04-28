export type Profile = {
  id: string;
  display_name: string | null;
  dietary_preferences: string[] | null;
  glp1_mode: boolean | null;
  onboarding_completed: boolean | null;
  health_sync_enabled: boolean | null;
  metabolic_profile: {
    safeFoods?: string[];
    triggerFoods?: string[];
  } | null;
};

export type GlucoseReading = {
  id: string;
  ts: string;
  mg_dl: number;
  source: string;
};

export type MealPlanRow = {
  id: string;
  week_start: string;
  plan_json: MealPlanJson;
};

export type MealPlanJson = {
  days: Array<{
    date: string;
    meals: Array<{
      slot: string;
      title: string;
      prepMinutes: number;
      glucoseImpactScore: number;
      ingredients: string[];
      notes?: string;
    }>;
  }>;
};

export type MetabolicInsight = {
  id: string;
  body: string;
  created_at: string;
};

export type MealLog = {
  id: string;
  created_at: string;
  ai_summary: string | null;
  scan_mode: string | null;
  image_path?: string | null;
  raw_transcript?: string | null;
  parsed_json?: {
    foods?: Array<{ name?: string; estimatedGrams?: number }>;
    macros?: { kcal?: number; proteinG?: number; carbG?: number; fatG?: number };
    summary?: string;
    [key: string]: unknown;
  } | null;
};

export type AgentEvent = {
  id: string;
  created_at: string;
  transcript: string;
  reply_text: string;
  actions_json:
    | Array<{
        tool: string;
        ok: boolean;
        detail: string;
      }>
    | null;
};
