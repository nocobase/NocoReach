declare module 'virtual:nocoreach-startup-messages' {
  export const chinese: Record<string, string>;
  export const english: Record<string, string>;
  export const legacy: Record<string, string>;
}

declare module 'virtual:nocoreach-business-messages/*' {
  const catalog: {
    chinese: Record<string, string>;
    english: Record<string, string>;
    aliases: number[];
    legacy: Record<string, string>;
  };
  export default catalog;
}
