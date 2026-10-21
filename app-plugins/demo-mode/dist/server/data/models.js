import { randomUUID, timingSafeEqual } from 'node:crypto';
/** The model the simulated service offers. */
export const DEMO_CHAT_MODEL = 'demo-chat';
/** The title of the model environment service; the Agents plugin derives its name from it. */
export const DEMO_MODEL_SERVICE_TITLE = 'Demo model';
const CJK = /[\u3400-\u9fff]/u;
/** A scalar as text; anything else is empty, never `[object Object]`. */
const str = (value) => typeof value === 'string'
    ? value
    : typeof value === 'number' || typeof value === 'boolean'
        ? String(value)
        : '';
const text = (content) => {
    if (typeof content === 'string')
        return content;
    if (!Array.isArray(content))
        return '';
    return content
        .map((part) => part && typeof part === 'object' && 'text' in part ? str(part.text) : '')
        .join('');
};
const parseArguments = (value) => {
    if (value && typeof value === 'object')
        return value;
    if (typeof value !== 'string' || !value.trim())
        return {};
    try {
        const parsed = JSON.parse(value);
        return parsed && typeof parsed === 'object'
            ? parsed
            : {};
    }
    catch {
        return {};
    }
};
/** Reads an OpenAI chat completion request into the shape answers match on. */
export function decodeChatRequest(body) {
    const input = (body && typeof body === 'object' ? body : {});
    const messages = (Array.isArray(input.messages) ? input.messages : []).flatMap((message) => {
        const role = String(message.role);
        if (role === 'system' || role === 'developer')
            return [{ role: 'system', content: text(message.content) }];
        if (role === 'user')
            return [{ role: 'user', content: text(message.content) }];
        if (role === 'tool')
            return [
                {
                    role: 'tool',
                    content: text(message.content),
                    toolCallId: str(message.tool_call_id),
                },
            ];
        if (role !== 'assistant')
            return [];
        const calls = Array.isArray(message.tool_calls)
            ? message.tool_calls.map((call) => ({
                id: str(call.id),
                name: str(call.function?.name),
                arguments: parseArguments(call.function?.arguments),
            }))
            : [];
        return [
            {
                role: 'assistant',
                content: text(message.content),
                ...(calls.length ? { toolCalls: calls } : {}),
            },
        ];
    });
    const tools = (Array.isArray(input.tools) ? input.tools : []).flatMap((tool) => {
        const fn = tool?.function;
        return fn?.name
            ? [
                {
                    name: str(fn.name),
                    ...(typeof fn.description === 'string'
                        ? { description: fn.description }
                        : {}),
                    ...(fn.parameters ? { parameters: fn.parameters } : {}),
                },
            ]
            : [];
    });
    return requestOf(typeof input.model === 'string' ? input.model : DEMO_CHAT_MODEL, messages, tools);
}
/** Builds the request answers see, from messages in order. */
export function requestOf(model, messages, tools = [], tag) {
    const system = messages
        .filter((message) => message.role === 'system')
        .map((message) => message.content)
        .join('\n\n');
    const lastUser = messages.map((message) => message.role).lastIndexOf('user');
    const prompt = lastUser >= 0 ? messages[lastUser].content : '';
    const names = new Map();
    for (const message of messages)
        for (const call of message.toolCalls ?? [])
            names.set(call.id, call.name);
    const toolResults = messages
        .slice(lastUser + 1)
        .filter((message) => message.role === 'tool')
        .map((message) => ({
        name: names.get(message.toolCallId ?? '') ?? '',
        content: message.content,
    }));
    return {
        model,
        system,
        messages,
        prompt,
        tools,
        toolResults,
        language: CJK.test(prompt || system) ? 'zh' : 'en',
        ...(tag ? { tag } : {}),
    };
}
/** The plugin's own answer when no dataset answer matches: plainly simulated, in the prompt's language. */
export function fallbackAnswer(request) {
    const asked = request.prompt.trim().replace(/\s+/gu, ' ').slice(0, 120);
    const read = request.toolResults.map((result) => result.name).filter(Boolean);
    if (request.language === 'zh')
        return [
            '（演示模型）这是演示环境里的模拟回答，没有调用真实的大模型。',
            asked ? `你的问题是：「${asked}」。` : '',
            read.length
                ? `我读取了 ${read.length} 项数据（${[...new Set(read)].join('、')}），可以在页面上查看完整内容。`
                : '在正式环境里，这里会是模型结合你的数据给出的分析和建议。',
        ]
            .filter(Boolean)
            .join('\n\n');
    return [
        '(Demo model) This is a simulated answer from the demo environment; no real model was called.',
        asked ? `You asked: "${asked}".` : '',
        read.length
            ? `I read ${read.length} result(s) (${[...new Set(read)].join(', ')}); the pages show them in full.`
            : 'In a real deployment, a model would answer here from your own data.',
    ]
        .filter(Boolean)
        .join('\n\n');
}
function normalize(reply, request) {
    if (typeof reply === 'string')
        return { kind: 'text', text: reply };
    if ('text' in reply)
        return { kind: 'text', text: reply.text };
    const offered = new Set(request.tools.map((tool) => tool.name));
    const calls = reply.toolCalls
        // A tool the call did not offer cannot be run; answering in text keeps the conversation going.
        .filter((call) => offered.has(call.name))
        .map((call) => ({
        id: `call_${randomUUID().replaceAll('-', '').slice(0, 24)}`,
        name: call.name,
        arguments: call.arguments ?? {},
    }));
    return calls.length
        ? { kind: 'tools', calls }
        : { kind: 'text', text: fallbackAnswer(request) };
}
/**
 * The simulated model. Answers come from the dataset first, then the plugin's fallback; nothing here reaches a
 * network, a model provider or the database, so a call cannot wait on the caller's own transaction.
 */
