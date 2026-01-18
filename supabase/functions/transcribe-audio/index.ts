import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    console.log(`[transcribe-audio] Function invoked at ${new Date().toISOString()}`);

    const { attemptId } = await req.json();
    console.log(`[transcribe-audio] Received attemptId: ${attemptId}`);

    if (!attemptId) {
      console.error('[transcribe-audio] Error: attemptId is missing');
      throw new Error('attemptId is required');
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const elevenLabsKey = Deno.env.get('ELEVENLABS_API_KEY')!;

    if (!supabaseUrl || !supabaseServiceKey) {
        console.error('[transcribe-audio] Error: Missing Supabase Environment Variables');
        throw new Error('Server Configuration Error: Missing Supabase keys');
    }

    if (!elevenLabsKey) {
        console.error('[transcribe-audio] Error: ELEVENLABS_API_KEY is not set');
        throw new Error('Server Configuration Error: Missing ElevenLabs key');
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    console.log('[transcribe-audio] Supabase client initialized');

    // 1. Fetch Attempt
    console.log('[transcribe-audio] Step 1: Fetching attempt details...');
    const { data: attempt, error: attemptError } = await supabase
      .from('attempts')
      .select('audio_path').eq('id', attemptId).single();

    if (attemptError || !attempt) {
        console.error('[transcribe-audio] Error fetching attempt:', attemptError);
        throw new Error('Attempt not found');
    }
    console.log(`[transcribe-audio] Found attempt. Audio path: ${attempt.audio_path}`);

    await supabase.from('attempts').update({ status: 'processing' }).eq('id', attemptId);
    console.log('[transcribe-audio] Updated status to processing');

    // 2. Download Audio
    console.log('[transcribe-audio] Step 2: Downloading audio file from storage...');
    const { data: fileData, error: fileError } = await supabase.storage
      .from('recordings').download(attempt.audio_path);

    if (fileError || !fileData) {
        console.error('[transcribe-audio] Error downloading file:', fileError);
        throw new Error('Failed to download audio');
    }
    console.log(`[transcribe-audio] Audio file downloaded. Size: ${fileData.size} bytes`);

    // 3. Transcribe with ElevenLabs
    console.log('[transcribe-audio] Step 3: Sending to ElevenLabs...');
    const formData = new FormData();
    formData.append('file', fileData, 'audio.m4a');
    formData.append('model_id', 'scribe_v1');
    formData.append('timestamps_granularity', 'word');
    // formData.append('tag_audio_events', 'true'); // Temporarily commented out to reduce potential complexity
    // formData.append('diarize', 'false');

    const elevenResponse = await fetch('https://api.elevenlabs.io/v1/speech-to-text', {
      method: 'POST',
      headers: {
        'xi-api-key': elevenLabsKey,
      },
      body: formData,
    });

    if (!elevenResponse.ok) {
      const errorText = await elevenResponse.text();
      console.error(`[transcribe-audio] ElevenLabs API Error (${elevenResponse.status}): ${errorText}`);
      throw new Error(`ElevenLabs API Error: ${elevenResponse.status} - ${errorText}`);
    }

    const elevenData = await elevenResponse.json();
    console.log('[transcribe-audio] ElevenLabs response received');
    
    const transcriptText = elevenData.text;
    const words = elevenData.words || [];
    console.log(`[transcribe-audio] Transcription length: ${transcriptText.length} chars, Word count: ${words.length}`);

    // Calculate Metrics
    console.log('[transcribe-audio] Step 3.5: Calculating metrics...');
    let pauseCount = 0;
    let fillerWordCount = 0;
    const fillerWords = ['eh', 'em', 'um', 'uh', 'este', 'bueno', 'o sea', 'a ver', 'mhm'];

    for (let i = 0; i < words.length; i++) {
        // Calculate Pause (gap > 0.5s)
        if (i > 0) {
            const gap = words[i].start - words[i-1].end;
            if (gap > 0.5) pauseCount++;
        }

        // Count Filler Words
        const lowerWord = words[i].text.toLowerCase().trim().replace(/[.,?!]/g, '');
        if (fillerWords.includes(lowerWord) || words[i].type === 'audio_event') {
            fillerWordCount++;
        }
    }

    // WPM Calculation
    const durationSeconds = words.length > 0 ? words[words.length - 1].end - words[0].start : 0;
    const durationMinutes = durationSeconds / 60;
    const wpm = durationMinutes > 0 ? Math.round(words.length / durationMinutes) : 0;
    console.log(`[transcribe-audio] Metrics calculated: WPM=${wpm}, Fills=${fillerWordCount}, Pauses=${pauseCount}`);

    // 4. Save Initial Data & Transcript
    console.log('[transcribe-audio] Step 4: Saving metrics and transcript...');
    const { error: metricsError } = await supabase.from('attempt_metrics').insert({
      attempt_id: attemptId,
      wpm: wpm,
      filler_word_count: fillerWordCount,
      pause_count: pauseCount
    });
    
    if (metricsError) console.error('[transcribe-audio] Error saving metrics:', metricsError);

    const { error: feedbackError } = await supabase.from('attempt_feedback').upsert({
      attempt_id: attemptId,
      transcript: transcriptText,
      feedback_points: []
    }, { onConflict: 'attempt_id' });

    if (feedbackError) console.error("[transcribe-audio] Error saving transcript:", feedbackError);

    await supabase.from('attempts').update({ status: 'transcribed' }).eq('id', attemptId);
    console.log('[transcribe-audio] Status updated to transcribed');

    // 5. Invoke Generate Feedback Function
    console.log('[transcribe-audio] Step 5: Invoking generate-feedback function...');
    const { data: invokeData, error: invokeError } = await supabase.functions.invoke('generate-feedback', {
      body: { attemptId }
    });

    if (invokeError) {
        console.error('[transcribe-audio] Error invoking generate-feedback:', invokeError);
        // Note: We might NOT want to throw here if we want to return partial success (transcription done),
        // but for now, let's treat it as an error to debug.
        throw invokeError; 
    }
    
    console.log('[transcribe-audio] generate-feedback invoked successfully');
    console.log('[transcribe-audio] Function execution completed successfully');

    return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (error) {
    console.error(`[transcribe-audio] CRITICAL ERROR:`, error);
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
