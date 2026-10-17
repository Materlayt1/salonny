import { expect, test, type APIRequestContext, type Page, type Route } from "@playwright/test";

type AvailabilityCall = { date: string; route: Route };
type AvailabilityHandler = (call: AvailabilityCall) => Promise<void>;

const calendarLoading = "Takvim kontrol ediliyor...";

function slotsFor(date: string, hour = "10") {
  return [`${date}T${hour}:00:00+03:00`, `${date}T${hour}:30:00+03:00`];
}

function fullDate(date: string) {
  return new Intl.DateTimeFormat("tr-TR", {
    day: "numeric", month: "long", year: "numeric", weekday: "long", timeZone: "Europe/Istanbul",
  }).format(new Date(`${date}T12:00:00+03:00`));
}

function deferred() {
  let release!: () => void;
  const promise = new Promise<void>((resolve) => { release = resolve; });
  return { promise, release };
}

async function openCalendar(page: Page, request: APIRequestContext) {
  const calls: string[] = [];
  const writes: string[] = [];
  let handler: AvailabilityHandler = async ({ date, route }) => {
    await route.fulfill({ status: 200, json: { slots: slotsFor(date) } });
  };
  await page.route("**/api/availability?**", async (route) => {
    const date = new URL(route.request().url()).searchParams.get("date");
    expect(date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    calls.push(date!);
    await handler({ date: date!, route });
  });
  // These UI regressions must never create real appointments or waitlist entries.
  await page.route(/\/api\/(bookings|waitlist)(?:\?|$)/, async (route) => {
    if (route.request().method() !== "GET") writes.push(route.request().url());
    await route.abort("blockedbyclient");
  });
  const response = await request.get("/api/businesses");
  expect(response.ok(), "Published business discovery must be available").toBeTruthy();
  const payload = await response.json() as {
    businesses?: Array<{ slug: string; services: unknown[] }>;
  };
  let found = false;
  for (const business of payload.businesses?.filter((item) => item.services.length) ?? []) {
    await page.goto(`/booking/${business.slug}`);
    if (!await page.getByRole("heading", { name: "Hizmet seç", exact: true }).count()) continue;
    await page.getByRole("button", { name: "Devam Et", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Uzman seç", exact: true })).toBeVisible();
    const next = page.getByRole("button", { name: "Devam Et", exact: true });
    if (!await next.isEnabled()) continue;
    await next.click();
    found = true;
    break;
  }
  test.skip(!found, "No fully configured published bookable business is available in this environment");
  await expect(page.getByRole("heading", { name: "Uygun saat seçimi", exact: true })).toBeVisible();
  await expect(page.getByText(calendarLoading, { exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "10:00", exact: true })).toBeVisible();
  const dates = page.getByTestId("booking-date-list").getByRole("button");
  await expect(dates).toHaveCount(14);
  return {
    calls,
    dates,
    writes,
    setHandler(nextHandler: AvailabilityHandler) { handler = nextHandler; },
  };
}

test("clicking an already selected booking date leaves current slots usable without refetching", async ({ page, request }) => {
  const calendar = await openCalendar(page, request);
  const selected = page.getByTestId("booking-date-list").getByRole("button", { pressed: true });
  await expect(selected).toHaveCount(1);
  const before = calendar.calls.length;
  await selected.click();
  await selected.click();
  await expect(page.getByText(calendarLoading, { exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "10:00", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Devam Et", exact: true })).toBeEnabled();
  expect(calendar.calls).toHaveLength(before);
  expect(calendar.writes).toEqual([]);
});

test("a different date requests that exact date and shows only its returned slots", async ({ page, request }) => {
  const calendar = await openCalendar(page, request);
  calendar.setHandler(async ({ date, route }) => {
    await route.fulfill({ status: 200, json: { slots: slotsFor(date, "11") } });
  });
  const target = calendar.dates.nth(2);
  const label = await target.getAttribute("aria-label");
  const before = calendar.calls.length;
  await target.click();
  await expect(target).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("button", { name: "11:00", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "10:00", exact: true })).toHaveCount(0);
  expect(calendar.calls.length).toBeGreaterThan(before);
  expect(fullDate(calendar.calls.at(-1)!)).toBe(label);
  await page.getByRole("button", { name: "Devam Et", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Randevunu onayla", exact: true })).toBeVisible();
  await expect(page.locator("section")).toContainText(label!);
  await expect(page.locator("section")).toContainText("11:00");
  expect(calendar.writes).toEqual([]);
});

test("a pending date change cannot continue with the previous date's selected time", async ({ page, request }) => {
  const calendar = await openCalendar(page, request);
  const requested = deferred();
  const response = deferred();
  const handled = deferred();
  calendar.setHandler(async ({ date, route }) => {
    requested.release();
    await response.promise;
    try { await route.fulfill({ status: 200, json: { slots: slotsFor(date, "12") } }); }
    finally { handled.release(); }
  });
  try {
    await calendar.dates.nth(2).click();
    await requested.promise;
    await expect(page.getByText(calendarLoading, { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "10:00", exact: true })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Devam Et", exact: true })).toBeDisabled();
    await expect(page.getByRole("heading", { name: "Randevunu onayla", exact: true })).toHaveCount(0);
  } finally { response.release(); }
  await handled.promise;
  await expect(page.getByRole("button", { name: "12:00", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Devam Et", exact: true })).toBeEnabled();
  expect(calendar.writes).toEqual([]);
});

test("a delayed earlier date response cannot replace the latest date's slots", async ({ page, request }) => {
  const calendar = await openCalendar(page, request);
  const requested = deferred();
  const staleResponse = deferred();
  const handled = deferred();
  let delayedDate: string | undefined;
  calendar.setHandler(async ({ date, route }) => {
    if (!delayedDate) {
      delayedDate = date;
      requested.release();
      await staleResponse.promise;
      try { await route.fulfill({ status: 200, json: { slots: slotsFor(date, "12") } }); }
      catch (error) {
        // Aborting the superseded fetch is a valid part of the stale-response protection.
        if (!/closed|cancel|abort|intercept/i.test(String(error))) throw error;
      } finally { handled.release(); }
    } else {
      await route.fulfill({ status: 200, json: { slots: slotsFor(date, "13") } });
    }
  });
  try {
    await calendar.dates.nth(2).click();
    await requested.promise;
    await calendar.dates.nth(3).click();
    await expect(calendar.dates.nth(3)).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByRole("button", { name: "13:00", exact: true })).toBeVisible();
  } finally { staleResponse.release(); }
  await handled.promise;
  await expect(page.getByText(calendarLoading, { exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "12:00", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "13:00", exact: true })).toBeVisible();
  expect(fullDate(calendar.calls.at(-1)!)).toBe(await calendar.dates.nth(3).getAttribute("aria-label"));
  expect(calendar.writes).toEqual([]);
});

for (const width of [390, 1280]) {
  test(`date navigation exposes all fourteen days without document overflow at ${width}px`, async ({ page, request }) => {
    await page.setViewportSize({ width, height: 844 });
    const calendar = await openCalendar(page, request);
    const region = page.getByRole("region", { name: "Tarih listesi", exact: true });
    const previous = page.getByRole("button", { name: "Önceki tarihler", exact: true });
    const next = page.getByRole("button", { name: "Sonraki tarihler", exact: true });
    await expect(previous).toBeVisible();
    await expect(next).toBeVisible();
    await expect(page.getByRole("group", { name: "Randevu tarihi", exact: true })).toBeVisible();
    for (let index = 0; index < 14 && await next.isEnabled(); index += 1) await next.click();
    await expect(next).toBeDisabled();
    await expect.poll(async () => region.evaluate((list) => {
      const last = list.querySelector("button:last-child")!;
      const bounds = list.getBoundingClientRect();
      const item = last.getBoundingClientRect();
      return item.left >= bounds.left - 1 && item.right <= bounds.right + 1;
    })).toBe(true);
    await calendar.dates.last().click();
    await expect(calendar.dates.last()).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByRole("button", { name: "10:00", exact: true })).toBeVisible();
    for (let index = 0; index < 14 && await previous.isEnabled(); index += 1) await previous.click();
    await expect(previous).toBeDisabled();
    await expect.poll(async () => region.evaluate((list) => {
      const first = list.querySelector("button")!;
      const bounds = list.getBoundingClientRect();
      const item = first.getBoundingClientRect();
      return item.left >= bounds.left - 1 && item.right <= bounds.right + 1;
    })).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    expect(calendar.writes).toEqual([]);
  });
}

test("dates can be focused and selected from the keyboard", async ({ page, request }) => {
  const calendar = await openCalendar(page, request);
  await calendar.dates.first().focus();
  await page.keyboard.press("Enter");
  await expect(calendar.dates.first()).toHaveAttribute("aria-pressed", "true");
  await expect(calendar.dates.first()).toBeFocused();
  await expect(page.getByRole("button", { name: "10:00", exact: true })).toBeVisible();
  await page.keyboard.press("Tab");
  await expect(calendar.dates.nth(1)).toBeFocused();
  await page.keyboard.press("Space");
  await expect(calendar.dates.nth(1)).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("button", { name: "10:00", exact: true })).toBeVisible();
  expect(fullDate(calendar.calls.at(-1)!)).toBe(await calendar.dates.nth(1).getAttribute("aria-label"));
  expect(calendar.writes).toEqual([]);
});

test("reselecting the current service and employee does not refetch or leave the calendar loading", async ({ page, request }) => {
  const calendar = await openCalendar(page, request);
  const before = calendar.calls.length;
  await page.getByRole("button", { name: "Geri", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Uzman seç", exact: true })).toBeVisible();
  const selectedEmployee = page.locator("section").getByRole("button").first();
  // The published flow defaults to the first service's first eligible employee.
  await expect(selectedEmployee).toHaveClass(/bg-\[#FAF9FF\]/);
  await selectedEmployee.click();
  await selectedEmployee.click();
  await page.getByRole("button", { name: "Geri", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Hizmet seç", exact: true })).toBeVisible();
  const selectedService = page.locator("section").getByRole("button").first();
  await selectedService.click();
  await selectedService.click();
  await page.getByRole("button", { name: "Devam Et", exact: true }).click();
  await page.getByRole("button", { name: "Devam Et", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Uygun saat seçimi", exact: true })).toBeVisible();
  await expect(page.getByText(calendarLoading, { exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "10:00", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Devam Et", exact: true })).toBeEnabled();
  expect(calendar.calls).toHaveLength(before);
  expect(calendar.writes).toEqual([]);
});

test("failed availability shows an error instead of a false empty day and retry recovers the same date", async ({ page, request }) => {
  const calendar = await openCalendar(page, request);
  calendar.setHandler(async ({ route }) => {
    await route.fulfill({ status: 400, json: { error: "Takvim isteği şu anda tamamlanamadı." } });
  });
  const target = calendar.dates.nth(2);
  await target.click();
  await expect(page.locator("section").getByRole("alert")).toHaveText("Takvim isteği şu anda tamamlanamadı.");
  await expect(page.getByText(calendarLoading, { exact: true })).toHaveCount(0);
  await expect(page.getByText("Bu gün için uygun saat bulunamadı.", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Bu gün için bekleme listesine katıl", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Devam Et", exact: true })).toBeDisabled();
  const failedDate = calendar.calls.at(-1)!;
  const before = calendar.calls.length;
  calendar.setHandler(async ({ date, route }) => {
    await route.fulfill({ status: 200, json: { slots: slotsFor(date, "14") } });
  });
  await page.getByRole("button", { name: "Tekrar dene", exact: true }).click();
  await expect(page.getByRole("button", { name: "14:00", exact: true })).toBeVisible();
  await expect(page.locator("section").getByRole("alert")).toHaveCount(0);
  await expect(target).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("button", { name: "Devam Et", exact: true })).toBeEnabled();
  expect(calendar.calls.length).toBeGreaterThan(before);
  expect(calendar.calls.at(-1)).toBe(failedDate);
  expect(calendar.writes).toEqual([]);
});

test("a stalled availability request times out and same-date retry restores usable slots", async ({ page, request }) => {
  test.setTimeout(60_000);
  const calendar = await openCalendar(page, request);
  const requested = deferred();
  const releaseStalled = deferred();
  const handled = deferred();
  calendar.setHandler(async ({ route }) => {
    requested.release();
    await releaseStalled.promise;
    try { await route.abort("timedout"); }
    catch (error) {
      // The application should already have aborted this timed-out fetch.
      if (!/closed|cancel|abort|intercept/i.test(String(error))) throw error;
    } finally { handled.release(); }
  });
  try {
    await calendar.dates.nth(2).click();
    await requested.promise;
    await expect(page.getByText(calendarLoading, { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Devam Et", exact: true })).toBeDisabled();
    // Use the real bounded timer so production fetch cancellation is exercised unchanged.
    await expect(page.locator("section").getByRole("alert")).toHaveText("Takvim yanıt vermedi. Lütfen tekrar dene.", { timeout: 20_000 });
    await expect(page.getByText(calendarLoading, { exact: true })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Bu gün için bekleme listesine katıl", exact: true })).toHaveCount(0);
    const timedOutDate = calendar.calls.at(-1)!;
    const before = calendar.calls.length;
    calendar.setHandler(async ({ date, route }) => {
      await route.fulfill({ status: 200, json: { slots: slotsFor(date, "15") } });
    });
    await page.getByRole("button", { name: "Tekrar dene", exact: true }).click();
    await expect(page.getByRole("button", { name: "15:00", exact: true })).toBeVisible();
    await expect(page.locator("section").getByRole("alert")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Devam Et", exact: true })).toBeEnabled();
    expect(calendar.calls.length).toBeGreaterThan(before);
    expect(calendar.calls.at(-1)).toBe(timedOutDate);
  } finally { releaseStalled.release(); }
  await handled.promise;
  expect(calendar.writes).toEqual([]);
});

test("returning to a previously loaded date stays pending until its fresh response and ignores the abandoned date", async ({ page, request }) => {
  const calendar = await openCalendar(page, request);
  const initialDate = calendar.calls.at(-1)!;
  const initialDateButton = page.getByTestId("booking-date-list").getByRole("button", { name: fullDate(initialDate), exact: true });
  const otherRequested = deferred();
  const originalRequested = deferred();
  const originalResponse = deferred();
  const otherResponse = deferred();
  const originalHandled = deferred();
  const otherHandled = deferred();
  calendar.setHandler(async ({ date, route }) => {
    const original = date === initialDate;
    (original ? originalRequested : otherRequested).release();
    await (original ? originalResponse : otherResponse).promise;
    try { await route.fulfill({ status: 200, json: { slots: slotsFor(date, original ? "16" : "17") } }); }
    catch (error) {
      if (!/closed|cancel|abort|intercept/i.test(String(error))) throw error;
    } finally { (original ? originalHandled : otherHandled).release(); }
  });
  try {
    await calendar.dates.nth(2).click();
    await otherRequested.promise;
    await expect(page.getByText(calendarLoading, { exact: true })).toBeVisible();
    await initialDateButton.click();
    await originalRequested.promise;
    await expect(initialDateButton).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByText(calendarLoading, { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "10:00", exact: true })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Devam Et", exact: true })).toBeDisabled();
    originalResponse.release();
    await originalHandled.promise;
    await expect(page.getByRole("button", { name: "16:00", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Devam Et", exact: true })).toBeEnabled();
    otherResponse.release();
    await otherHandled.promise;
    await expect(initialDateButton).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByText(calendarLoading, { exact: true })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "17:00", exact: true })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "16:00", exact: true })).toBeVisible();
    expect(calendar.calls.at(-1)).toBe(initialDate);
  } finally {
    originalResponse.release();
    otherResponse.release();
  }
  expect(calendar.writes).toEqual([]);
});
