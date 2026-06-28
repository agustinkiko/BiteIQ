import {
  AssistantAnswer,
  BarcodeInterpretation,
  CaptureInput,
  MealParseResult,
  NutritionLabelParse,
  OCRExtraction,
  StructuredAIResult
} from "@/types/ai";

export interface ModelProvider {
  extractOCR(input: CaptureInput): Promise<StructuredAIResult<OCRExtraction>>;
  interpretBarcode(input: CaptureInput): Promise<StructuredAIResult<BarcodeInterpretation>>;
  recognizeMealPhoto(input: CaptureInput): Promise<StructuredAIResult<MealParseResult>>;
  parseNutritionLabel(input: CaptureInput): Promise<StructuredAIResult<NutritionLabelParse>>;
  parseNaturalLanguageMeal(input: CaptureInput): Promise<StructuredAIResult<MealParseResult>>;
  estimateNutrition(input: CaptureInput): Promise<StructuredAIResult<MealParseResult>>;
  chat(input: { message: string }): Promise<StructuredAIResult<AssistantAnswer>>;
}
