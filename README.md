# Maid Meal Tracker

A simple, responsive, single-page application for tracking daily meals requested from a maid and calculating monthly totals. Built with HTML5, CSS3, Vanilla JS, and Supabase.

## Architecture Highlights
*   **Zero backend code:** Uses Supabase as the Database-as-a-Service source of truth.
*   **Security:** Enforces Row Level Security (RLS) so users can only access their own data.
*   **No sensitive keys in frontend:** Only the Supabase `anon` public key is used. The `service_role` key is **NEVER** exposed.
*   **Optimistic UI updates:** The UI immediately updates when a meal is toggled and syncs to Supabase silently.

## Deployment Guide (GitHub Pages & Supabase)

### 1. Supabase Setup
1. Create a new project on [Supabase](https://supabase.com/).
2. Go to **Authentication** > **Providers** and ensure **Email** is enabled (you can disable email confirmations for a simpler testing flow if desired).
3. Go to the **SQL Editor** and run the following script to create your table and security policies:

```sql
-- 1. Create the table
CREATE TABLE meal_records (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id UUID REFERENCES auth.users NOT NULL,
  date DATE NOT NULL,
  breakfast BOOLEAN DEFAULT false,
  lunch BOOLEAN DEFAULT false,
  dinner BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  -- Ensure only one record per user per calendar date
  UNIQUE(user_id, date)
);

-- 2. Enable Row Level Security (RLS)
ALTER TABLE meal_records ENABLE ROW LEVEL SECURITY;

-- 3. Create RLS Policies so users only see/edit their own records
CREATE POLICY "Users can select their own meal records"
  ON meal_records FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own meal records"
  ON meal_records FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own meal records"
  ON meal_records FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own meal records"
  ON meal_records FOR DELETE
  USING (auth.uid() = user_id);
