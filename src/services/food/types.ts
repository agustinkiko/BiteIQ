import { DatabaseFood, FoodSourceId, FoodSourceSettings } from "@/types/domain";

export type SearchArgs = {
  query: string;
  limit: number;
  settings: FoodSourceSettings;
  signal?: AbortSignal;
};

export type BarcodeArgs = {
  barcode: string;
  settings: FoodSourceSettings;
  signal?: AbortSignal;
};

/**
 * One food catalog the app can search. Adapters are responsible for
 * normalizing whatever the upstream returns into `DatabaseFood`: nutrition
 * per 100 g plus a list of concrete servings.
 */
export type FoodSource = {
  id: FoodSourceId;
  label: string;
  /** Shown in Settings to explain what the user has to provide. */
  credentialHint?: string;
  requiresCredentials: boolean;
  isConfigured: (settings: FoodSourceSettings) => boolean;
  search: (args: SearchArgs) => Promise<DatabaseFood[]>;
  lookupBarcode?: (args: BarcodeArgs) => Promise<DatabaseFood | undefined>;
};

export class FoodSourceError extends Error {
  constructor(
    readonly sourceId: FoodSourceId,
    message: string
  ) {
    super(message);
    this.name = "FoodSourceError";
  }
}
