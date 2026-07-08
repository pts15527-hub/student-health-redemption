import { productAliases, products } from "../../src/data";
import type { ProductSeed, RedemptionRuleSeed, StudentPackagePlanSeed } from "../../src/data";

type ParsedToken = {
  alias: string;
  quantity: number;
  unit: "組" | "盒";
};

export type ParsedRedemptionItem = {
  alias: string;
  productSlug: string;
  productName: string;
  inputQuantity: number;
  inputUnit: "組" | "盒";
  ruleLabel: string;
  boxes: number;
  creditUsed: number;
};

export type ParsedMixGroup = {
  label: string;
  requiredBoxes: number;
  creditUsed: number;
  boxes: number;
  items: ParsedRedemptionItem[];
};

export type ParsedRedemptionRecord = {
  date: string;
  creditUsed: number;
  totalBoxes: number;
  generalItems: ParsedRedemptionItem[];
  mixGroups: ParsedMixGroup[];
  confirmationText: string;
};

export type ParseRedemptionResult =
  | {
      ok: true;
      data: ParsedRedemptionRecord;
    }
  | {
      ok: false;
      errors: string[];
    };

type ParserOptions = {
  defaultYear?: number;
};

const productBySlug = new Map(products.map((product) => [product.slug, product]));
const aliasByInput: Record<string, string> = productAliases;

const compactDisplayNames: Record<string, string> = {
  "youthfountain-delete": "青春源汰淨",
  "youthfountain-reborn": "青春源煥活",
  "youthfountain-protect": "青春源倍護",
  "doubles-cocoa": "DoubleS 可可",
  "doubles-seafood-soup": "DoubleS 海鮮濃湯",
};

export function parseRedemptionMessage(
  rawMessage: string,
  plan: StudentPackagePlanSeed,
  options: ParserOptions = {},
): ParseRedemptionResult {
  const errors: string[] = [];
  const normalized = normalizeMessage(rawMessage);
  const tokens = normalized.split(/\s+/).filter(Boolean);
  const defaultYear = options.defaultYear ?? new Date().getFullYear();
  const dateResult = parseDateToken(tokens[0], defaultYear);

  if (!dateResult) {
    return {
      ok: false,
      errors: ["第一行或第一個欄位需要是日期，例如：7/1"],
    };
  }

  const bodyTokens = tokens.slice(1);
  const itemTokens = parseItemTokens(bodyTokens, errors);
  const generalItems: ParsedRedemptionItem[] = [];
  const mixGroups: ParsedMixGroup[] = [];
  let currentMix: {
    rule: RedemptionRuleSeed;
    items: ParsedRedemptionItem[];
    boxes: number;
  } | null = null;

  const closeMixGroup = () => {
    if (!currentMix) return;

    if (currentMix.boxes !== currentMix.rule.quantityPerRedemption) {
      errors.push(`${currentMix.rule.label} 需要剛好 ${currentMix.rule.quantityPerRedemption} 盒，目前是 ${currentMix.boxes} 盒`);
    }

    mixGroups.push({
      label: currentMix.rule.label,
      requiredBoxes: currentMix.rule.quantityPerRedemption,
      creditUsed: currentMix.rule.creditCost,
      boxes: currentMix.boxes,
      items: currentMix.items,
    });
    currentMix = null;
  };

  for (const token of itemTokens) {
    if ("mixSize" in token) {
      closeMixGroup();
      const mixRule = findMixRule(plan, token.mixSize);
      if (!mixRule) {
        errors.push(`找不到「任搭${token.mixSize}」的兌換規則`);
        continue;
      }
      currentMix = {
        rule: mixRule,
        items: [],
        boxes: 0,
      };
      continue;
    }

    const productSlug = aliasByInput[token.alias];
    if (!productSlug) {
      errors.push(`找不到商品代碼「${token.alias}」`);
      continue;
    }

    const product = productBySlug.get(productSlug);
    if (!product) {
      errors.push(`商品代碼「${token.alias}」對應到不存在的商品資料`);
      continue;
    }

    if (token.unit === "盒") {
      if (!currentMix) {
        errors.push(`「${token.alias} ${token.quantity}盒」需要先指定任搭規則，例如：任搭4 ${token.alias} ${token.quantity}盒`);
        continue;
      }

      if (!currentMix.rule.productSlugs.includes(productSlug)) {
        errors.push(`${displayProductName(product)} 不在「${currentMix.rule.label}」可任搭清單內`);
        continue;
      }

      const item = toParsedItem(token, product, currentMix.rule, token.quantity, currentMix.rule.creditCost);
      currentMix.items.push(item);
      currentMix.boxes += token.quantity;
      continue;
    }

    closeMixGroup();
    const rule = findGeneralRule(plan, productSlug);
    if (!rule) {
      errors.push(`${displayProductName(product)} 找不到一般「幾盒一組」兌換規則`);
      continue;
    }

    const boxes = token.quantity * rule.quantityPerRedemption;
    const creditUsed = token.quantity * rule.creditCost;
    generalItems.push(toParsedItem(token, product, rule, boxes, creditUsed));
  }

  closeMixGroup();

  if (itemTokens.length === 0) {
    errors.push("沒有讀到任何領取品項，請至少輸入一個商品代碼與數量");
  }

  if (errors.length > 0) {
    return {
      ok: false,
      errors,
    };
  }

  const creditUsed =
    generalItems.reduce((sum, item) => sum + item.creditUsed, 0) + mixGroups.reduce((sum, group) => sum + group.creditUsed, 0);
  const totalBoxes =
    generalItems.reduce((sum, item) => sum + item.boxes, 0) + mixGroups.reduce((sum, group) => sum + group.boxes, 0);

  const data: ParsedRedemptionRecord = {
    date: dateResult,
    creditUsed,
    totalBoxes,
    generalItems,
    mixGroups,
    confirmationText: buildConfirmationText(dateResult, generalItems, mixGroups, creditUsed, totalBoxes),
  };

  return {
    ok: true,
    data,
  };
}

