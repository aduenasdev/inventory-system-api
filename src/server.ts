import { env } from "./config/env";
import app from "./app";

const PORT = env.PORT;

app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
  console.log(`📝 Environment: ${env.NODE_ENV}`);
  console.log(`🔒 CORS: ${env.ALLOWED_ORIGINS || "all origins (dev mode)"}`);
});
