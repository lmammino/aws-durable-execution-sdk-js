import { ExecutionContext, DurableContext } from "../../types";
import { log } from "../../utils/logger/logger";

/**
 * Represents an item to be executed with metadata for deterministic replay
 */
export interface ConcurrentExecutionItem<T> {
  id: string; // Optional identifier for logging/observability
  data: T; // The actual data to process
  index: number; // Position in original array for result ordering
}

/**
 * Configuration for concurrency control
 */
export interface ConcurrencyConfig {
  maxConcurrency?: number;
  topLevelSubType?: string;
  iterationSubType?: string;
  // Future: completionConfig for advanced scenarios
  completionConfig?: {
    minSuccessful?: number;
    toleratedFailureCount?: number;
    toleratedFailurePercentage?: number;
  };
}

/**
 * Executor function type for concurrent execution
 */
export type ConcurrentExecutor<TItem, TResult> = (
  item: ConcurrentExecutionItem<TItem>,
  childContext: DurableContext,
) => Promise<TResult>;

/**
 * Result of an execution item, either success or failure
 */
interface ExecutionResult<R> {
  index: number;
  result?: R;
  error?: Error;
}

export class ConcurrencyController {
  constructor(
    private readonly isVerbose: boolean,
    private readonly operationName: string,
  ) {}

  /**
   * Execute items with controlled concurrency
   */
  async executeItems<T, R>(
    items: ConcurrentExecutionItem<T>[],
    executor: ConcurrentExecutor<T, R>,
    parentContext: DurableContext,
    config: ConcurrencyConfig,
  ): Promise<R[]> {
    const maxConcurrency = config.maxConcurrency || Infinity;

    log(
      this.isVerbose,
      "🚀",
      `Starting ${this.operationName} with concurrency control:`,
      {
        itemCount: items.length,
        maxConcurrency,
      },
    );

    // Initialize results array with correct length
    const results: R[] = new Array(items.length);
    const executionResults: ExecutionResult<R>[] = [];
    const executing = new Set<Promise<void>>();
    let currentIndex = 0;
    let hasErrors = false;

    const executeNext = async (): Promise<void> => {
      const index = currentIndex++;
      const item = items[index];

      log(this.isVerbose, "▶️", `Starting ${this.operationName} item:`, {
        index,
        itemId: item.id,
      });

      try {
        // Create child context for this item
        const result = await parentContext.runInChildContext(
          item.id,
          (childContext) => executor(item, childContext),
          { subType: config.iterationSubType },
        );

        executionResults.push({ index, result });

        log(this.isVerbose, "✅", `${this.operationName} item completed:`, {
          index,
          itemId: item.id,
        });
      } catch (error) {
        executionResults.push({
          index,
          error: error instanceof Error ? error : new Error(String(error)),
        });
        hasErrors = true;

        log(this.isVerbose, "❌", `${this.operationName} item failed:`, {
          index,
          itemId: item.id,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    };

    // Start initial batch up to maxConcurrency
    const initialBatchSize = Math.min(maxConcurrency, items.length);
    for (let i = 0; i < initialBatchSize; i++) {
      const promise = executeNext();
      executing.add(promise);
      promise.finally(() => executing.delete(promise));
    }

    // Continue until all items are processed
    while (executing.size > 0 || currentIndex < items.length) {
      if (executing.size < maxConcurrency && currentIndex < items.length) {
        // Start next item if we have capacity and items remaining
        const promise = executeNext();
        executing.add(promise);
        promise.finally(() => executing.delete(promise));
      } else {
        // Wait for at least one to complete
        await Promise.race(executing);
      }
    }

    // Process results in original order
    // TODO: Replace 'as any' with proper union type (Array<R | Error>) when implementing comprehensive error handling
    // Currently using 'as any' as temporary solution until error handling strategy is implemented
    for (const executionResult of executionResults) {
      if (executionResult.error) {
        results[executionResult.index] = executionResult.error as any; // Will be thrown later
      } else {
        results[executionResult.index] = executionResult.result!;
      }
    }

    // Check for errors and throw the first one
    // TODO: This is temporary error handling - will be replaced with completionConfig implementation
    // completionConfig will allow configuring: fail-fast, collect-all-errors, partial-success, etc.
    if (hasErrors) {
      for (let i = 0; i < results.length; i++) {
        if (results[i] instanceof Error) {
          log(
            this.isVerbose,
            "💥",
            `${this.operationName} failed due to error in item ${i}`,
          );
          throw results[i];
        }
      }
    }

    log(this.isVerbose, "🎉", `${this.operationName} completed successfully:`, {
      resultCount: results.length,
    });

    return results;
  }
}

/**
 * Create the concurrent execution handler
 */
export const createConcurrentExecutionHandler = (
  context: ExecutionContext,
  runInChildContext: DurableContext["runInChildContext"],
) => {
  return async <TItem, TResult>(
    nameOrItems: string | undefined | ConcurrentExecutionItem<TItem>[],
    itemsOrExecutor?:
      | ConcurrentExecutionItem<TItem>[]
      | ConcurrentExecutor<TItem, TResult>,
    executorOrConfig?: ConcurrentExecutor<TItem, TResult> | ConcurrencyConfig,
    maybeConfig?: ConcurrencyConfig,
  ): Promise<TResult[]> => {
    let name: string | undefined;
    let items: ConcurrentExecutionItem<TItem>[];
    let executor: ConcurrentExecutor<TItem, TResult>;
    let config: ConcurrencyConfig | undefined;

    // Parse overloaded parameters
    if (typeof nameOrItems === "string" || nameOrItems === undefined) {
      name = nameOrItems;
      items = itemsOrExecutor as ConcurrentExecutionItem<TItem>[];
      executor = executorOrConfig as ConcurrentExecutor<TItem, TResult>;
      config = maybeConfig;
    } else {
      items = nameOrItems;
      executor = itemsOrExecutor as ConcurrentExecutor<TItem, TResult>;
      config = executorOrConfig as ConcurrencyConfig;
    }

    log(context.isVerbose, "🔄", "Starting concurrent execution:", {
      name,
      itemCount: items.length,
      maxConcurrency: config?.maxConcurrency,
    });

    // Validate inputs
    if (!Array.isArray(items)) {
      throw new Error("Concurrent execution requires an array of items");
    }

    if (typeof executor !== "function") {
      throw new Error("Concurrent execution requires an executor function");
    }

    // Validate maxConcurrency
    if (
      config?.maxConcurrency !== undefined &&
      config.maxConcurrency !== null &&
      config.maxConcurrency <= 0
    ) {
      throw new Error(
        `Invalid maxConcurrency: ${config.maxConcurrency}. Must be a positive number or undefined for unlimited concurrency.`,
      );
    }

    const executeOperation = async (executionContext: DurableContext) => {
      const concurrencyController = new ConcurrencyController(
        context.isVerbose,
        "concurrent-execution",
      );

      return await concurrencyController.executeItems(
        items,
        executor,
        executionContext,
        config || {},
      );
    };

    return await runInChildContext(name, executeOperation, {
      subType: config?.topLevelSubType,
    });
  };
};
