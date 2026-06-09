export type NormalizedToolInvocationText = {
  toolName: string;
  body: string;
};

type ParsedInvokeText = {
  toolName: string;
  body?: string;
};

const GENERIC_TOOL_NAMES = new Set(["call", "tool"]);

export function isGenericToolName(value: string | undefined): boolean {
  return value ? GENERIC_TOOL_NAMES.has(value.trim().toLowerCase()) : false;
}

function decodeXmlText(value: string): string {
  return value
    .replace(/&quot;/g, "\"")
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

function formatParameters(parameters: Array<{ name: string; value: string }>): string | undefined {
  if (parameters.length === 0) {
    return undefined;
  }
  if (parameters.length === 1) {
    return parameters[0]?.value;
  }
  return parameters.map((parameter) => `${parameter.name}: ${parameter.value}`).join("\n");
}

function parseInvokeText(value: string): ParsedInvokeText | null {
  const invokeMatch = value.match(/<invoke\s+name=(["'])([^"']+)\1\s*>([\s\S]*?)<\/invoke>/i);
  if (!invokeMatch) {
    return null;
  }

  const [, , rawToolName, rawBody = ""] = invokeMatch;
  const parameterMatches = rawBody.matchAll(
    /<parameter\s+name=(["'])([^"']+)\1\s*>([\s\S]*?)<\/parameter>/gi,
  );
  const parameters = [...parameterMatches]
    .map((match) => ({
      name: decodeXmlText(match[2] ?? "").trim(),
      value: decodeXmlText(match[3] ?? "").trim(),
    }))
    .filter((parameter) => parameter.name && parameter.value);

  const toolName = decodeXmlText(rawToolName ?? "").trim();
  if (!toolName) {
    return null;
  }

  return {
    toolName,
    body: formatParameters(parameters),
  };
}

export function normalizeToolInvocationText(
  rawToolName: string,
  rawBody: string,
): NormalizedToolInvocationText {
  const toolName = rawToolName.trim() || "Tool";
  const body = rawBody.trim() || toolName;
  const parsedInvoke = parseInvokeText(body);
  if (!parsedInvoke) {
    return { toolName, body };
  }

  const normalizedName = isGenericToolName(toolName) ? parsedInvoke.toolName : toolName;
  return {
    toolName: normalizedName,
    body: parsedInvoke.body ?? parsedInvoke.toolName,
  };
}
