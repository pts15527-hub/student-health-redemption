import { createSupabaseServerClient } from "@/lib/supabase/server";

type PendingStatus = "pending" | "confirmed" | "cancelled" | "expired";

type ParsedItem = {
  productSlug: string;
  productName: string;
  boxes: number;
};

type ParsedPayload = {
  date: string;
  creditUsed: number;
  totalBoxes: number;
  generalItems: ParsedItem[];
  mixGroups: Array<{
    items: ParsedItem[];
  }>;
};

type PendingRedemption = {
  id: string;
  student_id: string;
  parsed_payload: ParsedPayload;
  status: PendingStatus;
  is_test: boolean;
  expires_at: string;
};

export type PendingActionResult =
  | {
      ok: true;
      pendingId: string;
      isTest: boolean;
      status: "confirmed" | "cancelled";
      recordId?: string;
      date?: string;
      creditUsed?: number;
      totalBoxes?: number;
      itemCount?: number;
    }
  | {
      ok: false;
      statusCode: number;
      errors: string[];
    };

export async function findLatestPendingRedemption(studentId: string) {
  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase
    .from("pending_redemptions")
    .select("id, student_id, parsed_payload, status, is_test, expires_at")
    .eq("student_id", studentId)
    .eq("status", "pending")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    return {
      ok: false as const,
      statusCode: 500,
      errors: [error.message],
    };
  }

  return {
    ok: true as const,
    pending: (data as PendingRedemption | null) ?? null,
  };
}

export async function confirmPendingRedemption(
  pendingId: string,
  options: { requireTest?: boolean } = {},
): Promise<PendingActionResult> {
  const supabase = createSupabaseServerClient();
  const pendingResult = await loadPendingRedemption(pendingId);

  if (!pendingResult.ok) return pendingResult;

  const pending = pendingResult.pending;
  const validationError = validatePending(pending, options.requireTest);

  if (validationError) return validationError;

  if (new Date(pending.expires_at).getTime() < Date.now()) {
    await supabase
      .from("pending_redemptions")
      .update({ status: "expired" })
      .eq("id", pending.id)
      .eq("status", "pending");

    return {
      ok: false,
      statusCode: 410,
      errors: ["這筆待確認紀錄已逾時，請重新輸入領取紀錄"],
    };
  }

  const parsed = pending.parsed_payload;
  const productSlugs = collectProductSlugs(parsed);
  const { data: products, error: productsError } = await supabase
    .from("products")
    .select("id, slug")
    .in("slug", productSlugs);

  if (productsError) return failure(productsError.message);

  const productIdBySlug = new Map((products ?? []).map((product) => [product.slug, product.id]));
  const missingSlugs = productSlugs.filter((slug) => !productIdBySlug.has(slug));

  if (missingSlugs.length > 0) {
    return {
      ok: false,
      statusCode: 422,
      errors: [`找不到商品資料：${missingSlugs.join(", ")}`],
    };
  }

  const { data: packagePlan } = await supabase
    .from("package_plans")
    .select("id")
    .eq("student_id", pending.student_id)
    .maybeSingle();

  const testPrefix = pending.is_test ? "[TEST] " : "";
  const { data: record, error: recordError } = await supabase
    .from("redemption_records")
    .insert({
      student_id: pending.student_id,
      package_plan_id: packagePlan?.id ?? null,
      record_date: parsed.date,
      source_type: "manual",
      source_id: pending.id,
      credit_used: parsed.creditUsed,
      notes: `${testPrefix}LINE pending confirmation ${pending.id}`,
    })
    .select("id")
    .single();

  if (recordError || !record) {
    return failure(recordError?.message ?? "建立領取紀錄失敗");
  }

  const items = collectItems(parsed).map((item) => ({
    redemption_record_id: record.id,
    product_id: productIdBySlug.get(item.productSlug) ?? null,
    item_name: item.productName,
    quantity: item.boxes,
    notes: pending.is_test ? "[TEST] from pending redemption" : "from LINE pending redemption",
  }));

  const { error: itemError } = await supabase.from("redemption_record_items").insert(items);

  if (itemError) {
    await supabase.from("redemption_records").delete().eq("id", record.id);
    return failure(itemError.message);
  }

  const { data: updated, error: updateError } = await supabase
    .from("pending_redemptions")
    .update({ status: "confirmed", confirmed_at: new Date().toISOString() })
    .eq("id", pending.id)
    .eq("status", "pending")
    .select("id")
    .maybeSingle();

  if (updateError || !updated) {
    await supabase.from("redemption_records").delete().eq("id", record.id);
    return {
      ok: false,
      statusCode: 409,
      errors: [updateError?.message ?? "這筆紀錄已被處理，未重複送出"],
    };
  }

  return {
    ok: true,
    pendingId: pending.id,
    recordId: record.id,
    status: "confirmed",
    isTest: pending.is_test,
    date: parsed.date,
    creditUsed: parsed.creditUsed,
    totalBoxes: parsed.totalBoxes,
    itemCount: items.length,
  };
}

export async function cancelPendingRedemption(
  pendingId: string,
  options: { requireTest?: boolean } = {},
): Promise<PendingActionResult> {
  const supabase = createSupabaseServerClient();
  const pendingResult = await loadPendingRedemption(pendingId);

  if (!pendingResult.ok) return pendingResult;

  const pending = pendingResult.pending;
  const validationError = validatePending(pending, options.requireTest);

  if (validationError) return validationError;

  const { data: updated, error } = await supabase
    .from("pending_redemptions")
    .update({ status: "cancelled", cancelled_at: new Date().toISOString() })
    .eq("id", pending.id)
    .eq("status", "pending")
    .select("id")
    .maybeSingle();

  if (error || !updated) {
    return {
      ok: false,
      statusCode: error ? 500 : 409,
      errors: [error?.message ?? "這筆紀錄已被處理，無法取消"],
    };
  }

  return {
    ok: true,
    pendingId: pending.id,
    status: "cancelled",
    isTest: pending.is_test,
  };
}

async function loadPendingRedemption(pendingId: string) {
  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase
    .from("pending_redemptions")
    .select("id, student_id, parsed_payload, status, is_test, expires_at")
    .eq("id", pendingId)
    .maybeSingle();

  if (error) return failure(error.message);

  if (!data) {
    return {
      ok: false as const,
      statusCode: 404,
      errors: ["找不到待確認的領取紀錄"],
    };
  }

  return {
    ok: true as const,
    pending: data as PendingRedemption,
  };
}

function validatePending(pending: PendingRedemption, requireTest?: boolean) {
  if (requireTest && !pending.is_test) {
    return {
      ok: false as const,
      statusCode: 403,
      errors: ["測試 API 只能處理測試資料"],
    };
  }

  if (pending.status !== "pending") {
    return {
      ok: false as const,
      statusCode: 409,
      errors: [`這筆紀錄目前是 ${pending.status}，不能再次處理`],
    };
  }

  return null;
}

function failure(message: string) {
  return {
    ok: false as const,
    statusCode: 500,
    errors: [message],
  };
}

function collectItems(parsed: ParsedPayload) {
  return [...parsed.generalItems, ...parsed.mixGroups.flatMap((group) => group.items)];
}

function collectProductSlugs(parsed: ParsedPayload) {
  return Array.from(new Set(collectItems(parsed).map((item) => item.productSlug)));
}
