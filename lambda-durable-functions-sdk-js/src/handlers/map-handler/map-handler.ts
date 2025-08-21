import {
  ExecutionContext,
  DurableContext,
  MapFunc,
  MapConfig,
  ConcurrentExecutionItem,
  ConcurrentExecutor,
  OperationSubType,
} from "../../types";
import { log } from "../../utils/logger/logger";

export const createMapHandler = (
  context: ExecutionContext,
  executeConcurrently: DurableContext["executeConcurrently"],
) => {
  return async <T>(
    nameOrItems: string | undefined | any[],
    itemsOrMapFunc?: any[] | MapFunc<T>,
    mapFuncOrConfig?: MapFunc<T> | MapConfig,
    maybeConfig?: MapConfig,
  ): Promise<T[]> => {
    let name: string | undefined;
    let items: any[];
    let mapFunc: MapFunc<T>;
    let config: MapConfig | undefined;

    // Parse overloaded parameters
    if (typeof nameOrItems === "string" || nameOrItems === undefined) {
      // Case: map(name, items, mapFunc, config?)
      name = nameOrItems;
      items = itemsOrMapFunc as any[];
      mapFunc = mapFuncOrConfig as MapFunc<T>;
      config = maybeConfig;
    } else {
      // Case: map(items, mapFunc, config?)
      items = nameOrItems;
      mapFunc = itemsOrMapFunc as MapFunc<T>;
      config = mapFuncOrConfig as MapConfig;
    }

    log(context.isVerbose, "🗺️", "Starting map operation:", {
      name,
      itemCount: items.length,
      maxConcurrency: config?.maxConcurrency,
    });

    // Validate inputs
    if (!Array.isArray(items)) {
      throw new Error("Map operation requires an array of items");
    }

    if (typeof mapFunc !== "function") {
      throw new Error("Map operation requires a function to process items");
    }

    // Convert to concurrent execution items
    // TODO: Replace 'any' with proper generic types for better type safety
    // Currently using 'any' as temporary solution until we refactor type system
    const executionItems: ConcurrentExecutionItem<any>[] = items.map(
      (item, index) => ({
        id: `map-item-${index}`, // Temporary name for iteration, we will add a config to let developers name the iteration
        data: item,
        index,
      }),
    );

    // Create executor that calls mapFunc
    // TODO: Replace 'any' with proper generic types (ConcurrentExecutor<T, R>)
    // This will be addressed when we implement comprehensive type safety improvements
    const executor: ConcurrentExecutor<any, T> = async (
      executionItem,
      childContext,
    ) => mapFunc(childContext, executionItem.data, executionItem.index, items);

    // Delegate to the concurrent execution handler
    const results = await executeConcurrently(name, executionItems, executor, {
      maxConcurrency: config?.maxConcurrency,
      topLevelSubType: OperationSubType.MAP,
      iterationSubType: OperationSubType.MAP_ITERATION,
    });

    log(context.isVerbose, "🗺️", "Map operation completed successfully:", {
      resultCount: results.length,
    });

    return results;
  };
};
