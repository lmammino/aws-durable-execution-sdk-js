import { createPromiseHandler } from "./promise-handler";

describe("Promise Handler", () => {
  let mockStep: jest.Mock;
  let promiseHandler: ReturnType<typeof createPromiseHandler>;

  beforeEach(() => {
    mockStep = jest.fn();
    promiseHandler = createPromiseHandler(mockStep);
  });

  describe("retry behavior", () => {
    it("should configure steps with no-retry strategy", async () => {
      const promises = [Promise.resolve(1), Promise.resolve(2)];
      mockStep.mockResolvedValue([1, 2]);

      await promiseHandler.all(promises);

      expect(mockStep).toHaveBeenCalledWith(
        undefined,
        expect.any(Function),
        expect.objectContaining({
          retryStrategy: expect.any(Function),
        }),
      );

      // Verify the retry strategy returns shouldRetry: false
      const stepConfig = mockStep.mock.calls[0][2];
      const retryDecision = stepConfig.retryStrategy(new Error("test"), 1);
      expect(retryDecision).toEqual({ shouldRetry: false });
    });

    it("should accept undefined as name parameter", async () => {
      const promises = [Promise.resolve(1)];
      mockStep.mockResolvedValue([1]);

      await promiseHandler.all(undefined, promises);

      expect(mockStep).toHaveBeenCalledWith(
        undefined,
        expect.any(Function),
        expect.objectContaining({
          retryStrategy: expect.any(Function),
        }),
      );
    });

    it("should configure named steps with no-retry strategy", async () => {
      const promises = [Promise.resolve(1), Promise.resolve(2)];
      mockStep.mockResolvedValue([1, 2]);

      await promiseHandler.all("test-all", promises);

      expect(mockStep).toHaveBeenCalledWith(
        "test-all",
        expect.any(Function),
        expect.objectContaining({
          retryStrategy: expect.any(Function),
        }),
      );

      // Verify the retry strategy returns shouldRetry: false
      const stepConfig = mockStep.mock.calls[0][2];
      const retryDecision = stepConfig.retryStrategy(new Error("test"), 1);
      expect(retryDecision).toEqual({ shouldRetry: false });
    });
  });

  describe("all", () => {
    it("should call step with Promise.all when no name provided", async () => {
      const promises = [Promise.resolve(1), Promise.resolve(2)];
      mockStep.mockImplementation(async (name, fn) => await fn());

      const result = await promiseHandler.all(promises);

      expect(mockStep).toHaveBeenCalledWith(
        undefined,
        expect.any(Function),
        expect.objectContaining({
          retryStrategy: expect.any(Function),
        }),
      );
      expect(result).toEqual([1, 2]);
    });

    it("should call step with name when name provided", async () => {
      const promises = [Promise.resolve(1), Promise.resolve(2)];
      mockStep.mockImplementation(async (name, fn) => await fn());

      const result = await promiseHandler.all("test-all", promises);

      expect(mockStep).toHaveBeenCalledWith(
        "test-all",
        expect.any(Function),
        expect.any(Object),
      );
      expect(result).toEqual([1, 2]);
    });

    it("should handle rejections correctly (fail fast)", async () => {
      const promises = [
        Promise.resolve(1),
        Promise.reject(new Error("test error")),
      ];
      mockStep.mockImplementation(async (_, fn) => await fn());

      await expect(promiseHandler.all(promises)).rejects.toThrow("test error");
    });
  });

  describe("allSettled", () => {
    it("should call step with Promise.allSettled when no name provided", async () => {
      const promises = [Promise.resolve(1), Promise.resolve(2)];
      const expectedResult = [
        { status: "fulfilled", value: 1 },
        { status: "fulfilled", value: 2 },
      ];
      mockStep.mockResolvedValue(expectedResult);

      await promiseHandler.allSettled(promises);

      expect(mockStep).toHaveBeenCalledWith(
        undefined,
        expect.any(Function),
        expect.objectContaining({
          retryStrategy: expect.any(Function),
        }),
      );
    });

    it("should call step with name when name provided", async () => {
      const promises = [Promise.resolve(1), Promise.resolve(2)];
      mockStep.mockImplementation(async (name, fn) => await fn());

      const result = await promiseHandler.allSettled(
        "test-allSettled",
        promises,
      );

      expect(mockStep).toHaveBeenCalledWith(
        "test-allSettled",
        expect.any(Function),
        expect.any(Object),
      );
      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({ status: "fulfilled", value: 1 });
      expect(result[1]).toEqual({ status: "fulfilled", value: 2 });
    });

    it("should handle rejections without throwing", async () => {
      const promises = [
        Promise.resolve(1),
        Promise.reject(new Error("test error")),
      ];
      mockStep.mockImplementation(async (name, fn) => await fn());

      const result = await promiseHandler.allSettled(promises);

      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({ status: "fulfilled", value: 1 });
      expect(result[1]).toEqual({
        status: "rejected",
        reason: expect.any(Error),
      });
    });
  });

  describe("any", () => {
    it("should call step with Promise.any when no name provided", async () => {
      const promises = [Promise.resolve(1), Promise.resolve(2)];
      mockStep.mockImplementation(async (name, fn) => await fn());

      const result = await promiseHandler.any(promises);

      expect(mockStep).toHaveBeenCalledWith(
        undefined,
        expect.any(Function),
        expect.objectContaining({
          retryStrategy: expect.any(Function),
        }),
      );
      expect(result).toBe(1); // Promise.any returns the first resolved value
    });

    it("should call step with name when name provided", async () => {
      const promises = [Promise.resolve(1), Promise.resolve(2)];
      mockStep.mockImplementation(async (name, fn) => await fn());

      const result = await promiseHandler.any("test-any", promises);

      expect(mockStep).toHaveBeenCalledWith(
        "test-any",
        expect.any(Function),
        expect.any(Object),
      );
      expect(result).toBe(1); // Promise.any returns the first resolved value
    });

    it("should throw AggregateError when all promises reject", async () => {
      const promises = [
        Promise.reject(new Error("error1")),
        Promise.reject(new Error("error2")),
      ];
      mockStep.mockImplementation(async (name, fn) => await fn());

      await expect(promiseHandler.any(promises)).rejects.toThrow(
        "All promises were rejected",
      );
    });

    it("should return first fulfilled value when some promises succeed", async () => {
      const promises = [
        Promise.reject(new Error("error")),
        Promise.resolve("success"),
      ];
      mockStep.mockImplementation(async (name, fn) => await fn());

      const result = await promiseHandler.any(promises);
      expect(result).toBe("success");
    });
  });

  describe("race", () => {
    it("should call step with Promise.race when no name provided", async () => {
      const promises = [Promise.resolve(1), Promise.resolve(2)];
      mockStep.mockImplementation(async (name, fn) => await fn());

      const result = await promiseHandler.race(promises);

      expect(mockStep).toHaveBeenCalledWith(
        undefined,
        expect.any(Function),
        expect.objectContaining({
          retryStrategy: expect.any(Function),
        }),
      );
      expect(result).toBe(1); // Promise.race returns the first resolved value
    });

    it("should call step with name when name provided", async () => {
      const promises = [Promise.resolve(1), Promise.resolve(2)];
      mockStep.mockImplementation(async (name, fn) => await fn());

      const result = await promiseHandler.race("test-race", promises);

      expect(mockStep).toHaveBeenCalledWith(
        "test-race",
        expect.any(Function),
        expect.any(Object),
      );
      expect(result).toBe(1); // Promise.race returns the first resolved value
    });

    it("should throw error when fastest promise rejects", async () => {
      const promises = [
        Promise.reject(new Error("fast error")),
        new Promise((resolve) =>
          setTimeout(() => resolve("slow success"), 100),
        ),
      ];
      mockStep.mockImplementation(async (name, fn) => await fn());

      await expect(promiseHandler.race(promises)).rejects.toThrow("fast error");
    });

    it("should return value when fastest promise resolves", async () => {
      const promises = [
        Promise.resolve("fast success"),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error("slow error")), 100),
        ),
      ];
      mockStep.mockImplementation(async (name, fn) => await fn());

      const result = await promiseHandler.race(promises);
      expect(result).toBe("fast success");
    });
  });
});
