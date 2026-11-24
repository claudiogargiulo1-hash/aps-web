// CPSP Supabase service functions
// Each function receives the supabase client as first argument so the module
// stays portable (no direct import of the singleton).

import type { SupabaseClient } from '@supabase/supabase-js';

type SB = SupabaseClient<any>;

export const loadAssessments = (sb: SB, patientId: string) =>
  sb.from('cpsp_assessments')
    .select('*')
    .eq('patient_id', patientId)
    .order('created_at', { ascending: false });

export const saveAssessment = (sb: SB, data: Record<string, unknown>, assessmentId?: string) =>
  assessmentId
    ? sb.from('cpsp_assessments').update(data).eq('id', assessmentId).select('id').single()
    : sb.from('cpsp_assessments').insert(data).select('id').single();

export const loadFollowups = (sb: SB, patientId: string) =>
  sb.from('cpsp_followups')
    .select('*')
    .eq('patient_id', patientId)
    .order('created_at', { ascending: false });

export const saveFollowup = (sb: SB, data: Record<string, unknown>, followupId?: string) =>
  followupId
    ? sb.from('cpsp_followups').update(data).eq('id', followupId)
    : sb.from('cpsp_followups').insert(data);

export const deleteFollowup = (sb: SB, id: string) =>
  sb.from('cpsp_followups').delete().eq('id', id);

export const deleteAssessment = (sb: SB, id: string) =>
  sb.from('cpsp_assessments').delete().eq('id', id);
