import { z } from "zod";

export const nutritionEstimateSchema = z.object({
  calories: z.number().nonnegative(),
  proteinGrams: z.number().nonnegative(),
  carbGrams: z.number().nonnegative(),
  fatGrams: z.number().nonnegative(),
  fiberGrams: z.number().nonnegative().optional(),
  sugarGrams: z.number().nonnegative().optional(),
  sodiumMg: z.number().nonnegative().optional(),
  provenance: z.array(z.string())
});

export const foodItemSchema = z.object({
  id: z.string(),
  name: z.string().min(1),
  brand: z.string().optional(),
  servingSize: z.string().min(1),
  quantity: z.number().positive(),
  nutrition: nutritionEstimateSchema,
  confidence: z.number().min(0).max(1),
  provenance: z.array(z.string())
});

export const mealParseResultSchema = z.object({
  title: z.string().min(1),
  foods: z.array(foodItemSchema).min(1),
  confidence: z.number().min(0).max(1),
  clarifyingQuestions: z.array(z.string())
});

export const assistantAnswerSchema = z.object({
  message: z.string(),
  suggestedActions: z.array(z.string()),
  confidence: z.number().min(0).max(1)
});

export const ocrExtractionSchema = z.object({
  text: z.string(),
  fields: z.array(
    z.object({
      label: z.string(),
      value: z.string(),
      confidence: z.number().min(0).max(1)
    })
  )
});

export const barcodeInterpretationSchema = z.object({
  barcode: z.string(),
  productName: z.string(),
  brand: z.string().optional(),
  servingSize: z.string(),
  nutritionPerServing: z.object({
    calories: z.number().nonnegative(),
    proteinGrams: z.number().nonnegative(),
    carbGrams: z.number().nonnegative(),
    fatGrams: z.number().nonnegative()
  })
});
