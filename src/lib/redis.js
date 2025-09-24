import { Redis } from "@upstash/redis";

export const redis = Redis.fromEnv();

export const JOB_QUEUE = "jobs:bmp2tiff";
export const JOB_DONE = "jobs:done_count";
export const JOB_TOTAL = "jobs:total_count";
