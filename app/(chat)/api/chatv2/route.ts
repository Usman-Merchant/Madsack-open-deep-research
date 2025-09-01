import {
  type Message,
  convertToCoreMessages,
  createDataStreamResponse,
  generateText,
  streamText,
} from 'ai';
import { z } from 'zod';

import { customModel } from '@/lib/ai';
import { models, reasoningModels } from '@/lib/ai/models';
import { rateLimiter } from '@/lib/rate-limit';
import {
  codePrompt,
  systemPrompt,
  updateDocumentPrompt,
} from '@/lib/ai/prompts';
import {
  deleteChatById,
  getChatById,
  getDocumentById,
  getUser,
  createUser,
  saveChat,
  saveDocument,
  saveMessages,
  saveSuggestions,
} from '@/lib/db/queries';
import type { Suggestion } from '@/lib/db/schema';
import {
  generateUUID,
  getMostRecentUserMessage,
  sanitizeResponseMessages,
} from '@/lib/utils';

import { generateTitleFromUserMessage } from '../../actions';
import FirecrawlApp from '@mendable/firecrawl-js';

type AllowedTools = 'deepResearch' | 'search' | 'extract' | 'scrape';

const firecrawlTools: AllowedTools[] = ['search', 'extract', 'scrape'];
const allTools: AllowedTools[] = [...firecrawlTools, 'deepResearch'];

const app = new FirecrawlApp({
  apiKey: process.env.FIRECRAWL_API_KEY || '',
});

function getClientIdentifierFromRequest(request: Request): string {
  const forwardedFor = request.headers.get('x-forwarded-for');
  if (forwardedFor && forwardedFor.length > 0) {
    return forwardedFor.split(',')[0].trim();
  }
  const realIp = request.headers.get('x-real-ip');
  if (realIp) return realIp;
  return 'anonymous';
}

async function getAnonymousUserId(): Promise<string> {
  const email = process.env.ANONYMOUS_USER_EMAIL || 'anonymous@local';
  const existing = await getUser(email);
  if (existing.length > 0) return existing[0].id as string;
  // Create with a deterministic password placeholder; auth won't be used
  await createUser(email, 'anonymous');
  const created = await getUser(email);
  return created[0].id as string;
}

function isAuthorized(request: Request): boolean {
  const providedKey = request.headers.get('x-api-key');
  const secret = process.env.AUTH_SECRET;
  if (!providedKey || !secret) return false;
  return providedKey === secret;
}

