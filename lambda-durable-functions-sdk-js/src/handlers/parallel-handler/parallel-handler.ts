import {
  ExecutionContext,
  DurableContext,
  ParallelFunc,
  ParallelConfig,
  ConcurrentExecutionItem,
  ConcurrentExecutor,
  OperationSubType,
} from "../../types";
import { log } from "../../utils/logger/logger";

export const createParallelHandler = (
  context: ExecutionContext,
  executeConcurrently: DurableContext["executeConcurrently"],
) => {
  return async <T>(
    nameOrBranches: string | undefined | ParallelFunc<T>[],
    branchesOrConfig?: ParallelFunc<T>[] | ParallelConfig,
    maybeConfig?: ParallelConfig,
  ): Promise<T[]> => {
    let name: string | undefined;
    let branches: ParallelFunc<T>[];
    let config: ParallelConfig | undefined;

    // Parse overloaded parameters
    if (typeof nameOrBranches === "string" || nameOrBranches === undefined) {
      // Case: parallel(name, branches, config?)
      name = nameOrBranches;
      branches = branchesOrConfig as ParallelFunc<T>[];
      config = maybeConfig;
    } else {
      // Case: parallel(branches, config?)
      branches = nameOrBranches;
      config = branchesOrConfig as ParallelConfig;
    }

    // Validate inputs
    if (!Array.isArray(branches)) {
      throw new Error(
        "Parallel operation requires an array of branch functions",
      );
    }

    log(context.isVerbose, "🔀", "Starting parallel operation:", {
      name,
      branchCount: branches.length,
      maxConcurrency: config?.maxConcurrency,
    });

    if (branches.some((branch) => typeof branch !== "function")) {
      throw new Error("All branches must be functions");
    }

    // Convert to concurrent execution items
    const executionItems: ConcurrentExecutionItem<ParallelFunc<T>>[] =
      branches.map((branch, index) => ({
        id: `parallel-branch-${index}`,
        data: branch,
        index,
      }));

    // Create executor that calls the branch function
    const executor: ConcurrentExecutor<ParallelFunc<T>, T> = async (
      executionItem,
      childContext,
    ) => {
      log(context.isVerbose, "🔀", "Processing parallel branch:", {
        index: executionItem.index,
      });

      try {
        const result = await executionItem.data(childContext);

        log(context.isVerbose, "✅", "Parallel branch completed:", {
          index: executionItem.index,
          result,
        });

        return result;
      } catch (error) {
        // TODO: Implement proper error handling pattern
        // Current error handling is temporary until we implement comprehensive error handling for ctx.parallel
        log(context.isVerbose, "❌", "Parallel branch failed:", {
          index: executionItem.index,
          error,
        });

        // For now any failure will fail the entire Parallel
        // TODO: This is temporary approach before we add ParallelConfig
        throw error;
      }
    };

    // Delegate to the concurrent execution handler
    const results = await executeConcurrently(name, executionItems, executor, {
      maxConcurrency: config?.maxConcurrency,
      topLevelSubType: OperationSubType.PARALLEL,
      iterationSubType: OperationSubType.PARALLEL_BRANCH,
    });

    log(context.isVerbose, "🔀", "Parallel operation completed successfully:", {
      resultCount: results.length,
    });

    return results;
  };
};
