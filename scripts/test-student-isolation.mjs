import { createClient } from "@supabase/supabase-js";
import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";

if (existsSync(".env.local")) {
  const envFile = readFileSync(".env.local", "utf8");
  for (const line of envFile.split(/\r?\n/)) {
    const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!match || process.env[match[1]]) continue;
    process.env[match[1]] = match[2].replace(/^["']|["']$/g, "");
  }
}

const supabaseUrl = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.");
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const students = [
  {
    share_token: `isolation-a-${suffix}`,
    name: `隔離測試甲-${suffix}`,
    project_name: "Temporary isolation test A",
    amount: 12341,
  },
  {
    share_token: `isolation-b-${suffix}`,
    name: `隔離測試乙-${suffix}`,
    project_name: "Temporary isolation test B",
    amount: 56782,
  },
];
const createdStudentIds = [];
const port = 3200 + Math.floor(Math.random() * 500);
const baseUrl = `http://127.0.0.1:${port}`;
let server;

async function waitForServer() {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(baseUrl);
      if (response.ok) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  throw new Error("Timed out waiting for the local Next.js server.");
}

try {
  for (const fixture of students) {
    const { data: student, error: studentError } = await supabase
      .from("students")
      .insert({
        share_token: fixture.share_token,
        name: fixture.name,
        project_name: fixture.project_name,
      })
      .select("id")
      .single();

    if (studentError || !student) {
      throw new Error(studentError?.message ?? `Failed to create ${fixture.name}.`);
    }
    createdStudentIds.push(student.id);

    const { data: billingPlan, error: billingError } = await supabase
      .from("billing_plans")
      .insert({
        student_id: student.id,
        total_amount: fixture.amount,
        installment_count: 1,
        amount_per_installment: fixture.amount,
        due_day_of_month: 20,
        start_date: "2026-07-20",
      })
      .select("id")
      .single();

    if (billingError || !billingPlan) {
      throw new Error(billingError?.message ?? `Failed to create billing plan for ${fixture.name}.`);
    }

    const { error: paymentError } = await supabase.from("payment_records").insert({
      student_id: student.id,
      billing_plan_id: billingPlan.id,
      installment_no: 1,
      due_date: "2026-07-20",
      amount: fixture.amount,
      status: "unpaid",
    });

    if (paymentError) throw new Error(paymentError.message);
  }

  server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "-H", "127.0.0.1", "-p", String(port)], {
    cwd: process.cwd(),
    env: process.env,
    stdio: ["ignore", "pipe", "pipe"],
  });

  let serverError = "";
  server.stderr.on("data", (chunk) => {
    serverError += chunk.toString();
  });

  await waitForServer();

  for (const [index, fixture] of students.entries()) {
    const other = students[index === 0 ? 1 : 0];
    const response = await fetch(`${baseUrl}/s/${fixture.share_token}/payments`);
    const html = await response.text();

    if (!response.ok) throw new Error(`Student page returned ${response.status}: ${fixture.share_token}`);
    if (!html.includes(fixture.name)) throw new Error(`Own student name missing from ${fixture.share_token}.`);
    if (!html.includes(fixture.amount.toLocaleString("zh-TW"))) {
      throw new Error(`Own payment amount missing from ${fixture.share_token}.`);
    }
    if (html.includes(other.name) || html.includes(other.amount.toLocaleString("zh-TW")) || html.includes(other.share_token)) {
      throw new Error(`Student data crossed into ${fixture.share_token}.`);
    }
  }

  if (server.exitCode !== null) {
    throw new Error(`Next.js server exited early: ${serverError}`);
  }

  console.log("Student share-token isolation test OK");
} finally {
  if (server && server.exitCode === null) {
    server.kill();
  }
  if (createdStudentIds.length > 0) {
    const { error: cleanupError } = await supabase.from("students").delete().in("id", createdStudentIds);
    if (cleanupError) console.error(`Isolation test cleanup failed: ${cleanupError.message}`);
  }
}
