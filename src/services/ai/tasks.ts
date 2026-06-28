import { z } from "zod";

import {
  assistantAnswerSchema,
  barcodeInterpretationSchema,
  mealParseResultSchema,
  ocrExtractionSchema
} from "@/services/ai/schemas";
import { AITask } from "@/types/domain";

const nutritionLabelSchema = z.object({
  servingsPerContainer: z.number().optional(),
  servingSize: z.string(),
  calories: z.number().nonnegative(),
  proteinGrams: z.number().nonnegative(),
  carbGrams: z.number().nonnegative(),
  fatGrams: z.number().nonnegative()
});

export type AITaskDescriptor = {
  task: AITask;
  outputSchema: z.ZodTypeAny;
  lowConfidenceFallback: "ask_clarifying_question" | "request_manual_review" | "use_database_lookup";
  requiresStructuredJson: true;
};

export const aiTaskCatalog: Record<AITask, AITaskDescriptor> = {
  ocrExtraction: {
    task: "ocrExtraction",
    outputSchema: ocrExtractionSchema,
    lowConfidenceFallback: "request_manual_review",
    requiresStructuredJson: true
  },
  barcodeInterpretation: {
    task: "barcodeInterpretation",
    outputSchema: barcodeInterpretationSchema,
    lowConfidenceFallback: "use_database_lookup",
    requiresStructuredJson: true
  },
  mealPhotoRecognition: {
    task: "mealPhotoRecognition",
    outputSchema: mealParseResultSchema,
    lowConfidenceFallback: "ask_clarifying_question",
    requiresStructuredJson: true
  },
  nutritionLabelParsing: {
    task: "nutritionLabelParsing",
    outputSchema: nutritionLabelSchema,
    lowConfidenceFallback: "request_manual_review",
    requiresStructuredJson: true
  },
  naturalLanguageMealParsing: {
    task: "naturalLanguageMealParsing",
    outputSchema: mealParseResultSchema,
    lowConfidenceFallback: "ask_clarifying_question",
    requiresStructuredJson: true
  },
  portionEstimation: {
    task: "portionEstimation",
    outputSchema: mealParseResultSchema,
    lowConfidenceFallback: "ask_clarifying_question",
    requiresStructuredJson: true
  },
  nutritionEstimation: {
    task: "nutritionEstimation",
    outputSchema: mealParseResultSchema,
    lowConfidenceFallback: "request_manual_review",
    requiresStructuredJson: true
  },
  assistantChatReasoning: {
    task: "assistantChatReasoning",
    outputSchema: assistantAnswerSchema,
    lowConfidenceFallback: "ask_clarifying_question",
    requiresStructuredJson: true
  }
};
