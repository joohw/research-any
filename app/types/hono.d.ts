// Hono ContextVariableMap 扩展

export {};

declare module "hono" {
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type
  interface ContextVariableMap {
    // 无用户态 context
  }
}
