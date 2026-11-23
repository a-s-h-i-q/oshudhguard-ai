import 'dotenv/config';
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenAI, ThinkingLevel, Type } from '@google/genai';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT || 3000);
const isProduction = process.env.NODE_ENV === 'production';

function getGeminiClient(): GoogleGenAI | null {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
    return null;
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

function parseDataUrl(dataUrl: string): { mimeType: string; data: string } | null {
  const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (!match) return null;
  return { mimeType: match[1], data: match[2] };
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '15mb' }));

  app.get('/api/health', (_req, res) => {
    res.json({
      ok: true,
      geminiConfigured: Boolean(
        process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY !== 'MY_GEMINI_API_KEY',
      ),
    });
  });

  /**
   * Stage 2: Multimodal VLM Prescription Token & Clinical Prior Extraction
   * Extracts Zone A patient context + Zone B/C top-3 transcription hypotheses per Rx line.
   */
  app.post('/api/analyze-prescription', async (req, res) => {
    try {
      const { imageDataUrl } = req.body as { imageDataUrl?: string };
      if (!imageDataUrl) {
        res.status(400).json({ error: 'Missing prescription imageDataUrl.' });
        return;
      }

      const ai = getGeminiClient();
      if (!ai) {
        res.status(503).json({
          error:
            'Gemini API key is not configured on the server. Add GEMINI_API_KEY in Secrets or use the built-in Bangladeshi clinical demo prescriptions.',
        });
        return;
      }

      const parsed = parseDataUrl(imageDataUrl);
      if (!parsed) {
        res.status(400).json({ error: 'Invalid base64 image data URL.' });
        return;
      }

      const response = await ai.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents: {
          parts: [
            {
              inlineData: {
                mimeType: parsed.mimeType,
                data: parsed.data,
              },
            },
            {
              text:
                'You are OshudhGuard AI Stage 2 Clinical VLM for Bangladeshi handwritten and printed outpatient prescriptions. ' +
                'Segment the image into Zone A (patient age, sex, doctor name, diagnosis/comorbidity notes like CKD, DM, HTN, Pregnancy, Asthma, Peptic Ulcer) ' +
                'and Zone B/C (each horizontal Rx medication line + Bangladeshi shorthand schedule like 1+0+1 a/c 30m, 1+1+1 p/c, BD, TDS, HS, SOS, T/S, duration in days). ' +
                'For EVERY medication line, provide the raw OCR reading AND top-3 plausible Bangladeshi trade brand transcription hypotheses (do not hallucinate non-existent strengths). ' +
                'Also return approximate normalized bounding box [yMin, xMin, yMax, xMax] in 0..1000 for each medication line.',
            },
          ],
        },
        config: {
          thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              patientName: { type: Type.STRING },
              age: { type: Type.INTEGER },
              sex: { type: Type.STRING },
              doctorName: { type: Type.STRING },
              clinicName: { type: Type.STRING },
              detectedConditions: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
              },
              medications: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    ocrRaw: { type: Type.STRING },
                    hypotheses: {
                      type: Type.ARRAY,
                      items: { type: Type.STRING },
                    },
                    dosageFormHint: { type: Type.STRING },
                    strengthHint: { type: Type.STRING },
                    scheduleShorthand: { type: Type.STRING },
                    durationDays: { type: Type.INTEGER },
                    bbox: {
                      type: Type.ARRAY,
                      items: { type: Type.INTEGER },
                    },
                  },
                  required: ['ocrRaw', 'hypotheses', 'scheduleShorthand'],
                },
              },
            },
            required: ['detectedConditions', 'medications'],
          },
        },
      });

      const rawText = (response.text ?? '{}').trim();
      const payload = JSON.parse(rawText);
      res.json(payload);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Prescription analysis failed.';
      res.status(500).json({ error: message });
    }
  });

  /**
   * Stage 4: Physical Blister-Strip Metallic Foil OCR
   * Decodes repeated diagonal foil imprints from CLAHE-processed loose blister strip images.
   */
  app.post('/api/analyze-blister', async (req, res) => {
    try {
      const { imageDataUrl } = req.body as { imageDataUrl?: string };
      if (!imageDataUrl) {
        res.status(400).json({ error: 'Missing blister strip imageDataUrl.' });
        return;
      }

      const ai = getGeminiClient();
      if (!ai) {
        res.status(503).json({
          error:
            'Gemini API key is not configured on the server. Add GEMINI_API_KEY in Secrets or test with the built-in blister strip samples.',
        });
        return;
      }

      const parsed = parseDataUrl(imageDataUrl);
      if (!parsed) {
        res.status(400).json({ error: 'Invalid base64 image data URL.' });
        return;
      }

      const response = await ai.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents: {
          parts: [
            {
              inlineData: {
                mimeType: parsed.mimeType,
                data: parsed.data,
              },
            },
            {
              text:
                'You are OshudhGuard AI Stage 4 Blister-Strip Foil Verifier for Bangladeshi loose cut metallic medicine strips. ' +
                'Read the repeated diagonal typography printed on the metallic foil (brand name, milligram strength, dosage form like Tablet/Capsule, generic name if visible, and manufacturer). ' +
                'Pay extreme attention to the exact milligram strength (e.g. 20mg vs 40mg, 250mg vs 500mg).',
            },
          ],
        },
        config: {
          thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              ocrStripRaw: { type: Type.STRING },
              brandGuess: { type: Type.STRING },
              genericVisible: { type: Type.STRING },
              dosageFormHint: { type: Type.STRING },
              strengthHint: { type: Type.STRING },
              manufacturerHint: { type: Type.STRING },
            },
            required: ['ocrStripRaw', 'brandGuess', 'strengthHint'],
          },
        },
      });

      const rawText = (response.text ?? '{}').trim();
      const payload = JSON.parse(rawText);
      res.json(payload);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Blister strip OCR failed.';
      res.status(500).json({ error: message });
    }
  });

  /**
   * Stage 6: Natural Bangla Clinical Voice Synthesis via Gemini 3.8 Flash Lite TTS
   * Returns complete unary WAV base64 audio (audio/wav, 24kHz mono 16-bit).
   */
  app.post('/api/tts', async (req, res) => {
    try {
      const { text, urgent } = req.body as { text?: string; urgent?: boolean };
      if (!text || !text.trim()) {
        res.status(400).json({ error: 'Missing text for Bangla speech synthesis.' });
        return;
      }

      const ai = getGeminiClient();
      if (!ai) {
        res.status(503).json({
          error: 'Gemini TTS unavailable; client can fall back to browser speech synthesis.',
        });
        return;
      }

      const styleInstruction = urgent
        ? 'Clear, urgent, empathetic clinical pharmacist alert in natural Bangladeshi Bangla'
        : 'Warm, clear, slow and patient-friendly Bangladeshi Bangla clinical pharmacist voice for elderly caregivers';

      const response = await ai.models.generateContent({
        model: 'gemini-3.8-flash-lite-tts',
        contents: [
          {
            role: 'user',
            parts: [
              {
                text: text.trim(),
                speechMetadata: {
                  style: styleInstruction,
                },
              },
            ],
          },
        ],
        config: {
          responseModalities: ['AUDIO'],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName: 'Kore' },
            },
          },
        },
      });

      const base64Audio =
        response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;

      if (!base64Audio) {
        res.status(502).json({ error: 'TTS model returned no audio data.' });
        return;
      }

      res.json({
        mimeType: 'audio/wav',
        audioBase64: base64Audio,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Bangla TTS generation failed.';
      res.status(500).json({ error: message });
    }
  });

  /**
   * Voice Comorbidity Input: Transcribe spoken Bangla/English comorbidity notes
   * using Gemini 3.5 Transcribe.
   */
  app.post('/api/transcribe-comorbidities', async (req, res) => {
    try {
      const { audioBase64, mimeType } = req.body as {
        audioBase64?: string;
        mimeType?: string;
      };
      if (!audioBase64) {
        res.status(400).json({ error: 'Missing audioBase64.' });
        return;
      }

      const ai = getGeminiClient();
      if (!ai) {
        res.status(503).json({ error: 'Gemini API key is not configured.' });
        return;
      }

      const response = await ai.models.generateContent({
        model: 'gemini-3.5-transcribe',
        contents: {
          parts: [
            {
              inlineData: {
                mimeType: mimeType || 'audio/webm',
                data: audioBase64,
              },
            },
            {
              text: 'Transcribe this patient health condition note (may be in Bangla or English).',
            },
          ],
        },
      });

      res.json({ transcript: (response.text ?? '').trim() });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Audio transcription failed.';
      res.status(500).json({ error: message });
    }
  });

  if (!isProduction) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`OshudhGuard AI server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer();
