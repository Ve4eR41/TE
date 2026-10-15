import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { z } from "zod";
import { ConfigError } from "./error.js";
export const readConfigFile = <Schema extends z.ZodType>(
  rootDir: string,
  fileName: string,
  schema: Schema,
): z.output<Schema> => {
  const filePath = resolve(rootDir, fileName);
  let text: string;
  try {
    text = readFileSync(filePath, "utf8");
  } catch {
    throw new ConfigError(filePath, [
      { path: [], message: "Cannot read configuration file" },
    ]);
  }
  let input: unknown;
  try {
    input = JSON.parse(text);
  } catch {
    throw new ConfigError(filePath, [{ path: [], message: "Invalid JSON" }]);
  }
  const result = schema.safeParse(input);
  if (!result.success) {
    throw new ConfigError(
      filePath,
      result.error.issues.map((issue) => ({
        path: issue.path.map((part) =>
          typeof part === "number" ? part : String(part),
        ),
        message: issue.message,
      })),
    );
  }
  return result.data;
};
