import { z } from "zod";

import { assistantAnswerSchema, mealParseResultSchema, ocrExtractionSchema, barcodeInterpretationSchema } from "@/services/ai/schemas";
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
import { ModelProviderConfig } from "@/types/domain";

const nutritionLabelSchema = z.object({
  servingsPerContainer: z.number().optional(),
  servingSize: z.string(),
  calories: z.number().nonnegative(),
  proteinGrams: z.number().nonnegative(),
  carbGrams: z.number().nonnegative(),
  fatGrams: z.number().nonnegative()
});

export class LocalHttpProvider implements ModelProvider {
  constructor(private readonly config: ModelProviderConfig) {}

  extractOCR(input: CaptureInput): Promise<StructuredAIResult<OCRExtraction>> {
    return this.post("ocrExtraction", input, ocrExtractionSchema);
  }

  interpretBarcode(input: CaptureInput): Promise<StructuredAIResult<BarcodeInterpretation>> {
    return this.post("barcodeInterpretation", input, barcodeInterpretationSchema);
  }

  recognizeMealPhoto(input: CaptureInput): Promise<StructuredAIResult<MealParseResult>> {
    return this.post("mealPhotoRecognition", input, mealParseResultSchema) as Promise<StructuredAIResult<MealParseResult>>;
  }

  parseNutritionLabel(input: CaptureInput): Promise<StructuredAIResult<NutritionLabelParse>> {
    return this.post("nutritionLabelParsing", input, nutritionLabelSchema);
  }

  parseNaturalLanguageMeal(input: CaptureInput): Promise<StructuredAIResult<MealParseResult>> {
    return this.post("naturalLanguageMealParsing", input, mealParseResultSchema) as Promise<StructuredAIResult<MealParseResult>>;
  }

  estimateNutrition(input: CaptureInput): Promise<StructuredAIResult<MealParseResult>> {
    return this.post("nutritionEstimation", input, mealParseResultSchema) as Promise<StructuredAIResult<MealParseResult>>;
  }

  chat(input: AssistantChatInput): Promise<StructuredAIResult<AssistantAnswer>> {
    return this.post("assistantChatReasoning", input, assistantAnswerSchema);
  }

  private async post<T>(
    task: string,
    input: unknown,
    schema: z.ZodType<T>
  ): Promise<StructuredAIResult<T>> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.config.timeoutMs);

    try {
      const response = await fetch(`${this.config.baseUrl.replace(/\/$/, "")}/ai/tasks/${task}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model: this.config.modelName,
          task,
          input,
          responseFormat: "json"
        }),
        signal: controller.signal
      });

      if (!response.ok) {
        throw new Error(`Provider returned ${response.status}`);
      }

      const json = await response.json();
      const parsedData = schema.parse(json.data);

      return {
        taskId: json.taskId || `${task}-${Date.now()}`,
        confidence: clampConfidence(json.confidence),
        data: parsedData,
        clarifyingQuestions: Array.isArray(json.clarifyingQuestions) ? json.clarifyingQuestions : [],
        provenance: Array.isArray(json.provenance) ? json.provenance : [this.config.providerType],
        rawText: typeof json.rawText === "string" ? json.rawText : JSON.stringify(json)
      };
    } finally {
      clearTimeout(timeout);
    }
  }
}

function clampConfidence(value: unknown) {
  return typeof value === "number" ? Math.min(1, Math.max(0, value)) : 0.5;
}
