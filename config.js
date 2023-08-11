import dotenv from "dotenv";

dotenv.config();

const config = {
  PORT: 5000,
  MONGO_URL: process.env.MONGO_URL,
  API_KEY_JWT: process.env.API_KEY_JWT,
  TOKEN_EXPIRES_IN: process.env.TOKEN_EXPIRES_IN,
};

export default config;
