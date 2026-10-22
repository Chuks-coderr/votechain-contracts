import express from "express";
import { createCorsMiddleware } from "./middleware/cors";
import { connectRedis } from "./middleware/redisCache";
import proposalRoutes from "./routes/proposals";

const app = express();
app.use(createCorsMiddleware());
app.use(express.json());
app.use("/api", proposalRoutes);

const PORT = process.env.PORT ?? 3001;

connectRedis().then(() => {
  app.listen(PORT, () => console.log(`[server] listening on :${PORT}`));
});

export default app;
