import { createClient } from 'jsr:@supabase/supabase-js@2';
import {
  calcPreopRisk,
  calcTrajectory,
  calcPod7Risk,
  calcCompositeTrajectoryScore,
  riskLevel,
  ENGINE_VERSION,
} from '../_shared/cpsp-engine.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async(req:Request)=>{
  if(req.method==='OPTIONS') return new Response('ok',{headers:corsHeaders});
  try {
    const supabase=createClient(Deno.env.get('SUPABASE_URL')??'',Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')??'',{auth:{autoRefreshToken:false,persistSession:false}});
    const body=await req.json();
    const {action,token}=body;

    // ── GET QUESTIONNAIRE ────────────────────────────────────────────────
    if(action==='get_questionnaire') {
      const {data:qt}=await supabase.from('patient_questionnaire_tokens').select('*, patients(first_name, last_name), cpsp_assessments(id, surgery_type, pod1_nrs_rest)').eq('token',token).single();
      if(!qt) return new Response(JSON.stringify({error:'Token non valido'}),{status:404,headers:corsHeaders});
      if(new Date(qt.expires_at)<new Date()) return new Response(JSON.stringify({error:'Link scaduto.'}),{status:410,headers:corsHeaders});
      const tokenType=qt.token_type||'preop_scales';
      if(tokenType==='preop_scales'&&qt.status==='completed') return new Response(JSON.stringify({error:'Questionario già completato. Grazie!'}),{status:400,headers:corsHeaders});
      let currentPod=null,todayAlreadyDone=false;
      if(tokenType==='post_discharge_nrs'&&qt.discharge_date) {
        const diffDays=Math.floor((new Date().getTime()-new Date(qt.discharge_date).getTime())/(1000*60*60*24));
        currentPod=Math.max(1,Math.min(diffDays+1,qt.valid_until_pod||7));
        const {data:existing}=await supabase.from('cpsp_nrs_daily').select('id').eq('token_id',qt.id).eq('pod_day',currentPod).single();
        todayAlreadyDone=!!existing;
      }
      return new Response(JSON.stringify({success:true,patient:qt.patients,tokenType,scales:qt.scales,assessmentId:qt.assessment_id,dischargeDate:qt.discharge_date,currentPod,validUntilPod:qt.valid_until_pod||7,todayAlreadyDone,pod1NrsRest:qt.cpsp_assessments?.pod1_nrs_rest}),{headers:{...corsHeaders,'Content-Type':'application/json'}});
    }

    // ── SUBMIT PREOP SCALES ──────────────────────────────────────────────
    if(action==='submit_questionnaire') {
      const {pcsAnswers,passAnswers,csiAnswers}=body;
      const {data:qt}=await supabase.from('patient_questionnaire_tokens').select('*').eq('token',token).single();
      if(!qt) return new Response(JSON.stringify({error:'Token non valido'}),{status:404,headers:corsHeaders});
      if(new Date(qt.expires_at)<new Date()) return new Response(JSON.stringify({error:'Link scaduto'}),{status:410,headers:corsHeaders});
      if(qt.status==='completed') return new Response(JSON.stringify({error:'Già completato'}),{status:400,headers:corsHeaders});
      if(!qt.assessment_id) return new Response(JSON.stringify({error:'Assessment non trovato.'}),{status:400,headers:corsHeaders});
      const pcsTotal=pcsAnswers?pcsAnswers.slice(0,13).reduce((a:number,b:number)=>a+b,0):0;
      const passTotal=passAnswers?passAnswers.slice(0,20).reduce((a:number,b:number)=>a+b,0):0;
      const csiTotal=csiAnswers?csiAnswers.slice(0,25).reduce((a:number,b:number)=>a+b,0):0;
      const {data:a}=await supabase.from('cpsp_assessments').select('surgery_type,opioid_use_preop,preop_nrs,distress_thermometer,pain_other_sites,insomnia_present,smoking,frailty').eq('id',qt.assessment_id).single();
      let riskData=null;
      if(a) riskData=calcPreopRisk({
        surgeryType:        a.surgery_type||'ALTRO',
        opioids:            a.opioid_use_preop||'none',
        nrsPreop:           a.preop_nrs||0,
        pcsTotal,passTotal,csiTotal,
        distressThermometer:a.distress_thermometer||0,
        painOtherSites:     !!a.pain_other_sites,
        insomniaPresent:    !!a.insomnia_present,
        smoking:            !!a.smoking,
        frailty:            !!a.frailty,
      });
      const updates:any={updated_at:new Date().toISOString()};
      if(pcsAnswers){updates.pcs_answers=pcsAnswers.slice(0,13);updates.pcs_score=pcsTotal;}
      if(passAnswers){updates.pass_answers=passAnswers.slice(0,20);updates.pass_score=passTotal;}
      if(csiAnswers){updates.csi_answers=csiAnswers.slice(0,25);updates.csi_score=csiTotal;}
      if(riskData){updates.cpsp_risk_pct=riskData.pct;updates.cpsp_risk_level=riskData.level;updates.engine_version=ENGINE_VERSION;}
      await supabase.from('cpsp_assessments').update(updates).eq('id',qt.assessment_id);
      await supabase.from('patient_questionnaire_tokens').update({status:'completed',completed_at:new Date().toISOString()}).eq('token',token);
      return new Response(JSON.stringify({success:true,message:'Questionario completato! I tuoi dati sono stati inviati al medico.',scores:{pcs:pcsTotal,pass:passTotal,csi:csiTotal},risk:riskData}),{headers:{...corsHeaders,'Content-Type':'application/json'}});
    }

    // ── SUBMIT NRS GIORNALIERO ───────────────────────────────────────────
    if(action==='submit_nrs_daily') {
      const {nrsRest,nrsMovement,painInterference,sleepQuality,moodScore,usingOpioids,opioidName,podDay}=body;
      const {data:qt}=await supabase.from('patient_questionnaire_tokens').select('*').eq('token',token).single();
      if(!qt) return new Response(JSON.stringify({error:'Token non valido'}),{status:404,headers:corsHeaders});
      if(new Date(qt.expires_at)<new Date()) return new Response(JSON.stringify({error:'Link scaduto'}),{status:410,headers:corsHeaders});
      if(!qt.assessment_id) return new Response(JSON.stringify({error:'Assessment non trovato.'}),{status:400,headers:corsHeaders});
      const diffDays=Math.floor((new Date().getTime()-new Date(qt.discharge_date).getTime())/(1000*60*60*24));
      const currentPod=podDay||Math.max(1,Math.min(diffDays+1,qt.valid_until_pod||7));
      const {data:existing}=await supabase.from('cpsp_nrs_daily').select('id').eq('token_id',qt.id).eq('pod_day',currentPod).single();
      if(existing) return new Response(JSON.stringify({error:`POD${currentPod} già compilato! Torna domani.`}),{status:400,headers:corsHeaders});

      await supabase.from('cpsp_nrs_daily').insert({
        patient_id:qt.patient_id,assessment_id:qt.assessment_id,tenant_id:qt.tenant_id,token_id:qt.id,
        pod_day:currentPod,nrs_rest:nrsRest,nrs_movement:nrsMovement,
        pain_interference:painInterference??null,
        sleep_quality:sleepQuality??null,
        mood_score:moodScore??null,
        using_opioids:usingOpioids||false,opioid_name:opioidName||null,source:'patient_qr',
      });

      await supabase.from('patient_questionnaire_tokens').update({status:currentPod>=(qt.valid_until_pod||7)?'completed':'in_progress'}).eq('token',token);

      const {data:allDays}=await supabase.from('cpsp_nrs_daily').select('pod_day,nrs_rest,nrs_movement,pain_interference,sleep_quality,mood_score,using_opioids').eq('assessment_id',qt.assessment_id).order('pod_day');
      let trajectoryData=null;
      if(allDays&&allDays.length>0) {
        const avgRest=allDays.reduce((s:number,d:any)=>s+(d.nrs_rest||0),0)/allDays.length;
        const avgMov=allDays.reduce((s:number,d:any)=>s+(d.nrs_movement||0),0)/allDays.length;
        const avgInt=allDays.reduce((s:number,d:any)=>s+(d.pain_interference||5),0)/allDays.length;
        const avgSlp=allDays.reduce((s:number,d:any)=>s+(d.sleep_quality||5),0)/allDays.length;
        const avgMood=allDays.reduce((s:number,d:any)=>s+(d.mood_score||5),0)/allDays.length;
        const opioidDays=allDays.filter((d:any)=>d.using_opioids).length;
        const {data:assessment}=await supabase.from('cpsp_assessments').select('pod1_nrs_rest,risk_pct_dynamic,cpsp_risk_pct').eq('id',qt.assessment_id).single();
        const pod1Rest=assessment?.pod1_nrs_rest||allDays[0]?.nrs_rest||5;
        const trajectory=calcTrajectory(pod1Rest,Math.round(avgRest));
        const compositeScore=calcCompositeTrajectoryScore(allDays);
        const basePct=assessment?.risk_pct_dynamic||assessment?.cpsp_risk_pct||50;
        const pod7Pct=calcPod7Risk(basePct,avgRest,avgMov,avgInt,avgSlp,avgMood,opioidDays,trajectory);
        const pod7Level=riskLevel(pod7Pct);
        await supabase.from('cpsp_assessments').update({
          nrs_trajectory:trajectory,
          nrs_pod7_avg_rest:Math.round(avgRest*10)/10,
          nrs_pod7_avg_movement:Math.round(avgMov*10)/10,
          traj_avg_interference:Math.round(avgInt*10)/10,
          traj_avg_sleep:Math.round(avgSlp*10)/10,
          traj_avg_mood:Math.round(avgMood*10)/10,
          traj_opioid_days:opioidDays,
          traj_composite_score:compositeScore,
          risk_pct_pod7:pod7Pct,
          risk_level_pod7:pod7Level,
          risk_delta_pod7:Math.round(pod7Pct-basePct),
        }).eq('id',qt.assessment_id);
        trajectoryData={trajectory,avgRest,avgMov,avgInt,avgSlp,avgMood,opioidDays,compositeScore,pod7Pct,pod7Level,version:ENGINE_VERSION};
      }
      const daysLeft=(qt.valid_until_pod||7)-currentPod;
      return new Response(JSON.stringify({success:true,message:daysLeft>0?`✅ Giorno ${currentPod} registrato! Torna domani per il giorno ${currentPod+1}.`:'✅ Monitoraggio completato! Grazie per la tua collaborazione.',currentPod,daysLeft,trajectory:trajectoryData}),{headers:{...corsHeaders,'Content-Type':'application/json'}});
    }

    return new Response(JSON.stringify({error:'Azione non valida'}),{status:400,headers:corsHeaders});
  } catch(e:any) {
    console.log('EXCEPTION:',e.message);
    return new Response(JSON.stringify({error:e.message}),{status:500,headers:corsHeaders});
  }
});
