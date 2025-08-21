import { ExecutionStateFactory } from "./storage-factory";
import { ApiStorage } from "./api-storage";
import { RecordDefinitionStorage } from "./record-definition-storage";

describe("ExecutionStateFactory", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    // Reset process.env before each test
    jest.resetModules();
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    // Restore original process.env after all tests
    process.env = originalEnv;
  });

  test("should create ApiStorage by default", () => {
    // Ensure the environment variables are not set
    delete process.env.DURABLE_RECORD_DEFINITION_MODE;

    // Create the execution state
    const executionState = ExecutionStateFactory.createExecutionState(
      "test-endpoint",
      "test-region",
    );

    // Verify that it's an instance of ApiStorage
    expect(executionState).toBeInstanceOf(ApiStorage);
  });

  test("should create RecordDefinitionStorage when DURABLE_RECORD_DEFINITION_MODE is true", () => {
    // Set the environment variable to true
    process.env.DURABLE_RECORD_DEFINITION_MODE = "true";

    // Create the execution state
    const executionState = ExecutionStateFactory.createExecutionState(
      "test-endpoint",
      "test-region",
    );

    // Verify that it's an instance of RecordDefinitionStorage
    expect(executionState).toBeInstanceOf(RecordDefinitionStorage);
  });

  test("should prioritize RecordDefinitionStorage over other options", () => {
    // Set both environment variables
    process.env.DURABLE_RECORD_DEFINITION_MODE = "true";

    // Create the execution state
    const executionState = ExecutionStateFactory.createExecutionState(
      "test-endpoint",
      "test-region",
    );

    // Verify that it's an instance of RecordDefinitionStorage
    expect(executionState).toBeInstanceOf(RecordDefinitionStorage);
  });
});
