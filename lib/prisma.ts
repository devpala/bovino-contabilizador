import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

declare global {
  var __bovinoPrisma: PrismaClient | undefined;
}

export function getPrisma() {
  if (!global.__bovinoPrisma) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error("DATABASE_URL no esta definida.");
    }
    const adapter = new PrismaPg({ connectionString });
    global.__bovinoPrisma = new PrismaClient({ adapter });
  }
  return global.__bovinoPrisma;
}
