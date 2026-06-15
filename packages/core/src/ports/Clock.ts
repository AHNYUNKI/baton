export type Clock = {
  now(): Date;
};

export const systemClock: Clock = {
  now(): Date {
    return new Date();
  }
};

export function fixedClock(instant: string | Date): Clock {
  const date = typeof instant === "string" ? new Date(instant) : new Date(instant);

  return {
    now(): Date {
      return new Date(date);
    }
  };
}