function normalizeMessage(rawMessage: string) {
  return rawMessage
    .replace(/[，,]/g, " ")
    .replace(/[　]/g, " ")
    .replace(/\r\n/g, "\n")
    .trim();
}

function parseDateToken(token: string | undefined, defaultYear: number) {
  if (!token) return null;

  const slashDate = token.match(/^(\d{1,4})[/-](\d{1,2})(?:[/-](\d{1,2}))?$/);
  if (!slashDate) return null;

  const hasYear = slashDate[3] !== undefined;
  const year = hasYear ? Number(slashDate[1]) : defaultYear;
  const month = hasYear ? Number(slashDate[2]) : Number(slashDate[1]);
  const day = hasYear ? Number(slashDate[3]) : Number(slashDate[2]);

  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return null;
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;

  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function parseItemTokens(tokens: string[], errors: string[]) {
  const items: Array<ParsedToken | { mixSize: number }> = [];
  let index = 0;

  while (index < tokens.length) {
    const token = tokens[index];
    const mix = token.match(/^任搭(\d+)$/);
    if (mix) {
      items.push({ mixSize: Number(mix[1]) });
      index += 1;
      continue;
    }

    const compactItem = token.match(/^(.+?)(\d+)(組|盒)$/);
    if (compactItem) {
      items.push({
        alias: compactItem[1],
        quantity: Number(compactItem[2]),
        unit: compactItem[3] as "組" | "盒",
      });
      index += 1;
      continue;
    }

    const quantityWithUnit = tokens[index + 1]?.match(/^(\d+)(組|盒)$/);
    if (quantityWithUnit) {
      items.push({
        alias: token,
        quantity: Number(quantityWithUnit[1]),
        unit: quantityWithUnit[2] as "組" | "盒",
      });
      index += 2;
      continue;
    }

    const quantityOnly = tokens[index + 1]?.match(/^(\d+)$/);
    const unitOnly = tokens[index + 2]?.match(/^(組|盒)$/);
    if (quantityOnly && unitOnly) {
      items.push({
        alias: token,
        quantity: Number(quantityOnly[1]),
        unit: unitOnly[1] as "組" | "盒",
      });
      index += 3;
      continue;
    }

    errors.push(`讀不懂「${token}」附近的格式，請用「商品代碼 1組」或「任搭4 商品代碼 1盒」`);
    index += 1;
  }

  return items;
}

function findGeneralRule(plan: StudentPackagePlanSeed, productSlug: string) {
  return plan.rules.find((rule) => rule.mode !== "mix_and_match" && rule.productSlugs.includes(productSlug));
}

function findMixRule(plan: StudentPackagePlanSeed, mixSize: number) {
  return plan.rules.find((rule) => rule.mode === "mix_and_match" && rule.quantityPerRedemption === mixSize);
}

function toParsedItem(
  token: ParsedToken,
  product: ProductSeed,
  rule: RedemptionRuleSeed,
  boxes: number,
  creditUsed: number,
): ParsedRedemptionItem {
  return {
    alias: token.alias,
    productSlug: product.slug,
    productName: displayProductName(product),
    inputQuantity: token.quantity,
    inputUnit: token.unit,
    ruleLabel: rule.label,
    boxes,
    creditUsed,
  };
}

function displayProductName(product: ProductSeed) {
  return compactDisplayNames[product.slug] ?? product.name;
}

function buildConfirmationText(
  date: string,
  generalItems: ParsedRedemptionItem[],
  mixGroups: ParsedMixGroup[],
  creditUsed: number,
  totalBoxes: number,
) {
  const lines = [`領取日期：${date}`, ""];

  for (const item of generalItems) {
    lines.push(
      `${item.productName} ${item.inputQuantity} ${item.inputUnit}｜規則：${item.ruleLabel.replace(/\s/g, "")}｜本次 ${item.boxes} 盒`,
    );
  }

  for (const group of mixGroups) {
    lines.push(`${group.label}：`);
    for (const item of group.items) {
      lines.push(`${item.productName} ${item.inputQuantity} 盒`);
    }
    lines.push(`小計：${group.boxes} 盒｜扣 ${group.creditUsed} 組`);
  }

  lines.push("", `本次扣除：${creditUsed} 組`, `本次盒數：${totalBoxes} 盒`, "", "[確認送出] [取消]");

  return lines.join("\n");
}
