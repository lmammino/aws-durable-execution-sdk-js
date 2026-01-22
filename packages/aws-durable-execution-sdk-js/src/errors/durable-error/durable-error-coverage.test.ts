import {
  DurableOperationError,
  StepError,
  CallbackError,
  CallbackTimeoutError,
  InvokeError,
} from "./durable-error";

describe("DurableOperationError Coverage Tests", () => {
  describe("fromErrorObject", () => {
    it("should handle unknown error type and default to StepError", () => {
      const errorObject = {
        ErrorType: "UnknownType" as any,
        ErrorMessage: "Unknown error occurred",
        ErrorData: "test-data",
        StackTrace: ["line1", "line2"],
      };

      const result = DurableOperationError.fromErrorObject(errorObject);

      expect(result).toBeInstanceOf(StepError);
      expect(result.message).toBe("Unknown error occurred");
      expect(result.errorData).toBe("test-data");
    });

    it("should reconstruct CallbackTimeoutError from error object", () => {
      const errorObject = {
        ErrorType: "CallbackTimeoutError",
        ErrorMessage: "Callback timed out",
        ErrorData: "timeout-data",
        StackTrace: ["line1", "line2"],
      };

      const result = DurableOperationError.fromErrorObject(errorObject);

      expect(result).toBeInstanceOf(CallbackTimeoutError);
      expect(result.message).toBe("Callback timed out");
      expect(result.errorData).toBe("timeout-data");
      expect(result.errorType).toBe("CallbackTimeoutError");
    });
  });

  describe("Error constructors with default messages", () => {
    it("should use default message for StepError when none provided", () => {
      const error = new StepError();
      expect(error.message).toBe("Step failed");
    });

    it("should use default message for CallbackError when none provided", () => {
      const error = new CallbackError();
      expect(error.message).toBe("Callback failed");
    });

    it("should use default message for CallbackTimeoutError when none provided", () => {
      const error = new CallbackTimeoutError();
      expect(error.message).toBe("Callback timed out");
      expect(error.errorType).toBe("CallbackTimeoutError");
    });

    it("should use default message for InvokeError when none provided", () => {
      const error = new InvokeError();
      expect(error.message).toBe("Invoke failed");
    });
  });

  describe("CallbackTimeoutError", () => {
    it("should be distinct from CallbackError", () => {
      const callbackError = new CallbackError("failed");
      const timeoutError = new CallbackTimeoutError("timed out");

      // These are NOT instanceof each other
      expect(callbackError).not.toBeInstanceOf(CallbackTimeoutError);
      expect(timeoutError).not.toBeInstanceOf(CallbackError);

      // Both are DurableOperationError
      expect(callbackError).toBeInstanceOf(DurableOperationError);
      expect(timeoutError).toBeInstanceOf(DurableOperationError);
    });

    it("should have correct error type for timeout error", () => {
      const error = new CallbackTimeoutError(
        "test timeout",
        new Error("cause"),
      );

      expect(error.errorType).toBe("CallbackTimeoutError");
      expect(error.name).toBe("CallbackTimeoutError");
      expect(error.message).toBe("test timeout");
      expect(error.cause).toBeInstanceOf(Error);
    });
  });
});
