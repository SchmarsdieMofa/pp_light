import { parseArgs } from "node:util";
import { createDb } from "../src/server/db/client";
import { DomainError } from "../src/server/errors";
import { createUser } from "../src/server/users/service";

async function main() {
  const { values } = parseArgs({
    options: {
      email: { type: "string" },
      name: { type: "string" },
      password: { type: "string" },
    },
  });
  if (!values.email || !values.name || !values.password) {
    console.error("Aufruf: create-admin --email <mail> --name <name> --password <passwort>");
    process.exit(1);
  }
  if (values.password.length < 10) {
    console.error("Das Passwort muss mindestens 10 Zeichen haben.");
    process.exit(1);
  }
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("DATABASE_URL fehlt");
    process.exit(1);
  }
  const db = createDb(url);
  try {
    const user = await createUser(db, {
      email: values.email,
      name: values.name,
      password: values.password,
      role: "admin",
    });
    console.log(`Admin angelegt: ${user.email}`);
  } catch (err) {
    if (err instanceof DomainError) {
      console.error(err.message);
      process.exitCode = 1;
    } else {
      throw err;
    }
  } finally {
    await db.$client.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
