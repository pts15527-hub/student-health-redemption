import assert from "node:assert/strict";
import { parseBookingInput } from "../lib/line/course-booking.ts";

const valid = parseBookingInput("7/15 18:30", 2026);
assert.equal(valid.ok, true);

if (valid.ok) {
  assert.equal(valid.data.sessionDate, "2026-07-15");
  assert.equal(valid.data.sessionTime, "18:30:00");
  assert.equal(valid.data.displayDate, "7/15");
  assert.equal(valid.data.displayTime, "18:30");
}

assert.equal(parseBookingInput("2/30 18:30", 2026).ok, false);
assert.equal(parseBookingInput("7/15 25:00", 2026).ok, false);
assert.equal(parseBookingInput("7月15日 18:30", 2026).ok, false);

const fullWidth = parseBookingInput("７／１５　１８：３０", 2026);
assert.equal(fullWidth.ok, true);

if (fullWidth.ok) {
  assert.equal(fullWidth.data.sessionDate, "2026-07-15");
  assert.equal(fullWidth.data.sessionTime, "18:30:00");
}

const mixedWidth = parseBookingInput("7／15 18：30", 2026);
assert.equal(mixedWidth.ok, true);

console.log("Course booking parser OK");
