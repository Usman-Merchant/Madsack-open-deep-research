import { experimental_wrapLanguageModel as wrapLanguageModel } from "ai";
import { deepseek } from "@ai-sdk/deepseek";
import { customMiddleware } from "./custom-middleware";
// Type definition for valid reasoning models used for research and structured outputs
type ReasoningModel = (typeof VALID_REASONING_MODELS)[number];
// Valid reasoning models that can be used for research analysis and structured outputs
const VALID_REASONING_MODELS = [
  "deepseek-reasoner"
] as const;
// Models that support JSON structured output
const JSON_SUPPORTED_MODELS = [
  "deepseek-chat"
] as const;
// Helper to check if model supports JSON
export const supportsJsonOutput = (modelId: string) =>
  JSON_SUPPORTED_MODELS.includes(modelId as (typeof JSON_SUPPORTED_MODELS)[number]);
// Get reasoning model from env, with JSON support info
const REASONING_MODEL = process.env.REASONING_MODEL || "deepseek-reasoner";
const BYPASS_JSON_VALIDATION = process.env.BYPASS_JSON_VALIDATION === "true";
// Helper to get the reasoning model based on user's selected model
function getReasoningModel(modelId: string) {
  // If already using a valid reasoning model, keep using it
  if (VALID_REASONING_MODELS.includes(modelId as ReasoningModel)) {
    return modelId;
  }
  const configuredModel = REASONING_MODEL;
  if (!VALID_REASONING_MODELS.includes(configuredModel as ReasoningModel)) {
    const fallback = "deepseek-reasoner";
    console.warn(
      `Invalid REASONING_MODEL "${configuredModel}", falling back to ${fallback}`,
    );
    return fallback;
  }
  // Warn if trying to use JSON with unsupported model
  if (!BYPASS_JSON_VALIDATION && !supportsJsonOutput(configuredModel)) {
    console.warn(
      `Warning: Model ${configuredModel} does not support JSON schema. Set BYPASS_JSON_VALIDATION=true to override`,
    );
  }
  return configuredModel;
}
export const customModel = (
  apiIdentifier: string,
  forReasoning: boolean = false,
) => {
  // For reasoning, get the appropriate reasoning model
  const modelId = forReasoning ? getReasoningModel(apiIdentifier) : apiIdentifier;
  // Handle DeepSeek model selection
  if (modelId === "deepseek-reasoner") {
    console.log("Using model: deepseek-reasoner with DeepSeek provider");
    return wrapLanguageModel({
      model: deepseek("deepseek-reasoner"),
      middleware: customMiddleware,
    });
  } else if (modelId === "deepseek-chat") {
    console.log("Using model: deepseek-chat with DeepSeek provider");
    return wrapLanguageModel({
      model: deepseek("deepseek-chat"),
      middleware: customMiddleware,
    });
  } else if (modelId === "deepseek-coder") {
    console.log("Using model: deepseek-coder with DeepSeek provider");
    return wrapLanguageModel({
      model: deepseek("deepseek-coder"),
      middleware: customMiddleware,
    });
  } else {
    // Default to DeepSeek Chat
    console.log("Unknown model requested:", modelId, "falling back to deepseek-chat");
    return wrapLanguageModel({
      model: deepseek("deepseek-chat"),
      middleware: customMiddleware,
    });
  }
};
