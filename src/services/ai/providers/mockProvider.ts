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
import { ModelProviderConfig, ProvenanceSource } from "@/types/domain";

const nowId = () => `${Date.now()}-${Math.round(Math.random() * 100000)}`;

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export class MockModelProvider implements ModelProvider {
  constructor(private readonly config: ModelProviderConfig) {}

  async extractOCR(): Promise<StructuredAIResult<OCRExtraction>> {
    await delay(350);
    return this.wrap("ocrExtraction", 0.88, {
      text: "Nutrition Facts Serving size 1 bowl Calories 520 Protein 38g Carbs 54g Fat 18g",
      fields: [
        { label: "Calories", value: "520", confidence: 0.94 },
        { label: "Protein", value: "38g", confidence: 0.9 },
        { label: "Carbs", value: "54g", confidence: 0.89 },
        { label: "Fat", value: "18g", confidence: 0.86 }
      ]
    });
  }

  async interpretBarcode(input: CaptureInput): Promise<StructuredAIResult<BarcodeInterpretation>> {
    await delay(350);
    return this.wrap("barcodeInterpretation", 0.91, {
      barcode: input.barcode || "012345678905",
      productName: "Greek yogurt cup",
      brand: "Demo Dairy",
      servingSize: "1 cup",
      nutritionPerServing: {
        calories: 150,
        proteinGrams: 18,
        carbGrams: 12,
        fatGrams: 3
      }
    });
  }

  async recognizeMealPhoto(_input: CaptureInput): Promise<StructuredAIResult<MealParseResult>> {
    await delay(700);
    return this.wrap("mealPhotoRecognition", 0.82, demoMeal("Chicken rice bowl", "photo"));
  }

  async parseNutritionLabel(_input: CaptureInput): Promise<StructuredAIResult<NutritionLabelParse>> {
    await delay(500);
    return this.wrap("nutritionLabelParsing", 0.86, {
      servingsPerContainer: 1,
      servingSize: "1 bowl",
      calories: 520,
      proteinGrams: 38,
      carbGrams: 54,
      fatGrams: 18
    });
  }

  async parseNaturalLanguageMeal(input: CaptureInput): Promise<StructuredAIResult<MealParseResult>> {
    await delay(500);
    const text = input.text?.toLowerCase() || "";
    const isSnack = text.includes("shake") || text.includes("banana");
    return this.wrap(
      "naturalLanguageMealParsing",
      isSnack ? 0.89 : 0.78,
      isSnack ? demoMeal("Protein shake and banana", "text") : demoMeal("Chicken rice bowl", "text")
    );
  }

  async estimateNutrition(input: CaptureInput): Promise<StructuredAIResult<MealParseResult>> {
    if (input.mode === "barcode") {
      const barcode = await this.interpretBarcode(input);
      return this.wrap("nutritionEstimation", barcode.confidence, {
        title: barcode.data.productName,
        confidence: barcode.confidence,
        clarifyingQuestions: [],
        foods: [
          {
            id: nowId(),
            name: barcode.data.productName,
            brand: barcode.data.brand,
            servingSize: barcode.data.servingSize,
            quantity: 1,
            confidence: barcode.confidence,
            provenance: ["barcode_lookup", "nutrition_database"],
            nutrition: {
              calories: barcode.data.nutritionPerServing.calories,
              proteinGrams: barcode.data.nutritionPerServing.proteinGrams,
              carbGrams: barcode.data.nutritionPerServing.carbGrams,
              fatGrams: barcode.data.nutritionPerServing.fatGrams,
              provenance: ["barcode_lookup", "nutrition_database"]
            }
          }
        ]
      });
    }

    if (input.mode === "photo") {
      return this.recognizeMealPhoto(input);
    }

    if (input.mode === "label") {
      const label = await this.parseNutritionLabel(input);
      return this.wrap("nutritionEstimation", label.confidence, {
        title: "Scanned nutrition label",
        confidence: label.confidence,
        clarifyingQuestions: ["Is this one serving or did you eat a different amount?"],
        foods: [
          {
            id: nowId(),
            name: "Label item",
            servingSize: label.data.servingSize,
            quantity: 1,
            confidence: label.confidence,
            provenance: ["ocr", "nutrition_database"],
            nutrition: {
              calories: label.data.calories,
              proteinGrams: label.data.proteinGrams,
              carbGrams: label.data.carbGrams,
              fatGrams: label.data.fatGrams,
              provenance: ["ocr", "nutrition_database"]
            }
          }
        ]
      });
    }

    return this.parseNaturalLanguageMeal(input);
  }

  async chat(input: AssistantChatInput): Promise<StructuredAIResult<AssistantAnswer>> {
    await delay(450);
    const message = input.message.toLowerCase();
    const meals = input.context?.todayMeals.length ?? 0;
    const calories = input.context?.todayMeals.reduce(
      (sum, meal) => sum + meal.entries.reduce((entrySum, entry) => entrySum + entry.foodItem.nutrition.calories, 0),
      0
    );
    const answer = message.includes("protein")
      ? `You have ${meals} meals logged and about ${Math.round(calories || 0)} calories recorded. A lean protein serving would move you toward today's target.`
      : `I can use today's ${meals} logged meal${meals === 1 ? "" : "s"} to estimate, draft, and review food before saving. For a new meal, send text or upload a photo.`;

    return this.wrap("assistantChatReasoning", 0.84, {
      message: answer,
      suggestedActions: ["Log suggested dinner", "Adjust macro goals"],
      confidence: 0.84
    });
  }

  private wrap<T>(task: string, confidence: number, data: T): StructuredAIResult<T> {
    return {
      taskId: `${task}-${nowId()}`,
      confidence,
      data,
      clarifyingQuestions: confidence < 0.85 ? ["Please confirm serving size before saving."] : [],
      provenance: ["mock_ai"],
      rawText: JSON.stringify(data)
    };
  }
}

