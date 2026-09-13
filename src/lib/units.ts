import Decimal from "decimal.js";

export const unitDefinitions = {
  mg: { dimension: "mass", factor: "0.001", label: "mg" },
  g: { dimension: "mass", factor: "1", label: "g" },
  kg: { dimension: "mass", factor: "1000", label: "kg" },
  ml: { dimension: "volume", factor: "1", label: "ml" },
  l: { dimension: "volume", factor: "1000", label: "L" },
  tsp: { dimension: "volume", factor: "4.92892159375", label: "tsp" },
  tbsp: { dimension: "volume", factor: "14.78676478125", label: "tbsp" },
  each: { dimension: "count", factor: "1", label: "each" },
  dozen: { dimension: "count", factor: "12", label: "dozen" },
} as const;

export type InventoryUnit = keyof typeof unitDefinitions;
export type UnitDimension =
  (typeof unitDefinitions)[InventoryUnit]["dimension"];

export const baseUnitByDimension: Record<UnitDimension, InventoryUnit> = {
  mass: "g",
  volume: "ml",
  count: "each",
};

export function isInventoryUnit(value: string): value is InventoryUnit {
  return value in unitDefinitions;
}

export function convertQuantity(
  quantity: Decimal.Value,
  from: InventoryUnit,
  to: InventoryUnit,
): Decimal {
  const source = unitDefinitions[from];
  const target = unitDefinitions[to];

  if (source.dimension !== target.dimension) {
    throw new Error(`Cannot convert ${from} to ${to}`);
  }

  return new Decimal(quantity).mul(source.factor).div(target.factor);
}

export function toBaseQuantity(
  quantity: Decimal.Value,
  unit: InventoryUnit,
): Decimal {
  const definition = unitDefinitions[unit];
  return convertQuantity(
    quantity,
    unit,
    baseUnitByDimension[definition.dimension],
  );
}

export function formatQuantity(
  baseQuantity: Decimal.Value,
  dimension: UnitDimension,
): string {
  const quantity = new Decimal(baseQuantity);

  if (dimension === "mass" && quantity.abs().gte(1000)) {
    return `${quantity.div(1000).toDecimalPlaces(2).toString()} kg`;
  }
  if (dimension === "volume" && quantity.abs().gte(1000)) {
    return `${quantity.div(1000).toDecimalPlaces(2).toString()} L`;
  }

  return `${quantity.toDecimalPlaces(2).toString()} ${baseUnitByDimension[dimension]}`;
}
