import { readFileSync } from "node:fs";
import { isBuiltin } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { expect, it } from "vitest";

it("keeps Node I/O outside the browser entry point's runtime import graph", () => {
  const visited = new Set<string>();
  const visit = (path: string): void => {
    if (visited.has(path)) return;
    visited.add(path);
    const source = ts.createSourceFile(
      path,
      readFileSync(path, "utf8"),
      ts.ScriptTarget.Latest,
      true,
    );
    const follow = (specifier: string): void => {
      expect(isBuiltin(specifier), `${path} imports ${specifier}`).toBe(false);
      if (specifier.startsWith(".")) {
        visit(resolve(dirname(path), specifier.replace(/\.js$/, ".ts")));
      } else {
        // Zod is the only permitted browser runtime dependency in spec 002.
        expect(specifier).toBe("zod");
      }
    };
    const walk = (node: ts.Node): void => {
      if (
        ts.isImportDeclaration(node) &&
        !node.importClause?.isTypeOnly &&
        ts.isStringLiteral(node.moduleSpecifier)
      ) {
        follow(node.moduleSpecifier.text);
      }
      if (
        ts.isExportDeclaration(node) &&
        !node.isTypeOnly &&
        node.moduleSpecifier &&
        ts.isStringLiteral(node.moduleSpecifier)
      ) {
        follow(node.moduleSpecifier.text);
      }
      if (
        ts.isCallExpression(node) &&
        (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
          (ts.isIdentifier(node.expression) &&
            node.expression.text === "require"))
      ) {
        const specifier = node.arguments[0];
        expect(
          specifier && ts.isStringLiteral(specifier),
          "Imports must be statically checkable",
        ).toBe(true);
        if (specifier && ts.isStringLiteral(specifier)) follow(specifier.text);
      }
      ts.forEachChild(node, walk);
    };
    walk(source);
  };
  visit(fileURLToPath(new URL("../index.ts", import.meta.url)));
  expect(
    visited.has(fileURLToPath(new URL("./schemas.ts", import.meta.url))),
  ).toBe(true);
});
