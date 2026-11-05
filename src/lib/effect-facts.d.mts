export type ContextSource =
  | { kind: "input" | "group-input" | "output" | "group-output" | "cell-dep" | "header-dep" | "witness" | "current-script" | "transaction" | "header-evidence" }
  | { kind: "parameter"; index: number };
export type ContextAccess = "cell-data" | "capacity" | "occupied-capacity" | "lock-script" | "type-script" | "out-point" | "since" | "index" | "cardinality" | "role-selection" | "header" | "transaction" | "script" | "witness" | "environment-evidence";
export type LifecycleOperation = "consume" | "destroy" | "create" | "replace" | "transfer" | "claim" | "settle";
export type ProcessOperation = "spawn" | "exec" | "wait" | "pipe-create" | "pipe-read" | "pipe-write" | "close" | "inherited-descriptors" | "process-id";
export interface EffectFacts {
  context_reads: { source: ContextSource; access: ContextAccess }[];
  lifecycle_ops: LifecycleOperation[];
  process_ops: ProcessOperation[];
}
export interface EffectFactLabels {
  reads: string;
  lifecycle: string;
  process: string;
  empty: string;
}
export function readEffectFacts(value: unknown): EffectFacts;
export function actionEffectFacts(action: unknown): EffectFacts;
export function formatEffectFacts(value: EffectFacts, labels?: EffectFactLabels): string;
export function combineEffectFacts(values: Iterable<EffectFacts>): EffectFacts;
export const effectFactLabels: Readonly<EffectFactLabels>;
