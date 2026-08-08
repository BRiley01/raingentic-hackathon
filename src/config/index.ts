// Central env loading and constants.
export const config = {
  port: Number(process.env.PORT ?? 3000),
  rain: {
    baseUrl: process.env.RAIN_BASE_URL ?? "",
    apiKey: process.env.RAIN_API_KEY ?? "",
  },
  monad: {
    baseUrl: process.env.MONAD_BASE_URL ?? "",
    apiKey: process.env.MONAD_API_KEY ?? "",
  },
};
