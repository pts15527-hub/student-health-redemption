import type { RedemptionRule } from "@/types/domain";

function unitText(unit: string) {
  return `一${unit}`;
}

export function formatRedemptionRuleTitle(rule: RedemptionRule, creditUnit: string) {
  if (rule.mode === "mix_and_match") {
    return `任搭${rule.quantity_per_redemption}盒為${unitText(creditUnit)}`;
  }

  return `固定${rule.quantity_per_redemption}盒${unitText(creditUnit)}`;
}

export function formatProductRuleSummary(rules: RedemptionRule[], creditUnit: string) {
  if (!rules.length) return "待設定";

  const fixedRules = rules.filter((rule) => rule.mode !== "mix_and_match");
  const mixRules = rules.filter((rule) => rule.mode === "mix_and_match");
  const fixedText = fixedRules.map((rule) => formatRedemptionRuleTitle(rule, creditUnit)).join("、");
  const mixText = mixRules
    .map((rule) => `可與其他品項任搭${rule.quantity_per_redemption}盒為${unitText(creditUnit)}`)
    .join("、");

  if (fixedText && mixText) {
    return `${fixedText}（${mixText}）`;
  }

  return fixedText || mixRules.map((rule) => formatRedemptionRuleTitle(rule, creditUnit)).join("、");
}
