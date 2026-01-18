import { GoogleGenerativeAI } from "https://esm.sh/@google/generative-ai";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    console.log(`[generate-feedback] Function invoked`);
    const { attemptId } = await req.json();

    if (!attemptId) throw new Error('attemptId is required');

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const geminiKey = Deno.env.get('GEMINI_API_KEY')!;

    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const genAI = new GoogleGenerativeAI(geminiKey);
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

    // 1. Fetch Attempt
    const { data: attempt, error: attemptError } = await supabase
      .from('attempts')
      .select('*, topics(*), attempt_feedback(transcript), attempt_metrics(*)')
      .eq('id', attemptId)
      .single();

    if (attemptError || !attempt) throw new Error('Attempt not found');
    
    const transcriptText = attempt.attempt_feedback?.transcript;
    if (!transcriptText) throw new Error('No transcript found');
    
    const metrics = Array.isArray(attempt.attempt_metrics) ? attempt.attempt_metrics[0] : attempt.attempt_metrics;
    const practiceType = attempt.practice_type || 'improv';
    const targetText = attempt.target_text || '';

    // --- System Scores ---
    const calculateWpmScore = (wpm: number) => {
        const minTarget = 150;
        const maxTarget = 190;
        if (wpm < minTarget) return Math.max(0, 100 - (minTarget - wpm));
        if (wpm > maxTarget) return Math.max(0, 100 - (wpm - maxTarget));
        return 100;
    };
    const calculateFillerScore = (count: number, duration: number) => {
        const mins = duration / 60 || 0.5;
        const perMin = count / mins;
        return Math.max(0, Math.round(100 - (perMin * 10)));
    };
    const calculatePauseScore = (count: number, duration: number) => {
        const mins = duration / 60 || 0.5;
        const perMin = count / mins;
        if (perMin <= 8) return 100;
        return Math.max(0, Math.round(100 - ((perMin - 8) * 5)));
    };

    const duration = attempt.duration_seconds || 60; 
    const wpmScore = calculateWpmScore(metrics?.wpm || 0);
    const fillerScore = calculateFillerScore(metrics?.filler_word_count || 0, duration);
    const pauseScore = calculatePauseScore(metrics?.pause_count || 0, duration);

    // 2. Build Prompt based on Mode
    let prompt = '';
    const baseJsonFormat = `
    Provide a JSON response with:
    1. "scores": (0-100) for "fluency", "vocabulary", "grammar", "coherence".
    2. "feedback": Array of strings (in Spanish).
    `;

    switch (practiceType) {
        case 'reading':
            prompt = `Act as a strict speech coach. User READ this text: "${targetText}".
            TRANSCRIPT: "${transcriptText}".
            Analyze fidelity.
            - grammar: Accuracy (100 = perfect match).
            - fluency: Flow.
            - vocabulary: 100 (N/A).
            - coherence: 100 (N/A).
            Feedback on missed words/pronunciation.
            ${baseJsonFormat}`;
            break;

        case 'vocab':
            prompt = `Act as a strict tutor. 
            INSTRUCTIONS: "${targetText}".
            TRANSCRIPT: "${transcriptText}".
            Analyze if they used the required words naturally.
            - vocabulary: Score based on how many required words were used correctly (100 = all used).
            - coherence: Did the story make sense with the words?
            Feedback: List which words were used/missed.
            ${baseJsonFormat}`;
            break;

        case 'debate':
            prompt = `Act as a debate judge.
            TASK: "${targetText}".
            TRANSCRIPT: "${transcriptText}".
            Analyze if they argued the assigned stance effectively.
            - coherence: Argument logic and adherence to stance (100 = strong arguments for assigned side).
            - fluency: Persuasiveness.
            Feedback: On argument strength.
            ${baseJsonFormat}`;
            break;

        case 'interview':
             prompt = `Act as a corporate recruiter.
             QUESTION: "${targetText}".
             TRANSCRIPT: "${transcriptText}".
             Analyze the answer.
             - coherence: Structure (STAR method preferred). Did they answer the question?
             - vocabulary: Professionalism.
             Feedback: On professional tone and content.
             ${baseJsonFormat}`;
             break;

        default: // improv
            prompt = `Act as a strict Spanish tutor. Topic: "${attempt.topics?.title || 'General'}".
            TRANSCRIPT: "${transcriptText}".
            Analyze general speaking skills.
            - fluency, vocabulary, grammar, coherence.
            ${baseJsonFormat}`;
    }

    const result = await model.generateContent(prompt);
    const responseText = result.response.text();
    const cleanJson = responseText.replace(/```json|```/g, '').trim();
    const analysis = JSON.parse(cleanJson);

    // 3. Overall Score
    const systemWeighted = (wpmScore * 0.15) + (fillerScore * 0.15) + (pauseScore * 0.10);
    const aiWeighted = ((analysis.scores?.fluency || 0) * 0.15) + 
                       ((analysis.scores?.vocabulary || 0) * 0.15) + 
                       ((analysis.scores?.grammar || 0) * 0.15) + 
                       ((analysis.scores?.coherence || 0) * 0.15);
    
    const overallScore = Math.round(systemWeighted + aiWeighted);

    // 4. Save
    await supabase.from('attempt_scores').insert({
      attempt_id: attemptId,
      overall_score: overallScore,
      fluency_score: analysis.scores?.fluency || 0,
      vocabulary_score: analysis.scores?.vocabulary || 0,
      grammar_score: analysis.scores?.grammar || 0,
      coherence_score: analysis.scores?.coherence || 0,
      wpm_score: wpmScore,
      filler_score: fillerScore,
      pause_score: pauseScore
    });

    await supabase.from('attempt_feedback').update({
      feedback_points: analysis.feedback || []
    }).eq('attempt_id', attemptId);

    await supabase.from('attempts').update({ status: 'completed' }).eq('id', attemptId);

    // 5. Award XP (20 XP per practice)
    try {
        const { error: xpError } = await supabase.rpc('add_xp', { 
            user_id: attempt.user_id, 
            amount: 20 
        });
        if (xpError) console.error('Error awarding XP:', xpError);
    } catch (e) {
        console.error('Failed to award XP', e);
    }

    return new Response(JSON.stringify({ success: true, overallScore }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (error) {
    console.error(error);
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