export class DemoModels {
    answers = [];
    adapter;
    setAdapter(adapter) {
        this.adapter = adapter;
    }
    key = null;
    service = null;
    setAnswers(answers) {
        this.answers = answers;
    }
    /** The environment service and the key it was given, as the environment binding stores them. */
    bind(service, key) {
        this.service = service;
        this.key = key;
    }
    get serviceName() {
        return this.service;
    }
    /** Whether `ref` names the simulated model environment service. */
    isDemoModel(ref) {
        return Boolean(this.service && ref?.modelService === this.service);
    }
    authorize(header) {
        const presented = /^Bearer\s+(.+)$/iu.exec(header ?? '')?.[1]?.trim();
        if (!this.key || !presented)
            return false;
        const expected = Buffer.from(this.key);
        const actual = Buffer.from(presented);
        return (expected.length === actual.length && timingSafeEqual(expected, actual));
    }
    async respond(request) {
        return this.adapter ? this.adapter(request) : this.simulate(request);
    }
    async simulate(request) {
        for (const answer of this.answers) {
            if (!answer.match(request))
                continue;
            return normalize(await answer.reply(request), request);
        }
        return { kind: 'text', text: fallbackAnswer(request) };
    }
    /**
     * One answer in-process, for an application's own text generation when the simulated model is the one in use:
     * `tag` says what is asked, such as a business operation, which a call over the gateway cannot carry.
     */
    async complete(input) {
        const output = await this.respond(requestOf(DEMO_CHAT_MODEL, [
            ...(input.system
                ? [{ role: 'system', content: input.system }]
                : []),
            { role: 'user', content: input.prompt },
        ], [], input.tag));
        return output.kind === 'text' ? output.text : '';
    }
}
/** Rough token counts for the usage the gateway records: about four characters a token. */
export const tokens = (value) => Math.max(1, Math.ceil(value.length / 4));
/** Splits a text into a few pieces, so a streamed answer arrives the way a model's does. */
export function chunksOf(value) {
    const pieces = value.match(/[^\n。！？.!?]+[\n。！？.!?]*|[\n]+/gu) ?? [
        value,
    ];
    return pieces.length ? pieces : [value];
}
//# sourceMappingURL=models.js.map