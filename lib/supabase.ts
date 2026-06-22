import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://kqgsgotejmxaxhhmejdr.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtxZ3Nnb3Rlam14YXhoaG1lamRyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIxNDQwNTAsImV4cCI6MjA5NzcyMDA1MH0.oS8HoPq5eX4lHUn0GwgXb6kOK2mhAzIvsGYjkG-ij_w";

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  realtime: {
    params: {
      eventsPerSecond: 10
    }
  }
});

// ─── DB Types ────────────────────────────────────────────────────────────────

export type DbTeam = {
  id: string;
  name: string;
  code: string;
  created_at: string;
};

export type DbMember = {
  id: string;
  team_id: string;
  nickname: string;
  status: "available" | "busy";
  device_id: string | null;
  push_token: string | null;
  created_at: string;
};

export type DbAlert = {
  id: string;
  team_id: string;
  from_nickname: string;
  to_target: string;
  message: string;
  acknowledged: boolean;
  created_at: string;
};
