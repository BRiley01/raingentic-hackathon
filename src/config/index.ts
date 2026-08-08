// Central env loading and constants.
export const config = {
  port: Number(process.env.PORT ?? 3000),
  rain: {
    mode: (process.env.RAIN_MODE ?? "mock").toLowerCase() as "mock" | "live",
    baseUrl: process.env.RAIN_BASE_URL ?? "https://api-dev.raincards.xyz/v1",
    apiKey: process.env.RAIN_API_KEY ?? "",
    teamId: process.env.RAIN_TEAM_ID ?? "",
    userId: process.env.RAIN_USER_ID ?? "",
    contractId: process.env.RAIN_CONTRACT_ID ?? "",
    sessionId: process.env.RAIN_SESSION_ID ?? "",
  },
};
