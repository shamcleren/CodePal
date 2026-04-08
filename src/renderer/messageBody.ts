export type DirectiveChip = {
  id: string;
  label: string;
};

type ParsedMessageBody = {
  cleanedText: string;
  chips: DirectiveChip[];
};

function preserveSoftBreaksOutsideCodeFences(text: string): string {
  const parts = text.split(/(```[\s\S]*?```)/g);
  return parts
    .map((part) => {
      if (part.startsWith("```")) {
        return part;
      }
      return part.replace(/(?<!\n)\n(?!\n)/g, "  \n");
    })
    .join("");
}

function readDirectiveAttribute(source: string, name: string): string | null {
  const pattern = new RegExp(`${name}="([^"]+)"`);
  const match = source.match(pattern);
  return match?.[1] ?? null;
}

function normalizeDirectiveName(name: string): string {
  return name.replace(/[-_]+/g, " ").trim().toLowerCase();
}

type DirectiveLabelFn = (key: string, params?: Record<string, string>) => string;

function defaultDirectiveLabel(key: string, params?: Record<string, string>): string {
  switch (key) {
    case "directive.gitStage":
      return "Staged";
    case "directive.gitCommit":
      return "Committed";
    case "directive.gitPush":
      return params?.branch ? `Pushed ${params.branch}` : "Pushed";
    case "directive.gitCreateBranch":
      return params?.branch ? `Created branch ${params.branch}` : "Created branch";
    case "directive.gitPushBranch":
      return params?.branch ? `Pushed ${params.branch}` : "Pushed";
    case "directive.gitCreateBranchWithName":
      return params?.branch ? `Created branch ${params.branch}` : "Created branch";
    case "directive.gitCreatePr":
      return "Created PR";
    case "directive.codeComment":
      return "Added comment";
    case "directive.archive":
      return "Archived";
    case "directive.automationSuggestCreate":
      return "Suggested automation";
    case "directive.automationSuggestUpdate":
      return "Suggested automation update";
    case "directive.automationView":
      return "View automation";
    case "directive.automationUpdated":
      return "Automation updated";
    default:
      return key;
  }
}

function toDirectiveChip(
  name: string,
  payload: string,
  index: number,
  labelForDirective: DirectiveLabelFn,
): DirectiveChip {
  switch (name) {
    case "git-stage":
      return { id: `directive-${index}`, label: labelForDirective("directive.gitStage") };
    case "git-commit":
      return { id: `directive-${index}`, label: labelForDirective("directive.gitCommit") };
    case "git-push": {
      const branch = readDirectiveAttribute(payload, "branch");
      return {
        id: `directive-${index}`,
        label: labelForDirective(
          branch ? "directive.gitPushBranch" : "directive.gitPush",
          branch ? { branch } : undefined,
        ),
      };
    }
    case "git-create-branch": {
      const branch = readDirectiveAttribute(payload, "branch");
      return {
        id: `directive-${index}`,
        label: labelForDirective(
          branch ? "directive.gitCreateBranchWithName" : "directive.gitCreateBranch",
          branch ? { branch } : undefined,
        ),
      };
    }
    case "git-create-pr":
      return { id: `directive-${index}`, label: labelForDirective("directive.gitCreatePr") };
    case "code-comment":
      return { id: `directive-${index}`, label: labelForDirective("directive.codeComment") };
    case "archive":
      return { id: `directive-${index}`, label: labelForDirective("directive.archive") };
    case "automation-update": {
      const mode = readDirectiveAttribute(payload, "mode");
      if (mode === "suggested create") {
        return {
          id: `directive-${index}`,
          label: labelForDirective("directive.automationSuggestCreate"),
        };
      }
      if (mode === "suggested update") {
        return {
          id: `directive-${index}`,
          label: labelForDirective("directive.automationSuggestUpdate"),
        };
      }
      if (mode === "view") {
        return { id: `directive-${index}`, label: labelForDirective("directive.automationView") };
      }
      return { id: `directive-${index}`, label: labelForDirective("directive.automationUpdated") };
    }
    default:
      return { id: `directive-${index}`, label: normalizeDirectiveName(name) };
  }
}

export function parseMessageBody(
  text: string,
  labelForDirective: DirectiveLabelFn = defaultDirectiveLabel,
): ParsedMessageBody {
  const matches = [...text.matchAll(/::([a-z0-9_-]+)\{([^{}]*)\}/gi)];
  if (matches.length === 0) {
    return { cleanedText: text, chips: [] };
  }

  const chips: DirectiveChip[] = [];
  let cleanedText = text;

  for (const [index, match] of matches.entries()) {
    const fullMatch = match[0];
    const directiveName = match[1] ?? "";
    const payload = match[2] ?? "";
    chips.push(toDirectiveChip(directiveName, payload, index, labelForDirective));
    cleanedText = cleanedText.replace(fullMatch, "");
  }

  return {
    cleanedText: cleanedText.replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim(),
    chips,
  };
}

export function toRenderableMessageBody(text: string): string {
  const { cleanedText } = parseMessageBody(text);
  return preserveSoftBreaksOutsideCodeFences(cleanedText);
}

export function summarizeMessageBody(text: string): string {
  const { cleanedText } = parseMessageBody(text);

  return cleanedText
    .replace(/```[a-z0-9_-]*\n([\s\S]*?)```/gi, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/^>\s+/gm, "")
    .replace(/^\s{0,3}(?:#{1,6}|-|\*|\+|\d+\.)\s+/gm, "")
    .replace(/(\*\*|__)(.*?)\1/g, "$2")
    .replace(/(^|[\s(])([*_])([^*_]+)\2(?=[\s).,!?;:]|$)/g, "$1$3")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