export async function POST(request: Request) {
  if (!isAuthorized(request)) {
    return new Response('Unauthorized', { status: 401 });
  }

  const maxDuration = process.env.MAX_DURATION
    ? parseInt(process.env.MAX_DURATION)
    : 300;

  const {
    id,
    messages,
    modelId,
    reasoningModelId,
    experimental_deepResearch = false,
  }: {
    id: string;
    messages: Array<Message>;
    modelId: string;
    reasoningModelId: string;
    experimental_deepResearch?: boolean;
  } = await request.json();

  // Rate limit by IP (no auth/session)
  const identifier = getClientIdentifierFromRequest(request);
  try {
    const { success } = await rateLimiter.limit(identifier);
    if (!success) {
      return new Response('Too many requests', { status: 429 });
    }
  } catch {
    // If rate limiter is misconfigured or unavailable, don't block the request in v2
  }

  const model = models.find((m) => m.id === modelId);
  const reasoningModel = reasoningModels.find((m) => m.id === reasoningModelId);
  if (!model || !reasoningModel) {
    return new Response('Model not found', { status: 404 });
  }

  const coreMessages = convertToCoreMessages(messages);
  const userMessage = getMostRecentUserMessage(coreMessages);
  if (!userMessage) {
    return new Response('No user message found', { status: 400 });
  }

  const chat = await getChatById({ id });
  if (!chat) {
    const title = await generateTitleFromUserMessage({ message: userMessage });
    const ownerUserId = await getAnonymousUserId();
    await saveChat({ id, userId: ownerUserId, title });
  }

  const userMessageId = generateUUID();
  await saveMessages({
    messages: [
      { ...userMessage, id: userMessageId, createdAt: new Date(), chatId: id },
    ],
  });

  return createDataStreamResponse({
    execute: (dataStream) => {
      dataStream.writeData({ type: 'user-message-id', content: userMessageId });

      const result = streamText({
        model: customModel(model.apiIdentifier, false),
        system: systemPrompt,
        messages: coreMessages,
        maxSteps: 10,
        experimental_activeTools: experimental_deepResearch ? allTools : firecrawlTools,
        tools: {
          search: {
            description:
              "Search for web pages. Normally you should call the extract tool after this one to get a spceific data point if search doesn't the exact data you need.",
            parameters: z.object({
              query: z.string().describe('Search query to find relevant web pages'),
              maxResults: z
                .number()
                .optional()
                .describe('Maximum number of results to return (default 10)'),
            }),
            execute: async ({ query, maxResults = 5 }) => {
              try {
                const searchResult = await app.search(query);
                if (!searchResult.success) {
                  return { error: `Search failed: ${searchResult.error}`, success: false };
                }
                const resultsWithFavicons = searchResult.data.map((result: any) => {
                  const url = new URL(result.url);
                  const favicon = `https://www.google.com/s2/favicons?domain=${url.hostname}&sz=32`;
                  return { ...result, favicon };
                });
                searchResult.data = resultsWithFavicons;
                return { data: searchResult.data, success: true };
              } catch (error: any) {
                return { error: `Search failed: ${error.message}`, success: false };
              }
            },
          },
          extract: {
            description:
              'Extract structured data from web pages. Use this to get whatever data you need from a URL. Any time someone needs to gather data from something, use this tool.',
            parameters: z.object({
              urls: z.array(z.string()).describe('Array of URLs to extract data from'),
              prompt: z.string().describe('Description of what data to extract'),
            }),
            execute: async ({ urls, prompt }) => {
              try {
                const scrapeResult = await app.extract(urls, { prompt });
                if (!scrapeResult.success) {
                  return { error: `Failed to extract data: ${scrapeResult.error}`, success: false };
                }
                return { data: scrapeResult.data, success: true };
              } catch (error: any) {
                return { error: `Extraction failed: ${error.message}`, success: false };
              }
            },
          },
          scrape: {
            description: 'Scrape web pages. Use this to get from a page when you have the url.',
            parameters: z.object({ url: z.string().describe('URL to scrape') }),
            execute: async ({ url }: { url: string }) => {
              try {
                const scrapeResult = await app.scrapeUrl(url);
                if (!scrapeResult.success) {
                  return { error: `Failed to extract data: ${scrapeResult.error}`, success: false };
                }
                return {
                  data: scrapeResult.markdown ?? 'Could get the page content, try using search or extract',
                  success: true,
                };
              } catch (error: any) {
                return { error: `Extraction failed: ${error.message}`, success: false };
              }
            },
          },
          deepResearch: {
            description:
              'Perform deep research on a topic using an AI agent that coordinates search, extract, and analysis tools with reasoning steps.',
            parameters: z.object({ topic: z.string().describe('The topic or question to research') }),
            execute: async ({ topic, maxDepth = 7 }) => {
              const startTime = Date.now();
              const timeLimit = 4.5 * 60 * 1000;

              const researchState = {
                findings: [] as Array<{ text: string; source: string }>,
                summaries: [] as Array<string>,
                nextSearchTopic: '',
                urlToSearch: '',
                currentDepth: 0,
                failedAttempts: 0,
                maxFailedAttempts: 3,
                completedSteps: 0,
                totalExpectedSteps: maxDepth * 5,
              };

              const addSource = (source: { url: string; title: string; description: string }) => {
                dataStream.writeData({ type: 'source-delta', content: source });
              };

              const addActivity = (activity: {
                type: 'search' | 'extract' | 'analyze' | 'reasoning' | 'synthesis' | 'thought';
                status: 'pending' | 'complete' | 'error';
                message: string;
                timestamp: string;
                depth: number;
              }) => {
                if (activity.status === 'complete') {
                  researchState.completedSteps++;
                }
                dataStream.writeData({
                  type: 'activity-delta',
                  content: { ...activity, depth: researchState.currentDepth, completedSteps: researchState.completedSteps, totalSteps: researchState.totalExpectedSteps },
                });
              };

              const analyzeAndPlan = async (findings: Array<{ text: string; source: string }>) => {
                try {
                  const timeElapsed = Date.now() - startTime;
                  const timeRemaining = timeLimit - timeElapsed;
                  const timeRemainingMinutes = Math.round((timeRemaining / 1000 / 60) * 10) / 10;
                  const result = await generateText({
                    model: customModel(reasoningModel.apiIdentifier, true),
                    prompt: `You are a research agent analyzing findings about: ${topic}
                            You have ${timeRemainingMinutes} minutes remaining to complete the research but you don't need to use all of it.
                            Current findings: ${findings.map((f) => `[From ${f.source}]: ${f.text}`).join('\n')}
                            What has been learned? What gaps remain? What specific aspects should be investigated next if any?
                            If you need to search for more information, include a nextSearchTopic.
                            If you need to search for more information in a specific URL, include a urlToSearch.
                            Important: If less than 1 minute remains, set shouldContinue to false to allow time for final synthesis.
                            If I have enough information, set shouldContinue to false.
                            
                            Respond in this exact JSON format:
                            {
                              "analysis": {
                                "summary": "summary of findings",
                                "gaps": ["gap1", "gap2"],
                                "nextSteps": ["step1", "step2"],
                                "shouldContinue": true/false,
                                "nextSearchTopic": "optional topic",
                                "urlToSearch": "optional url"
                              }
                            }`,
                  });
                  try {
                    const parsed = JSON.parse(result.text);
                    return parsed.analysis;
                  } catch {
                    return null;
                  }
                } catch {
                  return null;
                }
              };

              const extractFromUrls = async (urls: string[]) => {
                const extractPromises = urls.map(async (url) => {
                  try {
                    addActivity({ type: 'extract', status: 'pending', message: `Analyzing ${new URL(url).hostname}`, timestamp: new Date().toISOString(), depth: researchState.currentDepth });
                    const result = await app.extract([url], { prompt: `Extract key information about ${topic}. Focus on facts, data, and expert opinions. Analysis should be full of details and very comprehensive.` });
                    if (result.success) {
                      addActivity({ type: 'extract', status: 'complete', message: `Extracted from ${new URL(url).hostname}`, timestamp: new Date().toISOString(), depth: researchState.currentDepth });
                      if (Array.isArray(result.data)) {
                        return result.data.map((item) => ({ text: item.data, source: url }));
                      }
                      return [{ text: result.data, source: url }];
                    }
                    return [];
                  } catch {
                    return [];
                  }
                });
                const results = await Promise.all(extractPromises);
                return results.flat();
              };

              try {
                while (researchState.currentDepth < maxDepth) {
                  const timeElapsed = Date.now() - startTime;
                  if (timeElapsed >= timeLimit) break;
                  researchState.currentDepth++;
                  dataStream.writeData({ type: 'depth-delta', content: { current: researchState.currentDepth, max: maxDepth, completedSteps: researchState.completedSteps, totalSteps: researchState.totalExpectedSteps } });
                  addActivity({ type: 'search', status: 'pending', message: `Searching for "${topic}"`, timestamp: new Date().toISOString(), depth: researchState.currentDepth });
                  const searchResult = await app.search(researchState.nextSearchTopic || topic);
                  if (!searchResult.success) {
                    addActivity({ type: 'search', status: 'error', message: `Search failed for "${researchState.nextSearchTopic || topic}"`, timestamp: new Date().toISOString(), depth: researchState.currentDepth });
                    researchState.failedAttempts++;
                    if (researchState.failedAttempts >= researchState.maxFailedAttempts) break;
                    continue;
                  }
                  addActivity({ type: 'search', status: 'complete', message: `Found ${searchResult.data.length} relevant results`, timestamp: new Date().toISOString(), depth: researchState.currentDepth });
                  searchResult.data.forEach((result: any) => addSource({ url: result.url, title: result.title, description: result.description }));
                  const topUrls = searchResult.data.slice(0, 3).map((r: any) => r.url);
                  const newFindings = await extractFromUrls([researchState.urlToSearch, ...topUrls]);
                  researchState.findings.push(...newFindings);
                  addActivity({ type: 'analyze', status: 'pending', message: 'Analyzing findings', timestamp: new Date().toISOString(), depth: researchState.currentDepth });
                  const analysis = await analyzeAndPlan(researchState.findings);
                  researchState.nextSearchTopic = analysis?.nextSearchTopic || '';
                  researchState.urlToSearch = analysis?.urlToSearch || '';
                  researchState.summaries.push(analysis?.summary || '');
                  if (!analysis) {
                    addActivity({ type: 'analyze', status: 'error', message: 'Failed to analyze findings', timestamp: new Date().toISOString(), depth: researchState.currentDepth });
                    researchState.failedAttempts++;
                    if (researchState.failedAttempts >= researchState.maxFailedAttempts) break;
                    continue;
                  }
                  addActivity({ type: 'analyze', status: 'complete', message: analysis.summary, timestamp: new Date().toISOString(), depth: researchState.currentDepth });
                  if (!analysis.shouldContinue || analysis.gaps.length === 0) break;
                  topic = analysis.gaps.shift() || topic;
                }

                addActivity({ type: 'synthesis', status: 'pending', message: 'Preparing final analysis', timestamp: new Date().toISOString(), depth: researchState.currentDepth });
                const finalAnalysis = await generateText({
                  model: customModel(reasoningModel.apiIdentifier, true),
                  maxTokens: 16000,
                  prompt: `Create a comprehensive long analysis of ${topic} based on these findings:\n${researchState.findings.map((f) => `[From ${f.source}]: ${f.text}`).join('\n')}\n${researchState.summaries.map((s) => `[Summary]: ${s}`).join('\n')}\nProvide all the thoughts processes including findings details,key insights, conclusions, and any remaining uncertainties. Include citations to sources where appropriate. This analysis should be very comprehensive and full of details. It is expected to be very long, detailed and comprehensive.`,
                });
                addActivity({ type: 'synthesis', status: 'complete', message: 'Research completed', timestamp: new Date().toISOString(), depth: researchState.currentDepth });
                dataStream.writeData({ type: 'finish', content: finalAnalysis.text });
                return { success: true, data: { findings: researchState.findings, analysis: finalAnalysis.text, completedSteps: researchState.completedSteps, totalSteps: researchState.totalExpectedSteps } };
              } catch (error: any) {
                dataStream.writeData({ type: 'activity-delta', content: { type: 'thought', status: 'error', message: `Research failed: ${error.message}`, timestamp: new Date().toISOString(), depth: researchState.currentDepth, completedSteps: researchState.completedSteps, totalSteps: researchState.totalExpectedSteps } });
                return { success: false, error: error.message, data: { findings: researchState.findings, completedSteps: researchState.completedSteps, totalSteps: researchState.totalExpectedSteps } };
              }
            },
          },
        },
        onFinish: async ({ response }) => {
          try {
            const responseMessagesWithoutIncompleteToolCalls = sanitizeResponseMessages(response.messages);
            await saveMessages({
              messages: responseMessagesWithoutIncompleteToolCalls.map((message) => {
                const messageId = generateUUID();
                if (message.role === 'assistant') {
                  dataStream.writeMessageAnnotation({ messageIdFromServer: messageId });
                }
                return { id: messageId, chatId: id, role: message.role, content: message.content, createdAt: new Date() };
              }),
            });
          } catch (error) {
            console.error('Failed to save chat');
          }
        },
        experimental_telemetry: { isEnabled: true, functionId: 'stream-text' },
      });

      result.mergeIntoDataStream(dataStream);
    },
  });
}

export async function DELETE(request: Request) {
  if (!isAuthorized(request)) {
    return new Response('Unauthorized', { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');
  if (!id) {
    return new Response('Not Found', { status: 404 });
  }
  try {
    await deleteChatById({ id });
    return new Response('Chat deleted', { status: 200 });
  } catch (error) {
    return new Response('An error occurred while processing your request', { status: 500 });
  }
}