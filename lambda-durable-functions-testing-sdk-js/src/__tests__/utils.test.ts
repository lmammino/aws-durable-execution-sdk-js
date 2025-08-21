import { convertDatesToTimestamps } from "../utils";

describe("convertDatesToTimestamps", () => {
  it("should return null when input is null", () => {
    expect(convertDatesToTimestamps(null)).toBeNull();
  });

  it("should return undefined when input is undefined", () => {
    // eslint-disable-next-line @typescript-eslint/no-confusing-void-expression
    expect(convertDatesToTimestamps(undefined)).toBeUndefined();
  });

  it("should convert Date objects to timestamps", () => {
    const date = new Date("2023-01-01T12:00:00Z");
    const input = { date };
    const expected = { date: Math.floor(date.getTime() / 1000) };

    expect(convertDatesToTimestamps(input)).toEqual(expected);
  });

  it("should handle nested objects with dates", () => {
    const date = new Date("2023-01-01T12:00:00Z");
    const nestedDate = new Date("2023-02-01T12:00:00.000Z");
    const timestamp1 = Math.floor(date.getTime() / 1000);
    const timestamp2 = Math.floor(nestedDate.getTime() / 1000);

    const input = {
      outer: {
        date1: date,
        inner: {
          date2: nestedDate,
        },
      },
    };

    const expected = {
      outer: {
        date1: timestamp1,
        inner: {
          date2: timestamp2,
        },
      },
    };

    expect(convertDatesToTimestamps(input)).toEqual(expected);
  });

  it("should handle arrays with dates", () => {
    const date1 = new Date("2023-01-01T12:00:00Z");
    const date2 = new Date("2023-02-01T12:00:00Z");
    const timestamp1 = Math.floor(date1.getTime() / 1000);
    const timestamp2 = Math.floor(date2.getTime() / 1000);

    const input = [{ date: date1 }, { date: date2 }];
    const expected = [{ date: timestamp1 }, { date: timestamp2 }];

    expect(convertDatesToTimestamps(input)).toEqual(expected);
  });
});
