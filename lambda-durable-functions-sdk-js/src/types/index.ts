import { Context } from "aws-lambda";
import { TerminationManager } from "../termination-manager/termination-manager";
import { ExecutionState } from "../storage/storage-provider";
import { Serdes } from "../utils/serdes/serdes";

import { Operation } from "@amzn/dex-internal-sdk";

// Import types for concurrent execution
import type {
  ConcurrentExecutionItem,
  ConcurrentExecutor,
  ConcurrencyConfig,
} from "../handlers/concurrent-execution-handler/concurrent-execution-handler";

export interface LambdaHandler<T> {
  (event: T, context: Context): Promise<DurableExecutionInvocationOutput>;
}

// TODO - prefer to import this entire input model from the SDK,
// but it's not part of the frontend model so it doesn't get generated.
export interface DurableExecutionInvocationInput {
  DurableExecutionArn: string;
  CheckpointToken: string;
  InitialExecutionState: {
    Operations: Operation[];
    NextMarker: string;
  };
  LoggingMode?: string;

  /**
   * This is temporary to allow us to dynamically create our DEX client per-invocation.
   * The backend doesn't set these fields, only local runner does. Without them, we default to environment variables.
   */
  DexEndpoint?: string;
  DexRegion?: string;
}

export enum InvocationStatus {
  SUCCEEDED = "SUCCEEDED",
  FAILED = "FAILED",
  PENDING = "PENDING",
}

export enum OperationSubType {
  STEP = "Step",
  WAIT = "Wait",
  CALLBACK = "Callback",
  RUN_IN_CHILD_CONTEXT = "RunInChildContext",
  MAP = "Map",
  MAP_ITERATION = "MapIteration",
  PARALLEL = "Parallel",
  PARALLEL_BRANCH = "ParallelBranch",
  WAIT_FOR_CALLBACK = "WaitForCallback",
  WAIT_FOR_CONDITION = "WaitForCondition",
}

export interface DurableExecutionInvocationOutput {
  Status: InvocationStatus;
  Result: string;
}

export interface DurableContext extends Context {
  _stepPrefix?: string;
  _stepCounter: number;
  step: <T>(
    nameOrFn: string | undefined | StepFunc<T>,
    fnOrOptions?: StepFunc<T> | StepConfig<T>,
    maybeOptions?: StepConfig<T>,
  ) => Promise<T>;
  runInChildContext: <T>(
    nameOrFn: string | undefined | ChildFunc<T>,
    fnOrOptions?: ChildFunc<T> | ChildConfig<T>,
    maybeOptions?: ChildConfig<T>,
  ) => Promise<T>;
  wait: (millis: number, name?: string | undefined) => Promise<void>;
  waitForCondition: <T>(
    nameOrCheck: string | undefined | WaitForConditionCheckFunc<T>,
    checkOrConfig?: WaitForConditionCheckFunc<T> | WaitForConditionConfig<T>,
    maybeConfig?: WaitForConditionConfig<T>,
  ) => Promise<T>;
  createCallback: <T>(
    nameOrConfig?: string | undefined | CreateCallbackConfig,
    maybeConfig?: CreateCallbackConfig,
  ) => Promise<CreateCallbackResult<T>>;
  waitForCallback: <T>(
    nameOrSubmitter?: string | undefined | WaitForCallbackSubmitterFunc,
    submitterOrConfig?: WaitForCallbackSubmitterFunc | WaitForCallbackConfig,
    maybeConfig?: WaitForCallbackConfig,
  ) => Promise<T>;
  map: <T>(
    nameOrItems: string | undefined | any[],
    itemsOrMapFunc?: any[] | MapFunc<T>,
    mapFuncOrConfig?: MapFunc<T> | MapConfig,
    maybeConfig?: MapConfig,
  ) => Promise<T[]>;
  parallel: <T>(
    nameOrBranches: string | undefined | ParallelFunc<T>[],
    branchesOrConfig?: ParallelFunc<T>[] | ParallelConfig,
    maybeConfig?: ParallelConfig,
  ) => Promise<T[]>;
  promise: {
    all: <T>(
      nameOrPromises: string | undefined | Promise<T>[],
      maybePromises?: Promise<T>[],
    ) => Promise<T[]>;
    allSettled: <T>(
      nameOrPromises: string | undefined | Promise<T>[],
      maybePromises?: Promise<T>[],
    ) => Promise<PromiseSettledResult<T>[]>;
    any: <T>(
      nameOrPromises: string | undefined | Promise<T>[],
      maybePromises?: Promise<T>[],
    ) => Promise<T>;
    race: <T>(
      nameOrPromises: string | undefined | Promise<T>[],
      maybePromises?: Promise<T>[],
    ) => Promise<T>;
  };
  executeConcurrently: <TItem, TResult>(
    nameOrItems: string | undefined | ConcurrentExecutionItem<TItem>[],
    itemsOrExecutor?:
      | ConcurrentExecutionItem<TItem>[]
      | ConcurrentExecutor<TItem, TResult>,
    executorOrConfig?: ConcurrentExecutor<TItem, TResult> | ConcurrencyConfig,
    maybeConfig?: ConcurrencyConfig,
  ) => Promise<TResult[]>;
}

