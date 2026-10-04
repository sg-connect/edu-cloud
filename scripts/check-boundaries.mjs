import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
async function files(root) {
  const entries = await readdir(root, { withFileTypes: true });
  return (
    await Promise.all(
      entries
        .filter((e) => !["dist", "node_modules"].includes(e.name))
        .map((e) =>
          e.isDirectory() ? files(join(root, e.name)) : [join(root, e.name)],
        ),
    )
  ).flat();
}
const errors = [];
for (const file of await files("projects")) {
  if (!/\.(ts|tsx)$/.test(file) || file.endsWith(".d.ts")) continue;
  const text = await readFile(file, "utf8");
  if (
    file.startsWith("projects/frontend") &&
    /@edu\/database|backend\/src|\.DB\b|\.BOOKS\b|OPENAI_API_KEY|api\.openai\.com/.test(
      text,
    )
  )
    errors.push(`${file}: frontend crossed the backend/data boundary`);
  if (file.startsWith("projects/backend") && /\.prepare\(|\.batch\(/.test(text))
    errors.push(`${file}: SQL belongs in database`);
  if (
    file.startsWith("projects/database") &&
    /from ['"].*(frontend|backend|react)|fetch\(/.test(text)
  )
    errors.push(
      `${file}: database must not depend on UI, backend, or providers`,
    );
}
if (errors.length) {
  console.error(errors.join("\n"));
  process.exit(1);
}
console.log("Project boundaries verified: frontend → backend → database.");
