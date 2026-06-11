import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { calcPreopRisk } from '../_shared/cpsp-engine.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const body = await req.json();
    const result = calcPreopRisk({
      surgeryType:        body.surgeryType        ?? 'ALTRO',
      opioids:            body.opioids            ?? 'none',
      nrsPreop:           body.nrsPreop           ?? 0,
      pcsTotal:           body.pcsTotal           ?? 0,
      passTotal:          body.passTotal          ?? 0,
      csiTotal:           body.csiTotal           ?? 0,
      distressThermometer:body.distressThermometer?? 0,
      painOtherSites:     !!body.painOtherSites,
      insomniaPresent:    !!body.insomniaPresent,
      smoking:            !!body.smoking,
      frailty:            !!body.frailty,
    });
    return new Response(
      JSON.stringify({ pct: result.pct, level: result.level, version: result.version }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: corsHeaders });
  }
});
