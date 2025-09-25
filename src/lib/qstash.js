import { Client } from "@upstash/qstash";

const client = new Client({
  baseUrl: process.env.QSTASH_URL,
  token: process.env.QSTASH_TOKEN,
});

export const sendProcessQueue = async () => {
  return await client.publishJSON({
    url: process.env.QSTASH_PROCESS_URL + "/api/process",
    body: {},
  });
};
