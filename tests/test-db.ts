import path from "node:path";

export const TEST_DB_PATH = path.join(__dirname, "..", "prisma", "test.db");
export const TEST_DB_URL = `file:${TEST_DB_PATH.replace(/\\/g, "/")}`;