function demoMeal(title: string, source: "photo" | "text"): MealParseResult {
  const provenance: ProvenanceSource[] =
    source === "photo" ? ["ai_vision", "nutrition_database"] : ["assistant_reasoning", "nutrition_database"];
  return {
    title,
    confidence: source === "photo" ? 0.82 : 0.89,
    clarifyingQuestions: source === "photo" ? ["Was the rice closer to 1 cup or 2 cups?"] : [],
    foods: [
      {
        id: nowId(),
        name: source === "photo" ? "Grilled chicken breast" : "Whey protein shake",
        servingSize: source === "photo" ? "5 oz" : "1 scoop with milk",
        quantity: 1,
        confidence: source === "photo" ? 0.86 : 0.91,
        provenance,
        nutrition: {
          calories: source === "photo" ? 235 : 240,
          proteinGrams: source === "photo" ? 43 : 32,
          carbGrams: source === "photo" ? 0 : 18,
          fatGrams: source === "photo" ? 5 : 5,
          provenance
        }
      },
      {
        id: nowId(),
        name: source === "photo" ? "Steamed white rice" : "Banana",
        servingSize: source === "photo" ? "1.5 cups" : "1 medium",
        quantity: 1,
        confidence: source === "photo" ? 0.74 : 0.88,
        provenance,
        nutrition: {
          calories: source === "photo" ? 310 : 105,
          proteinGrams: source === "photo" ? 6 : 1,
          carbGrams: source === "photo" ? 68 : 27,
          fatGrams: source === "photo" ? 1 : 0,
          provenance
        }
      },
      {
        id: nowId(),
        name: source === "photo" ? "Mixed vegetables" : "Peanut butter",
        servingSize: source === "photo" ? "1 cup" : "1 tbsp",
        quantity: 1,
        confidence: source === "photo" ? 0.8 : 0.7,
        provenance,
        nutrition: {
          calories: source === "photo" ? 80 : 95,
          proteinGrams: source === "photo" ? 4 : 4,
          carbGrams: source === "photo" ? 14 : 3,
          fatGrams: source === "photo" ? 2 : 8,
          provenance
        }
      }
    ]
  };
}
