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

function toDirectiveChip(name: string, payload: string, index: number): DirectiveChip {
  switch (name) {
    case "git-stage":
      return { id: `directive-${index}`, label: "已暂存" };
    case "git-commit":
      return { id: `directive-${index}`, label: "已提交" };
    case "git-push": {
      const branch = readDirectiveAttribute(payload, "branch");
      return { id: `directive-${index}`, label: branch ? `已推送 ${branch}` : "已推送" };
    }
    case "git-create-branch": {
      const branch = readDirectiveAttribute(payload, "branch");
      return {
        id: `directive-${index}`,
        label: branch ? `已创建分支 ${branch}` : "已创建分支",
      };
    }
    case "git-create-pr":
      return { id: `directive-${index}`, label: "已创建 PR" };
    case "code-comment":
      return { id: `directive-${index}`, label: "已添加评论" };
    case "archive":
      return { id: `directive-${index}`, label: "已归档" };
    case "automation-update": {
      const mode = readDirectiveAttribute(payload, "mode");
      if (mode === "suggested create") {
        return { id: `directive-${index}`, label: "建议自动化" };
      }
      if (mode === "suggested update") {
        return { id: `directive-${index}`, label: "建议更新自动化" };
      }
      if (mode === "view") {
        return { id: `directive-${index}`, label: "查看自动化" };
      }
      return { id: `directive-${index}`, label: "自动化已更新" };
    }
    default:
      return { id: `directive-${index}`, label: normalizeDirectiveName(name) };
  }
}

export function parseMessageBody(text: string): ParsedMessageBody {
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
    chips.push(toDirectiveChip(directiveName, payload, index));
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
