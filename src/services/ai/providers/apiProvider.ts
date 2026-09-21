import { z } from "zod";

import { assistantAnswerSchema, barcodeInterpretationSchema, mealParseResultSchema, ocrExtractionSchema } from "@/services/ai/schemas";
import { ModelProvider } from "@/services/ai/providers/types";
import {
  AssistantAnswer,
  AssistantChatInput,
  BarcodeInterpretation,
  CaptureInput,
  MealParseResult,
  NutritionLabelParse,
  OCRExtraction,
  StructuredAIResult
} from "@/types/ai";
import { AITask, ModelProviderConfig } from "@/types/domain";

const nutritionLabelSchema = z.object({
  servingsPerContainer: z.number().optional(),
  servingSize: z.string(),
  calories: z.number().nonnegative(),
  proteinGrams: z.number().nonnegative(),
  carbGrams: z.number().nonnegative(),
  fatGrams: z.number().nonnegative()
});

type ProviderPayload = {
  task: AITask;
  prompt: string;
  imageUri?: string;
};

type ApiEnvelope<T> = {
  taskId?: string;
  confidence?: number;
  data?: T;
  clarifyingQuestions?: string[];
  provenance?: string[];
  rawText?: string;
};

abstract class StructuredApiProvider implements ModelProvider {
  constructor(protected readonly config: ModelProviderConfig) {}

  extractOCR(input: CaptureInput): Promise<StructuredAIResult<OCRExtraction>> {
    return this.requestStructured("ocrExtraction", input, ocrExtractionSchema);
  }

  interpretBarcode(input: CaptureInput): Promise<StructuredAIResult<BarcodeInterpretation>> {
    return this.requestStructured("barcodeInterpretation", input, barcodeInterpretationSchema);
  }

  recognizeMealPhoto(input: CaptureInput): Promise<StructuredAIResult<MealParseResult>> {
    return this.requestStructured("mealPhotoRecognition", input, mealParseResultSchema) as Promise<StructuredAIResult<MealParseResult>>;
  }

  parseNutritionLabel(input: CaptureInput): Promise<StructuredAIResult<NutritionLabelParse>> {
    return this.requestStructured("nutritionLabelParsing", input, nutritionLabelSchema);
  }

  parseNaturalLanguageMeal(input: CaptureInput): Promise<StructuredAIResult<MealParseResult>> {
    return this.requestStructured("naturalLanguageMealParsing", input, mealParseResultSchema) as Promise<StructuredAIResult<MealParseResult>>;
  }

  estimateNutrition(input: CaptureInput): Promise<StructuredAIResult<MealParseResult>> {
    return this.requestStructured("nutritionEstimation", input, mealParseResultSchema) as Promise<StructuredAIResult<MealParseResult>>;
  }

  chat(input: AssistantChatInput): Promise<StructuredAIResult<AssistantAnswer>> {
    return this.requestStructured("assistantChatReasoning", input, assistantAnswerSchema);
  }

  protected abstract completeJson(payload: ProviderPayload): Promise<string>;

  private async requestStructured<T>(task: AITask, input: CaptureInput | AssistantChatInput, schema: z.ZodType<T>): Promise<StructuredAIResult<T>> {
    const rawText = await this.completeJson({
      task,
      prompt: buildPrompt(task, input),
      imageUri: "imageUri" in input ? input.imageUri : undefined
    });
    const envelope = parseJsonEnvelope<T>(rawText);
    const parsedData = schema.parse(envelope.data ?? envelope);

    return {
      taskId: envelope.taskId || `${task}-${Date.now()}`,
      confidence: clampConfidence(envelope.confidence),
      data: parsedData,
      clarifyingQuestions: Array.isArray(envelope.clarifyingQuestions) ? envelope.clarifyingQuestions : [],
      provenance: Array.isArray(envelope.provenance) ? envelope.provenance : [this.config.providerType],
      rawText: envelope.rawText || rawText
    };
  }
}

