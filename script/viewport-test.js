import puppeteer from "puppeteer";

const URL = "http://localhost:5400";
const OUTPUT = "attached_assets/session-375.png";
const VIEWPORT = { width: 375, height: 812, deviceScaleFactor: 2 };

const sampleData = {
  liftlog_exercises: [
    { id: "ex1", name: "Bench Press", muscleGroup: "Chest", createdAt: Date.now() },
  ],
  liftlog_templates: [
    {
      id: "t1",
      name: "Push Day",
      description: "Demo active session",
      color: "#3b82f6",
      createdAt: Date.now() - 1000 * 60 * 60,
      lastUsed: Date.now() - 1000 * 60 * 30,
      exercises: [
        {
          id: "te1",
          exerciseId: "ex1",
          exerciseName: "Bench Press",
          muscleGroup: "Chest",
          defaultSets: 4,
          order: 0,
        },
      ],
    },
  ],
  liftlog_active_session: {
      id: "s1",
      templateId: "t1",
      templateName: "Push Day",
      startedAt: Date.now() - 1000 * 60 * 5,
      exercises: [
        {
          id: "se1",
          exerciseId: "ex1",
          exerciseName: "Bench Press",
          muscleGroup: "Chest",
          sets: [
            { id: "set1", weight: 80, reps: 8, partialReps: 0, type: "normal", completed: false },
            { id: "set2", weight: 82.5, reps: 6, partialReps: 0, type: "normal", completed: false },
            { id: "set3", weight: 85, reps: 4, partialReps: 0, type: "assisted", completed: false },
            { id: "set4", weight: 70, reps: 10, partialReps: 0, type: "failure", completed: false },
          ],
        },
      ],
      cardio: [],
    },
};

async function writeLocalStorage(page) {
  await page.evaluate((data) => {
    for (const [key, value] of Object.entries(data)) {
      localStorage.setItem(key, JSON.stringify(value));
    }
  }, sampleData);
}

async function main() {
  const browser = await puppeteer.launch({ args: ["--no-sandbox", "--disable-setuid-sandbox"] });
  const page = await browser.newPage();
  await page.setViewport(VIEWPORT);
  await page.goto(URL, { waitUntil: "networkidle2" });
  await writeLocalStorage(page);
  await page.goto(`${URL}/session/t1`, { waitUntil: "networkidle2" });
  await page.waitForSelector("[data-testid^='button-remove-set-']", { timeout: 10000 });
  await new Promise((resolve) => setTimeout(resolve, 500));
  await page.screenshot({ path: OUTPUT, fullPage: false });
  console.log(`Saved viewport screenshot to ${OUTPUT}`);
  await browser.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
