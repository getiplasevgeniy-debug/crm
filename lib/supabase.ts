import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

export type Manager = {
  id: string;
  name: string;
  phone: string | null;
  salary_percentage: number;
  created_at: string;
  auth_user_id: string | null;
  email: string | null;
};

export type Transaction = {
  id: string;
  manager_id: string;
  amount: number;
  description: string | null;
  created_at: string;
};

export type Bonus = {
  id: string;
  manager_id: string;
  amount: number;
  description: string | null;
  created_at: string;
};

export type SalaryPayment = {
  id: string;
  manager_id: string;
  amount: number;
  period_start: string | null;
  period_end: string | null;
  note: string | null;
  created_at: string;
};

export type LedgerEntry = {
  id: string;
  type: 'income' | 'expense';
  amount: number;
  comment: string | null;
  manager_id: string | null;
  created_at: string;
};
