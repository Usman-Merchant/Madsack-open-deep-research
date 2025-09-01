import { openai } from '@ai-sdk/openai';
import { openrouter } from '@openrouter/ai-sdk-provider';
import { deepseek } from '@ai-sdk/deepseek';
import { experimental_wrapLanguageModel as wrapLanguageModel } from 'ai';
import { customMiddleware } from "./custom-middleware";

type ReasoningModel = typeof VALID_REASONING_MODELS[number];

// Reasoning models that require deep thinking/structured outputs
const VALID_REASONING_MODELS = [
  'o1',
  'o1-mini',
  'o3-mini',
  'deepseek-reasoner',
  'gpt-4o'
] as const;

// Models that support JSON outputs
const JSON_SUPPORTED_MODELS = [
  'gpt-4o',
  'gpt-4o-mini',
  'deepseek-chat'
] as const;

export const supportsJsonOutput = (modelId: string) =>
  JSON_SUPPORTED_MODELS.includes(modelId as typeof JSON_SUPPORTED_MODELS[number]);

const REASONING_MODEL = process.env.REASONING_MODEL || 'o1-mini';
const BYPASS_JSON_VALIDATION = process.env.BYPASS_JSON_VALIDATION === 'true';

function getReasoningModel(modelId: string) {
  if (VALID_REASONING_MODELS.includes(modelId as ReasoningModel)) {
    return modelId;
  }

  const configuredModel = REASONING_MODEL;

  if (!VALID_REASONING_MODELS.includes(configuredModel as ReasoningModel)) {
    const fallback = 'o1-mini';
    console.warn(`Invalid REASONING_MODEL "${configuredModel}", falling back to ${fallback}`);
    return fallback;
  }

  if (!BYPASS_JSON_VALIDATION && !supportsJsonOutput(configuredModel)) {
    console.warn(`Warning: Model ${configuredModel} does not support JSON schema. Set BYPASS_JSON_VALIDATION=true to override`);
  }

  return configuredModel;
}

export const customModel = (apiIdentifier: string, forReasoning: boolean = false) => {
  const hasOpenRouterKey = !!process.env.OPENROUTER_API_KEY && process.env.OPENROUTER_API_KEY !== '****';
  const hasOpenAIKey = !!process.env.OPENAI_API_KEY && process.env.OPENAI_API_KEY !== '****';

  const modelId = forReasoning ? getReasoningModel(apiIdentifier) : apiIdentifier;

  // ===== DeepSeek Models =====
  if (modelId === 'deepseek-reasoner') {
    console.log('Using DeepSeek Reasoner');
    return wrapLanguageModel({
      model: deepseek('deepseek-reasoner'),
      middleware: customMiddleware,
    });
  }

  if (modelId === 'deepseek-chat') {
    console.log('Using DeepSeek Chat');
    return wrapLanguageModel({
      model: deepseek('deepseek-chat'),
      middleware: customMiddleware,
    });
  }

  if (modelId === 'deepseek-coder') {
    console.log('Using DeepSeek Coder');
    return wrapLanguageModel({
      model: deepseek('deepseek-coder'),
      middleware: customMiddleware,
    });
  }

  // ===== OpenRouter Models =====
  if (['o1', 'o1-mini', 'o3-mini'].includes(modelId)) {
    if (!hasOpenRouterKey) {
      throw new Error('OpenRouter API key is missing, required for model: ' + modelId);
    }

    console.log(`Using OpenRouter model: ${modelId}`);
    return wrapLanguageModel({
      model: openrouter(modelId),
      middleware: customMiddleware,
    });
  }

  // ===== OpenAI Models =====
  if (['gpt-4o', 'gpt-4o-mini'].includes(modelId)) {
    if (!hasOpenAIKey) {
      throw new Error('OpenAI API key is missing, required for model: ' + modelId);
    }

    console.log(`Using OpenAI model: ${modelId}`);
    return wrapLanguageModel({
      model: openai(modelId),
      middleware: customMiddleware,
    });
  }

  // ===== Fallback =====
  console.warn(`Unknown model requested: ${modelId}, defaulting to deepseek-chat`);
  return wrapLanguageModel({
    model: deepseek('deepseek-chat'),
    middleware: customMiddleware,
  });
};