export interface ExecutionContext {
  executionContextId: string;
  customerHandlerEvent: any;
  state: ExecutionState;
  _stepData: Record<string, Operation>; // Private, use getStepData() instead
  terminationManager: TerminationManager;
  isLocalMode: boolean;
  isVerbose: boolean;
  durableExecutionArn: string;
  parentId?: string;
  getStepData(stepId: string): Operation | undefined;
}

export type RetryDecision =
  | { shouldRetry: true; delaySeconds: number }
  | { shouldRetry: false };

export enum StepSemantics {
  AtMostOncePerRetry = "AT_MOST_ONCE_PER_RETRY",
  AtLeastOncePerRetry = "AT_LEAST_ONCE_PER_RETRY",
}

export interface StepConfig<T> {
  retryStrategy?: (error: Error, attemptCount: number) => RetryDecision;
  semantics?: StepSemantics;
  serdes?: Serdes<T>;
}

export interface ChildConfig<T = any> {
  serdes?: Serdes<T>;
  subType?: string;
}

export interface CreateCallbackConfig {
  timeout?: number; // seconds
  heartbeatTimeout?: number; // seconds
  serdes?: Serdes<any>;
}

export interface WaitForCallbackConfig {
  timeout?: number; // seconds
  heartbeatTimeout?: number; // seconds
  retryStrategy?: (error: Error, attemptCount: number) => RetryDecision;
  serdes?: Serdes<any>;
}

export type CreateCallbackResult<T> = [Promise<T>, string]; // [promise, callbackId]
export type WaitForCallbackSubmitterFunc = (
  callbackId: string,
) => Promise<void>;

export type StepFunc<T> = () => Promise<T>;
export type ChildFunc<T> = (context: DurableContext) => Promise<T>;
export type MapFunc<T> = (
  context: DurableContext,
  item: any,
  index: number,
  array: any[],
) => Promise<T>;
export type ParallelFunc<T> = (context: DurableContext) => Promise<T>;

// Wait for condition types
export type WaitForConditionCheckFunc<T> = (state: T) => Promise<T>;
export type WaitForConditionWaitStrategyFunc<T> = (
  state: T,
  attempt: number,
) => WaitForConditionDecision;

export type WaitForConditionDecision =
  | { shouldContinue: true; delaySeconds: number }
  | { shouldContinue: false };

export interface WaitForConditionConfig<T> {
  waitStrategy: WaitForConditionWaitStrategyFunc<T>;
  initialState: T;
  serdes?: Serdes<T>;
}

export interface MapConfig {
  maxConcurrency?: number;
  // Empty for now - will be extended later with batching, completion config, etc.
}

export interface ParallelConfig {
  maxConcurrency?: number;
  // Empty for now - will be extended later with completion config, etc.
}

// Re-export concurrent execution types for public API
export type {
  ConcurrentExecutionItem,
  ConcurrentExecutor,
  ConcurrencyConfig,
} from "../handlers/concurrent-execution-handler/concurrent-execution-handler";