export class OpenAIProvider extends StructuredApiProvider {
  protected async completeJson(payload: ProviderPayload) {
    const imageDataUrl = await imageUriToDataUrl(payload.imageUri);
    const userContent = imageDataUrl
      ? [
          { type: "text", text: payload.prompt },
          { type: "image_url", image_url: { url: imageDataUrl } }
        ]
      : payload.prompt;
    const json = await this.postJson("/chat/completions", {
      model: this.config.modelName,
      temperature: 0.1,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: systemPrompt() },
        { role: "user", content: userContent }
      ]
    });

    const content = json?.choices?.[0]?.message?.content;
    if (typeof content !== "string") {
      throw new Error("OpenAI response did not include JSON content.");
    }
    return content;
  }

  private async postJson(path: string, body: unknown) {
    const response = await fetch(`${this.config.baseUrl.replace(/\/$/, "")}${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      throw new Error(`OpenAI-compatible server proxy returned ${response.status}`);
    }

    return response.json();
  }
}

export class AnthropicProvider extends StructuredApiProvider {
  protected async completeJson(payload: ProviderPayload) {
    const imageDataUrl = await imageUriToDataUrl(payload.imageUri);
    const content: Record<string, unknown>[] = [{ type: "text", text: payload.prompt }];
    const image = parseDataUrl(imageDataUrl);
    if (image) {
      content.push({
        type: "image",
        source: {
          type: "base64",
          media_type: image.mediaType,
          data: image.base64
        }
      });
    }

    const json = await this.postJson("/messages", {
      model: this.config.modelName,
      max_tokens: 1800,
      temperature: 0.1,
      system: systemPrompt(),
      messages: [{ role: "user", content }]
    });

    const text = Array.isArray(json?.content)
      ? json.content
          .map((part: { type?: string; text?: string }) => (part.type === "text" ? part.text : ""))
          .filter(Boolean)
          .join("\n")
      : "";

    if (!text) {
      throw new Error("Claude response did not include JSON content.");
    }
    return text;
  }

  private async postJson(path: string, body: unknown) {
    const response = await fetch(`${this.config.baseUrl.replace(/\/$/, "")}${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "anthropic-version": "2023-06-01"
      },
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      throw new Error(`Anthropic-compatible server proxy returned ${response.status}`);
    }

    return response.json();
  }
}

function systemPrompt() {
  return [
    "You are BiteIQ's AI nutrition engine.",
    "Return only valid JSON. Do not wrap JSON in markdown.",
    "Never save food directly. Produce structured estimates for user review.",
    "Prefer conservative nutrition estimates and ask clarifying questions when portions are uncertain."
  ].join(" ");
}

function buildPrompt(task: AITask, input: CaptureInput | AssistantChatInput) {
  const context = "context" in input ? input.context : undefined;
  return [
    `Task: ${task}.`,
    outputContract(task),
    context ? `App context: ${JSON.stringify({ user: context.user, goal: context.goal, todayMeals: context.todayMeals })}` : "",
    `Input: ${JSON.stringify(input)}`
  ]
    .filter(Boolean)
    .join("\n\n");
}

function outputContract(task: AITask) {
  if (task === "assistantChatReasoning") {
    return 'Return {"confidence": number, "data": {"message": string, "suggestedActions": string[], "confidence": number}, "clarifyingQuestions": string[], "provenance": string[]}. The message should use the app context when available and can suggest logging, meal analysis, or photo upload.';
  }
  if (task === "ocrExtraction") {
    return 'Return {"confidence": number, "data": {"text": string, "fields": [{"label": string, "value": string, "confidence": number}]}, "clarifyingQuestions": string[], "provenance": string[]}.';
  }
  if (task === "barcodeInterpretation") {
    return 'Return {"confidence": number, "data": {"barcode": string, "productName": string, "brand": string, "servingSize": string, "nutritionPerServing": {"calories": number, "proteinGrams": number, "carbGrams": number, "fatGrams": number}}, "clarifyingQuestions": string[], "provenance": string[]}.';
  }
  if (task === "nutritionLabelParsing") {
    return 'Return {"confidence": number, "data": {"servingsPerContainer": number, "servingSize": string, "calories": number, "proteinGrams": number, "carbGrams": number, "fatGrams": number}, "clarifyingQuestions": string[], "provenance": string[]}.';
  }
  return 'Return {"confidence": number, "data": {"title": string, "confidence": number, "clarifyingQuestions": string[], "foods": [{"id": string, "name": string, "brand": string, "servingSize": string, "quantity": number, "confidence": number, "provenance": string[], "nutrition": {"calories": number, "proteinGrams": number, "carbGrams": number, "fatGrams": number, "provenance": string[]}}]}, "clarifyingQuestions": string[], "provenance": string[]}.';
}

function parseJsonEnvelope<T>(rawText: string): ApiEnvelope<T> {
  const trimmed = rawText.trim();
  const jsonText = trimmed.startsWith("{") ? trimmed : trimmed.slice(trimmed.indexOf("{"), trimmed.lastIndexOf("}") + 1);
  return JSON.parse(jsonText) as ApiEnvelope<T>;
}

function clampConfidence(value: unknown) {
  return typeof value === "number" ? Math.min(1, Math.max(0, value)) : 0.5;
}

async function imageUriToDataUrl(uri?: string) {
  if (!uri) return undefined;
  if (uri.startsWith("data:")) return uri;

  const response = await fetch(uri);
  const blob = await response.blob();

  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Could not read image for API upload."));
    reader.readAsDataURL(blob);
  });
}

function parseDataUrl(dataUrl?: string) {
  const match = dataUrl?.match(/^data:(.+);base64,(.+)$/);
  if (!match) return undefined;
  return { mediaType: match[1] || "image/jpeg", base64: match[2] };
}
