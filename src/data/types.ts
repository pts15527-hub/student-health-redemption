export type ProductSeed = {
  slug: string;
  name: string;
  category: string;
  specification: string;
  primaryBenefits: string;
  imageSrc: string | null;
  imageAlt: string;
};

export type ProductAliasMap = Record<string, string>;

export type RedemptionRuleSeed = {
  label: string;
  mode: "fixed_quantity" | "mix_and_match" | "single_item";
  creditCost: number;
  quantityPerRedemption: number;
  notes: string;
  productSlugs: string[];
};

export type StudentPackagePlanSeed = {
  shareToken: string;
  planName: string;
  totalCredits: number;
  creditUnitLabel: string;
  startDate: string;
  rules: RedemptionRuleSeed[];
};
