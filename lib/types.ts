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
