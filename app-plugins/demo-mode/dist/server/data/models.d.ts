import type { DemoAnswer, DemoModelMessage, DemoModelRequest, DemoModelTool, DemoToolCall } from './types.js';
/** The model the simulated service offers. */
export declare const DEMO_CHAT_MODEL = "demo-chat";
/** The title of the model environment service; the Agents plugin derives its name from it. */
export declare const DEMO_MODEL_SERVICE_TITLE = "Demo model";
/** What the simulated model answers, after the dataset's answers and the plugin's fallback were tried. */
export type DemoModelOutput = {
    readonly kind: 'text';
    readonly text: string;
} | {
    readonly kind: 'tools';
    readonly calls: readonly DemoToolCall[];
};
/** Reads an OpenAI chat completion request into the shape answers match on. */
export declare function decodeChatRequest(body: unknown): DemoModelRequest;
/** Builds the request answers see, from messages in order. */
export declare function requestOf(model: string, messages: readonly DemoModelMessage[], tools?: readonly DemoModelTool[], tag?: string): DemoModelRequest;
/** The plugin's own answer when no dataset answer matches: plainly simulated, in the prompt's language. */
export declare function fallbackAnswer(request: DemoModelRequest): string;
/**
 * The simulated model. Answers come from the dataset first, then the plugin's fallback; nothing here reaches a
 * network, a model provider or the database, so a call cannot wait on the caller's own transaction.
 */
export declare class DemoModels {
    private answers;
    private adapter?;
    setAdapter(adapter: (request: DemoModelRequest) => Promise<DemoModelOutput>): void;
    private key;
    private service;
    setAnswers(answers: readonly DemoAnswer[]): void;
    /** The environment service and the key it was given, as the environment binding stores them. */
    bind(service: string | null, key: string | null): void;
    get serviceName(): string | null;
    /** Whether `ref` names the simulated model environment service. */
    isDemoModel(ref: {
        readonly modelService?: string | null;
    } | null | undefined): boolean;
    authorize(header: string | undefined): boolean;
    respond(request: DemoModelRequest): Promise<DemoModelOutput>;
    simulate(request: DemoModelRequest): Promise<DemoModelOutput>;
    /**
     * One answer in-process, for an application's own text generation when the simulated model is the one in use:
     * `tag` says what is asked, such as a business operation, which a call over the gateway cannot carry.
     */
    complete(input: {
        readonly system?: string;
        readonly prompt: string;
        readonly tag?: string;
    }): Promise<string>;
}
/** Rough token counts for the usage the gateway records: about four characters a token. */
export declare const tokens: (value: string) => number;
/** Splits a text into a few pieces, so a streamed answer arrives the way a model's does. */
export declare function chunksOf(value: string): string[];
//# sourceMappingURL=models.d.ts.map