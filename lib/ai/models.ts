// Define your models here.

export interface Model {
  id: string;
  label: string;
  apiIdentifier: string;
  description: string;
}

// General chat/coding models
export const models: Array<Model> = [
  {
    id: 'deepseek-chat',
    label: 'DeepSeek Chat',
    apiIdentifier: 'deepseek-chat',
    description: 'Advanced conversational AI model by DeepSeek',
  },
  {
    id: 'deepseek-coder',
    label: 'DeepSeek Coder',
    apiIdentifier: 'deepseek-coder',
    description: 'Specialized DeepSeek model for coding and programming tasks',
  },
  {
    id: 'gpt-4o',
    label: 'GPT-4o',
    apiIdentifier: 'gpt-4o',
    description: 'OpenAI model for complex, multi-step reasoning and generation tasks',
  },
  {
    id: 'gpt-4o-mini',
    label: 'GPT-4o Mini',
    apiIdentifier: 'gpt-4o-mini',
    description: 'Lightweight version of GPT-4o, optimized for affordability and speed',
  }
] as const;

// Reasoning-focused models
export const reasoningModels: Array<Model> = [
  {
    id: 'deepseek-reasoner',
    label: 'DeepSeek Reasoner',
    apiIdentifier: 'deepseek-reasoner',
    description: 'Advanced reasoning model by DeepSeek for structured analysis and research',
  },
  {
    id: 'o1',
    label: 'o1',
    apiIdentifier: 'o1',
    description: 'For deep reasoning and complex, multi-step tasks',
  },
  {
    id: 'o1-mini',
    label: 'o1-mini',
    apiIdentifier: 'o1-mini',
    description: 'For deep reasoning and complex, multi-step tasks, cheaper.',
  },
  {
    id: 'o3-mini',
    label: 'o3-mini',
    apiIdentifier: 'o3-mini',
    description: 'For deep reasoning and complex, multi-step tasks, cheaper.',
  }
] as const;

// Defaults (Frontend)
export const DEFAULT_MODEL_NAME: string = 'deepseek-chat'; 
export const DEFAULT_REASONING_MODEL_NAME: string = 'deepseek-reasoner';