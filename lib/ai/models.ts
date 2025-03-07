// Define your models here.
export interface Model {
  id: string;
  label: string;
  apiIdentifier: string;
  description: string;
}
export const models: Array<Model> = [
  {
    id: 'deepseek-chat',
    label: 'DeepSeek Chat',
    apiIdentifier: 'deepseek-chat',
    description: 'Advanced conversational AI model',
  },
  {
    id: 'deepseek-coder',
    label: 'DeepSeek Coder',
    apiIdentifier: 'deepseek-coder',
    description: 'Specialized model for coding tasks',
  }
] as const;
export const reasoningModels: Array<Model> = [
  {
    id: 'deepseek-reasoner',
    label: 'deepseek-reasoner',
    apiIdentifier: 'deepseek-reasoner', 
    description: 'Advanced reasoning model with strong capabilities',
  }
] as const;
export const DEFAULT_MODEL_NAME: string = 'deepseek-chat'; // Set DeepSeek Chat as default
export const DEFAULT_REASONING_MODEL_NAME: string = 'deepseek-reasoner'; // Set DeepSeek R1 as default reasoning model
