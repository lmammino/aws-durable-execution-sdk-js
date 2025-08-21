import { DurableContext, RetryDecision } from "../../types";

// No-retry strategy for promise combinators
// Promise combinators should not be retried
const stepConfig = {
  retryStrategy: (): RetryDecision => ({
    shouldRetry: false,
  }),
};

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
export const createPromiseHandler = (step: DurableContext["step"]) => {
  const parseParams = <T>(
    nameOrPromises: string | undefined | Promise<T>[],
    maybePromises?: Promise<T>[],
  ): { name: string | undefined; promises: Promise<T>[] } => {
    if (typeof nameOrPromises === "string" || nameOrPromises === undefined) {
      return { name: nameOrPromises, promises: maybePromises! };
    }
    return { name: undefined, promises: nameOrPromises };
  };

  const all = <T>(
    nameOrPromises: string | undefined | Promise<T>[],
    maybePromises?: Promise<T>[],
  ): Promise<T[]> => {
    const { name, promises } = parseParams(nameOrPromises, maybePromises);
    return step(name, () => Promise.all(promises), stepConfig);
  };

  const allSettled = <T>(
    nameOrPromises: string | undefined | Promise<T>[],
    maybePromises?: Promise<T>[],
  ): Promise<PromiseSettledResult<T>[]> => {
    const { name, promises } = parseParams(nameOrPromises, maybePromises);
    return step(name, () => Promise.allSettled(promises), stepConfig);
  };

  const any = <T>(
    nameOrPromises: string | undefined | Promise<T>[],
    maybePromises?: Promise<T>[],
  ): Promise<T> => {
    const { name, promises } = parseParams(nameOrPromises, maybePromises);
    return step(name, () => Promise.any(promises), stepConfig);
  };

  const race = <T>(
    nameOrPromises: string | undefined | Promise<T>[],
    maybePromises?: Promise<T>[],
  ): Promise<T> => {
    const { name, promises } = parseParams(nameOrPromises, maybePromises);
    return step(name, () => Promise.race(promises), stepConfig);
  };

  return {
    all,
    allSettled,
    any,
    race,
  };
};
