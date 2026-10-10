// Conventional Commits plus the release prefixes this repo uses:
// `major:` / `minor:` pick the version bump, `patch:` (or any other type) is a patch.
export default {
  extends: ["@commitlint/config-conventional"],
  rules: {
    "type-enum": [
      2,
      "always",
      [
        "major",
        "minor",
        "patch",
        "build",
        "chore",
        "ci",
        "docs",
        "feat",
        "fix",
        "perf",
        "refactor",
        "revert",
        "style",
        "test",
      ],
    ],
  },
};
