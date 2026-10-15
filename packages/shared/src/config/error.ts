export interface ConfigIssue {
  readonly path: (string | number)[];
  readonly message: string;
}

export class ConfigError extends Error {
  constructor(
    public readonly filePath: string,
    public readonly issues: readonly ConfigIssue[],
  ) {
    const details = issues
      .map(
        (issue) =>
          `${issue.path.length ? issue.path.join(".") : "<root>"}: ${issue.message}`,
      )
      .join("; ");
    super(`Invalid configuration in ${filePath}: ${details}`);
    this.name = "ConfigError";
  }
}
