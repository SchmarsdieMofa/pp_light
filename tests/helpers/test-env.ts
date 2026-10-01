export const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? "postgres://pp:pp@localhost:5432/pp_light_test";
export const E2E_DATABASE_URL =
  process.env.E2E_DATABASE_URL ?? "postgres://pp:pp@localhost:5432/pp_light_e2e";
